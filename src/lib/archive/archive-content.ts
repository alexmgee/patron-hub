import fs from 'fs';
import path from 'path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentAssets, contentItems, creators, downloads, subscriptions } from '@/lib/db/schema';
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

async function upsertDownloadRow(params: {
  contentItemId: number;
  fileName: string;
  fileType: string;
  mimeType: string | null;
  sizeBytes: number;
  localPath: string;
}): Promise<void> {
  const existing = await db
    .select({ id: downloads.id })
    .from(downloads)
    .where(and(eq(downloads.contentItemId, params.contentItemId), eq(downloads.localPath, params.localPath)))
    .limit(1);

  if (!existing[0]) {
    await db.insert(downloads).values({
      contentItemId: params.contentItemId,
      fileName: params.fileName,
      fileType: params.fileType,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      localPath: params.localPath,
      downloadedAt: new Date(),
      createdAt: new Date(),
    });
    return;
  }

  await db
    .update(downloads)
    .set({
      fileName: params.fileName,
      fileType: params.fileType,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      downloadedAt: new Date(),
    })
    .where(eq(downloads.id, existing[0].id));
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

  const baseOutputPath = generateFilePath({
    platform: asPlatform(item.platform),
    creatorSlug: item.creatorSlug,
    publishedAt,
    title: item.title,
    // Path is used mainly to compute the per-post directory. Actual file name is chosen later.
    fileName: `download.${contentTypeFallbackExtension(String(item.contentType))}`,
    archiveDir: configuredArchiveDir,
  });

  const contentDir = path.dirname(baseOutputPath);

  // Always create a local, viewable snapshot so the "View" action can show something
  // even when attachments are not browser-previewable.
  const snapshotPath = path.join(contentDir, 'post.html');
  ensureArchiveDirectory(snapshotPath);

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
    // Store a readable capture of what we got. (We do not execute Patreon scripts.)
    bodyHtml = `<pre style="white-space:pre-wrap; word-break:break-word;">${escapeHtml(raw.slice(0, 5_000_000))}</pre>`;
  } else {
    bodyHtml = `<p><em>No post body was captured for this item.</em></p>`;
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
        <div>Archived snapshot (local copy)</div>
        <div>Published: ${escapeHtml(publishedAt.toISOString())}</div>
        ${sourceUrl ? `<div>Source: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sourceUrl)}</a></div>` : ''}
      </div>
      <div class="card">
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;

  fs.writeFileSync(snapshotPath, snapshot, 'utf8');
  const snapStat = fs.statSync(snapshotPath);
  const snapshotLocalPath = getRelativeArchivePathFromRoot(snapshotPath, archiveRoot);
  await upsertDownloadRow({
    contentItemId,
    fileName: 'post.html',
    fileType: 'snapshot',
    mimeType: 'text/html; charset=utf-8',
    sizeBytes: snapStat.size,
    localPath: snapshotLocalPath,
  });

  // Download all discovered assets for this post (attachments/media/etc).
  // Sync writes these into `content_assets` as it learns about them.
  const discovered = await db
    .select({
      id: contentAssets.id,
      url: contentAssets.url,
      fileNameHint: contentAssets.fileNameHint,
      assetType: contentAssets.assetType,
      status: contentAssets.status,
    })
    .from(contentAssets)
    .where(eq(contentAssets.contentItemId, contentItemId));

  const candidates: Array<{ assetId: number | null; url: string; fileNameHint: string | null; assetType: string; status: string }> =
    discovered.map((d) => ({
      assetId: d.id,
      url: d.url,
      fileNameHint: d.fileNameHint ?? null,
      assetType: d.assetType || 'attachment',
      status: d.status || 'discovered',
    }));

  // Back-compat: ensure the legacy `content_items.download_url` is treated as an asset too.
  if (item.downloadUrl && !candidates.some((c) => c.url === item.downloadUrl)) {
    candidates.push({
      assetId: null,
      url: item.downloadUrl,
      fileNameHint: item.fileNameHint ?? null,
      assetType: String(item.contentType || 'attachment'),
      status: 'discovered',
    });
  }

  let downloadedAny = false;
  const errors: string[] = [];
  const patreonCookie = process.env.PATRON_HUB_PATREON_COOKIE || null;

  for (const c of candidates) {
    // Skip snapshot-like entries; those should be `post.html` not a remote download.
    if (!c.url || !/^https?:\/\//i.test(c.url)) continue;
    if (c.status === 'downloaded') continue;

    try {
      const result = await downloadToFile({
        url: c.url,
        outputPath: path.join(contentDir, `download.${contentTypeFallbackExtension(String(item.contentType))}`),
        fileNameHint: c.fileNameHint,
        cookie: item.platform === 'patreon' ? patreonCookie : null,
        referer: item.platform === 'patreon' ? 'https://www.patreon.com/home' : null,
      });

      const localPath = getRelativeArchivePathFromRoot(result.absolutePath, archiveRoot);
      await upsertDownloadRow({
        contentItemId,
        fileName: result.fileName,
        fileType: c.assetType || 'attachment',
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        localPath,
      });

      downloadedAny = true;

      if (c.assetId) {
        await db
          .update(contentAssets)
          .set({
            status: 'downloaded',
            lastError: null,
            downloadedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contentAssets.id, c.assetId));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      if (c.assetId) {
        await db
          .update(contentAssets)
          .set({
            status: 'failed',
            lastError: msg,
            updatedAt: new Date(),
          })
          .where(eq(contentAssets.id, c.assetId));
      }
    }
  }

  const archiveError = errors.length > 0 ? errors.slice(0, 3).join(' | ') : null;

  await db
    .update(contentItems)
    .set({
      isArchived: true,
      archiveError,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, contentItemId));

  await db
    .update(contentItems)
    .set({ isSeen: true, seenAt: new Date() })
    .where(and(eq(contentItems.id, contentItemId), eq(contentItems.isSeen, false)));

  return { localPath: snapshotLocalPath, downloaded: downloadedAny };
}
