import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { harvestJobs } from '@/lib/db/schema';
import { requireInternalToken } from '@/app/api/internal/_internal-auth';

function retryDelayMinutes(attemptCount: number): number {
  const minutes = 5 * Math.pow(2, Math.max(0, attemptCount - 1));
  return Math.min(720, Math.trunc(minutes));
}

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

  const body = (await req.json().catch(() => ({}))) as { jobId?: number; ok?: boolean; error?: string | null };
  const jobId = Number(body?.jobId);
  if (!Number.isFinite(jobId)) return NextResponse.json({ ok: false, error: 'invalid jobId' }, { status: 400 });

  const row = await db.select({ attemptCount: harvestJobs.attemptCount }).from(harvestJobs).where(eq(harvestJobs.id, jobId)).limit(1);
  const attemptCount = Number(row[0]?.attemptCount ?? 0);

  const maxAttempts = intFromEnv('PATRON_HUB_HEADLESS_MAX_ATTEMPTS', 6);
  const now = new Date();

  if (body?.ok) {
    await db
      .update(harvestJobs)
      .set({ status: 'done', nextAttemptAt: null, lastError: null, updatedAt: now })
      .where(eq(harvestJobs.id, jobId));
    return NextResponse.json({ ok: true });
  }

  const msg = (body?.error || 'headless job failed').slice(0, 500);
  const nextAttemptAt = attemptCount >= maxAttempts ? null : new Date(Date.now() + retryDelayMinutes(attemptCount) * 60 * 1000);
  await db
    .update(harvestJobs)
    .set({
      status: attemptCount >= maxAttempts ? 'failed' : 'pending',
      nextAttemptAt,
      lastError: msg,
      updatedAt: now,
    })
    .where(eq(harvestJobs.id, jobId));

  return NextResponse.json({ ok: true });
}

