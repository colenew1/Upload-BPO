'use client';

import type { ReactNode } from 'react';

import { usePreviewStore } from '@/store/previewStore';
import type { DatasetKey, PreviewResponse } from '@/types/upload';

type ColumnConfig<Row> = {
  header: string;
  accessor: (row: Row) => ReactNode;
  className?: string;
};

type DatasetConfig<Row> = {
  title: string;
  description: string;
  columns: ColumnConfig<Row>[];
};

type BehaviorRow = PreviewResponse['data']['behaviors'][number];
type MetricRow = PreviewResponse['data']['monthlyMetrics'][number];

export const DATASET_CONFIG: Record<
  DatasetKey,
  DatasetConfig<BehaviorRow | MetricRow>
> = {
  behaviors: {
    title: 'Behavioral Coaching',
    description:
      'Each row represents a coaching record that passed validation.',
    columns: [
      { header: 'Organization', accessor: (row) => row.organization ?? '—' },
      { header: 'Amplifai Org', accessor: (row) => row.amplifaiOrg ?? '—', className: 'text-emerald-300 font-medium' },
      { header: 'Program', accessor: (row) => row.program ?? '—' },
      { header: 'Metric', accessor: (row) => ('metric' in row ? row.metric : null) ?? '—' },
      { header: 'Amplifai Metric', accessor: (row) => row.amplifaiMetric ?? '—', className: 'text-emerald-300 font-medium' },
      { header: 'Behavior', accessor: (row) => ('behavior' in row ? row.behavior : null) ?? '—' },
      { header: 'Sub-Behavior', accessor: (row) => ('subBehavior' in row ? row.subBehavior : null) ?? '—' },
      {
        header: 'Month',
        accessor: (row) => `${row.month} ${row.year}`,
      },
      {
        header: 'Coaching Count',
        accessor: (row) =>
          'coachingCount' in row && row.coachingCount !== null
            ? row.coachingCount.toLocaleString()
            : '—',
        className: 'text-right',
      },
      {
        header: 'Effectiveness %',
        accessor: (row) =>
          'effectivenessPct' in row && row.effectivenessPct !== null
            ? `${row.effectivenessPct}%`
            : '—',
        className: 'text-right',
      },
    ],
  },
  monthlyMetrics: {
    title: 'Monthly Metrics',
    description: 'Standard KPIs excluding the "Activity Metrics" program.',
    columns: [
      { header: 'Organization', accessor: (row) => row.organization ?? '—' },
      { header: 'Amplifai Org', accessor: (row) => row.amplifaiOrg ?? '—', className: 'text-emerald-300 font-medium' },
      { header: 'Program', accessor: (row) => row.program ?? '—' },
      { header: 'Metric Name', accessor: (row) => ('metricName' in row ? row.metricName : null) ?? '—' },
      { header: 'Amplifai Metric', accessor: (row) => row.amplifaiMetric ?? '—', className: 'text-emerald-300 font-medium' },
      {
        header: 'Month',
        accessor: (row) => `${row.month} ${row.year}`,
      },
      {
        header: 'Actual',
        accessor: (row) =>
          'actual' in row && row.actual !== null
            ? row.actual.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : '—',
        className: 'text-right',
      },
      {
        header: 'Goal',
        accessor: (row) =>
          'goal' in row && row.goal !== null
            ? row.goal.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : '—',
        className: 'text-right',
      },
      {
        header: 'PTG',
        accessor: (row) =>
          'ptg' in row && row.ptg !== null ? `${row.ptg}%` : '—',
        className: 'text-right',
      },
    ],
  },
  activityMetrics: {
    title: 'Activity Metrics',
    description:
      'Rows where Program = ACTIVITY METRICS, inserted into their own table.',
    columns: [
      { header: 'Organization', accessor: (row) => row.organization ?? '—' },
      { header: 'Amplifai Org', accessor: (row) => row.amplifaiOrg ?? '—', className: 'text-emerald-300 font-medium' },
      { header: 'Program', accessor: (row) => row.program ?? '—' },
      { header: 'Metric Name', accessor: (row) => ('metricName' in row ? row.metricName : null) ?? '—' },
      { header: 'Amplifai Metric', accessor: (row) => row.amplifaiMetric ?? '—', className: 'text-emerald-300 font-medium' },
      {
        header: 'Month',
        accessor: (row) => `${row.month} ${row.year}`,
      },
      {
        header: 'Actual',
        accessor: (row) =>
          'actual' in row && row.actual !== null
            ? row.actual.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : '—',
        className: 'text-right',
      },
      {
        header: 'Goal',
        accessor: (row) =>
          'goal' in row && row.goal !== null
            ? row.goal.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : '—',
        className: 'text-right',
      },
      {
        header: 'PTG',
        accessor: (row) =>
          'ptg' in row && row.ptg !== null ? `${row.ptg}%` : '—',
        className: 'text-right',
      },
    ],
  },
};

type PreviewTableProps = {
  dataset: DatasetKey;
};

const buttonClasses =
  'rounded-md border px-3 py-1 text-sm font-medium transition hover:border-white hover:text-white';

export const PreviewTable = ({ dataset }: PreviewTableProps) => {
  const preview = usePreviewStore((state) => state.preview);
  const selection = usePreviewStore((state) => state.selection);
  const toggleRow = usePreviewStore((state) => state.toggleRow);
  const setDatasetSelection = usePreviewStore(
    (state) => state.setDatasetSelection,
  );

  const rows = preview?.data[dataset] ?? [];
  const selectedCount = selection[dataset].size;
  const config = DATASET_CONFIG[dataset];

  return (
    <section
      className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/40 backdrop-blur"
      data-testid={`table-${dataset}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {config.title}
            {preview && (
              <span className="ml-2 text-sm text-white/50">
                ({selectedCount} of {rows.length} selected)
              </span>
            )}
          </h3>
          <p className="text-sm text-white/60">{config.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClasses}
            onClick={() => setDatasetSelection(dataset, 'all')}
            disabled={!preview || rows.length === 0}
            data-testid={`select-all-${dataset}`}
          >
            Select all
          </button>
          <button
            type="button"
            className={buttonClasses}
            onClick={() => setDatasetSelection(dataset, 'none')}
            disabled={!preview || rows.length === 0}
            data-testid={`clear-${dataset}`}
          >
            Clear
          </button>
        </div>
      </div>

      {!preview && (
        <p className="rounded-lg border border-dashed border-white/20 bg-slate-950/40 p-6 text-center text-sm text-white/60">
          Upload a workbook to see parsed rows here.
        </p>
      )}

      {preview && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-amber-400/40 bg-amber-400/10 p-6 text-center text-sm text-amber-100">
          No rows matched the current filters for this dataset.
        </p>
      )}

      {preview && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[600px] text-left text-sm text-white/80">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/60">
              <tr>
                <th className="px-3 py-2">
                  <span className="sr-only">Toggle row</span>
                </th>
                {config.columns.map((column) => (
                  <th key={column.header} className={`px-3 py-2 ${column.className ?? ''}`}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-white/5 hover:bg-white/5"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-400"
                      checked={selection[dataset].has(row.id)}
                      onChange={() => toggleRow(dataset, row.id)}
                      data-testid={`row-toggle-${dataset}`}
                    />
                  </td>
                  {config.columns.map((column) => (
                    <td key={column.header} className={`px-3 py-2 ${column.className ?? ''}`}>
                      {column.accessor(row as BehaviorRow & MetricRow)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

