import { getContentTypeFromExtension } from '@/lib/archive';
import type { ContentType } from '@/lib/db/schema';

type JsonApiResource = {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: JsonApiRef | JsonApiRef[] | null }>;
};

type JsonApiRef = {
  id?: string;
  type?: string;
};

type JsonApiResponse = {
  data?: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
};

export type PatreonMembership = {
  campaignId: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  campaignName: string;
  profileUrl: string | null;
  tierName: string | null;
  costCents: number;
  currency: string;
  status: 'active' | 'paused' | 'cancelled';
  memberSinceIso: string | null;
};

export type PatreonPost = {
  externalId: string;
  title: string;
  description: string | null;
  externalUrl: string | null;
  contentType: ContentType;
  publishedAtIso: string | null;
  tags: string[];
  downloadUrl: string | null;
  fileNameHint: string | null;
};

function includeMap(included: JsonApiResource[] = []): Map<string, JsonApiResource> {
  const map = new Map<string, JsonApiResource>();
  for (const item of included) {
    if (!item.type || !item.id) continue;
    map.set(`${item.type}:${item.id}`, item);
  }
  return map;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function inferStatus(raw: string | null): 'active' | 'paused' | 'cancelled' {
  if (!raw) return 'active';
  if (raw === 'active_patron' || raw === 'former_patron') return 'active';
  if (raw.includes('declined') || raw.includes('pending')) return 'paused';
  if (raw.includes('cancel')) return 'cancelled';
  return 'active';
}

function cookieHeader(rawCookie: string): string {
  const trimmed = rawCookie.trim();
  if (trimmed.includes('=')) return trimmed;
  return `session_id=${trimmed}`;
}

async function patreonFetchJson(path: string, rawCookie: string): Promise<JsonApiResponse> {
  const res = await fetch(`https://www.patreon.com${path}`, {
    headers: {
      accept: 'application/json',
      cookie: cookieHeader(rawCookie),
      'user-agent': 'PatronHub/0.1 (+self-hosted)',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Patreon request failed (${res.status}) on ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as JsonApiResponse;
}

async function patreonFetchJsonCandidates(paths: string[], rawCookie: string): Promise<JsonApiResponse> {
  let lastError: Error | null = null;
  for (const p of paths) {
    try {
      return await patreonFetchJson(p, rawCookie);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error('Patreon request failed');
}

function parseMemberships(payload: JsonApiResponse): PatreonMembership[] {
  const root = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  if (!root) return [];

  const map = includeMap(payload.included);
  const membershipRefs = asArray(root.relationships?.memberships?.data as JsonApiRef | JsonApiRef[] | undefined);
  const results: PatreonMembership[] = [];

  for (const ref of membershipRefs) {
    if (!ref.type || !ref.id) continue;
    const member = map.get(`${ref.type}:${ref.id}`);
    if (!member) continue;

    const campaignRef = member.relationships?.campaign?.data as JsonApiRef | undefined;
    if (!campaignRef?.id || !campaignRef.type) continue;
    const campaign = map.get(`${campaignRef.type}:${campaignRef.id}`);
    if (!campaign) continue;

    const creatorRef = campaign.relationships?.creator?.data as JsonApiRef | undefined;
    const creator = creatorRef?.id && creatorRef.type ? map.get(`${creatorRef.type}:${creatorRef.id}`) : null;

    const tierRefs = asArray(member.relationships?.currently_entitled_tiers?.data as JsonApiRef | JsonApiRef[] | undefined);
    const firstTierRef = tierRefs[0];
    const tier = firstTierRef?.id && firstTierRef.type ? map.get(`${firstTierRef.type}:${firstTierRef.id}`) : null;

    const creatorName =
      pickString(creator?.attributes?.full_name) ||
      pickString((campaign.attributes?.creator_name as unknown) ?? null) ||
      pickString(campaign.attributes?.name) ||
      'Patreon Creator';

    const campaignName = pickString(campaign.attributes?.creation_name) || pickString(campaign.attributes?.name) || creatorName;
    const profileUrl = pickString(campaign.attributes?.url) || pickString(creator?.attributes?.url);
    const creatorAvatarUrl = pickString(creator?.attributes?.image_url) || pickString(campaign.attributes?.image_url);
    const tierName = pickString(tier?.attributes?.title);

    const currentlyEntitled = member.attributes?.currently_entitled_amount_cents;
    const amountCents =
      typeof currentlyEntitled === 'number'
        ? currentlyEntitled
        : typeof tier?.attributes?.amount_cents === 'number'
          ? (tier.attributes?.amount_cents as number)
          : 0;

    const rawStatus = pickString(member.attributes?.patron_status);
    const memberSinceIso = pickString(member.attributes?.pledge_relationship_start);

    results.push({
      campaignId: String(campaignRef.id),
      creatorName,
      creatorAvatarUrl,
      campaignName,
      profileUrl,
      tierName,
      costCents: amountCents,
      currency: 'USD',
      status: inferStatus(rawStatus),
      memberSinceIso,
    });
  }

  return results;
}

function findRelatedResources(post: JsonApiResource, map: Map<string, JsonApiResource>): JsonApiResource[] {
  const resources: JsonApiResource[] = [];
  for (const rel of Object.values(post.relationships ?? {})) {
    const data = rel?.data;
    for (const ref of asArray(data as JsonApiRef | JsonApiRef[] | null | undefined)) {
      if (!ref?.id || !ref.type) continue;
      const found = map.get(`${ref.type}:${ref.id}`);
      if (found) resources.push(found);
    }
  }
  return resources;
}

function extractMediaUrl(resources: JsonApiResource[], post: JsonApiResource): { downloadUrl: string | null; fileNameHint: string | null } {
  for (const item of resources) {
    const attrs = item.attributes ?? {};
    const candidates = [
      pickString(attrs.download_url),
      pickString(attrs.url),
      pickString(attrs.file_url),
      pickString((attrs.image_urls as Record<string, unknown> | undefined)?.original),
      pickString((attrs.image as Record<string, unknown> | undefined)?.large_url),
    ].filter(Boolean) as string[];

    const direct = candidates.find((url) => /^https?:\/\//i.test(url));
    if (direct) {
      const fileNameHint =
        pickString(attrs.name) ||
        pickString((attrs.file_name as unknown) ?? null) ||
        pickString((attrs.filename as unknown) ?? null);
      return { downloadUrl: direct, fileNameHint };
    }
  }

  const postFileUrl = pickString((post.attributes?.post_file as Record<string, unknown> | undefined)?.url);
  if (postFileUrl) return { downloadUrl: postFileUrl, fileNameHint: null };

  return { downloadUrl: null, fileNameHint: null };
}

function inferContentType(post: JsonApiResource, downloadUrl: string | null): ContentType {
  const postType = pickString(post.attributes?.post_type)?.toLowerCase();
  if (postType === 'video_external_file' || postType === 'video') return 'video';
  if (postType === 'podcast' || postType === 'audio') return 'audio';
  if (postType === 'image') return 'image';
  if (postType === 'link') return 'article';

  if (downloadUrl) {
    const maybeFromExt = getContentTypeFromExtension(downloadUrl);
    return maybeFromExt;
  }

  return 'article';
}

function parsePosts(payload: JsonApiResponse): PatreonPost[] {
  const postRows = asArray(payload.data as JsonApiResource | JsonApiResource[] | undefined);
  const map = includeMap(payload.included);
  const results: PatreonPost[] = [];

  for (const post of postRows) {
    if (!post.id) continue;
    const title = pickString(post.attributes?.title) || `Patreon Post ${post.id}`;
    const description = pickString(post.attributes?.content);
    const externalUrl = pickString(post.attributes?.url);
    const publishedAtIso = pickString(post.attributes?.published_at);

    const related = findRelatedResources(post, map);
    const { downloadUrl, fileNameHint } = extractMediaUrl(related, post);
    const contentType = inferContentType(post, downloadUrl);

    results.push({
      externalId: String(post.id),
      title,
      description,
      externalUrl,
      contentType,
      publishedAtIso,
      tags: [],
      downloadUrl,
      fileNameHint,
    });
  }

  return results;
}

export async function fetchPatreonMemberships(rawCookie: string): Promise<PatreonMembership[]> {
  const response = await patreonFetchJson(
    '/api/current_user?include=memberships.campaign.creator,memberships.currently_entitled_tiers&json-api-version=1.0',
    rawCookie
  );
  return parseMemberships(response);
}

export async function fetchPatreonPosts(rawCookie: string, campaignId: string, pageCount = 30): Promise<PatreonPost[]> {
  const response = await patreonFetchJsonCandidates(
    [
      `/api/posts?filter[campaign_id]=${encodeURIComponent(
        campaignId
      )}&filter[contains_exclusive_posts]=true&include=attachments_media,media,images,audio,file,user&sort=-published_at&page[count]=${pageCount}&json-api-version=1.0`,
      `/api/posts?filter[campaign_id]=${encodeURIComponent(campaignId)}&sort=-published_at&page[count]=${pageCount}&json-api-version=1.0`,
    ],
    rawCookie
  );
  return parsePosts(response);
}

