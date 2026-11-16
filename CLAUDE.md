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

## Theme and colour

Two themes, dark (default) and light, switched from the profile menu and kept per browser (`client/src/lib/theme.ts` sets `data-theme` on `<html>`; `client/index.html` applies it before first paint). Every colour comes from the tokens in `client/src/styles/globals.css`, exposed as Tailwind classes in `tailwind.config.ts`:

| Use | Classes |
|-----|---------|
| Surfaces | `bg-bg-base`, `bg-bg-surface`, `bg-bg-elevated` |
| Text | `text-fg-default`, `text-fg-muted`, `text-fg-soft` |
| Lines | `border-border-subtle`, `border-border-strong` |
| Meaning | `success`, `danger`, `warning`, `info` (`text-success`, `bg-danger/10`) |
| Wash | `tint`: white on dark, black on light (`bg-tint/5`, `border-tint/10`) |

Never name a palette colour in a component (`text-emerald-400`, `bg-white/10`): it is right in one theme and wrong in the other. `npm run lint` fails on it (`scripts/check-theme-colors.mjs`). The app is monochrome: kinds of thing (company, factory, career, skill) are told apart by icon shape and by logo, not by hue. The map has a palette per theme in `layers.ts` and is recreated when the theme changes.

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
- **Admin**: `users.is_admin`. The first is claimed by a signed-in person who presents `ADMIN_SECRET` (`POST /api/auth/claim-admin`; an endpoint only, there is no UI for it). After that, admins make admins from Admin Tools. Nobody removes their own admin role, and the last admin cannot be removed. The `x-admin-secret` header still works for data writes, but not for `/api/admin/*`, which takes a signed-in admin only.

**Invites** (`invites` table, `server/lib/invites.ts`): an admin creates a one-time link for an email address (`/sign-in?invite=<token>`), as a user, an employer of one company, or an admin. The link is shown once (only the token's hash is stored), lasts 14 days, and there is one pending invite per address. There is no email service: the admin passes the link on. Signing up through it creates the account, applies the role and marks the invite accepted in one transaction. An address that already has an account is not invited; its roles are changed under People.

**Passwords** (`password_resets` table, `server/lib/passwordResets.ts`): a signed-in person changes their own on `/me` (`POST /api/auth/password { current, next }`), which ends their other sessions. Someone who cannot sign in gets a one-time link from an admin (People → Manage → Password reset link; `POST /api/admin/users/:id/reset-link`). It opens `/sign-in?reset=<token>`, is shown once (only the token's hash is stored), lasts 24 hours and replaces any unused link for that person. Using it sets the password, ends all of that person's sessions and signs them in. There is no email service and no "forgot password" flow: the admin passes the link on.

**Admin Tools** (`/admin`, `client/src/pages/Admin.tsx`, tabs in `client/src/components/admin/`) is reached from "Admin Tools" in the account menu, shown to admins only. Tabs (`?tab=`): `people` (search, roles, company access, delete), `access` (requests to join a company), `invites`, `data` (counts, import tools, career paths awaiting review, a company's domain and featured flag). To anyone who is not an admin the page is the not-found page.

Sessions are an HttpOnly cookie; only the token's hash is stored. Signed-in responses are `no-store`.

## Routes

**Public:** `/map` (opens on the US; `?area=austin`, `?state=TX`), `/explore`, `/jobs`, `/jobs/:id`, `/companies/:id` (id or slug: `/companies/tesla`), `/factories/:id`, `/occupations/:id` (career page with path), `/skills/:id`, `/refs/:id`, `/schools/:id`, `/programs/:id`, `/sign-in`

`/explore` opens on an overview (`components/explorer/ExploreOverview.tsx`: featured employers, careers with a path, the most connected skills, places); the lists of everything are behind it at `?tab=companies|factories|occupations|skills|refs|schools|programs`, filtered and sorted from the address (`state`, `industry`, `category`, `sort`).

**Signed in:** `/me` (seeker), `/employer` (company members), `/admin` (Admin Tools, admins; `?tab=people|access|invites|data`), `/import`, `/import/bulk` (admins; linked from Admin Tools, not the nav)

## API Endpoints

- Public reads: `/api/companies`, `/api/factories` (+ `/pins`, the map's packed pins: `shared/pins.ts`), `/api/occupations`, `/api/skills`, `/api/search`, `/api/map/*`, `/api/stats/counts`, `/api/explore/overview` (everything the Explore overview shows, in one response), `/api/explore/facets` (the industries and skill categories the browse lists filter by), `/api/jobs`, `/api/jobs/:id`
- `/api/auth/*` sign-up (takes an optional `invite` token), sign-in, sign-out, me, claim-admin, `invite/:token` (what an invite grants; 404 when unknown, used or expired), `password` (change your own), `reset/:token` (whose password a reset link sets; 404 when unknown, used or expired), `reset` POST `{ token, password }`
- `/api/me/*` profile, skills, goals, applications
- `/api/jobs` POST/PATCH (company members), `/:id/apply`, `/:id/applications` (ranked), `/applications/:id`
- `/api/employer/*` memberships and the employer dashboard
- `/api/admin/*` (signed-in admin only: 401 signed out, 403 otherwise): `overview`; `users` (`?q=`, paged), `users/:id` PATCH `{ isAdmin }` and DELETE; `users/:id/reset-link` POST; `memberships` GET, POST (add a person to a company), PATCH (approve or remove); `invites` GET, POST, `invites/:id` DELETE; `paths?status=draft`; `companies?q=`, `companies/:id` PATCH `{ domain, featured }`
- `/api/import/*`, `/api/review/*` (admin)
- `PUT /api/occupations/:id/path` sets a career's skills and stages in bulk (admin)

## Migrations

`scripts/migrate.mjs` applies the SQL files it lists (0010 onward) once each, before every build (`npm run build`), and skips when `DATABASE_URL` is unset. New tables go in a new idempotent SQL file in `migrations/`, added to the list in that script, and mirrored in `server/db/schema.ts`. Migrations 0000-0009 predate the runner. `0015_invites.sql` adds the `invites` table. `0020_password_resets.sql` adds the `password_resets` table.

## Map

- All camera movement goes through `client/src/components/map/camera.ts`. Never call `flyTo`/`fitBounds` elsewhere, and never pass `padding` to `flyTo` (MapLibre saves it and `fitBounds` adds it again).
- Sources, layers and paint values live in `client/src/components/map/layers.ts`. Far out, factories are faint points under a density glow (no clusters, no numbers); from about zoom 5.5 they become pickable pins. Pins sit beneath the basemap's place names.
- Everything floating over the map uses the one `.map-overlay` surface in `globals.css`. Do not hand-roll translucent glass; its legibility depends on what is behind it.
- Hover cards render from the pin's own properties. No request on hover.
- With no `VITE_MAP_TOKEN`, or if the basemap fails, the map draws on a plain canvas in the page colour.
- The attribution control stays (the basemap's and OpenStreetMap's terms require it), collapsed to its "i" button.

## Look and feel

The rule of thumb: it should look like software Tesla would ship on a vehicle screen, not like a consumer phone app.

- Monochrome and quiet, in both themes. One accent (the geofence's blue). No entity colours anywhere.
- No stars, badges, emoji, counters or "click here" hints. Emphasis comes from order, size and brightness.
- Nothing on the map that the person did not ask for: no numbered bubbles, no labels on pins. Counts and detail live in the panel they open.
- Density reads naturally (a glow far out, distinct points close in), not as a chart.
- Motion is short and purposeful. Nothing flashes a loading state for content the client already has.

## Code Style

- TypeScript strict mode, no `any`
- Functional components with hooks
- Tailwind for styling (see design system)
- Colours come from theme tokens only (see "Theme and colour")
- New pages compose `PageContainer` / `PageHeader` / `PageSection` / `EmptyState` from `components/layout/Page.tsx`; primitives come from `components/ui/` (shadcn)
- Grids must set a mobile base (`grid-cols-1`) before breakpoint columns, and truncated children need `min-w-0`
- Env: MapTiler key is `VITE_MAP_TOKEN`. Data writes need a signed-in admin (or the `x-admin-secret` header when `ADMIN_SECRET` is set). `ALLOW_OPEN_WRITES=1` opens them on a non-production machine with no secret set; nothing else does
- No service worker. The manifest is a static file (`client/public/manifest.webmanifest`); cache lifetimes are in `vercel.json`. The font (Oxanium) is bundled, not fetched from a third party
- List routes read `limit`/`offset` through `server/lib/paging.ts`; record writes validate through `server/lib/writes.ts`
- A new dependency is proven with a clean install (`npm ci` in a fresh copy, then `npm run build`), not with the packages already on disk: Vercel installs from the lockfile only
- Server/api relative imports MUST end in `.js` (`from './routes/map.js'`, `from '../db/index.js'`): the function runs as Node ESM on Vercel. `npm run lint` enforces it

## Common Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run db:migrate   # Run migrations
npm run db:seed -- --yes-wipe   # Sample data. EMPTIES the tables first; refuses any database not on localhost
npm run test:ui      # Playwright responsive suite (7 device profiles)
npm run lint         # ESLint (no `any`)
```
