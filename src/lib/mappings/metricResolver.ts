import { getSupabaseAdminClient } from '@/lib/supabase/server';

type MetricAliasRow = {
  canonical_name: string;
  alias: string;
  match_type: 'exact' | 'contains' | 'regex';
  case_sensitive: boolean;
  priority: number;
  client: string | null;
};

// In-memory cache for metric aliases
let aliasCache: MetricAliasRow[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Loads all metric aliases from Supabase.
 * Cached in memory for 5 minutes to avoid repeated queries during batch parsing.
 */
export async function loadMetricAliases(): Promise<MetricAliasRow[]> {
  const now = Date.now();
  if (aliasCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return aliasCache;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('metric_aliases')
      .select('canonical_name, alias, match_type, case_sensitive, priority, client')
      .order('priority', { ascending: false });

    if (error) {
      console.error('[metricResolver] Failed to load aliases:', error.message);
      return aliasCache ?? [];
    }

    aliasCache = data as MetricAliasRow[];
    cacheTimestamp = now;
    console.log(`[metricResolver] Loaded ${aliasCache.length} metric aliases from DB`);
    return aliasCache;
  } catch (err) {
    console.error('[metricResolver] Unexpected error:', err);
    return aliasCache ?? [];
  }
}

/**
 * Clears the alias cache for immediate refresh.
 * Call this after updating aliases in the database.
 */
export function clearMetricAliasCache(): void {
  aliasCache = null;
  cacheTimestamp = 0;
}

/**
 * Creates a synchronous resolver function from pre-loaded aliases.
 * Use this during batch parsing to avoid async calls in hot loops.
 *
 * @param aliases - Pre-loaded aliases from loadMetricAliases()
 * @param client - Optional client name for client-specific overrides
 * @returns A function that resolves raw metric names to canonical names
 */
export function createMetricResolver(
  aliases: MetricAliasRow[],
  client: string | null = null,
): (rawName: unknown) => string | null {
  // Sort: client-specific first (matching current client), then by priority
  const sorted = [...aliases].sort((a, b) => {
    // Matching client > any client > global (null)
    const aClientMatch = a.client === client ? 2 : a.client ? 1 : 0;
    const bClientMatch = b.client === client ? 2 : b.client ? 1 : 0;
    if (aClientMatch !== bClientMatch) return bClientMatch - aClientMatch;
    return b.priority - a.priority;
  });

  return (rawName: unknown): string | null => {
    if (rawName === null || rawName === undefined) return null;
    const input = String(rawName).trim();
    if (!input) return null;

    for (const row of sorted) {
      // Skip client-specific rules that don't match current client
      if (row.client && row.client !== client) continue;

      const inputLower = row.case_sensitive ? input : input.toLowerCase();
      const aliasLower = row.case_sensitive ? row.alias : row.alias.toLowerCase();

      let matched = false;

      switch (row.match_type) {
        case 'exact':
          matched = inputLower === aliasLower;
          break;
        case 'contains':
          matched = inputLower.includes(aliasLower);
          break;
        case 'regex':
          try {
            const flags = row.case_sensitive ? '' : 'i';
            const regex = new RegExp(row.alias, flags);
            matched = regex.test(input);
          } catch {
            // Invalid regex in DB, skip this rule
            console.warn(`[metricResolver] Invalid regex: ${row.alias}`);
          }
          break;
      }

      if (matched) {
        return row.canonical_name;
      }
    }

    return null; // No DB match found - caller should fall back to hard-coded
  };
}
