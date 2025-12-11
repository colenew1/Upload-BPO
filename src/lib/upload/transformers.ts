import type {
  ParsedBehaviorRow,
  ParsedMetricRow,
} from '@/lib/excel/types';
import type {
  ActivityMetricInsert,
  BehavioralCoachingInsert,
  MonthlyMetricInsert,
} from '@/types/database';

export const toBehaviorInsert = (
  row: ParsedBehaviorRow,
): BehavioralCoachingInsert => ({
  client: row.client,
  organization: row.organization,
  program: row.program,
  month: row.month,
  year: row.year,
  metric: row.metric,
  behavior: row.behavior,
  sub_behavior: row.subBehavior,
  coaching_count: row.coachingCount,
  effectiveness_pct: row.effectivenessPct,
  amplifai_org: row.amplifaiOrg,
  amplifai_metric: row.amplifaiMetric,
  amplifai_industry: row.amplifaiIndustry,
});

export const toMonthlyMetricInsert = (
  row: ParsedMetricRow,
): MonthlyMetricInsert => ({
  client: row.client,
  organization: row.organization,
  program: row.program,
  metric_name: row.metricName,
  month: row.month,
  year: row.year,
  actual: row.actual,
  goal: row.goal,
  ptg: row.ptg,
  amplifai_org: row.amplifaiOrg,
  amplifai_metric: row.amplifaiMetric,
  amplifai_industry: row.amplifaiIndustry,
});

export const toActivityMetricInsert = (
  row: ParsedMetricRow,
): ActivityMetricInsert => ({
  client: row.client,
  organization: row.organization,
  program: row.program,
  metric_name: row.metricName,
  month: row.month,
  year: row.year,
  actual: row.actual,
  goal: row.goal,
  ptg: row.ptg,
  amplifai_org: row.amplifaiOrg,
  amplifai_metric: row.amplifaiMetric,
  amplifai_industry: row.amplifaiIndustry,
});

