import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { clearIndustryAliasCache } from '@/lib/mappings/industryResolver';

const createAliasSchema = z.object({
  alias: z.string().min(1, 'Alias is required'),
  canonical_industry: z.string().min(1, 'Industry is required'),
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
      .from('industry_aliases')
      .insert({
        alias: parsed.data.alias,
        canonical_industry: parsed.data.canonical_industry.toUpperCase(),
        match_type: parsed.data.match_type,
        case_sensitive: parsed.data.case_sensitive,
        priority: parsed.data.priority,
        client: parsed.data.client,
        notes: parsed.data.notes,
      })
      .select()
      .single();

    if (error) {
      console.error('[industry-aliases] Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to create industry alias', details: error.message },
        { status: 500 },
      );
    }

    // Clear cache so next parse uses new alias
    clearIndustryAliasCache();

    return NextResponse.json({
      success: true,
      alias: data,
    });
  } catch (error) {
    console.error('[industry-aliases] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Unexpected error creating industry alias' },
      { status: 500 },
    );
  }
}

type IndustryAliasData = {
  id: string;
  canonical_industry: string;
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
      .from('industry_aliases')
      .select('*')
      .order('priority', { ascending: false });

    if (error) {
      console.error('[industry-aliases] Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch industry aliases', details: error.message },
        { status: 500 },
      );
    }

    const typedData = data as IndustryAliasData[];

    // Also get distinct industries for the dropdown
    const industries = [...new Set(typedData.map((a) => a.canonical_industry))].sort();

    return NextResponse.json({
      aliases: typedData,
      industries,
    });
  } catch (error) {
    console.error('[industry-aliases] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Unexpected error fetching industry aliases' },
      { status: 500 },
    );
  }
}
