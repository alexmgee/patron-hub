import DashboardPageClient from '@/components/DashboardPageClient';
import { getDashboardCreators } from '@/lib/db/queries';
import type { CreatorCardData } from '@/components/CreatorCard';

export default async function Dashboard() {
  const rows = await getDashboardCreators();

  const creators: CreatorCardData[] = rows.map((r) => ({
    creatorId: r.creatorId,
    name: r.name,
    slug: r.slug,
    avatarUrl: r.avatarUrl,
    platform: r.platform,
    tierName: r.tierName,
    costCents: r.costCents,
    currency: r.currency,
    totalItems: r.totalItems,
    newItemCount: r.newItemCount,
    lastPostDateIso: r.lastPostDateIso,
    contentBreakdown: r.contentBreakdown,
  }));

  const stats = {
    subscriptionCount: creators.length,
    monthlySpend: creators.reduce((sum, c) => sum + c.costCents, 0),
    archivedCount: creators.reduce((sum, c) => sum + c.totalItems, 0),
    newItemCount: creators.reduce((sum, c) => sum + c.newItemCount, 0),
  };

  return <DashboardPageClient creators={creators} stats={stats} />;
}
