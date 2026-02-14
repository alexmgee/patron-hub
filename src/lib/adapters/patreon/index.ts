import { getContentTypeFromExtension } from '@/lib/archive';
import type { ContentType } from '@/lib/db/schema';

type JsonApiResource = {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    {
      data?: JsonApiRef | JsonApiRef[] | JsonApiResource | JsonApiResource[] | null;
      links?: Record<string, unknown>;
      meta?: Record<string, unknown>;
    }
  >;
};

type JsonApiRef = {
  id?: string;
  type?: string;
};

type JsonApiResponse = {
  data?: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
  links?: {
    next?: string | { href?: string | null } | null;
  };
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

export type PatreonResolvedMedia = {
  downloadUrl: string | null;
  fileNameHint: string | null;
  source: 'api-post' | 'post-html' | 'none';
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

function decodeEscapedJsonString(value: string): string {
  return value
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
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
  for (const ch of trimmed) {
    if (ch.charCodeAt(0) > 255) {
      throw new Error(
        'Patreon cookie contains unsupported non-ASCII characters (often caused by truncated copy like “…”). Re-copy the full raw Cookie header value.'
      );
    }
  }
  if (trimmed.includes('=')) return trimmed;
  return `session_id=${trimmed}`;
}

function isPatreonHost(hostname: string): boolean {
  return hostname === 'patreon.com' || hostname.endsWith('.patreon.com');
}

function toPatreonUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const parsed = new URL(pathOrUrl);
    if (!isPatreonHost(parsed.hostname)) {
      throw new Error(`Refusing non-Patreon next link: ${parsed.hostname}`);
    }
    return parsed.toString();
  }

  if (!pathOrUrl.startsWith('/')) {
    return `https://www.patreon.com/${pathOrUrl}`;
  }

  return `https://www.patreon.com${pathOrUrl}`;
}

async function patreonFetchJson(pathOrUrl: string, rawCookie: string): Promise<JsonApiResponse> {
  const url = toPatreonUrl(pathOrUrl);
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      cookie: cookieHeader(rawCookie),
      'user-agent': 'PatronHub/0.1 (+self-hosted)',
      'x-requested-with': 'XMLHttpRequest',
      referer: 'https://www.patreon.com/home',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Patreon request failed (${res.status}) on ${pathOrUrl}: ${body.slice(0, 300)}`);
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

async function patreonFetchHtml(pathOrUrl: string, rawCookie: string): Promise<string> {
  const url = toPatreonUrl(pathOrUrl);
  const res = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      cookie: cookieHeader(rawCookie),
      'user-agent': 'PatronHub/0.1 (+self-hosted)',
      referer: 'https://www.patreon.com/home',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Patreon HTML request failed (${res.status}) on ${pathOrUrl}: ${body.slice(0, 300)}`);
  }
  return res.text();
}

function parseMemberships(payload: JsonApiResponse): PatreonMembership[] {
  const root = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  if (!root) return [];

  const map = includeMap(payload.included);
  const membershipRefs = asArray(root.relationships?.memberships?.data as JsonApiRef | JsonApiRef[] | undefined);
  const results: PatreonMembership[] = [];

  const rootUserId = pickString(root.id);

  function isMembershipResource(resource: JsonApiResource): boolean {
    const t = (resource.type ?? '').toLowerCase();
    if (!t) return false;
    // Patreon has historically used `member` for a membership record, but this shape has changed over time.
    if (t === 'member' || t === 'membership' || t.includes('membership') || t.includes('member')) return true;
    return false;
  }

  function membershipMatchesUser(resource: JsonApiResource): boolean {
    if (!rootUserId) return true; // best-effort fallback
    const rels = resource.relationships ?? {};
    const patron = rels.patron?.data as JsonApiRef | undefined;
    const user = rels.user?.data as JsonApiRef | undefined;
    const me = rels.me?.data as JsonApiRef | undefined;
    // If the membership record doesn't explicitly point back to the user, don't exclude it.
    if (!patron?.id && !user?.id && !me?.id) return true;
    return patron?.id === rootUserId || user?.id === rootUserId || me?.id === rootUserId;
  }

  function getMembershipResources(): JsonApiResource[] {
    // Some responses embed membership resources directly in the relationship data.
    const embedded = asArray(root?.relationships?.memberships?.data as unknown as JsonApiResource | JsonApiResource[] | undefined).filter(
      (r) => typeof r === 'object' && r && (Object.prototype.hasOwnProperty.call(r, 'attributes') || Object.prototype.hasOwnProperty.call(r, 'relationships'))
    ) as JsonApiResource[];
    const embeddedWithCampaign = embedded.filter((r) => {
      const campaignRef = r.relationships?.campaign?.data as JsonApiRef | undefined;
      return Boolean(campaignRef?.id && campaignRef.type);
    });
    if (embeddedWithCampaign.length > 0) return embeddedWithCampaign;

    // Primary path: current_user.relationships.memberships.data -> included resources.
    const fromRefs: JsonApiResource[] = [];
    for (const ref of membershipRefs) {
      if (!ref.type || !ref.id) continue;
      const member = map.get(`${ref.type}:${ref.id}`);
      if (member) fromRefs.push(member);
    }
    if (fromRefs.length > 0) return fromRefs;

    // Alternative: some endpoints return membership rows directly in `data`.
    const dataRows = asArray(payload.data as JsonApiResource | JsonApiResource[] | undefined);
    const direct = dataRows.filter((r) => isMembershipResource(r));
    const directWithCampaign = direct.filter((r) => {
      const campaignRef = r.relationships?.campaign?.data as JsonApiRef | undefined;
      return Boolean(campaignRef?.id && campaignRef.type);
    });
    if (directWithCampaign.length > 0) return directWithCampaign;

    // Fallback: Patreon sometimes omits the `memberships` relationship refs on current_user.
    // In that case, scan `included` for membership-like resources that point back to this user.
    const included = payload.included ?? [];
    const scanned = included.filter((r) => isMembershipResource(r) && membershipMatchesUser(r));
    // A membership should always point to a campaign; keep only those to reduce false positives.
    return scanned.filter((r) => {
      const campaignRef = r.relationships?.campaign?.data as JsonApiRef | undefined;
      return Boolean(campaignRef?.id && campaignRef.type);
    });
  }

  const membershipResources = getMembershipResources();

  for (const member of membershipResources) {
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
      currency:
        pickString(member.attributes?.currency) ||
        pickString((campaign.attributes?.currency as unknown) ?? null) ||
        'USD',
      status: inferStatus(rawStatus),
      memberSinceIso,
    });
  }

  return results;
}

function buildMembershipFetchCandidates(ref: JsonApiRef): string[] {
  const type = (ref.type ?? '').trim();
  const id = (ref.id ?? '').trim();
  if (!type || !id) return [];

  const encodedId = encodeURIComponent(id);
  const include = 'campaign.creator,currently_entitled_tiers';

  // crude pluralization, good enough for our observed resource types (`member` -> `members`)
  const plural = type.endsWith('s') ? `${type}es` : `${type}s`;

  const candidates = [
    `/api/${type}/${encodedId}?include=${include}&json-api-version=1.0`,
    `/api/${plural}/${encodedId}?include=${include}&json-api-version=1.0`,
  ];

  if (type === 'member') {
    candidates.unshift(`/api/members/${encodedId}?include=${include}&json-api-version=1.0`);
  }

  return candidates;
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

function extractCampaignIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();

  for (const m of html.matchAll(/\/api\/campaigns\/(\d+)/g)) ids.add(m[1]);
  for (const m of html.matchAll(/"campaign_id"\s*:\s*(\d+)/g)) ids.add(m[1]);
  for (const m of html.matchAll(/campaign_id=(\d+)/g)) ids.add(m[1]);
  for (const m of html.matchAll(/"campaign"\s*:\s*\{\s*"data"\s*:\s*\{\s*"id"\s*:\s*"(\d+)"/g)) ids.add(m[1]);

  return Array.from(ids).slice(0, 200);
}

async function fetchCampaignAsMembership(
  rawCookie: string,
  campaignId: string,
  override?: { tierName?: string; costCents?: number; currency?: string } | null
): Promise<PatreonMembership | null> {
  const response = await patreonFetchJsonCandidates(
    [
      `/api/campaigns/${encodeURIComponent(campaignId)}?include=creator&json-api-version=1.0`,
      `/api/campaigns/${encodeURIComponent(campaignId)}?json-api-version=1.0`,
    ],
    rawCookie
  );

  const campaign = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!campaign) return null;

  const map = includeMap(response.included);
  const creatorRef = campaign.relationships?.creator?.data as JsonApiRef | undefined;
  const creator = creatorRef?.id && creatorRef.type ? map.get(`${creatorRef.type}:${creatorRef.id}`) : null;

  const creatorName =
    pickString(creator?.attributes?.full_name) ||
    pickString(campaign.attributes?.creator_name) ||
    pickString(campaign.attributes?.name) ||
    `Patreon Campaign ${campaignId}`;

  const campaignName = pickString(campaign.attributes?.creation_name) || pickString(campaign.attributes?.name) || creatorName;
  const profileUrl = pickString(campaign.attributes?.url) || pickString(creator?.attributes?.url);
  const creatorAvatarUrl = pickString(creator?.attributes?.image_url) || pickString(campaign.attributes?.image_url);

  // best-effort overrides (HTML fallback can include the amount/tier you actually pay)
  const overrideTierName = pickString((override?.tierName as unknown) ?? null);
  const overrideCostCents = typeof override?.costCents === 'number' ? override.costCents : null;
  const overrideCurrency = pickString(override?.currency ?? null);

  return {
    campaignId,
    creatorName,
    creatorAvatarUrl,
    campaignName,
    profileUrl,
    tierName: overrideTierName,
    costCents: overrideCostCents ?? 0,
    currency: overrideCurrency || pickString((campaign.attributes?.currency as unknown) ?? null) || 'USD',
    status: 'active',
    memberSinceIso: null,
  };
}

function extractMembershipOverridesFromHtml(html: string): Map<string, { tierName?: string; costCents?: number; currency?: string }> {
  const decoded = decodeEscapedJsonString(html);
  const out = new Map<string, { tierName?: string; costCents?: number; currency?: string }>();

  // Look for a campaign_id and then nearby membership pricing fields.
  const campaignRe = /"campaign_id"\s*:\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = campaignRe.exec(decoded))) {
    const campaignId = m[1];
    const window = decoded.slice(m.index, m.index + 1200);

    const amt = window.match(/"currently_entitled_amount_cents"\s*:\s*(\d+)/);
    const cur = window.match(/"currency"\s*:\s*"([A-Z]{3})"/);
    const tierA = window.match(/"tier_title"\s*:\s*"([^"]{1,120})"/);
    const tierB = window.match(/"currently_entitled_tiers"[\s\S]{0,300}?"title"\s*:\s*"([^"]{1,120})"/);

    const costCents = amt ? Number(amt[1]) : undefined;
    const currency = cur ? cur[1] : undefined;
    const tierName = tierA?.[1] ?? tierB?.[1] ?? undefined;

    // Merge: prefer non-zero cost and non-empty tier.
    const existing = out.get(campaignId) ?? {};
    out.set(campaignId, {
      costCents: (existing.costCents && existing.costCents > 0 ? existing.costCents : undefined) ?? (costCents && costCents > 0 ? costCents : undefined),
      currency: existing.currency ?? currency,
      tierName: existing.tierName ?? tierName,
    });
  }

  return out;
}

async function fetchPatreonMembershipsViaHtml(rawCookie: string): Promise<PatreonMembership[]> {
  const pages = ['/memberships', '/home', '/settings/memberships'];
  const campaignIds = new Set<string>();
  const overrides = new Map<string, { tierName?: string; costCents?: number; currency?: string }>();

  for (const p of pages) {
    try {
      const html = await patreonFetchHtml(p, rawCookie);
      for (const id of extractCampaignIdsFromHtml(html)) campaignIds.add(id);
      for (const [cid, ov] of extractMembershipOverridesFromHtml(html)) {
        const existing = overrides.get(cid) ?? {};
        overrides.set(cid, {
          costCents: existing.costCents ?? ov.costCents,
          currency: existing.currency ?? ov.currency,
          tierName: existing.tierName ?? ov.tierName,
        });
      }
    } catch {
      // best-effort
    }
  }

  const results: PatreonMembership[] = [];
  for (const id of Array.from(campaignIds)) {
    try {
      const m = await fetchCampaignAsMembership(rawCookie, id, overrides.get(id) ?? null);
      if (m) results.push(m);
    } catch {
      // ignore individual failures
    }
  }

  return results;
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

function getNextPageLink(payload: JsonApiResponse): string | null {
  const raw = payload.links?.next;
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw.href) return raw.href;
  return null;
}

function dedupePostsByExternalId(posts: PatreonPost[]): PatreonPost[] {
  const seen = new Set<string>();
  const deduped: PatreonPost[] = [];
  for (const post of posts) {
    if (seen.has(post.externalId)) continue;
    seen.add(post.externalId);
    deduped.push(post);
  }
  return deduped;
}

function getMaxPagesFromEnv(defaultValue = 40): number {
  const raw = process.env.PATRON_HUB_PATREON_MAX_PAGES;
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(1, Math.trunc(parsed));
}

function parsePostIdFromUrl(value: string): string | null {
  const m = value.match(/-(\d+)(?:[/?#]|$)/);
  return m?.[1] ?? null;
}

function extractUrlsFromText(input: string): string[] {
  const decoded = decodeEscapedJsonString(input);
  const matches = decoded.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? [];
  return matches;
}

function extensionFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const m = path.match(/\.([a-z0-9]{2,8})$/);
    return m?.[1] ?? '';
  } catch {
    return '';
  }
}

const DOWNLOAD_EXT_PRIORITY = [
  'm3u8',
  'mp4',
  'mkv',
  'mov',
  'webm',
  'm4v',
  'mp3',
  'm4a',
  'wav',
  'flac',
  'aac',
  'pdf',
  'zip',
  'rar',
  '7z',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
] as const;

function scoreDownloadCandidate(url: string): number {
  const normalized = url.toLowerCase();
  const ext = extensionFromUrl(normalized);
  const extRank = DOWNLOAD_EXT_PRIORITY.indexOf(ext as (typeof DOWNLOAD_EXT_PRIORITY)[number]);
  const base = extRank >= 0 ? 1000 - extRank * 10 : 100;

  let bonus = 0;
  if (normalized.includes('download')) bonus += 50;
  if (normalized.includes('attachment')) bonus += 20;
  if (normalized.includes('media')) bonus += 10;
  if (normalized.includes('.m3u8')) bonus += 30;
  if (normalized.includes('.mp4')) bonus += 25;
  if (normalized.includes('patreonusercontent.com')) bonus += 15;

  return base + bonus;
}

function isLikelyFileUrl(url: string): boolean {
  const ext = extensionFromUrl(url);
  if (DOWNLOAD_EXT_PRIORITY.includes(ext as (typeof DOWNLOAD_EXT_PRIORITY)[number])) return true;
  const n = url.toLowerCase();
  return n.includes('/download') || n.includes('/attachment') || n.includes('/media');
}

function getFileNameHintFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fileParam = parsed.searchParams.get('filename') || parsed.searchParams.get('file_name');
    if (fileParam && fileParam.trim().length > 0) return fileParam.trim();

    const parts = parsed.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last.length > 0 ? last : null;
  } catch {
    return null;
  }
}

function pickBestDownloadUrl(candidates: string[]): string | null {
  const filtered = Array.from(new Set(candidates.map((c) => c.trim()).filter((c) => /^https?:\/\//i.test(c))))
    .filter((c) => isLikelyFileUrl(c));

  if (filtered.length === 0) return null;
  filtered.sort((a, b) => scoreDownloadCandidate(b) - scoreDownloadCandidate(a));
  return filtered[0];
}

async function fetchPatreonPostDetail(rawCookie: string, postId: string): Promise<PatreonPost | null> {
  const response = await patreonFetchJsonCandidates(
    [
      `/api/posts/${encodeURIComponent(postId)}?include=attachments_media,media,images,audio,file,user&json-api-version=1.0`,
      `/api/posts/${encodeURIComponent(postId)}?json-api-version=1.0`,
    ],
    rawCookie
  );
  const parsed = parsePosts(response);
  return parsed[0] ?? null;
}

async function fetchPatreonPostHtml(rawCookie: string, postUrl: string): Promise<string> {
  const target = toPatreonUrl(postUrl);
  const res = await fetch(target, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      cookie: cookieHeader(rawCookie),
      'user-agent': 'PatronHub/0.1 (+self-hosted)',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Patreon HTML fetch failed (${res.status}) on ${postUrl}: ${body.slice(0, 300)}`);
  }
  return res.text();
}

function extractDownloadCandidatesFromHtml(html: string): string[] {
  const urls = extractUrlsFromText(html);
  return urls.filter((u) => !u.endsWith('.js') && !u.endsWith('.css'));
}

export async function resolvePatreonPostMedia(
  rawCookie: string,
  input: { postId?: string | null; postUrl?: string | null }
): Promise<PatreonResolvedMedia> {
  const postId = input.postId || (input.postUrl ? parsePostIdFromUrl(input.postUrl) : null);

  // First try API-by-post-id to get structured attachment/media fields.
  if (postId) {
    try {
      const detailed = await fetchPatreonPostDetail(rawCookie, postId);
      if (detailed?.downloadUrl) {
        return {
          downloadUrl: detailed.downloadUrl,
          fileNameHint: detailed.fileNameHint,
          source: 'api-post',
        };
      }
    } catch {
      // best effort; fall through to HTML extraction
    }
  }

  // Fallback: parse post HTML for embedded media/file URLs.
  if (input.postUrl) {
    try {
      const html = await fetchPatreonPostHtml(rawCookie, input.postUrl);
      const best = pickBestDownloadUrl(extractDownloadCandidatesFromHtml(html));
      if (best) {
        return {
          downloadUrl: best,
          fileNameHint: getFileNameHintFromUrl(best),
          source: 'post-html',
        };
      }
    } catch {
      // no-op; return none below
    }
  }

  return {
    downloadUrl: null,
    fileNameHint: null,
    source: 'none',
  };
}

export async function fetchPatreonMemberships(rawCookie: string): Promise<PatreonMembership[]> {
  const response = await patreonFetchJsonCandidates(
    [
      '/api/current_user?include=memberships.campaign.creator,memberships.currently_entitled_tiers&json-api-version=1.0',
      '/api/current_user?include=memberships&json-api-version=1.0',
    ],
    rawCookie
  );

  const direct = parseMemberships(response);
  if (direct.length > 0) return direct;

  // Patreon sometimes returns only membership *refs* with no `included` objects.
  // In that case, fetch each membership resource by id.
  const root = Array.isArray(response.data) ? response.data[0] : response.data;
  const membershipRefs = asArray(root?.relationships?.memberships?.data as JsonApiRef | JsonApiRef[] | undefined);

  const fetched: PatreonMembership[] = [];
  for (const ref of membershipRefs) {
    if (!ref?.type || !ref?.id) continue;
    try {
      const memberPayload = await patreonFetchJsonCandidates(buildMembershipFetchCandidates(ref), rawCookie);
      fetched.push(...parseMemberships(memberPayload));
    } catch {
      // best-effort
    }
  }

  if (fetched.length === 0) {
    const htmlFallback = await fetchPatreonMembershipsViaHtml(rawCookie);
    if (htmlFallback.length > 0) return htmlFallback;
  }

  const seen = new Set<string>();
  const deduped: PatreonMembership[] = [];
  for (const m of [...direct, ...fetched]) {
    if (!m.campaignId) continue;
    if (seen.has(m.campaignId)) continue;
    seen.add(m.campaignId);
    deduped.push(m);
  }

  return deduped;
}

export async function fetchPatreonPosts(rawCookie: string, campaignId: string, pageCount = 30): Promise<PatreonPost[]> {
  const maxPages = getMaxPagesFromEnv();

  let response = await patreonFetchJsonCandidates(
    [
      `/api/posts?filter[campaign_id]=${encodeURIComponent(
        campaignId
      )}&filter[contains_exclusive_posts]=true&include=attachments_media,media,images,audio,file,user&sort=-published_at&page[count]=${pageCount}&json-api-version=1.0`,
      `/api/posts?filter[campaign_id]=${encodeURIComponent(campaignId)}&sort=-published_at&page[count]=${pageCount}&json-api-version=1.0`,
    ],
    rawCookie
  );

  const allPosts: PatreonPost[] = [];
  let pagesFetched = 0;

  // Walk paginated history for backlog harvesting, bounded by max pages.
  while (true) {
    allPosts.push(...parsePosts(response));
    pagesFetched += 1;

    if (pagesFetched >= maxPages) break;

    const next = getNextPageLink(response);
    if (!next) break;

    response = await patreonFetchJson(next, rawCookie);
  }

  return dedupePostsByExternalId(allPosts);
}
