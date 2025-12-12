import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// POST - Resolve a wonky number by setting the source field to null
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload.' },
      { status: 400 },
    );
  }

  const { source_table, source_id, field_name } = body as {
    source_table?: string;
    source_id?: string;
    field_name?: string;
  };

  if (!source_table || !source_id || !field_name) {
    return NextResponse.json(
      { error: 'Missing required fields: source_table, source_id, field_name' },
      { status: 400 },
    );
  }

  // Validate source_table
  const validTables = ['behavioral_coaching', 'monthly_metrics', 'activity_metrics'] as const;
  if (!validTables.includes(source_table as typeof validTables[number])) {
    return NextResponse.json(
      { error: 'Invalid source_table' },
      { status: 400 },
    );
  }

  // Validate field_name based on table
  const validFields: Record<string, string[]> = {
    behavioral_coaching: ['coaching_count', 'effectiveness_pct'],
    monthly_metrics: ['actual', 'goal', 'ptg'],
    activity_metrics: ['actual', 'goal', 'ptg'],
  };

  if (!validFields[source_table]?.includes(field_name)) {
    return NextResponse.json(
      { error: `Invalid field_name "${field_name}" for table "${source_table}"` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  // Set the field to null in the source table
  // Use separate calls per table to satisfy TypeScript
  let updateError: Error | null = null;

  if (source_table === 'behavioral_coaching') {
    const { error } = await supabase
      .from('behavioral_coaching')
      .update({ [field_name]: null } as { coaching_count: null } | { effectiveness_pct: null })
      .eq('id', source_id);
    updateError = error;
  } else if (source_table === 'monthly_metrics') {
    const { error } = await supabase
      .from('monthly_metrics')
      .update({ [field_name]: null } as { actual: null } | { goal: null } | { ptg: null })
      .eq('id', source_id);
    updateError = error;
  } else if (source_table === 'activity_metrics') {
    const { error } = await supabase
      .from('activity_metrics')
      .update({ [field_name]: null } as { actual: null } | { goal: null } | { ptg: null })
      .eq('id', source_id);
    updateError = error;
  }

  if (updateError) {
    console.error('[wonky-numbers] Failed to update source:', updateError);
    return NextResponse.json(
      { error: 'Failed to update source record' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `Set ${field_name} to null in ${source_table}`,
    source_table,
    source_id,
    field_name,
  });
}
