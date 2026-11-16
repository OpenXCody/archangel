# ARCHANGEL

US Manufacturing Workforce Intelligence Platform at o-10.com

## Quick Context

Archangel is a workforce map of US manufacturing, filled out in depth one focus area at a time, starting with Austin, TX. People explore **Companies → Factories → Jobs → Careers → Skills** on a map and through entity pages; seekers track skills and apply to jobs, employers post jobs and read applicants, admins load and correct data.

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

## Coverage and focus areas

Two separate ideas (`shared/scope.ts`):
- **Coverage** is which rows the public API returns: the whole country (`SCOPE.stateCode` is `null`, so the helpers in `server/lib/scope.ts` are no-ops). Every public GET still builds its conditions from those helpers, so narrowing later is one setting.
- **Focus areas** (`FOCUS_AREAS`) are regions being filled out in depth. The first is Austin, TX, bounded by its five metro counties (`client/public/data/areas/austin.geojson`). The map draws each as a geofence; `/api/map/areas/:id/overview` gives it the same panel data a state has.

The map opens on the continental US. A focus area is somewhere to go, not a limit on what exists.

Pins carry a tier: 2 featured employer (`companies.featured`), 1 established company (five or more factories nationwide), 0 other. `companies.domain` is used for logos. Curated lists live in `data/` and load through generated migrations (`scripts/build-*-sql.mjs`).

## Words

On screen an occupation is a **Career**, and a job is one opening for a career at one factory. Code, routes and tables still say `occupation`. A career's skills carry a stage: 1 Introduction, 2 Fundamentals, 3 Advanced.

## Users

Roles are relationships, not account types (`server/lib/auth.ts`):
- **Seeker**: any signed-in person. Owns their skills (learning/held), career goals and applications.
- **Employer**: a person with an active membership in a company (`company_members`). A join request is approved by an admin.
- **Admin**: `users.is_admin`. Claimed once by a signed-in person who presents `ADMIN_SECRET` (`POST /api/auth/claim-admin`). The `x-admin-secret` header still works for writes.

Sessions are an HttpOnly cookie; only the token's hash is stored. Signed-in responses are `no-store`.

## Routes

**Public:** `/map` (opens on the US; `?area=austin`, `?state=TX`), `/explore`, `/jobs`, `/jobs/:id`, `/companies/:id` (id or slug: `/companies/tesla`), `/factories/:id`, `/occupations/:id` (career page with path), `/skills/:id`, `/refs/:id`, `/schools/:id`, `/programs/:id`, `/sign-in`

**Signed in:** `/me` (seeker), `/employer` (company members), `/admin` (admins), `/import`, `/import/bulk` (admins)

## API Endpoints

- Public reads: `/api/companies`, `/api/factories` (+ `/pins`, the map's packed pins: `shared/pins.ts`), `/api/occupations`, `/api/skills`, `/api/search`, `/api/map/*`, `/api/stats/counts`, `/api/jobs`, `/api/jobs/:id`
- `/api/auth/*` sign-up, sign-in, sign-out, me, claim-admin
- `/api/me/*` profile, skills, goals, applications
- `/api/jobs` POST/PATCH (company members), `/:id/apply`, `/:id/applications` (ranked), `/applications/:id`
- `/api/employer/*` memberships and the employer dashboard
- `/api/admin/*` join requests, users, overview; `/api/import/*`, `/api/review/*` (admin)
- `PUT /api/occupations/:id/path` sets a career's skills and stages in bulk (admin)

## Migrations

`scripts/migrate.mjs` applies the SQL files it lists (0010 onward) once each, before every build (`npm run build`), and skips when `DATABASE_URL` is unset. New tables go in a new idempotent SQL file in `migrations/`, added to the list in that script, and mirrored in `server/db/schema.ts`. Migrations 0000-0009 predate the runner.

## Map

- All camera movement goes through `client/src/components/map/camera.ts`. Never call `flyTo`/`fitBounds` elsewhere, and never pass `padding` to `flyTo` (MapLibre saves it and `fitBounds` adds it again).
- Sources, layers and paint values live in `client/src/components/map/layers.ts`. Far out, factories are faint points under a density glow (no clusters, no numbers); from about zoom 5.5 they become pickable pins. Pins sit beneath the basemap's place names.
- Everything floating over the map uses the one `.map-overlay` surface in `globals.css`. Do not hand-roll translucent glass; its legibility depends on what is behind it.
- Hover cards render from the pin's own properties. No request on hover.
- With no `VITE_MAP_TOKEN`, or if the basemap fails, the map draws on a plain dark style.
- The attribution control stays (the basemap's and OpenStreetMap's terms require it), collapsed to its "i" button.

## Look and feel

The rule of thumb: it should look like software Tesla would ship on a vehicle screen, not like a consumer phone app.

- Monochrome and quiet. One accent (the geofence's ice blue). Entity colours are for small icons on detail pages, not for the map or its overlays.
- No stars, badges, emoji, counters or "click here" hints. Emphasis comes from order, size and brightness.
- Nothing on the map that the person did not ask for: no numbered bubbles, no labels on pins. Counts and detail live in the panel they open.
- Density reads naturally (a glow far out, distinct points close in), not as a chart.
- Motion is short and purposeful. Nothing flashes a loading state for content the client already has.

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
