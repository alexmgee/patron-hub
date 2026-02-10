# Patron Hub: Handoff & Status Update

## 1. Scope & Intent
**Patron Hub** is a self-hosted content library designed to serve as a personal archive for paid creator subscriptions (e.g., Patreon, Substack, Gumroad).

-   **Goal**: Create a unified, offline-first dashboard to view and manage exclusive content.
-   **Core Philosophy**: "Your data, your control." It focuses on local archiving and a premium user experience.
-   **Key Features**:
    -   **Unified Feed**: Aggregate content from multiple platforms.
    -   **Creator Profiles**: Detailed views for individual subscriptions.
    -   **Offline Archive**: Download and store video, audio, and PDF content.
    -   **Analytics**: Visualize monthly spend and content volume.

## 2. Accomplished So Far
We have successfully built the frontend foundation and defined the backend structure:

-   **Tech Stack**: Next.js 16 (App Router), React 19, TailwindCSS v4, Drizzle ORM, SQLite.
-   **UI Implementation**:
    -   **Dashboard**: Functioning grid layout with dynamic "Creator Cards" and statistics.
    -   **Creator Detail View**: Complex page (`/creator/[id]`) with filtering by content type (Video/Image/PDF/Audio) and tags.
    -   **Design System**: Polished dark mode UI with glassmorphism effects and consistent typography.
-   **Backend Architecture**:
    -   **Database Schema**: Complete SQLite schema defined in `src/lib/db/schema.ts` covering Creators, Subscriptions, ContentItems, and Downloads.
    -   **Archive Logic**: Utility functions in `src/lib/archive/index.ts` for consistent file path generation and sanitization.

## 3. Where We Left Off
-   **Current State**: The application is buildable (`npm run build` passes) and runnable. The UI is fully interactive but populated with **hardcoded mock data**.
-   **Pending Integration**:
    -   The SQLite database is defined but **not initialized**.
    -   No real data is being read from or written to the database.
    -   The "Sync" button on the dashboard is a placeholder.

## 4. What is Planned Ahead
The immediate roadmap to transition from prototype to product:

### Short Term: Data Actuation
1.  **Initialize Database**: Run Drizzle migrations to create the local SQLite file.
2.  **Seed Data**: Populate the DB with the current mock data to maintain UI functionality.
3.  **Connect UI**: updated Server Components to fetch data from SQLite instead of static arrays.

### Medium Term: Ingestion & Features
1.  **Ingestion Logic**: Build the mechanisms to actually import data (manual JSON import or API integration).
2.  **File Archiving**: Connect the `Download` buttons to the `archive/index.ts` logic to actually save files to disk.
3.  **Settings**: Create a configuration page for archive paths and platform credentials.

> [!NOTE]
> A technical implementation plan for "Data Actuation" has been prepared in `implementation_plan.md`.
