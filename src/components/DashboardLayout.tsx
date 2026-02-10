'use client';

import { useState } from 'react';
import {
    Search,
    Settings,
    Home,
    RefreshCw,
    Filter
} from 'lucide-react';
import Link from 'next/link';

interface DashboardLayoutProps {
    children: React.ReactNode;
    stats?: {
        subscriptionCount: number;
        monthlySpend: number;
        archivedCount: number;
        newItemCount: number;
    };
    searchQuery?: string;
    onSearchQueryChange?: (value: string) => void;
    filterMode?: 'all' | 'new';
    onFilterModeChange?: (mode: 'all' | 'new') => void;
    sortBy?: 'recent' | 'name' | 'cost' | 'new';
    onSortByChange?: (sortBy: 'recent' | 'name' | 'cost' | 'new') => void;
    onSync?: () => Promise<void> | void;
}

export default function DashboardLayout(props: DashboardLayoutProps) {
    const {
        children,
        stats,
        searchQuery: controlledSearchQuery,
        onSearchQueryChange,
        filterMode: controlledFilterMode,
        onFilterModeChange,
        sortBy: controlledSortBy,
        onSortByChange,
        onSync,
    } = props;

    const [uncontrolledSearchQuery, setUncontrolledSearchQuery] = useState('');
    const [uncontrolledFilterMode, setUncontrolledFilterMode] = useState<'all' | 'new'>('all');
    const [uncontrolledSortBy, setUncontrolledSortBy] = useState<'recent' | 'name' | 'cost' | 'new'>('recent');
    const [isSyncing, setIsSyncing] = useState(false);

    const searchQuery = controlledSearchQuery ?? uncontrolledSearchQuery;
    const filterMode = controlledFilterMode ?? uncontrolledFilterMode;
    const sortBy = controlledSortBy ?? uncontrolledSortBy;
    const setSearchQuery = onSearchQueryChange ?? setUncontrolledSearchQuery;
    const setFilterMode = onFilterModeChange ?? setUncontrolledFilterMode;
    const setSortBy = onSortByChange ?? setUncontrolledSortBy;

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            if (onSync) {
                await onSync();
            } else {
                // Default placeholder: short delay so the UI doesn't feel dead.
                await new Promise((r) => setTimeout(r, 800));
            }
        } finally {
            setIsSyncing(false);
        }
    };

    const defaultStats = stats ?? {
        subscriptionCount: 0,
        monthlySpend: 0,
        archivedCount: 0,
        newItemCount: 0,
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
                <div className="mx-auto max-w-7xl px-4 py-4">
                    <div className="flex items-center justify-between">
                        {/* Logo */}
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500">
                                <Home className="h-5 w-5 text-white" />
                            </div>
                            <h1 className="text-xl font-semibold tracking-tight">Patron Hub</h1>
                        </div>

                        {/* Search */}
                        <div className="flex-1 max-w-md mx-8">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search creators, content, tags..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                                />
                                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
                                    ⌘K
                                </kbd>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-800 disabled:opacity-50"
                            >
                                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                                {isSyncing ? 'Syncing...' : 'Sync'}
                            </button>
                            <Link
                                href="/settings"
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 transition-colors hover:bg-zinc-800"
                                aria-label="Settings"
                            >
                                <Settings className="h-4 w-4 text-zinc-400" />
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Stats Bar */}
            <div className="border-b border-zinc-800 bg-zinc-900/50">
                <div className="mx-auto max-w-7xl px-4 py-3">
                    <div className="flex items-center gap-8 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Subscriptions</span>
                            <span className="font-medium text-zinc-100">{defaultStats.subscriptionCount}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Monthly</span>
                            <span className="font-medium text-emerald-400">
                                ${(defaultStats.monthlySpend / 100).toFixed(2)}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Archived</span>
                            <span className="font-medium text-zinc-100">{defaultStats.archivedCount}</span>
                        </div>
                        {defaultStats.newItemCount > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/20 text-xs font-medium text-violet-400">
                                    {defaultStats.newItemCount}
                                </span>
                                <span className="text-violet-400">new items</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="border-b border-zinc-800">
                <div className="mx-auto max-w-7xl px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setFilterMode('all')}
                                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${filterMode === 'all'
                                    ? 'bg-zinc-800 text-zinc-100'
                                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                                    }`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFilterMode('new')}
                                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${filterMode === 'new'
                                    ? 'bg-violet-500/20 text-violet-400'
                                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                                    }`}
                            >
                                With New Content
                            </button>
                            <div className="h-4 w-px bg-zinc-700" />
                            <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100">
                                <Filter className="h-3.5 w-3.5" />
                                Platform
                            </button>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-zinc-500">
                            <span>Sort by:</span>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-300 focus:border-violet-500 focus:outline-none"
                            >
                                <option value="recent">Recent Activity</option>
                                <option value="name">Name</option>
                                <option value="cost">Cost</option>
                                <option value="new">New Items</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="mx-auto max-w-7xl px-4 py-6">
                {children}
            </main>
        </div>
    );
}
