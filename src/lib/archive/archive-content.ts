import fs from 'fs';
import path from 'path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentItems, creators, downloads, subscriptions } from '@/lib/db/schema';
import type { Platform } from '@/lib/db/schema';
import {
  ensureArchiveDirectory,
  generateFilePath,
  getRelativeArchivePathFromRoot,
  resolveArchiveDirectory,
  sanitizeFileName,
} from '@/lib/archive';
import { getSetting } from '@/lib/db/settings';
import { downloadToFile } from '@/lib/downloader';

const PLATFORMS: Platform[] = ['patreon', 'substack', 'gumroad', 'discord'];

function asPlatform(value: string): Platform {
  if (PLATFORMS.includes(value as Platform)) return value as Platform;
  return 'patreon';
}

function contentTypeFallbackExtension(contentType: string): string {
  if (contentType === 'pdf') return 'pdf';
  if (contentType === 'video') return 'mp4';
  if (contentType === 'audio') return 'mp3';
  if (contentType === 'image') return 'jpg';
  if (contentType === 'article') return 'html';
  return 'bin';
}

function stripScripts(html: string): string {
  // Basic sanitization: remove scripts/styles so snapshots don't execute arbitrary code.
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPatreonHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'patreon.com' || h.endsWith('.patreon.com');
}

function normalizeCookieHeader(raw: string): string {
  const trimmed = raw.trim();
  for (const ch of trimmed) {
    if (ch.charCodeAt(0) > 255) {
      throw new Error(
        'Patreon cookie contains unsupported non-ASCII characters (often caused by truncated copy like “…”). Re-copy the full raw Cookie header value.'
      );
    }
  }
  if (trimmed.includes('=')) return trimmed;
  return `session_id=${trimmed}`;
}

async function fetchPatreonHtmlSnapshot(url: string, rawCookie: string): Promise<string> {
  const maxRedirects = 10;
  let current = url;
  const cookie = normalizeCookieHeader(rawCookie);

  for (let i = 0; i < maxRedirects; i += 1) {
    const parsed = new URL(current);
    if (!isPatreonHost(parsed.hostname)) {
      throw new Error(`Refusing to snapshot non-Patreon URL: ${parsed.hostname}`);
    }

    const res = await fetch(current, {
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        cookie,
        'user-agent': 'PatronHub/0.1 (+self-hosted)',
        referer: 'https://www.patreon.com/home',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('Patreon returned redirect with no Location header');
      current = new URL(loc, current).toString();
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Patreon snapshot fetch failed (${res.status}): ${body.slice(0, 300)}`);
    }

    return res.text();
  }

  throw new Error(`Too many redirects while snapshotting: ${url}`);
}

export async function archiveContentItem(contentItemId: number): Promise<{ localPath: string; downloaded: boolean }> {
  const configuredArchiveDir = await getSetting<string | null>('archive_dir', null);
  const archiveRoot = resolveArchiveDirectory(configuredArchiveDir);

  const row = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      description: contentItems.description,
      externalUrl: contentItems.externalUrl,
      contentType: contentItems.contentType,
      publishedAt: contentItems.publishedAt,
      downloadUrl: contentItems.downloadUrl,
      fileNameHint: contentItems.fileNameHint,
      subscriptionId: contentItems.subscriptionId,
      platform: subscriptions.platform,
      creatorSlug: creators.slug,
    })
    .from(contentItems)
    .innerJoin(subscriptions, eq(contentItems.subscriptionId, subscriptions.id))
    .innerJoin(creators, eq(subscriptions.creatorId, creators.id))
    .where(eq(contentItems.id, contentItemId))
    .limit(1);

  const item = row[0];
  if (!item) throw new Error('content item not found');

  const publishedAt =
    item.publishedAt instanceof Date
      ? item.publishedAt
      : item.publishedAt
        ? new Date(item.publishedAt as unknown as number)
        : new Date();

  const baseFileName = item.downloadUrl
    ? `download.${contentTypeFallbackExtension(String(item.contentType))}`
    : `post.html`;

  const baseOutputPath = generateFilePath({
    platform: asPlatform(item.platform),
    creatorSlug: item.creatorSlug,
    publishedAt,
    title: item.title,
    // this gets replaced by downloader when a fileNameHint or URL file name is available
    fileName: baseFileName,
    archiveDir: configuredArchiveDir,
  });

  let absolutePath = baseOutputPath;
  let fileName = path.basename(baseOutputPath);
  let sizeBytes = 0;
  let mimeType: string | null = null;
  let downloaded = false;

  if (item.downloadUrl) {
    const patreonCookie = process.env.PATRON_HUB_PATREON_COOKIE || null;
    const result = await downloadToFile({
      url: item.downloadUrl,
      outputPath: baseOutputPath,
      fileNameHint: item.fileNameHint,
      cookie: item.platform === 'patreon' ? patreonCookie : null,
      referer: item.platform === 'patreon' ? 'https://www.patreon.com/home' : null,
    });
    absolutePath = result.absolutePath;
    fileName = result.fileName;
    sizeBytes = result.sizeBytes;
    mimeType = result.mimeType;
    downloaded = true;
  } else {
    // No direct download URL. Create a *real* local snapshot that is viewable in the browser:
    // - Prefer API post content already stored in DB (item.description)
    // - Fallback to a raw HTML snapshot of the Patreon post page (item.externalUrl)
    ensureArchiveDirectory(baseOutputPath);
    absolutePath = baseOutputPath;

    const title = escapeHtml(item.title);
    const sourceUrl = typeof item.externalUrl === 'string' ? item.externalUrl : null;
    const hasDbContent = typeof item.description === 'string' && item.description.trim().length > 0;

    let bodyHtml = '';
    if (hasDbContent) {
      bodyHtml = stripScripts(String(item.description));
    } else if (item.platform === 'patreon' && sourceUrl) {
      const cookie = process.env.PATRON_HUB_PATREON_COOKIE || '';
      if (!cookie) throw new Error('Cannot snapshot Patreon HTML without PATRON_HUB_PATREON_COOKIE set');
      const raw = await fetchPatreonHtmlSnapshot(sourceUrl, cookie);
      // The full Patreon HTML isn't ideal for offline viewing, but it's still a real snapshot of what you received.
      bodyHtml = `<pre style="white-space:pre-wrap; word-break:break-word;">${escapeHtml(raw.slice(0, 5_000_000))}</pre>`;
    } else {
      throw new Error('No downloadUrl and no snapshot source available (missing post content and externalUrl).');
    }

    const snapshot = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background: #09090b; color: #f4f4f5; margin: 0; padding: 24px; }
      .wrap { max-width: 980px; margin: 0 auto; }
      .meta { color: #a1a1aa; font-size: 13px; margin: 6px 0 18px; }
      .card { background: #0b1220; border: 1px solid #27272a; border-radius: 14px; padding: 18px; }
      a { color: #86efac; }
      img, video { max-width: 100%; height: auto; }
      pre { margin: 0; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1 style="font-size:18px; margin:0 0 6px;">${title}</h1>
      <div class="meta">
        <div>Archived snapshot (no direct download URL for this item)</div>
        <div>Published: ${escapeHtml(publishedAt.toISOString())}</div>
        ${sourceUrl ? `<div>Source: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sourceUrl)}</a></div>` : ''}
      </div>
      <div class="card">
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;

    fs.writeFileSync(absolutePath, snapshot, 'utf8');
    fileName = path.basename(absolutePath) || fileName;
    sizeBytes = fs.statSync(absolutePath).size;
    mimeType = 'text/html; charset=utf-8';
    downloaded = false;
  }

  const localPath = getRelativeArchivePathFromRoot(absolutePath, archiveRoot);

  await db.update(contentItems).set({ isArchived: true, archiveError: null }).where(eq(contentItems.id, contentItemId));

  const existing = await db
    .select({ id: downloads.id })
    .from(downloads)
    .where(eq(downloads.contentItemId, contentItemId))
    .limit(1);

  if (!existing[0]) {
    await db.insert(downloads).values({
      contentItemId,
      fileName,
      fileType: String(item.contentType),
      mimeType,
      sizeBytes,
      localPath,
      downloadedAt: new Date(),
    });
  } else {
    await db
      .update(downloads)
      .set({
        fileName,
        fileType: String(item.contentType),
        mimeType,
        sizeBytes,
        localPath,
        downloadedAt: new Date(),
      })
      .where(eq(downloads.id, existing[0].id));
  }

  await db
    .update(contentItems)
    .set({ isSeen: true, seenAt: new Date() })
    .where(and(eq(contentItems.id, contentItemId), eq(contentItems.isSeen, false)));

  return { localPath, downloaded };
}
