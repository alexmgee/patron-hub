import { NextResponse } from 'next/server';

export function requireInternalToken(req: Request): NextResponse | null {
  const expected = process.env.PATRON_HUB_INTERNAL_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'internal API is not configured (missing PATRON_HUB_INTERNAL_TOKEN)' },
      { status: 501 }
    );
  }

  const provided = req.headers.get('x-patron-hub-internal-token') || '';
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  return null;
}

