import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';
import { bootstrapDb } from './bootstrap';

// Database file location
// In development, store in project root /data folder
// Can be configured via environment variable for production/NAS storage
const DATA_DIR = process.env.PATRON_HUB_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'patron-hub.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
sqlite.pragma('journal_mode = WAL');

// Dev-friendly bootstrap (create schema + seed sample data).
// Avoid side effects during `next build` while still allowing schema upgrades at runtime.
const isNextBuild = process.env.NEXT_PHASE === 'phase-production-build';
if (!isNextBuild || process.env.PATRON_HUB_FORCE_BOOTSTRAP === '1') {
  bootstrapDb(sqlite);
}

// Create Drizzle instance with schema
export const db = drizzle(sqlite, { schema });

// Export schema for convenience
export * from './schema';

// Helper to get database path (useful for settings UI)
export function getDatabasePath(): string {
    return DB_PATH;
}

// Helper to get data directory (for archive path defaults)
export function getDataDirectory(): string {
    return DATA_DIR;
}
