import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';

import { parseWorkbook } from '@/lib/excel/parseWorkbook';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const excelSerialFromDate = (isoDate: string) => {
  const epoch = Date.UTC(1899, 11, 30);
  const target = Date.parse(isoDate);
  return Math.round((target - epoch) / MS_PER_DAY);
};

const buildWorkbookBuffer = (
  behaviorRows: Record<string, unknown>[],
  metricRows: Record<string, unknown>[],
  behaviorSheet = 'Client_Effectiveness',
  metricSheet = 'Client_Goal',
) => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.json_to_sheet(behaviorRows), behaviorSheet);
  utils.book_append_sheet(workbook, utils.json_to_sheet(metricRows), metricSheet);
  return write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

describe('parseWorkbook', () => {
  it('parses rows and separates monthly vs activity metrics (date filter off by default)', () => {
    const buffer = buildWorkbookBuffer(
      [
        {
          'Month_Year': 'Jun-25',
          organization: 'United Health Group',
          Program: 'NPS PROGRAM',
          Behavior: 'Policies, Products and Processes',
          'Sub-Behavior': 'Product Knowledge',
          'Coaching Count': '42',
          'Effectiveness%': '55%',
          Metric: 'Chat NPS',
        },
        {
          'Month_Year': 'Aug-25',
          organization: 'United Health Group',
          Program: 'NPS PROGRAM',
          Behavior: 'Too Recent',
          'Coaching Count': '10',
          Metric: 'Chat NPS',
        },
      ],
      [
        {
          'Month Year': 'Jun-25',
          organization: 'United Health Group',
          Program: 'Performance',
          Metric: 'NPS Score',
          Actual: '78.4',
          Goal: '80',
          PTG: '98%',
        },
        {
          'Month Year': 'Jun-25',
          organization: 'United Health Group',
          Program: 'ACTIVITY METRICS',
          Metric: 'Calls',
          Actual: '1200',
          Goal: '1000',
          PTG: '120',
        },
      ],
    );

    const result = parseWorkbook({
      buffer,
      fileName: 'TTEC_Data.xlsx',
      today: new Date('2025-07-10T00:00:00Z'),
    });

    expect(result.meta.client).toBe('TTEC');
    // Date filter is OFF by default, so both behavior rows should be included
    expect(result.behaviors).toHaveLength(2);
    expect(result.meta.behaviorStats.filteredTooRecent).toBe(0);

    const behavior = result.behaviors[0];
    expect(behavior.organization).toBe('United Health Group');
    // amplifaiOrg maps UHC variations to canonical 'UHC'
    expect(behavior.amplifaiOrg).toBe('UHC');
    expect(behavior.amplifaiMetric).toBe('CHAT NPS');
    expect(behavior.coachingCount).toBe(42);
    expect(behavior.effectivenessPct).toBe(55);

    expect(result.monthlyMetrics).toHaveLength(1);
    expect(result.activityMetrics).toHaveLength(1);

    const monthlyMetric = result.monthlyMetrics[0];
    expect(monthlyMetric.metricName).toBe('NPS Score');
    expect(monthlyMetric.actual).toBeCloseTo(78.4);
    expect(monthlyMetric.ptg).toBe(98);
    expect(monthlyMetric.isActivityMetric).toBe(false);

    const activityMetric = result.activityMetrics[0];
    expect(activityMetric.isActivityMetric).toBe(true);
    expect(activityMetric.program).toBe('ACTIVITY METRICS');
  });

  it('applies date filter when skipDateFilter is false', () => {
    const buffer = buildWorkbookBuffer(
      [
        {
          'Month_Year': 'Jun-25',
          organization: 'Test Org',
          Program: 'Test',
          Behavior: 'Old enough',
          'Coaching Count': '5',
        },
        {
          'Month_Year': 'Aug-25',
          organization: 'Test Org',
          Program: 'Test',
          Behavior: 'Too recent',
          'Coaching Count': '10',
        },
      ],
      [],
    );

    const result = parseWorkbook({
      buffer,
      fileName: 'test.xlsx',
      today: new Date('2025-07-10T00:00:00Z'),
      skipDateFilter: false, // Enable date filtering
    });

    expect(result.behaviors).toHaveLength(1);
    expect(result.meta.behaviorStats.filteredTooRecent).toBe(1);
    expect(result.behaviors[0].behavior).toBe('Old enough');
  });

  it('parses Excel serial dates and respects client override', () => {
    const buffer = buildWorkbookBuffer(
      [
        {
          Month: excelSerialFromDate('2024-12-01T00:00:00Z'),
          Organization: 'Aetna Health',
          Program: 'Coaching',
          Behavior: 'Empathy',
          Metric: 'FCR',
          'Coaching Count': 5,
        },
      ],
      [
        {
          Month: excelSerialFromDate('2024-12-01T00:00:00Z'),
          Organization: 'Aetna Health',
          Program: 'Performance',
          Metric: 'FCR',
          Actual: 85.1,
          Goal: 90,
          PTG: '94.5%',
        },
      ],
      'CustomEffectiveness',
      'CustomGoal',
    );

    const result = parseWorkbook({
      buffer,
      fileName: 'random.xlsx',
      clientOverride: 'Custom Client',
      today: new Date('2025-02-10T00:00:00Z'),
      behaviorSheetHint: 'CustomEffectiveness',
      metricSheetHint: 'CustomGoal',
    });

    expect(result.meta.client).toBe('Custom Client');
    expect(result.behaviors[0].month).toBe('Dec');
    expect(result.behaviors[0].year).toBe(2024);
    expect(result.monthlyMetrics[0].month).toBe('Dec');
    expect(result.meta.sheets.behaviors).toBe('CustomEffectiveness');
    expect(result.meta.sheets.metrics).toBe('CustomGoal');
  });
});

