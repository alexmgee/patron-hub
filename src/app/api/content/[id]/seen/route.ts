import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });

  const now = new Date();
  await db
    .update(contentItems)
    .set({ isSeen: true, seenAt: now })
    .where(eq(contentItems.id, id));

  return NextResponse.json({ ok: true });
}
