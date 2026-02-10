import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentItems, creators, subscriptions } from '@/lib/db/schema';
import type { ContentType, Platform } from '@/lib/db/schema';

export type ImportPayload = {
  creators: Array<{
    name: string;
    slug?: string;
    avatarUrl?: string | null;
    bio?: string | null;
    websiteUrl?: string | null;
    subscription: {
      platform: Platform;
      tierName?: string | null;
      costCents?: number;
      currency?: string;
      billingCycle?: 'monthly' | 'yearly' | 'one-time';
      status?: 'active' | 'paused' | 'cancelled';
      memberSince?: string | null;
      syncEnabled?: boolean;
      autoDownloadEnabled?: boolean;
    };
    content?: Array<{
      title: string;
      description?: string | null;
      contentType: ContentType;
      publishedAt?: string | null;
      tags?: string[];
      externalUrl?: string | null;
      isSeen?: boolean;
      isArchived?: boolean;
    }>;
  }>;
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

function parseDateToMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export async function importFromJson(payload: ImportPayload): Promise<{
  creatorsCreated: number;
  creatorsUpdated: number;
  subscriptionsCreated: number;
  subscriptionsUpdated: number;
  contentItemsCreated: number;
  contentItemsSkipped: number;
}> {
  const now = new Date();
  let creatorsCreated = 0;
  let creatorsUpdated = 0;
  let subscriptionsCreated = 0;
  let subscriptionsUpdated = 0;
  let contentItemsCreated = 0;
  let contentItemsSkipped = 0;

  for (const c of payload.creators ?? []) {
    const name = String(c.name ?? '').trim();
    if (!name) continue;

    const slug = String(c.slug ?? '').trim() || slugify(name);
    if (!slug) continue;

    const existingCreator = await db
      .select({ id: creators.id, name: creators.name })
      .from(creators)
      .where(eq(creators.slug, slug))
      .limit(1);

    let creatorId: number | undefined = existingCreator[0]?.id;

    if (!creatorId) {
      await db.insert(creators).values({
        name,
        slug,
        avatarUrl: c.avatarUrl ?? null,
        bio: c.bio ?? null,
        websiteUrl: c.websiteUrl ?? null,
        createdAt: now,
        updatedAt: now,
      });
      creatorsCreated += 1;

      const created = await db.select({ id: creators.id }).from(creators).where(eq(creators.slug, slug)).limit(1);
      creatorId = created[0]?.id;
    } else if (existingCreator[0]?.name !== name) {
      await db.update(creators).set({ name, updatedAt: now }).where(eq(creators.id, creatorId));
      creatorsUpdated += 1;
    }

    if (!creatorId) continue;

    const sub = c.subscription;
    if (!sub?.platform) continue;

    const existingSub = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.creatorId, creatorId), eq(subscriptions.platform, sub.platform)))
      .orderBy(desc(subscriptions.id))
      .limit(1);

    const tierName = sub.tierName ?? null;
    const costCents = Number.isFinite(sub.costCents as number) ? Math.max(0, Math.trunc(sub.costCents as number)) : 0;
    const currency = sub.currency ? String(sub.currency).trim().toUpperCase().slice(0, 3) : 'USD';
    const billingCycle = sub.billingCycle ?? 'monthly';
    const status = sub.status ?? 'active';
    const memberSinceMs = parseDateToMs(sub.memberSince ?? null);
    const syncEnabled = typeof sub.syncEnabled === 'boolean' ? sub.syncEnabled : true;
    const autoDownloadEnabled = typeof sub.autoDownloadEnabled === 'boolean' ? sub.autoDownloadEnabled : true;

    let subscriptionId: number | undefined = existingSub[0]?.id;

    if (!subscriptionId) {
      await db.insert(subscriptions).values({
        creatorId,
        platform: sub.platform,
        tierName,
        costCents,
        currency,
        billingCycle,
        status,
        memberSince: memberSinceMs ? new Date(memberSinceMs) : null,
        syncEnabled,
        autoDownloadEnabled,
        createdAt: now,
        updatedAt: now,
      });
      subscriptionsCreated += 1;

      const created = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.creatorId, creatorId), eq(subscriptions.platform, sub.platform)))
        .orderBy(desc(subscriptions.id))
        .limit(1);
      subscriptionId = created[0]?.id;
    } else {
      await db
        .update(subscriptions)
        .set({
          tierName,
          costCents,
          currency,
          billingCycle,
          status,
          memberSince: memberSinceMs ? new Date(memberSinceMs) : null,
          syncEnabled,
          autoDownloadEnabled,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, subscriptionId));
      subscriptionsUpdated += 1;
    }

    if (!subscriptionId) continue;

    for (const item of c.content ?? []) {
      const title = String(item.title ?? '').trim();
      if (!title) continue;

      const publishedAtMs = parseDateToMs(item.publishedAt ?? null);
      const contentType = item.contentType;
      if (!contentType) continue;

      // Best-effort dedupe: same subscription + title + publishedAt.
      const existingItem = await db
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.subscriptionId, subscriptionId),
            eq(contentItems.title, title),
            publishedAtMs ? eq(contentItems.publishedAt, new Date(publishedAtMs)) : isNull(contentItems.publishedAt)
          )
        )
        .limit(1);

      if (existingItem[0]) {
        contentItemsSkipped += 1;
        continue;
      }

      await db.insert(contentItems).values({
        subscriptionId,
        externalId: null,
        externalUrl: item.externalUrl ?? null,
        title,
        description: item.description ?? null,
        contentType,
        publishedAt: publishedAtMs ? new Date(publishedAtMs) : null,
        isSeen: Boolean(item.isSeen ?? false),
        seenAt: item.isSeen ? now : null,
        tags: item.tags ?? [],
        autoTags: [],
        isArchived: Boolean(item.isArchived ?? false),
        archiveError: null,
        createdAt: now,
        updatedAt: now,
      });
      contentItemsCreated += 1;
    }
  }

  return {
    creatorsCreated,
    creatorsUpdated,
    subscriptionsCreated,
    subscriptionsUpdated,
    contentItemsCreated,
    contentItemsSkipped,
  };
}
