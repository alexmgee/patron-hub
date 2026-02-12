import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

/**
 * Dev-friendly bootstrap:
 * - Ensure schema exists (apply the generated SQL migration if tables are missing)
 * - Seed sample data if database is empty
 *
 * This keeps "npm run dev" usable without requiring drizzle-kit to be installed/run.
 */

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function columnExists(sqlite: Database.Database, tableName: string, columnName: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === columnName);
}

function ensureSubscriptionColumns(sqlite: Database.Database): void {
  // Keep schema migrations lightweight for early-stage local development.
  if (tableExists(sqlite, 'subscriptions') && !columnExists(sqlite, 'subscriptions', 'auto_download_enabled')) {
    sqlite.exec(`ALTER TABLE subscriptions ADD COLUMN auto_download_enabled integer DEFAULT true NOT NULL;`);
  }
}

function ensureContentItemColumns(sqlite: Database.Database): void {
  if (tableExists(sqlite, 'content_items') && !columnExists(sqlite, 'content_items', 'download_url')) {
    sqlite.exec(`ALTER TABLE content_items ADD COLUMN download_url text;`);
  }
  if (tableExists(sqlite, 'content_items') && !columnExists(sqlite, 'content_items', 'file_name_hint')) {
    sqlite.exec(`ALTER TABLE content_items ADD COLUMN file_name_hint text;`);
  }
}

function ensureAuthTables(sqlite: Database.Database): void {
  if (!tableExists(sqlite, 'users')) {
    sqlite.exec(`
      CREATE TABLE users (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        email text NOT NULL,
        password_hash text NOT NULL,
        is_admin integer DEFAULT true NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE UNIQUE INDEX users_email_unique ON users (email);
    `);
  }

  if (!tableExists(sqlite, 'sessions')) {
    sqlite.exec(`
      CREATE TABLE sessions (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id integer NOT NULL,
        token_hash text NOT NULL,
        created_at integer NOT NULL,
        last_seen_at integer NOT NULL,
        expires_at integer NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
      );
      CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions (token_hash);
    `);
  }
}

function ensureHarvestTables(sqlite: Database.Database): void {
  if (!tableExists(sqlite, 'harvest_jobs')) {
    sqlite.exec(`
      CREATE TABLE harvest_jobs (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        content_item_id integer NOT NULL,
        kind text DEFAULT 'download_url_resolve' NOT NULL,
        status text DEFAULT 'pending' NOT NULL,
        attempt_count integer DEFAULT 0 NOT NULL,
        last_attempt_at integer,
        next_attempt_at integer,
        last_error text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON UPDATE no action ON DELETE cascade
      );
      CREATE UNIQUE INDEX harvest_jobs_content_kind_unique ON harvest_jobs (content_item_id, kind);
      CREATE INDEX harvest_jobs_status_next_attempt_idx ON harvest_jobs (status, next_attempt_at);
    `);
  }
}

function getMigrationsDir(): string {
  return path.join(process.cwd(), 'drizzle');
}

function listMigrationFiles(): string[] {
  const dir = getMigrationsDir();
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir);
  return entries
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => path.join(dir, f));
}

function applyMigrations(sqlite: Database.Database): void {
  const filePaths = listMigrationFiles();
  if (filePaths.length === 0) {
    throw new Error('No drizzle SQL migration found in ./drizzle');
  }

  for (const filePath of filePaths) {
    const sql = fs.readFileSync(filePath, 'utf8');
    sqlite.exec(sql);
  }
}

function seed(sqlite: Database.Database): void {
  // Idempotent: only seed if there are no creators.
  const row = sqlite.prepare('SELECT COUNT(*) as c FROM creators').get() as { c: number };
  if (row.c > 0) return;

  const now = Date.now();

  const creators = [
    { id: 1, name: 'Blender Guru', slug: 'blender-guru', avatar_url: null, bio: null, website_url: null },
    { id: 2, name: 'The Futur', slug: 'the-futur', avatar_url: null, bio: null, website_url: null },
    { id: 3, name: 'Stratechery', slug: 'stratechery', avatar_url: null, bio: null, website_url: null },
    { id: 4, name: 'Design Cuts', slug: 'design-cuts', avatar_url: null, bio: null, website_url: null },
    { id: 5, name: 'CGMatter', slug: 'cgmatter', avatar_url: null, bio: null, website_url: null },
    { id: 6, name: 'Corridor Crew', slug: 'corridor-crew', avatar_url: null, bio: null, website_url: null },
    { id: 7, name: 'Packy McCormick', slug: 'not-boring', avatar_url: null, bio: null, website_url: null },
    { id: 8, name: 'Polygon Runway', slug: 'polygon-runway', avatar_url: null, bio: null, website_url: null },
  ] as const;

  const subscriptions = [
    { id: 1, creator_id: 1, platform: 'patreon', external_id: null, profile_url: null, tier_name: 'Pro Tier', cost_cents: 1000, currency: 'USD', billing_cycle: 'monthly', status: 'active', member_since: Date.parse('2023-01-15'), last_synced_at: null, sync_enabled: 1 },
    { id: 2, creator_id: 2, platform: 'patreon', external_id: null, profile_url: null, tier_name: 'Insider', cost_cents: 2500, currency: 'USD', billing_cycle: 'monthly', status: 'active', member_since: Date.parse('2022-11-01'), last_synced_at: null, sync_enabled: 1 },
    { id: 3, creator_id: 3, platform: 'substack', external_id: null, profile_url: null, tier_name: 'Subscriber', cost_cents: 1200, currency: 'USD', billing_cycle: 'monthly', status: 'active', member_since: Date.parse('2023-06-01'), last_synced_at: null, sync_enabled: 1 },
    { id: 4, creator_id: 4, platform: 'gumroad', external_id: null, profile_url: null, tier_name: null, cost_cents: 0, currency: 'USD', billing_cycle: 'one-time', status: 'active', member_since: null, last_synced_at: null, sync_enabled: 0 },
    { id: 5, creator_id: 5, platform: 'patreon', external_id: null, profile_url: null, tier_name: 'Supporter', cost_cents: 500, currency: 'USD', billing_cycle: 'monthly', status: 'active', member_since: Date.parse('2021-09-01'), last_synced_at: null, sync_enabled: 1 },
    { id: 6, creator_id: 6, platform: 'patreon', external_id: null, profile_url: null, tier_name: 'VFX Pro', cost_cents: 1500, currency: 'USD', billing_cycle: 'monthly', status: 'active', member_since: Date.parse('2024-01-01'), last_synced_at: null, sync_enabled: 1 },
    { id: 7, creator_id: 7, platform: 'substack', external_id: null, profile_url: null, tier_name: 'Paid', cost_cents: 1000, currency: 'USD', billing_cycle: 'monthly', status: 'active', member_since: Date.parse('2022-08-01'), last_synced_at: null, sync_enabled: 1 },
    { id: 8, creator_id: 8, platform: 'patreon', external_id: null, profile_url: null, tier_name: 'Pro', cost_cents: 2000, currency: 'USD', billing_cycle: 'monthly', status: 'active', member_since: Date.parse('2023-03-01'), last_synced_at: null, sync_enabled: 1 },
  ] as const;

  const contentItems = [
    // Blender Guru
    { id: 1, subscription_id: 1, external_id: null, external_url: null, title: 'Advanced Lighting Tutorial - Complete Guide', description: null, content_type: 'video', published_at: Date.parse('2024-01-10'), is_seen: 0, seen_at: null, tags: JSON.stringify(['blender', 'lighting', 'tutorial']), auto_tags: JSON.stringify([]), is_archived: 1, archive_error: null },
    { id: 2, subscription_id: 1, external_id: null, external_url: null, title: 'Shading Masterclass Part 3', description: null, content_type: 'video', published_at: Date.parse('2024-01-03'), is_seen: 1, seen_at: Date.parse('2024-01-04'), tags: JSON.stringify(['shading', 'materials']), auto_tags: JSON.stringify([]), is_archived: 1, archive_error: null },
    { id: 3, subscription_id: 1, external_id: null, external_url: null, title: 'Reference Sheet Pack - Anatomy Studies', description: null, content_type: 'image', published_at: Date.parse('2023-12-28'), is_seen: 1, seen_at: Date.parse('2023-12-29'), tags: JSON.stringify(['reference', 'anatomy']), auto_tags: JSON.stringify([]), is_archived: 1, archive_error: null },
    { id: 4, subscription_id: 1, external_id: null, external_url: null, title: 'Node Setup Cheatsheet 2024', description: null, content_type: 'pdf', published_at: Date.parse('2023-12-15'), is_seen: 0, seen_at: null, tags: JSON.stringify(['nodes', 'reference', 'cheatsheet']), auto_tags: JSON.stringify([]), is_archived: 1, archive_error: null },
    { id: 5, subscription_id: 1, external_id: null, external_url: null, title: 'Procedural Textures Deep Dive', description: null, content_type: 'video', published_at: Date.parse('2023-12-10'), is_seen: 1, seen_at: Date.parse('2023-12-11'), tags: JSON.stringify(['textures', 'procedural', 'nodes']), auto_tags: JSON.stringify([]), is_archived: 1, archive_error: null },
    { id: 6, subscription_id: 1, external_id: null, external_url: null, title: 'Blender 4.0 Update Notes', description: null, content_type: 'article', published_at: Date.parse('2023-11-20'), is_seen: 1, seen_at: Date.parse('2023-11-21'), tags: JSON.stringify(['blender', 'updates']), auto_tags: JSON.stringify([]), is_archived: 1, archive_error: null },

    // A few items for other subscriptions
    { id: 10, subscription_id: 2, external_id: null, external_url: null, title: 'Client Acquisition Playbook', description: null, content_type: 'video', published_at: Date.parse('2024-01-05'), is_seen: 1, seen_at: Date.parse('2024-01-06'), tags: JSON.stringify(['business', 'clients']), auto_tags: JSON.stringify([]), is_archived: 0, archive_error: null },
    { id: 11, subscription_id: 2, external_id: null, external_url: null, title: 'Brand Strategy Worksheet', description: null, content_type: 'pdf', published_at: Date.parse('2023-12-30'), is_seen: 1, seen_at: Date.parse('2023-12-30'), tags: JSON.stringify(['brand', 'worksheet']), auto_tags: JSON.stringify([]), is_archived: 0, archive_error: null },

    { id: 20, subscription_id: 3, external_id: null, external_url: null, title: 'AI and the Future of Strategy', description: null, content_type: 'article', published_at: Date.parse('2024-01-12'), is_seen: 0, seen_at: null, tags: JSON.stringify(['ai', 'strategy']), auto_tags: JSON.stringify([]), is_archived: 0, archive_error: null },

    { id: 30, subscription_id: 4, external_id: null, external_url: null, title: 'Design Assets Pack Vol. 1', description: null, content_type: 'attachment', published_at: Date.parse('2024-01-08'), is_seen: 0, seen_at: null, tags: JSON.stringify(['assets', 'design']), auto_tags: JSON.stringify([]), is_archived: 0, archive_error: null },

    { id: 40, subscription_id: 5, external_id: null, external_url: null, title: 'Geometry Nodes Quick Wins', description: null, content_type: 'video', published_at: Date.parse('2023-12-28'), is_seen: 1, seen_at: Date.parse('2023-12-29'), tags: JSON.stringify(['blender', 'geo-nodes']), auto_tags: JSON.stringify([]), is_archived: 0, archive_error: null },
    { id: 41, subscription_id: 5, external_id: null, external_url: null, title: 'Shader Library Drop', description: null, content_type: 'attachment', published_at: Date.parse('2023-12-15'), is_seen: 1, seen_at: Date.parse('2023-12-16'), tags: JSON.stringify(['shaders', 'library']), auto_tags: JSON.stringify([]), is_archived: 0, archive_error: null },

    { id: 50, subscription_id: 6, external_id: null, external_url: null, title: 'VFX Reacts: Behind the Shots', description: null, content_type: 'video', published_at: Date.parse('2024-01-11'), is_seen: 0, seen_at: null, tags: JSON.stringify(['vfx']), auto_tags: JSON.stringify([]), is_archived: 0, archive_error: null },

    { id: 60, subscription_id: 7, external_id: null, external_url: null, title: 'Markets and Moats', description: null, content_type: 'article', published_at: Date.parse('2024-01-03'), is_seen: 1, seen_at: Date.parse('2024-01-04'), tags: JSON.stringify(['markets', 'business']), auto_tags: JSON.stringify([]), is_archived: 0, archive_error: null },

    { id: 70, subscription_id: 8, external_id: null, external_url: null, title: 'Hard Surface Kitbash Pack', description: null, content_type: 'attachment', published_at: Date.parse('2024-01-13'), is_seen: 0, seen_at: null, tags: JSON.stringify(['kitbash', 'hard-surface']), auto_tags: JSON.stringify([]), is_archived: 0, archive_error: null },
  ] as const;

  sqlite.transaction(() => {
    const insertCreator = sqlite.prepare(
      `INSERT INTO creators (id, name, slug, avatar_url, bio, website_url, created_at, updated_at)
       VALUES (@id, @name, @slug, @avatar_url, @bio, @website_url, @created_at, @updated_at)`
    );
    for (const c of creators) {
      insertCreator.run({ ...c, created_at: now, updated_at: now });
    }

    const insertSubscription = sqlite.prepare(
      `INSERT INTO subscriptions (
          id, creator_id, platform, external_id, profile_url, tier_name,
          cost_cents, currency, billing_cycle, status, member_since,
          last_synced_at, sync_enabled, created_at, updated_at
        ) VALUES (
          @id, @creator_id, @platform, @external_id, @profile_url, @tier_name,
          @cost_cents, @currency, @billing_cycle, @status, @member_since,
          @last_synced_at, @sync_enabled, @created_at, @updated_at
        )`
    );
    for (const s of subscriptions) {
      insertSubscription.run({ ...s, created_at: now, updated_at: now });
    }

    const insertContent = sqlite.prepare(
      `INSERT INTO content_items (
          id, subscription_id, external_id, external_url, title, description, content_type,
          published_at, is_seen, seen_at, tags, auto_tags, is_archived, archive_error,
          created_at, updated_at
        ) VALUES (
          @id, @subscription_id, @external_id, @external_url, @title, @description, @content_type,
          @published_at, @is_seen, @seen_at, @tags, @auto_tags, @is_archived, @archive_error,
          @created_at, @updated_at
        )`
    );
    for (const ci of contentItems) {
      insertContent.run({ ...ci, created_at: now, updated_at: now });
    }

    // A few download records to make "Archived" show up in the UI.
    const insertDownload = sqlite.prepare(
      `INSERT INTO downloads (
          id, content_item_id, file_name, file_type, mime_type, size_bytes, local_path,
          downloaded_at, created_at
        ) VALUES (
          @id, @content_item_id, @file_name, @file_type, @mime_type, @size_bytes, @local_path,
          @downloaded_at, @created_at
        )`
    );
    const downloads = [
      { id: 1, content_item_id: 1, file_name: 'advanced-lighting-tutorial.mp4', file_type: 'video', mime_type: 'video/mp4', size_bytes: null, local_path: 'patreon/blender-guru/2024-01/Advanced_Lighting_Tutorial_-_Complete_Guide/advanced-lighting-tutorial.mp4' },
      { id: 2, content_item_id: 4, file_name: 'node-setup-cheatsheet-2024.pdf', file_type: 'pdf', mime_type: 'application/pdf', size_bytes: null, local_path: 'patreon/blender-guru/2023-12/Node_Setup_Cheatsheet_2024/node-setup-cheatsheet-2024.pdf' },
    ] as const;
    for (const d of downloads) {
      insertDownload.run({ ...d, downloaded_at: now, created_at: now });
    }

	    // Store a default archive directory in settings for display (still overridden by env).
	    const insertSetting = sqlite.prepare(
	      `INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, @updated_at)`
	    );
	    insertSetting.run({ key: 'archive_dir', value: JSON.stringify(null), updated_at: now });
	    insertSetting.run({ key: 'auto_sync_enabled', value: JSON.stringify(true), updated_at: now });
	    insertSetting.run({ key: 'auto_download_enabled', value: JSON.stringify(true), updated_at: now });
	    insertSetting.run({ key: 'patreon_cookie', value: JSON.stringify(null), updated_at: now });
	  })();
	}

export function bootstrapDb(sqlite: Database.Database): void {
  // Allow opting out in environments where filesystem writes are undesirable.
  if (process.env.PATRON_HUB_SKIP_BOOTSTRAP === '1') return;

  // Ensure foreign keys are actually enforced.
  sqlite.pragma('foreign_keys = ON');

  // If schema is missing, apply migration.
  if (!tableExists(sqlite, 'creators') || !tableExists(sqlite, 'subscriptions')) {
    applyMigrations(sqlite);
  }

  // Apply lightweight schema upgrades for existing DBs.
  ensureSubscriptionColumns(sqlite);
  ensureContentItemColumns(sqlite);
  ensureAuthTables(sqlite);
  ensureHarvestTables(sqlite);

  // Seed sample data in development (or when explicitly forced).
  if (process.env.NODE_ENV !== 'production' || process.env.PATRON_HUB_FORCE_SEED === '1') {
    seed(sqlite);
  }
}
