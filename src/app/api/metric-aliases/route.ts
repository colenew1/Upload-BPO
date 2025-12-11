import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { clearMetricAliasCache } from '@/lib/mappings/metricResolver';

const createAliasSchema = z.object({
  alias: z.string().min(1, 'Alias is required'),
  canonical_name: z.string().min(1, 'Canonical metric name is required'),
  match_type: z.enum(['exact', 'contains', 'regex']).default('contains'),
  case_sensitive: z.boolean().default(false),
  priority: z.number().default(100),
  client: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createAliasSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('metric_aliases')
      .insert({
        alias: parsed.data.alias,
        canonical_name: parsed.data.canonical_name.toUpperCase(),
        match_type: parsed.data.match_type,
        case_sensitive: parsed.data.case_sensitive,
        priority: parsed.data.priority,
        client: parsed.data.client,
        notes: parsed.data.notes,
      })
      .select()
      .single();

    if (error) {
      console.error('[metric-aliases] Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to create metric alias', details: error.message },
        { status: 500 },
      );
    }

    // Clear cache so next parse uses new alias
    clearMetricAliasCache();

    return NextResponse.json({
      success: true,
      alias: data,
    });
  } catch (error) {
    console.error('[metric-aliases] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Unexpected error creating metric alias' },
      { status: 500 },
    );
  }
}

type MetricAliasData = {
  id: string;
  canonical_name: string;
  alias: string;
  match_type: string;
  case_sensitive: boolean;
  priority: number;
  client: string | null;
  notes: string | null;
};

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('metric_aliases')
      .select('*')
      .order('priority', { ascending: false });

    if (error) {
      console.error('[metric-aliases] Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch metric aliases', details: error.message },
        { status: 500 },
      );
    }

    const typedData = data as MetricAliasData[];

    // Get distinct canonical names for the dropdown
    const canonicalNames = [...new Set(typedData.map((a) => a.canonical_name))].sort();

    return NextResponse.json({
      aliases: typedData,
      canonicalNames,
    });
  } catch (error) {
    console.error('[metric-aliases] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Unexpected error fetching metric aliases' },
      { status: 500 },
    );
  }
}
