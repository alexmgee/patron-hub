import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { deleteSessionByToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await deleteSessionByToken(token).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
