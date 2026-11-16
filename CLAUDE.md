# ARCHANGEL

US Manufacturing Workforce Intelligence Platform at o-10.com

## Quick Context

Archangel is a workforce map of Texas manufacturing, starting with the Austin area. People explore **Companies → Factories → Jobs → Careers → Skills** on a map and through entity pages; seekers track skills and apply to jobs, employers post jobs and read applicants, admins load and correct data.

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

## Region scope

The app covers **Texas only**, opening on the 50 miles around Austin. `shared/scope.ts` names the region; `server/lib/scope.ts` turns it into query conditions. Every public GET must build its conditions from those helpers, never from a hard-coded state. Rows for other states stay in the database, hidden. Admin routes and all writes are unscoped. Widening is a change to `shared/scope.ts`.

## Words

On screen an occupation is a **Career**, and a job is one opening for a career at one factory. Code, routes and tables still say `occupation`. A career's skills carry a stage: 1 Introduction, 2 Fundamentals, 3 Advanced.

## Users

Roles are relationships, not account types (`server/lib/auth.ts`):
- **Seeker**: any signed-in person. Owns their skills (learning/held), career goals and applications.
- **Employer**: a person with an active membership in a company (`company_members`). A join request is approved by an admin.
- **Admin**: `users.is_admin`. Claimed once by a signed-in person who presents `ADMIN_SECRET` (`POST /api/auth/claim-admin`). The `x-admin-secret` header still works for writes.

Sessions are an HttpOnly cookie; only the token's hash is stored. Signed-in responses are `no-store`.

## Routes

**Public:** `/map` (opens on Austin), `/explore`, `/jobs`, `/jobs/:id`, `/companies/:id`, `/factories/:id`, `/occupations/:id` (career page with path), `/skills/:id`, `/refs/:id`, `/schools/:id`, `/programs/:id`, `/sign-in`

**Signed in:** `/me` (seeker), `/employer` (company members), `/admin` (admins), `/import`, `/import/bulk` (admins)

## API Endpoints

- Public reads: `/api/companies`, `/api/factories` (+ `/geojson`), `/api/occupations`, `/api/skills`, `/api/search`, `/api/map/*`, `/api/stats/counts`, `/api/jobs`, `/api/jobs/:id`
- `/api/auth/*` sign-up, sign-in, sign-out, me, claim-admin
- `/api/me/*` profile, skills, goals, applications
- `/api/jobs` POST/PATCH (company members), `/:id/apply`, `/:id/applications` (ranked), `/applications/:id`
- `/api/employer/*` memberships and the employer dashboard
- `/api/admin/*` join requests, users, overview; `/api/import/*`, `/api/review/*` (admin)
- `PUT /api/occupations/:id/path` sets a career's skills and stages in bulk (admin)

## Migrations

`scripts/migrate.mjs` applies the SQL files it lists (0010 onward) once each, before every build (`npm run build`), and skips when `DATABASE_URL` is unset. New tables go in a new idempotent SQL file in `migrations/`, added to the list in that script, and mirrored in `server/db/schema.ts`. Migrations 0000-0009 predate the runner.

## Map

All camera movement goes through `client/src/components/map/camera.ts`. Never call `flyTo`/`fitBounds` elsewhere, and never pass `padding` to `flyTo` (MapLibre saves it and `fitBounds` adds it again). With no `VITE_MAP_TOKEN` the map draws on a plain dark style.

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
