import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { clearIndustryAliasCache } from '@/lib/mappings/industryResolver';

export const runtime = 'nodejs';

/**
 * POST /api/database-health/backfill
 * Backfills amplifai_industry for existing rows based on industry_aliases table
 */
export async function POST() {
  // Clear cache to ensure we use latest aliases
  clearIndustryAliasCache();
  return await manualBackfill();
}

async function manualBackfill() {
  try {
    const supabase = getSupabaseAdminClient();

    // Get all industry aliases
    const { data: aliases, error: aliasError } = await supabase
      .from('industry_aliases')
      .select('canonical_industry, alias, match_type')
      .order('priority', { ascending: false });

    if (aliasError || !aliases) {
      return NextResponse.json(
        { error: 'Failed to load industry aliases' },
        { status: 500 },
      );
    }

    const results = {
      behavioral_coaching: 0,
      monthly_metrics: 0,
      activity_metrics: 0,
    };

    // Process each table
    for (const table of ['behavioral_coaching', 'monthly_metrics', 'activity_metrics'] as const) {
      // Get rows without industry
      const { data: rows } = await supabase
        .from(table)
        .select('id, organization')
        .is('amplifai_industry', null)
        .not('organization', 'is', null)
        .limit(1000); // Process in batches

      if (!rows) continue;

      // Match and update
      for (const row of rows) {
        const org = row.organization?.toLowerCase() ?? '';

        for (const alias of aliases) {
          let matched = false;
          const aliasLower = alias.alias.toLowerCase();

          if (alias.match_type === 'exact') {
            matched = org === aliasLower;
          } else if (alias.match_type === 'contains') {
            matched = org.includes(aliasLower);
          } else if (alias.match_type === 'regex') {
            try {
              matched = new RegExp(alias.alias, 'i').test(row.organization ?? '');
            } catch {
              // Invalid regex
            }
          }

          if (matched) {
            await supabase
              .from(table)
              .update({ amplifai_industry: alias.canonical_industry })
              .eq('id', row.id);
            results[table]++;
            break;
          }
        }
      }
    }

    const totalUpdated =
      results.behavioral_coaching + results.monthly_metrics + results.activity_metrics;

    return NextResponse.json({
      success: true,
      message: `Backfilled ${totalUpdated} rows`,
      results,
    });
  } catch (error) {
    console.error('[manual-backfill] Error:', error);
    return NextResponse.json(
      { error: 'Failed to backfill industry data' },
      { status: 500 },
    );
  }
}
