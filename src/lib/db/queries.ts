import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './index';
import { contentItems, creators, subscriptions } from './schema';
import type { ContentType, Platform } from './schema';

export type DashboardCreator = {
  creatorId: number;
  name: string;
  slug: string;
  avatarUrl: string | null;
  platform: Platform;
  tierName: string | null;
  costCents: number;
  currency: string;
  totalItems: number;
  newItemCount: number;
  lastPostDateIso: string | null;
  contentBreakdown: Partial<Record<ContentType, number>>;
};

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export async function getDashboardCreators(): Promise<DashboardCreator[]> {
  const base = await db
    .select({
      creatorId: creators.id,
      name: creators.name,
      slug: creators.slug,
      avatarUrl: creators.avatarUrl,
      subscriptionId: subscriptions.id,
      platform: subscriptions.platform,
      tierName: subscriptions.tierName,
      costCents: subscriptions.costCents,
      currency: subscriptions.currency,
    })
    .from(subscriptions)
    .innerJoin(creators, eq(subscriptions.creatorId, creators.id))
    .where(eq(subscriptions.status, 'active'));

  if (base.length === 0) return [];

  const subscriptionIds = base.map((r) => r.subscriptionId);

  const totalsBySubscription = await db
    .select({
      subscriptionId: contentItems.subscriptionId,
      totalItems: sql<number>`count(*)`,
      newItemCount: sql<number>`sum(case when ${contentItems.isSeen} = 0 then 1 else 0 end)`,
      lastPublishedAt: sql<number | null>`max(${contentItems.publishedAt})`,
    })
    .from(contentItems)
    .where(inArray(contentItems.subscriptionId, subscriptionIds))
    .groupBy(contentItems.subscriptionId);

  const breakdownRows = await db
    .select({
      subscriptionId: contentItems.subscriptionId,
      contentType: contentItems.contentType,
      count: sql<number>`count(*)`,
    })
    .from(contentItems)
    .where(inArray(contentItems.subscriptionId, subscriptionIds))
    .groupBy(contentItems.subscriptionId, contentItems.contentType);

  const totalsMap = new Map<number, { totalItems: number; newItemCount: number; lastPublishedAt: unknown }>();
  for (const t of totalsBySubscription) {
    totalsMap.set(t.subscriptionId, {
      totalItems: Number(t.totalItems ?? 0),
      newItemCount: Number(t.newItemCount ?? 0),
      lastPublishedAt: t.lastPublishedAt,
    });
  }

  const breakdownMap = new Map<number, Partial<Record<ContentType, number>>>();
  for (const row of breakdownRows) {
    const map = breakdownMap.get(row.subscriptionId) ?? {};
    // contentType is stored as text, so runtime could be any string; treat as ContentType for UI.
    (map as Record<string, number>)[row.contentType] = Number(row.count ?? 0);
    breakdownMap.set(row.subscriptionId, map);
  }

  return base.map((r) => {
    const totals = totalsMap.get(r.subscriptionId) ?? {
      totalItems: 0,
      newItemCount: 0,
      lastPublishedAt: null,
    };

    return {
      creatorId: r.creatorId,
      name: r.name,
      slug: r.slug,
      avatarUrl: r.avatarUrl ?? null,
      platform: r.platform as Platform,
      tierName: r.tierName ?? null,
      costCents: r.costCents,
      currency: r.currency,
      totalItems: totals.totalItems,
      newItemCount: totals.newItemCount,
      lastPostDateIso: toIsoOrNull(totals.lastPublishedAt),
      contentBreakdown: breakdownMap.get(r.subscriptionId) ?? {},
    };
  });
}

export type CreatorDetail = {
  id: number;
  subscriptionId: number;
  name: string;
  slug: string;
  avatarUrl: string | null;
  platform: Platform;
  tierName: string | null;
  costCents: number;
  currency: string;
  memberSinceIso: string | null;
  syncEnabled: boolean;
  autoDownloadEnabled: boolean;
};

export type CreatorContentItem = {
  id: number;
  title: string;
  description: string | null;
  contentType: ContentType;
  publishedAtIso: string | null;
  isSeen: boolean;
  isArchived: boolean;
  tags: string[];
  externalUrl: string | null;
};

export async function getCreatorDetail(creatorId: number): Promise<CreatorDetail | null> {
  const row = await db
    .select({
      id: creators.id,
      subscriptionId: subscriptions.id,
      name: creators.name,
      slug: creators.slug,
      avatarUrl: creators.avatarUrl,
      platform: subscriptions.platform,
      tierName: subscriptions.tierName,
      costCents: subscriptions.costCents,
      currency: subscriptions.currency,
      memberSince: subscriptions.memberSince,
      syncEnabled: subscriptions.syncEnabled,
      autoDownloadEnabled: subscriptions.autoDownloadEnabled,
    })
    .from(creators)
    .innerJoin(subscriptions, eq(subscriptions.creatorId, creators.id))
    .where(and(eq(creators.id, creatorId), eq(subscriptions.status, 'active')))
    .limit(1);

  const first = row[0];
  if (!first) return null;

  return {
    id: first.id,
    subscriptionId: first.subscriptionId,
    name: first.name,
    slug: first.slug,
    avatarUrl: first.avatarUrl ?? null,
    platform: first.platform as Platform,
    tierName: first.tierName ?? null,
    costCents: first.costCents,
    currency: first.currency,
    memberSinceIso: toIsoOrNull(first.memberSince),
    syncEnabled: Boolean(first.syncEnabled),
    autoDownloadEnabled: Boolean(first.autoDownloadEnabled),
  };
}

export async function getCreatorContentItems(creatorId: number): Promise<CreatorContentItem[]> {
  const subs = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.creatorId, creatorId), eq(subscriptions.status, 'active')));

  const subscriptionIds = subs.map((s) => s.id);
  if (subscriptionIds.length === 0) return [];

  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      description: contentItems.description,
      contentType: contentItems.contentType,
      publishedAt: contentItems.publishedAt,
      isSeen: contentItems.isSeen,
      isArchived: contentItems.isArchived,
      tags: contentItems.tags,
      externalUrl: contentItems.externalUrl,
    })
    .from(contentItems)
    .where(inArray(contentItems.subscriptionId, subscriptionIds))
    .orderBy(desc(contentItems.publishedAt), desc(contentItems.id));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    contentType: r.contentType as ContentType,
    publishedAtIso: toIsoOrNull(r.publishedAt),
    isSeen: Boolean(r.isSeen),
    isArchived: Boolean(r.isArchived),
    tags: (r.tags ?? []) as string[],
    externalUrl: r.externalUrl ?? null,
  }));
}

export async function getCreatorIdBySlug(slug: string): Promise<number | null> {
  const s = slug.trim();
  if (s.length === 0) return null;
  const row = await db.select({ id: creators.id }).from(creators).where(eq(creators.slug, s)).limit(1);
  return row[0]?.id ?? null;
}
