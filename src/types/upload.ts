import type {
  ParseWorkbookMeta,
  ParsedBehaviorRow,
  ParsedMetricRow,
} from '@/lib/excel/types';

export type PreviewDataset = {
  behaviors: Array<Omit<ParsedBehaviorRow, 'raw'>>;
  monthlyMetrics: Array<Omit<ParsedMetricRow, 'raw'>>;
  activityMetrics: Array<Omit<ParsedMetricRow, 'raw'>>;
};

export type DatasetKey = keyof PreviewDataset;

export type DuplicateCounts = {
  behaviors: number;
  monthlyMetrics: number;
  activityMetrics: number;
};

export type PreviewResponse = {
  previewId: string;
  checksum: string;
  expiresAt: number;
  ttlSeconds: number;
  meta: ParseWorkbookMeta;
  issues: string[];
  duplicates?: DuplicateCounts;
  file: {
    name: string;
    size: number;
    sizeMb: number;
  };
  data: PreviewDataset;
};

export type CommitResponse = {
  previewId: string;
  inserted: {
    behaviors: number;
    monthlyMetrics: number;
    activityMetrics: number;
  };
  tables: Array<{ table: string; count: number }>;
  meta: ParseWorkbookMeta;
};

