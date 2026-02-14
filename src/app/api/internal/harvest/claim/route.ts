import { NextResponse } from 'next/server';
import { and, eq, inArray, isNull, lte, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentItems, harvestJobs } from '@/lib/db/schema';
import { requireInternalToken } from '@/app/api/internal/_internal-auth';

function intFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.trunc(n));
}

export async function POST(req: Request) {
  const denied = requireInternalToken(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  const kind = String(body?.kind || 'headless_asset_discover');

  const maxAttempts = intFromEnv('PATRON_HUB_HEADLESS_MAX_ATTEMPTS', 6);
  const now = new Date();

  const jobs = await db
    .select({
      id: harvestJobs.id,
      attemptCount: harvestJobs.attemptCount,
      contentItemId: harvestJobs.contentItemId,
      externalUrl: contentItems.externalUrl,
      externalId: contentItems.externalId,
      title: contentItems.title,
    })
    .from(harvestJobs)
    .innerJoin(contentItems, eq(harvestJobs.contentItemId, contentItems.id))
    .where(
      and(
        eq(harvestJobs.kind, kind),
        inArray(harvestJobs.status, ['pending', 'running']),
        lt(harvestJobs.attemptCount, maxAttempts),
        or(isNull(harvestJobs.nextAttemptAt), lte(harvestJobs.nextAttemptAt, now))
      )
    )
    .orderBy(harvestJobs.nextAttemptAt, harvestJobs.id)
    .limit(1);

  const job = jobs[0];
  if (!job) return new NextResponse(null, { status: 204 });
  if (!job.externalUrl) {
    await db
      .update(harvestJobs)
      .set({ status: 'failed', lastError: 'Missing externalUrl on content item.', updatedAt: new Date() })
      .where(eq(harvestJobs.id, job.id));
    return new NextResponse(null, { status: 204 });
  }

  const startedAt = new Date();
  await db
    .update(harvestJobs)
    .set({
      status: 'running',
      attemptCount: (job.attemptCount ?? 0) + 1,
      lastAttemptAt: startedAt,
      updatedAt: startedAt,
    })
    .where(eq(harvestJobs.id, job.id));

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      kind,
      contentItemId: job.contentItemId,
      externalUrl: job.externalUrl,
      externalId: job.externalId,
      title: job.title,
    },
  });
}

