import fs from 'fs';
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
  if (contentType === 'article') return 'txt';
  return 'bin';
}

export async function archiveContentItem(contentItemId: number): Promise<{ localPath: string; downloaded: boolean }> {
  const configuredArchiveDir = await getSetting<string | null>('archive_dir', null);
  const archiveRoot = resolveArchiveDirectory(configuredArchiveDir);

  const row = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
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
    // this gets replaced by downloader when a fileNameHint or URL file name is available
    fileName: `download.${contentTypeFallbackExtension(String(item.contentType))}`,
    archiveDir: configuredArchiveDir,
  });

  let absolutePath = baseOutputPath;
  let fileName = sanitizeFileName(`metadata.${contentTypeFallbackExtension(String(item.contentType))}`);
  let sizeBytes = 0;
  let mimeType: string | null = null;
  let downloaded = false;

  if (item.downloadUrl) {
    const result = await downloadToFile({
      url: item.downloadUrl,
      outputPath: baseOutputPath,
      fileNameHint: item.fileNameHint,
    });
    absolutePath = result.absolutePath;
    fileName = result.fileName;
    sizeBytes = result.sizeBytes;
    mimeType = result.mimeType;
    downloaded = true;
  } else {
    ensureArchiveDirectory(baseOutputPath);
    absolutePath = baseOutputPath;
    const payload = {
      contentItemId,
      title: item.title,
      platform: item.platform,
      creatorSlug: item.creatorSlug,
      contentType: item.contentType,
      publishedAt: publishedAt.toISOString(),
      createdAt: new Date().toISOString(),
      note: 'Placeholder file created by Patron Hub. No direct download URL available for this item yet.',
    };
    fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2), 'utf8');
    fileName = absolutePath.split('/').pop() || fileName;
    sizeBytes = fs.statSync(absolutePath).size;
    mimeType = 'application/json';
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
