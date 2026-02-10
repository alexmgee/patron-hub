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
   - `docker compose up -d --build`

5. Open:
   - `http://<server-ip>:3000`

## Reverse Proxy (Optional)

If you want a nice URL + TLS, put a reverse proxy in front (Caddy or Nginx) and forward to `localhost:3000`.

## Notes

- SQLite will be stored in the mounted data volume at `PATRON_HUB_DATA_DIR` (default in container: `/data`).
- Archived files will be written to the mounted archive volume at `PATRON_HUB_ARCHIVE_DIR` (default in container: `/archive`).

