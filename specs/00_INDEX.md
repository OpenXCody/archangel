# ARCHANGEL: Technical Specifications Index

## Project Overview

**Name**: Archangel  
**Domain**: o-10.com  
**Purpose**: US Manufacturing Workforce Intelligence Platform

Archangel is a geospatial data exploration platform that visualizes the US manufacturing ecosystem. Users can discover companies, their factories, the occupations within those factories, and the skills required for each occupation.

---

## Specification Documents

This project is defined across six specification documents. Each document is self-contained and provides Claude Code with everything needed to implement that feature.

| Document | File | Description |
|----------|------|-------------|
| Data Import | `01_DATA_IMPORT.md` | File upload, column mapping, validation, error queue |
| Map View | `02_MAP_VIEW.md` | Geographic visualization, state summaries, factory markers |
| Node Explorer | `03_NODE_EXPLORER.md` | Entity browsing, search, filtering, detail modals |
| Global Search | `04_GLOBAL_SEARCH.md` | Command palette search across all entities |
| Database Schema | `05_DATABASE_SCHEMA.md` | Drizzle schema, TypeScript types, relationships |
| App Deployment | `06_APP_DEPLOYMENT.md` | Web, PWA, iOS, and Android deployment strategies |
| Design System | `07_DESIGN_SYSTEM.md` | Colors, typography, components, animations |

---

## Implementation Order

Build in this sequence to ensure dependencies are satisfied:

### Phase 1: Foundation
1. Database schema and migrations (from `05_DATABASE_SCHEMA.md`)
2. Shared TypeScript types (from `05_DATABASE_SCHEMA.md`)
3. Express server skeleton with CORS and error handling
4. React client scaffold with routing

### Phase 2: Data Layer
5. Import pipeline backend (`01_DATA_IMPORT.md` - API endpoints)
6. Import UI components (`01_DATA_IMPORT.md` - Frontend)
7. Seed script for test data

### Phase 3: Core Features
8. Map View backend (GeoJSON endpoint, state summaries)
9. Map View frontend (`02_MAP_VIEW.md`)
10. Node Explorer backend (CRUD endpoints, search)
11. Node Explorer frontend (`03_NODE_EXPLORER.md`)

### Phase 4: Polish
12. Global Search (`04_GLOBAL_SEARCH.md`)
13. Entity detail pages (full page views)
14. Mobile responsiveness
15. Performance optimization

### Phase 5: Deployment
16. PWA configuration (manifest, service worker, icons)
17. Web deployment to Vercel/Railway
18. Capacitor setup and native platform configuration
19. iOS App Store submission
20. Google Play Store submission

---

## Tech Stack Summary

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 18 + TypeScript | Vite build system |
| Styling | Tailwind CSS + shadcn/ui | Dark mode, consistent design system |
| State | Zustand + TanStack Query | UI state + server state |
| Backend | Express.js + TypeScript | RESTful API |
| Database | PostgreSQL + PostGIS | Hosted on Neon or Supabase |
| ORM | Drizzle | Type-safe, lightweight |
| Maps | MapLibre GL JS | Free, Mapbox-compatible |
| Tiles | MapTiler Free Tier | Dark style, 50k requests/month free |
| PWA | vite-plugin-pwa | Service worker, manifest generation |
| Mobile | Capacitor | Native iOS/Android wrapper |
| Hosting | Vercel + Railway | Frontend CDN + backend with database |

---

## Route Structure

### Public Routes (Read-Only)
```
/                     → Redirect to /map
/map                  → Map View
/explore              → Node Explorer
/companies/:id        → Company detail page
/factories/:id        → Factory detail page
/occupations/:id      → Occupation detail page
/skills/:id           → Skill detail page
/states/:code         → State detail page
```

### Admin Routes (Future: Auth Required)
```
/data/import          → Data Import
/data/errors          → Error Queue Management
/data/batches         → Import History
```

---

## API Route Structure

```
/api/companies        → Company CRUD + list
/api/factories        → Factory CRUD + list + GeoJSON
/api/occupations      → Occupation CRUD + list
/api/skills           → Skill CRUD + list
/api/search           → Global search
/api/map/states       → State summaries + details
/api/import           → Parse, validate, execute imports
```

---

## Entity Color Coding

| Entity | Color | Hex | Usage |
|--------|-------|-----|-------|
| Company | Amber | #F59E0B | Badges, borders, icons |
| Factory | Light Blue | #60A5FA | Map markers, badges |
| Occupation | Dark Blue | #1E40AF | Badges, icons |
| Skill | Emerald | #10B981 | Badges, icons |
| State | Indigo | #6366F1 | Map highlights |

---

## Key Design Decisions

### Data Ingestion
- Column mapping with auto-detection and user confirmation
- Non-blocking errors: flag and continue, resolve later
- Alias dictionary builds organically through imports
- Unlinked entities flagged as errors, not auto-created

### Map Visualization
- Zoom-based rendering: states (zoomed out) → clusters → markers (zoomed in)
- Choropleth shading shows data density at national level
- Sidebar panels for entity details, not full page navigations
- URL state sync for shareable map views

### Node Hierarchy
- Companies and Factories are specific entities
- Occupations and Skills are universal (shared across factories)
- All relationships are many-to-many via junction tables

### User Experience
- Read-only public interface, admin tools isolated under /data/*
- Global search accessible via ⌘K from anywhere
- Every entity view links to related entities
- Progressive disclosure: summary → detail → full page

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/archangel

# MapTiler (free tier)
VITE_MAPTILER_API_KEY=your_key_here

# Server
PORT=3000
NODE_ENV=development
```

---

## File Structure

```
archangel/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── drizzle.config.ts
├── tailwind.config.js
├── capacitor.config.ts           # Capacitor mobile configuration
├── vercel.json                   # Web deployment configuration
├── CLAUDE.md                     # Context for Claude Code
│
├── client/
│   ├── index.html                # Includes PWA meta tags
│   ├── src/
│   │   ├── main.tsx              # Service worker registration
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ui/               # shadcn components
│   │   │   ├── layout/           # TopNav, BottomNav, Layout
│   │   │   ├── map/              # MapCanvas, Sidebar panels
│   │   │   ├── explorer/         # NodeList, NodeDetail
│   │   │   ├── import/           # FileDropzone, ColumnMapper
│   │   │   └── search/           # SearchModal
│   │   ├── pages/
│   │   │   ├── MapView.tsx
│   │   │   ├── NodeExplorer.tsx
│   │   │   ├── DataImport.tsx
│   │   │   └── entity/           # Detail pages
│   │   ├── hooks/
│   │   │   └── useGeolocation.ts # Cross-platform geolocation
│   │   ├── stores/               # Zustand stores
│   │   ├── lib/
│   │   │   ├── api.ts            # API client
│   │   │   ├── platform.ts       # Platform detection (web/iOS/Android)
│   │   │   ├── haptics.ts        # Native haptic feedback
│   │   │   └── utils.ts
│   │   └── styles/
│   │       └── globals.css       # Includes safe area CSS variables
│
├── server/
│   ├── index.ts                  # Express entry
│   ├── routes/
│   │   ├── companies.ts
│   │   ├── factories.ts
│   │   ├── occupations.ts
│   │   ├── skills.ts
│   │   ├── search.ts
│   │   ├── map.ts
│   │   └── import.ts
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema
│   │   └── index.ts              # DB connection
│   ├── lib/
│   │   ├── parsers.ts            # CSV/Excel/JSON parsing
│   │   ├── columnMapper.ts       # Auto-detection logic
│   │   └── validation.ts
│   └── scripts/
│       └── seed.ts               # Test data seeder
│
├── shared/
│   ├── types.ts                  # Shared TypeScript types
│   ├── states.ts                 # US state reference
│   ├── colors.ts                 # Entity color constants
│   └── validation.ts             # Shared validation rules
│
├── migrations/                   # Drizzle migrations
│
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── icons/                    # App icons (192px, 512px, maskable)
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   └── icon-512-maskable.png
│   └── data/
│       └── us-states.geojson     # State boundaries
│
├── ios/                          # Capacitor iOS project (generated)
│   ├── App/
│   │   ├── Info.plist            # iOS permissions and config
│   │   └── Assets.xcassets/      # iOS app icons
│   └── App.xcworkspace
│
├── android/                      # Capacitor Android project (generated)
│   ├── app/
│   │   ├── build.gradle          # Android build config
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml
│   │   │   └── res/              # Android app icons by density
│   └── build.gradle
│
└── specs/                        # These specification docs
    ├── 00_INDEX.md
    ├── 01_DATA_IMPORT.md
    ├── 02_MAP_VIEW.md
    ├── 03_NODE_EXPLORER.md
    ├── 04_GLOBAL_SEARCH.md
    ├── 05_DATABASE_SCHEMA.md
    └── 06_APP_DEPLOYMENT.md
```

---

## Claude Code Usage

When working with Claude Code, provide context by referencing specific spec documents:

**Example prompts:**

"Read `specs/01_DATA_IMPORT.md` and implement the FileDropzone component as specified."

"Following `specs/02_MAP_VIEW.md`, create the MapCanvas component with the zoom-based layer visibility logic."

"Using the schema from `specs/05_DATABASE_SCHEMA.md`, create the Drizzle migration and seed script."

"Following `specs/06_APP_DEPLOYMENT.md`, configure Capacitor and set up the iOS and Android projects."

Each spec document is designed to be self-contained with enough detail for implementation without additional context.

---

## Quality Checklist

Before considering a feature complete:

- [ ] TypeScript: No `any` types, strict mode passes
- [ ] API: Consistent error responses, proper HTTP status codes
- [ ] UI: Loading states, error states, empty states
- [ ] Mobile: Tested at 375px width
- [ ] Mobile: Touch targets minimum 44×44 points
- [ ] Mobile: Safe area insets respected (notches, home indicators)
- [ ] Accessibility: Keyboard navigation, ARIA attributes
- [ ] Performance: Lists virtualized if >50 items, images lazy loaded
- [ ] URLs: State reflected in URL, shareable links work

Before mobile deployment:

- [ ] PWA: Manifest valid, service worker registered
- [ ] iOS: App icons in all required sizes, Info.plist configured
- [ ] Android: App icons for all densities, AndroidManifest.xml configured
- [ ] Capacitor: `npx cap sync` runs without errors
- [ ] Native: Geolocation and haptics working on device
