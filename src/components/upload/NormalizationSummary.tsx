'use client';

import { usePreviewStore } from '@/store/previewStore';
import type { NormalizationEntry } from '@/lib/excel/types';

const NormalizationItem = ({
  entry,
  type,
}: {
  entry: NormalizationEntry;
  type: 'org' | 'metric' | 'industry';
}) => {
  const colors = {
    org: 'border-cyan-400/40 bg-cyan-400/10',
    metric: 'border-violet-400/40 bg-violet-400/10',
    industry: 'border-amber-400/40 bg-amber-400/10',
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${colors[type]}`}
    >
      <span className="text-white/70">{entry.original}</span>
      <span className="text-white/40">→</span>
      <span className="font-semibold text-white">{entry.normalized}</span>
      {entry.count > 1 && (
        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
          {entry.count}×
        </span>
      )}
    </div>
  );
};

const SectionHeader = ({
  title,
  count,
  color,
}: {
  title: string;
  count: number;
  color: 'cyan' | 'violet' | 'amber';
}) => {
  const colorClasses = {
    cyan: 'text-cyan-300',
    violet: 'text-violet-300',
    amber: 'text-amber-300',
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-semibold uppercase tracking-wide ${colorClasses[color]}`}>
        {title}
      </span>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
        {count}
      </span>
    </div>
  );
};

export const NormalizationSummary = () => {
  const preview = usePreviewStore((state) => state.preview);

  if (!preview?.normalizations) return null;

  const { organizations, metrics, industries } = preview.normalizations;
  const hasAnyNormalizations =
    organizations.length > 0 || metrics.length > 0 || industries.length > 0;

  if (!hasAnyNormalizations) return null;

  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/20">
          <svg
            className="h-4 w-4 text-emerald-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <span className="text-sm font-semibold text-emerald-200">
          Normalizations Applied
        </span>
      </div>

      <p className="mb-4 text-xs text-white/60">
        The following values were standardized for consistency. Original values are preserved in the raw data.
      </p>

      <div className="space-y-4">
        {organizations.length > 0 && (
          <div>
            <SectionHeader title="Organizations" count={organizations.length} color="cyan" />
            <div className="mt-2 flex flex-wrap gap-2">
              {organizations.slice(0, 5).map((entry) => (
                <NormalizationItem
                  key={`${entry.original}-${entry.normalized}`}
                  entry={entry}
                  type="org"
                />
              ))}
              {organizations.length > 5 && (
                <span className="self-center text-xs text-white/50">
                  +{organizations.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {metrics.length > 0 && (
          <div>
            <SectionHeader title="Metrics" count={metrics.length} color="violet" />
            <div className="mt-2 flex flex-wrap gap-2">
              {metrics.slice(0, 5).map((entry) => (
                <NormalizationItem
                  key={`${entry.original}-${entry.normalized}`}
                  entry={entry}
                  type="metric"
                />
              ))}
              {metrics.length > 5 && (
                <span className="self-center text-xs text-white/50">
                  +{metrics.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {industries.length > 0 && (
          <div>
            <SectionHeader title="Industry Classification" count={industries.length} color="amber" />
            <div className="mt-2 flex flex-wrap gap-2">
              {industries.slice(0, 5).map((entry) => (
                <NormalizationItem
                  key={`${entry.original}-${entry.normalized}`}
                  entry={entry}
                  type="industry"
                />
              ))}
              {industries.length > 5 && (
                <span className="self-center text-xs text-white/50">
                  +{industries.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
