import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentAssets } from '@/lib/db/schema';
import { requireInternalToken } from '@/app/api/internal/_internal-auth';

export async function POST(req: Request) {
  const denied = requireInternalToken(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    contentItemId?: number;
    assets?: Array<{ url?: string; fileNameHint?: string | null; assetType?: string | null }>;
  };

  const contentItemId = Number(body?.contentItemId);
  if (!Number.isFinite(contentItemId)) return NextResponse.json({ ok: false, error: 'invalid contentItemId' }, { status: 400 });

  const assets = Array.isArray(body?.assets) ? body.assets : [];
  if (assets.length === 0) return NextResponse.json({ ok: true, inserted: 0 });

  const now = new Date();
  let attempted = 0;

  for (const a of assets) {
    const url = typeof a.url === 'string' ? a.url.trim() : '';
    if (!url.startsWith('http')) continue;
    attempted += 1;
    try {
      await db
        .insert(contentAssets)
        .values({
          contentItemId,
          url,
          fileNameHint: a.fileNameHint ?? null,
          assetType: (a.assetType || 'attachment').toLowerCase(),
          mimeTypeHint: null,
          status: 'discovered',
          lastError: null,
          downloadedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ ok: true, attempted });
}

