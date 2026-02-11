import fs from 'fs';
import path from 'path';
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

export async function downloadToFile(params: {
  url: string;
  outputPath: string;
  fileNameHint?: string | null;
}): Promise<{ absolutePath: string; fileName: string; sizeBytes: number; mimeType: string | null }> {
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
