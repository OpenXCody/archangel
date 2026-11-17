# ARCHANGEL

US Manufacturing Workforce Intelligence Platform at o-10.com

## Quick Context

Archangel is a workforce map of US manufacturing, filled out in depth one focus area at a time, starting with Austin, TX. People explore **Companies → Factories → Jobs → Careers → Skills** on a map and through entity pages; seekers track skills and apply to jobs, employers post jobs and read applicants, admins load and correct data.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **State**: Zustand (UI), TanStack Query (server)
- **Backend**: Express.js, TypeScript, Drizzle ORM
- **Database**: PostgreSQL (Neon), with `pg_trgm` for search
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
├── client/
│   ├── index.html        # applies the theme before first paint
│   ├── public/           # manifest, icons, data/us-states.geojson, data/areas/*.geojson
│   └── src/
│       ├── App.tsx       # every route
│       ├── components/   # ui/ (shadcn), layout/ (Layout, Page shell), map/, explorer/, search/, account/, admin/
│       ├── pages/        # MapView, Explore, EntityDetail, Jobs, JobDetail, SignIn, Me, Employer, Admin, NotFound
│       ├── stores/       # mapStore (Zustand)
│       ├── lib/          # api.ts (public reads), account.ts (everything signed in), employerJobs.ts, seeker.ts, records.ts, theme.ts, geocode.ts, jobFormat.ts
│       └── styles/       # globals.css (theme tokens)
├── server/               # Express API (app.ts is THE app; index.ts listens locally, api/index.ts serves it on Vercel)
│   ├── routes/           # companies, factories, occupations, skills, search, map, stats, explore, auth, me, jobs, employer, admin
│   ├── middleware/       # adminAuth (signed-in admin), validateUuid, cache
│   ├── lib/              # auth, invites, passwordResets, scope, paging, writes, openJobs, companyFilters, wipeGuard
│   ├── db/               # schema.ts, index.ts
│   └── scripts/          # import-pillar-bulk.ts (factories from Pillar), seed.ts (local sample data)
├── shared/               # states.ts, scope.ts, pins.ts, displayName.ts, companyNormalization.ts, addressStubFilter.ts
├── data/                 # curated lists (career paths, company profiles, careers by industry) behind the generated migrations
├── migrations/           # SQL; 0010 onward run through scripts/migrate.mjs
├── scripts/              # migrate.mjs, make-admin.mjs, build-*-sql.mjs, enrich-naics.mjs, check-*.mjs (lint)
└── tests/                # responsive.spec.ts (Playwright), api/*.sh (local API suites)
```

There are no spec documents: the code and this file say how things are. `README.md` covers running it locally, the checks, how data gets in and how it deploys.

## Coverage and focus areas

Two separate ideas (`shared/scope.ts`):
- **Coverage** is which rows the public API returns: the whole country (`SCOPE.stateCode` is `null`, so the helpers in `server/lib/scope.ts` are no-ops). Every public GET still builds its conditions from those helpers, so narrowing later is one setting.
- **Focus areas** (`FOCUS_AREAS`) are regions being filled out in depth. The first is Austin, TX, bounded by its five metro counties (`client/public/data/areas/austin.geojson`). The map draws each as a geofence; `/api/map/areas/:id/overview` gives it the same panel data a state has.

The map opens on the continental US. A focus area is somewhere to go, not a limit on what exists.

Pins carry a tier: 2 featured employer (`companies.featured`), 1 established company (five or more factories nationwide), 0 other. `companies.domain` is used for logos. Curated lists live in `data/` and load through generated migrations (`scripts/build-*-sql.mjs`).

## Employers: jobs and applicants

`/employer` is the list of a person's companies and jobs; the job form takes the page over from the address: `?post=1` (new), `?copy=<job id>` (another like an existing job), `?edit=<job id>` (change one; `&from=job` returns to the job's page). One form does all three: `components/account/JobForm.tsx`. A job's company, factory and career are fixed once posted. Employer-side hooks and the form's checks live in `client/src/lib/employerJobs.ts`.

On a job's page a person who manages it sees the company's view first (state, Edit, Post another like this, Close or Delete, then applicants) and the listing below it, with skills unmarked. Applicants are a compact list (`components/account/ApplicantList.tsx`), filtered by stage; a row opens to the applicant's skills against the job's (held, learning, missing), their note and contact, the private note and the stage. Hired and Declined take a confirmation and can be moved back to a working stage; Withdrawn is the applicant's and the company cannot change it. A job with no applications can be deleted; one with applications can only be closed.

A person finds their company on `/employer` by name (`GET /api/employer/companies`, `server/lib/companySearch.ts`): tolerant of spelling, spacing, "&" and the legal form, name matches only, the closest names when nothing matches. A company or a plant that is not in the data is asked for there (`company_requests`, `server/routes/companyRequests.ts`); an admin answers it on the Access tab ("Companies and plants to add"), and answering a company request gives the person access. After sign-in a person with a waiting request lands on `/employer`.

The job form keeps what is typed in the browser (`client/src/lib/jobDraft.ts`, one draft per person and form) until it is posted, saved or started over. The plant is chosen with `PlantPicker.tsx`. One person posts at most 30 jobs an hour. Applicants can be searched by name (above eight) and exported as CSV from the browser (`applicantsCsv` in `employerJobs.ts`).

Career search (`server/lib/careerSearch.ts`, behind `GET /api/occupations`) reads titles and `occupation_aliases`, with word order, plurals and level words set aside, and falls back to the closest titles. Everyday names are curated in `data/careers/aliases.json` and loaded by `scripts/build-career-aliases-sql.mjs` (migration `0027_career_aliases.sql`).

## Seekers: skills and reach

A skill is marked where it is listed: on a career's path each row starts with a mark (`SkillHeldToggle` in `components/account/SkillStatusButton.tsx`) that sets the skill held or clears it in one tap; learning is set on the skill's page or on `/me`. The change is optimistic (`useMarkSkill` in `client/src/lib/seeker.ts`), so "You have N of M" follows at once.

Careers within reach (`GET /api/me/careers/reach`, shown on `/me` under Careers): careers with a staged path of at least five skills of which the person holds at least one, ranked by the share held, each with the next skills to pick up. Held skills count fully; a skill being learned counts as half for the order only, never in the figure. Careers already chosen as goals are left out; goals carry their own `next` skills (`GET /api/me/goals`).

A new account with nowhere to return to lands on `/me`. With no goal, skill or application the page is one question, "Start with a career" (search, or one tap on a career that has a path); choosing one fills the page. Suggested skills (`GET /api/me/skills/suggested`, under Skills on `/me`) are the skills of the person's goals, then of careers within reach, none already on their list; one tap on the mark adds one, another takes it off, and the list holds still while it is marked (`useSuggestedSkills` in `lib/seeker.ts` is not under the skills key). Removing a goal or skill leaves "Removed X. Undo" in its place until the page is left.

`/jobs` narrows by place: `?state=`, or `?near=<lat>,<lng>&place=<name>&within=<miles>` (50 by default), chosen in the Where field (`components/account/JobPlaceFilter.tsx`: a ZIP code or town through `lib/geocode.ts`, or a state; a state select only when there is no map key). The browser is never asked for the person's location. `?q=` matches every typed word in the title, company, career, shift, city or state (`server/lib/jobSearch.ts`).

## Careers and plants

Two different links, kept apart:
- `factory_occupations`: careers recorded for one plant (headcount, pay). Empty in production today.
- `industry_occupations`: careers typical of an industry (the 21 NAICS manufacturing subsectors in `factories.primary_naics_description`), curated in `data/careers/industries.json` and loaded by `scripts/build-industry-careers-sql.mjs` (migration `0021`). It says what kind of work an industry has, never that a given plant employs it, and the wording on screen keeps that distinction ("Careers in this industry", "Where this work is done").

From it: a career lists its industries with plant counts and leading states (`GET /api/occupations/:id` → `industries`, `everywhere`, `elsewhereToo`, `topStates`); a plant with no recorded careers lists its industry's (`GET /api/factories/:id` → `typicalCareers`); a state or focus area lists the careers its industry mix points to (`careers` on the map overviews, weighted toward each industry's leading careers). Careers marked `common` (found in every industry) are left out of area lists.

## Words

On screen an occupation is a **Career**, and a job is one opening for a career at one factory. On the map a factory is a **plant** and headcount is **people**. A career someone aims for is a **goal** ("Set as goal", "Goal", "Goals"). A plain account has no role label. Code, routes and tables still say `occupation`. A career's skills carry a stage: 1 Introduction, 2 Fundamentals, 3 Advanced.

## Users

Roles are relationships, not account types (`server/lib/auth.ts`):
- **Seeker**: any signed-in person. Owns their skills (learning/held), career goals and applications.
- **Employer**: a person with an active membership in a company (`company_members`). A join request is approved by an admin.
- **Admin**: `users.is_admin`, and nothing else: there is no admin key, header or setting that opens a write. The first admin signs up in the app and is then made one on the command line (`node scripts/make-admin.mjs <email>`, which reads `DATABASE_URL`). After that, admins make admins from Admin Tools. Nobody removes their own admin role, and the last admin cannot be removed. Every route that changes a company, factory, career or skill, and all of `/api/admin/*`, takes a signed-in admin: 401 signed out, 403 otherwise.

**Invites** (`invites` table, `server/lib/invites.ts`): an admin creates a one-time link for an email address (`/sign-in?invite=<token>`), as a user, an employer of one company, or an admin. The link is shown once (only the token's hash is stored), lasts 14 days, and there is one pending invite per address. When mail is on the link is also emailed to the address; when it is off the admin passes it on. Signing up through it creates the account, applies the role and marks the invite accepted in one transaction. An address that already has an account is not invited; its roles are changed under People.

**Passwords** (`password_resets` table, `server/lib/passwordResets.ts`): a signed-in person changes their own on `/me` (`POST /api/auth/password { current, next }`), which ends their other sessions. Someone who cannot sign in gets a one-time link from an admin (People → Manage → Password reset link; `POST /api/admin/users/:id/reset-link`). It opens `/sign-in?reset=<token>`, is shown once (only the token's hash is stored), lasts 24 hours and replaces any unused link for that person. Using it sets the password, ends all of that person's sessions and signs them in. When mail is on the link is also emailed to the person, and "Forgot password?" on the sign-in page sends one without an admin (`POST /api/auth/forgot { email }`: the same answer whether or not the address has an account, given before any account is looked up). When mail is off the admin passes the link on and the sign-in page says so.

**Admin Tools** (`/admin`, `client/src/pages/Admin.tsx`, tabs in `client/src/components/admin/`) is reached from "Admin Tools" in the account menu, shown to admins only. Tabs (`?tab=people|access|invites|data|history`):
- `people`: search by name, email or company (`?q=`), by role (`?role=admin|employer|waiting|user`), the open person (`?open=`); roles, company access, name and email corrections, "Sign out everywhere", delete.
- `access`: requests to join a company (approve and decline carry Undo), and requests to add a company or plant.
- `invites`: pending, and earlier (accepted, expired). Admin invites last 3 days, others 14.
- `data`: counts, Add a record, find a record to correct, career paths (drafts and approved). With `&kind=company|factory|career|skill&id=<uuid>` the tab is that record's editor (`components/admin/RecordEditor.tsx`): its fields, a career's path (`#path`), Merge, History, Delete. An admin sees **Edit** on a record's own page; it opens the same editor. One form adds and corrects (`components/admin/RecordForm.tsx`).
- `history`: what admins changed (`?show=<kind>`).

To anyone who is not an admin the page is the not-found page. An action says what it did through `useAdminNotice().say(message, { undo, focus })` (`components/admin/AdminNotice.tsx`); `focus` is where the keyboard goes when the action removed the row that had it.

**Records**: a company, factory, career or skill is changed through `server/lib/records.ts`, whichever route it arrives by (the kind's `PUT` / `DELETE`, or `PATCH /api/admin/companies/:id`). Each field is checked, a refusal carries `field`, and the audit line is written in the same transaction. A merge (`POST /api/admin/records/:kind/:id/merge { into }`; company, career, skill) moves everything to the kept record and keeps the merged name as an alias (`companies.aliases`, `occupation_aliases`, `skill_aliases`). Adding or renaming warns of near-duplicates (`GET /api/admin/records/:kind/similar?name=`).

**Audit**: `audit_log` (migration `0025_admin_upkeep.sql`, `server/lib/audit.ts`). Every admin write calls `recordAudit` with who, kind (`company | factory | career | skill | person | access | invite`), the record, the action and a short before and after; read with `GET /api/admin/audit?kind=&record=&limit=&offset=`. A new admin write must add its line.

**The first admin** is the one with the earliest `users.admin_since`; another admin cannot remove that role or delete the account (handing it on takes SQL). The most common passwords are refused.

**Add a record** (`components/admin/AddRecord.tsx`, `lib/records.ts`) adds one company, factory, career or skill through the validated POST endpoints. It names what was added with a link to its page; a duplicate (409) links to the record that is already there. There is no spreadsheet import: data in bulk comes from scripts and generated migrations (see `README.md`).

Sessions are an HttpOnly cookie; only the token's hash is stored. Signed-in responses are `no-store`.

## Email and notices

**Sending** (`server/lib/email.ts`): `sendEmail` / `sendEmails` call Resend's HTTP API with `fetch` (no SDK). Mail is on only when `RESEND_API_KEY` and `EMAIL_FROM` are both set; off, every caller carries on as before and the interface keeps its "passed on by hand" wording. Every link in an email is built from `APP_URL` (default `https://www.o-10.com`), never from a request. Outside production `EMAIL_OUTBOX=<file>` captures emails as JSON lines instead of sending them and counts as on. `GET /api/auth/options` → `{ email }` tells the client (`useEmailOn`). Sending never throws into a caller, waits at most four seconds, and logs only the kind of email and the cause.

**What is sent** (`server/lib/notices.ts`, wording in `server/lib/emailTemplates.ts`: text first, an HTML twin in one plain column):
- Sign-in emails, always when mail is on: an invite; a password reset (asked for on the sign-in page, or made by an admin).
- Notices, unless the person turned them off (`users.email_notices`, the switch on `/me`): a company access request (to the admins), its approval or decline (to the requester), a new application (to the company's active members, at most one per job per member per hour; the next says how many more applied), an application's stage changed by the company (to the applicant). A withdrawal emails nobody.
- A notice is sent after the write it reports, and a failure to send never fails the action. Limits are kept in `notice_log`.

**Without email:**
- A declined access request is kept: `company_members.status = 'declined'` with `decided_at` / `decided_by`. The employer page says so, the same company cannot be asked again for 7 days (409), and Admin Tools lists the last 30 days of declines with "Approve after all". `PATCH /api/admin/memberships` takes `decision: 'approve' | 'decline' | 'remove'`; `remove` deletes the row, whatever its state.
- An application's history is in `application_events` (written on apply, on every stage change, on withdrawal). `/api/me/applications` returns each application's `events` and `changed`; `/me` shows the stages with dates and, at Interview and Offer, that the company will contact the person at their account email.
- The account button shows one accent dot, never a count, when `GET /api/me/news` → `{ applications, applicants, access }` has something true. It is cleared by opening the page that shows it (`POST /api/me/seen`; `users.applications_seen_at`, `applicants_seen_at`, `access_seen_at`): `/me`, the employer page or a job the person manages, the Access tab. In the menu the page with the news stays bright and the rest step back.
- Admin Tools opens with a "Waiting" line (access requests, draft paths) only when something waits. An access request shows the person's address beside the company's domain and how many people already have access.

Migration `0024_email_notices.sql` adds all of the above. `tests/api/email.sh` checks it against a server started with `EMAIL_OUTBOX` (give the script the same file as `OUTBOX`, and the same `APP_URL`).

## Routes

**Public:** `/map` (opens on the US; `?area=austin`, `?state=TX`), `/explore`, `/jobs`, `/jobs/:id`, `/companies/:id` (id or slug: `/companies/tesla`), `/factories/:id`, `/occupations/:id` (career page with path), `/skills/:id`, `/sign-in`

`/explore` opens on an overview (`components/explorer/ExploreOverview.tsx`: featured employers, careers with a path, the most connected skills, places); the lists of everything are behind it at `?tab=companies|factories|occupations|skills`, filtered and sorted from the address (`state`, `industry`, `category`, `sort`).

**Signed in:** `/me` (seeker), `/employer` (company members), `/admin` (Admin Tools, admins; `?tab=people|access|invites|data`)

Old addresses: `/import` and `/import/bulk` redirect to `/admin?tab=data`; `/tree` redirects to the map. Anything else unknown (including the removed `/refs/:id`, `/schools/:id`, `/programs/:id`) is the not-found page.

## API Endpoints

- Public reads: `/api/companies`, `/api/factories` (+ `/pins`, the map's packed pins: `shared/pins.ts`), `/api/occupations`, `/api/skills`, `/api/search` (companies, factories, careers, skills, and states from `shared/states.ts`), `/api/map/*`, `/api/stats/counts` (companies, factories, occupations, skills, total), `/api/explore/overview` (everything the Explore overview shows, in one response), `/api/explore/facets` (the industries and skill categories the browse lists filter by), `/api/jobs`, `/api/jobs/:id`. `/api/jobs` GET takes `q`, `state`, `near`, `within` (with `near` each job carries `miles`, nearest first); `/api/search` also returns `results.jobs` (open jobs); the map overviews (`states/:code/overview`, `areas/:id/overview`, `bounds/overview`) carry `openJobs` and `jobs`, listed in the panel only when there are some
- `/api/auth/*` sign-up (takes an optional `invite` token), sign-in, sign-out, me, `invite/:token` (what an invite grants; 404 when unknown, used or expired), `password` (change your own), `reset/:token` (whose password a reset link sets; 404 when unknown, used or expired), `reset` POST `{ token, password }`; `email` POST `{ email, password }` changes the sign-in address (ends other sessions, tells the old address by mail)
- `/api/me/*` profile, skills, `skills/suggested`, goals (each with `next` skills), applications, `careers/reach`; `DELETE /api/me { password }` deletes your own account with its skills, goals, applications and memberships (posted jobs stay; not the last admin)
- `/api/jobs` POST; `/:id` PATCH (fields, `skills` as the whole list, close, reopen; company members and admins) and DELETE (only a job with no applications, else 409); `/:id/apply`; `/:id/applications` (ranked; the job's `skills` once, and per applicant `heldSkillIds` and `learningSkillIds`); `/applications/:id` (stage and private note). An application link is stored as https; one typed without a scheme gets it
- `/api/employer/*` memberships and the employer dashboard; `companies?q=` (find a company by name); `company-requests` GET, POST, DELETE `/:id` (ask for a missing company or plant). `/api/auth/me` carries `hasCompanyRequest`; factories on `GET /api/employer` carry `address`
- `/api/admin/*` (signed-in admin only: 401 signed out, 403 otherwise): `overview`; `users` (`?q=`, paged), `users/:id` PATCH `{ isAdmin }` and DELETE; `users/:id/reset-link` POST; `memberships` GET, POST (add a person to a company), PATCH (approve or remove); `invites` GET, POST, `invites/:id` DELETE; `paths?status=draft`; `companies?q=`, `companies/:id` PATCH `{ domain, featured }`; `company-requests` GET, PATCH `/:id` `{ decision: 'add', companyId? } | { decision: 'decline' }`; `users/:id` PATCH also takes `name` and `email`; `users/:id/sign-out` POST; `memberships` PATCH takes `decision: 'reopen'`; `invites/past`; `records/:kind?q=`, `records/:kind/similar?name=`, `records/:kind/:id` (the editor's view, with `attached` counts and a career's `path`), `records/:kind/:id/merge` POST; `audit`. `GET /api/auth/invite/:token` answers 404 with `reason: used | expired | unknown`
- Record writes (signed-in admin): `POST`, `PUT /:id`, `DELETE /:id` on `/api/companies`, `/api/factories`, `/api/occupations`, `/api/skills`, checked through `server/lib/writes.ts`. A `POST` that would repeat a record answers 409 with `existing: { id, name }` (a company by name in any letter case; a factory by company, name and state; a career by title; a skill by name). A factory needs `companyId`, `name`, `state` (a code from `shared/states.ts`), `latitude` and `longitude` as numbers, and takes `city` and `address`
- `PUT /api/occupations/:id/path` sets a career's skills and stages in bulk (admin)

## Migrations

`scripts/migrate.mjs` applies the SQL files it lists (0010 onward) once each, before every build (`npm run build`), and skips when `DATABASE_URL` is unset. New tables go in a new idempotent SQL file in `migrations/`, added to the list in that script, and mirrored in `server/db/schema.ts`. Migrations 0000-0009 predate the runner: a new database gets them by hand, once (`README.md`). `0015_invites.sql` adds the `invites` table. `0020_password_resets.sql` adds the `password_resets` table. `0021_industry_careers.sql` adds and fills `industry_occupations`. `0026_company_requests.sql` adds `company_requests`; `0027_career_aliases.sql` fills `occupation_aliases`. `0022_data_cleanup.sql` is generated by `scripts/build-cleanup-sql.mjs` from `data/cleanup/2026-11-cleanup.json` (careers, skills and companies deleted, merged and renamed; plants moved or removed; a merged name is kept as an alias): a later cleanup is a new JSON file and a new generated migration, never an edit to an applied one. `0023_remove_legacy.sql` drops what the product no longer has: Elements (`refs`), Schools, Programs and People with their junction and alias tables, the `states`, `industries` and `skill_categories` lookups, `skill_relations`, `entity_links`, the spreadsheet import's tables, and the columns `factories.state_id` and `skills.category_id`. `occupation_aliases` and `skill_aliases` are kept: they hold the names of merged careers and skills, for search and for later merges. A state is its two-letter code (`factories.state`, `shared/states.ts`); a company's industry and a skill's category are text on their own rows.

## Map

- All camera movement goes through `client/src/components/map/camera.ts`. Never call `flyTo`/`fitBounds` elsewhere, and never pass `padding` to `flyTo` (MapLibre saves it and `fitBounds` adds it again).
- Sources, layers and paint values live in `client/src/components/map/layers.ts`. Far out, factories are faint points under a density glow (no clusters, no numbers); from about zoom 5.5 they become pickable pins. Pins sit beneath the basemap's place names.
- Everything floating over the map uses the one `.map-overlay` surface in `globals.css`. Do not hand-roll translucent glass; its legibility depends on what is behind it.
- Hover cards render from the pin's own properties. No request on hover.
- With no `VITE_MAP_TOKEN`, or if the basemap fails, the map draws on a plain canvas in the page colour.
- The attribution control stays (the basemap's and OpenStreetMap's terms require it), collapsed to its "i" button.
- Pins load once (`['factory-pins']`); state, industry, company and career are filter and paint expressions set by `setPinView` in `layers.ts`. Never refetch or `setData` for a filter.
- The map has at most one subject, a company (`?company=`, id or slug) or a career (`?career=`): `filters.company` / `filters.career` in `mapStore`. A company's plants are drawn alone and framed; a career's industries keep their strength and the rest step back. The chip under the search turns it off.
- The map's address: `?factory= ?state= ?area= ?skill= ?place=&in=&box=` (what the panel shows), `?company= ?career=` (subject), `?industry=`; the camera is the fragment `#zoom/lat/lng`, written with replace by `MapView`. Something a link names that does not exist calls `notFound()`: one line beside the search, the country, the address cleaned.
- A click or tap selects after 250 ms unless a second one or a camera move cancels it (a double tap zooms). Touch reach is about 22 px close in and 10 px far out; states are hit at the exact point. Dragging is limited to `REACH` in `camera.ts`; flights made by `camera.ts` are exempt. Rotation and pitch are off.
- Map controls take their size from the pointer (`.map-control`, `.map-search-button`, `.map-row`, `.map-chip`, `.map-field` in `globals.css`): 44 px and 16 px type on `pointer: coarse`.
- The phone sheet rests at bar / peek / full (`sheetDetent`); the home view on a phone frames the country above the resting sheet.
- Map search ranks the product's own records first, then places (towns, counties, ZIP codes; streets only when the query has a digit) from `client/src/lib/geocode.ts`. A town opens a panel for its bounds: `GET /api/map/bounds/overview?west=&south=&east=&north=` (the region overview for any box, plus up to 24 plants).
- A first visit is given one sentence under the search field, once per browser (`archangel.map.seen`).

## Look and feel

The rule of thumb: it should look like software Tesla would ship on a vehicle screen, not like a consumer phone app.

- Monochrome and quiet, in both themes. One accent (the geofence's blue). No entity colours anywhere.
- No stars, badges, emoji, counters or "click here" hints. Emphasis comes from order, size and brightness. Application stages read by brightness, not hue. Section headings on entity pages carry no counts.
- Nothing on the map that the person did not ask for: no numbered bubbles, no labels on pins. Counts and detail live in the panel they open.
- Density reads naturally (a glow far out, distinct points close in), not as a chart.
- Motion is short and purposeful. Nothing flashes a loading state for content the client already has.

## Code Style

- TypeScript strict mode, no `any`
- Functional components with hooks
- Tailwind for styling
- Colours come from theme tokens only (see "Theme and colour")
- New pages compose `PageContainer` / `PageHeader` / `PageSection` / `EmptyState` from `components/layout/Page.tsx`; primitives come from `components/ui/` (shadcn)
- Grids must set a mobile base (`grid-cols-1`) before breakpoint columns, and truncated children need `min-w-0`
- Env: `DATABASE_URL`, and the MapTiler key `VITE_MAP_TOKEN`. Locally both live in `.env.local` (copied from `.env.example`); the server reads `.env.local`, then `.env` (`server/loadEnv.ts`). Data writes need a signed-in admin; no setting opens them
- The page and the API are one origin (Vercel rewrites `/api`; in dev Vite proxies it), so there is no CORS and the client always calls `/api`
- No service worker. The manifest is a static file (`client/public/manifest.webmanifest`); cache lifetimes are in `vercel.json`. The font (Oxanium) is bundled, not fetched from a third party
- List routes read `limit`/`offset` through `server/lib/paging.ts`; record writes validate through `server/lib/writes.ts`
- A new dependency is proven with a clean install (`npm ci` in a fresh copy, then `npm run build`), not with the packages already on disk: Vercel installs from the lockfile only
- A control that is saving is marked `aria-busy` / `aria-disabled` (`busyButtonClass`), never `disabled`: a disabled control drops keyboard focus. A form names each problem beside its field and focuses the first Client requests go through `fetchWithTimeout` (`lib/api.ts`). Mutations run with `networkMode: 'always'`: a change made offline fails there and then. Button groups acting as tabs or radios use `onGroupArrowKeys` (`lib/roving.ts`; `arrowKeyChoice` in `components/account/parts.tsx` is the same thing as a handler) with a roving tabindex. After a deliberate sign-out a gated page sends the person to the map (`justLeft` in `lib/account.ts`)
- An entity page picks its view from the address (`entityType`), never from the shape of the response; the shape checks in `EntityDetail.tsx` only narrow types. Adding a field to a response must not be able to change which page is drawn
- Server/api relative imports MUST end in `.js` (`from './routes/map.js'`, `from '../db/index.js'`): the function runs as Node ESM on Vercel. `npm run lint` enforces it

## Common Commands

```bash
npm run dev          # Page on :5173, API on :3000
npm run build        # Production build (applies migrations first when DATABASE_URL is set)
npm run db:migrate   # Apply migrations 0010 onward (scripts/migrate.mjs; needs DATABASE_URL)
npm run db:seed -- --yes-wipe   # Sample data. EMPTIES the tables first; refuses any database not on localhost
node --env-file=.env.local scripts/make-admin.mjs you@example.com   # Make an account that exists an admin
npm run typecheck    # tsc
npm run lint         # ESLint (no `any`), .js import endings, theme colours
npm run test:ui      # Playwright responsive suite (7 device profiles)
# API suites, local only (they create and remove their own accounts and records):
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/accounts.sh   (also seeker.sh, jobs.sh, admin.sh; email.sh takes OUTBOX and APP_URL too)
```
