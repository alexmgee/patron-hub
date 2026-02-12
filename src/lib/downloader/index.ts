import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { sanitizeFileName } from '@/lib/archive';

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
}): Promise<{ absolutePath: string; fileName: string; sizeBytes: number; mimeType: string | null }> {
  // HLS stream harvesting path.
  if (isLikelyHlsUrl(params.url)) {
    return downloadHlsWithFfmpeg(params);
  }

  const res = await fetch(params.url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) for ${params.url}`);
  }
  if (!res.body) {
    throw new Error(`Download response had no body for ${params.url}`);
  }

  const mimeType = res.headers.get('content-type');
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
