import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '@/lib/auth/constants';
import { anyUsersExist, createSession, createUser } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';

export const dynamic = 'force-dynamic';

type Payload = {
  email: string;
  password: string;
};

export async function POST(req: Request) {
  const hasUsers = await anyUsersExist();
  if (hasUsers) {
    return NextResponse.json({ ok: false, error: 'setup already completed' }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as Payload | null;
  if (!body) return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) return NextResponse.json({ ok: false, error: 'email and password required' }, { status: 400 });
  if (password.length < 10) return NextResponse.json({ ok: false, error: 'password must be at least 10 characters' }, { status: 400 });

  const user = await createUser({ email, passwordHash: hashPassword(password), isAdmin: true });
  const { token, expiresAt } = await createSession(user.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    expires: expiresAt,
  });
  return res;
}
