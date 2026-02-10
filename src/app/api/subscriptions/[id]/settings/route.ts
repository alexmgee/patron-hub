import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { getAuthUser } from '@/lib/auth/api';

type Payload = {
  syncEnabled?: boolean;
  autoDownloadEnabled?: boolean;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Payload | null;
  if (!body) return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });

  const updates: Partial<typeof subscriptions.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof body.syncEnabled === 'boolean') updates.syncEnabled = body.syncEnabled;
  if (typeof body.autoDownloadEnabled === 'boolean') updates.autoDownloadEnabled = body.autoDownloadEnabled;

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ ok: false, error: 'no updates' }, { status: 400 });
  }

  await db.update(subscriptions).set(updates).where(eq(subscriptions.id, id));

  // If sync is disabled, clear lastSyncedAt? Keep as-is to preserve audit trail.

  const row = await db
    .select({
      id: subscriptions.id,
      syncEnabled: subscriptions.syncEnabled,
      autoDownloadEnabled: subscriptions.autoDownloadEnabled,
    })
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1);

  if (!row[0]) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, subscription: row[0] });
}
