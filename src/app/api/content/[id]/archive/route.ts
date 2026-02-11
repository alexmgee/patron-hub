import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser } from '@/lib/auth/api';
import { archiveContentItem } from '@/lib/archive/archive-content';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { id: idParam } = await ctx.params;
  const contentItemId = Number(idParam);
  if (!Number.isFinite(contentItemId)) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
  }

  try {
    const result = await archiveContentItem(contentItemId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'archive failed';
    await db.update(contentItems).set({ isArchived: false, archiveError: message }).where(eq(contentItems.id, contentItemId));
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

