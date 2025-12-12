import { nanoid } from 'nanoid';
import { read, utils, WorkBook } from 'xlsx';

import {
  DatasetStats,
  NormalizationEntry,
  NormalizationSummary,
  ParsedBehaviorRow,
  ParsedMetricRow,
  ParseSingleSheetResult,
  ParseWorkbookMeta,
  ParseWorkbookResult,
  UnmatchedMetricEntry,
  UnmatchedOrgEntry,
} from '@/lib/excel/types';

type ParseWorkbookOptions = {
  buffer: ArrayBuffer | Buffer;
  fileName: string;
  clientOverride?: string;
  behaviorSheetHint?: string;
  metricSheetHint?: string;
  today?: Date;
  /** If true, skip the 9-day delay filter (default: true - no filtering) */
  skipDateFilter?: boolean;
};

type ParseSingleSheetOptions = {
  buffer: ArrayBuffer | Buffer;
  fileName: string;
  clientOverride?: string;
  sheetName?: string;
  /** Force parsing as this type instead of auto-detecting */
  forceType?: 'behaviors' | 'metrics';
  today?: Date;
  skipDateFilter?: boolean;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const MONTHS: Array<{ short: string; aliases: string[] }> = [
  { short: 'Jan', aliases: ['jan', 'january'] },
  { short: 'Feb', aliases: ['feb', 'february'] },
  { short: 'Mar', aliases: ['mar', 'march'] },
  { short: 'Apr', aliases: ['apr', 'april'] },
  { short: 'May', aliases: ['may'] },
  { short: 'Jun', aliases: ['jun', 'june'] },
  { short: 'Jul', aliases: ['jul', 'july'] },
  { short: 'Aug', aliases: ['aug', 'august'] },
  { short: 'Sep', aliases: ['sep', 'sept', 'september'] },
  { short: 'Oct', aliases: ['oct', 'october'] },
  { short: 'Nov', aliases: ['nov', 'november'] },
  { short: 'Dec', aliases: ['dec', 'december'] },
];

const monthLookup = MONTHS.reduce<Record<string, { index: number; short: string }>>(
  (acc, entry, index) => {
    entry.aliases.forEach((alias) => {
      acc[alias] = { index, short: entry.short };
    });
    acc[entry.short.toLowerCase()] = { index, short: entry.short };
    return acc;
  },
  {},
);

const toBuffer = (input: ArrayBuffer | Buffer) =>
  Buffer.isBuffer(input) ? input : Buffer.from(input);

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * Organization aliases - maps variations to canonical amplifai_org values
 * Add new mappings here as needed
 */
const ORG_ALIASES: Record<string, string> = {
  // UHC variations - CRITICAL
  'united health care': 'UHC',
  'united healthcare': 'UHC',
  'united health group': 'UHC',
  'unitedhealthcare': 'UHC',
  'unitedhealth': 'UHC',
  'uhc': 'UHC',
  'uhg': 'UHC',
  
  // Optum variations
  'optum': 'OPTUM UBH',
  'optum ubh': 'OPTUM UBH',
  'optum behavioral': 'OPTUM UBH',
  
  // AT&T variations
  'at&t': 'ATT MEXICO',
  'att': 'ATT MEXICO',
  'at&t mexico': 'ATT MEXICO',
  
  // T-Mobile variations
  't-mobile': 'T-MOBILE',
  'tmobile': 'T-MOBILE',
  't mobile': 'T-MOBILE',
  
  // Sirius XM variations
  'sirius': 'SIRIUS XM RADIO',
  'siriusxm': 'SIRIUS XM RADIO',
  'sirius xm': 'SIRIUS XM RADIO',
  
  // Blue Shield variations
  'blue shield': 'BSC',
  'blue shield of california': 'BSC',
  'bsc': 'BSC',
  
  // Sam's Club
  'sams club': 'SAMS CLUB',
  "sam's club": 'SAMS CLUB',
  
  // Macy's
  'macys': 'MACYS',
  "macy's": 'MACYS',
  
  // Keurig Dr Pepper
  'keurig': 'KEURIG DR PEPPER',
  'dr pepper': 'KEURIG DR PEPPER',
  'keurig dr. pepper': 'KEURIG DR PEPPER',
  
  // Mercedes-Benz
  'mercedes': 'MERCEDES BENZ',
  'mercedes-benz': 'MERCEDES BENZ',
  
  // Delta
  'delta': 'DELTA AIR LINES',
  'delta airlines': 'DELTA AIR LINES',
  
  // Extended Stay
  'extended stay': 'EXTENDED STAY AMERICA',
  'extended stay america': 'EXTENDED STAY AMERICA',
  
  // Liberty Mutual
  'liberty': 'LIBERTY MUTUAL',
  
  // Pitney Bowes
  'pitney': 'PITNEY BOWES',
  
  // American Eagle
  'american eagle': 'AMERICAN EAGLE OUTFITTERS',
  'aeo': 'AMERICAN EAGLE OUTFITTERS',
  
  // Coca-Cola
  'coca cola': 'COCA COLA',
  'coca-cola': 'COCA COLA',
  'coke': 'COCA COLA',
  
  // Energy Australia
  'energy aus': 'ENERGY AUSTRALIA',
  'energyaustralia': 'ENERGY AUSTRALIA',
  
  // Nomad Internet
  'nomad': 'NOMAD INTERNET',
  
  // Remodel Health
  'remodel': 'REMODEL HEALTH',
  
  // TripAdvisor
  'tripadvisor': 'TRIPADVISOR',
  'trip advisor': 'TRIPADVISOR',
  
  // Vantive
  'vantive': 'VANTIVE HEALTH',
};

/**
 * Normalize to amplifai_org format with alias resolution
 */
const toAmplifaiOrg = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str.length === 0) return null;
  
  // Check aliases first (case-insensitive)
  const lowerStr = str.toLowerCase();
  if (ORG_ALIASES[lowerStr]) {
    return ORG_ALIASES[lowerStr];
  }
  
  // Check if any alias is contained in the string
  for (const [alias, canonical] of Object.entries(ORG_ALIASES)) {
    if (lowerStr.includes(alias)) {
      return canonical;
    }
  }
  
  // Default: uppercase and clean
  return str.toUpperCase().replace(/\s+/g, ' ');
};

/**
 * Normalize to amplifai_metric format using centralized mappings.
 * Supports optional DB-based resolver that takes precedence over hard-coded.
 */
import { deriveAmplifaiMetric } from '@/lib/excel/amplifaiMappings';
import { deriveIndustryFromOrg } from '@/lib/mappings/industryResolver';

// Optional DB-based resolvers - injected before parsing
let dbMetricResolver: ((raw: unknown) => string | null) | null = null;
let dbIndustryResolver: ((orgName: unknown) => string | null) | null = null;

/**
 * Injects a DB-based metric resolver for the next parse operation.
 * Call this before parseWorkbook() with a resolver created from loadMetricAliases().
 * Pass null to clear the resolver after parsing.
 */
export function setDbMetricResolver(
  resolver: ((raw: unknown) => string | null) | null,
): void {
  dbMetricResolver = resolver;
}

/**
 * Injects a DB-based industry resolver for the next parse operation.
 * Call this before parseWorkbook() with a resolver created from loadIndustryAliases().
 * Pass null to clear the resolver after parsing.
 */
export function setDbIndustryResolver(
  resolver: ((orgName: unknown) => string | null) | null,
): void {
  dbIndustryResolver = resolver;
}

const toAmplifaiMetric = (value: unknown): string | null => {
  // Try DB resolver first (if injected)
  if (dbMetricResolver) {
    const dbResult = dbMetricResolver(value);
    if (dbResult) return dbResult;
  }
  // Fall back to hard-coded mappings
  return deriveAmplifaiMetric(value);
};

/**
 * Derive industry from organization name.
 * Uses DB resolver first, then falls back to hard-coded mappings.
 */
const toAmplifaiIndustry = (orgValue: unknown): string | null => {
  // Try DB resolver first (if injected)
  if (dbIndustryResolver) {
    const dbResult = dbIndustryResolver(orgValue);
    if (dbResult) return dbResult;
  }
  // Fall back to hard-coded mappings
  return deriveIndustryFromOrg(orgValue);
};

// Normalization tracking - stores original -> normalized mappings with counts
type NormalizationTracker = {
  organizations: Map<string, { normalized: string; count: number }>;
  metrics: Map<string, { normalized: string; count: number }>;
  industries: Map<string, { normalized: string; count: number }>;
  unmatchedOrgs: Map<string, { amplifaiOrg: string | null; count: number }>;
  unmatchedMetrics: Map<string, { count: number }>;
};

let normalizationTracker: NormalizationTracker | null = null;

/**
 * Initialize normalization tracking for a new parse operation.
 */
export function initNormalizationTracking(): void {
  normalizationTracker = {
    organizations: new Map(),
    metrics: new Map(),
    industries: new Map(),
    unmatchedOrgs: new Map(),
    unmatchedMetrics: new Map(),
  };
}

/**
 * Get the current normalization summary and clear the tracker.
 */
export function getNormalizationSummary(): NormalizationSummary {
  if (!normalizationTracker) {
    return { organizations: [], metrics: [], industries: [], unmatchedOrgs: [], unmatchedMetrics: [] };
  }

  const toEntries = (map: Map<string, { normalized: string; count: number }>): NormalizationEntry[] => {
    return Array.from(map.entries())
      .filter(([original, { normalized }]) => original.toLowerCase() !== normalized.toLowerCase())
      .map(([original, { normalized, count }]) => ({ original, normalized, count }))
      .sort((a, b) => b.count - a.count);
  };

  const toUnmatchedOrgEntries = (map: Map<string, { amplifaiOrg: string | null; count: number }>): UnmatchedOrgEntry[] => {
    return Array.from(map.entries())
      .map(([orgName, { amplifaiOrg, count }]) => ({ orgName, amplifaiOrg, count }))
      .sort((a, b) => b.count - a.count);
  };

  const toUnmatchedMetricEntries = (map: Map<string, { count: number }>): UnmatchedMetricEntry[] => {
    return Array.from(map.entries())
      .map(([metricName, { count }]) => ({ metricName, count }))
      .sort((a, b) => b.count - a.count);
  };

  const summary: NormalizationSummary = {
    organizations: toEntries(normalizationTracker.organizations),
    metrics: toEntries(normalizationTracker.metrics),
    industries: toEntries(normalizationTracker.industries),
    unmatchedOrgs: toUnmatchedOrgEntries(normalizationTracker.unmatchedOrgs),
    unmatchedMetrics: toUnmatchedMetricEntries(normalizationTracker.unmatchedMetrics),
  };

  normalizationTracker = null;
  return summary;
}

/**
 * Track a normalization that was applied.
 */
const trackNormalization = (
  type: 'organizations' | 'metrics' | 'industries',
  original: string,
  normalized: string,
): void => {
  if (!normalizationTracker || !original || !normalized) return;

  const map = normalizationTracker[type];
  const existing = map.get(original);
  if (existing) {
    existing.count += 1;
  } else {
    map.set(original, { normalized, count: 1 });
  }
};

/**
 * Track an organization that has no industry mapping.
 */
const trackUnmatchedOrg = (
  orgName: string,
  amplifaiOrg: string | null,
): void => {
  if (!normalizationTracker || !orgName) return;

  const map = normalizationTracker.unmatchedOrgs;
  const existing = map.get(orgName);
  if (existing) {
    existing.count += 1;
  } else {
    map.set(orgName, { amplifaiOrg, count: 1 });
  }
};

/**
 * Track a metric that has no standardized mapping.
 * A metric is "unmatched" if the normalized version is just the uppercased original.
 */
const trackUnmatchedMetric = (
  metricName: string,
  amplifaiMetric: string | null,
): void => {
  if (!normalizationTracker || !metricName || !amplifaiMetric) return;

  // If the normalized metric is just the uppercased original, it's unmatched
  const isUnmatched = amplifaiMetric === metricName.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!isUnmatched) return;

  const map = normalizationTracker.unmatchedMetrics;
  const existing = map.get(metricName);
  if (existing) {
    existing.count += 1;
  } else {
    map.set(metricName, { count: 1 });
  }
};

const coerceString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = normalizeWhitespace(value);
    return trimmed.length ? trimmed : null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const converted = normalizeWhitespace(String(value));
  return converted.length ? converted : null;
};

/**
 * Fuzzy column matcher - handles variations in column names
 * Maps common variations to canonical names
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  // Date/Period columns
  'month_year': ['month_year', 'month year', 'monthyear', 'period of time', 'period', 'month name', 'month', 'date'],
  
  // Organization
  'organization': ['organization', 'org', 'organisation', 'client_org', ' '],
  
  // Program
  'program': ['program', 'programme', 'prog'],
  
  // Metric columns (for metrics sheets)
  'metric': ['metric', 'metrics', 'metri', 'metricname', 'metric_name', 'metric name', 'kpi'],
  
  // Behavior columns (for behavioral sheets)
  'behavior': ['behavior', 'behaviors', 'behaviour', 'behaviours'],
  'sub_behavior': ['sub-behavior', 'sub_behavior', 'subbehavior', 'subbehaviors', 'sub behavior', 'sub-behaviours'],
  
  // Coaching columns
  'coaching_count': ['coaching count', 'coaching_count', 'coachingcount', 'totalcoachings', 'total coachings', 'total_coachings', 'count'],
  'effectiveness_pct': ['effectiveness%', 'effectiveness_pct', 'effectiveness', 'effectiveness pct', 'eff%', 'eff'],
  
  // Metric value columns
  'actual': ['actual', 'actuals', 'value', 'result'],
  'goal': ['goal', 'goals', 'target'],
  'ptg': ['ptg', 'sum of ptg', 'percent to goal', '% to goal', 'pct_to_goal'],
};

const createRowAccessor = (row: Record<string, unknown>) => {
  // Build a map of normalized keys to values
  const keyMap = new Map<string, unknown>();
  const originalKeys = new Map<string, string>();
  
  for (const [key, value] of Object.entries(row)) {
    const normalized = key.toLowerCase().trim();
    keyMap.set(normalized, value);
    originalKeys.set(normalized, key);
  }

  /**
   * Get value by canonical name - checks all known aliases
   */
  const get = (canonicalName: string, ...additionalAliases: string[]) => {
    // First check the canonical aliases
    const aliases = COLUMN_ALIASES[canonicalName] || [];
    const allAliases = [...aliases, canonicalName, ...additionalAliases];
    
    for (const alias of allAliases) {
      const normalized = alias.toLowerCase().trim();
      const value = keyMap.get(normalized);
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return null;
  };

  /**
   * Get raw value by exact key (case-insensitive)
   */
  const getRaw = (key: string) => {
    return keyMap.get(key.toLowerCase().trim()) ?? null;
  };

  /**
   * Check if any of the given column names exist
   */
  const hasAny = (...names: string[]) => {
    for (const name of names) {
      if (keyMap.has(name.toLowerCase().trim())) return true;
    }
    return false;
  };

  return { get, getRaw, hasAny, keys: () => Array.from(originalKeys.values()) };
};

const excelSerialToDate = (serial: number) => {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const millis = serial * MS_PER_DAY;
  return new Date(epoch.getTime() + millis);
};

const parseMonthYear = (input: unknown) => {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const date = excelSerialToDate(input);
    const month = MONTHS[date.getUTCMonth()].short;
    return { month, year: date.getUTCFullYear() };
  }

  if (input instanceof Date) {
    const month = MONTHS[input.getUTCMonth()].short;
    return { month, year: input.getUTCFullYear() };
  }

  const rawString = coerceString(input);
  if (!rawString) return { month: null, year: null };

  const monthMatch = rawString
    .toLowerCase()
    .match(/(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t)?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)/);
  const yearMatch = rawString.match(/(20\d{2}|19\d{2}|\d{2})/);

  if (!monthMatch || !yearMatch) {
    return { month: null, year: null };
  }

  const lookup = monthLookup[monthMatch[0]];
  if (!lookup) return { month: null, year: null };

  const parsedYear = Number(yearMatch[0]);
  const normalizedYear = parsedYear < 100 ? parsedYear + 2000 : parsedYear;

  return { month: lookup.short, year: normalizedYear };
};

const startOfDayUTC = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const isMonthOldEnough = (
  month: string,
  year: number,
  today: Date,
) => {
  const lookup = monthLookup[month.toLowerCase()];
  if (!lookup) return false;

  const lastDayOfMonth = Date.UTC(year, lookup.index + 1, 0);
  const diff = (startOfDayUTC(today) - lastDayOfMonth) / MS_PER_DAY;
  return diff >= 9;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const asString = coerceString(value);
  if (!asString) return null;
  const cleaned = asString.replace(/[,%]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const inferClientFromFile = (fileName: string) => {
  const withoutExt = fileName.replace(/\.xlsx$/i, '');
  const withoutData = withoutExt.replace(/_data$/i, '');
  const segment = withoutData.split(/[_-]/)[0] ?? withoutData;
  const cleaned = normalizeWhitespace(segment);
  if (!cleaned) return 'Unknown Client';

  const normalized = cleaned.toLowerCase();
  if (normalized.includes('teleperformance')) {
    return 'TP';
  }

  if (cleaned.length <= 4) return cleaned.toUpperCase();
  return cleaned[0].toUpperCase() + cleaned.slice(1);
};

const initStats = (): DatasetStats => ({
  totalRows: 0,
  acceptedRows: 0,
  filteredMissingData: 0,
  filteredTooRecent: 0,
});

/**
 * Detect if a sheet looks like behavioral data based on columns present
 */
const looksLikeBehaviorSheet = (rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return false;
  const firstRow = rows[0];
  const accessor = createRowAccessor(firstRow);
  // Behavioral sheets have behavior/sub-behavior columns
  return accessor.hasAny('behavior', 'behaviors', 'behaviour', 'behaviours', 'subbehaviors', 'sub-behavior', 'subbehavior');
};

/**
 * Detect if a sheet looks like metrics data based on columns present
 */
const looksLikeMetricSheet = (rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return false;
  const firstRow = rows[0];
  const accessor = createRowAccessor(firstRow);
  // Metric sheets have actual/goal/ptg columns without behavior columns
  const hasMetricColumns = accessor.hasAny('actual', 'actuals', 'goal', 'goals', 'ptg', 'sum of ptg');
  const hasBehaviorColumns = accessor.hasAny('behavior', 'behaviors', 'behaviour', 'behaviours');
  return hasMetricColumns && !hasBehaviorColumns;
};

const pickSheet = (
  workbook: WorkBook,
  keyword: string,
  explicit?: string,
) => {
  if (explicit && workbook.SheetNames.includes(explicit)) return explicit;
  const lowerKeyword = keyword.toLowerCase();
  const match = workbook.SheetNames.find((name) =>
    name.toLowerCase().includes(lowerKeyword),
  );
  return match ?? workbook.SheetNames[0] ?? null;
};

/**
 * Auto-detect sheets by analyzing their column structure
 */
const autoDetectSheets = (workbook: WorkBook) => {
  let behaviorSheet: string | null = null;
  let metricSheet: string | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    
    const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    if (rows.length === 0) continue;

    if (!behaviorSheet && looksLikeBehaviorSheet(rows)) {
      behaviorSheet = sheetName;
    } else if (!metricSheet && looksLikeMetricSheet(rows)) {
      metricSheet = sheetName;
    }

    // If we found both, we're done
    if (behaviorSheet && metricSheet) break;
  }

  return { behaviorSheet, metricSheet };
};

const parseBehaviorRows = (
  rows: Record<string, unknown>[],
  sheetName: string,
  client: string,
  today: Date,
  stats: DatasetStats,
  skipDateFilter: boolean,
) => {
  const parsed: ParsedBehaviorRow[] = [];

  rows.forEach((row, index) => {
    stats.totalRows += 1;
    const accessor = createRowAccessor(row);
    const monthYearValue = accessor.get('month_year');
    const { month, year } = parseMonthYear(monthYearValue);

    if (!month || !year) {
      stats.filteredMissingData += 1;
      return;
    }

    if (!skipDateFilter && !isMonthOldEnough(month, year, today)) {
      stats.filteredTooRecent += 1;
      return;
    }

    const organizationValue = accessor.get('organization');
    const programValue = accessor.get('program');

    if (!organizationValue || !programValue) {
      stats.filteredMissingData += 1;
      return;
    }

    const metricValue = accessor.get('metric');
    const behaviorValue = accessor.get('behavior');
    const subBehaviorValue = accessor.get('sub_behavior');
    const coachingCountValue = accessor.get('coaching_count');
    const effectivenessValue = accessor.get('effectiveness_pct');

    const orgStr = coerceString(organizationValue);
    const metricStr = coerceString(metricValue);
    const amplifaiOrg = toAmplifaiOrg(organizationValue);
    const amplifaiMetric = toAmplifaiMetric(metricValue);
    const amplifaiIndustry = toAmplifaiIndustry(organizationValue);

    // Track normalizations
    if (orgStr && amplifaiOrg) {
      trackNormalization('organizations', orgStr, amplifaiOrg);
    }
    if (metricStr && amplifaiMetric) {
      trackNormalization('metrics', metricStr, amplifaiMetric);
    }
    if (orgStr && amplifaiIndustry) {
      trackNormalization('industries', orgStr, amplifaiIndustry);
    }
    // Track orgs with no industry mapping
    if (orgStr && !amplifaiIndustry) {
      trackUnmatchedOrg(orgStr, amplifaiOrg);
    }
    // Track metrics with no standardized mapping
    if (metricStr) {
      trackUnmatchedMetric(metricStr, amplifaiMetric);
    }

    const record: ParsedBehaviorRow = {
      id: nanoid(),
      client,
      month,
      year,
      sourceRowNumber: index + 2,
      sourceSheet: sheetName,
      organization: orgStr,
      program: coerceString(programValue),
      metric: metricStr,
      behavior: coerceString(behaviorValue),
      subBehavior: coerceString(subBehaviorValue),
      coachingCount: toNumber(coachingCountValue),
      effectivenessPct: toNumber(effectivenessValue),
      amplifaiOrg,
      amplifaiMetric,
      amplifaiIndustry,
      raw: row,
    };

    parsed.push(record);
    stats.acceptedRows += 1;
  });

  return parsed;
};

const parseMetricRows = (
  rows: Record<string, unknown>[],
  sheetName: string,
  client: string,
  today: Date,
  stats: DatasetStats,
  skipDateFilter: boolean,
) => {
  const parsed: ParsedMetricRow[] = [];

  rows.forEach((row, index) => {
    stats.totalRows += 1;
    const accessor = createRowAccessor(row);
    const monthYearValue = accessor.get('month_year');
    const { month, year } = parseMonthYear(monthYearValue);

    if (!month || !year) {
      stats.filteredMissingData += 1;
      return;
    }

    if (!skipDateFilter && !isMonthOldEnough(month, year, today)) {
      stats.filteredTooRecent += 1;
      return;
    }

    const organizationValue = accessor.get('organization');
    const programValue = accessor.get('program');
    const metricValue = accessor.get('metric');

    if (!organizationValue || !programValue || !metricValue) {
      stats.filteredMissingData += 1;
      return;
    }

    const actualValue = accessor.get('actual');
    const goalValue = accessor.get('goal');
    const ptgValue = accessor.get('ptg');
    const programStr = coerceString(programValue);
    const orgStr = coerceString(organizationValue);
    const metricStr = coerceString(metricValue);
    const amplifaiOrg = toAmplifaiOrg(organizationValue);
    const amplifaiMetric = toAmplifaiMetric(metricValue);
    const amplifaiIndustry = toAmplifaiIndustry(organizationValue);

    // Track normalizations
    if (orgStr && amplifaiOrg) {
      trackNormalization('organizations', orgStr, amplifaiOrg);
    }
    if (metricStr && amplifaiMetric) {
      trackNormalization('metrics', metricStr, amplifaiMetric);
    }
    if (orgStr && amplifaiIndustry) {
      trackNormalization('industries', orgStr, amplifaiIndustry);
    }
    // Track orgs with no industry mapping
    if (orgStr && !amplifaiIndustry) {
      trackUnmatchedOrg(orgStr, amplifaiOrg);
    }
    // Track metrics with no standardized mapping
    if (metricStr) {
      trackUnmatchedMetric(metricStr, amplifaiMetric);
    }

    const record: ParsedMetricRow = {
      id: nanoid(),
      client,
      month,
      year,
      sourceRowNumber: index + 2,
      sourceSheet: sheetName,
      organization: orgStr,
      program: programStr,
      metricName: metricStr,
      actual: toNumber(actualValue),
      goal: toNumber(goalValue),
      ptg: toNumber(ptgValue),
      isActivityMetric: false, // Activity metrics not supported via upload console - they require special handling
      amplifaiOrg,
      amplifaiMetric,
      amplifaiIndustry,
      raw: row,
    };

    parsed.push(record);
    stats.acceptedRows += 1;
  });

  return parsed;
};

export const parseWorkbook = (options: ParseWorkbookOptions): ParseWorkbookResult => {
  const data = toBuffer(options.buffer);
  const workbook = read(data, {
    type: 'buffer',
    cellDates: true,
    cellNF: false,
  });

  if (!workbook.SheetNames.length) {
    throw new Error('The uploaded workbook does not contain any sheets.');
  }

  const today = options.today ?? new Date();
  const client = options.clientOverride ?? inferClientFromFile(options.fileName);
  const skipDateFilter = options.skipDateFilter ?? true; // Default to skipping date filter

  const issues: string[] = [];

  // First try auto-detection based on column structure
  const autoDetected = autoDetectSheets(workbook);
  
  // Then fall back to keyword matching if auto-detection fails
  let behaviorSheetName = options.behaviorSheetHint 
    ? pickSheet(workbook, 'effectiveness', options.behaviorSheetHint)
    : autoDetected.behaviorSheet ?? pickSheet(workbook, 'effectiveness');
    
  let metricSheetName = options.metricSheetHint
    ? pickSheet(workbook, 'goal', options.metricSheetHint)
    : autoDetected.metricSheet ?? pickSheet(workbook, 'goal');

  // If both point to the same sheet, try to be smarter
  if (behaviorSheetName === metricSheetName && workbook.SheetNames.length > 1) {
    // Re-run auto-detection more carefully
    const detected = autoDetectSheets(workbook);
    if (detected.behaviorSheet) behaviorSheetName = detected.behaviorSheet;
    if (detected.metricSheet) metricSheetName = detected.metricSheet;
  }

  if (!behaviorSheetName && !autoDetected.behaviorSheet) {
    issues.push('No sheet could be resolved for behavioral coaching data. Looking for columns: Behavior, Sub-Behavior, Coaching Count, Effectiveness%');
  }
  if (!metricSheetName && !autoDetected.metricSheet) {
    issues.push('No sheet could be resolved for metric data. Looking for columns: Actual, Goal, PTG');
  }

  const behaviorSheet = behaviorSheetName
    ? workbook.Sheets[behaviorSheetName]
    : null;
  const metricSheet = metricSheetName ? workbook.Sheets[metricSheetName] : null;

  const behaviorRows = behaviorSheet
    ? utils.sheet_to_json<Record<string, unknown>>(behaviorSheet, {
        defval: null,
      })
    : [];
  const metricRows = metricSheet
    ? utils.sheet_to_json<Record<string, unknown>>(metricSheet, {
        defval: null,
      })
    : [];

  // Log detected columns for debugging
  if (behaviorRows.length > 0) {
    const sampleAccessor = createRowAccessor(behaviorRows[0]);
    console.log(`[Parser] Behavior sheet "${behaviorSheetName}" columns:`, sampleAccessor.keys());
  }
  if (metricRows.length > 0) {
    const sampleAccessor = createRowAccessor(metricRows[0]);
    console.log(`[Parser] Metric sheet "${metricSheetName}" columns:`, sampleAccessor.keys());
  }

  const behaviorStats = initStats();
  const metricStats = initStats();

  const behaviors = parseBehaviorRows(
    behaviorRows,
    behaviorSheetName ?? 'unknown',
    client,
    today,
    behaviorStats,
    skipDateFilter,
  );
  const metrics = parseMetricRows(
    metricRows,
    metricSheetName ?? 'unknown',
    client,
    today,
    metricStats,
    skipDateFilter,
  );

  const monthlyMetrics = metrics.filter((row) => !row.isActivityMetric);
  const activityMetrics = metrics.filter((row) => row.isActivityMetric);

  // Add helpful info to issues
  if (behaviorStats.filteredMissingData > 0) {
    issues.push(`${behaviorStats.filteredMissingData} behavior rows filtered (missing required: organization, program, or month/year)`);
  }
  if (metricStats.filteredMissingData > 0) {
    issues.push(`${metricStats.filteredMissingData} metric rows filtered (missing required: organization, program, metric, or month/year)`);
  }
  if (!skipDateFilter) {
    if (behaviorStats.filteredTooRecent > 0) {
      issues.push(`${behaviorStats.filteredTooRecent} behavior rows filtered (month not yet 9 days old)`);
    }
    if (metricStats.filteredTooRecent > 0) {
      issues.push(`${metricStats.filteredTooRecent} metric rows filtered (month not yet 9 days old)`);
    }
  }

  const meta: ParseWorkbookMeta = {
    workbookName: options.fileName,
    client,
    generatedAt: new Date().toISOString(),
    sheets: {
      behaviors: behaviorSheetName ?? null,
      metrics: metricSheetName ?? null,
    },
    behaviorStats,
    metricStats,
  };

  return {
    behaviors,
    monthlyMetrics,
    activityMetrics,
    meta,
    issues,
  };
};

/**
 * Parse a single sheet from an Excel file - for separate uploads
 */
export const parseSingleSheet = (options: ParseSingleSheetOptions): ParseSingleSheetResult => {
  const data = toBuffer(options.buffer);
  const workbook = read(data, {
    type: 'buffer',
    cellDates: true,
    cellNF: false,
  });

  if (!workbook.SheetNames.length) {
    throw new Error('The uploaded workbook does not contain any sheets.');
  }

  const today = options.today ?? new Date();
  const client = options.clientOverride ?? inferClientFromFile(options.fileName);
  const skipDateFilter = options.skipDateFilter ?? true;

  // Pick the sheet - use hint, or first sheet
  const sheetName = options.sheetName && workbook.SheetNames.includes(options.sheetName)
    ? options.sheetName
    : workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook.`);
  }

  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const issues: string[] = [];
  const stats = initStats();

  if (rows.length === 0) {
    return {
      behaviors: [],
      monthlyMetrics: [],
      activityMetrics: [],
      stats,
      sheetName,
      detectedType: 'unknown',
      columns: [],
      issues: ['Sheet is empty or has no data rows.'],
    };
  }

  const sampleAccessor = createRowAccessor(rows[0]);
  const columns = sampleAccessor.keys();
  console.log(`[Parser] Single sheet "${sheetName}" columns:`, columns);

  // Detect type or use forced type
  let detectedType: 'behaviors' | 'metrics' | 'unknown' = 'unknown';
  
  if (options.forceType) {
    detectedType = options.forceType;
  } else if (looksLikeBehaviorSheet(rows)) {
    detectedType = 'behaviors';
  } else if (looksLikeMetricSheet(rows)) {
    detectedType = 'metrics';
  }

  let behaviors: ParsedBehaviorRow[] = [];
  let monthlyMetrics: ParsedMetricRow[] = [];
  let activityMetrics: ParsedMetricRow[] = [];

  if (detectedType === 'behaviors') {
    behaviors = parseBehaviorRows(rows, sheetName, client, today, stats, skipDateFilter);
    if (stats.filteredMissingData > 0) {
      issues.push(`${stats.filteredMissingData} rows filtered (missing required: organization, program, or month/year)`);
    }
  } else if (detectedType === 'metrics') {
    const metrics = parseMetricRows(rows, sheetName, client, today, stats, skipDateFilter);
    monthlyMetrics = metrics.filter((row) => !row.isActivityMetric);
    activityMetrics = metrics.filter((row) => row.isActivityMetric);
    if (stats.filteredMissingData > 0) {
      issues.push(`${stats.filteredMissingData} rows filtered (missing required: organization, program, metric, or month/year)`);
    }
  } else {
    issues.push('Could not auto-detect sheet type. Please specify whether this is behavioral or metrics data.');
    issues.push(`Detected columns: ${columns.join(', ')}`);
  }

  return {
    behaviors,
    monthlyMetrics,
    activityMetrics,
    stats,
    sheetName,
    detectedType,
    columns,
    issues,
  };
};

/**
 * Get list of sheet names from a workbook
 */
export const getSheetNames = (buffer: ArrayBuffer | Buffer): string[] => {
  const data = toBuffer(buffer);
  const workbook = read(data, {
    type: 'buffer',
    bookSheets: true,
  });
  return workbook.SheetNames;
};

type ParseCsvOptions = {
  buffer: ArrayBuffer | Buffer;
  fileName: string;
  clientOverride?: string;
  /** Force parsing as this type instead of auto-detecting */
  forceType?: 'behaviors' | 'metrics';
  today?: Date;
  skipDateFilter?: boolean;
};

/**
 * Parse a CSV file - for separate uploads of behaviors or metrics
 */
export const parseCsv = (options: ParseCsvOptions): ParseSingleSheetResult => {
  const data = toBuffer(options.buffer);
  // Remove BOM character if present (common in Excel-exported CSVs)
  let csvString = data.toString('utf-8');
  if (csvString.charCodeAt(0) === 0xFEFF) {
    csvString = csvString.slice(1);
  }

  // Use xlsx library to parse CSV - it handles CSV format too
  const workbook = read(csvString, {
    type: 'string',
    cellDates: true,
    cellNF: false,
  });

  if (!workbook.SheetNames.length) {
    throw new Error('The uploaded CSV file could not be parsed.');
  }

  const today = options.today ?? new Date();
  const client = options.clientOverride ?? options.fileName.replace(/\.csv$/i, '');
  const skipDateFilter = options.skipDateFilter ?? true;

  // CSV files have a single "sheet"
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error('CSV file appears to be empty.');
  }

  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const issues: string[] = [];
  const stats = initStats();

  if (rows.length === 0) {
    return {
      behaviors: [],
      monthlyMetrics: [],
      activityMetrics: [],
      stats,
      sheetName: options.fileName,
      detectedType: 'unknown',
      columns: [],
      issues: ['CSV file is empty or has no data rows.'],
    };
  }

  const sampleAccessor = createRowAccessor(rows[0]);
  const columns = sampleAccessor.keys();
  console.log(`[Parser] CSV "${options.fileName}" columns:`, columns);

  // Detect type or use forced type
  let detectedType: 'behaviors' | 'metrics' | 'unknown' = 'unknown';

  if (options.forceType) {
    detectedType = options.forceType;
  } else if (looksLikeBehaviorSheet(rows)) {
    detectedType = 'behaviors';
  } else if (looksLikeMetricSheet(rows)) {
    detectedType = 'metrics';
  }

  let behaviors: ParsedBehaviorRow[] = [];
  let monthlyMetrics: ParsedMetricRow[] = [];
  let activityMetrics: ParsedMetricRow[] = [];

  if (detectedType === 'behaviors') {
    behaviors = parseBehaviorRows(rows, options.fileName, client, today, stats, skipDateFilter);
    if (stats.filteredMissingData > 0) {
      issues.push(`${stats.filteredMissingData} rows filtered (missing required: organization, program, or month/year)`);
    }
  } else if (detectedType === 'metrics') {
    const metrics = parseMetricRows(rows, options.fileName, client, today, stats, skipDateFilter);
    monthlyMetrics = metrics.filter((row) => !row.isActivityMetric);
    activityMetrics = metrics.filter((row) => row.isActivityMetric);
    if (stats.filteredMissingData > 0) {
      issues.push(`${stats.filteredMissingData} rows filtered (missing required: organization, program, metric, or month/year)`);
    }
  } else {
    issues.push('Could not auto-detect data type from CSV. Please specify whether this is behavioral or metrics data.');
    issues.push(`Detected columns: ${columns.join(', ')}`);
  }

  return {
    behaviors,
    monthlyMetrics,
    activityMetrics,
    stats,
    sheetName: options.fileName,
    detectedType,
    columns,
    issues,
  };
};

