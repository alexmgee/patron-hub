import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creators, subscriptions } from '@/lib/db/schema';

type Payload = {
  creatorName: string;
  creatorSlug: string;
  platform: 'patreon' | 'substack' | 'gumroad' | 'discord';
  tierName?: string;
  costCents?: number;
  currency?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Payload | null;
  if (!body) return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });

  const creatorName = String(body.creatorName ?? '').trim();
  const creatorSlug = String(body.creatorSlug ?? '').trim();
  const platform = body.platform;

  if (!creatorName) return NextResponse.json({ ok: false, error: 'creatorName required' }, { status: 400 });
  if (!creatorSlug) return NextResponse.json({ ok: false, error: 'creatorSlug required' }, { status: 400 });
  if (!platform) return NextResponse.json({ ok: false, error: 'platform required' }, { status: 400 });

  const tierName = body.tierName ? String(body.tierName).trim() : null;
  const costCents = Number.isFinite(body.costCents as number) ? Math.max(0, Math.trunc(body.costCents as number)) : 0;
  const currency = body.currency ? String(body.currency).trim().toUpperCase().slice(0, 3) : 'USD';

  const now = new Date();

  // Reuse creator if slug already exists.
  const existing = await db.select({ id: creators.id }).from(creators).where(eq(creators.slug, creatorSlug)).limit(1);
  let creatorId = existing[0]?.id;

  if (!creatorId) {
    await db.insert(creators).values({
      name: creatorName,
      slug: creatorSlug,
      avatarUrl: null,
      bio: null,
      websiteUrl: null,
      createdAt: now,
      updatedAt: now,
    });

    const created = await db.select({ id: creators.id }).from(creators).where(eq(creators.slug, creatorSlug)).limit(1);
    creatorId = created[0]?.id;
  }

  if (!creatorId) return NextResponse.json({ ok: false, error: 'failed to create creator' }, { status: 500 });

  await db.insert(subscriptions).values({
    creatorId,
    platform,
    tierName,
    costCents,
    currency,
    billingCycle: 'monthly',
    status: 'active',
    memberSince: now,
    syncEnabled: platform !== 'gumroad',
    createdAt: now,
    updatedAt: now,
  });

  const createdSub = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.creatorId, creatorId), eq(subscriptions.platform, platform)))
    .orderBy(desc(subscriptions.id))
    .limit(1);

  return NextResponse.json({ ok: true, creatorId, subscriptionId: createdSub[0]?.id ?? null });
}
