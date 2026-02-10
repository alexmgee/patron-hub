import { NextResponse } from 'next/server';
import { importFromJson, type ImportPayload } from '@/lib/import/json';
import { getAuthUser } from '@/lib/auth/api';

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as ImportPayload | null;
  if (!payload || !Array.isArray(payload.creators)) {
    return NextResponse.json({ ok: false, error: 'Invalid payload. Expected { creators: [...] }' }, { status: 400 });
  }

  const result = await importFromJson(payload);
  return NextResponse.json({ ok: true, result });
}
