'use client';

import { useMemo } from 'react';

import {
  getDatasetKeys,
  usePreviewStore,
} from '@/store/previewStore';
import type { DatasetKey } from '@/types/upload';

const statItem = (
  label: string,
  value: string | number | null | undefined,
  testId?: string,
) => (
  <div
    className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
    data-testid={testId}
  >
    <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
    <p className="text-lg font-semibold text-white">
      {value ?? '—'}
    </p>
  </div>
);

export const SelectionSummary = () => {
  const preview = usePreviewStore((state) => state.preview);
  const selection = usePreviewStore((state) => state.selection);
  const status = usePreviewStore((state) => state.status);
  const message = usePreviewStore((state) => state.message);
  const lastCommit = usePreviewStore((state) => state.lastCommit);
  const startCommit = usePreviewStore((state) => state.startCommit);
  const finishCommit = usePreviewStore((state) => state.finishCommit);
  const setError = usePreviewStore((state) => state.setError);
  const reset = usePreviewStore((state) => state.reset);

  const datasetKeys = getDatasetKeys();

  const counts = useMemo(() => {
    const totals: Record<DatasetKey, { selected: number; total: number }> = {
      behaviors: { selected: 0, total: 0 },
      monthlyMetrics: { selected: 0, total: 0 },
      activityMetrics: { selected: 0, total: 0 },
    };
    if (!preview) return totals;
    datasetKeys.forEach((key) => {
      totals[key] = {
        selected: selection[key].size,
        total: preview.data[key].length,
      };
    });
    return totals;
  }, [datasetKeys, preview, selection]);

  const totalSelected = datasetKeys.reduce(
    (sum, key) => sum + counts[key].selected,
    0,
  );

  const canCommit =
    preview &&
    totalSelected > 0 &&
    (status === 'ready' || status === 'error');

  const handleCommit = async () => {
    if (!preview || totalSelected === 0) {
      setError('Select at least one row before committing.');
      return;
    }

    startCommit();
    const payload = {
      previewId: preview.previewId,
      checksum: preview.checksum,
      include: {
        behaviors: Array.from(selection.behaviors),
        monthlyMetrics: Array.from(selection.monthlyMetrics),
        activityMetrics: Array.from(selection.activityMetrics),
      },
    };

    try {
      const response = await fetch('/api/upload/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Supabase insert failed');
      }

      finishCommit(data);
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error ? error.message : 'Commit request failed.',
      );
    }
  };

  const handleDownload = () => {
    if (!preview) return;
    const blob = new Blob([JSON.stringify(preview, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${preview.meta.client
      .toLowerCase()
      .replace(/\s+/g, '-')}-preview.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950/80 p-6 shadow-2xl shadow-black/50">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-300">
            Preview & Commit
          </p>
          <h2 className="text-2xl font-semibold text-white">
            {preview ? preview.meta.client : 'Upload a workbook to begin'}
          </h2>
          {preview && (
            <p className="text-sm text-white/60">
              {preview.meta.workbookName ?? preview.meta.client} ·{' '}
              Expires in ~{Math.max(preview.ttlSeconds, 0)}s
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:border-white/60 hover:text-white"
            onClick={handleDownload}
            disabled={!preview}
          >
            Download JSON
          </button>
          <button
            type="button"
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:border-white/60 hover:text-white"
            onClick={reset}
          >
            Reset
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            status === 'error'
              ? 'border-rose-400/60 bg-rose-400/10 text-rose-100'
              : 'border-emerald-400/60 bg-emerald-400/10 text-emerald-100'
          }`}
        >
          {message}
        </div>
      )}

      {preview && preview.issues.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/50 bg-amber-400/10 p-4 text-sm text-amber-50">
          <p className="font-medium">Warnings:</p>
          <ul className="mt-2 space-y-1">
            {preview.issues.map((issue) => (
              <li key={issue} className="list-disc pl-4">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {statItem('Behavior rows kept', `${counts.behaviors.selected}/${counts.behaviors.total}`, 'stat-behaviors')}
            {statItem('Monthly rows kept', `${counts.monthlyMetrics.selected}/${counts.monthlyMetrics.total}`, 'stat-monthly')}
            {statItem('Activity rows kept', `${counts.activityMetrics.selected}/${counts.activityMetrics.total}`, 'stat-activity')}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {statItem(
              'Behavior rows filtered out',
              preview.meta.behaviorStats.filteredMissingData +
                preview.meta.behaviorStats.filteredTooRecent,
            )}
            {statItem(
              'Metric rows filtered out',
              preview.meta.metricStats.filteredMissingData +
                preview.meta.metricStats.filteredTooRecent,
            )}
          </div>

          {preview.duplicates && (preview.duplicates.behaviors > 0 || preview.duplicates.monthlyMetrics > 0 || preview.duplicates.activityMetrics > 0) && (
            <div className="mt-4 rounded-xl border border-blue-400/50 bg-blue-400/10 p-4 text-sm text-blue-50">
              <p className="font-medium">Duplicates excluded (already in database):</p>
              <div className="mt-2 flex flex-wrap gap-4">
                {preview.duplicates.behaviors > 0 && (
                  <span>{preview.duplicates.behaviors} behavioral</span>
                )}
                {preview.duplicates.monthlyMetrics > 0 && (
                  <span>{preview.duplicates.monthlyMetrics} monthly metrics</span>
                )}
                {preview.duplicates.activityMetrics > 0 && (
                  <span>{preview.duplicates.activityMetrics} activity metrics</span>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="flex-1 rounded-xl bg-emerald-500 px-6 py-3 text-center text-base font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50 disabled:text-emerald-200"
              onClick={handleCommit}
              disabled={!canCommit || status === 'committing'}
              data-testid="commit-button"
            >
              {status === 'committing'
                ? 'Committing...'
                : `Insert ${totalSelected.toLocaleString()} row(s)`}
            </button>
            {lastCommit && (
              <span className="text-sm text-white/60">
                Last commit inserted {lastCommit.inserted.behaviors} coaching,
                {lastCommit.inserted.monthlyMetrics} monthly, and{' '}
                {lastCommit.inserted.activityMetrics} activity rows.
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
};

