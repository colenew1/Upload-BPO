import { NextResponse } from 'next/server';

import {
  parseWorkbook,
  parseSingleSheet,
  parseCsv,
  setDbMetricResolver,
  setDbIndustryResolver,
  initNormalizationTracking,
  getNormalizationSummary,
} from '@/lib/excel/parseWorkbook';
import { getServerEnv } from '@/lib/env';
import {
  loadMetricAliases,
  createMetricResolver,
} from '@/lib/mappings/metricResolver';
import {
  loadIndustryAliases,
  createIndustryResolver,
} from '@/lib/mappings/industryResolver';
import {
  computeChecksum,
  savePreview,
} from '@/lib/upload/previewCache';
import {
  filterDuplicateBehaviors,
  filterDuplicateMonthlyMetrics,
  filterDuplicateActivityMetrics,
} from '@/lib/upload/duplicateCheck';

const sanitizeRows = <T extends { raw: Record<string, unknown> }>(rows: T[]) =>
  rows.map((row) => {
    const { raw, ...rest } = row;
    void raw;
    return rest;
  });

export const runtime = 'nodejs';

const bytesToMb = (bytes: number) => bytes / (1024 * 1024);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'A file is required under the "file" field.' },
        { status: 400 },
      );
    }

    const filename =
      (file as File).name ||
      formData.get('fileName')?.toString() ||
      'upload.xlsx';

    const isCsv = filename.toLowerCase().endsWith('.csv');

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileSizeMb = bytesToMb(buffer.length);
    const { UPLOAD_MAX_MB } = getServerEnv();

    if (fileSizeMb > UPLOAD_MAX_MB) {
      return NextResponse.json(
        {
          error: `File is too large. Maximum allowed size is ${UPLOAD_MAX_MB} MB.`,
        },
        { status: 413 },
      );
    }

    const clientOverride = formData.get('client')?.toString() ?? undefined;
    const mode = formData.get('mode')?.toString() ?? 'combined';

    // Initialize normalization tracking
    initNormalizationTracking();

    // Load metric aliases from DB and inject resolver before parsing
    try {
      const aliases = await loadMetricAliases();
      if (aliases.length > 0) {
        const resolver = createMetricResolver(aliases, clientOverride ?? null);
        setDbMetricResolver(resolver);
      }
    } catch (err) {
      // Non-fatal: fall back to hard-coded mappings
      console.warn('[preview] Failed to load metric aliases from DB, using hard-coded:', err);
    }

    // Load industry aliases from DB and inject resolver before parsing
    try {
      const industryAliases = await loadIndustryAliases();
      if (industryAliases.length > 0) {
        const resolver = createIndustryResolver(industryAliases, clientOverride ?? null);
        setDbIndustryResolver(resolver);
      }
    } catch (err) {
      // Non-fatal: fall back to hard-coded mappings
      console.warn('[preview] Failed to load industry aliases from DB, using hard-coded:', err);
    }

    let parsed;
    try {
      if (mode === 'combined') {
        // Combined mode: parse both behavior and metric sheets (Excel only)
        if (isCsv) {
          return NextResponse.json(
            { error: 'CSV files are only supported for single-type uploads (Behaviors Only or Metrics Only).' },
            { status: 400 },
          );
        }

        const behaviorSheetHint = formData.get('behaviorSheet')?.toString() ?? undefined;
        const metricSheetHint = formData.get('metricSheet')?.toString() ?? undefined;

        parsed = parseWorkbook({
          buffer,
          fileName: filename,
          clientOverride,
          behaviorSheetHint,
          metricSheetHint,
        });
      } else {
        // Single sheet/file mode: behaviors or metrics only
        const forceType = formData.get('forceType')?.toString() as 'behaviors' | 'metrics' | undefined;
        const sheetName = formData.get('sheetName')?.toString() ?? undefined;

        // Use CSV parser for CSV files, Excel parser for xlsx
        const singleResult = isCsv
          ? parseCsv({
              buffer,
              fileName: filename,
              clientOverride,
              forceType: forceType ?? (mode === 'behaviors' ? 'behaviors' : 'metrics'),
            })
          : parseSingleSheet({
              buffer,
              fileName: filename,
              clientOverride,
              sheetName,
              forceType: forceType ?? (mode === 'behaviors' ? 'behaviors' : 'metrics'),
            });

        // Convert single sheet result to standard format
        const fileExtRegex = /\.(xlsx|csv)$/i;
        parsed = {
          behaviors: singleResult.behaviors,
          monthlyMetrics: singleResult.monthlyMetrics,
          activityMetrics: singleResult.activityMetrics,
          meta: {
            workbookName: filename,
            client: clientOverride ?? filename.replace(fileExtRegex, ''),
            generatedAt: new Date().toISOString(),
            sheets: {
              behaviors: singleResult.detectedType === 'behaviors' ? singleResult.sheetName : null,
              metrics: singleResult.detectedType === 'metrics' ? singleResult.sheetName : null,
            },
            behaviorStats: singleResult.detectedType === 'behaviors' ? singleResult.stats : { totalRows: 0, acceptedRows: 0, filteredMissingData: 0, filteredTooRecent: 0 },
            metricStats: singleResult.detectedType === 'metrics' ? singleResult.stats : { totalRows: 0, acceptedRows: 0, filteredMissingData: 0, filteredTooRecent: 0 },
          },
          issues: singleResult.issues,
        };

        // Add column info to issues for debugging
        if (singleResult.columns.length > 0) {
          parsed.issues.push(`Detected columns: ${singleResult.columns.join(', ')}`);
        }
      }
    } catch (error) {
      // Clear resolvers on parse error
      setDbMetricResolver(null);
      setDbIndustryResolver(null);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Unable to parse workbook.',
        },
        { status: 400 },
      );
    }

    // Clear resolvers after successful parsing
    setDbMetricResolver(null);
    setDbIndustryResolver(null);

    // Get normalization summary
    const normalizations = getNormalizationSummary();

    // Check for duplicates in Supabase
    const client = clientOverride ?? filename.replace(/\.xlsx$/i, '');
    
    const [behaviorResult, monthlyResult, activityResult] = await Promise.all([
      filterDuplicateBehaviors(parsed.behaviors, client),
      filterDuplicateMonthlyMetrics(parsed.monthlyMetrics, client),
      filterDuplicateActivityMetrics(parsed.activityMetrics, client),
    ]);

    // Update parsed data with only unique rows
    const dedupedParsed = {
      ...parsed,
      behaviors: behaviorResult.unique,
      monthlyMetrics: monthlyResult.unique,
      activityMetrics: activityResult.unique,
    };

    // Track duplicate counts
    const duplicateCounts = {
      behaviors: behaviorResult.duplicateCount,
      monthlyMetrics: monthlyResult.duplicateCount,
      activityMetrics: activityResult.duplicateCount,
    };

    // Add duplicate info to issues
    const totalDuplicates = 
      duplicateCounts.behaviors + 
      duplicateCounts.monthlyMetrics + 
      duplicateCounts.activityMetrics;
    
    if (totalDuplicates > 0) {
      const parts: string[] = [];
      if (duplicateCounts.behaviors > 0) {
        parts.push(`${duplicateCounts.behaviors} behavioral`);
      }
      if (duplicateCounts.monthlyMetrics > 0) {
        parts.push(`${duplicateCounts.monthlyMetrics} monthly metrics`);
      }
      if (duplicateCounts.activityMetrics > 0) {
        parts.push(`${duplicateCounts.activityMetrics} activity metrics`);
      }
      dedupedParsed.issues.push(
        `Excluded ${totalDuplicates} duplicate rows already in database: ${parts.join(', ')}`
      );
    }

    const checksum = computeChecksum(buffer);
    const cacheEntry = savePreview({
      checksum,
      fileName: filename,
      fileSize: buffer.length,
      clientOverride: clientOverride ?? null,
      payload: dedupedParsed,
    });

    return NextResponse.json({
      previewId: cacheEntry.id,
      checksum,
      expiresAt: cacheEntry.expiresAt,
      ttlSeconds: Math.round((cacheEntry.expiresAt - Date.now()) / 1000),
      meta: dedupedParsed.meta,
      issues: dedupedParsed.issues,
      duplicates: duplicateCounts,
      normalizations,
      file: {
        name: filename,
        size: buffer.length,
        sizeMb: Number(fileSizeMb.toFixed(2)),
      },
      data: {
        behaviors: sanitizeRows(dedupedParsed.behaviors),
        monthlyMetrics: sanitizeRows(dedupedParsed.monthlyMetrics),
        activityMetrics: sanitizeRows(dedupedParsed.activityMetrics),
      },
    });
  } catch (error) {
    console.error('Preview upload failed', error);
    return NextResponse.json(
      { error: 'Unexpected error generating preview.' },
      { status: 500 },
    );
  }
}

