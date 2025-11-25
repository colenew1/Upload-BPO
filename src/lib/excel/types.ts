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

