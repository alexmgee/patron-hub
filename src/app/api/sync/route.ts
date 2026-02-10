import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subscriptions, syncLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  const subs = await db.select({ id: subscriptions.id }).from(subscriptions);
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

