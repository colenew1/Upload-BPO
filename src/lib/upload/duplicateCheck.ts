import { getSupabaseAdminClient } from '@/lib/supabase/server';
import type { ParsedBehaviorRow, ParsedMetricRow } from '@/lib/excel/types';

type DuplicateCheckResult<T> = {
  unique: T[];
  duplicates: T[];
  duplicateCount: number;
};

/**
 * Check for existing behavioral coaching rows in Supabase.
 * Key: (client, organization, program, metric, behavior, sub_behavior, month, year)
 */
export async function filterDuplicateBehaviors(
  rows: ParsedBehaviorRow[],
  client: string
): Promise<DuplicateCheckResult<ParsedBehaviorRow>> {
  if (rows.length === 0) {
    return { unique: [], duplicates: [], duplicateCount: 0 };
  }

  const supabase = getSupabaseAdminClient();

  // Get unique month/year combinations to query
  const months = [...new Set(rows.map((r) => r.month))];
  const years = [...new Set(rows.map((r) => r.year))];

  // Query existing rows for this client + month/year range
  const { data: existing, error } = await supabase
    .from('behavioral_coaching')
    .select('organization, program, metric, behavior, sub_behavior, month, year')
    .eq('client', client)
    .in('month', months)
    .in('year', years);

  if (error) {
    console.error('Error checking for duplicate behaviors:', error);
    // On error, return all rows as unique (fail open)
    return { unique: rows, duplicates: [], duplicateCount: 0 };
  }

  // Build a Set of existing keys for fast lookup
  const existingKeys = new Set(
    (existing ?? []).map((row) =>
      buildBehaviorKey(
        row.organization ?? '',
        row.program ?? '',
        row.metric ?? '',
        row.behavior ?? '',
        row.sub_behavior ?? '',
        row.month ?? '',
        row.year ?? 0
      )
    )
  );

  const unique: ParsedBehaviorRow[] = [];
  const duplicates: ParsedBehaviorRow[] = [];

  for (const row of rows) {
    const key = buildBehaviorKey(
      row.organization ?? '',
      row.program ?? '',
      row.metric ?? '',
      row.behavior ?? '',
      row.subBehavior ?? '',
      row.month,
      row.year
    );

    if (existingKeys.has(key)) {
      duplicates.push(row);
    } else {
      unique.push(row);
    }
  }

  return { unique, duplicates, duplicateCount: duplicates.length };
}

/**
 * Check for existing monthly metrics rows in Supabase.
 * Key: (client, organization, program, metric_name, month, year)
 */
export async function filterDuplicateMonthlyMetrics(
  rows: ParsedMetricRow[],
  client: string
): Promise<DuplicateCheckResult<ParsedMetricRow>> {
  if (rows.length === 0) {
    return { unique: [], duplicates: [], duplicateCount: 0 };
  }

  const supabase = getSupabaseAdminClient();

  const months = [...new Set(rows.map((r) => r.month))];
  const years = [...new Set(rows.map((r) => r.year))];

  const { data: existing, error } = await supabase
    .from('monthly_metrics')
    .select('organization, program, metric_name, month, year')
    .eq('client', client)
    .in('month', months)
    .in('year', years);

  if (error) {
    console.error('Error checking for duplicate monthly metrics:', error);
    return { unique: rows, duplicates: [], duplicateCount: 0 };
  }

  const existingKeys = new Set(
    (existing ?? []).map((row) =>
      buildMetricKey(
        row.organization ?? '',
        row.program ?? '',
        row.metric_name ?? '',
        row.month ?? '',
        row.year ?? 0
      )
    )
  );

  const unique: ParsedMetricRow[] = [];
  const duplicates: ParsedMetricRow[] = [];

  for (const row of rows) {
    const key = buildMetricKey(
      row.organization ?? '',
      row.program ?? '',
      row.metricName ?? '',
      row.month,
      row.year
    );

    if (existingKeys.has(key)) {
      duplicates.push(row);
    } else {
      unique.push(row);
    }
  }

  return { unique, duplicates, duplicateCount: duplicates.length };
}

/**
 * Check for existing activity metrics rows in Supabase.
 * Key: (client, organization, program, metric_name, month, year)
 */
export async function filterDuplicateActivityMetrics(
  rows: ParsedMetricRow[],
  client: string
): Promise<DuplicateCheckResult<ParsedMetricRow>> {
  if (rows.length === 0) {
    return { unique: [], duplicates: [], duplicateCount: 0 };
  }

  const supabase = getSupabaseAdminClient();

  const months = [...new Set(rows.map((r) => r.month))];
  const years = [...new Set(rows.map((r) => r.year))];

  const { data: existing, error } = await supabase
    .from('activity_metrics')
    .select('organization, program, metric_name, month, year')
    .eq('client', client)
    .in('month', months)
    .in('year', years);

  if (error) {
    console.error('Error checking for duplicate activity metrics:', error);
    return { unique: rows, duplicates: [], duplicateCount: 0 };
  }

  const existingKeys = new Set(
    (existing ?? []).map((row) =>
      buildMetricKey(
        row.organization ?? '',
        row.program ?? '',
        row.metric_name ?? '',
        row.month ?? '',
        row.year ?? 0
      )
    )
  );

  const unique: ParsedMetricRow[] = [];
  const duplicates: ParsedMetricRow[] = [];

  for (const row of rows) {
    const key = buildMetricKey(
      row.organization ?? '',
      row.program ?? '',
      row.metricName ?? '',
      row.month,
      row.year
    );

    if (existingKeys.has(key)) {
      duplicates.push(row);
    } else {
      unique.push(row);
    }
  }

  return { unique, duplicates, duplicateCount: duplicates.length };
}

// Helper to build a unique key for behavioral coaching rows
function buildBehaviorKey(
  org: string,
  program: string,
  metric: string,
  behavior: string,
  subBehavior: string,
  month: string,
  year: number
): string {
  return `${org}|${program}|${metric}|${behavior}|${subBehavior}|${month}|${year}`.toLowerCase();
}

// Helper to build a unique key for metric rows
function buildMetricKey(
  org: string,
  program: string,
  metricName: string,
  month: string,
  year: number
): string {
  return `${org}|${program}|${metricName}|${month}|${year}`.toLowerCase();
}

