# Patron Hub — Agent Handoff

## TL;DR
Building a **subscription management webapp** for patrons to track, organize, and archive content from Patreon, Substack, Gumroad, and Discord.

---

## Project Location
```
/Users/agee2/Projects/patron-hub
```

## Key Documents
- [Implementation Plan](file:///Users/agee2/.gemini/antigravity/brain/57584708-0f2a-4268-8f8a-dc6ad03ea4b0/implementation_plan.md) — **READ THIS FIRST** — full technical plan, approved by user

---

## Context & User Goals

The user has **~24 Patreon subscriptions** (tech/art how-to content) and feels they're not getting value from them because:
- Forgotten subscriptions draining money
- Missing new releases (buried in noise)
- Unconsumed backlogs with no tracking
- Creators not posting enough to justify cost

**Also has**: Substack newsletters, a few Gumroad purchases, some Discord-based subscriptions

**They want**:
1. **Dashboard** — unified view of all subscriptions, spending, recent posts
2. **Content Archive** — download/backup content they've paid for (personal library)
3. **Product Validation** — interested in seeing if this could be a product others want

---

## Decisions Already Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| App name | Patron Hub | User accepted |
| Framework | Next.js 14 + TypeScript | App Router, modern stack |
| Styling | Tailwind CSS | Default from create-next-app |
| Database | SQLite via Drizzle ORM | Local-first, no cloud dependency for MVP |
| Auth approach | Cookie/session import | More powerful than OAuth for content downloading |
| First platform | Patreon | User's primary pain point |
| Architecture | Modular adapters | Start with Patreon, add Substack/Gumroad/Discord later |
| Archive location | Local (`/archive` folder in project) | Can point to NAS later |

---

## Current State

### What's Done
- ✅ Next.js project initialized with TypeScript, Tailwind, ESLint, App Router
- ✅ Dependencies installed: `drizzle-orm`, `better-sqlite3`, `zustand`, `lucide-react`, `date-fns`
- ✅ Project copied to `/Users/agee2/Projects/patron-hub`

### What's NOT Done Yet
- ❌ Database schema (`src/lib/db/schema.ts`)
- ❌ Dashboard UI components
- ❌ Patreon adapter
- ❌ Download engine
- ❌ Any actual app functionality

---

## Next Steps (Suggested Priority)

1. **Create database schema** — subscriptions, posts, downloads, sync_logs tables
2. **Build dashboard page** — spending overview, subscription cards, activity feed
3. **Implement Patreon adapter** — cookie auth, fetch subscriptions/posts
4. **Build download engine** — queue-based, handles video/image/PDF/audio
5. **Add Substack adapter** — RSS + cookie auth for paywalled content

---

## Tech Stack Summary

```
Next.js 14 (App Router)
├── TypeScript
├── Tailwind CSS
├── Drizzle ORM + better-sqlite3
├── Zustand (state management)
├── lucide-react (icons)
└── date-fns (date formatting)
```

---

## User Preferences Noted
- Prefers working in `/Users/agee2/Projects/` not playground directories
- Interested in product validation (landing page, open source potential)
- Comfortable with technical solutions (cookie import is fine)
