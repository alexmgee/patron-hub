import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from './constants';
import { anyUsersExist, getUserBySessionToken, type AuthUser } from './session';

export type AuthState =
  | { needsSetup: true; user: null }
  | { needsSetup: false; user: AuthUser | null };

export async function getAuthState(): Promise<AuthState> {
  const hasUsers = await anyUsersExist();
  if (!hasUsers) return { needsSetup: true, user: null };

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return { needsSetup: false, user: null };

  const user = await getUserBySessionToken(token);
  return { needsSetup: false, user };
}
