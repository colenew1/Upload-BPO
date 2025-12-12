'use client';

import { useCallback, useEffect, useState } from 'react';

type TableStats = {
  table: string;
  totalRows: number;
  lastUpdated: string | null;
  missingIndustry: number;
  missingOrg: number;
  missingMetric: number;
};

type UnmatchedOrg = {
  organization: string;
  amplifai_org: string | null;
  count: number;
  tables: string[];
};

type UnmatchedMetric = {
  metric_name: string;
  count: number;
  tables: string[];
};

type PotentialDuplicate = {
  organization: string;
  similarTo: string;
  similarity: number;
  count: number;
};

type DataQualityIssue = {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  table: string;
  count: number;
  suggestion?: string;
};

type WonkyNumber = {
  id: string;
  source_table: string;
  source_id: string | null;
  client: string;
  organization: string | null;
  metric_name: string | null;
  month: string;
  year: number;
  field_name: string;
  original_value: number | null;
  issue_type: string;
  notes: string | null;
  resolved: boolean;
  created_at: string;
};

type HealthReport = {
  generatedAt: string;
  summary: {
    totalRows: number;
    tablesHealthy: boolean;
    issueCount: number;
    unmatchedOrgCount: number;
    unmatchedMetricCount: number;
    industryAliasCount: number;
    metricAliasCount: number;
    wonkyNumberCount: number;
  };
  tables: TableStats[];
  unmatchedOrgs: UnmatchedOrg[];
  unmatchedMetrics: UnmatchedMetric[];
  potentialDuplicates: PotentialDuplicate[];
  qualityIssues: DataQualityIssue[];
  wonkyNumbers: WonkyNumber[];
};

const COMMON_INDUSTRIES = [
  'HEALTHCARE',
  'TELECOMMUNICATIONS',
  'RETAIL',
  'FINANCIAL SERVICES',
  'TECHNOLOGY',
  'TRAVEL & HOSPITALITY',
  'FOOD & BEVERAGE',
  'AUTOMOTIVE',
  'UTILITIES',
  'ENTERTAINMENT',
  'INSURANCE',
  'ENERGY',
  'OTHER',
];

const COMMON_METRICS = [
  'AHT',
  'NPS',
  'CSAT',
  'FCR',
  'ATTENDANCE',
  'ATTRITION',
  'RELEASE RATE',
  'QA SCORE',
  'SALES CONVERSION',
  'HOLD TIME',
  'TRANSFER RATE',
  'SCHEDULE ADHERENCE',
  'OCCUPANCY',
  'SERVICE LEVEL',
  'ABANDONMENT RATE',
];

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'wonky', label: 'Wonky Numbers' },
  { id: 'unmatched', label: 'Unmatched Industries' },
  { id: 'unmatched-metrics', label: 'Unmatched Metrics' },
  { id: 'duplicates', label: 'Potential Duplicates' },
  { id: 'issues', label: 'Quality Issues' },
] as const;

const ISSUE_TYPE_LABELS: Record<string, string> = {
  negative: 'Negative',
  zero: 'Zero',
  too_large: 'Too Large',
  percentage_over_100: 'Over 100%',
  suspicious_outlier: 'Outlier',
};

const ISSUE_TYPE_COLORS: Record<string, string> = {
  negative: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
  zero: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  too_large: 'bg-purple-500/20 text-purple-200 border-purple-500/40',
  percentage_over_100: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  suspicious_outlier: 'bg-blue-500/20 text-blue-200 border-blue-500/40',
};

const TABLE_LABELS: Record<string, string> = {
  behavioral_coaching: 'Behaviors',
  monthly_metrics: 'Monthly',
  activity_metrics: 'Activity',
};

type TabId = (typeof tabs)[number]['id'];

export default function HealthPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [savingAlias, setSavingAlias] = useState<string | null>(null);
  const [savingMetricAlias, setSavingMetricAlias] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [resolvingWonky, setResolvingWonky] = useState<string | null>(null);
  const [selectedWonky, setSelectedWonky] = useState<Set<string>>(new Set());
  const [resolvingMultiple, setResolvingMultiple] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/database-health');
      if (!response.ok) throw new Error('Failed to fetch health report');
      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const response = await fetch('/api/database-health/backfill', {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Backfill failed');
      setBackfillResult(data.message);
      await fetchReport();
    } catch (err) {
      setBackfillResult(err instanceof Error ? err.message : 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  const handleAssignIndustry = async (org: UnmatchedOrg, industry: string) => {
    setSavingAlias(org.organization);
    try {
      const response = await fetch('/api/industry-aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: org.organization,
          canonical_industry: industry,
          match_type: 'contains',
          notes: `Added from health dashboard for "${org.organization}"`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[handleAssignIndustry] API error:', data);
        throw new Error(data.details || data.error || 'Failed to save alias');
      }

      console.log('[handleAssignIndustry] Success:', data);

      // Refresh report
      await fetchReport();
    } catch (err) {
      console.error('[handleAssignIndustry] Error:', err);
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingAlias(null);
    }
  };

  const handleAssignMetric = async (metric: UnmatchedMetric, canonicalName: string) => {
    setSavingMetricAlias(metric.metric_name);
    try {
      const response = await fetch('/api/metric-aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: metric.metric_name,
          canonical_name: canonicalName,
          match_type: 'contains',
          notes: `Added from health dashboard for "${metric.metric_name}"`,
        }),
      });

      if (!response.ok) throw new Error('Failed to save metric alias');

      // Refresh report
      await fetchReport();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingMetricAlias(null);
    }
  };

  const handleResolveWonky = async (wonky: WonkyNumber) => {
    if (!wonky.source_id) {
      alert('Cannot resolve: missing source_id');
      return;
    }

    if (!confirm(`Set ${wonky.field_name} to NULL for this record?\n\nThis will permanently change the value from ${wonky.original_value} to null.`)) {
      return;
    }

    setResolvingWonky(wonky.id);
    try {
      const response = await fetch('/api/wonky-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_table: wonky.source_table,
          source_id: wonky.source_id,
          field_name: wonky.field_name,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to resolve');
      }

      // Refresh report to remove the resolved item
      await fetchReport();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resolve');
    } finally {
      setResolvingWonky(null);
    }
  };

  const handleToggleWonkySelect = (id: string) => {
    setSelectedWonky((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllWonky = () => {
    if (!report) return;
    const allIds = report.wonkyNumbers.filter((w) => w.source_id).map((w) => w.id);
    if (selectedWonky.size === allIds.length) {
      setSelectedWonky(new Set());
    } else {
      setSelectedWonky(new Set(allIds));
    }
  };

  const handleResolveSelected = async () => {
    if (!report || selectedWonky.size === 0) return;

    const selectedItems = report.wonkyNumbers.filter((w) => selectedWonky.has(w.id) && w.source_id);
    if (selectedItems.length === 0) return;

    if (!confirm(`Set ${selectedItems.length} value(s) to NULL?\n\nThis will permanently change these values.`)) {
      return;
    }

    setResolvingMultiple(true);
    let successCount = 0;
    let failCount = 0;

    for (const wonky of selectedItems) {
      try {
        const response = await fetch('/api/wonky-numbers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_table: wonky.source_table,
            source_id: wonky.source_id,
            field_name: wonky.field_name,
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setSelectedWonky(new Set());
    setResolvingMultiple(false);
    await fetchReport();

    if (failCount > 0) {
      alert(`Resolved ${successCount} items. ${failCount} failed.`);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTableName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const severityColors = {
    low: 'border-blue-400/50 bg-blue-400/10 text-blue-100',
    medium: 'border-amber-400/50 bg-amber-400/10 text-amber-100',
    high: 'border-rose-400/50 bg-rose-400/10 text-rose-100',
  };

  return (
    <main className="min-h-screen bg-slate-950 pb-16 pt-14 text-white">
      <div className="mx-auto max-w-6xl px-4">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.4em] text-emerald-300">
                Amplifai Upload Console
              </p>
              <h1 className="mt-2 text-3xl font-semibold">Database Health</h1>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/upload"
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/70 hover:border-white/40 hover:text-white"
              >
                Back to Upload
              </a>
              <button
                onClick={fetchReport}
                disabled={loading}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-400/50 bg-rose-400/10 p-4 text-rose-100">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        {report && (
          <div className="mb-8 grid gap-4 md:grid-cols-4 lg:grid-cols-7">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Total Rows</p>
              <p className="mt-1 text-2xl font-bold">{report.summary.totalRows.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Wonky Numbers</p>
              <p className={`mt-1 text-2xl font-bold ${report.summary.wonkyNumberCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {report.summary.wonkyNumberCount}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Industry Aliases</p>
              <p className="mt-1 text-2xl font-bold">{report.summary.industryAliasCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Metric Aliases</p>
              <p className="mt-1 text-2xl font-bold">{report.summary.metricAliasCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Unmatched Orgs</p>
              <p className={`mt-1 text-2xl font-bold ${report.summary.unmatchedOrgCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {report.summary.unmatchedOrgCount}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Unmatched Metrics</p>
              <p className={`mt-1 text-2xl font-bold ${report.summary.unmatchedMetricCount > 0 ? 'text-violet-400' : 'text-emerald-400'}`}>
                {report.summary.unmatchedMetricCount}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Quality Issues</p>
              <p className={`mt-1 text-2xl font-bold ${report.summary.issueCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {report.summary.issueCount}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2 rounded-xl bg-white/5 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-emerald-500 text-emerald-950'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.id === 'wonky' && report && report.wonkyNumbers.length > 0 && (
                <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-xs text-rose-950">
                  {report.wonkyNumbers.length}
                </span>
              )}
              {tab.id === 'unmatched' && report && report.unmatchedOrgs.length > 0 && (
                <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-amber-950">
                  {report.unmatchedOrgs.length}
                </span>
              )}
              {tab.id === 'unmatched-metrics' && report && report.unmatchedMetrics.length > 0 && (
                <span className="ml-2 rounded-full bg-violet-500 px-2 py-0.5 text-xs text-violet-950">
                  {report.unmatchedMetrics.length}
                </span>
              )}
              {tab.id === 'issues' && report && report.qualityIssues.length > 0 && (
                <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-amber-950">
                  {report.qualityIssues.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950/80 p-6">
          {loading && !report ? (
            <div className="py-12 text-center text-white/50">Loading health report...</div>
          ) : !report ? (
            <div className="py-12 text-center text-white/50">Failed to load report</div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Table Statistics</h2>
                    <div className="flex items-center gap-3">
                      {backfillResult && (
                        <span className="text-sm text-emerald-400">{backfillResult}</span>
                      )}
                      <button
                        onClick={handleBackfill}
                        disabled={backfilling}
                        className="rounded-lg border border-violet-400/50 bg-violet-400/10 px-4 py-2 text-sm font-medium text-violet-200 hover:bg-violet-400/20 disabled:opacity-50"
                      >
                        {backfilling ? 'Backfilling...' : 'Backfill Industries'}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-white/50">
                          <th className="pb-3 font-medium">Table</th>
                          <th className="pb-3 font-medium">Total Rows</th>
                          <th className="pb-3 font-medium">Last Updated</th>
                          <th className="pb-3 font-medium">Missing Industry</th>
                          <th className="pb-3 font-medium">Missing Org</th>
                          <th className="pb-3 font-medium">Missing Metric</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.tables.map((table) => (
                          <tr key={table.table} className="border-b border-white/5">
                            <td className="py-3 font-medium">{formatTableName(table.table)}</td>
                            <td className="py-3">{table.totalRows.toLocaleString()}</td>
                            <td className="py-3 text-white/70">{formatDate(table.lastUpdated)}</td>
                            <td className={`py-3 ${table.missingIndustry > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {table.missingIndustry.toLocaleString()}
                            </td>
                            <td className={`py-3 ${table.missingOrg > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {table.missingOrg.toLocaleString()}
                            </td>
                            <td className={`py-3 ${table.missingMetric > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {table.missingMetric.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-xs text-white/40">
                    Last generated: {formatDate(report.generatedAt)}
                  </p>
                </div>
              )}

              {/* Wonky Numbers Tab */}
              {activeTab === 'wonky' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Suspicious Values Detected</h2>
                      <p className="text-sm text-white/50">
                        Review negative numbers, percentages over 100%, and unusually large values
                      </p>
                    </div>
                    {report.wonkyNumbers.length > 0 && (
                      <button
                        type="button"
                        onClick={handleResolveSelected}
                        disabled={selectedWonky.size === 0 || resolvingMultiple}
                        className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {resolvingMultiple
                          ? `Resolving ${selectedWonky.size}...`
                          : `Set Selected to Null (${selectedWonky.size})`}
                      </button>
                    )}
                  </div>

                  {report.wonkyNumbers.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20">
                        <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-white/70">No wonky numbers detected! Your data looks clean.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-left text-white/50">
                            <th className="pb-3 pr-4 font-medium">
                              <input
                                type="checkbox"
                                checked={selectedWonky.size === report.wonkyNumbers.filter((w) => w.source_id).length && selectedWonky.size > 0}
                                onChange={handleSelectAllWonky}
                                className="h-4 w-4 rounded border-white/30 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                              />
                            </th>
                            <th className="pb-3 pr-4 font-medium">Source</th>
                            <th className="pb-3 pr-4 font-medium">Client</th>
                            <th className="pb-3 pr-4 font-medium">Organization</th>
                            <th className="pb-3 pr-4 font-medium">Metric</th>
                            <th className="pb-3 pr-4 font-medium">Period</th>
                            <th className="pb-3 pr-4 font-medium">Field</th>
                            <th className="pb-3 pr-4 font-medium">Value</th>
                            <th className="pb-3 pr-4 font-medium">Issue</th>
                            <th className="pb-3 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.wonkyNumbers.map((row) => (
                            <tr key={row.id} className={`border-b border-white/5 ${selectedWonky.has(row.id) ? 'bg-emerald-500/10' : ''}`}>
                              <td className="py-3 pr-4">
                                <input
                                  type="checkbox"
                                  checked={selectedWonky.has(row.id)}
                                  onChange={() => handleToggleWonkySelect(row.id)}
                                  disabled={!row.source_id}
                                  className="h-4 w-4 rounded border-white/30 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 disabled:opacity-30"
                                />
                              </td>
                              <td className="py-3 pr-4">
                                <span className="rounded-lg bg-white/10 px-2 py-1 text-xs">
                                  {TABLE_LABELS[row.source_table] ?? row.source_table}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-white/80">{row.client}</td>
                              <td className="py-3 pr-4 text-white/80 max-w-[150px] truncate" title={row.organization ?? undefined}>
                                {row.organization ?? '—'}
                              </td>
                              <td className="py-3 pr-4 text-white/80 max-w-[150px] truncate" title={row.metric_name ?? undefined}>
                                {row.metric_name ?? '—'}
                              </td>
                              <td className="py-3 pr-4 text-white/60">
                                {row.month} {row.year}
                              </td>
                              <td className="py-3 pr-4">
                                <code className="rounded bg-white/10 px-2 py-0.5 text-xs">
                                  {row.field_name}
                                </code>
                              </td>
                              <td className="py-3 pr-4 font-mono text-rose-300">
                                {row.original_value?.toLocaleString() ?? 'null'}
                              </td>
                              <td className="py-3 pr-4">
                                <span
                                  className={`rounded-lg border px-2 py-1 text-xs ${
                                    ISSUE_TYPE_COLORS[row.issue_type] ?? 'bg-white/10 border-white/20'
                                  }`}
                                >
                                  {ISSUE_TYPE_LABELS[row.issue_type] ?? row.issue_type}
                                </span>
                              </td>
                              <td className="py-3">
                                <button
                                  type="button"
                                  onClick={() => handleResolveWonky(row)}
                                  disabled={resolvingWonky === row.id || !row.source_id}
                                  className="rounded-lg bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {resolvingWonky === row.id ? 'Setting...' : 'Set to Null'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {report.wonkyNumbers.length > 0 && (
                    <p className="text-xs text-white/40">
                      Click &quot;Set to Null&quot; to clear the wonky value from the database.
                    </p>
                  )}
                </div>
              )}

              {/* Unmatched Industries Tab */}
              {activeTab === 'unmatched' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Organizations Without Industry</h2>
                    <p className="text-sm text-white/50">
                      Assign an industry to create an alias rule
                    </p>
                  </div>

                  {report.unmatchedOrgs.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20">
                        <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-white/70">All organizations have industry assignments!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {report.unmatchedOrgs.map((org) => (
                        <div
                          key={org.organization}
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{org.organization}</p>
                            <div className="mt-1 flex items-center gap-3 text-xs text-white/50">
                              {org.amplifai_org && (
                                <span>Normalized: <span className="text-cyan-300">{org.amplifai_org}</span></span>
                              )}
                              <span>{org.count} rows</span>
                              <span>in {org.tables.join(', ')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {savingAlias === org.organization ? (
                              <span className="text-sm text-white/50">Saving...</span>
                            ) : (
                              <select
                                className="rounded-lg border border-white/20 bg-slate-800 px-3 py-2 text-sm text-white [&>option]:bg-slate-800 [&>option]:text-white"
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAssignIndustry(org, e.target.value);
                                  }
                                }}
                              >
                                <option value="" disabled className="bg-slate-800 text-white">
                                  Assign Industry...
                                </option>
                                {COMMON_INDUSTRIES.map((ind) => (
                                  <option key={ind} value={ind} className="bg-slate-800 text-white">
                                    {ind}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Unmatched Metrics Tab */}
              {activeTab === 'unmatched-metrics' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Metrics Without Standardized Mapping</h2>
                    <p className="text-sm text-white/50">
                      Assign a canonical name to create a metric alias rule
                    </p>
                  </div>

                  {report.unmatchedMetrics.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20">
                        <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-white/70">All metrics have standardized mappings!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {report.unmatchedMetrics.map((metric) => (
                        <div
                          key={metric.metric_name}
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{metric.metric_name}</p>
                            <div className="mt-1 flex items-center gap-3 text-xs text-white/50">
                              <span>{metric.count} rows</span>
                              <span>in {metric.tables.join(', ')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {savingMetricAlias === metric.metric_name ? (
                              <span className="text-sm text-white/50">Saving...</span>
                            ) : (
                              <select
                                className="rounded-lg border border-white/20 bg-slate-800 px-3 py-2 text-sm text-white [&>option]:bg-slate-800 [&>option]:text-white"
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAssignMetric(metric, e.target.value);
                                  }
                                }}
                              >
                                <option value="" disabled className="bg-slate-800 text-white">
                                  Assign Metric...
                                </option>
                                {COMMON_METRICS.map((m) => (
                                  <option key={m} value={m} className="bg-slate-800 text-white">
                                    {m}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Potential Duplicates Tab */}
              {activeTab === 'duplicates' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Potential Duplicate Organizations</h2>
                    <p className="text-sm text-white/50">
                      Organizations with similar names that might be the same
                    </p>
                  </div>

                  {report.potentialDuplicates.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20">
                        <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-white/70">No potential duplicates detected!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {report.potentialDuplicates.map((dup, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/5 p-4"
                        >
                          <div className="flex items-center gap-4">
                            <span className="font-medium">{dup.organization}</span>
                            <span className="text-white/40">↔</span>
                            <span className="font-medium">{dup.similarTo}</span>
                          </div>
                          <div className="rounded-full bg-amber-400/20 px-3 py-1 text-sm text-amber-300">
                            {dup.similarity}% similar
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Quality Issues Tab */}
              {activeTab === 'issues' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Data Quality Issues</h2>

                  {report.qualityIssues.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20">
                        <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-white/70">No quality issues detected!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {report.qualityIssues.map((issue, idx) => (
                        <div
                          key={idx}
                          className={`rounded-xl border p-4 ${severityColors[issue.severity]}`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                                  issue.severity === 'high' ? 'bg-rose-500/30' :
                                  issue.severity === 'medium' ? 'bg-amber-500/30' : 'bg-blue-500/30'
                                }`}>
                                  {issue.severity}
                                </span>
                                <span className="text-xs text-white/50">{formatTableName(issue.table)}</span>
                              </div>
                              <p className="mt-2 font-medium">{issue.message}</p>
                              {issue.suggestion && (
                                <p className="mt-1 text-sm text-white/60">{issue.suggestion}</p>
                              )}
                            </div>
                            {issue.count > 0 && (
                              <span className="rounded-full bg-white/10 px-3 py-1 text-sm">
                                {issue.count.toLocaleString()} rows
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
