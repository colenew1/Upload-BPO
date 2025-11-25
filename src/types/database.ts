export type Nullable<T> = T | null;

type Timestamp = string;

export type BehavioralCoachingRow = {
  id: string;
  created_at: Timestamp;
  client: string;
  organization: string | null;
  program: string | null;
  month: string;
  year: number;
  metric: string | null;
  behavior: string | null;
  sub_behavior: string | null;
  coaching_count: number | null;
  effectiveness_pct: number | null;
  amplifai_org: string | null;
  amplifai_metric: string | null;
};

export type BehavioralCoachingInsert = Omit<
  BehavioralCoachingRow,
  'id' | 'created_at'
> & {
  id?: string;
  created_at?: Timestamp;
};

export type MonthlyMetricRow = {
  id: string;
  created_at: Timestamp;
  client: string;
  organization: string | null;
  program: string | null;
  metric_name: string | null;
  month: string;
  year: number;
  actual: number | null;
  goal: number | null;
  ptg: number | null;
  amplifai_org: string | null;
  amplifai_metric: string | null;
};

export type MonthlyMetricInsert = Omit<
  MonthlyMetricRow,
  'id' | 'created_at'
> & {
  id?: string;
  created_at?: Timestamp;
};

export type ActivityMetricRow = MonthlyMetricRow;
export type ActivityMetricInsert = MonthlyMetricInsert;

export type Database = {
  public: {
    Tables: {
      behavioral_coaching: {
        Row: BehavioralCoachingRow;
        Insert: BehavioralCoachingInsert;
        Update: Partial<BehavioralCoachingInsert>;
      };
      monthly_metrics: {
        Row: MonthlyMetricRow;
        Insert: MonthlyMetricInsert;
        Update: Partial<MonthlyMetricInsert>;
      };
      activity_metrics: {
        Row: ActivityMetricRow;
        Insert: ActivityMetricInsert;
        Update: Partial<ActivityMetricInsert>;
      };
    };
    Functions: Record<string, never>;
  };
};

