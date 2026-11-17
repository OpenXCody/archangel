# Archangel

A workforce map of US manufacturing, live at [o-10.com](https://www.o-10.com).

People explore **Companies → Factories → Jobs → Careers → Skills** on a map and through pages for each. A career has a path of skills in three stages. Someone looking for work marks the skills they have, sees which careers are within reach, and applies to jobs. A company's people post jobs and read applicants. Admins look after accounts and data. The whole country is covered; Austin, TX is the first area being filled out in depth.

React, TypeScript, Vite and Tailwind in `client/`; Express and Drizzle in `server/`; PostgreSQL. `CLAUDE.md` describes how the code is laid out and the rules it follows.

## Run it locally

You need Node 20 or later (`.nvmrc`) and PostgreSQL 14 or later, with `psql` on the PATH.

1. Install and configure.

   ```bash
   npm ci
   cp .env.example .env.local     # then set DATABASE_URL and VITE_MAP_TOKEN
   ```

   Use a local database or your own Neon branch, never production's. Without a MapTiler key the map draws on a plain canvas.

2. Create the database: an empty one, then its schema and sample data (142 companies, about 450 factories, careers and skills).

   ```bash
   set -a; source .env.local; set +a      # puts DATABASE_URL in this shell
   createdb archangel                      # the database DATABASE_URL names
   npm run db:create -- --sample
   ```

   `db:create` builds the schema from nothing: migrations 0000 to 0009 (they predate the migration runner), then the runner's. With `--sample` it then loads the sample data and applies the runner's migrations a second time, because the curated lists in them (career paths, company profiles) match records by name. It refuses a database that already has tables, and `--sample` refuses one that is not on localhost. Without `--sample` you get the empty schema.

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
| Static | `npm run typecheck` and `npm run lint` | Types; ESLint with no `any`; `.js` endings on server imports; colours from theme tokens only |
| Unit | `npm run test:unit` | The pure functions: pins packed and unpacked, names, industries, paging, when a build migrates |
| API | `bash tests/api/accounts.sh`, `jobs.sh`, `seeker.sh`, `admin.sh`, `email.sh` | Accounts, roles, invites, records, jobs, applications, reach, and the email and notices people get, end to end over HTTP, including every refusal |
| Pages | `npm run test:ui` | Playwright: the map, Explore, jobs, sign-in, each kind of record's page and search, on seven device sizes, with no sideways scroll and no crash |

The API suites are local only. They need the dev server running against a database with data in it, and `psql`, `curl` and `node` on the PATH; they create and remove their own accounts and records.

```bash
API=http://localhost:3000/api DB="$DATABASE_URL" bash tests/api/accounts.sh
```

`email.sh` also needs the API to be capturing mail: start it with `EMAIL_OUTBOX=<file>` and give the script the same file as `OUTBOX`.

`npm run test:ui` uses the dev server that is running (`BASE_URL` points it at another copy); `npm run test:ui:install` fetches the browser once.

CI (`.github/workflows/ci.yml`) runs the static checks in one job and everything else in another, which is one script you can run yourself. Given an empty database on this machine it runs the unit checks, builds the schema from nothing, loads the sample data, builds the app, starts the API and the built page, and runs the five API suites and the device suite:

```bash
createdb archangel_ci
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/archangel_ci bash scripts/ci-local.sh
```

A new dependency is proven with a clean install: `npm ci` in a fresh copy of the tree, then `npm run build`. Vercel installs from the lockfile only.

## How data gets in

There is no upload screen. Data arrives three ways.

- **Factories and their companies, in bulk**, from the Pillar database (facilities matched across public sources). `server/scripts/import-pillar-bulk.ts` reads Pillar and writes here: it skips facilities already imported (by EPA registry id), reuses a company that exists under the same normalised name or alias, and can be run again safely.

  ```bash
  DATABASE_URL=postgresql://...          # this app's database (the destination)
  PILLAR_DATABASE_URL=postgresql://...   # Pillar (the source)
  IMPORT_LIMIT=50000                     # most rows to pull (default 50000)
  IMPORT_MIN_CONFIDENCE=60               # lowest match confidence to accept (default 60)
  npx tsx server/scripts/import-pillar-bulk.ts
  ```

  `scripts/enrich-naics.mjs` then fills in missing industry codes from EPA's public export (a dry run unless `--apply` is given; its header says how).

- **Curated lists**, as generated migrations. Career paths (`data/paths/*.json`), company profiles (`data/companies/profiles.json`) and the careers typical of each industry (`data/careers/industries.json`) are edited as JSON. A `scripts/build-*-sql.mjs` script turns a file into one idempotent SQL migration, which is added to the list in `scripts/migrate.mjs` and so ships with the next deploy:

  ```bash
  node scripts/build-paths-sql.mjs data/paths/technical-core-3.json migrations/00NN_career_paths.sql
  ```

  The generated SQL matches records by exact name, creates no companies or careers, and never overwrites a value set by hand or a path a person has approved.

- **One record at a time**, by an admin: Admin Tools → Data → Add a record (a company, factory, career or skill). The same tab sets a company's logo domain, featured flag, industry and description, and approves draft career paths.

## Logos

A company's logo is found from its website domain (`companies.domain`). The marks for the curated domains are stored in `client/public/logos/` and listed in `client/src/lib/logos.json`, so the page shows them from this site, and shows the lettermark, with no request, for a domain known to have no usable mark. Only a domain that is not in the list (one an admin has just set) is looked up from Google's favicon service. After adding domains to `data/companies/profiles.json`:

```bash
node scripts/fetch-logos.mjs     # needs curl and ImageMagick; look at what it brings in before committing
```

## Deploying

Vercel builds the `main` branch. The build command is `npm run build`. On Vercel's production build (`VERCEL_ENV=production`) it first applies any migration not yet recorded (`scripts/migrate.mjs`), then type-checks and builds the page. A failing migration fails the build, and the previous deployment stays live. Any other build (a preview, your machine, CI) leaves the database alone even when it can see one; there, `npm run db:migrate` applies migrations on purpose. The API is one serverless function (`api/index.ts`) serving the same Express app as local development; `vercel.json` routes `/api/*` to it and sets cache lifetimes.

Production needs two settings: `DATABASE_URL` and `VITE_MAP_TOKEN`.

`vercel.json` also sets the security headers, among them the page's Content-Security-Policy. It names everything the page loads: this site, MapTiler, the favicon service. A new outside host has to be added there or the browser will refuse it. The two inline scripts in `client/index.html` are allowed by their hash; `npm run lint` fails when a script and the policy disagree, and prints the hashes to use.

A migration that removes something is applied before the new code is live, so for the minute or two a build takes the previous deployment runs against the new schema. Remove the code that reads a table in one deploy and the table in the next when that matters.
