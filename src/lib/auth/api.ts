import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from './constants';
import { anyUsersExist, getUserBySessionToken, type AuthUser } from './session';

export async function getAuthUser(): Promise<AuthUser | null> {
  const hasUsers = await anyUsersExist();
  if (!hasUsers) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return getUserBySessionToken(token);
}
