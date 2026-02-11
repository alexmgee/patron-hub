import { eq } from 'drizzle-orm';
import { db } from './index';
import { settings } from './schema';

export type AppSettingKey =
  | 'archive_dir'
  | 'auto_sync_enabled'
  | 'auto_download_enabled'
  | 'patreon_cookie';

export async function getSetting<T>(key: AppSettingKey, fallback: T): Promise<T> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  if (!row[0]) return fallback;
  return (row[0].value as T) ?? fallback;
}

export async function setSetting<T>(key: AppSettingKey, value: T): Promise<void> {
  const now = new Date();
  const jsonValue = value as unknown as (typeof settings.$inferInsert)['value'];

  // SQLite upsert via ON CONFLICT.
  await db
    .insert(settings)
    .values({
      key,
      value: jsonValue,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: jsonValue, updatedAt: now },
    });
}
