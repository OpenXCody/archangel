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
│   ├── components/       # ui/, layout/, map/, explorer/, import/, search/
│   ├── pages/            # MapView, NodeExplorer, DataImport, entity/*
│   ├── stores/           # Zustand stores
│   └── lib/              # api.ts, platform.ts, utils.ts
├── server/               # Express API
│   ├── routes/           # companies, factories, occupations, skills, search, map, import
│   └── db/               # schema.ts, index.ts
├── shared/               # types.ts, colors.ts, states.ts, validation.ts
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
- `/companies/:id`, `/factories/:id`, `/occupations/:id`, `/skills/:id`, `/states/:code`

**Admin (isolated):**
- `/data/import` → Data Import
- `/data/errors` → Error Queue

## API Endpoints

- `GET /api/companies` — list, `GET /api/companies/:id` — detail
- `GET /api/factories` — list, `GET /api/factories/geojson` — map data
- `GET /api/occupations`, `GET /api/skills` — lists
- `GET /api/search?q=` — global search
- `GET /api/map/states/summary` — choropleth data
- `POST /api/import/parse`, `/validate`, `/execute` — import pipeline

## Code Style

- TypeScript strict mode, no `any`
- Functional components with hooks
- Tailwind for styling (see design system)
- Use semantic color tokens: `bg-bg-surface`, `text-fg-muted`
- Entity badges use: `bg-{color}-500/10 text-{color}-500`

## Common Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run db:migrate   # Run migrations
npm run db:seed      # Seed test data
npx cap sync         # Sync to mobile
```
