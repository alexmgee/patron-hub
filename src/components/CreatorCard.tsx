'use client';

import {
    Video,
    Image as ImageIcon,
    FileText,
    Music,
    ExternalLink,
    Clock
} from 'lucide-react';
import Image from 'next/image';
import type { Platform, ContentType } from '@/lib/db/schema';
import { formatDistanceToNow } from 'date-fns';

// Platform icons/colors
const platformConfig: Record<Platform, { color: string; bgColor: string; label: string }> = {
    patreon: { color: 'text-orange-400', bgColor: 'bg-orange-500/20', label: 'Patreon' },
    substack: { color: 'text-orange-300', bgColor: 'bg-orange-400/20', label: 'Substack' },
    gumroad: { color: 'text-pink-400', bgColor: 'bg-pink-500/20', label: 'Gumroad' },
    discord: { color: 'text-indigo-400', bgColor: 'bg-indigo-500/20', label: 'Discord' },
};

// Content type icons
const contentTypeIcons: Record<ContentType, React.ReactNode> = {
    video: <Video className="h-3.5 w-3.5" />,
    image: <ImageIcon className="h-3.5 w-3.5" />,
    pdf: <FileText className="h-3.5 w-3.5" />,
    audio: <Music className="h-3.5 w-3.5" />,
    article: <FileText className="h-3.5 w-3.5" />,
    attachment: <FileText className="h-3.5 w-3.5" />,
};

export interface CreatorCardData {
    creatorId: number;
    name: string;
    slug: string;
    avatarUrl?: string | null;
    platform: Platform;
    tierName?: string | null;
    costCents: number;
    currency: string;
    totalItems: number;
    newItemCount: number;
    lastPostDateIso?: string | null;
    contentBreakdown: Partial<Record<ContentType, number>>;
}

interface CreatorCardProps {
    creator: CreatorCardData;
    onClick?: () => void;
}

export default function CreatorCard({ creator, onClick }: CreatorCardProps) {
    const platform = platformConfig[creator.platform];
    const hasNewItems = creator.newItemCount > 0;

    // Format cost
    const monthlyCost = (creator.costCents / 100).toFixed(2);

    // Format last post date
    const lastPostText = creator.lastPostDateIso
        ? formatDistanceToNow(new Date(creator.lastPostDateIso), { addSuffix: true })
        : 'No posts yet';

    return (
        <button
            onClick={onClick}
            className="group relative w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-all hover:border-zinc-700 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
        >
            {/* New items badge */}
            {hasNewItems && (
                <div className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-violet-500 px-2 text-xs font-bold text-white shadow-lg shadow-violet-500/30">
                    {creator.newItemCount}
                </div>
            )}

            {/* Header: Avatar + Name */}
            <div className="mb-3 flex items-start gap-3">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                    {creator.avatarUrl ? (
                        <Image
                            src={creator.avatarUrl}
                            alt={creator.name}
                            width={48}
                            height={48}
                            unoptimized
                            className="h-12 w-12 rounded-lg object-cover"
                        />
                    ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-lg font-semibold text-violet-400">
                            {creator.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    {/* Platform indicator */}
                    <div className={`absolute -bottom-1 -right-1 rounded-full ${platform.bgColor} p-1`}>
                        <ExternalLink className={`h-2.5 w-2.5 ${platform.color}`} />
                    </div>
                </div>

                {/* Name + Platform */}
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-medium text-zinc-100 group-hover:text-white">
                        {creator.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs">
                        <span className={platform.color}>{platform.label}</span>
                        {creator.tierName && (
                            <>
                                <span className="text-zinc-600">•</span>
                                <span className="text-zinc-400">{creator.tierName}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats row */}
            <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-zinc-400">{creator.totalItems} items</span>
                <span className="font-medium text-emerald-400">
                    ${monthlyCost}/mo
                </span>
            </div>

            {/* Content type breakdown */}
            <div className="mb-3 flex flex-wrap gap-2">
                {Object.entries(creator.contentBreakdown).map(([type, count]) => {
                    if (!count || count === 0) return null;
                    return (
                        <div
                            key={type}
                            className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-400"
                        >
                            {contentTypeIcons[type as ContentType]}
                            <span>{count}</span>
                        </div>
                    );
                })}
            </div>

            {/* Last post */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Clock className="h-3 w-3" />
                <span>Last: {lastPostText}</span>
            </div>

            {/* Status indicator */}
            <div className="mt-3 flex items-center gap-2">
                {hasNewItems ? (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-violet-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                        {creator.newItemCount} new
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                        Up to date
                    </div>
                )}
            </div>
        </button>
    );
}
