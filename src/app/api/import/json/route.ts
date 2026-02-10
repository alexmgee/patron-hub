import { NextResponse } from 'next/server';
import { importFromJson, type ImportPayload } from '@/lib/import/json';

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as ImportPayload | null;
  if (!payload || !Array.isArray(payload.creators)) {
    return NextResponse.json({ ok: false, error: 'Invalid payload. Expected { creators: [...] }' }, { status: 400 });
  }

  const result = await importFromJson(payload);
  return NextResponse.json({ ok: true, result });
}

