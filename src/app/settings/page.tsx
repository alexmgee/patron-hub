import Link from 'next/link';
import { getArchiveDirectory, getArchiveStats, formatBytes, isArchiveWritable } from '@/lib/archive';
import { getDataDirectory, getDatabasePath } from '@/lib/db';

export default async function SettingsPage() {
  const dbPath = getDatabasePath();
  const dataDir = getDataDirectory();
  const archiveDir = getArchiveDirectory();
  const writable = isArchiveWritable();
  const stats = getArchiveStats();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-sm text-zinc-400">Local-first configuration and paths.</p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="space-y-6">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">Storage</h2>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-zinc-500">Data directory</div>
                <div className="mt-1 rounded-lg bg-zinc-950/60 px-3 py-2 font-mono text-xs text-zinc-200">
                  {dataDir}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">SQLite database</div>
                <div className="mt-1 rounded-lg bg-zinc-950/60 px-3 py-2 font-mono text-xs text-zinc-200">
                  {dbPath}
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                Override data location with <span className="font-mono text-zinc-300">PATRON_HUB_DATA_DIR</span>.
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">Archive</h2>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-zinc-500">Archive directory</div>
                <div className="mt-1 rounded-lg bg-zinc-950/60 px-3 py-2 font-mono text-xs text-zinc-200">
                  {archiveDir}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span
                  className={`rounded-full px-2.5 py-1 font-medium ${
                    writable ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {writable ? 'Writable' : 'Not writable'}
                </span>
                <span className="text-zinc-500">
                  {stats.fileCount} files • {stats.directoryCount} folders • {formatBytes(stats.totalSize)}
                </span>
              </div>
              <div className="text-xs text-zinc-500">
                Override archive location with <span className="font-mono text-zinc-300">PATRON_HUB_ARCHIVE_DIR</span>.
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">Development Notes</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-400">
              <li>On first run, the app auto-creates the SQLite schema from the generated Drizzle SQL migration.</li>
              <li>In non-production, it also seeds sample creators/subscriptions/content so the UI is populated.</li>
              <li>
                You can disable this behavior by setting{' '}
                <span className="font-mono text-zinc-300">PATRON_HUB_SKIP_BOOTSTRAP=1</span>.
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

