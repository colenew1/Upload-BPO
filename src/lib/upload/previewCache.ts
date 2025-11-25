import crypto from 'node:crypto';

import { nanoid } from 'nanoid';

import { getServerEnv } from '@/lib/env';
import type { ParseWorkbookResult } from '@/lib/excel/types';

type PreviewCacheEntry = {
  id: string;
  checksum: string;
  createdAt: number;
  expiresAt: number;
  fileName: string;
  fileSize: number;
  clientOverride: string | null;
  payload: ParseWorkbookResult;
};

type SavePreviewArgs = {
  checksum: string;
  fileName: string;
  fileSize: number;
  clientOverride: string | null;
  payload: ParseWorkbookResult;
};

const cache = new Map<string, PreviewCacheEntry>();

const purgeExpired = () => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
};

export const computeChecksum = (buffer: Buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

export const savePreview = (args: SavePreviewArgs): PreviewCacheEntry => {
  purgeExpired();
  const { PREVIEW_TTL_SECONDS } = getServerEnv();
  const now = Date.now();
  const entry: PreviewCacheEntry = {
    id: nanoid(),
    createdAt: now,
    expiresAt: now + PREVIEW_TTL_SECONDS * 1000,
    checksum: args.checksum,
    fileName: args.fileName,
    fileSize: args.fileSize,
    clientOverride: args.clientOverride,
    payload: args.payload,
  };
  cache.set(entry.id, entry);
  return entry;
};

export const getPreview = (previewId: string): PreviewCacheEntry | null => {
  purgeExpired();
  const entry = cache.get(previewId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(previewId);
    return null;
  }
  return entry;
};

export const deletePreview = (previewId: string) => {
  cache.delete(previewId);
};

export const getPreviewCount = () => cache.size;

