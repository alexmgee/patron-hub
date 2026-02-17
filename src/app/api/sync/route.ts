import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
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
};

const syncState: SyncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastStartedByUserId: null,
  lastResult: null,
  lastError: null,
};

function snapshotState() {
  return {
    running: syncState.running,
    startedAt: syncState.startedAt,
    finishedAt: syncState.finishedAt,
    lastStartedByUserId: syncState.lastStartedByUserId,
    lastError: syncState.lastError,
    hasLastResult: Boolean(syncState.lastResult),
    lastResult: syncState.lastResult,
  };
}

async function runSyncInBackground(params: {
  rawCookie: string;
  globalAutoDownloadEnabled: boolean;
  startedByUserId: number;
}) {
  syncState.running = true;
  syncState.startedAt = new Date().toISOString();
  syncState.finishedAt = null;
  syncState.lastStartedByUserId = params.startedByUserId;
  syncState.lastError = null;
  syncState.lastResult = null;

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

  return NextResponse.json({ ok: true, sync: snapshotState() });
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
      sync: snapshotState(),
    });
  }

  void runSyncInBackground({
    rawCookie: patreonCookie,
    globalAutoDownloadEnabled,
    startedByUserId: user.id,
  });

  return NextResponse.json({
    ok: true,
    started: true,
    message: 'Sync started in the background.',
    sync: snapshotState(),
  });
}
