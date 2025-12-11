import { getSupabaseAdminClient } from '@/lib/supabase/server';

type IndustryAliasRow = {
  canonical_industry: string;
  alias: string;
  match_type: 'exact' | 'contains' | 'regex';
  case_sensitive: boolean;
  priority: number;
  client: string | null;
};

// In-memory cache for industry aliases
let aliasCache: IndustryAliasRow[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Loads all industry aliases from Supabase.
 * Cached in memory for 5 minutes to avoid repeated queries during batch parsing.
 */
export async function loadIndustryAliases(): Promise<IndustryAliasRow[]> {
  const now = Date.now();
  if (aliasCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return aliasCache;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('industry_aliases')
      .select('canonical_industry, alias, match_type, case_sensitive, priority, client')
      .order('priority', { ascending: false });

    if (error) {
      console.error('[industryResolver] Failed to load aliases:', error.message);
      return aliasCache ?? [];
    }

    aliasCache = data as IndustryAliasRow[];
    cacheTimestamp = now;
    console.log(`[industryResolver] Loaded ${aliasCache.length} industry aliases from DB`);
    return aliasCache;
  } catch (err) {
    console.error('[industryResolver] Unexpected error:', err);
    return aliasCache ?? [];
  }
}

/**
 * Clears the alias cache for immediate refresh.
 * Call this after updating aliases in the database.
 */
export function clearIndustryAliasCache(): void {
  aliasCache = null;
  cacheTimestamp = 0;
}

/**
 * Creates a synchronous resolver function from pre-loaded aliases.
 * Use this during batch parsing to avoid async calls in hot loops.
 *
 * @param aliases - Pre-loaded aliases from loadIndustryAliases()
 * @param client - Optional client name for client-specific overrides
 * @returns A function that resolves organization names to canonical industries
 */
export function createIndustryResolver(
  aliases: IndustryAliasRow[],
  client: string | null = null,
): (orgName: unknown) => string | null {
  // Sort: client-specific first (matching current client), then by priority
  const sorted = [...aliases].sort((a, b) => {
    // Matching client > any client > global (null)
    const aClientMatch = a.client === client ? 2 : a.client ? 1 : 0;
    const bClientMatch = b.client === client ? 2 : b.client ? 1 : 0;
    if (aClientMatch !== bClientMatch) return bClientMatch - aClientMatch;
    return b.priority - a.priority;
  });

  return (orgName: unknown): string | null => {
    if (orgName === null || orgName === undefined) return null;
    const input = String(orgName).trim();
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
            console.warn(`[industryResolver] Invalid regex: ${row.alias}`);
          }
          break;
      }

      if (matched) {
        return row.canonical_industry;
      }
    }

    return null; // No DB match found - caller should fall back to hard-coded
  };
}

/**
 * Hard-coded industry mappings for common organizations.
 * These serve as fallbacks when no DB alias is found.
 */
const INDUSTRY_MAPPINGS: Record<string, string> = {
  // Healthcare
  'uhc': 'HEALTHCARE',
  'united health': 'HEALTHCARE',
  'unitedhealthcare': 'HEALTHCARE',
  'optum': 'HEALTHCARE',
  'blue shield': 'HEALTHCARE',
  'bsc': 'HEALTHCARE',
  'anthem': 'HEALTHCARE',
  'cigna': 'HEALTHCARE',
  'humana': 'HEALTHCARE',
  'kaiser': 'HEALTHCARE',
  'aetna': 'HEALTHCARE',
  'vantive': 'HEALTHCARE',
  'remodel health': 'HEALTHCARE',

  // Telecommunications
  'at&t': 'TELECOMMUNICATIONS',
  'att': 'TELECOMMUNICATIONS',
  't-mobile': 'TELECOMMUNICATIONS',
  'tmobile': 'TELECOMMUNICATIONS',
  'verizon': 'TELECOMMUNICATIONS',
  'sprint': 'TELECOMMUNICATIONS',
  'sirius': 'TELECOMMUNICATIONS',
  'siriusxm': 'TELECOMMUNICATIONS',
  'nomad internet': 'TELECOMMUNICATIONS',

  // Retail
  'sams club': 'RETAIL',
  "sam's club": 'RETAIL',
  'walmart': 'RETAIL',
  'macys': 'RETAIL',
  "macy's": 'RETAIL',
  'american eagle': 'RETAIL',
  'aeo': 'RETAIL',
  'target': 'RETAIL',
  'costco': 'RETAIL',

  // Food & Beverage
  'coca cola': 'FOOD & BEVERAGE',
  'coca-cola': 'FOOD & BEVERAGE',
  'coke': 'FOOD & BEVERAGE',
  'keurig': 'FOOD & BEVERAGE',
  'dr pepper': 'FOOD & BEVERAGE',
  'pepsi': 'FOOD & BEVERAGE',

  // Automotive
  'mercedes': 'AUTOMOTIVE',
  'mercedes-benz': 'AUTOMOTIVE',
  'ford': 'AUTOMOTIVE',
  'gm': 'AUTOMOTIVE',
  'toyota': 'AUTOMOTIVE',
  'honda': 'AUTOMOTIVE',

  // Travel & Hospitality
  'delta': 'TRAVEL & HOSPITALITY',
  'delta airlines': 'TRAVEL & HOSPITALITY',
  'extended stay': 'TRAVEL & HOSPITALITY',
  'esa': 'TRAVEL & HOSPITALITY',
  'marriott': 'TRAVEL & HOSPITALITY',
  'hilton': 'TRAVEL & HOSPITALITY',
  'tripadvisor': 'TRAVEL & HOSPITALITY',

  // Financial Services
  'liberty mutual': 'FINANCIAL SERVICES',
  'liberty': 'FINANCIAL SERVICES',
  'allstate': 'FINANCIAL SERVICES',
  'geico': 'FINANCIAL SERVICES',
  'progressive': 'FINANCIAL SERVICES',
  'state farm': 'FINANCIAL SERVICES',

  // Technology
  'pitney bowes': 'TECHNOLOGY',
  'pitney': 'TECHNOLOGY',
  'microsoft': 'TECHNOLOGY',
  'apple': 'TECHNOLOGY',
  'google': 'TECHNOLOGY',

  // Utilities
  'energy australia': 'UTILITIES',
  'energyaustralia': 'UTILITIES',
};

/**
 * Derive industry from organization name using hard-coded mappings.
 * Used as fallback when DB resolver returns null.
 */
export function deriveIndustryFromOrg(orgName: unknown): string | null {
  if (orgName === null || orgName === undefined) return null;
  const str = String(orgName).trim();
  if (str.length === 0) return null;

  const lowerStr = str.toLowerCase();

  // Check exact match first
  if (INDUSTRY_MAPPINGS[lowerStr]) {
    return INDUSTRY_MAPPINGS[lowerStr];
  }

  // Check if any key is contained in the org name
  for (const [key, industry] of Object.entries(INDUSTRY_MAPPINGS)) {
    if (lowerStr.includes(key)) {
      return industry;
    }
  }

  return null; // Unknown industry
}
