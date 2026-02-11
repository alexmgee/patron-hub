import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentItems, creators, subscriptions, syncLogs } from '@/lib/db/schema';
import { archiveContentItem } from '@/lib/archive/archive-content';
import { fetchPatreonMemberships, fetchPatreonPosts } from '@/lib/adapters/patreon';

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
  itemsDownloaded: number;
  errors: string[];
};

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
          .select({ id: contentItems.id, isArchived: contentItems.isArchived })
          .from(contentItems)
          .where(and(eq(contentItems.subscriptionId, sub.id), eq(contentItems.externalId, post.externalId)))
          .limit(1);

        let contentItemId: number;
        if (!existingByExternalId[0]) {
          await db.insert(contentItems).values({
            subscriptionId: sub.id,
            externalId: post.externalId,
            externalUrl: post.externalUrl,
            downloadUrl: post.downloadUrl,
            fileNameHint: post.fileNameHint,
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
              downloadUrl: post.downloadUrl,
              fileNameHint: post.fileNameHint,
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

        if (contentItemId && opts.globalAutoDownloadEnabled && sub.autoDownloadEnabled && post.downloadUrl) {
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

  return stats;
}
