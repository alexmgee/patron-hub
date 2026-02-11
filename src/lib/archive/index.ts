import path from 'path';
import fs from 'fs';
import { format } from 'date-fns';
import type { Platform, ContentType } from '../db/schema';

// Default archive location - can be configured via settings
export const DEFAULT_ARCHIVE_DIR = path.join(process.cwd(), 'archive');

/**
 * Get the configured archive directory path
 * In the future, this will read from settings table
 */
export function getArchiveDirectory(): string {
    return process.env.PATRON_HUB_ARCHIVE_DIR || DEFAULT_ARCHIVE_DIR;
}

export function resolveArchiveDirectory(configuredArchiveDir?: string | null): string {
    return process.env.PATRON_HUB_ARCHIVE_DIR || configuredArchiveDir || DEFAULT_ARCHIVE_DIR;
}

/**
 * Generate the archive path for a content item
 * Structure: /archive/{platform}/{creator}/{YYYY-MM}/{sanitized-title}/
 */
export function generateArchivePath(params: {
    platform: Platform;
    creatorSlug: string;
    publishedAt: Date;
    title: string;
    archiveDir?: string | null;
}): string {
    const { platform, creatorSlug, publishedAt, title, archiveDir } = params;

    const resolvedArchiveDir = resolveArchiveDirectory(archiveDir);
    const yearMonth = format(publishedAt, 'yyyy-MM');
    const sanitizedTitle = sanitizeFileName(title);

    return path.join(resolvedArchiveDir, platform, creatorSlug, yearMonth, sanitizedTitle);
}

/**
 * Generate the full file path for a download
 */
export function generateFilePath(params: {
    platform: Platform;
    creatorSlug: string;
    publishedAt: Date;
    title: string;
    fileName: string;
    archiveDir?: string | null;
}): string {
    const contentDir = generateArchivePath({
        platform: params.platform,
        creatorSlug: params.creatorSlug,
        publishedAt: params.publishedAt,
        title: params.title,
        archiveDir: params.archiveDir,
    });

    const sanitizedFileName = sanitizeFileName(params.fileName);
    return path.join(contentDir, sanitizedFileName);
}

/**
 * Ensure the archive directory structure exists
 */
export function ensureArchiveDirectory(archivePath: string): void {
    const dir = path.dirname(archivePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Sanitize a string for use as a file/folder name
 * - Replaces invalid characters with underscores
 * - Trims to reasonable length
 * - Removes leading/trailing dots and spaces
 */
export function sanitizeFileName(name: string): string {
    // Characters not allowed in file names on most systems
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/g;

    let sanitized = name
        .replace(invalidChars, '_')   // Replace invalid chars
        .replace(/\.+$/, '')          // Remove trailing dots
        .replace(/^\s+|\s+$/g, '')    // Trim whitespace
        .replace(/\s+/g, '_')         // Replace spaces with underscores
        .replace(/_+/g, '_')          // Collapse multiple underscores
        .substring(0, 100);           // Limit length

    // Ensure we have something
    if (!sanitized || sanitized === '_') {
        sanitized = 'untitled';
    }

    return sanitized;
}

/**
 * Get content type from file extension
 */
export function getContentTypeFromExtension(fileName: string): ContentType {
    const ext = path.extname(fileName).toLowerCase().slice(1);

    const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'm4v'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const audioExts = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'];
    const pdfExts = ['pdf'];
    const articleExts = ['html', 'htm', 'md', 'txt'];

    if (videoExts.includes(ext)) return 'video';
    if (imageExts.includes(ext)) return 'image';
    if (audioExts.includes(ext)) return 'audio';
    if (pdfExts.includes(ext)) return 'pdf';
    if (articleExts.includes(ext)) return 'article';

    return 'attachment';
}

/**
 * Get a relative path from the archive root
 */
export function getRelativeArchivePath(absolutePath: string): string {
    const archiveDir = getArchiveDirectory();
    if (absolutePath.startsWith(archiveDir)) {
        return absolutePath.slice(archiveDir.length + 1); // +1 to remove leading slash
    }
    return absolutePath;
}

export function getRelativeArchivePathFromRoot(absolutePath: string, archiveDir: string): string {
    if (absolutePath.startsWith(archiveDir)) {
        return absolutePath.slice(archiveDir.length + 1);
    }
    return absolutePath;
}

/**
 * Check if the archive directory is writable
 */
export function isArchiveWritable(configuredArchiveDir?: string | null): boolean {
    const archiveDir = resolveArchiveDirectory(configuredArchiveDir);

    try {
        // Ensure the directory exists
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }

        // Try to write a test file
        const testFile = path.join(archiveDir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);

        return true;
    } catch {
        return false;
    }
}

/**
 * Get archive statistics
 */
export function getArchiveStats(): {
    totalSize: number;
    fileCount: number;
    directoryCount: number;
} {
    const archiveDir = resolveArchiveDirectory();

    if (!fs.existsSync(archiveDir)) {
        return { totalSize: 0, fileCount: 0, directoryCount: 0 };
    }

    let totalSize = 0;
    let fileCount = 0;
    let directoryCount = 0;

    function walkDir(dir: string) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    directoryCount++;
                    walkDir(fullPath);
                } else if (entry.isFile()) {
                    fileCount++;
                    try {
                        const stats = fs.statSync(fullPath);
                        totalSize += stats.size;
                    } catch {
                        // Skip files we can't stat
                    }
                }
            }
        } catch {
            // Skip directories we can't read
        }
    }

    walkDir(archiveDir);

    return { totalSize, fileCount, directoryCount };
}

export function getArchiveStatsForRoot(configuredArchiveDir?: string | null): {
    totalSize: number;
    fileCount: number;
    directoryCount: number;
} {
    const archiveDir = resolveArchiveDirectory(configuredArchiveDir);
    if (!fs.existsSync(archiveDir)) {
        return { totalSize: 0, fileCount: 0, directoryCount: 0 };
    }

    let totalSize = 0;
    let fileCount = 0;
    let directoryCount = 0;

    function walkDir(dir: string) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    directoryCount++;
                    walkDir(fullPath);
                } else if (entry.isFile()) {
                    fileCount++;
                    try {
                        const stats = fs.statSync(fullPath);
                        totalSize += stats.size;
                    } catch {
                        // Skip files we can't stat
                    }
                }
            }
        } catch {
            // Skip directories we can't read
        }
    }

    walkDir(archiveDir);

    return { totalSize, fileCount, directoryCount };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
