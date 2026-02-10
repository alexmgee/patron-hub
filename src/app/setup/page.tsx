import { redirect } from 'next/navigation';
import SetupPageClient from '@/components/SetupPageClient';
import { getAuthState } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const auth = await getAuthState();
  if (!auth.needsSetup) {
    // If already configured, send user to login/dashboard.
    if (auth.user) redirect('/');
    redirect('/login');
  }

  return <SetupPageClient />;
}

