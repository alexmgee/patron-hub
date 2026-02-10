import { redirect } from 'next/navigation';
import LoginPageClient from '@/components/LoginPageClient';
import { getAuthState } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const auth = await getAuthState();
  if (auth.needsSetup) redirect('/setup');
  if (auth.user) redirect('/');

  return <LoginPageClient />;
}

