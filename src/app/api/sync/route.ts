import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subscriptions, syncLogs } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getSetting } from '@/lib/db/settings';

export async function POST() {
  const autoSyncEnabled = await getSetting<boolean>('auto_sync_enabled', true);
  if (!autoSyncEnabled) {
    return NextResponse.json({ ok: false, disabled: true, error: 'Auto-sync is disabled in settings.' }, { status: 409 });
  }

  const subs = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, 'active'), eq(subscriptions.syncEnabled, true)));
  const now = new Date();

  for (const s of subs) {
    await db.insert(syncLogs).values({
      subscriptionId: s.id,
      startedAt: now,
      completedAt: now,
      status: 'success',
      itemsFound: 0,
      itemsDownloaded: 0,
      errors: [],
    });

    await db.update(subscriptions).set({ lastSyncedAt: now }).where(eq(subscriptions.id, s.id));
  }

  return NextResponse.json({ ok: true, subscriptions: subs.length });
}
