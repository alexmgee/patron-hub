import { redirect } from 'next/navigation';
import { getAuthState } from '@/lib/auth/server';

export default async function AppLayout(props: { children: React.ReactNode }) {
  const auth = await getAuthState();

  if (auth.needsSetup) {
    redirect('/setup');
  }

  if (!auth.user) {
    redirect('/login');
  }

  return props.children;
}

