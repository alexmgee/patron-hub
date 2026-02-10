import CreatorDetailPageClient from '@/components/CreatorDetailPageClient';
import { getCreatorContentItems, getCreatorDetail } from '@/lib/db/queries';

export default async function CreatorPage(props: { params: { id: string } }) {
  const creatorId = Number(props.params.id);
  if (!Number.isFinite(creatorId)) {
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

