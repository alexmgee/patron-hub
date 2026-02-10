'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

const examplePayload = {
  creators: [
    {
      name: 'Example Creator',
      slug: 'example-creator',
      subscription: {
        platform: 'patreon',
        tierName: 'Pro',
        costCents: 1000,
        currency: 'USD',
        memberSince: '2024-01-01',
        syncEnabled: true,
      },
      content: [
        {
          title: 'Welcome Post',
          contentType: 'article',
          publishedAt: '2024-01-02',
          tags: ['intro'],
          isSeen: false,
          isArchived: false,
        },
      ],
    },
  ],
};

export default function ImportPageClient() {
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(examplePayload, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown | null>(null);

  const isValidJson = useMemo(() => {
    try {
      JSON.parse(payloadText);
      return true;
    } catch {
      return false;
    }
  }, [payloadText]);

  const onImport = async () => {
    setBusy(true);
    setError(null);
    setResult(null);

    let json: unknown;
    try {
      json = JSON.parse(payloadText);
    } catch {
      setBusy(false);
      setError('Invalid JSON.');
      return;
    }

    const res = await fetch('/api/import/json', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(json),
    }).catch(() => null);

    if (!res) {
      setBusy(false);
      setError('Request failed.');
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setBusy(false);
      setError(data?.error || 'Import failed.');
      return;
    }

    setBusy(false);
    setResult(data?.result ?? null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold">Import JSON</h1>
            <p className="text-sm text-zinc-400">Seed creators/subscriptions/content with a simple JSON payload.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
            >
              Settings
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-zinc-500">
              POSTs to <span className="font-mono text-zinc-300">/api/import/json</span>
            </div>
            <button
              onClick={onImport}
              disabled={busy || !isValidJson}
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>

          <textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            className="mt-4 h-[420px] w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 font-mono text-xs text-zinc-100 focus:border-violet-500 focus:outline-none"
            spellCheck={false}
          />

          {!isValidJson && <div className="mt-2 text-sm text-red-300">JSON is invalid.</div>}

          {error && (
            <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {result !== null && (
            <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
              <div className="font-medium text-emerald-100">Imported</div>
              <pre className="mt-2 overflow-auto rounded bg-black/20 p-2 text-xs text-emerald-200">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
