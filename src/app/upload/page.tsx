'use client';

import { FormEvent, useRef, useState } from 'react';

import { PreviewTable } from '@/components/upload/PreviewTable';
import { SelectionSummary } from '@/components/upload/SelectionSummary';
import {
  getDatasetKeys,
  usePreviewStore,
} from '@/store/previewStore';

const formLabel = 'text-sm font-semibold text-white/80';
const formInput =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none';

type UploadMode = 'combined' | 'behaviors' | 'metrics';

const TAB_STYLES = {
  active: 'bg-emerald-500 text-emerald-950 font-semibold',
  inactive: 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
};

export default function UploadPage() {
  const [mode, setMode] = useState<UploadMode>('combined');
  const [file, setFile] = useState<File | null>(null);
  const [client, setClient] = useState<'Alorica' | 'TTEC' | 'TP'>('TTEC');
  const [behaviorSheet, setBehaviorSheet] = useState('');
  const [metricSheet, setMetricSheet] = useState('');
  const [singleSheetName, setSingleSheetName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const status = usePreviewStore((state) => state.status);
  const preview = usePreviewStore((state) => state.preview);
  const startUpload = usePreviewStore((state) => state.startUpload);
  const setPreviewData = usePreviewStore((state) => state.setPreview);
  const setError = usePreviewStore((state) => state.setError);

  const datasetKeys = getDatasetKeys();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError('Choose a file to continue.');
      return;
    }

    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (isCsv && mode === 'combined') {
      setError('CSV files are only supported for single-type uploads (Behaviors Only or Metrics Only). Please use an Excel file for combined uploads.');
      return;
    }

    startUpload();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('client', client);
    
    // Set mode and sheet hints based on upload type
    formData.append('mode', mode);
    
    if (mode === 'combined') {
      if (behaviorSheet.trim()) formData.append('behaviorSheet', behaviorSheet.trim());
      if (metricSheet.trim()) formData.append('metricSheet', metricSheet.trim());
    } else {
      // Single sheet mode
      formData.append('forceType', mode);
      if (singleSheetName.trim()) formData.append('sheetName', singleSheetName.trim());
    }

    try {
      const response = await fetch('/api/upload/preview', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to generate preview.');
      }
      setPreviewData(data);
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error ? error.message : 'Preview request failed.',
      );
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      setFile(null);
      return;
    }
    setFile(event.target.files[0]);
  };

  const handleModeChange = (newMode: UploadMode) => {
    setMode(newMode);
    // Reset sheet-specific fields when changing mode
    setBehaviorSheet('');
    setMetricSheet('');
    setSingleSheetName('');
  };

  return (
    <main className="min-h-screen bg-slate-950 pb-16 pt-14 text-white">
      <div className="mx-auto max-w-6xl px-4">
        <header className="mb-10 text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-emerald-300">
            Amplifai Upload Console
          </p>
          <h1 className="mt-4 text-4xl font-semibold">
            Validate Excel data before it touches Supabase.
          </h1>
          <p className="mt-4 text-base text-white/70">
            Drop a workbook, review every row, and only insert the data you trust.
            No more blind uploads or n8n fiddling.
          </p>
          <a
            href="/health"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm text-white/70 hover:border-white/40 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Database Health Dashboard
          </a>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950/80 p-6 shadow-2xl shadow-black/40">
            {/* Upload Mode Tabs */}
            <div className="mb-6">
              <label className={`${formLabel} mb-3 block`}>Upload Mode</label>
              <div className="flex gap-2 rounded-xl bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => handleModeChange('combined')}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm transition ${
                    mode === 'combined' ? TAB_STYLES.active : TAB_STYLES.inactive
                  }`}
                >
                  Combined (Both)
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('behaviors')}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm transition ${
                    mode === 'behaviors' ? TAB_STYLES.active : TAB_STYLES.inactive
                  }`}
                >
                  Behaviors Only
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('metrics')}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm transition ${
                    mode === 'metrics' ? TAB_STYLES.active : TAB_STYLES.inactive
                  }`}
                >
                  Metrics Only
                </button>
              </div>
              <p className="mt-2 text-xs text-white/50">
                {mode === 'combined' && 'Upload a workbook with both behavioral and metrics sheets.'}
                {mode === 'behaviors' && 'Upload a file containing only behavioral coaching data.'}
                {mode === 'metrics' && 'Upload a file containing only metrics data (monthly + activity).'}
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className={formLabel}>
                  {mode === 'combined' ? 'Excel file *' : 'Excel or CSV file *'}
                </label>
                <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/70">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={mode === 'combined'
                      ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                      : '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'
                    }
                    onChange={handleFileChange}
                    className="text-white/80 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-950 hover:file:bg-emerald-400"
                  />
                  {file && (
                    <p>
                      Selected:{' '}
                      <span className="font-semibold">{file.name}</span>
                    </p>
                  )}
                </div>
                {mode !== 'combined' && (
                  <p className="mt-1 text-xs text-white/50">
                    CSV files are supported for single-type uploads (Behaviors Only or Metrics Only).
                  </p>
                )}
              </div>

              <div>
                <label className={formLabel}>Client</label>
                <div className="mt-2 flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                  {(['Alorica', 'TTEC', 'TP'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setClient(option)}
                      className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        client === option
                          ? 'bg-emerald-500 text-emerald-950'
                          : 'bg-transparent text-white/70 hover:text-white'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-white/50">
                  Pick the client for this upload. Teleperformance files default to TP if not set.
                </p>
              </div>

              {mode === 'combined' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={formLabel}>Behavior sheet name</label>
                    <input
                      type="text"
                      className={`${formInput} mt-2`}
                      value={behaviorSheet}
                      onChange={(event) => setBehaviorSheet(event.target.value)}
                      placeholder="Auto-detects by columns"
                    />
                  </div>
                  <div>
                    <label className={formLabel}>Metric sheet name</label>
                    <input
                      type="text"
                      className={`${formInput} mt-2`}
                      value={metricSheet}
                      onChange={(event) => setMetricSheet(event.target.value)}
                      placeholder="Auto-detects by columns"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className={formLabel}>Sheet name (optional)</label>
                  <input
                    type="text"
                    className={`${formInput} mt-2`}
                    value={singleSheetName}
                    onChange={(event) => setSingleSheetName(event.target.value)}
                    placeholder="Uses first sheet if empty"
                  />
                  <p className="mt-1 text-xs text-white/50">
                    Leave blank to use the first sheet in the workbook.
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-2xl bg-emerald-500 px-6 py-3 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
                disabled={status === 'uploading'}
              >
                {status === 'uploading' ? 'Parsing...' : 'Generate preview'}
              </button>
            </form>

            {/* Column Reference */}
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white/80">Expected Columns</p>
              {mode === 'behaviors' || mode === 'combined' ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-emerald-300">Behavioral Data:</p>
                  <p className="text-xs text-white/50">
                    organization, Program, Month Name/Period of Time, Metricname, Behaviors, SubBehaviors, TotalCoachings, Effectiveness%
                  </p>
                </div>
              ) : null}
              {mode === 'metrics' || mode === 'combined' ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-emerald-300">Metrics Data:</p>
                  <p className="text-xs text-white/50">
                    organization, Program, Metric, Period of Time, Actual, Goal, PTG
                  </p>
                </div>
              ) : null}
              <p className="mt-3 text-xs text-white/40">
                Column names are flexible - the parser handles variations like &quot;Month_Year&quot;, &quot;Month Year&quot;, &quot;Period of Time&quot;, etc.
              </p>
            </div>
          </section>

          <SelectionSummary />
        </div>

        <section className="mt-10 space-y-6">
          {datasetKeys.map((dataset) => (
            <PreviewTable key={dataset} dataset={dataset} />
          ))}
          {!preview && (
            <p className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-white/70">
              Preview tables will show up here once your workbook is parsed.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

