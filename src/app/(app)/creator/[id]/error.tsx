'use client';

export default function CreatorError(props: { error: Error & { digest?: string }; reset: () => void }) {
  const { error, reset } = props;
  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
      <h1 className="text-xl font-semibold">Creator page failed to load</h1>
      <p className="mt-2 text-sm text-zinc-400">
        {error?.message ? `Error: ${error.message}` : 'Unknown error.'}
      </p>
      {error?.digest && <p className="mt-1 text-xs text-zinc-500">Digest: {error.digest}</p>}
      <button
        onClick={reset}
        className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
      >
        Try again
      </button>
    </div>
  );
}

