import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { downloads } from '@/lib/db/schema';
import { getAuthUser } from '@/lib/auth/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { id: idParam } = await ctx.params;
  const contentItemId = Number(idParam);
  if (!Number.isFinite(contentItemId)) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
  }

  const rows = await db
    .select({
      id: downloads.id,
      fileName: downloads.fileName,
      fileType: downloads.fileType,
      mimeType: downloads.mimeType,
      sizeBytes: downloads.sizeBytes,
      localPath: downloads.localPath,
      downloadedAt: downloads.downloadedAt,
    })
    .from(downloads)
    .where(eq(downloads.contentItemId, contentItemId));

  return NextResponse.json({ ok: true, files: rows });
}

