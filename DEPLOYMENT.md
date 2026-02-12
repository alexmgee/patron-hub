# Deployment (Home Server)

Patron Hub is local-first: SQLite + filesystem archive. For your current homelab, the primary target is:

- Host: `cloud3-hoard`
- LAN IP: `192.168.1.10`
- Tailscale IP: `100.111.109.23`
- OS: Ubuntu Server 24.04

## LAN Deployment (Recommended Now)

1. Install Docker + Compose plugin on `cloud3-hoard` (once).
2. Clone repo on the server:
   - `git clone https://github.com/alexmgee/patron-hub.git`
   - `cd patron-hub`
3. Create persistent app directories:
   - `mkdir -p server-data server-archive`
4. Build and start:
   - `docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build`
5. Open Patron Hub:
   - LAN: `http://192.168.1.10:3000`
   - Tailscale (if enabled): `http://100.111.109.23:3000`
6. First-time auth setup:
   - `http://192.168.1.10:3000/setup`
   - Then login at `http://192.168.1.10:3000/login`
7. Optional Patreon sync:
   - Go to Settings
   - Paste full authenticated Patreon cookie into `Patreon cookie (for sync)`
   - Click `Sync` on dashboard

### Optional: Disable Login For Trusted LAN

If you want to skip setup/login entirely on your private network:

1. Create `.env` in repo root.
2. Add `PATRON_HUB_DISABLE_AUTH=1`.
3. Restart compose.

Use this only on trusted LAN/VPN access.

## Where Data Lives

- DB in container: `/data/patron-hub.db`
- Archive in container: `/archive/...`
- Host bind mounts:
  - `./server-data -> /data`
  - `./server-archive -> /archive`

You can keep these under the repo folder, or move them onto your NAS-backed paths and update compose volumes.

## Ops Commands

- Start/update: `docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build`
- Stop: `docker compose -f docker-compose.yml -f docker-compose.lan.yml down`
- Logs: `docker compose -f docker-compose.yml -f docker-compose.lan.yml logs -f patron-hub`
- Status: `docker compose -f docker-compose.yml -f docker-compose.lan.yml ps`

## Public Domain Later (Caddy + TLS)

When you get a domain, switch to the Caddy overlay.

1. Create `.env` from `.env.example`
2. Set:
   - `PATRON_HUB_DOMAIN=patron.yourdomain.com`
   - `PATRON_HUB_EMAIL=you@yourdomain.com`
   - `PATRON_HUB_BASIC_AUTH_USER=...`
   - `PATRON_HUB_BASIC_AUTH_HASH=...`
3. Generate bcrypt hash:

```bash
docker run --rm caddy:2 caddy hash-password --plaintext 'your-strong-password'
```

4. Start public stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

5. Open:
   - `https://patron.yourdomain.com`

## CGNAT Check (For Public Exposure)

If your ISP uses CGNAT, router port forwarding will fail.

- Server public IP: `curl -s https://ifconfig.me`
- Compare with router WAN IP
- If WAN IP is private (`10.x`, `192.168.x`, `172.16-31.x`, `100.64.x`), use Cloudflare Tunnel or Tailscale instead.
