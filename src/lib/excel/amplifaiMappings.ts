type MappingEntry = {
  canonical: string;
  patterns: (RegExp | string)[];
};

const ORG_MAPPINGS: MappingEntry[] = [
  {
    canonical: 'UHC',
    // All United Health variations → UHC
    patterns: [
      /united\s*health/i,
      /\buhc\b/i,
      /\buhi\b/i,
    ],
  },
  {
    canonical: 'TP',
    // Teleperformance variations → TP
    patterns: [/teleperformance/i, /\btp\b/i],
  },
  // Note: OPTUM UBH stays as OPTUM UBH per existing data
];

const METRIC_MAPPINGS: MappingEntry[] = [
  // ============================================
  // CRITICAL METRICS - Must consolidate properly
  // ============================================
  {
    canonical: 'NPS',
    patterns: [
      // Anything containing "NPS" → NPS (case insensitive)
      /nps/i,
      // Net Promoter variations
      /net\s*promoter/i,
    ],
  },
  {
    canonical: 'RELEASE RATE',
    patterns: [
      // Anything containing "release rate" or just "release"
      /release\s*rate/i,
      /^release$/i,
      // Attrition is often the same concept
      /\battrition\b/i,
    ],
  },
  // ============================================
  // OTHER CONSOLIDATED METRICS
  // ============================================
  {
    canonical: 'AHT',
    patterns: [
      // Exact "AHT" or variations that should collapse to AHT
      /^aht$/i,
      /^aht\s+(after\s*call|calls|chat|combined|ecomm|email|emails|goal|hd|leader|lobs|on\s*call|pams|phone|prep|sales|service|some|spanish|tickets|to\s*goal|voice)$/i,
      /^(ave|average)\s*handle\s*time/i,
      /^(chat|phone|ticket|combined|total|ib|opc|rpc|tx|inbound)\s*aht/i,
      /^handle\s*time\s*\(fa\)$/i,
      /^chat\s*handle\s*time/i,
    ],
  },
  {
    canonical: 'ATTENDANCE',
    patterns: [
      /^attendance/i,
      /^reliability$/i,
      /^schedule\s*reliability/i,
      /^absenteeism/i,
      /^unplanned\s*absenteeism/i,
    ],
  },
  // Other metrics pass through as-is (uppercased)
];

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const toTitleCase = (value: string) =>
  value
    .split(' ')
    .map((segment) =>
      segment.length <= 3 ? segment.toUpperCase() : segment[0].toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join(' ');

const matchAgainstMappings = (
  value: string | null,
  mappings: MappingEntry[],
): string | null => {
  if (!value) return null;
  for (const mapping of mappings) {
    for (const pattern of mapping.patterns) {
      if (typeof pattern === 'string') {
        if (value.toLowerCase().includes(pattern.toLowerCase())) {
          return mapping.canonical;
        }
      } else if (pattern.test(value)) {
        return mapping.canonical;
      }
    }
  }
  return null;
};

const coerceToString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = normalizeWhitespace(value);
    return trimmed.length ? trimmed : null;
  }
  const converted = String(value);
  const trimmed = normalizeWhitespace(converted);
  return trimmed.length ? trimmed : null;
};

export const normalizeOrganization = (value: unknown): string | null => {
  const asString = coerceToString(value);
  return asString ? toTitleCase(asString) : null;
};

export const deriveAmplifaiOrg = (value: unknown): string | null => {
  const normalized = coerceToString(value);
  if (!normalized) return null;
  
  // Check for explicit mappings first (e.g., United Health → UHC)
  const mapped = matchAgainstMappings(normalized, ORG_MAPPINGS);
  if (mapped) return mapped;
  
  // Default: uppercase the org name to match existing convention
  return normalized.toUpperCase();
};

export const normalizeMetricName = (value: unknown): string | null => {
  const asString = coerceToString(value);
  return asString ? asString.toUpperCase() : null;
};

export const deriveAmplifaiMetric = (value: unknown): string | null => {
  const normalized = coerceToString(value);
  if (!normalized) return null;
  
  // Check for explicit mappings first (e.g., "Average Handle Time" → "AHT")
  const mapped = matchAgainstMappings(normalized, METRIC_MAPPINGS);
  if (mapped) return mapped;
  
  // Default: uppercase the metric name to match existing convention
  return normalized.toUpperCase();
};

