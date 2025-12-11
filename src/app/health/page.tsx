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
  };
  tables: TableStats[];
  unmatchedOrgs: UnmatchedOrg[];
  unmatchedMetrics: UnmatchedMetric[];
  potentialDuplicates: PotentialDuplicate[];
  qualityIssues: DataQualityIssue[];
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
  { id: 'unmatched', label: 'Unmatched Industries' },
  { id: 'unmatched-metrics', label: 'Unmatched Metrics' },
  { id: 'duplicates', label: 'Potential Duplicates' },
  { id: 'issues', label: 'Quality Issues' },
] as const;

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

      if (!response.ok) throw new Error('Failed to save alias');

      // Refresh report
      await fetchReport();
    } catch (err) {
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
          <div className="mb-8 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Total Rows</p>
              <p className="mt-1 text-2xl font-bold">{report.summary.totalRows.toLocaleString()}</p>
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
                                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAssignIndustry(org, e.target.value);
                                  }
                                }}
                              >
                                <option value="" disabled>
                                  Assign Industry...
                                </option>
                                {COMMON_INDUSTRIES.map((ind) => (
                                  <option key={ind} value={ind}>
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
                                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAssignMetric(metric, e.target.value);
                                  }
                                }}
                              >
                                <option value="" disabled>
                                  Assign Metric...
                                </option>
                                {COMMON_METRICS.map((m) => (
                                  <option key={m} value={m}>
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
