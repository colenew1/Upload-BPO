import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { getPreview, deletePreview } from '@/lib/upload/previewCache';
import { commitRequestSchema } from '@/lib/upload/schemas';
import { selectRowsById } from '@/lib/upload/selection';
import {
  toActivityMetricInsert,
  toBehaviorInsert,
  toMonthlyMetricInsert,
} from '@/lib/upload/transformers';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload.' },
      { status: 400 },
    );
  }

  const payload = commitRequestSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 },
    );
  }

  const { previewId, checksum, include } = payload.data;
  const cacheEntry = getPreview(previewId);

  if (!cacheEntry) {
    return NextResponse.json(
      { error: 'Preview has expired or does not exist.' },
      { status: 404 },
    );
  }

  if (cacheEntry.checksum !== checksum) {
    return NextResponse.json(
      { error: 'Checksum mismatch. Please re-run the preview step.' },
      { status: 409 },
    );
  }

  const { behaviors, monthlyMetrics, activityMetrics } = cacheEntry.payload;

  const selectedBehaviors = selectRowsById(behaviors, include.behaviors);
  const selectedMonthly = selectRowsById(
    monthlyMetrics,
    include.monthlyMetrics,
  );
  const selectedActivity = selectRowsById(
    activityMetrics,
    include.activityMetrics,
  );

  const totalSelected =
    selectedBehaviors.length + selectedMonthly.length + selectedActivity.length;

  if (totalSelected === 0) {
    return NextResponse.json(
      { error: 'No rows selected for insertion.' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  const behaviorInserts = selectedBehaviors.map(toBehaviorInsert);
  const monthlyInserts = selectedMonthly.map(toMonthlyMetricInsert);
  const activityInserts = selectedActivity.map(toActivityMetricInsert);

  const runInsert = async () => {
    const summaries: Array<{ table: string; count: number }> = [];

    if (behaviorInserts.length > 0) {
      const { error } = await supabase
        .from('behavioral_coaching')
        .upsert(behaviorInserts, {
          onConflict:
            'client,organization,program,behavior,sub_behavior,month,year',
          returning: 'minimal',
        });
      if (error) throw error;
      summaries.push({ table: 'behavioral_coaching', count: behaviorInserts.length });
    }

    if (monthlyInserts.length > 0) {
      const { error } = await supabase
        .from('monthly_metrics')
        .upsert(monthlyInserts, {
          onConflict:
            'client,organization,program,metric_name,month,year',
          returning: 'minimal',
        });
      if (error) throw error;
      summaries.push({ table: 'monthly_metrics', count: monthlyInserts.length });
    }

    if (activityInserts.length > 0) {
      const { error } = await supabase
        .from('activity_metrics')
        .upsert(activityInserts, {
          onConflict:
            'client,organization,program,metric_name,month,year',
          returning: 'minimal',
        });
      if (error) throw error;
      summaries.push({ table: 'activity_metrics', count: activityInserts.length });
    }

    return summaries;
  };

  try {
    const summaries = await runInsert();
    deletePreview(previewId);

    return NextResponse.json({
      previewId,
      inserted: {
        behaviors: behaviorInserts.length,
        monthlyMetrics: monthlyInserts.length,
        activityMetrics: activityInserts.length,
      },
      tables: summaries,
      meta: cacheEntry.payload.meta,
    });
  } catch (error) {
    console.error('Supabase insert failed', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to upsert records.',
      },
      { status: 502 },
    );
  }
}

