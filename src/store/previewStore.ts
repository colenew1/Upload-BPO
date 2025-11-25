'use client';

import { create } from 'zustand';

import type {
  CommitResponse,
  DatasetKey,
  PreviewResponse,
} from '@/types/upload';

type SelectionMap = Record<DatasetKey, Set<string>>;

type PreviewStatus = 'idle' | 'uploading' | 'ready' | 'committing' | 'success' | 'error';

const datasetKeys: DatasetKey[] = [
  'behaviors',
  'monthlyMetrics',
  'activityMetrics',
];

const createSelection = (preview?: PreviewResponse): SelectionMap => ({
  behaviors: new Set(preview?.data.behaviors.map((row) => row.id) ?? []),
  monthlyMetrics: new Set(
    preview?.data.monthlyMetrics.map((row) => row.id) ?? [],
  ),
  activityMetrics: new Set(
    preview?.data.activityMetrics.map((row) => row.id) ?? [],
  ),
});

type PreviewState = {
  preview: PreviewResponse | null;
  selection: SelectionMap;
  status: PreviewStatus;
  message: string | null;
  lastCommit: CommitResponse | null;
  startUpload: () => void;
  setPreview: (preview: PreviewResponse) => void;
  setError: (message: string) => void;
  toggleRow: (dataset: DatasetKey, rowId: string) => void;
  setDatasetSelection: (dataset: DatasetKey, state: 'all' | 'none') => void;
  startCommit: () => void;
  finishCommit: (summary: CommitResponse, message?: string) => void;
  reset: () => void;
};

export const usePreviewStore = create<PreviewState>((set) => ({
  preview: null,
  selection: createSelection(),
  status: 'idle',
  message: null,
  lastCommit: null,
  startUpload: () =>
    set({
      status: 'uploading',
      message: null,
      lastCommit: null,
    }),
  setPreview: (preview) =>
    set({
      preview,
      selection: createSelection(preview),
      status: 'ready',
      message: null,
    }),
  setError: (message) =>
    set({
      status: 'error',
      message,
    }),
  toggleRow: (dataset, rowId) =>
    set((state) => {
      const nextSelection = new Set(state.selection[dataset]);
      if (nextSelection.has(rowId)) {
        nextSelection.delete(rowId);
      } else {
        nextSelection.add(rowId);
      }
      return {
        selection: {
          ...state.selection,
          [dataset]: nextSelection,
        },
      };
    }),
  setDatasetSelection: (dataset, nextState) =>
    set((state) => {
      const ids =
        nextState === 'all'
          ? state.preview?.data[dataset]?.map((row) => row.id) ?? []
          : [];
      return {
        selection: {
          ...state.selection,
          [dataset]: new Set(ids),
        },
      };
    }),
  startCommit: () =>
    set({
      status: 'committing',
      message: null,
    }),
  finishCommit: (summary, message = 'Supabase updated successfully.') =>
    set({
      lastCommit: summary,
      message,
      status: 'success',
      preview: null,
      selection: createSelection(),
    }),
  reset: () =>
    set({
      preview: null,
      selection: createSelection(),
      status: 'idle',
      message: null,
      lastCommit: null,
    }),
}));

export const getSelectionCounts = (selection: SelectionMap) => {
  const counts: Record<DatasetKey, number> = {
    behaviors: selection.behaviors.size,
    monthlyMetrics: selection.monthlyMetrics.size,
    activityMetrics: selection.activityMetrics.size,
  };
  return counts;
};

export const getDatasetKeys = () => datasetKeys;

