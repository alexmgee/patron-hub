# Patron Hub Homelab Guide

This guide is tailored to your current `homelab_overview.md` values:

- Server: `cloud3-hoard` (`192.168.1.10`, Tailscale `100.111.109.23`)
- NAS: `cloud` / Synology (`192.168.1.200`, Tailscale `100.71.252.69`)
- Goal for now: LAN-first deployment, domain later

## 1. What Patron Hub Is

Patron Hub is your personal, self-hosted dashboard for paid creator content.

It does 3 core things:

1. Tracks creators/subscriptions in one UI.
2. Pulls Patreon membership/post data (MVP).
3. Archives files locally to your own storage.

## 2. Visual Map

```mermaid
graph TD
    User["You (Browser)"] --> LAN["LAN or Tailscale"]
    LAN --> Server["cloud3-hoard<br/>Ubuntu + Docker"]

    subgraph PatronHub["Patron Hub Container"]
      App["Next.js App (:3000)"]
      DB["SQLite (/data/patron-hub.db)"]
      Archive["Archive Files (/archive/...)"]
      App --> DB
      App --> Archive
    end

    Server --> PatronHub
    App --> Patreon["Patreon API (cookie-auth MVP)"]

    Server -. optional storage mount .-> Synology["Synology cloud<br/>192.168.1.200"]
```

## 3. Current Scope (What Works vs Not Yet)

Working now:

- First-run setup (`/setup`) creates admin user.
- Login/logout with session cookie auth.
- Dashboard + creator detail views.
- Manual subscription add/import JSON.
- Patreon sync MVP (`/api/sync`) with cookie-based fetch.
- Archiving:
  - Real file download when direct media URL exists.
  - Placeholder metadata file when direct URL is unavailable.

Not complete yet:

- Full adapters for Substack/Gumroad/Discord.
- Background scheduler/queue.
- Multi-user admin features.
- Public internet hardening beyond basic setup.

## 4. Install on Your Server (LAN-first)

Run these on `cloud3-hoard`.

```bash
git clone https://github.com/alexmgee/patron-hub.git
cd patron-hub
mkdir -p server-data server-archive
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
```

Open:

- `http://192.168.1.10:3000` (LAN)
- `http://100.111.109.23:3000` (Tailscale)

First-time setup:

1. Visit `/setup`
2. Create admin email + password
3. Login at `/login`

## 5. Daily Operations

From `/Users/agee2/Projects/patron-hub` on server:

```bash
# Start / update
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build

# Stop
docker compose -f docker-compose.yml -f docker-compose.lan.yml down

# Check status
docker compose -f docker-compose.yml -f docker-compose.lan.yml ps

# Follow logs
docker compose -f docker-compose.yml -f docker-compose.lan.yml logs -f patron-hub
```

## 6. Patreon Sync Setup

1. Login to Patron Hub.
2. Open `Settings`.
3. Paste your full authenticated Patreon cookie string into `Patreon cookie (for sync)`.
4. Save.
5. Hit `Sync` on dashboard.

## 7. Homelab Hookup Checklist

Check these are true:

1. Patron Hub reachable on `http://192.168.1.10:3000`.
2. Container is running (`docker compose ... ps` shows `patron-hub` up).
3. `server-data` has `patron-hub.db`.
4. `server-archive` has creator/platform folders after archiving.
5. If using NAS storage for app data, your target path is mounted and writable before starting Compose.

## 8. Storage Layout

Inside host repo folder:

- `server-data/` -> SQLite + app data
- `server-archive/` -> archived content files

Inside app archive tree:

`{platform}/{creatorSlug}/{YYYY-MM}/{content-title}/{file}`

Example:

`patreon/blender-guru-12345/2026-02/some-post-title/video.mp4`

## 9. Public Domain Later

When you buy a domain:

1. Configure DNS `A` record to your public IP.
2. Set `.env` values (`PATRON_HUB_DOMAIN`, `PATRON_HUB_EMAIL`, Caddy basic auth creds).
3. Use Caddy compose overlay:
   - `docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build`

Keep Tailscale as a fallback path regardless of public DNS.

## 10. Glossary

- `LAN`: Your local network at home (e.g., `192.168.1.x`).
- `Tailscale`: Private mesh VPN that gives each device a stable private IP.
- `CGNAT`: ISP network setup that often blocks inbound port-forwarding.
- `Reverse proxy`: Front service (like Caddy) that accepts internet traffic and forwards to app container.
- `SQLite`: Single-file database used by Patron Hub.
- `Archive root`: Folder where downloaded/archived content is stored.
- `Compose overlay`: Second compose file layered on base compose (`-f file1 -f file2`).
- `Patreon cookie`: Browser session credential used by MVP sync adapter.
- `Auto-sync`: Global/subscription toggle that allows sync actions.
- `Auto-download`: Download media automatically when direct URLs are available.
