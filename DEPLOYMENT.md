# Deployment (Home Server)

Patron Hub is local-first (SQLite + filesystem archive). The simplest "live" deployment is Docker on a machine with persistent disks mounted as volumes.

## Ubuntu (Docker Compose)

1. Install Docker + Compose plugin (once):
   - Follow the official Docker Engine install for Ubuntu.

2. Clone the repo onto the server:
   - `git clone https://github.com/alexmgee/patron-hub.git`
   - `cd patron-hub`

3. Create persistent storage directories:
   - `mkdir -p server-data server-archive`

4. Build + run:
   - LAN (port 3000 open on the server):
     - `docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build`
   - Or internal-only (no host ports published):
     - `docker compose -f docker-compose.yml up -d --build`

5. Open:
   - LAN mode: `http://<server-ip>:3000`

6. First-time setup:
   - Visit `http://<server-ip>:3000/setup` to create the first admin user.
   - Then sign in at `http://<server-ip>:3000/login`.

7. Patreon sync setup (optional):
   - Open Settings in the app.
   - Paste your authenticated Patreon cookie in **Patreon cookie (for sync)**.
   - Save and click **Sync** from the dashboard.

## Public Access (Domain + TLS via Caddy)

This option makes the app reachable from outside your network with a normal domain name and HTTPS.

### Prereqs

- Your home router can port-forward to the server
- You are not behind CGNAT (see check below)
- You have a domain name with DNS control

### Check For CGNAT (Important)

If your ISP uses CGNAT, port forwarding will not work.

On the Ubuntu server:

- Get public IP: `curl -s https://ifconfig.me`
- Compare to router WAN IP (in your router UI)

If the router WAN IP is in `10.x`, `192.168.x`, `172.16-31.x`, or `100.64.x`, you're likely behind CGNAT.

If CGNAT: use a tunnel (Cloudflare Tunnel) or a mesh VPN (Tailscale) instead of port forwarding.

### DNS

Create an `A` record:

- `patron.yourdomain.com` -> your home public IP

If your home IP changes, set up a DDNS updater (provider-specific).

### Router Port Forwarding

Forward TCP ports to your Ubuntu server:

- `80` -> `80`
- `443` -> `443`

### Create an `.env` (not committed)

Copy `.env.example` to `.env` and set:

- `PATRON_HUB_DOMAIN=patron.yourdomain.com`
- `PATRON_HUB_EMAIL=you@yourdomain.com` (used for Let's Encrypt)
- `PATRON_HUB_BASIC_AUTH_USER=...`
- `PATRON_HUB_BASIC_AUTH_HASH=...` (bcrypt hash, not plaintext)

To generate a bcrypt hash:

```bash
docker run --rm caddy:2 caddy hash-password --plaintext 'your-strong-password'
```

### Run With Caddy

From the repo directory:

```bash
mkdir -p server-data server-archive
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

Open:

- `https://patron.yourdomain.com`

## Reverse Proxy (Alternative)

You can also use Nginx/Traefik/etc. The key requirement is persistent volumes for `/data` and `/archive`.

## Notes

- SQLite will be stored in the mounted data volume at `PATRON_HUB_DATA_DIR` (default in container: `/data`).
- Archived files will be written to the mounted archive volume at `PATRON_HUB_ARCHIVE_DIR` (default in container: `/archive`).
