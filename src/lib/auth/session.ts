import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions, users } from '@/lib/db/schema';
import type { User } from '@/lib/db/schema';
import { SESSION_TTL_SECONDS } from './constants';
import { hashToken, newSessionToken } from './token';

export type AuthUser = Omit<User, 'passwordHash'>;

export async function anyUsersExist(): Promise<boolean> {
  const row = await db.select({ id: users.id }).from(users).limit(1);
  return row.length > 0;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(params: { email: string; passwordHash: string; isAdmin?: boolean }): Promise<User> {
  const now = new Date();
  await db.insert(users).values({
    email: params.email,
    passwordHash: params.passwordHash,
    isAdmin: params.isAdmin ?? true,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.select().from(users).where(eq(users.email, params.email)).limit(1);
  if (!created[0]) throw new Error('Failed to create user');
  return created[0];
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const tokenHash = hashToken(token);

  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + SESSION_TTL_SECONDS * 1000);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    createdAt: new Date(nowMs),
    lastSeenAt: new Date(nowMs),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function getUserBySessionToken(token: string): Promise<AuthUser | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Best-effort update lastSeenAt (avoid blocking auth if this fails).
  try {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.sessionId));
  } catch {
    // ignore
  }

  return {
    id: row.id,
    email: row.email,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deleteSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
