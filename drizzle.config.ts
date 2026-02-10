import { defineConfig } from 'drizzle-kit';
import path from 'path';

const DATA_DIR = process.env.PATRON_HUB_DATA_DIR || path.join(process.cwd(), 'data');

export default defineConfig({
    schema: './src/lib/db/schema.ts',
    out: './drizzle',
    dialect: 'sqlite',
    dbCredentials: {
        url: path.join(DATA_DIR, 'patron-hub.db'),
    },
});
