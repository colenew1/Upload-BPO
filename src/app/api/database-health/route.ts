import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TableStats = {
  table: string;
  totalRows: number;
  lastUpdated: string | null;
  missingIndustry: number;
  missingOrg: number;
  missingMetric: number;
};

type UnmatchedOrg = {
  organization: string;
  amplifai_org: string | null;
  count: number;
  tables: string[];
};

type UnmatchedMetric = {
  metric_name: string;
  count: number;
  tables: string[];
};

type PotentialDuplicate = {
  organization: string;
  similarTo: string;
  similarity: number;
  count: number;
};

type DataQualityIssue = {
  type: 'missing_field' | 'outlier' | 'inconsistent' | 'stale_data';
  severity: 'low' | 'medium' | 'high';
  message: string;
  table: string;
  count: number;
  suggestion?: string;
};

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    // Get table statistics
    const [behaviorStats, monthlyStats, activityStats] = await Promise.all([
      getTableStats(supabase, 'behavioral_coaching'),
      getTableStats(supabase, 'monthly_metrics'),
      getTableStats(supabase, 'activity_metrics'),
    ]);

    // Get organizations without industry mapping
    const unmatchedOrgs = await getUnmatchedOrganizations(supabase);

    // Get metrics without standardized mapping
    const unmatchedMetrics = await getUnmatchedMetrics(supabase);

    // Get potential duplicate organizations (fuzzy matching)
    const potentialDuplicates = await getPotentialDuplicates(supabase);

    // Get data quality issues
    const qualityIssues = await getDataQualityIssues(supabase, [
      behaviorStats,
      monthlyStats,
      activityStats,
    ]);

    // Get alias counts
    const [industryAliasResult, metricAliasResult] = await Promise.all([
      supabase.from('industry_aliases').select('*', { count: 'exact', head: true }),
      supabase.from('metric_aliases').select('*', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalRows: behaviorStats.totalRows + monthlyStats.totalRows + activityStats.totalRows,
        tablesHealthy: qualityIssues.filter((i) => i.severity === 'high').length === 0,
        issueCount: qualityIssues.length,
        unmatchedOrgCount: unmatchedOrgs.length,
        unmatchedMetricCount: unmatchedMetrics.length,
        industryAliasCount: industryAliasResult.count ?? 0,
        metricAliasCount: metricAliasResult.count ?? 0,
      },
      tables: [behaviorStats, monthlyStats, activityStats],
      unmatchedOrgs,
      unmatchedMetrics,
      potentialDuplicates,
      qualityIssues,
    });
  } catch (error) {
    console.error('[database-health] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate health report' },
      { status: 500 },
    );
  }
}

async function getTableStats(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  table: 'behavioral_coaching' | 'monthly_metrics' | 'activity_metrics',
): Promise<TableStats> {
  const [countResult, latestResult, missingIndustryResult, missingOrgResult, missingMetricResult] =
    await Promise.all([
      supabase.from(table).select('*', { count: 'exact', head: true }),
      supabase.from(table).select('created_at').order('created_at', { ascending: false }).limit(1),
      supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .is('amplifai_industry', null),
      supabase.from(table).select('*', { count: 'exact', head: true }).is('amplifai_org', null),
      supabase.from(table).select('*', { count: 'exact', head: true }).is('amplifai_metric', null),
    ]);

  return {
    table,
    totalRows: countResult.count ?? 0,
    lastUpdated: latestResult.data?.[0]?.created_at ?? null,
    missingIndustry: missingIndustryResult.count ?? 0,
    missingOrg: missingOrgResult.count ?? 0,
    missingMetric: missingMetricResult.count ?? 0,
  };
}

async function getUnmatchedOrganizations(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
): Promise<UnmatchedOrg[]> {
  // Get orgs without industry from all tables
  const [behaviorOrgs, monthlyOrgs, activityOrgs] = await Promise.all([
    supabase
      .from('behavioral_coaching')
      .select('organization, amplifai_org')
      .is('amplifai_industry', null)
      .not('organization', 'is', null),
    supabase
      .from('monthly_metrics')
      .select('organization, amplifai_org')
      .is('amplifai_industry', null)
      .not('organization', 'is', null),
    supabase
      .from('activity_metrics')
      .select('organization, amplifai_org')
      .is('amplifai_industry', null)
      .not('organization', 'is', null),
  ]);

  // Aggregate counts
  const orgMap = new Map<string, { amplifai_org: string | null; count: number; tables: Set<string> }>();

  const processRows = (
    rows: { organization: string | null; amplifai_org: string | null }[] | null,
    tableName: string,
  ) => {
    if (!rows) return;
    for (const row of rows) {
      if (!row.organization) continue;
      const key = row.organization.toLowerCase();
      const existing = orgMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.tables.add(tableName);
      } else {
        orgMap.set(key, {
          amplifai_org: row.amplifai_org,
          count: 1,
          tables: new Set([tableName]),
        });
      }
    }
  };

  processRows(behaviorOrgs.data, 'behavioral_coaching');
  processRows(monthlyOrgs.data, 'monthly_metrics');
  processRows(activityOrgs.data, 'activity_metrics');

  return Array.from(orgMap.entries())
    .map(([org, data]) => ({
      organization: org,
      amplifai_org: data.amplifai_org,
      count: data.count,
      tables: Array.from(data.tables),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50); // Top 50
}

async function getUnmatchedMetrics(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
): Promise<UnmatchedMetric[]> {
  // Get metrics where amplifai_metric equals uppercased metric_name (meaning no real mapping)
  // We check behavioral_coaching.metric and monthly/activity_metrics.metric_name
  const [behaviorMetrics, monthlyMetrics, activityMetrics] = await Promise.all([
    supabase
      .from('behavioral_coaching')
      .select('metric, amplifai_metric')
      .not('metric', 'is', null),
    supabase
      .from('monthly_metrics')
      .select('metric_name, amplifai_metric')
      .not('metric_name', 'is', null),
    supabase
      .from('activity_metrics')
      .select('metric_name, amplifai_metric')
      .not('metric_name', 'is', null),
  ]);

  // Aggregate unmatched metrics
  const metricMap = new Map<string, { count: number; tables: Set<string> }>();

  const processMetrics = (
    rows: { metric?: string | null; metric_name?: string | null; amplifai_metric: string | null }[] | null,
    tableName: string,
  ) => {
    if (!rows) return;
    for (const row of rows) {
      const metricName = row.metric ?? row.metric_name;
      if (!metricName || !row.amplifai_metric) continue;

      // Check if it's unmatched (normalized is just uppercased original)
      const normalized = metricName.toUpperCase().replace(/\s+/g, ' ').trim();
      if (row.amplifai_metric !== normalized) continue; // It has a real mapping

      const key = metricName.toLowerCase();
      const existing = metricMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.tables.add(tableName);
      } else {
        metricMap.set(key, { count: 1, tables: new Set([tableName]) });
      }
    }
  };

  processMetrics(behaviorMetrics.data, 'behavioral_coaching');
  processMetrics(monthlyMetrics.data, 'monthly_metrics');
  processMetrics(activityMetrics.data, 'activity_metrics');

  return Array.from(metricMap.entries())
    .map(([metric, data]) => ({
      metric_name: metric,
      count: data.count,
      tables: Array.from(data.tables),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50); // Top 50
}

async function getPotentialDuplicates(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
): Promise<PotentialDuplicate[]> {
  // Get distinct organizations
  const { data: orgs } = await supabase
    .from('behavioral_coaching')
    .select('amplifai_org')
    .not('amplifai_org', 'is', null);

  if (!orgs) return [];

  const uniqueOrgs = [...new Set(orgs.map((o) => o.amplifai_org))].filter(Boolean) as string[];

  // Simple fuzzy matching - find orgs that are similar
  const duplicates: PotentialDuplicate[] = [];

  for (let i = 0; i < uniqueOrgs.length; i++) {
    for (let j = i + 1; j < uniqueOrgs.length; j++) {
      const similarity = calculateSimilarity(uniqueOrgs[i], uniqueOrgs[j]);
      if (similarity > 0.7 && similarity < 1) {
        duplicates.push({
          organization: uniqueOrgs[i],
          similarTo: uniqueOrgs[j],
          similarity: Math.round(similarity * 100),
          count: 0, // Would need another query to get actual counts
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity).slice(0, 20);
}

// Simple Levenshtein-based similarity
function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bLower = b.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (aLower === bLower) return 1;
  if (aLower.length === 0 || bLower.length === 0) return 0;

  // Check if one contains the other
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return 0.85;
  }

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= aLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      if (bLower[i - 1] === aLower[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  const distance = matrix[bLower.length][aLower.length];
  const maxLength = Math.max(aLower.length, bLower.length);
  return 1 - distance / maxLength;
}

async function getDataQualityIssues(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  tableStats: TableStats[],
): Promise<DataQualityIssue[]> {
  const issues: DataQualityIssue[] = [];

  for (const stats of tableStats) {
    // High missing industry rate
    if (stats.totalRows > 0) {
      const missingRate = stats.missingIndustry / stats.totalRows;
      if (missingRate > 0.5) {
        issues.push({
          type: 'missing_field',
          severity: 'high',
          message: `${Math.round(missingRate * 100)}% of rows missing industry classification`,
          table: stats.table,
          count: stats.missingIndustry,
          suggestion: 'Add industry aliases for unmatched organizations',
        });
      } else if (missingRate > 0.2) {
        issues.push({
          type: 'missing_field',
          severity: 'medium',
          message: `${Math.round(missingRate * 100)}% of rows missing industry classification`,
          table: stats.table,
          count: stats.missingIndustry,
          suggestion: 'Review unmatched organizations and add aliases',
        });
      }
    }

    // Missing amplifai_org
    if (stats.missingOrg > 0) {
      issues.push({
        type: 'missing_field',
        severity: stats.missingOrg > 100 ? 'medium' : 'low',
        message: `${stats.missingOrg} rows missing normalized organization`,
        table: stats.table,
        count: stats.missingOrg,
      });
    }

    // Stale data check
    if (stats.lastUpdated) {
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(stats.lastUpdated).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceUpdate > 30) {
        issues.push({
          type: 'stale_data',
          severity: 'low',
          message: `No new data in ${daysSinceUpdate} days`,
          table: stats.table,
          count: 0,
          suggestion: 'Check if uploads are being processed correctly',
        });
      }
    }
  }

  return issues.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}
