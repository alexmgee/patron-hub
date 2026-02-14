import Link from 'next/link';
import { formatBytes, getArchiveStatsForRoot, isArchiveWritable, resolveArchiveDirectory } from '@/lib/archive';
import { getDataDirectory, getDatabasePath } from '@/lib/db';
import { getSetting, setSetting } from '@/lib/db/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const dbPath = getDatabasePath();
  const dataDir = getDataDirectory();
  const configuredArchiveDir = await getSetting<string | null>('archive_dir', null);
  const autoSyncEnabled = await getSetting<boolean>('auto_sync_enabled', true);
  const autoDownloadEnabled = await getSetting<boolean>('auto_download_enabled', true);
  const patreonCookie = await getSetting<string | null>('patreon_cookie', null);
  const envPatreonCookie = (process.env.PATRON_HUB_PATREON_COOKIE ?? '').trim();
  const patreonCookieEditable = envPatreonCookie.length === 0;

  const archiveDir = resolveArchiveDirectory(configuredArchiveDir);
  const writable = isArchiveWritable(configuredArchiveDir);
  const stats = getArchiveStatsForRoot(configuredArchiveDir);

  async function updateSettings(formData: FormData) {
    'use server';

    const archiveDirInput = String(formData.get('archive_dir') ?? '').trim();
    const archiveDirValue = archiveDirInput.length === 0 ? null : archiveDirInput;

    const autoSync = formData.get('auto_sync_enabled') === 'on';
    const autoDownload = formData.get('auto_download_enabled') === 'on';
    const patreonCookieInput = String(formData.get('patreon_cookie') ?? '').trim();

    await setSetting('archive_dir', archiveDirValue);
    await setSetting('auto_sync_enabled', autoSync);
    await setSetting('auto_download_enabled', autoDownload);
    // When an env override is set, editing the cookie in the UI is confusing and may fail due to size limits.
    // Keep the SQLite value unchanged in that case.
    if (patreonCookieEditable) {
      await setSetting('patreon_cookie', patreonCookieInput.length > 0 ? patreonCookieInput : null);
    }
  }

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
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">App Settings</h2>
                <p className="mt-1 text-sm text-zinc-500">Persisted in SQLite. Env vars still override where noted.</p>
              </div>
              <Link
                href="/import"
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
              >
                Import JSON
              </Link>
            </div>

            <form action={updateSettings} className="mt-4 space-y-4">
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Archive directory (optional)</div>
                <input
                  name="archive_dir"
                  defaultValue={configuredArchiveDir ?? ''}
                  placeholder={archiveDir}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                />
                <div className="mt-1 text-xs text-zinc-600">
                  Effective: <span className="font-mono">{archiveDir}</span>
                </div>
                {process.env.PATRON_HUB_ARCHIVE_DIR && (
                  <div className="mt-1 text-xs text-zinc-500">
                    Env override in effect: <span className="font-mono text-zinc-300">PATRON_HUB_ARCHIVE_DIR</span>
                  </div>
                )}
              </label>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" name="auto_sync_enabled" defaultChecked={autoSyncEnabled} />
                  Background auto-sync (not yet implemented)
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" name="auto_download_enabled" defaultChecked={autoDownloadEnabled} />
                  Auto-download enabled
                </label>
              </div>

              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Patreon cookie (for sync)</div>
                <textarea
                  name="patreon_cookie"
                  defaultValue={patreonCookieEditable ? (patreonCookie ?? '') : ''}
                  rows={3}
                  disabled={!patreonCookieEditable}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none font-mono disabled:opacity-60"
                  placeholder={
                    patreonCookieEditable
                      ? 'Paste full Cookie header value from an authenticated Patreon browser session'
                      : 'Cookie is being provided via env var (edit your .env on the server instead)'
                  }
                />
                <div className="mt-1 text-xs text-zinc-600">
                  Stored in local SQLite settings. You can also set <span className="font-mono">PATRON_HUB_PATREON_COOKIE</span> as an env var.
                </div>
                {process.env.PATRON_HUB_PATREON_COOKIE && (
                  <div className="mt-1 text-xs text-zinc-500">
                    Env override in effect: <span className="font-mono text-zinc-300">PATRON_HUB_PATREON_COOKIE</span> (editing disabled here)
                  </div>
                )}
              </label>

              <div className="flex items-center justify-end">
                <button className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500">
                  Save
                </button>
              </div>
            </form>
          </section>

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
