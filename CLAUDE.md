# ARCHANGEL

US Manufacturing Workforce Intelligence Platform at o-10.com

## Quick Context

Archangel visualizes the US manufacturing ecosystem. Users explore **Companies → Factories → Occupations → Skills** through an interactive map and node explorer. Data comes from federal sources (LEHD, BLS, O*NET) imported via a flexible pipeline.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **State**: Zustand (UI), TanStack Query (server)
- **Backend**: Express.js, TypeScript, Drizzle ORM
- **Database**: PostgreSQL + PostGIS (Neon)
- **Maps**: MapLibre GL JS + MapTiler (free tier)
- **Mobile**: Capacitor (iOS/Android wrapper)

## Entity Colors

| Entity | Hex | Tailwind |
|--------|-----|----------|
| Company | #F59E0B | amber-500 |
| Factory | #60A5FA | blue-400 |
| Occupation | #1E40AF | blue-800 |
| Skill | #10B981 | emerald-500 |
| State | #6366F1 | indigo-500 |

## Project Structure

```
archangel/
├── client/src/           # React app
│   ├── components/       # ui/ (shadcn), layout/ (Layout, Page shell), map/, explorer/, import/, search/
│   ├── pages/            # MapView, NodeExplorer, DataImport, entity/*
│   ├── stores/           # Zustand stores
│   └── lib/              # api.ts, platform.ts, utils.ts
├── server/               # Express API (app.ts is THE app; index.ts listens locally, api/index.ts serves it on Vercel)
│   ├── routes/           # companies, factories, occupations, skills, refs, schools, programs, persons, search, map, stats, import
│   ├── middleware/       # adminAuth (x-admin-secret), validateUuid, cache
│   └── db/               # schema.ts, index.ts
├── shared/               # states.ts, tokens.ts, displayName.ts, companyNormalization.ts, addressStubFilter.ts
├── specs/                # Detailed specifications (READ THESE)
└── public/data/          # us-states.geojson
```

## Before Implementing Any Feature

1. **Read the relevant spec** in `specs/` directory
2. **Check `specs/07_DESIGN_SYSTEM.md`** for visual patterns
3. **Use existing tokens** from `globals.css` and `tokens.ts`

## Key Specs

| Task | Read First |
|------|------------|
| Database/types | `specs/05_DATABASE_SCHEMA.md` |
| Import pipeline | `specs/01_DATA_IMPORT.md` |
| Map visualization | `specs/02_MAP_VIEW.md` |
| Entity browsing | `specs/03_NODE_EXPLORER.md` |
| Search modal | `specs/04_GLOBAL_SEARCH.md` |
| Deployment | `specs/06_APP_DEPLOYMENT.md` |
| UI components | `specs/07_DESIGN_SYSTEM.md` |

## Routes

**Public (read-only):**
- `/` → redirect to `/map`
- `/map` → Map View
- `/explore` → Node Explorer
- `/tree` → Tree View (placeholder)
- `/companies/:id`, `/factories/:id`, `/occupations/:id`, `/skills/:id`, `/refs/:id`, `/schools/:id`, `/programs/:id`

**Admin (gated by `ADMIN_SECRET` via `AdminKeyGate`):**
- `/import` → Data Import
- `/import/bulk` → Bulk Import

## API Endpoints

- `GET /api/companies` — list, `GET /api/companies/:id` — detail
- `GET /api/factories` — list, `GET /api/factories/geojson` — map data
- `GET /api/occupations`, `GET /api/skills` — lists
- `GET /api/search?q=` — global search
- `GET /api/map/state-counts` — choropleth data; `GET /api/map/states/:code/overview` — state panel
- `GET /api/import/status` — whether an admin key is required/valid; all other `/api/import/*` and every POST/PUT/DELETE need `x-admin-secret`
- `POST /api/import/parse`, `/validate`, `/execute` — import pipeline

## Code Style

- TypeScript strict mode, no `any`
- Functional components with hooks
- Tailwind for styling (see design system)
- Use semantic color tokens: `bg-bg-surface`, `text-fg-muted`
- New pages compose `PageContainer` / `PageHeader` / `PageSection` / `EmptyState` from `components/layout/Page.tsx`; primitives come from `components/ui/` (shadcn)
- Grids must set a mobile base (`grid-cols-1`) before breakpoint columns, and truncated children need `min-w-0`
- Env: MapTiler key is `VITE_MAP_TOKEN`; writes need `ADMIN_SECRET`
- Server/api relative imports MUST end in `.js` (`from './routes/map.js'`, `from '../db/index.js'`): the function runs as Node ESM on Vercel. `npm run lint` enforces it
- Entity badges use: `bg-{color}-500/10 text-{color}-500`

## Common Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run db:migrate   # Run migrations
npm run db:seed      # Seed test data
npm run test:ui      # Playwright responsive suite (7 device profiles)
npm run lint         # ESLint (no `any`)
```
