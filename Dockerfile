FROM node:22-bookworm-slim AS deps

WORKDIR /app

# Needed for better-sqlite3 native build fallback.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# During image build, avoid touching runtime SQLite files while collecting page data.
RUN PATRON_HUB_SKIP_BOOTSTRAP=1 npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
# Runtime DB bootstrap reads SQL migrations from ./drizzle on first start.
COPY --from=builder /app/drizzle ./drizzle

# App writes to these directories. Mount volumes here in docker-compose.
ENV PATRON_HUB_DATA_DIR=/data
ENV PATRON_HUB_ARCHIVE_DIR=/archive

EXPOSE 3000
CMD ["npm", "start"]
