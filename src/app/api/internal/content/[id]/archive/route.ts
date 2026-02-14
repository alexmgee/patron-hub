import { NextResponse } from 'next/server';
import { requireInternalToken } from '@/app/api/internal/_internal-auth';
import { archiveContentItem } from '@/lib/archive/archive-content';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireInternalToken(req);
  if (denied) return denied;

  const { id: idParam } = await ctx.params;
  const contentItemId = Number(idParam);
  if (!Number.isFinite(contentItemId)) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
  }

  try {
    const result = await archiveContentItem(contentItemId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

