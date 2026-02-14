import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { sanitizeFileName } from '@/lib/archive';

function normalizeCookieHeader(raw: string): string {
  const trimmed = raw.trim();
  for (const ch of trimmed) {
    if (ch.charCodeAt(0) > 255) {
      throw new Error(
        'Cookie contains unsupported non-ASCII characters (often caused by truncated copy like “…”). Re-copy the full raw Cookie header value.'
      );
    }
  }
  if (trimmed.includes('=')) return trimmed;
  // Some people paste only session_id. Accept it.
  return `session_id=${trimmed}`;
}

function isPatreonHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'patreon.com' ||
    h.endsWith('.patreon.com') ||
    h === 'patreonusercontent.com' ||
    h.endsWith('.patreonusercontent.com')
  );
}

async function fetchWithSafeRedirects(params: {
  url: string;
  cookie?: string | null;
  referer?: string | null;
  accept?: string | null;
}): Promise<Response> {
  const maxRedirects = 10;
  let current = params.url;
  const cookie = params.cookie ? normalizeCookieHeader(params.cookie) : null;

  for (let i = 0; i < maxRedirects; i += 1) {
    const parsed = new URL(current);
    const headers: Record<string, string> = {
      'user-agent': 'PatronHub/0.1 (+self-hosted)',
    };
    if (params.accept) headers.accept = params.accept;
    if (params.referer) headers.referer = params.referer;

    // Only send cookies to Patreon-controlled domains (avoid leaking to S3/CloudFront/etc on redirect).
    if (cookie && isPatreonHost(parsed.hostname)) headers.cookie = cookie;

    const res = await fetch(current, { redirect: 'manual', headers });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }

  throw new Error(`Too many redirects while downloading: ${params.url}`);
}

const MIME_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/json': 'json',
};

function getFileNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname);
    if (!base || base === '/' || base === '.') return null;
    return base;
  } catch {
    return null;
  }
}

function extensionFromMime(contentType: string | null): string | null {
  if (!contentType) return null;
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return MIME_EXTENSIONS[mime] ?? null;
}

function ensureExtension(fileName: string, extension: string | null): string {
  if (!extension) return fileName;
  if (path.extname(fileName)) return fileName;
  return `${fileName}.${extension}`;
}

function isLikelyHlsUrl(url: string): boolean {
  return /\.m3u8(?:\?|$)/i.test(url);
}

function ensureVideoExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.mp4' || ext === '.mkv' || ext === '.mov') return fileName;
  return `${fileName}.mp4`;
}

function downloadHlsWithFfmpeg(params: { url: string; outputPath: string; fileNameHint?: string | null }): {
  absolutePath: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
} {
  const hinted = params.fileNameHint ? sanitizeFileName(params.fileNameHint) : null;
  const fromUrl = getFileNameFromUrl(params.url);
  const baseName = hinted || (fromUrl ? sanitizeFileName(fromUrl) : 'download');
  const finalName = ensureVideoExtension(baseName);

  const dir = path.dirname(params.outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const absolutePath = path.join(dir, finalName);
  try {
    execFileSync(
      'ffmpeg',
      ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', params.url, '-c', 'copy', absolutePath],
      { stdio: 'pipe' }
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'ffmpeg failed while downloading HLS stream';
    throw new Error(
      `HLS download failed via ffmpeg. Ensure ffmpeg is installed and URL is accessible. ${message}`
    );
  }

  const stat = fs.statSync(absolutePath);
  return {
    absolutePath,
    fileName: finalName,
    sizeBytes: stat.size,
    mimeType: 'video/mp4',
  };
}

export async function downloadToFile(params: {
  url: string;
  outputPath: string;
  fileNameHint?: string | null;
  cookie?: string | null;
  referer?: string | null;
}): Promise<{ absolutePath: string; fileName: string; sizeBytes: number; mimeType: string | null }> {
  // HLS stream harvesting path.
  if (isLikelyHlsUrl(params.url)) {
    return downloadHlsWithFfmpeg(params);
  }

  const res = await fetchWithSafeRedirects({
    url: params.url,
    cookie: params.cookie ?? null,
    referer: params.referer ?? null,
    accept: '*/*',
  });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) for ${params.url}`);
  }
  if (!res.body) {
    throw new Error(`Download response had no body for ${params.url}`);
  }

  const mimeType = res.headers.get('content-type');
  // When Patreon auth is missing/expired, it often returns an HTML page instead of the file.
  // Treat this as a failure so the UI shows the item as not archived (and can be retried).
  if (mimeType && mimeType.toLowerCase().includes('text/html')) {
    const host = (() => {
      try {
        return new URL(params.url).hostname;
      } catch {
        return '';
      }
    })();
    if (host && isPatreonHost(host)) {
      const snippet = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`Patreon returned HTML instead of a file. Cookie may be missing/expired. Snippet: ${snippet}`);
    }
  }
  const extFromMime = extensionFromMime(mimeType);

  const hinted = params.fileNameHint ? sanitizeFileName(params.fileNameHint) : null;
  const fromUrl = getFileNameFromUrl(params.url);
  const baseName = hinted || (fromUrl ? sanitizeFileName(fromUrl) : 'download');
  const finalName = ensureExtension(baseName, extFromMime);

  const dir = path.dirname(params.outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const absolutePath = path.join(dir, finalName);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(absolutePath, buffer);

  const stat = fs.statSync(absolutePath);
  return {
    absolutePath,
    fileName: finalName,
    sizeBytes: stat.size,
    mimeType,
  };
}
