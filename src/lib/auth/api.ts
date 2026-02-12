import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, isAuthDisabled } from './constants';
import { anyUsersExist, getUserBySessionToken, type AuthUser } from './session';

export async function getAuthUser(): Promise<AuthUser | null> {
  if (isAuthDisabled()) {
    return {
      id: 0,
      email: 'no-auth@local',
      isAdmin: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  const hasUsers = await anyUsersExist();
  if (!hasUsers) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return getUserBySessionToken(token);
}
