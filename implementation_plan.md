# Patron Hub: Personal Content Library

A modular webapp to capture, archive, and organize all content from your paid creator subscriptions — maximizing the value of every subscription by ensuring you have everything you've paid for, locally stored and forever usable.

## Problem Statement

Patrons paying for multiple creator subscriptions face:
- **Missed content** buried in email/platform noise
- **No unified view** across platforms (Patreon, Substack, Gumroad, Discord)
- **No offline archive** of content you've paid for
- **No way to search** across all your subscribed content

**The goal is NOT to cut subscriptions** — it's to **capture all the value** from the ones you're keeping.

---

## Design Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Navigation | Dashboard → Sidebar+Panel | Dense + modularly navigable |
| New content | Auto-download + notify | Hands-off archiving |
| Sync frequency | Daily | Sufficient for creator content |
| Tagging | AI auto-extract + manual edit | Best of both worlds |
| Search | Metadata (titles, tags, creators) | Full-text/transcripts as future opt-in |
| Consumption tracking | Simple new/seen filter | Not for metrics, just for filtering |
| Notifications | In-app + optional email | Visual badge in hub |
| Content viewer | Native apps for now | Built-in viewer as future enhancement |
| Storage | Configurable path (NAS/local) | User has Synology NAS + 22TB local storage |

---

## UI Design

### Dashboard (Overview)

```
┌─────────────────────────────────────────────────────────────────────┐
│  🏠 PATRON HUB                                      [🔍 Search] [⚙]│
├─────────────────────────────────────────────────────────────────────┤
│  📊 24 subscriptions • $127/mo • 847 archived • 12 new items       │
├─────────────────────────────────────────────────────────────────────┤
│  [Sort: Recent ▼] [Filter: All | With New | By Platform ▼]         │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐    │
│  │ 🎨 Creator Name  │ │ ✍️ Creator Name  │ │ 🎬 Creator Name  │    │
│  │ ──────────────── │ │ ──────────────── │ │ ──────────────── │    │
│  │ Patreon • $5/mo  │ │ Substack • Free  │ │ Patreon • $10/mo │    │
│  │ 142 items        │ │ 47 items         │ │ 89 items         │    │
│  │ 📹 47 📷 89 📄 6 │ │ 📄 47            │ │ 📹 89            │    │
│  │ ──────────────── │ │ ──────────────── │ │ ──────────────── │    │
│  │ 🔴 3 new         │ │ ⚪ Up to date    │ │ 🔴 5 new         │    │
│  │ Last: 2 days ago │ │ Last: 1 week ago │ │ Last: Today      │    │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘    │
│                                                                     │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐    │
│  │ ...              │ │ ...              │ │ ...              │    │
└─────────────────────────────────────────────────────────────────────┘
```

**Creator Card includes:**
- Creator name + avatar
- Platform icon (Patreon/Substack/Gumroad)
- Tier + monthly cost
- Total archived items
- Content type breakdown (videos/images/PDFs/audio)
- New item count (badge)
- Last post date

---

### Creator Detail View

```
┌─────────────────────────────────────────────────────────────────────┐
│  ◀ Back to Dashboard                               [🔍 Search] [⚙]│
├─────────────────────────────────────────────────────────────────────┤
│  🎨 Creator Name                                                    │
│  Patreon • Pro Tier • $10/mo • Member since Jan 2023               │
│  142 items archived • 847 MB                                        │
├────────────────┬────────────────────────────────────────────────────┤
│                │ [Filter: All | New Only]  [Sort: Date ▼ | Type]   │
│  SIDEBAR       │ [Search within creator...]                         │
│                ├────────────────────────────────────────────────────┤
│ ─────────────  │                                                    │
│ 📁 All (142)   │ ┌────────────────────────────────────────────────┐│
│ 📹 Videos (47) │ │ 🔴 NEW                                         ││
│ 📷 Images (89) │ │ Advanced Lighting Tutorial                     ││
│ 📄 PDFs (6)    │ │ Jan 10, 2024 • Video • 45 min • 1.2 GB         ││
│                │ │ #blender #lighting #tutorial                   ││
│ ─────────────  │ └────────────────────────────────────────────────┘│
│ 🏷️ TAGS        │                                                    │
│  #blender (34) │ ┌────────────────────────────────────────────────┐│
│  #tutorial (28)│ │ Shading Masterclass Part 3                     ││
│  #lighting (12)│ │ Jan 3, 2024 • Video • 1h 12min • 2.4 GB        ││
│  #rigging (8)  │ │ #shading #materials                            ││
│                │ └────────────────────────────────────────────────┘│
│ ─────────────  │                                                    │
│ ⚙️ Settings    │ ┌────────────────────────────────────────────────┐│
│  Sync enabled  │ │ Reference Sheet Pack                           ││
│  Auto-download │ │ Dec 28, 2023 • Images (24) • 156 MB            ││
│                │ │ #reference #anatomy                            ││
│                │ └────────────────────────────────────────────────┘│
└────────────────┴────────────────────────────────────────────────────┘
```

---

## Proposed Changes

### Phase 1: Core Foundation

#### [NEW] `src/lib/db/schema.ts`
Database schema using Drizzle ORM:

```typescript
// Creators (not just subscriptions - a creator can be on multiple platforms)
creators: {
  id, name, avatar_url, created_at
}

// Subscriptions (your relationship to a creator on a platform)
subscriptions: {
  id, creator_id, platform, tier_name, cost_cents, currency,
  billing_cycle, status, member_since, last_synced_at, created_at
}

// Content items (individual posts/uploads)
content_items: {
  id, subscription_id, external_id, title, description,
  content_type, published_at, is_seen, tags, created_at
}

// Downloaded files (actual files on disk)
downloads: {
  id, content_item_id, file_name, file_type, mime_type,
  size_bytes, local_path, downloaded_at
}

// Sync logs (tracking sync history)
sync_logs: {
  id, subscription_id, started_at, completed_at,
  items_found, items_downloaded, errors
}

// App settings (archive path, sync schedule, etc.)
settings: {
  key, value, updated_at
}
```

#### [NEW] `src/lib/db/index.ts`
Drizzle ORM setup with better-sqlite3.

#### [NEW] `drizzle.config.ts`
Drizzle Kit configuration for migrations.

---

### Phase 2: Dashboard UI

#### [MODIFY] `src/app/page.tsx`
Replace default Next.js page with Dashboard:
- Global stats bar (subscription count, monthly spend, archive size, new items)
- Filter/sort controls
- Creator card grid

#### [NEW] `src/components/CreatorCard.tsx`
Rich creator card component showing all metadata.

#### [NEW] `src/components/StatsBar.tsx`
Top stats bar with key metrics.

#### [NEW] `src/components/FilterBar.tsx`
Sorting and filtering controls.

---

### Phase 3: Creator Detail View

#### [NEW] `src/app/creator/[id]/page.tsx`
Creator detail page with sidebar + content panel layout.

#### [NEW] `src/components/ContentSidebar.tsx`
Sidebar with content type folders, tag cloud, and per-creator settings.

#### [NEW] `src/components/ContentList.tsx`
Scrollable list of content items with metadata.

#### [NEW] `src/components/ContentItem.tsx`
Individual content item card with click-to-open behavior.

---

### Phase 4: Patreon Adapter

#### [NEW] `src/lib/adapters/types.ts`
Platform adapter interface definition.

#### [NEW] `src/lib/adapters/patreon/index.ts`
Patreon adapter implementation:
- Cookie-based authentication
- Fetch pledges/subscriptions
- Fetch posts for each subscription
- Parse attachments and media

#### [NEW] `src/app/settings/page.tsx`
Settings page for:
- Cookie import UI
- Archive path configuration
- Sync schedule settings

---

### Phase 5: Download Engine

#### [NEW] `src/lib/downloader/engine.ts`
Queue-based download manager:
- Respects rate limits
- Organizes files: `/archive/{platform}/{creator}/{YYYY-MM}/{item}/`
- Tracks download status

#### [NEW] `src/lib/downloader/scheduler.ts`
Daily sync scheduler:
- Runs on app start or via cron
- Checks all subscriptions for new content
- Queues downloads

#### [NEW] `src/lib/notifications/index.ts`
Notification system:
- In-app badge updates
- Optional email digest (future)

---

### Phase 6: Search & Tagging

#### [NEW] `src/lib/search/index.ts`
Search implementation:
- SQLite FTS for metadata search
- Filter by creator, type, tags

#### [NEW] `src/lib/tagging/auto-tagger.ts`
AI-powered auto-tagging:
- Extract topics from titles
- Can use local LLM or simple keyword extraction for MVP

---

## Project Structure

```
patron-hub/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Dashboard
│   │   ├── creator/[id]/page.tsx    # Creator detail
│   │   ├── settings/page.tsx        # Settings
│   │   └── layout.tsx
│   ├── components/
│   │   ├── CreatorCard.tsx
│   │   ├── StatsBar.tsx
│   │   ├── FilterBar.tsx
│   │   ├── ContentSidebar.tsx
│   │   ├── ContentList.tsx
│   │   └── ContentItem.tsx
│   ├── lib/
│   │   ├── adapters/
│   │   │   ├── types.ts
│   │   │   └── patreon/
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   └── index.ts
│   │   ├── downloader/
│   │   │   ├── engine.ts
│   │   │   └── scheduler.ts
│   │   ├── notifications/
│   │   └── search/
│   └── styles/
├── archive/                          # Downloaded content (gitignored)
├── data/                             # SQLite database (gitignored)
├── drizzle.config.ts
└── package.json
```

---

## Verification Plan

### Automated Tests

Since this is a new project, we'll add tests incrementally:

```bash
npm run test        # Vitest for unit tests (to be set up)
```

**Unit tests to create:**
- Database schema validation
- Adapter interface compliance
- Download queue logic
- Search query parsing

### Manual Verification

#### Phase 1-2: Core + Dashboard
1. Run `npm run dev`
2. Open `http://localhost:3000`
3. Verify dashboard loads with mock/seed data
4. Verify creator cards display all metadata correctly
5. Test sorting and filtering

#### Phase 3: Creator Detail
1. Click a creator card
2. Verify sidebar shows content type counts
3. Verify content list shows items with correct metadata
4. Test "New Only" filter
5. Click item → verify it opens in native app

#### Phase 4: Patreon Integration
1. Export Patreon cookies from browser
2. Import via Settings page
3. Click "Sync Now"
4. Verify subscriptions populate dashboard
5. Verify posts appear in creator detail view

#### Phase 5: Download Engine
1. Trigger download of a single item
2. Verify file appears in configured archive folder
3. Verify database records download with correct path
4. Check in-app notification appears

---

## MVP Scope vs. Future

| **MVP** | **Future** |
|---------|------------|
| Patreon adapter | Substack, Gumroad, Discord adapters |
| Dashboard + creator detail | Mobile-responsive design |
| Manual cookie import | Browser extension for easy auth |
| Daily sync (manual trigger for MVP) | Background scheduled sync |
| Local SQLite | Cloud sync option |
| Metadata search | Full-text + transcript search |
| Native app viewers | Built-in media player |
| Keyword-based auto-tags | AI-powered topic extraction |
