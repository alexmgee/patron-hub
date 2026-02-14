import CreatorDetailPageClient from '@/components/CreatorDetailPageClient';
import { getCreatorContentItems, getCreatorDetail, getCreatorIdBySlug } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function CreatorPage(props: { params: Promise<{ id: string }> }) {
  const { id: rawParam } = await props.params;
  const raw = rawParam ?? '';
  const numeric = Number(raw);
  const creatorId = Number.isFinite(numeric) ? numeric : await getCreatorIdBySlug(raw);
  if (!creatorId) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
        <h1 className="text-xl font-semibold">Invalid creator id</h1>
      </div>
    );
  }

  const creator = await getCreatorDetail(creatorId);
  if (!creator) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
        <h1 className="text-xl font-semibold">Creator not found</h1>
      </div>
    );
  }

  const items = await getCreatorContentItems(creatorId);
  return <CreatorDetailPageClient creator={creator} items={items} />;
}
