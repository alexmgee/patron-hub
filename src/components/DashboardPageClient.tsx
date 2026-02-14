'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import CreatorCard, { type CreatorCardData } from '@/components/CreatorCard';

type Stats = {
  subscriptionCount: number;
  monthlySpend: number;
  archivedCount: number;
  newItemCount: number;
};

type NewSubscriptionPayload = {
  creatorName: string;
  platform: 'patreon' | 'substack' | 'gumroad' | 'discord';
  tierName: string;
  costCents: number;
  currency: string;
};

type SyncApiResponse = {
  error?: string;
  patreon?: {
    membershipsDiscovered?: number;
    subscriptionsSynced?: number;
    postsFound?: number;
    postsInserted?: number;
    postsUpdated?: number;
    itemsDownloaded?: number;
    harvestJobsProcessed?: number;
    harvestJobsResolved?: number;
  };
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function DashboardPageClient(props: { creators: CreatorCardData[]; stats: Stats }) {
  const { creators, stats } = props;
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'new'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'cost' | 'new'>('recent');
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<NewSubscriptionPayload>({
    creatorName: '',
    platform: 'patreon',
    tierName: '',
    costCents: 0,
    currency: 'USD',
  });

  const filteredCreators = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = creators;

    if (filterMode === 'new') {
      list = list.filter((c) => c.newItemCount > 0);
    }

    if (q) {
      list = list.filter((c) => {
        const haystack = `${c.name} ${c.slug} ${c.platform} ${c.tierName ?? ''}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    list = [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'cost') return b.costCents - a.costCents;
      if (sortBy === 'new') return b.newItemCount - a.newItemCount;

      // recent: sort by last post date
      const ad = a.lastPostDateIso ? Date.parse(a.lastPostDateIso) : 0;
      const bd = b.lastPostDateIso ? Date.parse(b.lastPostDateIso) : 0;
      return bd - ad;
    });

    return list;
  }, [creators, filterMode, searchQuery, sortBy]);

  const handleSync = async () => {
    setSyncMessage(null);
    setSyncError(null);

    const res = await fetch('/api/sync', { method: 'POST' }).catch(() => null);
    if (!res) {
      setSyncError('Sync request failed (network/server unreachable).');
      return;
    }

    const bodyText = await res.text().catch(() => '');
    let data: SyncApiResponse | null = null;
    if (bodyText) {
      try {
        data = JSON.parse(bodyText) as SyncApiResponse;
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      const msg =
        (data && typeof data.error === 'string' && data.error) ||
        (bodyText && !data ? bodyText.slice(0, 300) : null) ||
        `Sync failed (${res.status}).`;
      setSyncError(msg);
      return;
    }

    const patreon = data?.patreon;

    const msg = patreon
      ? `Sync complete: memberships ${patreon.membershipsDiscovered ?? 0}, subscriptions ${
          patreon.subscriptionsSynced ?? 0
        }, posts ${patreon.postsFound ?? 0}, inserted ${patreon.postsInserted ?? 0}, updated ${
          patreon.postsUpdated ?? 0
        }, downloaded ${patreon.itemsDownloaded ?? 0}, harvest-jobs ${patreon.harvestJobsProcessed ?? 0}/${
          patreon.harvestJobsResolved ?? 0
        }.`
      : 'Sync complete.';

    setSyncMessage(msg);
  };

  const handleCreateSubscription = async () => {
    setAddError(null);
    const creatorName = addForm.creatorName.trim();
    if (!creatorName) {
      setAddError('Creator name is required.');
      return;
    }
    const creatorSlug = slugify(creatorName);
    if (!creatorSlug) {
      setAddError('Creator name is invalid.');
      return;
    }

    const res = await fetch('/api/subscriptions/new', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...addForm, creatorName, creatorSlug }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const txt = res ? await res.text().catch(() => '') : '';
      setAddError(txt || 'Failed to create subscription.');
      return;
    }

    setAddOpen(false);
    window.location.reload();
  };

  return (
    <DashboardLayout
      stats={stats}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      filterMode={filterMode}
      onFilterModeChange={setFilterMode}
      sortBy={sortBy}
      onSortByChange={setSortBy}
      onSync={handleSync}
      onAddSubscription={() => setAddOpen(true)}
    >
      {syncError && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {syncError}
        </div>
      )}

      {syncMessage && (
        <div className="mb-4 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {syncMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredCreators.map((creator) => (
          <CreatorCard
            key={`${creator.platform}:${creator.creatorId}`}
            creator={creator}
            // Route by slug (stable) rather than numeric id (can be missing/undefined in rare UI states).
            onClick={() => router.push(`/creator/${encodeURIComponent(creator.slug)}`)}
          />
        ))}
      </div>

      {filteredCreators.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
            <span className="text-3xl">📚</span>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-zinc-100">No results</h2>
          <p className="mb-4 max-w-md text-zinc-400">Try adjusting your search, filters, or sort.</p>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-zinc-100">Add Subscription</h2>
              <p className="text-sm text-zinc-500">Manual entry for now. Adapters will come later.</p>
            </div>

            <div className="space-y-3">
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Creator name</div>
                <input
                  value={addForm.creatorName}
                  onChange={(e) => setAddForm((f) => ({ ...f, creatorName: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                  placeholder="e.g. Blender Guru"
                  autoFocus
                />
                <div className="mt-1 text-xs text-zinc-600">
                  Slug: <span className="font-mono">{slugify(addForm.creatorName || 'creator')}</span>
                </div>
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Platform</div>
                  <select
                    value={addForm.platform}
                    onChange={(e) => setAddForm((f) => ({ ...f, platform: e.target.value as NewSubscriptionPayload['platform'] }))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none"
                  >
                    <option value="patreon">Patreon</option>
                    <option value="substack">Substack</option>
                    <option value="gumroad">Gumroad</option>
                    <option value="discord">Discord</option>
                  </select>
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Tier name</div>
                  <input
                    value={addForm.tierName}
                    onChange={(e) => setAddForm((f) => ({ ...f, tierName: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                    placeholder="Pro Tier"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Monthly cost (USD)</div>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={(addForm.costCents / 100).toFixed(2)}
                    onChange={(e) => {
                      const dollars = Number(e.target.value);
                      setAddForm((f) => ({ ...f, costCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0 }));
                    }}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Currency</div>
                  <input
                    value={addForm.currency}
                    onChange={(e) => setAddForm((f) => ({ ...f, currency: e.target.value.toUpperCase().slice(0, 3) }))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none"
                    placeholder="USD"
                  />
                </label>
              </div>
            </div>

            {addError && (
              <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {addError}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setAddError(null);
                  setAddOpen(false);
                }}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSubscription}
                className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
