import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { harvestJobs, subscriptions, syncLogs } from '@/lib/db/schema';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { getSetting } from '@/lib/db/settings';
import { getAuthUser } from '@/lib/auth/api';
import { syncPatreon } from '@/lib/sync/patreon';

type SyncState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastStartedByUserId: number | null;
  lastResult: Awaited<ReturnType<typeof syncPatreon>> | null;
  lastError: string | null;
  subscriptionsTotal: number;
};

const syncState: SyncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastStartedByUserId: null,
  lastResult: null,
  lastError: null,
  subscriptionsTotal: 0,
};

type RuntimeProgress = {
  subscriptionsTotal: number;
  subscriptionsCompleted: number;
  subscriptionsSucceeded: number;
  subscriptionsFailed: number;
  itemsFoundSoFar: number;
  itemsDownloadedSoFar: number;
  harvestPending: number;
  harvestRunning: number;
  harvestFailed: number;
  elapsedSeconds: number | null;
};

async function computeRuntimeProgress(): Promise<RuntimeProgress | null> {
  if (!syncState.startedAt) return null;
  const startedAt = new Date(syncState.startedAt);
  if (Number.isNaN(startedAt.getTime())) return null;

  const logRows = await db
    .select({
      status: syncLogs.status,
      itemsFound: syncLogs.itemsFound,
      itemsDownloaded: syncLogs.itemsDownloaded,
    })
    .from(syncLogs)
    .where(gte(syncLogs.startedAt, startedAt));

  let subscriptionsCompleted = 0;
  let subscriptionsSucceeded = 0;
  let subscriptionsFailed = 0;
  let itemsFoundSoFar = 0;
  let itemsDownloadedSoFar = 0;
  for (const row of logRows) {
    subscriptionsCompleted += 1;
    if (row.status === 'success') subscriptionsSucceeded += 1;
    if (row.status === 'failed') subscriptionsFailed += 1;
    itemsFoundSoFar += Number(row.itemsFound ?? 0);
    itemsDownloadedSoFar += Number(row.itemsDownloaded ?? 0);
  }

  const jobRows = await db
    .select({
      status: harvestJobs.status,
      count: sql<number>`count(*)`,
    })
    .from(harvestJobs)
    .where(inArray(harvestJobs.status, ['pending', 'running', 'failed']))
    .groupBy(harvestJobs.status);

  let harvestPending = 0;
  let harvestRunning = 0;
  let harvestFailed = 0;
  for (const row of jobRows) {
    const n = Number(row.count ?? 0);
    if (row.status === 'pending') harvestPending = n;
    if (row.status === 'running') harvestRunning = n;
    if (row.status === 'failed') harvestFailed = n;
  }

  const endedAt = syncState.finishedAt ? new Date(syncState.finishedAt) : new Date();
  const elapsedSeconds = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));

  return {
    subscriptionsTotal: syncState.subscriptionsTotal,
    subscriptionsCompleted,
    subscriptionsSucceeded,
    subscriptionsFailed,
    itemsFoundSoFar,
    itemsDownloadedSoFar,
    harvestPending,
    harvestRunning,
    harvestFailed,
    elapsedSeconds,
  };
}

function formatSummary(progress: RuntimeProgress | null): string {
  if (!progress) return 'No sync run has started yet.';
  const subPart =
    progress.subscriptionsTotal > 0
      ? `${progress.subscriptionsCompleted}/${progress.subscriptionsTotal} subscriptions`
      : `${progress.subscriptionsCompleted} subscriptions`;
  const timePart = progress.elapsedSeconds == null ? '' : ` (${progress.elapsedSeconds}s elapsed)`;
  return `${subPart}, items found ${progress.itemsFoundSoFar}, downloaded ${progress.itemsDownloadedSoFar}, harvest pending/running/failed ${progress.harvestPending}/${progress.harvestRunning}/${progress.harvestFailed}${timePart}`;
}

async function snapshotState() {
  const progress = await computeRuntimeProgress();
  return {
    running: syncState.running,
    startedAt: syncState.startedAt,
    finishedAt: syncState.finishedAt,
    lastStartedByUserId: syncState.lastStartedByUserId,
    lastError: syncState.lastError,
    hasLastResult: Boolean(syncState.lastResult),
    lastResult: syncState.lastResult,
    progress,
    summary: formatSummary(progress),
  };
}

async function runSyncInBackground(params: {
  rawCookie: string;
  globalAutoDownloadEnabled: boolean;
  startedByUserId: number;
  subscriptionsTotal: number;
}) {
  syncState.running = true;
  syncState.startedAt = new Date().toISOString();
  syncState.finishedAt = null;
  syncState.lastStartedByUserId = params.startedByUserId;
  syncState.lastError = null;
  syncState.lastResult = null;
  syncState.subscriptionsTotal = params.subscriptionsTotal;

  try {
    const patreonStats = await syncPatreon({
      rawCookie: params.rawCookie,
      globalAutoDownloadEnabled: params.globalAutoDownloadEnabled,
    });
    syncState.lastResult = patreonStats;
    syncState.lastError = null;
  } catch (err) {
    syncState.lastResult = null;
    syncState.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    syncState.running = false;
    syncState.finishedAt = new Date().toISOString();
  }
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  return NextResponse.json({ ok: true, sync: await snapshotState() });
}

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const globalAutoDownloadEnabled = await getSetting<boolean>('auto_download_enabled', true);
  const patreonCookie =
    process.env.PATRON_HUB_PATREON_COOKIE || (await getSetting<string | null>('patreon_cookie', null));

  const activeSyncSubs = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, 'active'), eq(subscriptions.syncEnabled, true)));

  if (!patreonCookie) {
    return NextResponse.json(
      {
        ok: false,
        error: 'No Patreon cookie configured. Add one in Settings before syncing.',
        activeSyncSubscriptions: activeSyncSubs.length,
      },
      { status: 409 }
    );
  }

  if (syncState.running) {
    return NextResponse.json({
      ok: true,
      started: false,
      message: 'Sync is already running in the background.',
      sync: await snapshotState(),
    });
  }

  void runSyncInBackground({
    rawCookie: patreonCookie,
    globalAutoDownloadEnabled,
    startedByUserId: user.id,
    subscriptionsTotal: activeSyncSubs.length,
  });

  return NextResponse.json({
    ok: true,
    started: true,
    message: 'Sync started in the background.',
    sync: await snapshotState(),
  });
}
