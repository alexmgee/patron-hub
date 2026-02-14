import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { downloads } from '@/lib/db/schema';
import { getAuthUser } from '@/lib/auth/api';
import { getSetting } from '@/lib/db/settings';
import { resolveArchiveDirectory } from '@/lib/archive';

function safeJoin(root: string, relPath: string): string {
  const resolvedRoot = path.resolve(root);
  const abs = path.resolve(resolvedRoot, relPath);
  if (abs === resolvedRoot) throw new Error('refusing archive root as file path');
  if (!abs.startsWith(resolvedRoot + path.sep)) throw new Error('refusing path traversal');
  return abs;
}

function contentDisposition(disposition: string | null, fileName: string): string {
  const type = disposition === 'attachment' ? 'attachment' : 'inline';
  // Basic header-safe filename (avoid quotes/newlines).
  const safe = fileName.replace(/[\r\n"]/g, '_');
  return `${type}; filename="${safe}"`;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { id: idParam } = await ctx.params;
  const contentItemId = Number(idParam);
  if (!Number.isFinite(contentItemId)) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
  }

  const row = await db
    .select({
      localPath: downloads.localPath,
      fileName: downloads.fileName,
      mimeType: downloads.mimeType,
      sizeBytes: downloads.sizeBytes,
    })
    .from(downloads)
    .where(eq(downloads.contentItemId, contentItemId))
    .limit(1);

  if (!row[0]?.localPath) {
    return NextResponse.json({ ok: false, error: 'no archived file found for this item' }, { status: 404 });
  }

  const configuredArchiveDir = await getSetting<string | null>('archive_dir', null);
  const archiveRoot = resolveArchiveDirectory(configuredArchiveDir);

  let absPath: string;
  try {
    absPath = safeJoin(archiveRoot, row[0].localPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  if (!fs.existsSync(absPath)) {
    return NextResponse.json({ ok: false, error: 'archived file missing on disk' }, { status: 404 });
  }

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    return NextResponse.json({ ok: false, error: 'archived path is not a file' }, { status: 404 });
  }

  const url = new URL(req.url);
  const disposition = url.searchParams.get('disposition'); // 'inline' | 'attachment'

  const headers = new Headers();
  headers.set('content-type', row[0].mimeType || 'application/octet-stream');
  headers.set('content-length', String(stat.size));
  headers.set('content-disposition', contentDisposition(disposition, row[0].fileName || 'download'));
  headers.set('cache-control', 'private, no-cache, no-store, max-age=0, must-revalidate');

  const nodeStream = fs.createReadStream(absPath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  return new Response(webStream, { status: 200, headers });
}

