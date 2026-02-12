import { and, eq, inArray, isNull, lte, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentItems, creators, harvestJobs, subscriptions, syncLogs } from '@/lib/db/schema';
import { archiveContentItem } from '@/lib/archive/archive-content';
import { fetchPatreonMemberships, fetchPatreonPosts, resolvePatreonPostMedia } from '@/lib/adapters/patreon';

type SyncOptions = {
  rawCookie: string;
  globalAutoDownloadEnabled: boolean;
};

type SyncStats = {
  membershipsDiscovered: number;
  subscriptionsSynced: number;
  postsFound: number;
  postsInserted: number;
  postsUpdated: number;
  postsResolvedViaApi: number;
  postsResolvedViaHtml: number;
  harvestJobsQueued: number;
  harvestJobsProcessed: number;
  harvestJobsResolved: number;
  harvestJobsFailed: number;
  itemsDownloaded: number;
  errors: string[];
};

const DOWNLOAD_RESOLVE_JOB_KIND = 'download_url_resolve';

function intFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.trunc(n));
}

function retryDelayMinutes(attemptCount: number): number {
  // 5,10,20,40,... capped at 12h
  const minutes = 5 * Math.pow(2, Math.max(0, attemptCount - 1));
  return Math.min(720, Math.trunc(minutes));
}

async function enqueueDownloadResolveJob(contentItemId: number): Promise<boolean> {
  const now = new Date();
  const existing = await db
    .select({ id: harvestJobs.id })
    .from(harvestJobs)
    .where(and(eq(harvestJobs.contentItemId, contentItemId), eq(harvestJobs.kind, DOWNLOAD_RESOLVE_JOB_KIND)))
    .limit(1);

  if (!existing[0]) {
    await db.insert(harvestJobs).values({
      contentItemId,
      kind: DOWNLOAD_RESOLVE_JOB_KIND,
      status: 'pending',
      attemptCount: 0,
      lastAttemptAt: null,
      nextAttemptAt: now,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  }

  await db
    .update(harvestJobs)
    .set({
      status: 'pending',
      nextAttemptAt: now,
      updatedAt: now,
    })
    .where(eq(harvestJobs.id, existing[0].id));

  return false;
}

async function processPendingPatreonDownloadResolveJobs(
  rawCookie: string,
  globalAutoDownloadEnabled: boolean
): Promise<{
  processed: number;
  resolved: number;
  failed: number;
  downloaded: number;
  resolvedViaApi: number;
  resolvedViaHtml: number;
}> {
  const maxJobs = intFromEnv('PATRON_HUB_PATREON_HARVEST_JOB_LIMIT', 80);
  const maxAttempts = intFromEnv('PATRON_HUB_PATREON_HARVEST_MAX_ATTEMPTS', 8);
  const now = new Date();

  const jobs = await db
    .select({
      jobId: harvestJobs.id,
      attemptCount: harvestJobs.attemptCount,
      contentItemId: harvestJobs.contentItemId,
      externalId: contentItems.externalId,
      externalUrl: contentItems.externalUrl,
      hasDownloadUrl: contentItems.downloadUrl,
      autoDownloadEnabled: subscriptions.autoDownloadEnabled,
    })
    .from(harvestJobs)
    .innerJoin(contentItems, eq(harvestJobs.contentItemId, contentItems.id))
    .innerJoin(subscriptions, eq(contentItems.subscriptionId, subscriptions.id))
    .where(
      and(
        eq(harvestJobs.kind, DOWNLOAD_RESOLVE_JOB_KIND),
        inArray(harvestJobs.status, ['pending', 'running']),
        eq(subscriptions.platform, 'patreon'),
        isNull(contentItems.downloadUrl),
        lt(harvestJobs.attemptCount, maxAttempts),
        or(isNull(harvestJobs.nextAttemptAt), lte(harvestJobs.nextAttemptAt, now))
      )
    )
    .limit(maxJobs);

  let processed = 0;
  let resolved = 0;
  let failed = 0;
  let downloaded = 0;
  let resolvedViaApi = 0;
  let resolvedViaHtml = 0;

  for (const job of jobs) {
    processed += 1;
    const startedAt = new Date();
    const nextAttemptCount = (job.attemptCount ?? 0) + 1;

    await db
      .update(harvestJobs)
      .set({
        status: 'running',
        attemptCount: nextAttemptCount,
        lastAttemptAt: startedAt,
        updatedAt: startedAt,
      })
      .where(eq(harvestJobs.id, job.jobId));

    try {
      const resolvedMedia = await resolvePatreonPostMedia(rawCookie, {
        postId: job.externalId,
        postUrl: job.externalUrl,
      });

      if (!resolvedMedia.downloadUrl) {
        if (nextAttemptCount >= maxAttempts) {
          failed += 1;
          await db
            .update(harvestJobs)
            .set({
              status: 'failed',
              nextAttemptAt: null,
              lastError: 'No downloadable URL found after max attempts.',
              updatedAt: new Date(),
            })
            .where(eq(harvestJobs.id, job.jobId));
        } else {
          await db
            .update(harvestJobs)
            .set({
              status: 'pending',
              nextAttemptAt: new Date(Date.now() + retryDelayMinutes(nextAttemptCount) * 60 * 1000),
              lastError: 'No downloadable URL found.',
              updatedAt: new Date(),
            })
            .where(eq(harvestJobs.id, job.jobId));
        }
        continue;
      }

      await db
        .update(contentItems)
        .set({
          downloadUrl: resolvedMedia.downloadUrl,
          fileNameHint: resolvedMedia.fileNameHint ?? null,
          archiveError: null,
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, job.contentItemId));

      if (resolvedMedia.source === 'api-post') resolvedViaApi += 1;
      if (resolvedMedia.source === 'post-html') resolvedViaHtml += 1;

      if (globalAutoDownloadEnabled && job.autoDownloadEnabled) {
        try {
          const archive = await archiveContentItem(job.contentItemId);
          if (archive.downloaded) downloaded += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await db
            .update(contentItems)
            .set({ archiveError: `Auto-download failed after URL resolve: ${msg}`, updatedAt: new Date() })
            .where(eq(contentItems.id, job.contentItemId));
        }
      }

      resolved += 1;
      await db
        .update(harvestJobs)
        .set({
          status: 'done',
          nextAttemptAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(harvestJobs.id, job.jobId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (nextAttemptCount >= maxAttempts) {
        failed += 1;
        await db
          .update(harvestJobs)
          .set({
            status: 'failed',
            nextAttemptAt: null,
            lastError: message,
            updatedAt: new Date(),
          })
          .where(eq(harvestJobs.id, job.jobId));
      } else {
        await db
          .update(harvestJobs)
          .set({
            status: 'pending',
            nextAttemptAt: new Date(Date.now() + retryDelayMinutes(nextAttemptCount) * 60 * 1000),
            lastError: message,
            updatedAt: new Date(),
          })
          .where(eq(harvestJobs.id, job.jobId));
      }
    }
  }

  return { processed, resolved, failed, downloaded, resolvedViaApi, resolvedViaHtml };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function upsertPatreonMemberships(rawCookie: string): Promise<{ campaignIds: string[]; discovered: number }> {
  const memberships = await fetchPatreonMemberships(rawCookie);
  const now = new Date();

  for (const m of memberships) {
    const baseSlug = slugify(m.creatorName || m.campaignName || `patreon-${m.campaignId}`);
    const creatorSlug = `${baseSlug || 'patreon-creator'}-${m.campaignId}`.slice(0, 80);

    const existingCreator = await db.select({ id: creators.id }).from(creators).where(eq(creators.slug, creatorSlug)).limit(1);
    let creatorId = existingCreator[0]?.id;

    if (!creatorId) {
      await db.insert(creators).values({
        name: m.creatorName,
        slug: creatorSlug,
        avatarUrl: m.creatorAvatarUrl,
        bio: null,
        websiteUrl: m.profileUrl,
        createdAt: now,
        updatedAt: now,
      });
      const created = await db.select({ id: creators.id }).from(creators).where(eq(creators.slug, creatorSlug)).limit(1);
      creatorId = created[0]?.id;
    } else {
      await db
        .update(creators)
        .set({
          name: m.creatorName,
          avatarUrl: m.creatorAvatarUrl,
          websiteUrl: m.profileUrl,
          updatedAt: now,
        })
        .where(eq(creators.id, creatorId));
    }

    if (!creatorId) continue;

    const existingSub = await db
      .select({ id: subscriptions.id, syncEnabled: subscriptions.syncEnabled, autoDownloadEnabled: subscriptions.autoDownloadEnabled })
      .from(subscriptions)
      .where(and(eq(subscriptions.platform, 'patreon'), eq(subscriptions.externalId, m.campaignId)))
      .limit(1);

    if (!existingSub[0]) {
      await db.insert(subscriptions).values({
        creatorId,
        platform: 'patreon',
        externalId: m.campaignId,
        profileUrl: m.profileUrl,
        tierName: m.tierName,
        costCents: m.costCents,
        currency: m.currency,
        billingCycle: 'monthly',
        status: m.status,
        memberSince: m.memberSinceIso ? new Date(m.memberSinceIso) : null,
        syncEnabled: true,
        autoDownloadEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await db
        .update(subscriptions)
        .set({
          creatorId,
          profileUrl: m.profileUrl,
          tierName: m.tierName,
          costCents: m.costCents,
          currency: m.currency,
          billingCycle: 'monthly',
          status: m.status,
          memberSince: m.memberSinceIso ? new Date(m.memberSinceIso) : null,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existingSub[0].id));
    }
  }

  return {
    campaignIds: memberships.map((m) => m.campaignId),
    discovered: memberships.length,
  };
}

export async function syncPatreon(opts: SyncOptions): Promise<SyncStats> {
  const stats: SyncStats = {
    membershipsDiscovered: 0,
    subscriptionsSynced: 0,
    postsFound: 0,
    postsInserted: 0,
    postsUpdated: 0,
    postsResolvedViaApi: 0,
    postsResolvedViaHtml: 0,
    harvestJobsQueued: 0,
    harvestJobsProcessed: 0,
    harvestJobsResolved: 0,
    harvestJobsFailed: 0,
    itemsDownloaded: 0,
    errors: [],
  };

  const { campaignIds, discovered } = await upsertPatreonMemberships(opts.rawCookie);
  stats.membershipsDiscovered = discovered;
  if (campaignIds.length === 0) return stats;

  const pats = await db
    .select({
      id: subscriptions.id,
      externalId: subscriptions.externalId,
      syncEnabled: subscriptions.syncEnabled,
      autoDownloadEnabled: subscriptions.autoDownloadEnabled,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.platform, 'patreon'),
        eq(subscriptions.status, 'active'),
        eq(subscriptions.syncEnabled, true),
        inArray(subscriptions.externalId, campaignIds)
      )
    );

  for (const sub of pats) {
    if (!sub.externalId) continue;

    const syncStarted = new Date();
    let itemsFound = 0;
    let itemsDownloaded = 0;
    let status: 'success' | 'failed' = 'success';
    const errors: string[] = [];

    try {
      const posts = await fetchPatreonPosts(opts.rawCookie, sub.externalId);
      itemsFound = posts.length;
      stats.postsFound += posts.length;

      for (const post of posts) {
        const publishedAt = post.publishedAtIso ? new Date(post.publishedAtIso) : null;
        const existingByExternalId = await db
          .select({
            id: contentItems.id,
            isArchived: contentItems.isArchived,
            existingDownloadUrl: contentItems.downloadUrl,
            existingFileNameHint: contentItems.fileNameHint,
          })
          .from(contentItems)
          .where(and(eq(contentItems.subscriptionId, sub.id), eq(contentItems.externalId, post.externalId)))
          .limit(1);

        let resolvedDownloadUrl = post.downloadUrl;
        let resolvedFileNameHint = post.fileNameHint;
        if (!resolvedDownloadUrl && (post.externalId || post.externalUrl)) {
          const resolved = await resolvePatreonPostMedia(opts.rawCookie, {
            postId: post.externalId,
            postUrl: post.externalUrl,
          });
          if (resolved.downloadUrl) {
            resolvedDownloadUrl = resolved.downloadUrl;
            resolvedFileNameHint = resolved.fileNameHint ?? resolvedFileNameHint;
            if (resolved.source === 'api-post') stats.postsResolvedViaApi += 1;
            if (resolved.source === 'post-html') stats.postsResolvedViaHtml += 1;
          }
        }

        let contentItemId: number;
        if (!existingByExternalId[0]) {
          await db.insert(contentItems).values({
            subscriptionId: sub.id,
            externalId: post.externalId,
            externalUrl: post.externalUrl,
            downloadUrl: resolvedDownloadUrl,
            fileNameHint: resolvedFileNameHint,
            title: post.title,
            description: post.description,
            contentType: post.contentType,
            publishedAt,
            isSeen: false,
            seenAt: null,
            tags: post.tags,
            autoTags: [],
            isArchived: false,
            archiveError: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          const created = await db
            .select({ id: contentItems.id })
            .from(contentItems)
            .where(and(eq(contentItems.subscriptionId, sub.id), eq(contentItems.externalId, post.externalId)))
            .limit(1);
          contentItemId = created[0]?.id ?? 0;
          stats.postsInserted += 1;
        } else {
          contentItemId = existingByExternalId[0].id;
          await db
            .update(contentItems)
            .set({
              externalUrl: post.externalUrl,
              downloadUrl: resolvedDownloadUrl ?? existingByExternalId[0].existingDownloadUrl,
              fileNameHint: resolvedFileNameHint ?? existingByExternalId[0].existingFileNameHint,
              title: post.title,
              description: post.description,
              contentType: post.contentType,
              publishedAt,
              tags: post.tags,
              updatedAt: new Date(),
            })
            .where(eq(contentItems.id, contentItemId));
          stats.postsUpdated += 1;
        }

        if (
          contentItemId &&
          !resolvedDownloadUrl &&
          !existingByExternalId[0]?.existingDownloadUrl &&
          (post.externalId || post.externalUrl)
        ) {
          const inserted = await enqueueDownloadResolveJob(contentItemId);
          if (inserted) stats.harvestJobsQueued += 1;
        }

        const effectiveDownloadUrl = resolvedDownloadUrl ?? existingByExternalId[0]?.existingDownloadUrl ?? null;
        if (contentItemId && opts.globalAutoDownloadEnabled && sub.autoDownloadEnabled && effectiveDownloadUrl) {
          try {
            const result = await archiveContentItem(contentItemId);
            if (result.downloaded) {
              itemsDownloaded += 1;
              stats.itemsDownloaded += 1;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`Archive failed for content ${contentItemId}: ${message}`);
          }
        }
      }

      await db.update(subscriptions).set({ lastSyncedAt: new Date() }).where(eq(subscriptions.id, sub.id));
      stats.subscriptionsSynced += 1;
    } catch (err) {
      status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      stats.errors.push(`Subscription ${sub.id}: ${message}`);
    } finally {
      await db.insert(syncLogs).values({
        subscriptionId: sub.id,
        startedAt: syncStarted,
        completedAt: new Date(),
        status,
        itemsFound,
        itemsDownloaded,
        errors,
      });
    }
  }

  // Process unresolved download-url jobs for older backlog items too.
  const processedJobs = await processPendingPatreonDownloadResolveJobs(
    opts.rawCookie,
    opts.globalAutoDownloadEnabled
  );
  stats.harvestJobsProcessed += processedJobs.processed;
  stats.harvestJobsResolved += processedJobs.resolved;
  stats.harvestJobsFailed += processedJobs.failed;
  stats.itemsDownloaded += processedJobs.downloaded;
  stats.postsResolvedViaApi += processedJobs.resolvedViaApi;
  stats.postsResolvedViaHtml += processedJobs.resolvedViaHtml;

  return stats;
}
