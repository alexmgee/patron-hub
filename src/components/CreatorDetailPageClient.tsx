'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Video,
  Image as ImageIcon,
  FileText,
  Music,
  Folder,
  Tag,
  ArrowLeft,
  Search,
  Settings,
  Filter,
  Eye,
  Clock,
  Download,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { ContentType, Platform } from '@/lib/db/schema';
import type { CreatorContentItem, CreatorDetail } from '@/lib/db/queries';

const contentTypeIcons: Record<ContentType, React.ReactNode> = {
  video: <Video className="h-4 w-4" />,
  image: <ImageIcon className="h-4 w-4" />,
  pdf: <FileText className="h-4 w-4" />,
  audio: <Music className="h-4 w-4" />,
  article: <FileText className="h-4 w-4" />,
  attachment: <FileText className="h-4 w-4" />,
};

const contentTypeLabels: Record<ContentType, string> = {
  video: 'Videos',
  image: 'Images',
  pdf: 'PDFs',
  audio: 'Audio',
  article: 'Articles',
  attachment: 'Attachments',
};

const platformLabel: Record<Platform, string> = {
  patreon: 'Patreon',
  substack: 'Substack',
  gumroad: 'Gumroad',
  discord: 'Discord',
};

export default function CreatorDetailPageClient(props: { creator: CreatorDetail; items: CreatorContentItem[] }) {
  const { creator, items } = props;

  const [filter, setFilter] = useState<'all' | 'new'>('all');
  const [selectedType, setSelectedType] = useState<ContentType | 'all'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncEnabled, setSyncEnabled] = useState<boolean>(creator.syncEnabled);
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState<boolean>(creator.autoDownloadEnabled);
  const [savingSubSettings, setSavingSubSettings] = useState(false);
  const [subSettingsError, setSubSettingsError] = useState<string | null>(null);

  const contentBreakdown = useMemo(() => {
    return items.reduce((acc, item) => {
      acc[item.contentType] = (acc[item.contentType] || 0) + 1;
      return acc;
    }, {} as Record<ContentType, number>);
  }, [items]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      for (const t of item.tags) counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [items]);

  const allTags = useMemo(() => Object.keys(tagCounts).sort((a, b) => a.localeCompare(b)), [tagCounts]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'new' && item.isSeen) return false;
      if (selectedType !== 'all' && item.contentType !== selectedType) return false;
      if (selectedTag && !item.tags.includes(selectedTag)) return false;
      if (q && !item.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, items, searchQuery, selectedTag, selectedType]);

  const newItemCount = useMemo(() => items.filter((i) => !i.isSeen).length, [items]);

  const totalSizeText = useMemo(() => {
    // Placeholder until downloads are wired to real files.
    const archived = items.filter((i) => i.isArchived).length;
    return archived > 0 ? `${archived} archived items` : 'No archived items';
  }, [items]);

  const onArchive = async (contentItemId: number) => {
    await fetch(`/api/content/${contentItemId}/archive`, { method: 'POST' }).catch(() => {});
    // For now, rely on refresh-on-navigation behavior; later we can optimistic update.
    window.location.reload();
  };

  const onMarkSeen = async (contentItemId: number) => {
    await fetch(`/api/content/${contentItemId}/seen`, { method: 'POST' }).catch(() => {});
    window.location.reload();
  };

  const updateSubscriptionSettings = async (updates: { syncEnabled?: boolean; autoDownloadEnabled?: boolean }) => {
    setSavingSubSettings(true);
    setSubSettingsError(null);
    const res = await fetch(`/api/subscriptions/${creator.subscriptionId}/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => null);

    if (!res || !res.ok) {
      const txt = res ? await res.text().catch(() => '') : '';
      setSubSettingsError(txt || 'Failed to save settings.');
    }

    setSavingSubSettings(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 transition-colors hover:bg-zinc-800"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="text-xl font-semibold">{creator.name}</h1>
                <p className="text-sm text-zinc-400">
                  <span className="text-orange-400">{platformLabel[creator.platform]}</span> • {creator.tierName ?? 'Subscription'} •{' '}
                  {creator.costCents > 0 ? `$${(creator.costCents / 100).toFixed(2)}/mo` : '$—/mo'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-violet-500 focus:outline-none"
                />
              </div>
              <Link
                href="/settings"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 transition-colors hover:bg-zinc-800"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4 text-zinc-400" />
              </Link>
              <button
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
                  window.location.href = '/login';
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 transition-colors hover:bg-zinc-800"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="h-4 w-4 text-zinc-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Member since</span>
              <span className="text-zinc-100">
                {creator.memberSinceIso ? format(new Date(creator.memberSinceIso), 'MMM yyyy') : 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Items</span>
              <span className="font-medium text-zinc-100">{items.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Archive</span>
              <span className="font-medium text-zinc-100">{totalSizeText}</span>
            </div>
            {newItemCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/20 text-xs font-medium text-violet-400">
                  {newItemCount}
                </span>
                <span className="text-violet-400">new items</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex gap-6">
          <aside className="w-64 flex-shrink-0">
            <div className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <Folder className="h-3.5 w-3.5" />
                Content Types
              </h3>
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedType('all')}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                    selectedType === 'all'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                  }`}
                >
                  <span>All</span>
                  <span className="text-xs">{items.length}</span>
                </button>
                {Object.entries(contentBreakdown).map(([type, count]) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type as ContentType)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      selectedType === type
                        ? 'bg-violet-500/20 text-violet-400'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {contentTypeIcons[type as ContentType]}
                      {contentTypeLabels[type as ContentType]}
                    </span>
                    <span className="text-xs">{count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <Tag className="h-3.5 w-3.5" />
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {allTags.length === 0 && <span className="text-xs text-zinc-600">No tags yet</span>}
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      selectedTag === tag
                        ? 'bg-violet-500/20 text-violet-400'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
                    }`}
                  >
                    #{tag} <span className="ml-1 text-zinc-500">{tagCounts[tag]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </h3>
              <div className="space-y-3 text-sm">
                <label className="flex items-center justify-between">
                  <span className="text-zinc-400">Auto-sync</span>
                  <input
                    type="checkbox"
                    checked={syncEnabled}
                    disabled={savingSubSettings}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setSyncEnabled(next);
                      await updateSubscriptionSettings({ syncEnabled: next });
                    }}
                    className="rounded"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-zinc-400">Auto-download</span>
                  <input
                    type="checkbox"
                    checked={autoDownloadEnabled}
                    disabled={savingSubSettings}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setAutoDownloadEnabled(next);
                      await updateSubscriptionSettings({ autoDownloadEnabled: next });
                    }}
                    className="rounded"
                  />
                </label>
                {subSettingsError && <div className="text-xs text-red-300">{subSettingsError}</div>}
                {savingSubSettings && <div className="text-xs text-zinc-500">Saving…</div>}
              </div>
            </div>
          </aside>

          <main className="flex-1">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setFilter('all')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    filter === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('new')}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    filter === 'new'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                  }`}
                >
                  New Only
                  {newItemCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-500 px-1.5 text-xs font-bold text-white">
                      {newItemCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <span>Sort:</span>
                <span className="text-zinc-300">Newest</span>
              </div>
            </div>

            <div className="space-y-3">
              {filteredItems.map((item) => {
                const publishedText = item.publishedAtIso
                  ? `${format(new Date(item.publishedAtIso), 'MMM d, yyyy')} (${formatDistanceToNow(new Date(item.publishedAtIso), { addSuffix: true })})`
                  : 'Unknown date';

                return (
                  <div
                    key={item.id}
                    className="group flex w-full items-start gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-all hover:border-zinc-700 hover:bg-zinc-900"
                  >
                    <div className="flex-shrink-0 pt-1">
                      {!item.isSeen ? (
                        <button
                          onClick={() => onMarkSeen(item.id)}
                          className="flex h-6 items-center rounded-full bg-violet-500/20 px-2 text-xs font-medium text-violet-400 hover:bg-violet-500/30"
                          title="Mark as seen"
                        >
                          NEW
                        </button>
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center text-zinc-600">
                          <Eye className="h-4 w-4" />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="mb-1 font-medium text-zinc-100 group-hover:text-white">{item.title}</h4>
                      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          {contentTypeIcons[item.contentType]}
                          {contentTypeLabels[item.contentType]}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {publishedText}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      {item.isArchived ? (
                        <span className="flex h-8 items-center gap-1 rounded-lg bg-emerald-500/20 px-3 text-xs font-medium text-emerald-400">
                          <Download className="h-3 w-3" />
                          Archived
                        </span>
                      ) : (
                        <button
                          onClick={() => onArchive(item.id)}
                          className="flex h-8 items-center gap-1 rounded-lg bg-violet-500 px-3 text-xs font-medium text-white hover:bg-violet-400"
                        >
                          <Download className="h-3 w-3" />
                          Archive
                        </button>
                      )}

                      {item.externalUrl ? (
                        <a
                          href={item.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                          aria-label="Open external"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-700">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
                  <Filter className="h-8 w-8 text-zinc-600" />
                </div>
                <h3 className="mb-2 text-lg font-medium text-zinc-100">No content matches</h3>
                <p className="text-zinc-400">Try adjusting your filters or search query.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
