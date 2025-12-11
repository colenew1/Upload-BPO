export type MonthYear = {
  month: string | null;
  year: number | null;
};

export type DatasetStats = {
  totalRows: number;
  acceptedRows: number;
  filteredMissingData: number;
  filteredTooRecent: number;
};

export type ParsedRowBase = {
  id: string;
  client: string;
  month: string;
  year: number;
  amplifaiOrg: string | null;
  amplifaiMetric: string | null;
  amplifaiIndustry: string | null;
  sourceRowNumber: number;
  sourceSheet: string;
  raw: Record<string, unknown>;
};

export type ParsedBehaviorRow = ParsedRowBase & {
  organization: string | null;
  program: string | null;
  metric: string | null;
  behavior: string | null;
  subBehavior: string | null;
  coachingCount: number | null;
  effectivenessPct: number | null;
};

export type ParsedMetricRow = ParsedRowBase & {
  organization: string | null;
  program: string | null;
  metricName: string | null;
  actual: number | null;
  goal: number | null;
  ptg: number | null;
  isActivityMetric: boolean;
};

export type ParseWorkbookMeta = {
  workbookName: string;
  client: string;
  generatedAt: string;
  sheets: {
    behaviors: string | null;
    metrics: string | null;
  };
  behaviorStats: DatasetStats;
  metricStats: DatasetStats;
};

export type ParseWorkbookResult = {
  behaviors: ParsedBehaviorRow[];
  monthlyMetrics: ParsedMetricRow[];
  activityMetrics: ParsedMetricRow[];
  meta: ParseWorkbookMeta;
  issues: string[];
};

/** Result for single-sheet parsing */
export type ParseSingleSheetResult = {
  behaviors: ParsedBehaviorRow[];
  monthlyMetrics: ParsedMetricRow[];
  activityMetrics: ParsedMetricRow[];
  stats: DatasetStats;
  sheetName: string;
  detectedType: 'behaviors' | 'metrics' | 'unknown';
  columns: string[];
  issues: string[];
};

/** Upload mode for the UI */
export type UploadMode = 'combined' | 'behaviors' | 'metrics';

/** Tracks a single normalization that was applied */
export type NormalizationEntry = {
  original: string;
  normalized: string;
  count: number;
};

/** Tracks an organization with no industry mapping */
export type UnmatchedOrgEntry = {
  orgName: string;
  amplifaiOrg: string | null;
  count: number;
};

/** Tracks a metric with no standardized mapping */
export type UnmatchedMetricEntry = {
  metricName: string;
  count: number;
};

/** Summary of all normalizations applied during parsing */
export type NormalizationSummary = {
  organizations: NormalizationEntry[];
  metrics: NormalizationEntry[];
  industries: NormalizationEntry[];
  unmatchedOrgs: UnmatchedOrgEntry[];
  unmatchedMetrics: UnmatchedMetricEntry[];
};

