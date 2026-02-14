import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
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

function isInlineMime(mimeType: string | null): boolean {
  if (!mimeType) return false;
  const mime = mimeType.split(';')[0].trim().toLowerCase();
  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime.startsWith('text/') ||
    mime === 'application/pdf'
  );
}

function isInlineExtension(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return (
    ext === '.pdf' ||
    ext === '.jpg' ||
    ext === '.jpeg' ||
    ext === '.png' ||
    ext === '.gif' ||
    ext === '.webp' ||
    ext === '.mp4' ||
    ext === '.webm' ||
    ext === '.mp3' ||
    ext === '.m4a' ||
    ext === '.wav' ||
    ext === '.txt' ||
    ext === '.json'
  );
}

function sniffMimeTypeFromDisk(absPath: string): string | null {
  // Very small magic-byte sniffing. This is intentionally conservative.
  // If we can't confidently identify a previewable type, we fall back to download.
  try {
    const fd = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(512);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const b = buf.subarray(0, read);

    const startsWith = (hex: string) => b.length >= hex.length / 2 && b.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));

    // PDF: "%PDF-"
    if (b.length >= 5 && b.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
    // PNG
    if (startsWith('89504e470d0a1a0a')) return 'image/png';
    // JPEG
    if (startsWith('ffd8ff')) return 'image/jpeg';
    // GIF
    if (b.length >= 6) {
      const sig = b.subarray(0, 6).toString('ascii');
      if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
    }
    // WEBP: "RIFF....WEBP"
    if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    // ZIP: "PK\x03\x04" or empty archive variants.
    if (startsWith('504b0304') || startsWith('504b0506') || startsWith('504b0708')) return 'application/zip';
    // WAV: "RIFF....WAVE"
    if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE') {
      return 'audio/wav';
    }
    // MP3: "ID3" or frame sync 0xFFEx
    if (b.length >= 3 && b.subarray(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
    if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg';
    // MP4/M4A: "....ftyp"
    if (b.length >= 12 && b.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
    // WebM/Matroska: 1A 45 DF A3
    if (startsWith('1a45dfa3')) return 'video/webm';
  } catch {
    // ignore
  }
  return null;
}

function parseRange(rangeHeader: string | null, size: number): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;

  const startRaw = m[1];
  const endRaw = m[2];

  // "bytes=-500" means the last 500 bytes.
  if (startRaw === '' && endRaw !== '') {
    const suffixLen = Number(endRaw);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return null;
    const start = Math.max(0, size - suffixLen);
    return { start, end: size - 1 };
  }

  const start = Number(startRaw);
  const end = endRaw === '' ? size - 1 : Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < 0) return null;
  if (start > end) return null;
  if (start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function bytesToHuman(size: number): string {
  if (!Number.isFinite(size) || size < 0) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let n = size;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  const rounded = idx === 0 ? String(Math.trunc(n)) : n.toFixed(n >= 10 ? 1 : 2);
  return `${rounded} ${units[idx]}`;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { id: idParam } = await ctx.params;
  const contentItemId = Number(idParam);
  if (!Number.isFinite(contentItemId)) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
  }

  const url = new URL(req.url);
  const downloadIdParam = url.searchParams.get('downloadId');
  const which = url.searchParams.get('which'); // 'snapshot' | 'primary' | null

  const accept = req.headers.get('accept') || '';
  const wantsHtml = accept.includes('text/html');

  const rows = await db
    .select({
      id: downloads.id,
      localPath: downloads.localPath,
      fileName: downloads.fileName,
      fileType: downloads.fileType,
      mimeType: downloads.mimeType,
      sizeBytes: downloads.sizeBytes,
      downloadedAt: downloads.downloadedAt,
    })
    .from(downloads)
    .where(
      downloadIdParam && Number.isFinite(Number(downloadIdParam))
        ? and(eq(downloads.id, Number(downloadIdParam)), eq(downloads.contentItemId, contentItemId))
        : eq(downloads.contentItemId, contentItemId)
    );

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: 'no archived files found for this item' }, { status: 404 });
  }

  const snapshotRow =
    rows.find((r) => r.fileType === 'snapshot' || r.fileName === 'post.html' || (r.mimeType || '').startsWith('text/html')) ?? null;
  const primaryRow =
    rows.find((r) => r.fileType !== 'snapshot' && !(r.mimeType || '').startsWith('text/html')) ??
    rows.find((r) => r.fileType !== 'snapshot') ??
    null;

  const chosen =
    which === 'snapshot'
      ? snapshotRow ?? rows[0]
      : which === 'primary'
        ? primaryRow ?? rows[0]
        : downloadIdParam
          ? rows[0]
          : wantsHtml
            ? snapshotRow ?? primaryRow ?? rows[0]
            : primaryRow ?? snapshotRow ?? rows[0];

  const configuredArchiveDir = await getSetting<string | null>('archive_dir', null);
  const archiveRoot = resolveArchiveDirectory(configuredArchiveDir);

  let absPath: string;
  try {
    absPath = safeJoin(archiveRoot, chosen.localPath);
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

  const requested = url.searchParams.get('disposition'); // 'inline' | 'attachment'
  const rowMime = (chosen.mimeType || '').split(';')[0].trim();
  const sniffed = !rowMime || rowMime === 'application/octet-stream' ? sniffMimeTypeFromDisk(absPath) : null;
  const effectiveMime = rowMime || sniffed || '';
  const inferredInline = isInlineMime(effectiveMime || null) || isInlineExtension(chosen.fileName || '');
  const disposition = requested === 'inline' || requested === 'attachment' ? requested : inferredInline ? 'inline' : null;

  // If the browser is navigating directly to this endpoint for a non-previewable file,
  // return a small HTML page instead of streaming a binary blob into a tab (which often
  // looks like an infinite spinner).
  if (wantsHtml && !disposition) {
    const fileName = chosen.fileName || path.basename(chosen.localPath) || 'download';
    const archiveRootText = archiveRoot;
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Download: ${fileName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background: #09090b; color: #f4f4f5; margin: 0; padding: 24px; }
      .card { max-width: 720px; margin: 0 auto; background: #0f172a; border: 1px solid #27272a; border-radius: 14px; padding: 18px; }
      h1 { font-size: 16px; margin: 0 0 10px; }
      p { margin: 0 0 14px; color: #a1a1aa; line-height: 1.5; }
      .btnrow { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0 8px; }
      a.btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; border: 1px solid #3f3f46; text-decoration: none; color: #f4f4f5; background: #18181b; }
      a.primary { background: #16a34a22; border-color: #16a34a55; color: #86efac; }
      pre { margin: 14px 0 0; background: #09090b; border: 1px solid #27272a; padding: 12px; border-radius: 12px; overflow: auto; font-size: 12px; color: #d4d4d8; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Archived on your server (not previewable in the browser)</h1>
      <p>This item is already saved on the Ubuntu server’s disk. Your browser just can’t display this file type inline (common for <code>.zip</code>, <code>.tox</code>, and other binary formats).</p>
      <div class="btnrow">
        <a class="btn primary" href="${url.pathname}?disposition=attachment">Download to this computer</a>
        <a class="btn" href="#" onclick="copyPath(); return false;">Copy server file path</a>
      </div>
      <p style="margin-top: 10px;">Tip: if you set up an SMB share for the archive folder, you can open these files directly from Finder without using the browser download button.</p>
      <pre><code>${[
        `fileName: ${chosen.fileName || ''}`,
        `mimeType(db): ${chosen.mimeType || ''}`,
        `mimeType(sniffed): ${sniffed || ''}`,
        `size: ${bytesToHuman(stat.size)} (${stat.size} bytes)`,
        `archiveRoot: ${archiveRootText}`,
        `archiveRelativePath: ${chosen.localPath}`,
        `absolutePath: ${absPath}`,
      ].join('\n')}</code></pre>
    </div>
    <script>
      function copyPath() {
        const path = ${JSON.stringify(absPath)};
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(path).then(() => alert("Copied server path to clipboard."));
          return;
        }
        const ta = document.createElement("textarea");
        ta.value = path;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        alert("Copied server path to clipboard.");
      }
    </script>
  </body>
</html>`;
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'private, no-cache, no-store, max-age=0, must-revalidate',
      },
    });
  }

  const finalDisposition = disposition ?? 'attachment';

  const headers = new Headers();
  headers.set('content-type', effectiveMime || 'application/octet-stream');
  headers.set('accept-ranges', 'bytes');
  headers.set('content-disposition', contentDisposition(finalDisposition, chosen.fileName || 'download'));
  headers.set('cache-control', 'private, no-cache, no-store, max-age=0, must-revalidate');

  const range = parseRange(req.headers.get('range'), stat.size);
  if (range) {
    headers.set('content-length', String(range.end - range.start + 1));
    headers.set('content-range', `bytes ${range.start}-${range.end}/${stat.size}`);
  } else {
    headers.set('content-length', String(stat.size));
  }

  const nodeStream = fs.createReadStream(absPath, range ? { start: range.start, end: range.end } : undefined);

  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        controller.enqueue(buf as unknown as Uint8Array);
      });
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  if (range) return new Response(webStream, { status: 206, headers });
  return new Response(webStream, { status: 200, headers });
}
