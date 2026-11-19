# Archangel

A workforce map of US manufacturing, live at [o-10.com](https://www.o-10.com).

People explore **Industries → Companies → Plants → Jobs → Careers → Skills** on a map and through pages for each. Every skill sits in a group inside a domain and has one level: Fundamentals, Intermediate or Advanced. A career's path is its skills laid out by those levels. All of the skills are drawn as one radial tree, the Atlas of Manufacturing (`/atlas`), which a career can be laid over. Someone looking for work marks the skills they have, sees which careers are within reach, and applies to jobs. A company's people post jobs and read applicants. Admins look after accounts and data. The whole country is covered; Austin, TX is the first area being filled out in depth.

React, TypeScript, Vite and Tailwind in `client/`; Express and Drizzle in `server/`; PostgreSQL. `CLAUDE.md` describes how the code is laid out and the rules it follows.

## Run it locally

You need Node 20 or later (`.nvmrc`) and PostgreSQL 14 or later, with `psql` on the PATH.

1. Install and configure.

   ```bash
   npm ci
   cp .env.example .env.local     # then set DATABASE_URL and VITE_MAP_TOKEN
   ```

   Use a local database or your own Neon branch, never production's. Without a MapTiler key the map draws on a plain canvas. Mail is off unless its settings are given (see Email); nothing else needs them.

2. Create the database: an empty one, then its schema and sample data (companies, plants, careers and skills).

   ```bash
   set -a; source .env.local; set +a      # puts DATABASE_URL in this shell
   createdb archangel                      # the database DATABASE_URL names
   npm run db:create -- --sample
   ```

   `db:create` builds the schema from nothing: migrations 0000 to 0009 (they predate the migration runner), then the runner's. With `--sample` it then loads the sample data and applies the runner's migrations a second time, because the curated lists in them (career paths, company profiles, the careers typical of an industry, the skill taxonomy) match records by name. It refuses a database that already has tables, and `--sample` refuses one that is not on localhost. Without `--sample` you get the empty schema. `--sample` ends by giving the sample's made-up companies their versions of a few careers (`server/scripts/seed-versions.ts`), so the version page and the employer's editor have something to show; what a real company runs is only ever said by its own people, in the app.

3. Later, to bring the database up to date with new migrations: `npm run db:migrate`. A build does not do this for you (see Deploying).

4. Start it. The page is on http://localhost:5173 and the API on http://localhost:3000 (`WEB_PORT` and `PORT` change them).

   ```bash
   npm run dev
   ```

5. Make yourself an admin. Sign up in the app, then:

   ```bash
   node --env-file=.env.local scripts/make-admin.mjs you@example.com
   ```

   There is no admin key. This is how the first admin exists, here and in production (run it with production's `DATABASE_URL`); after that, admins make admins from Admin Tools → People.

## Checks

Four kinds. Run all of them before merging.

| Check | Command | What it covers |
|---|---|---|
| Static | `npm run typecheck` and `npm run lint` | Types; ESLint with no `any`; `.js` endings on server imports; colours from theme tokens only; the page's inline scripts against the Content-Security-Policy |
| Unit | `npm run test:unit` | The pure functions: pins packed and unpacked, names, industries and a company's industry, paging, LIKE escaping and reading rows, account purpose and View as, when a build migrates, the statistics adapter, the employer loader's generator, the skill taxonomy's check. Also that the migration list is in order, and that the skills catalogue, the skill taxonomy, the company domains and the stored logos agree with what was generated from them |
| API | `bash tests/api/accounts.sh`, `jobs.sh`, `seeker.sh`, `admin.sh`, `email.sh`, `industries.sh`, `careers.sh`, `versions.sh`, `intake.sh`, `loader.sh`, `catalogue.sh` | Accounts, roles, invites, records, jobs, applications, reach, the industry pages, and the email and notices people get, end to end over HTTP, including every refusal; and the employer loader, research files in, companies and plants out |
| Pages | `npm run test:ui` | Playwright: the map, Explore and its tabs, the header, jobs, sign-in, settings signed out, each kind of record's page, the industry pages, search, the tools a seeker and an employer are each given, a read that gets no answer giving up, and an admin's change reaching the map's panel, on seven device sizes, with no sideways scroll and no crash |

The API suites are local only. They need the dev server running against a database with data in it, and `psql`, `curl` and `node` on the PATH; they create and remove their own accounts and records. `loader.sh` and `catalogue.sh` are the exceptions: they need only the database (`DB`), not the server. What the suites share (one request, a check, the refusal of an API that is not on this machine) is in `tests/api/lib.sh`.

```bash
API=http://localhost:3000/api DB="$DATABASE_URL" bash tests/api/accounts.sh
```

`email.sh` also needs the API to be capturing mail: start it with `EMAIL_OUTBOX=<file>` and give the script the same file as `OUTBOX`, and the same `APP_URL` if the API was given one. `seeker.sh` takes `OUTBOX` too, and skips its email check without it.

`npm run test:ui` uses the dev server that is running (`BASE_URL` points it at another copy); `npm run test:ui:install` fetches the browser once.

CI (`.github/workflows/ci.yml`) runs the static checks in one job and everything else in another, which is one script you can run yourself. Given an empty database on this machine it runs the unit checks, builds the schema from nothing, loads the sample data, builds the app, starts the API and the built page, and runs the seven suites in `tests/api/` and the device suite:

```bash
createdb archangel_ci
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/archangel_ci bash scripts/ci-local.sh
```

A new dependency is proven with a clean install: `npm ci` in a fresh copy of the tree, then `npm run build`. Vercel installs from the lockfile only.

## How data gets in

There is no upload screen. Data arrives five ways. The scripts are in two folders: `server/scripts/*.ts` run under tsx and may import from `server/` and `shared/`; `scripts/*.mjs` are plain Node, import nothing from either, and run without a build (`migrate.mjs` runs inside Vercel's build).

- **Factories and their companies, in bulk**, from the Pillar database (facilities matched across public sources). `server/scripts/import-pillar-bulk.ts` reads Pillar and writes here: it skips facilities already imported (by EPA registry id), reuses a company that exists under the same normalised name or alias, and can be run again safely.

  ```bash
  DATABASE_URL=postgresql://...          # this app's database (the destination)
  PILLAR_DATABASE_URL=postgresql://...   # Pillar (the source)
  IMPORT_LIMIT=50000                     # most rows to pull (default 50000)
  IMPORT_MIN_CONFIDENCE=60               # lowest match confidence to accept (default 60)
  npx tsx server/scripts/import-pillar-bulk.ts
  ```

  `scripts/enrich-naics.mjs` filled in missing industry codes from EPA's public export; the intake runner's `epa-echo` source below replaces it.

- **Large public sources**, through the intake runner, outside the deploy: `scripts/ingest/run.mjs` stages what a source says, decides which plant each record is (by the source's own id first), writes ids and facts by rank, and can take a run back. A rehearsal does the whole run in a transaction that is rolled back and prints what it would do.

  ```bash
  node scripts/ingest/run.mjs list
  node scripts/ingest/run.mjs fetch epa-echo                 # one open download from the EPA
  node scripts/ingest/run.mjs rehearse epa-echo <file>       # writes nothing
  node scripts/ingest/run.mjs load epa-echo <file>           # stage, resolve, apply
  node scripts/ingest/run.mjs undo epa-echo <run>
  ```

  On production it is run by hand from GitHub: add the repository secret `INGEST_DATABASE_URL` (Settings, Secrets and variables, Actions) with the production connection string, then Actions, Ingest, Run workflow, with the source and the mode (`rehearse`, then `apply`; `undo` with the run's number). The report is the run's artifact. Matches a run was not sure of wait in Admin Tools, Data. After a load that adds or moves plants, run the same workflow with the source `counties` (`scripts/geo/assign-keys.mjs`: each plant's county and metro area from its coordinates; `rehearse` says what it would write, `apply` writes). `scripts/ingest/README.md` has the design and the adapter's contract.

- **Researched employers and plants**, with their sources: how many people work at a plant, what it makes, when it opened, which company a company is part of. Research files in `data/employers/` (and our corrections to them, in `corrections.json`) are turned into one migration by `scripts/build-employers-sql.mjs`. The loader decides in SQL, when the migration is applied, which company and which plant each entry already is, and writes every decision to `load_log`. A new file is checked, then rehearsed on a copy of production, before its migration is generated:

  ```bash
  node scripts/build-employers-sql.mjs --check data/employers/*.json
  node scripts/build-employers-sql.mjs --rehearse --out rehearsal.sql data/employers/<file>.json
  node scripts/build-employers-sql.mjs --out migrations/00NN_<name>.sql data/employers/<file>.json
  ```

  `scripts/ingest/README.md` has the shape a file must have, the corrections, the loader's rules and the steps, and how a rehearsal is run (all at once on one connection; it undoes itself). Construction materials (ready-mix and other concrete products, asphalt paving mixtures) and Puerto Rico are not loaded.

- **Curated lists**, as generated migrations. Each is edited as JSON; a `scripts/build-*-sql.mjs` script turns the file into one idempotent SQL migration, which is added to the list in `scripts/migrate.mjs` and so ships with the next deploy:

  | List | File | Script |
  |---|---|---|
  | Career paths | `data/paths/*.json` | `build-paths-sql.mjs` |
  | Company profiles: domain, featured, description | `data/companies/profiles.json` | `build-company-profiles-sql.mjs`, `build-company-descriptions-sql.mjs` |
  | Web domains for more companies | `data/companies/domains.json`, `data/companies/domains-2.json` | `build-domains-sql.mjs` |
  | Careers, their home domains and ladders | `data/careers/catalogue.json` | `build-careers-sql.mjs` |
  | Careers typical of each industry, and everyday names for careers | `data/careers/industries.json`, `data/careers/aliases.json` | `build-career-lists-sql.mjs` |
  | The skills catalogue | `data/skills/catalogue.json` | `build-skills-sql.mjs` |
  | The skill taxonomy: domains, groups, each skill's group and level | `data/skills/taxonomy.json` | `build-taxonomy-sql.mjs` |
  | Cleanups: records deleted, merged, renamed | `data/cleanup/*.json` | `build-cleanup-sql.mjs` |

  ```bash
  node scripts/build-paths-sql.mjs data/paths/technical-core-3.json migrations/00NN_career_paths.sql
  ```

  The path, profile and domain migrations match records by exact name, create no companies or careers, and never overwrite a value set by hand or a path a person has approved. A migration that has been applied is not edited: a later change is a change to the JSON and a new generated migration.

  The skill taxonomy puts every skill of the catalogue in one group, every group in one domain, and gives every skill one level (1 Fundamentals, 2 Intermediate, 3 Advanced). Edit `data/skills/taxonomy.json`, check it, then regenerate its migration:

  ```bash
  node scripts/build-taxonomy-sql.mjs --check    # validates the file against the catalogue; writes nothing
  node scripts/build-taxonomy-sql.mjs data/skills/taxonomy.json data/skills/catalogue.json migrations/00NN_skill_taxonomy.sql   # a new file once the latest (0049 today) has been applied
  ```

  The check fails unless every skill of the catalogue is placed exactly once, in a group of 2 to 12 skills, at a level of 1, 2 or 3. When it is applied the migration stops, changing nothing, if the skills in the database are not exactly the ones the file places: a skill an admin has added, renamed, merged or deleted is first brought into the catalogue and the taxonomy. A taxonomy change after 0042 has reached production is a new numbered migration: give the builder its output as the third argument, add the file to the list in `scripts/migrate.mjs`, and point `tests/unit/taxonomy.unit.ts` at it.

  The catalogue's builder restates the whole catalogue in a new migration (`node scripts/build-skills-sql.mjs data/skills/catalogue.json migrations/00NN_skills_catalogue.sql`), and the taxonomy's migration must follow it in `scripts/migrate.mjs`. A skill's makes (the named equipment and software it is run on) are in `data/skills/makes.json`: `node scripts/build-makes-sql.mjs --check`, then `node scripts/build-makes-sql.mjs data/skills/makes.json data/skills/catalogue.json migrations/00NN_skill_makes.sql`.

  ```bash
  node scripts/build-taxonomy-sql.mjs data/skills/taxonomy.json data/skills/catalogue.json migrations/00NN_skill_taxonomy.sql
  ```

- **Industries and their official statistics.** The 21 industries and a sentence for each are in `data/industries/industries.json`. People employed, establishments and average pay, for the nation and each state, come from the Bureau of Labor Statistics' QCEW: `scripts/ingest/qcew.mjs` downloads a year and writes `data/industries/qcew-<year>.json`, and `scripts/build-industry-stats-sql.mjs` turns both files into a migration. Another year is a new JSON file and a new migration.

  ```bash
  node scripts/ingest/qcew.mjs --year 2025
  node scripts/build-industry-stats-sql.mjs data/industries/industries.json data/industries/qcew-2025.json migrations/00NN_industry_stats.sql
  ```

- **One record at a time**, by an admin: Admin Tools → Data → Records finds a company, plant, career or skill to correct, or adds one (a skill into a group, at a level). The record's editor sets a company's logo domain, featured flag, description, parent and headquarters, and a plant's people, products and opening year; the same tab approves draft career paths.

## Logos

A company's logo is found from its website domain (`companies.domain`). The marks are stored in `client/public/logos/` and listed in `client/src/lib/logos.json`, so the page shows them from this site, and shows the lettermark, with no request, for a domain known to have no usable mark. Only a domain that is not in the list (one an admin has just set) is looked up from Google's favicon service. After adding domains to `data/companies/profiles.json`, `data/companies/domains.json` or `data/employers/`:

```bash
node scripts/fetch-logos.mjs --sheet /tmp/new-logos.html     # needs curl and ImageMagick
```

It tries the company's own site, then Wikimedia, then the icon services, says what it is in every request, and leaves a site that refuses alone. Unattended, it leaves a mark wider than 2 to 1 on the letter. To decide one by hand: `node scripts/fetch-logos.mjs --look a.com --into <folder> --sheet look.html` shows every mark on offer (`--quick` skips Wikimedia); keep one with `--place`, or cut the symbol out of a logo and place that. `--show a.com,b.com --sheet out.html` shows what is stored. Open the sheet and look at every new mark before committing. Refuse a wrong one with `--none <domain> --note "why"`, or place one by hand with `--place <domain>=<file> --note "where it is from"`; both are kept in `data/companies/logo-decisions.json`, and no later run undoes them.

## Deploying

Vercel builds the `main` branch. The build command is `npm run build`. On Vercel's production build (`VERCEL_ENV=production`) it first applies any migration not yet recorded (`scripts/migrate.mjs`), then type-checks and builds the page. A failing migration fails the build, and the previous deployment stays live. Any other build (a preview, your machine, CI) leaves the database alone even when it can see one; there, `npm run db:migrate` applies migrations on purpose. The API is one serverless function (`api/index.ts`) serving the same Express app as local development; `vercel.json` routes `/api/*` to it and sets cache lifetimes.

Production needs two settings: `DATABASE_URL` and `VITE_MAP_TOKEN`. To send mail it needs three more (see Email).

`vercel.json` also sets the security headers, among them the page's Content-Security-Policy. It names everything the page loads: this site, MapTiler, the favicon service. A new outside host has to be added there or the browser will refuse it. The two inline scripts in `client/index.html` are allowed by their hash; `npm run lint` fails when a script and the policy disagree, and prints the hashes to use.

A migration that removes something is applied before the new code is live, so for the minute or two a build takes the previous deployment runs against the new schema. Remove the code that reads a table in one deploy and the table in the next when that matters.

## Email

Mail is on when `RESEND_API_KEY` and `EMAIL_FROM` are both set (Resend's HTTP API; `EMAIL_FROM` is the sender). `APP_URL` is the address every link in an email starts from; without it links start at `https://www.o-10.com`. With mail off nothing is sent, the app works as before, and an admin passes invite and password reset links on by hand.

Outside production, `EMAIL_OUTBOX=<file>` captures each email as one line of JSON in that file instead of sending it, and counts as on. That is how `tests/api/email.sh` and `scripts/ci-local.sh` read what would have been sent.
