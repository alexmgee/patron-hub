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

export default function DashboardPageClient(props: { creators: CreatorCardData[]; stats: Stats }) {
  const { creators, stats } = props;
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'new'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'cost' | 'new'>('recent');

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
    await fetch('/api/sync', { method: 'POST' }).catch(() => {
      // Keep UX simple: sync is best-effort placeholder until adapters exist.
    });
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
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredCreators.map((creator) => (
          <CreatorCard
            key={`${creator.platform}:${creator.creatorId}`}
            creator={creator}
            onClick={() => router.push(`/creator/${creator.creatorId}`)}
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
    </DashboardLayout>
  );
}

