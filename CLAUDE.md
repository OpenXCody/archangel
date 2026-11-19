# ARCHANGEL

US Manufacturing Workforce Intelligence Platform at o-10.com

## Quick Context

Archangel is a workforce map of US manufacturing, filled out in depth one focus area at a time, starting with Austin, TX. People explore **Industries → Companies → Plants → Jobs → Careers → Skills** on a map and through entity pages; seekers track skills and apply to jobs, employers post jobs and read applicants, admins load and correct data.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **State**: Zustand (UI), TanStack Query (server)
- **Backend**: Express.js, TypeScript, Drizzle ORM
- **Database**: PostgreSQL (Neon), with `pg_trgm` for search
- **Maps**: MapLibre GL JS + MapTiler (free tier)

## Theme and colour

Two themes, dark (default) and light, switched in settings (`/settings`, Appearance, which is shown signed out too) and kept per browser (`client/src/lib/theme.ts` sets `data-theme` on `<html>`; `client/index.html` applies it before first paint). Every colour comes from the tokens in `client/src/styles/globals.css`, exposed as Tailwind classes in `tailwind.config.ts`:

| Use | Classes |
|-----|---------|
| Surfaces | `bg-bg-base`, `bg-bg-surface`, `bg-bg-elevated` |
| Text | `text-fg-default`, `text-fg-muted`, `text-fg-soft` |
| Lines | `border-border-subtle`, `border-border-strong` |
| Meaning | `success`, `danger`, `warning`, `info` (`text-success`, `bg-danger/10`) |
| Wash | `tint`: white on dark, black on light (`bg-tint/5`, `border-tint/10`) |

Never name a palette colour in a component (`text-emerald-400`, `bg-white/10`): it is right in one theme and wrong in the other. `npm run lint` fails on it (`scripts/check-theme-colors.mjs`). The app is monochrome: kinds of thing (company, plant, career, skill) are told apart by their word (the kind above a page's name, the heading over a list) and a company by its logo, not by hue. The map has a palette per theme in `layers.ts` and is recreated when the theme changes.

## Project Structure

```
archangel/
├── client/
│   ├── index.html        # applies the theme before first paint
│   ├── public/           # manifest, icons, logos/ (stored company marks), data/us-states.geojson, data/areas/*.geojson
│   └── src/
│       ├── App.tsx       # every route
│       ├── components/   # CompanyLogo.tsx and a folder per area: ui/ (shadcn), layout/ (Layout: the header; Page.tsx: the page shell and the detail template; ConfirmDialog; ErrorBoundary), map/ (with panel/), explorer/ (Explore's tabs and lists), search/ (GlobalSearch; results.ts: the one search vocabulary), entity/ (a view per kind of record page, FootprintMap, RecordFacts), industry/, jobs/ (the job form, its pickers, the applicant list), me/ (the profile's sections), path/ (a skill path's parts: the tag, the group frame, the ring, the flow), account/ (the account menu, skill and goal controls; parts.tsx: shared pieces), admin/ (Admin Tools)
│       ├── pages/        # MapView, Explore (also draws /industries), Industry, EntityDetail, Jobs, JobDetail, SignIn, Me, Employer, Settings, Admin, NotFound
│       ├── stores/       # mapStore (Zustand)
│       ├── lib/          # http.ts (the one request), queryKeys.ts, queries.ts (shared reads), api.ts (public reads), account.ts (who is signed in), seeker.ts, jobs.ts, employer.ts, employerJobs.ts, employerCompanies.ts, admin.ts, records.ts, viewer.ts (who the interface is drawn for), storage.ts, theme.ts, geocode.ts, jobDraft.ts, stages.ts (the names of a skill's levels), small helpers (dates, places, validation, roving, jobFormat, utils), logos.json
│       └── styles/       # globals.css (theme tokens)
├── api/                  # index.ts: the one Vercel function, serving server/app.ts
├── server/               # Express API (app.ts is THE app; index.ts listens locally)
│   ├── routes/           # companies, factories, occupations, skills, industries, search, map, stats, explore, auth, me, jobs, employer, companyRequests, admin
│   ├── middleware/       # adminAuth (signed-in admin), validateUuid, cache
│   ├── lib/              # auth, invites, passwordResets, purpose, email, emailTemplates, notices, audit, records, recordMerge, recordSearch, writes, sources, industries, taxonomy, careerSearch, companySearch, jobSearch, openJobs, companyFilters, scope, paging, rows, like, wipeGuard, quality
│   ├── db/               # schema.ts, index.ts
│   └── scripts/          # import-pillar-bulk.ts (factories from Pillar), seed.ts (local sample data; its lists are in seed-data/)
├── shared/               # states.ts, scope.ts, pins.ts, industry.ts (the 21 industries: code, slug, name), skillLevels.ts (the three levels of a skill: name and gloss), purpose.ts, displayName.ts, companyNormalization.ts, addressStubFilter.ts
├── data/                 # what the generated migrations are built from: careers/ (aliases, careers by industry), cleanup/, companies/ (profiles, domains, logo-decisions), geo/ (counties and metro areas), employers/ (research files as delivered, and corrections.json), industries/ (the 21 and their official statistics), paths/, skills/ (the catalogue and the taxonomy)
├── migrations/           # SQL; 0010 onward run through scripts/migrate.mjs
├── scripts/              # migrate.mjs, create-db.mjs, ci-local.sh, make-admin.mjs, build-*-sql.mjs, employers-loader.sql, ingest/ (README.md: how a bulk source comes in; qcew.mjs), fetch-logos.mjs, enrich-naics.mjs, check-*.mjs (lint), geo/ (build-reference.mjs, assign-keys.mjs, keys-schema.sql), build-geo-sql.mjs
└── tests/                # responsive.spec.ts (Playwright), api/*.sh (local suites: accounts, jobs, seeker, admin, email, industries, loader; lib.sh holds what they share), unit/*.unit.ts (Node's test runner)
```

There are no spec documents: the code and this file say how things are. `README.md` covers running it locally, the checks, how data gets in and how it deploys.

## Coverage and focus areas

**What counts as manufacturing.** A plant makes a product in a factory. Construction does not count, nor does material mixed or cast for a building site: ready-mix concrete (NAICS 32732), concrete pipe, brick and block (32733), other concrete products (32739) and asphalt paving mixtures (324121) are left out and must not be loaded again (`0038_remove_construction_materials.sql` removed them; `NOT_COVERED` in `scripts/build-employers-sql.mjs` refuses them). Cement plants (32731) are in, along with lime, gypsum, glass, brick and roofing. Puerto Rico is out (`0029`).

Two separate ideas (`shared/scope.ts`):
- **Coverage** is which rows the public API returns: the whole country (`SCOPE.stateCode` is `null`, so the helpers in `server/lib/scope.ts` are no-ops). Every public GET still builds its conditions from those helpers, so narrowing later is one setting.
- **Focus areas** (`FOCUS_AREAS`) are regions being filled out in depth. The first is Austin, TX, bounded by its five metro counties (`client/public/data/areas/austin.geojson`). The map draws each as a geofence; `/api/map/areas/:id/overview` gives it the same panel data a state has.

The map opens on the continental US. A focus area is somewhere to go, not a limit on what exists.

Pins carry a tier: 2 featured employer (`companies.featured`), 1 established company (five or more factories nationwide), 0 other. `companies.domain` is used for logos.

## Depth and sources

A plant can carry how many people work there (`workforce_size`, with `workforce_year`, `workforce_source`, `workforce_note`), what it makes (`products`), the year it opened (`opened_year`) and its `status` (`operating` or `under construction`). `curated` marks a plant whose facts were written from sources, by a research file or by an admin. A company can be part of another (`parent_company_id`), has headquarters as city, state and country, and people in a state (`company_state_headcounts`: loaded from files and shown, with no editor). Sources are rows in `external_references`: `source = 'CURATED'`, one per source address, and `'EPA_ECHO'` for a plant's EPA registry id. `server/lib/sources.ts` reads them and the API gives them (`sources` on a plant's and a company's record), but a page states the fact and never where it was read: no source links, no publisher's name, no notes about a figure, on any public screen (an industry page says only which of its figures are official and their year) (`components/entity/RecordFacts.tsx` draws a plant's facts). Where a fact came from is for the data and for Admin Tools. A curated plant's name and address are shown as written; `formatFactoryName` only reshapes names that shout.

Curated employers and plants arrive as research files in `data/employers/`: five Texas files by sector, `texas-osha-additions.json` (Texas plants of 300 or more people found in OSHA Form 300A filings) and `us-largest-plants.json` (ranked on the same filings). They load through migrations generated by `scripts/build-employers-sql.mjs` (`0040_texas_employers.sql`, `0041_largest_plants.sql`): the files as JSON plus the functions in `scripts/employers-loader.sql`. The loader cannot see production, so it decides everything in SQL when the migration is applied and writes each decision to `load_log` (`look = true` on the lines to read). A company is found by exact name or alias only, in any letter case; rows found under several names are merged and their names kept as aliases. A plant is placed on the row that already is that plant (by company, name and distance) or added, and never deleted. A second load keeps the fuller fact. Our corrections to a research file go in `data/employers/corrections.json`, never in the file. A new file is checked (`--check`) and rehearsed on a copy of production (`--rehearse`, which undoes itself) before its migration is generated. `scripts/ingest/README.md` has the contract, the loader's rules and the steps.

## Geography and industry keys

A plant joins to public statistics through keys on its row (migration `0044`): `lat` and `lng` (generated by the database from the text `latitude` and `longitude` the app reads and writes, so they cannot disagree), `county_fips`, `cbsa_code` (its metro area) and `naics` (the 2022 six-digit code `primary_naics` means, when it means exactly one; `primary_naics` is kept as stored). The reference tables are `counties`, `metros`, `naics` (manufacturing, sector to national industry, each code with its parent; the 3-digit level is the 21) and `naics_concordance`, loaded from `data/geo/` and `data/industries/naics-*.json` by the generated migration (`scripts/build-geo-sql.mjs`; a unit check fails when the two disagree).

A trigger (`factories_keys`) keeps `naics` in step with `primary_naics` and clears the county when coordinates change. The county is written by `scripts/geo/assign-keys.mjs` (point in polygon against the Census Bureau's county boundaries, which stay outside the repository): a dry run unless `--apply`, refuses a database that is not local without `--remote`, safe to repeat, run after every load that adds or moves plants. A plant whose coordinates fall in another state than the one it is filed under gets no county and is listed. `scripts/ingest/README.md` has the steps. Any statement that inserts into `factories` names its columns: `lat` and `lng` cannot be written.

Official statistics for manufacturing as a whole are also kept by county (`industry_county_stats`, from the same QCEW adapter: `data/industries/qcew-<year>-counties.json`). A plant's page says its county's figure in one sentence under the address (`components/entity/CountyLine.tsx`, `GET /api/map/factories/:id/county`): a figure about the county, never the plant, with no source named, and nothing when none is published. The map's panel does not carry it.

## Employers: jobs and applicants

`/employer`, called **Your jobs** in its tab, heading and back links, is the list of a person's companies and jobs; the job form takes the page over from the address: `?post=1` (new), `?copy=<job id>` (another like an existing job), `?edit=<job id>` (change one; `&from=job` returns to the job's page). One form does all three: `components/jobs/JobForm.tsx`. A job's company, plant and career are fixed once posted. A job's edits, its applicants and the form's checks are in `client/src/lib/employerJobs.ts`; posting and closing in `lib/jobs.ts`.

On a job's page a person who manages it sees the company's view first (state, Edit, Post another like this, Close or Delete, then applicants) and the listing below it, with skills unmarked. Applicants are a compact list (`components/jobs/ApplicantList.tsx`), filtered by stage; a row opens to the applicant's skills against the job's (held, learning, missing), their note and contact, the private note and the stage. Hired and Declined take a confirmation and can be moved back to a working stage; Withdrawn is the applicant's and the company cannot change it. A job with no applications can be deleted; one with applications can only be closed.

A person finds their company on `/employer` by name (`GET /api/employer/companies`, `server/lib/companySearch.ts`): tolerant of spelling, spacing, "&" and the legal form, name matches only, the closest names when nothing matches. A company or a plant that is not in the data is asked for there (`company_requests`, `server/routes/companyRequests.ts`); an admin answers it on the Access tab ("Companies and plants to add"), and answering a company request gives the person access. After sign-in a person with a waiting request lands on `/employer`.

The job form keeps what is typed in the browser (`client/src/lib/jobDraft.ts`, one draft per person and form) until it is posted, saved or started over. The plant is chosen with `components/jobs/PlantPicker.tsx`. One person posts at most 30 jobs an hour. Applicants can be searched by name (above eight) and exported as CSV from the browser (`applicantsCsv` in `employerJobs.ts`).

Career search (`server/lib/careerSearch.ts`, behind `GET /api/occupations`) reads titles and `occupation_aliases`, with word order, plurals and level words set aside, and falls back to the closest titles. Everyday names are curated in `data/careers/aliases.json` and loaded by `scripts/build-career-aliases-sql.mjs` (migration `0027_career_aliases.sql`).

## Seekers: skills and reach

`/me` is called **Profile**: that word stands above the person's name. Applications come first, and only when there are any; then Goals, then Skills, with the person's own skills before the suggested ones.

A skill is marked where it is listed. Wherever skills are shown as a path they are **tags** (`SkillTag` in `components/path/`): the mark (`SkillHeldToggle` in `components/account/SkillStatusButton.tsx`), which sets the skill held or clears it in one tap, then the name, which opens the skill's page. Learning is set on the skill's page. A held tag is lit, one being learned half lit, the rest quiet. The change is optimistic (`useMarkSkill` in `client/src/lib/seeker.ts`), so every figure follows at once. How much is held is always the same ring (`ShareRing` in `components/path/HeldShare.tsx`): bright for held, dimmer for learning, which is never counted in the figure. A page gets the person's marks from `useSkillMarks()` and passes them down; with none (a visitor, someone here to hire) the same parts draw no marks and no progress.

On `/me` a person's skills stand under their domain in group frames, each with how much of the whole group is held; a skill is taken off with its mark and its tag stays, quiet, until the page is left. A goal's next skills are named under their level.

Careers within reach (`GET /api/me/careers/reach`, shown on `/me` under Goals as "Within reach"): careers with a path (`occupations.path_status` is set) of at least five skills of which the person holds at least one, ranked by the share held, each with the next skills to pick up, lowest level first. Held skills count fully; a skill being learned counts as half for the order only, never in the figure. Careers already chosen as goals are left out; goals carry their own `next` skills (`GET /api/me/goals`). A next skill and a suggested skill each carry their `level`.

A new account with nowhere to return to lands on `/me`. With no goal, skill or application the page is one question, "Start with a career" (search, or one tap on a career that has a path); choosing one fills the page. Suggested skills (`GET /api/me/skills/suggested`, under Skills on `/me`) are the skills of the person's goals, then of careers within reach, none already on their list; one tap on the mark adds one, another takes it off, and the list holds still while it is marked (`useSuggestedSkills` in `lib/seeker.ts` is not under the skills key). Removing a goal leaves "Removed X. Undo" in its place until the page is left.

`/jobs` is two fields and a list: what (`?q=`, every typed word matched in the title, company, career, shift, city or state: `server/lib/jobSearch.ts`) and where: `?state=`, or `?near=<lat>,<lng>&place=<name>&within=<miles>` (50 by default), chosen in the Where field (`components/jobs/JobPlaceFilter.tsx`: a ZIP code or town through `lib/geocode.ts`, or a state; a state select only when there is no map key). The browser is never asked for the person's location. A career is narrowed to by a link (`?career=<id>`) and named in the line above the list. With no open job anywhere the page has no fields.

## Careers and plants

Two different links, kept apart:
- `factory_occupations`: careers recorded for one plant (headcount, pay). Empty in production today.
- `industry_occupations`: careers typical of an industry (the 21 NAICS manufacturing subsectors in `factories.primary_naics_description`), curated in `data/careers/industries.json` and loaded by `scripts/build-industry-careers-sql.mjs` (migration `0021`). It says what kind of work an industry has, never that a given plant employs it, and the wording on screen keeps that distinction ("Careers in this industry", "Where this work is done").

From it: a career lists its industries with plant counts and leading states (`GET /api/occupations/:id` → `industries`, `everywhere`, `elsewhereToo`, `topStates`); a plant with no recorded careers lists its industry's (`GET /api/factories/:id` → `typicalCareers`), and so does a company whose one plant has none (`GET /api/companies/:id` → `typicalCareers`); a state or focus area lists the careers its industry mix points to (`careers` on the map overviews, weighted toward each industry's leading careers). Careers marked `common` (found in every industry) are left out of area lists.

## Industries

An industry is one of the 21 NAICS manufacturing subsectors (`INDUSTRIES` in `shared/industry.ts`: code, slug, and the name a plant carries in `factories.primary_naics_description`). `/industries/:slug` is its page for the country, a state (`?state=TX`) or a focus area (`?area=austin`); `/industries` lists all 21, largest first, as a tab of Explore (`components/explorer/IndustryList.tsx`). Two kinds of figure are kept apart: official statistics (`industry_stats`: people employed, establishments, average pay, by state and for the nation, from the Bureau of Labor Statistics' QCEW; none for a focus area) and what the product lists (plants, companies, and people at a plant whose `workforce_size` is recorded). An unknown headcount is null, never zero: an employer's people are summed over the plants that have one, and the page says "People at 2 of 5 plants" when that is not all of them. The page's Companies are ordered by people where a headcount is recorded, otherwise by plants. Link to an industry with `industryPath(name, { state | area })` (`shared/industry.ts`), which returns null for a name that is not one of the 21. The statistics come in through `scripts/ingest/qcew.mjs` (writes `data/industries/qcew-<year>.json`) and `scripts/build-industry-stats-sql.mjs` (generates the migration): another year is a new JSON file and a new generated migration.

A company's industry is the one most of its plants are in (`leadingIndustry` in `shared/industry.ts`; `companyIndustry` and `companyIndustries` in `server/lib/industries.ts` for SQL); a tie goes to the name that sorts first. It is shown through `shownIndustry`, which gives the short name for one of the 21 and null for anything else; a company's page shows up to two, read from its plants. `companies.industry` is free text that the record API still stores: it is not shown or searched, no list filters by it, and the admin form does not offer it.

## Skills

The skills catalogue is curated in `data/skills/catalogue.json` and loaded by `scripts/build-skills-sql.mjs` (migration `0033_skills_catalogue.sql`; a unit check fails when the two disagree). A skill is something specific a person can learn, be shown doing and be hired for; a material, a specification, a product name, a duty or a trait is not one. Every skill has a `description` (what it is, then "A person who has it …"), `how_learned` (on the job, a course, an apprenticeship, a credential: named only when it is real and current) and `tools` (a short list). A merged or renamed skill keeps its old name in `skill_aliases`.

**The taxonomy** is three deep: every skill is in one **skill group** and every group in one **domain** (a department a large manufacturer has). Every skill also has one **level**, the same in every career: 1 Fundamentals, 2 Intermediate, 3 Advanced (`shared/skillLevels.ts` holds the names and the few words under each; the client reads them through `lib/stages.ts`). The taxonomy is curated in `data/skills/taxonomy.json` (domains, groups and skills in the order they are shown; a group holds 2 to 12 skills; every skill of the catalogue is placed exactly once) and loaded by `scripts/build-taxonomy-sql.mjs` (migration `0042_skill_taxonomy.sql`; `--check` validates the file and writes nothing; a unit check fails when the file and the migration disagree). It lives in `skill_domains`, `skill_groups` and, on `skills`, `group_slug`, `level` and `group_position` (the skill's place in its group as the file orders it; a skill placed by hand has none and sorts after the rest of its level). `skills.category` is kept and holds the domain's name; the API neither returns it nor filters by it. The catalogue's `category` is still checked by the catalogue's builder and is shown nowhere.

A career's path is its skills laid out by their own levels: a path sets no stage. `occupation_skills.stage` is kept and always equals the skill's level, held so by two triggers that 0042 creates: `occupation_skills_stage_is_level` (a row written to a path takes its skill's level whatever it was given) and `skills_level_moves_paths` (a skill whose level changes moves in every path). A career has a path when `occupations.path_status` is set (`draft` or `approved`). Any career with skills has a path to draw; `path_status` decides only the word "Draft" beside the heading.

A career's path is drawn as a flow (`PathFlow` in `components/path/`, from `buildPath(skills)` in `model.ts`): one trunk through the three levels, a branch for each domain a level draws on, each skill group a frame (`SkillGroupBox`) with its name set into the top edge, holding its skills as tags. It runs down a phone and across a wide screen from the same markup (a container query on `.path-flow` in `globals.css`); the lines are drawn by the layout, never measured. All three levels are always drawn; an empty one says so. `comesFrom` and `leadsTo` on `GET /api/occupations/:id`, when present, are drawn before the first level and after the last. The parts take a path as data, so the same ones draw a skill's group on its page and a person's skills on Profile, and will draw a company's version of a career; a tag can carry a second line (`note`) for a make.

A skill carries its `level`, `group` and `domain` (the last two as `{ slug, name }`; `server/lib/taxonomy.ts` reads them) on the skills list, on its own page and in a career's `skills`. All three are null only for a skill no migration placed, as in a local database filled by `npm run db:seed` alone. `GET /api/skills/taxonomy` is the whole tree in one answer: the levels, then every domain with its groups and their skills, each skill with its `level` and how many careers use it (`careers`). The client reads it with `useTaxonomy()` in `lib/queries.ts`, kept for the visit and refreshed when an admin changes a skill, a career or a path (`recordsChanged` in `lib/records.ts`).

The skill page is one request (`GET /api/skills/:id`): the details, its level, group and domain, the other skills of its group (`groupSkills`), the careers that use it, the industries those careers are typical of, the skills whose careers overlap most with its own (`relatedSkills`, each with its level and group) and open jobs that ask for it. Under its name the page links its domain and its group, each into the Skills list narrowed to it, and says its level. Its first section is its group (`#group`): the group's frame with all its skills as tags under their levels, this skill the one that is not a link. `GET /api/skills` lists only skills a career uses, the ones most careers use first (`sort=name` for name order), narrowed by `domain=` and `group=` (slugs) and `level=` (400 unless 1, 2 or 3); with `search` it matches the name, another name (`skill_aliases`) and a tool, and also finds a skill no career uses yet. `/api/search` matches those and the name of a skill's group or domain, and says "Also called …" when it found a skill by another name.

## Detail pages

Company, plant, career, skill, industry and job are one template, written out at the top of `client/src/components/layout/Page.tsx` and built from `DetailHeader`, `DetailFacts`, `DetailSection`, `RecordList` / `RecordRow` and `ShowAll`:
- The heading block: the way back alone on the first line (an admin's Edit at its end), the kind in small capitals above the name (a job reads "Job #N" only to people who manage it), the name with the company's mark before it on company, plant and job, one paragraph, one or two quiet lines of facts, then the page's one action: Open on the map (company, plant, industry), Set as goal (career), Not held / Learning / Held (skill). A job's action is a form, so it is the Apply section after the job's terms.
- Sections, in this order, leaving out what the page does not have: what it is, where, open jobs, companies, plants, careers, skills.
- A list of records is one card of rows: the name, at most one grey line, a chevron or the row's figure. No icon per row; a company's mark may lead its row and a skill's row may carry its mark. Three other shapes exist, each for one thing: figures by place (`FigureList` in `components/industry/parts.tsx`), chips for states that open on the map, and skills on a path, which are tags in group frames (`components/path/`).
- A company with one plant leads with that plant's facts and address in place of a list of one.

## Words

On screen an occupation is a **Career**, and a job is one opening for a career at one plant. A factory is a **plant** everywhere and headcount is **people**, never workforce or employees. A career someone aims for is a **goal** ("Set as goal", "Goal", "Goals"). `/me` is **Profile** and `/employer` is **Your jobs**. A plain account has no role label. An **Industry** is shown by its short name (`industryLabel`); **Establishments** is the official count of workplaces and **Plants** are the ones the product lists. A place is written "City, ST". On a job's page and the account pages a day is "today", "yesterday", then "Nov 18", with the year only when it is not this one (`formatDay` in `lib/dates.ts`); only History gives the time. An empty list reads "None yet." Code, routes and tables still say `occupation` and `factory`. A skill's level is **Fundamentals**, **Intermediate** or **Advanced**, the same in every career. A domain is shown by its name alone ("Quality", never "Domain: Quality"); a skill group by its name, and called a group where a noun is needed ("All groups").

## Users

Roles are relationships, not account types (`server/lib/auth.ts`):
- **Seeker**: any signed-in person. Owns their skills (learning/held), career goals and applications.
- **Employer**: a person with an active membership in a company (`company_members`). A join request is approved by an admin.
- **Admin**: `users.is_admin`, and nothing else: there is no admin key, header or setting that opens a write. The first admin signs up in the app and is then made one on the command line (`node scripts/make-admin.mjs <email>`, which reads `DATABASE_URL`). After that, admins make admins from Admin Tools. Nobody removes their own admin role, and the last admin cannot be removed. Every route that changes a company, factory, career or skill, and all of `/api/admin/*`, takes a signed-in admin: 401 signed out, 403 otherwise.

**Purpose** (`users.purpose`, migration `0034`; rules in `shared/purpose.ts`): what an account is for, `work` or `hire`. It decides which tools are drawn and never what is allowed. Set at sign-up (`POST /api/auth/sign-up { purpose }`) or in settings (`PATCH /api/me { purpose }`). While it is unset it is read from the person's ties to a company: a membership, a request to join one or a request to have one added means `hire`. `GET /api/auth/me` returns it as `user.purpose`.

**Tools by person** (`useViewer()` in `client/src/lib/viewer.ts`): a seeker is shown their profile, goals, skill marks and Apply; an employer their jobs and applicants, and no goals, skill marks or Apply; an admin Admin Tools and Edit, plus the tools of their own purpose. One set at a time. A seeker's control asks `useSeekerTools()`, a "Post a job" prompt `usePostJobLink()`. Pages reached by their address always work.

**View as**: an admin chooses in settings to see the app as a user or an employer. It is kept in the browser (`archangel.viewAs`, `<user id>:<view>`), changes only what is drawn and sends no request differently. While it is on, the header's wordmark is replaced by one sign (`components/account/ViewAsSign.tsx`; on a phone the eye alone) that returns to the admin view in one press.

**Invites** (`invites` table, `server/lib/invites.ts`): an admin creates a one-time link for an email address (`/sign-in?invite=<token>`), as a user, an employer of one company, or an admin. The link is shown once (only the token's hash is stored), lasts 14 days, and there is one pending invite per address. When mail is on the link is also emailed to the address; when it is off the admin passes it on. Signing up through it creates the account, applies the role and marks the invite accepted in one transaction. An address that already has an account is not invited; its roles are changed under People.

**Passwords** (`password_resets` table, `server/lib/passwordResets.ts`): a signed-in person changes their own in settings (`POST /api/auth/password { current, next }`), which ends their other sessions. Someone who cannot sign in gets a one-time link from an admin (People → Manage → Password reset link; `POST /api/admin/users/:id/reset-link`). It opens `/sign-in?reset=<token>`, is shown once (only the token's hash is stored), lasts 24 hours and replaces any unused link for that person. Using it sets the password, ends all of that person's sessions and signs them in. When mail is on the link is also emailed to the person, and "Forgot password?" on the sign-in page sends one without an admin (`POST /api/auth/forgot { email }`: the same answer whether or not the address has an account, given before any account is looked up). When mail is off the admin passes the link on and the sign-in page says so.

**Admin Tools** (`/admin`, `client/src/pages/Admin.tsx`, tabs in `client/src/components/admin/`) is reached from "Admin Tools" in the account menu, shown to admins only. Tabs (`?tab=people|access|invites|data|history`):
- `people`: search by name, email or company (`?q=`), by role (`?role=admin|employer|waiting|user`), the open person (`?open=`); roles, company access, name and email corrections, "Sign out everywhere", delete.
- `access`: requests to join a company (approve and decline carry Undo), and requests to add a company or plant.
- `invites`: pending, and earlier (accepted, expired). Admin invites last 3 days, others 14.
- `data`: find a record to correct or add one, and career paths (drafts and approved). With `&kind=company|factory|career|skill&id=<uuid>` the tab is that record's editor (`components/admin/RecordEditor.tsx`): its fields, a career's path (`#path`), Merge, History, Delete. An admin sees **Edit** on a record's own page; it opens the same editor. One form adds and corrects (`components/admin/RecordForm.tsx`); for a skill it chooses a Group (every group, listed under its domain) and a Level, and adding one needs both. A career's path (`components/admin/PathEditor.tsx`) adds and removes skills and shows each under its own level: a level is changed on the skill's record, never on a path. Under them, Data quality (`components/admin/QualityTable.tsx`, `GET /api/admin/quality`, `server/lib/quality.ts`): one table by state of how many plants have an industry, a clean code, a county, a headcount, an address and an outside id, companies with one plant, and plants that share company and spot (coordinates equal to three decimals); the definitions under the table and in `quality.ts` are the same words.
- `history`: what admins changed (`?show=<kind>`).

To anyone who is not an admin the page is the not-found page. An action says what it did through `useAdminNotice().say(message, { undo, focus })` (`components/admin/AdminNotice.tsx`); `focus` is where the keyboard goes when the action removed the row that had it.

**Records**: a company, factory, career or skill is changed through `server/lib/records.ts`, whichever route it arrives by (the kind's `PUT` / `DELETE`, or `PATCH /api/admin/companies/:id`). Each field is checked, a refusal carries `field`, and the audit line is written in the same transaction. A plant an admin gives people, products or an opening year counts as curated. A skill's group and level can be changed and never cleared; the audit line names the group, the domain and the level in words. A merge (`POST /api/admin/records/:kind/:id/merge { into }`; company, career, skill; `server/lib/recordMerge.ts`) moves everything to the kept record and keeps the merged name as an alias (`companies.aliases`, `occupation_aliases`, `skill_aliases`). Adding or renaming warns of near-duplicates (`GET /api/admin/records/:kind/similar?name=`; `server/lib/recordSearch.ts`).

**Audit**: `audit_log` (migration `0025_admin_upkeep.sql`, `server/lib/audit.ts`). Every admin write calls `recordAudit` with who, kind (`company | factory | career | skill | person | access | invite`), the record, the action and a short before and after; read with `GET /api/admin/audit?kind=&record=&limit=&offset=`. A new admin write must add its line.

**The first admin** is the one with the earliest `users.admin_since`; another admin cannot remove that role or delete the account (handing it on takes SQL). The most common passwords are refused.

**Records by hand** (`components/admin/Records.tsx`, `lib/records.ts`): the Data tab's find-or-add. One company, plant, career or skill is added through the validated POST endpoints. An add names what was added with a link to its page; a duplicate (409) links to the record that is already there. There is no spreadsheet import: data in bulk comes from scripts and generated migrations (see `README.md`).

Sessions are an HttpOnly cookie; only the token's hash is stored. Signed-in responses are `no-store`.

## Email and notices

**Sending** (`server/lib/email.ts`): `sendEmail` / `sendEmails` call Resend's HTTP API with `fetch` (no SDK). Mail is on only when `RESEND_API_KEY` and `EMAIL_FROM` are both set; off, every caller carries on as before and the interface keeps its "passed on by hand" wording. Every link in an email is built from `APP_URL` (default `https://www.o-10.com`), never from a request. Outside production `EMAIL_OUTBOX=<file>` captures emails as JSON lines instead of sending them and counts as on. `GET /api/auth/options` → `{ email }` tells the client (`useEmailOn`). Sending never throws into a caller, waits at most four seconds, and logs only the kind of email and the cause.

**What is sent** (`server/lib/notices.ts`, wording in `server/lib/emailTemplates.ts`: text first, an HTML twin in one plain column):
- Sign-in emails, always when mail is on: an invite; a password reset (asked for on the sign-in page, or made by an admin).
- Notices, unless the person turned them off (`users.email_notices`, the switch in settings, which a notice's last line links to): a company access request (to the admins), its approval or decline (to the requester), a new application (to the company's active members, at most one per job per member per hour; the next says how many more applied), an application's stage changed by the company (to the applicant). A withdrawal emails nobody.
- A notice is sent after the write it reports, and a failure to send never fails the action. Limits are kept in `notice_log`.

**Without email:**
- A declined access request is kept: `company_members.status = 'declined'` with `decided_at` / `decided_by`. The employer page says so, the same company cannot be asked again for 7 days (409), and Admin Tools lists the last 30 days of declines with "Approve after all". `decision: 'remove'` on `PATCH /api/admin/memberships` deletes the row, whatever its state.
- An application's history is in `application_events` (written on apply, on every stage change, on withdrawal). `/api/me/applications` returns each application's `events` and `changed`; `/me` shows the stages with dates and, at Interview and Offer, that the company will contact the person at their account email.
- The account button shows one accent dot, never a count, when `GET /api/me/news` → `{ applications, applicants, access }` has something true. It is cleared by opening the page that shows it (`POST /api/me/seen`; `users.applications_seen_at`, `applicants_seen_at`, `access_seen_at`): `/me`, the employer page or a job the person manages, the Access tab. In the menu the page with the news stays bright and the rest step back.
- Admin Tools opens with a "Waiting" line (access requests, requests to add a company or plant) only when someone waits. Draft career paths are work, not someone waiting: they are listed under Data. An access request shows the person's address beside the company's domain and how many people already have access.

Migration `0024_email_notices.sql` adds all of the above. `tests/api/email.sh` checks it against a server started with `EMAIL_OUTBOX` (give the script the same file as `OUTBOX`, and the same `APP_URL`).

## Routes

**Public:** `/map` (opens on the US; `?area=austin`, `?state=TX`), `/explore`, `/jobs`, `/jobs/:id`, `/companies/:id` (id or slug: `/companies/tesla`), `/factories/:id`, `/occupations/:id` (career page with path), `/skills/:id`, `/industries`, `/industries/:slug` (`?state=`, `?area=`), `/sign-in`, and `/settings`, which signed out shows Appearance and the way to sign in (the sign-in page links to it)

`/explore` is one page with six views under one heading and one tab row (`components/explorer/ExploreNav.tsx`): Overview, Industries (`/industries`, drawn by Explore), and the lists at `?tab=companies|factories|occupations|skills`, on screen Companies, Plants, Careers, Skills. The lists are filtered and sorted from the address (`state`, `industry`, `domain`, `group`, `sort`); plants open on Most people (known headcounts first, largest first, the rest by name), careers on Most skills and skills on Most careers. Skills are narrowed by domain, then by one of its groups. The overview (`components/explorer/ExploreOverview.tsx`) has one section per tab, in the tabs' order, under four figures; a list's own count sits between its filters and its rows.

**Signed in:** `/me` (Profile: applications, goals, skills), `/settings` (name and ZIP code, email, password, email notices, theme, what the account is for, View as for admins, delete account), `/employer` (Your jobs, for company members), `/admin` (Admin Tools, admins)

Old addresses: `/import` and `/import/bulk` redirect to `/admin?tab=data`; `/tree` redirects to the map. Anything else unknown (including the removed `/refs/:id`, `/schools/:id`, `/programs/:id`) is the not-found page.

**Header** (`components/layout/Layout.tsx`): Map, Explore and Jobs are words at every width, with no icons. The wordmark links to the map and is dropped on a phone. Explore is lit for `/industries` and every company, plant, career and skill page. For someone here to hire the third item is "Your jobs" (`/employer`); the account menu lists Your jobs only while applicants are waiting, and a profile for someone here to hire only while an application has news, so the dot always leads somewhere.

**Search**: the header's search (`components/search/GlobalSearch.tsx`) and the map's share `components/search/results.ts`: the groups, their words, one order (States and areas, Industries, Companies, Plants, Careers, Skills, Jobs, then the map's Places) and the scoring. A group holding exactly what was typed leads. Rows carry no icon: a company its logo. With nothing typed the header's search is the field alone, with recent searches if there are any.

## API Endpoints

- Public reads: `/api/companies` (`?industry=` takes one of the 21 by name or slug), `/api/factories` (`sort=workforceSize`; `/pins` is the map's packed pins, `shared/pins.ts`, and takes `states` and `company`), `/api/occupations` (careers with a path first, then the most skills; `sort=name` for name order; a row's `levelCounts` is how many of its skills are at each level), `/api/skills` and `/api/skills/taxonomy` (see "Skills"), `/api/search` (companies, factories, careers, skills, industries, open jobs as `results.jobs`, and states from `shared/states.ts`; a plant's `subtitle` is "Company · City, ST", a company's its industry's short name or nothing, a skill's its group unless it says "Also called …"), `/api/map/*` (with `factories/:id/county` → `{ county, metro, manufacturing }`, `county` null for a plant not yet placed), `/api/stats/counts` (companies, factories, occupations, skills, total), `/api/explore/overview` (everything the Explore overview shows, in one response), `/api/explore/facets` (what the browse lists filter by: `industries: { plants, companies }` and `skillDomains`, the domains with a skill some career uses, each `{ slug, name, groups }`, in the taxonomy's order), `/api/jobs`, `/api/jobs/:id`, `/api/industries?state=|area=` (every industry in a place, with manufacturing as a whole) and `/api/industries/:slug?state=|area=` (the industry page in one response). `/api/jobs` GET takes `q`, `occupationId`, `companyId`, `factoryId`, `state`, `near`, `within` (with `near` each job carries `miles`, nearest first); the map overviews (`states/:code/overview`, `areas/:id/overview`, `bounds/overview`) carry `openJobs` and `jobs`, listed in the panel only when there are some. `/pins` and `/api/map/state-counts` answer 400 to a query parameter they do not take, `?industry=` on the pins included (`onlyQuery` in `server/middleware/cache.ts`). Wherever a route takes `limit` it is read as a whole number from 1 to the route's most (`1.5` is 1)
- Depth: `/api/factories` rows and `/api/factories/:id` carry `workforceSize`, `workforceYear`, `workforceSource`, `workforceNote`, `products`, `openedYear`, `status`, `curated`; `:id` also `sources`. `/api/companies/:id` carries `parent`, `subsidiaries`, `headquarters`, `peopleByState`, `sources`, and each plant's depth and address
- `/api/auth/*` sign-up (takes an optional `invite` token), sign-in, sign-out, me, `options`, `invite/:token` (what an invite grants; 404 when unknown, used or expired, with `reason: used | expired | unknown`), `password` (change your own), `forgot`, `reset/:token` (whose password a reset link sets; 404 when unknown, used or expired), `reset` POST `{ token, password }`; `email` POST `{ email, password }` changes the sign-in address (ends other sessions, tells the old address by mail)
- `/api/me/*` profile, `news`, `seen`, skills, `skills/suggested`, goals (each with `next` skills), applications, `careers/reach`; `DELETE /api/me { password }` deletes your own account with its skills, goals, applications and memberships (posted jobs stay; not the last admin)
- `/api/jobs` POST; `/:id` PATCH (fields, `skills` as the whole list, close, reopen; company members and admins) and DELETE (only a job with no applications, else 409); `/:id/apply`; `/:id/applications` (ranked; the job's `skills` once, and per applicant `heldSkillIds` and `learningSkillIds`); `/applications/:id` (stage and private note). An application link is stored as https; one typed without a scheme gets it
- `/api/employer/*` memberships and the employer dashboard; `companies?q=` (find a company by name); `company-requests` GET, POST, DELETE `/:id` (ask for a missing company or plant). `/api/auth/me` carries `hasCompanyRequest`; factories on `GET /api/employer` carry `address`
- `/api/admin/*` (signed-in admin): `overview`; `users` (`?q=`, paged), `users/:id` PATCH `{ isAdmin, name, email }` and DELETE; `users/:id/sign-out` POST; `users/:id/reset-link` POST; `memberships` GET, POST (add a person to a company), PATCH (`decision: 'approve' | 'decline' | 'remove' | 'reopen'`); `invites` GET, POST, `invites/past`, `invites/:id` DELETE; `paths?status=draft`; `companies?q=`, `companies/:id` PATCH `{ domain, featured }`; `company-requests` GET, PATCH `/:id` `{ decision: 'add', companyId? } | { decision: 'decline' }`; `records/:kind?q=`, `records/:kind/similar?name=`, `records/:kind/:id` (the editor's view, with `attached` counts and a career's `path`), `records/:kind/:id/merge` POST; `audit`; `quality`
- Record writes (signed-in admin): `POST`, `PUT /:id`, `DELETE /:id` on `/api/companies`, `/api/factories`, `/api/occupations`, `/api/skills`, checked through `server/lib/writes.ts`. A `POST` that would repeat a record answers 409 with `existing: { id, name }` (a company by name in any letter case; a factory by company, name and state; a career by title; a skill by name). A factory needs `companyId`, `name`, `state` (a code from `shared/states.ts`), `latitude` and `longitude` as numbers, and takes `city` and `address`. A career's `onetCode` is text of up to 20 characters on `POST` as on `PUT` (400 otherwise), trimmed, an empty one stored as null. A skill needs `name`, `group` (a group's slug, which fixes its domain) and `level` (1, 2 or 3): a missing or unknown one answers 400 with `field`, before the duplicate check. `PUT /api/factories/:id` also takes the depth fields above; `PUT /api/companies/:id` takes `parentCompanyId` and `headquartersCity`, `headquartersState`, `headquartersCountry`
- `PUT /api/occupations/:id/path { skills: [{ skillId }], replace?, status? }` sets a career's skills in bulk (admin): with `replace` the skills not listed leave the path, `status` is `draft` or `approved`, and a `stage` sent is not read

## Migrations

`scripts/migrate.mjs` applies the SQL files it lists (0010 onward) once each, under a lock, and skips when `DATABASE_URL` is unset. `npm run build` runs it only on Vercel's production build (`VERCEL_ENV=production`); a preview, local or CI build leaves the database alone, and `npm run db:migrate` applies migrations on purpose. (If Vercel does not expose `VERCEL_ENV`, the build migrates as it always did and says so in its log.) `npm run db:create` builds the schema in an empty database (0000-0009, which predate the runner and are applied by `scripts/create-db.mjs`, then the runner); `-- --sample` adds sample data. There is no Drizzle Kit: `server/db/schema.ts` is for queries only.

The list must stay in order (a unit check fails otherwise); it is ordered, not contiguous: there is no 0031 or 0032. New tables go in a new idempotent SQL file in `migrations/`, added to the list in that script, and mirrored in `server/db/schema.ts`. A generated migration is never edited once applied: a later change is a change to its JSON in `data/` and a new generated migration.

What the notable ones did:
- `0010_accounts_jobs.sql`: accounts, company memberships, jobs, applications, a person's skills and goals. `0015_invites.sql` adds `invites`; `0020_password_resets.sql` adds `password_resets`.
- `0011`, `0016`, `0018`: career paths, generated by `scripts/build-paths-sql.mjs` from `data/paths/`. `0012` and `0013`: a company's `domain` and `featured` flag, the columns and then the values from `data/companies/profiles.json`; `0014`: slugs; `0019`: descriptions from the same file.
- `0021_industry_careers.sql` adds and fills `industry_occupations`.
- `0022_data_cleanup.sql` is generated by `scripts/build-cleanup-sql.mjs` from `data/cleanup/2026-11-cleanup.json` (careers, skills and companies deleted, merged and renamed; plants moved or removed; a merged name is kept as an alias).
- `0023_remove_legacy.sql` drops what the product no longer has: Elements (`refs`), Schools, Programs and People with their junction and alias tables, the `states`, `industries` and `skill_categories` lookups, `skill_relations`, `entity_links`, the spreadsheet import's tables, and the columns `factories.state_id` and `skills.category_id`. `occupation_aliases` and `skill_aliases` are kept: they hold the names of merged careers and skills, for search and for later merges. A state is its two-letter code (`factories.state`, `shared/states.ts`); a company's industry is text on its own row, and so is `skills.category`, which is kept and not shown (see "Skills").
- `0024_email_notices.sql`: see "Email and notices". `0025_admin_upkeep.sql`: `audit_log` and `users.admin_since`.
- `0026_company_requests.sql` adds `company_requests`; `0027_career_aliases.sql` fills `occupation_aliases`.
- `0028_indexes_and_checks.sql` adds three foreign-key indexes and two value checks (a path's stage is 1 to 3; a job's pay runs low to high).
- `0029_remove_puerto_rico.sql` deletes Puerto Rico's plants and the companies that existed only there: the product is the 50 states and the District of Columbia (`shared/states.ts`).
- `0030_depth_and_provenance.sql` adds the depth columns on `factories` and `companies`, `company_state_headcounts`, the curated-source index on `external_references` and `load_log`.
- `0033_skills_catalogue.sql` adds `skills.how_learned` and `skills.tools` and applies the skills catalogue. `0034_account_purpose.sql` adds `users.purpose`.
- `0035_industries.sql` adds `industry_profiles` (one sentence per industry) and `industry_stats`; `0036_industry_stats.sql` is generated from `data/industries/`.
- `0037_company_domains.sql` is generated by `scripts/build-domains-sql.mjs` from `data/companies/domains.json`: it sets `domain` only where it is empty, by exact name, and the file's `skipped` list says which companies were left out and why.
- `0038_remove_construction_materials.sql` removes concrete and asphalt paving plants. As first applied to production it matched the whole cement-and-concrete group (NAICS 3273) and took the cement plants too; `0039_restore_cement_plants.sql` puts 41 cement plants and their companies back, and 0038 now names only the concrete codes.
- `0040_texas_employers.sql` and `0041_largest_plants.sql`: see "Depth and sources".
- `0042_skill_taxonomy.sql`: the taxonomy's tables and columns, every skill placed by name, and the two triggers (see "Skills"). It stops, changing nothing, when the stored skills are not exactly the ones the file places, so a skill an admin added, renamed, merged or deleted has to be brought into the catalogue and the taxonomy before a taxonomy migration will apply. `scripts/create-db.mjs` marks its first pass (`archangel.from_nothing`) so a database built from nothing is let through; its second pass, over the sample data, is checked like any other. Once 0042 has been applied to production, a change to the taxonomy is a new numbered file (the builder's third argument is the output), and `tests/unit/taxonomy.unit.ts`, which names 0042, is pointed at it.
- `0044_geo_keys.sql`: see "Geography and industry keys". Generated; a later year of county statistics is `node scripts/build-geo-sql.mjs --stats-only <file> --out <new migration>`.

## Map

- All camera movement goes through `client/src/components/map/camera.ts`. Never call `flyTo`/`fitBounds` elsewhere, and never pass `padding` to `flyTo` (MapLibre saves it and `fitBounds` adds it again).
- Sources, layers and paint values live in `client/src/components/map/layers.ts`. Far out, factories are faint points under a density glow (no clusters, no numbers); from about zoom 5.5 they become pickable pins. Pins sit beneath the basemap's place names.
- Everything floating over the map uses the one `.map-overlay` surface in `globals.css`. Do not hand-roll translucent glass; its legibility depends on what is behind it.
- Hover cards render from the pin's own properties. No request on hover.
- With no `VITE_MAP_TOKEN`, or if the basemap fails, the map draws on a plain canvas in the page colour.
- The attribution control stays (the basemap's and OpenStreetMap's terms require it), collapsed to its "i" button.
- Pins load once (`usePins` in `lib/queries.ts`); state, industry, company and career are filter and paint expressions set by `setPinView` in `layers.ts`. Never refetch or `setData` for a filter.
- What the panel shows for each kind of thing is a file in `components/map/panel/`.
- The map has at most one subject, a company (`?company=`, id or slug) or a career (`?career=`): `filters.company` / `filters.career` in `mapStore`. A company's plants are drawn alone and framed; a career's industries keep their strength and the rest step back. The chip under the search turns it off.
- The map's address: `?factory= ?state= ?area= ?skill= ?place=&in=&box=` (what the panel shows), `?company= ?career=` (subject), `?industry=`; the camera is the fragment `#zoom/lat/lng`, written with replace by `MapView`. Something a link names that does not exist calls `notFound()`: one line beside the search, the country, the address cleaned.
- A click or tap selects after 250 ms unless a second one or a camera move cancels it (a double tap zooms). Touch reach is about 22 px close in and 10 px far out; states are hit at the exact point. Dragging is limited to `REACH` in `camera.ts`; flights made by `camera.ts` are exempt. Rotation and pitch are off.
- Map controls take their size from the pointer (`.map-control`, `.map-search-button`, `.map-row`, `.map-chip`, `.map-field` in `globals.css`): 44 px and 16 px type on `pointer: coarse`.
- The phone sheet rests at bar / peek / full (`sheetDetent`); the home view on a phone frames the country above the resting sheet.
- Map search lists states and focus areas, then the product's own companies, plants, careers and skills, then places (towns, counties, ZIP codes; streets only when the query has a digit) from `client/src/lib/geocode.ts`, under the shared search vocabulary (see "Routes"). It lists no industries or jobs: the map has no panel for either. A town opens a panel for its bounds: `GET /api/map/bounds/overview?west=&south=&east=&north=` (the region overview for any box, plus up to 24 plants).
- The map overviews list only the 21 as industries (`INDUSTRY_NAME_LIST` in `server/lib/industries.ts`), and the panels show them by their short names.
- A first visit is given one sentence under the search field, once per browser (`archangel.map.seen`), and only on the bare map: a link that opens a panel says what it is showing instead.

## Look and feel

The rule of thumb: it should look like software Tesla would ship on a vehicle screen, not like a consumer phone app.

- Monochrome and quiet, in both themes. One accent (the geofence's blue). No entity colours anywhere.
- No stars, badges, emoji, counters or "click here" hints. Emphasis comes from order, size and brightness. Application stages and a skill's status read by brightness and shape, not hue; `success` is for success messages only. Section headings on entity pages carry no counts.
- Nothing on the map that the person did not ask for: no numbered bubbles, no labels on pins. Counts and detail live in the panel they open.
- Density reads naturally (a glow far out, distinct points close in), not as a chart.
- Motion is short and purposeful. Nothing flashes a loading state for content the client already has.

## Code Style

- TypeScript strict mode, no `any`
- Functional components with hooks
- Tailwind for styling
- Colours come from theme tokens only (see "Theme and colour")
- List and account pages compose `PageContainer` / `PageHeader` / `PageSection` / `EmptyState` from `components/layout/Page.tsx`; detail pages compose the template in the same file (see "Detail pages"); primitives come from `components/ui/` (shadcn)
- Grids must set a mobile base (`grid-cols-1`) before breakpoint columns, and truncated children need `min-w-0`
- Env: `DATABASE_URL`, and the MapTiler key `VITE_MAP_TOKEN`; mail takes `RESEND_API_KEY`, `EMAIL_FROM` and `APP_URL` (see "Email and notices"). Locally they live in `.env.local` (copied from `.env.example`); the server reads `.env.local`, then `.env` (`server/loadEnv.ts`)
- The page and the API are one origin (Vercel rewrites `/api`; in dev Vite proxies it), so there is no CORS and the client always calls `/api`
- No service worker. The manifest is a static file (`client/public/manifest.webmanifest`); cache lifetimes are in `vercel.json`. The font (Oxanium) is bundled, not fetched from a third party
- Every route that takes `limit` or `offset` reads it through `pageLimit` / `pageOffset` (`server/lib/paging.ts`)
- In `server/lib/` each of these is written once: the rows of a hand-written statement, `rowsOf` (`rows.ts`); typed text inside a LIKE pattern, `likeLiteral` or `containing` (`like.ts`); "this job is open", `jobIsOpen()` (`openJobs.ts`); "may this person act for this company", `canManageCompany` (`auth.ts`); "is this an id", `isUuid` (`writes.ts`)
- `server/scripts/*.ts` run under tsx, may import from `server/` and `shared/`, and are type-checked but not linted. `scripts/*.mjs` are plain Node, import nothing from either, and run without a build (`migrate.mjs` runs inside Vercel's build)
- A new dependency is proven with a clean install (`npm ci` in a fresh copy, then `npm run build`), not with the packages already on disk: Vercel installs from the lockfile only
- A control that is saving is marked `aria-busy` / `aria-disabled` (`busyButtonClass`), never `disabled`: a disabled control drops keyboard focus. A form names each problem beside its field and focuses the first
- Requests to the API go through `request` in `lib/http.ts`, or for the reads in `lib/api.ts` its own `apiFetch`; both use `fetchWithTimeout` (`lib/http.ts`) and give up when no answer has begun in 20 seconds. Only static files and the geocoder are read with `fetch` itself. Mutations run with `networkMode: 'always'`: a change made offline fails there and then
- Every query key is in `lib/queryKeys.ts` (`accountKeys`, `publicKeys`); a new query adds its key there. A read several components make is declared once in `lib/queries.ts`: a record's page, the map's panel and a list row's prefetch all read it through `recordQuery`, so an admin's correction reaches them together
- Button groups acting as tabs or radios use `onGroupArrowKeys` (`lib/roving.ts`; `arrowKeyChoice` there is the same thing as a handler) with a roving tabindex; `SegmentedChoice` in `components/account/parts.tsx` is the control built on it
- After a deliberate sign-out a gated page sends the person to the map (`justLeft` in `lib/account.ts`)
- An entity page picks its view from the address (`entityType`), never from the shape of the response; the shape checks in `EntityDetail.tsx` only narrow types, and each view is a file in `components/entity/`. Adding a field to a response must not be able to change which page is drawn
- Server/api relative imports MUST end in `.js` (`from './routes/map.js'`, `from '../db/index.js'`): the function runs as Node ESM on Vercel. `npm run lint` enforces it
- Browser storage is read and written only through `client/src/lib/storage.ts`, which never throws. The one exception is the theme script in `client/index.html`, which runs before any module
- A company's logo comes from `client/public/logos/` when `client/src/lib/logos.json` lists its domain (null means lettermark, no request); only a domain not in the list still asks the favicon service. `scripts/fetch-logos.mjs` fills both from every domain the data names and is safe to run again; decisions made by hand are kept in `data/companies/logo-decisions.json` (`README.md`, Logos, has the sources it tries and the steps). Look at every new mark (`--sheet out.html`) before committing: a wrong logo is worse than a letter
- The page's Content-Security-Policy is in `vercel.json`; a new outside host must be added there, and an inline script in `client/index.html` by its hash (`npm run lint` checks)
- Deleting a company, factory or career is refused (409) when one of its jobs has applications: such a job is closed, never deleted. Jobs nobody applied to go with the record, and the confirmation says so

## Common Commands

```bash
npm run dev          # Page on :5173, API on :3000
npm run build        # Production build (migrates first only as Vercel's production build)
npm run db:migrate   # Apply migrations 0010 onward (scripts/migrate.mjs; needs DATABASE_URL)
npm run db:create -- --sample   # Build the schema and sample data in an EMPTY local database
npm run db:seed -- --yes-wipe   # Sample data. EMPTIES the tables first; refuses any database not on localhost
node --env-file=.env.local scripts/make-admin.mjs you@example.com   # Make an account that exists an admin
npm run typecheck    # tsc
npm run lint         # ESLint (no `any`), .js import endings, theme colours, the page's inline scripts against the policy
npm run test:unit    # Node's test runner over the pure functions and the generated migrations
bash scripts/ci-local.sh   # What CI's `suites` job runs: an empty local database in, every suite against the built app out
npm run test:ui      # Playwright responsive suite (7 device profiles)
# API suites, local only (they create and remove their own accounts and records):
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/accounts.sh   (also jobs.sh, seeker.sh, admin.sh, industries.sh; email.sh takes OUTBOX and APP_URL too)
#   DB=postgresql://... bash tests/api/loader.sh   (the employer loader; needs only the database)
node scripts/build-employers-sql.mjs --check data/employers/*.json   # Validate the research files; writes no SQL
node scripts/build-taxonomy-sql.mjs --check   # Validate the skill taxonomy against the catalogue; writes no SQL
node scripts/fetch-logos.mjs --sheet out.html   # Fetch marks for new domains and write a sheet to look at
node scripts/geo/build-reference.mjs --fetch   # Reduce the Census reference files into data/
DATABASE_URL=... node scripts/geo/assign-keys.mjs --fetch   # Counties from coordinates: a dry run; --apply writes
```
