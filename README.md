## Patron Hub

Local-first dashboard to track, organize, and archive content from paid creator subscriptions (Patreon, Substack, Gumroad, Discord).

The MVP is intentionally self-hosted: SQLite + filesystem archive so your library stays under your control.

## Getting Started

### Prereqs

- Node.js (the app is built with Next.js 16)
- npm

### Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Local storage paths

By default the app stores:

- SQLite DB: `./data/patron-hub.db`
- Archive root: `./archive/`

Override these via environment variables:

- `PATRON_HUB_DATA_DIR`
- `PATRON_HUB_ARCHIVE_DIR`

### Dev bootstrap

On first run (non-production), the server will:

1. Create the SQLite schema from the generated migration in `./drizzle/`
2. Seed sample creators/subscriptions/content so the UI is populated

Disable with `PATRON_HUB_SKIP_BOOTSTRAP=1`.

## Status

UI is functional and now DB-backed. Ingestion/adapters and real downloads are not implemented yet; “Sync” and “Archive” are placeholder endpoints that write to the local DB.

## Deployment

For a home server deployment (Docker Compose + persistent volumes), see `DEPLOYMENT.md`.
