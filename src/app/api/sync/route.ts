import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getSetting } from '@/lib/db/settings';
import { getAuthUser } from '@/lib/auth/api';
import { syncPatreon } from '@/lib/sync/patreon';

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const autoSyncEnabled = await getSetting<boolean>('auto_sync_enabled', true);
  if (!autoSyncEnabled) {
    return NextResponse.json({ ok: false, disabled: true, error: 'Auto-sync is disabled in settings.' }, { status: 409 });
  }

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

  try {
    const patreonStats = await syncPatreon({
      rawCookie: patreonCookie,
      globalAutoDownloadEnabled,
    });

    return NextResponse.json({ ok: true, patreon: patreonStats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Sync failed: ${message}` }, { status: 500 });
  }
}
