import { chromium } from 'playwright';

const BASE_URL = process.env.PATRON_HUB_BASE_URL || 'http://patron-hub:3000';
const TOKEN = process.env.PATRON_HUB_INTERNAL_TOKEN || '';
const PATREON_COOKIE = process.env.PATRON_HUB_PATREON_COOKIE || '';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function headers() {
  return {
    'content-type': 'application/json',
    'x-patron-hub-internal-token': TOKEN,
  };
}

function parseCookieHeader(raw) {
  return raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((kv) => {
      const idx = kv.indexOf('=');
      if (idx <= 0) return null;
      const name = kv.slice(0, idx).trim();
      const value = kv.slice(idx + 1).trim();
      return name && value ? { name, value } : null;
    })
    .filter(Boolean);
}

function guessAssetType(url) {
  const u = url.toLowerCase();
  if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.webm')) return 'video';
  if (u.includes('.mp3') || u.includes('.m4a') || u.includes('.wav') || u.includes('.flac')) return 'audio';
  if (u.includes('.jpg') || u.includes('.jpeg') || u.includes('.png') || u.includes('.gif') || u.includes('.webp')) return 'image';
  return 'attachment';
}

function shouldKeepUrl(url) {
  const u = url.toLowerCase();
  if (u.includes('patreonusercontent.com')) return true;
  if (u.includes('patreon.com/file') || u.includes('/download') || u.includes('/attachment')) return true;
  if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.webm')) return true;
  if (u.includes('.zip') || u.includes('.7z') || u.includes('.rar') || u.includes('.pdf')) return true;
  return false;
}

async function discoverAssets(postUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'PatronHubHeadless/0.1',
  });

  // Apply Patreon cookies to patreon.com only.
  if (PATREON_COOKIE) {
    const parsed = parseCookieHeader(PATREON_COOKIE);
    const cookies = parsed.map((c) => ({
      ...c,
      domain: '.patreon.com',
      path: '/',
      secure: true,
      httpOnly: false,
    }));
    try {
      await context.addCookies(cookies);
    } catch {
      // ignore; best-effort
    }
  }

  const page = await context.newPage();
  const found = new Set();

  page.on('request', (req) => {
    const u = req.url();
    if (shouldKeepUrl(u)) found.add(u);
  });
  page.on('response', (res) => {
    const u = res.url();
    if (shouldKeepUrl(u)) found.add(u);
  });

  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  // Give the page some time to kick off media loads.
  await page.waitForTimeout(5_000);

  // Also parse HTML for links.
  const html = await page.content().catch(() => '');
  if (html) {
    const matches = html.match(/https?:\/\/[^\s"'<>\\)]+/g) || [];
    for (const u of matches) if (shouldKeepUrl(u)) found.add(u);
  }

  await page.close();
  await context.close();
  await browser.close();

  return Array.from(found);
}

async function postJson(path, payload) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!TOKEN) throw new Error('Missing PATRON_HUB_INTERNAL_TOKEN');
  console.log(`headless-worker: base=${BASE_URL}`);

  while (true) {
    let claim;
    try {
      claim = await postJson('/api/internal/harvest/claim', { kind: 'headless_asset_discover' });
    } catch (err) {
      // 204 is represented as an empty body; if we get an error here it's likely app not ready.
      console.log(`claim error: ${err instanceof Error ? err.message : String(err)}`);
      await sleep(10_000);
      continue;
    }

    if (!claim || !claim.ok || !claim.job) {
      await sleep(5_000);
      continue;
    }

    const job = claim.job;
    const jobId = job.id;
    const contentItemId = job.contentItemId;
    const postUrl = job.externalUrl;
    console.log(`job ${jobId}: discover assets for item ${contentItemId}`);

    try {
      const urls = await discoverAssets(postUrl);
      const assets = urls.map((u) => ({ url: u, fileNameHint: null, assetType: guessAssetType(u) }));
      await postJson('/api/internal/assets', { contentItemId, assets });

      // Kick off a local archive pass immediately so the newly discovered assets are downloaded.
      await postJson(`/api/internal/content/${contentItemId}/archive`, {});
      await postJson('/api/internal/harvest/complete', { jobId, ok: true });
      console.log(`job ${jobId}: done (urls=${urls.length})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await postJson('/api/internal/harvest/complete', { jobId, ok: false, error: msg });
      console.log(`job ${jobId}: failed: ${msg}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

