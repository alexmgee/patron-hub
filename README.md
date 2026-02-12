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

On first run, create an admin user at `http://localhost:3000/setup`.

If you do not want login on a trusted LAN-only setup, set `PATRON_HUB_DISABLE_AUTH=1`.

### Local storage paths

By default the app stores:

- SQLite DB: `./data/patron-hub.db`
- Archive root: `./archive/`

Override these via environment variables:

- `PATRON_HUB_DATA_DIR`
- `PATRON_HUB_ARCHIVE_DIR`
- `PATRON_HUB_DISABLE_AUTH` (`1` disables auth; LAN-only recommended)

### Dev bootstrap

On first run (non-production), the server will:

1. Create the SQLite schema from the generated migration in `./drizzle/`
2. Seed sample creators/subscriptions/content so the UI is populated

Disable with `PATRON_HUB_SKIP_BOOTSTRAP=1`.

## Status

UI is functional and DB-backed. Auth is implemented (setup/login/session), and Patreon sync is implemented as an MVP. Real downloads work when a direct media URL is available; some content may still fall back to placeholder archive files when no direct URL is present.

## Deployment

For a home server deployment (Docker Compose + persistent volumes), see `DEPLOYMENT.md`.

For a beginner-friendly, homelab-specific walkthrough (visual map, step-by-step ops, glossary), see `HOMELAB_PATRON_HUB_GUIDE.md`.

## Patreon Sync (MVP)

1. Go to `/settings`
2. Paste your authenticated Patreon cookie string into **Patreon cookie (for sync)**
3. Save settings
4. Click **Sync** on the dashboard

Patreon sync currently:
- imports memberships/campaign subscriptions
- imports recent posts into `content_items`
- stores direct media URLs when available
- auto-downloads media only when direct URLs are present and auto-download is enabled
