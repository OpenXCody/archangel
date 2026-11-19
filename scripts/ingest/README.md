# Bringing in data in bulk

How a mass source becomes companies and plants in the database, with where
each fact came from. There are two paths today, and the second is where
everything is headed:

- **Research files** (a few hundred curated employers and plants): the
  contract and the employer loader, below. They ship as generated migrations
  inside the site's deploy.
- **Large sources** (tens of thousands of records and up): the intake
  pipeline, next. It runs outside the deploy, keeps what each source said,
  and can be rehearsed and undone.

## Large sources: the intake pipeline

```
a source's download ──► scripts/ingest/sources/<slug>.mjs   (an adapter: reads, decides nothing)
                                   │
        scripts/ingest/run.mjs  stage ──► intake_records   what the source said, one row per record
                                resolve ─► intake_links     which of our plants each record is
                                   │       intake_review    the ones a person must decide (Admin Tools, Data)
                                apply ───► factories        facts, by one rule (intake_fact_wins)
                                           external_references   the source's id against our record
                                           fact_sources          where each fact came from
                                           intake_changes        before and after: how a run is undone
                                           load_log              one line per decision
```

Migration `0043_intake.sql` holds the tables and the functions that write a
record onto a plant. The runner orchestrates; the database decides, so the
runner and Admin Tools cannot disagree.

### The tables

| Table | What it holds |
|-------|---------------|
| `intake_sources` | A source, written from its adapter each time it is staged: slug, name, publisher, where it comes from, its terms in a line, how it is fetched, and its settings (below). |
| `intake_runs` | One load: start, end, state (`staging`, `staged`, `resolved`, `applying`, `applied`, `undone`), the file it read with its SHA-256 and size, its counts and the seconds each stage took. |
| `intake_records` | Raw staging, keyed by (source, the source's own id): `payload` (the source's own columns, as it said them), `facts` (the adapter's reading, in the words below), a hash, and the run that first saw it, last saw it change, and found it gone. Written only by `stage`. |
| `intake_links` | One short row beside each staged record: our record, how it was found (`id`, `matched`, `added`; `review`, `held` and `new` have none yet), the run that decided, the plants an admin said it is not, and the version of the record last applied. The view `intake_staged` reads the two as one. |
| `external_references` | **The crosswalk.** A source's id names at most one of our records of a kind: `external_refs_identity_key` is unique on (source, entity_type, external_id), which is also the index a lookup by (source, id) uses. A record can carry many sources' ids. Rows with source `CURATED` are citations, not ids, and stand outside the rule. A second row found carrying an id when the rule was made is marked `duplicate`: two of our rows for one outside thing. |
| `record_merges` | Merge history: which record was merged into which, when, by an admin, a research file or a run. `record_now(kind, id)` follows it, so an id that pointed at a merged record still resolves. |
| `fact_sources` | For each plant and fact (`industry`, `address`, `city`, `zip`, `coordinates`, `headcount`, `products`, `opened`, `status`): who says so (a source's slug, `admin`, `curated`), their rank, the day the value is for, the run and the source record that set it. A fact with no row was there before intake. `workforce_source` and `workforce_year` stay what a plant's page shows. |
| `intake_changes` | What a run changed, one row per change with the values before and after. It is how `undo` works and the history behind `fact_sources`. |
| `intake_review` | A record that may be one of our plants, waiting for a person: the reason, and up to three candidates with the rule that found each and the distance. |
| `load_log` | Still the one home for decisions. A run's lines carry `run_id`, `source_id`, `entity_id` and `evidence`; the employer loader's lines have none of those. |

### The life of a run

1. **fetch** downloads the source's file to a folder outside the repository
   (one request; a refusal is reported, never worked around) and notes beside
   it when it was fetched and the day the source published it.
2. **stage** reads the file once, in a stream. A source read by id
   (`scope: 'known'`) keeps only the records whose id we already hold and
   counts the rest under labels its adapter gives ("manufacturing, active").
   What is kept is compared with staging by hash (`diffRun`): new, changed,
   the same, back, gone. Only new and changed records are sent, by `COPY`, in
   batches of 5,000, each its own transaction; unchanged records are not
   touched. Staging the same file again takes up an unfinished run. No table
   the site reads is written.
3. **resolve** decides which plant each record is. It writes the links, the
   queue and `load_log`: still nothing the site reads.
4. **apply** writes: plants to add (a source that adds), then each record's
   id and facts through `intake_apply_record`, 1,000 records to a
   transaction, so plants are never locked for long. It applies only records
   not yet applied in their present version, which is also what makes an
   apply that stopped safe to start again. A run never deletes a plant or a
   company.
5. **undo** takes a run back, newest run first: each fact is restored where
   the plant still has the value the run gave it (one changed since is kept
   and listed), ids the run wrote are taken back, plants and companies it
   added are removed when nothing has been hung on them, what it queued is
   withdrawn. The run stays in the list, `undone`.

`rehearse` does 2 to 4 inside one transaction, prints the report and rolls
back: the database is exactly as it was. Because that is one transaction,
plants it would change stay locked against other writers for its length
(about a minute for the EPA file); readers are not held up.

### Matching

In order, for each staged record:

1. **By id.** The crosswalk has the source's id for one of our plants: that
   plant, or the one it was merged into.
2. **By rule**, for the rest: the employer loader's own rules through its own
   functions (`pg_temp.el_bare`, `el_words`, `el_share`, `el_refers`,
   `el_metres`, loaded from `scripts/employers-loader.sql`). A company is
   found by exact name or other name, in any letter case. A plant is a
   candidate when it is the company's (or its parent's, or a part of it) with
   the same name within 5 km, a shared telling word within 3 km, or anything
   within 1.5 km; or anyone's within 250 m whose name names the company or
   the site. A record that names no company is known by its own name and
   place: the same name within 5 km, a shared word within 250 m.
   - **Taken**: the best candidate, when the loader would not have marked it
     for a look, no other candidate fits as well, and no other record of the
     run fits the same plant. The id is written when the run is applied.
   - **Queued**: anything the loader would have marked (filed under another
     company or the parent, already described under another name, names with
     nothing in common, far apart), two that fit equally, or two records for
     one plant. It waits in Admin Tools with the reason and the evidence.
   - **No candidate**: held, or added as a new plant, as the source's
     `unmatched` says. Never added: a record with no name, company, state or
     coordinates, Puerto Rico, construction materials (`NOT_COVERED`).
3. A plant that already carries another id of the same source is never a
   candidate, and neither is one an admin said the record is not.

Not carried over from the loader, because they need the whole research file:
`sameAs` and `isNew` from the corrections, "the company's only plant in the
city", moving a plant from one company to another, and merging company rows.
A queue item is where those cases go instead.

### Which value wins

`intake_fact_wins`, one function, in this order:

1. A value an admin typed is never replaced, even when the admin emptied it.
2. An empty fact is filled.
3. A source whose `fill` is `empty` stops there.
4. Otherwise the higher rank wins; at the same rank, the value for the later
   day.

Ranks run 1 to 99: a source has one (`rank`) and may differ by fact
(`ranks: { headcount: 70 }`). An admin's value is 100. A fact with no
`fact_sources` row counts as 80 on a curated plant and 10 on any other.
Admin edits write `fact_sources` (`server/lib/provenance.ts`), and the
migration reads the audit log for the edits made before it existed.

### An adapter

`scripts/ingest/sources/<slug>.mjs` exports:

```js
export const source = { slug, name, publisher, url, terms, howFetched, kind: 'factory',
  refSource,            // the name its ids are kept under in external_references.source
  scope: 'known'|'all', // stage only records whose id we hold, or every record
  unmatched: 'hold'|'add', fill: 'empty'|'ranked', rank, ranks };
export const version = 1;        // raise it when the reading changes: every record is read again
export async function* rows(file) {}   // the file's rows, streamed
export function idOf(row) {}           // the source's own id, or null
export function classify(row) {}       // labels a row we do not stage is counted under
export async function read(row, { asOf }) { return { id, payload, facts }; }
export async function fetchFile({ dir, log }) {}   // optional
export async function asOfFile(file) {}            // the day the file is for
```

`facts` may carry: `name`, `company`, `address`, `city`, `state`, `zip`,
`latitude`, `longitude` (as text), `naics`, `industry` (one of the 21 names),
`industryNote` (why the record offers no industry: logged, nothing written),
`people`, `peopleYear`, `peopleSource`, `peopleNote`, `products`, `opened`,
`status`, `url` (the record at the source) and `asOf`. Anything else is kept
with the record and ignored. An adapter decides nothing about the database.

### The EPA ECHO Exporter (`epa-echo`)

The first source. One zip from `echo.epa.gov/files/echodownloads/`, about
450 MB (2.2 GB as one CSV, 3.2 million facilities), refreshed weekly. EPA data
is in the public domain; no key or login; `robots.txt` allows the folder and
asks for 10 seconds between requests, and a fetch is one request. Most of our
plants came from this registry and carry its id (`EPA_ECHO`), so it is read
by id (`scope: 'known'`), fills only what a plant lacks (`fill: 'empty'`) and
adds nothing (`unmatched: 'hold'`).

The industry code written is chosen from the codes the registry lists (in
number order, not importance): only manufacturing codes the product covers
count; the industry most of them name wins, a tie going to the lower number;
within it the first six-digit code. A plant whose record has no usable code
gets none, and a line says why: no code, only codes outside manufacturing, or
construction materials.

### Running it

```bash
node scripts/ingest/run.mjs list
node scripts/ingest/run.mjs fetch epa-echo --to /tmp/epa            # behind a proxy: NODE_USE_ENV_PROXY=1
node scripts/ingest/run.mjs rehearse epa-echo /tmp/epa/echo_exporter.zip
node scripts/ingest/run.mjs load epa-echo /tmp/epa/echo_exporter.zip   # stage, resolve, apply
node scripts/ingest/run.mjs report 12 --all
node scripts/ingest/run.mjs undo 12
```

It reads `DATABASE_URL`, says what it is about to do, and refuses a database
that is not on this machine unless `--yes-this-database <host>` names its
host. `stage`, `resolve <run>` and `apply <run>` run the steps one at a time;
`resolve --again` reconsiders records an earlier run held; `apply --all`
writes every record again after a rule or a rank changed; `forget <source>`
removes a source that has no applied run. Reading needs `unzip` on the PATH.

**On production**, nobody's laptop is involved: the workflow
`.github/workflows/ingest.yml` is started by hand (GitHub, Actions, Ingest,
Run workflow) with a source and a mode (`rehearse`, `apply`, or `undo` with a
run's number), runs the runner against the database named by the repository
secret `INGEST_DATABASE_URL`, and keeps the report as the run's artifact. It
does nothing on a push. Rehearse first and read the report.

`tests/unit/intake.unit.ts` checks the parts that need no database;
`tests/api/intake.sh` runs a made-up source through all of it on a local
database, compares every table before and after, and decides its queue
through the API.

### The research files through this pipeline

`data/employers/*.json` would be a source like any other: an adapter whose
`rows` are the plants of a file (company fields carried on each), `idOf` the
file's name with the company and plant (`texas-electronics/Samsung Austin
Semiconductor/Samsung Austin Semiconductor`), `scope: 'all'`,
`unmatched: 'add'`, `fill: 'ranked'`, rank 80. What has to be built first:

- company facts (aliases, domain, description, headquarters, parent, people
  by state): `intake_apply_record` writes plant facts only;
- the loader's company merge and its move of a plant between companies, as
  decisions a run can make and undo (`record_merges` and `intake_changes`
  are ready for them);
- `corrections.json` (`sameAs`, `isNew`, `setAside`) read by the adapter, so
  a correction becomes a fact on the record instead of an edit to the SQL;
- `curated = true` and the `CURATED` citations, set when a record's source is
  a research file.

Until then the next research file loads as the last did: the steps below.

## Research files: the contract and the employer loader

```
a source's download            scripts/ingest/<source>.mjs (an adapter)
        │                                  │
        └──────────────►  data/employers/<brief>.json   (the contract, below)
                                           │      + data/employers/corrections.json
                          scripts/build-employers-sql.mjs
                                           │
                     a rehearsal on a copy of production  ──►  read it
                                           │
                          migrations/00NN_<name>.sql  (in scripts/migrate.mjs)
```

An **adapter** here is a script that reads one source's download and writes
contract-shaped JSON. It decides nothing about the database. Everything that
depends on what the database already holds (is this company there under
another name, is this plant that row) is decided by the loader's SQL when it
runs, because production cannot be seen from here.

Statistics that are not about one company or plant (employment in an industry
in a county, pay for a career) do not go through the contract: their adapter
writes rows for a table of their own, as a generated migration
(`scripts/ingest/qcew.mjs` is the first).

## The contract

One JSON file per source or research brief, in `data/employers/`.

```json
{
  "brief": "texas-electronics",
  "retrieved": "2026-11-18",
  "source": { "name": "…", "publisher": "…", "url": "https://…", "licence": "…" },
  "companies": [
    {
      "name": "Samsung Austin Semiconductor",
      "alsoKnownAs": ["Samsung Austin Semiconductor LLC"],
      "parent": "Samsung Electronics",
      "domain": "samsung.com",
      "industry": "Semiconductors",
      "description": "Makes logic chips for phones, cars and computers.",
      "headquarters": { "city": "Austin", "state": "TX", "country": "US" },
      "stateEmployees": { "state": "TX", "count": 4500, "year": 2024, "source": "https://…", "note": null },
      "sources": ["https://…"],
      "plants": [
        {
          "name": "Samsung Austin Semiconductor",
          "city": "Austin", "state": "TX", "address": "12100 Samsung Blvd", "zip": "78754",
          "latitude": 30.37324, "longitude": -97.63608,
          "subsector": "Computer and Electronic Product Manufacturing", "naics": "334413",
          "products": "Logic chips on 200 mm and 300 mm wafers",
          "employees": 4500, "employeesYear": 2024, "employeesSource": "https://…", "employeesNote": null,
          "opened": 1997, "status": "operating",
          "sources": ["https://…"]
        }
      ]
    }
  ]
}
```

- **Nothing is invented.** A figure with no source is `null`. A headcount
  needs `employeesSource` (the loader drops one without) and should carry its
  year; it is the people working at that site, never a company total divided
  up.
- `name` is how a person says it ("Lockheed Martin", not "LOCKHEED MARTIN
  CORP"). A subsidiary that hires under its own name is its own company with
  `parent` set.
- `alsoKnownAs` are the **exact** names the company may already be stored
  under. They find and merge rows, so a name that belongs to a different
  company must not be listed.
- A plant needs `name`, `city`, `state`, numeric `latitude` and `longitude`
  (of the plant, not the town) and a `subsector`, one of the 21 in
  `SUBSECTORS` (`scripts/build-employers-sql.mjs`). `status` is `operating`,
  `under construction`, `announced` or `closed`; the last two are not loaded.
- Not loaded either, and logged as such: a plant in Puerto Rico, and
  construction materials, which are not manufacturing here (NAICS 32732
  ready-mix, 32733 concrete pipe, brick and block, 32739 other concrete
  products, and 324121 asphalt paving mixtures: `NOT_COVERED`). A cement
  plant (32731) is loaded. Both were taken off the map and do not come back through a
  file.
- Anything else in a file (a `rank`, notes, `unplaced`) is for people and is
  left behind.
- `source` (file level) says what the file was made from: name, publisher,
  address, licence. A research brief may leave it out; an adapter never does.

## Corrections

`data/employers/corrections.json` is laid over the files when the SQL is
built, so a file can be delivered again without losing them. Keyed by the
company's name in the file; every entry says `why`.

| Key | What it does |
|-----|--------------|
| `addAlsoKnownAs`, `dropAlsoKnownAs` | names to add to or take out of `alsoKnownAs` |
| `setAside: [{ name, withPlant, renameTo }]` | a different company that has one of this company's names is renamed (it is known by one of its plants) |
| `rename`, `set` | the name to load it under; company fields to replace |
| `dropPlants` | plants to leave out |
| `plants: { "<plant>": { … } }` | plant fields to replace; `sameAs` names the existing plant this one is (its exact name, within 25 km); `isNew: true` says no existing plant is this one |

## What the loader decides (scripts/employers-loader.sql)

**Company.** Found by exact name, in any letter case: its name or one of its
`alsoKnownAs`, against a row's name or a row's `aliases`. Rows found under
several names are merged into one (plants, jobs, members, requests, sources
move), named as the file names it, the other names kept as aliases. Created
when there is none. Never a partial or similar name; and a name that is
another company or a parent in any research file is never used as an alias,
whatever a file says. Then: domain (kept when the row has one), industry and
description (the fuller of the two), headquarters, parent (created bare when
missing), a slug, people in a state, sources. It becomes a featured employer
when it has a profile (a web domain or a description); a company a file only
names is loaded and left unfeatured.

**Plant.** Candidates, best first; a row is taken by one plant per file:

1. the row the corrections name (`sameAs`);
2. a row of the company (or its parent, or a company that is part of it)
   with the same name, within 5 km;
3. one whose name shares a telling word ("Giga", "Refinery"), within 3 km;
4. any other row of the company within 1.5 km (an already curated plant only
   when its name does not mark it as another unit of the site);
5. a row of any other company within 250 m whose name names this company or
   this site;
6. when the file has one plant of the company in a city: a bare row of the
   company in that city within 3.5 km.

Otherwise the plant is inserted. A row found under the parent or an unrelated
company moves to the company. The first time a row is curated the file's
facts replace what it had; after that each fact keeps the fuller of the two
(a value over none, the newer headcount, the longer text), so two files that
describe one plant leave the same row whichever loads first. Finally, plants
filed under a parent whose names begin with the company's name move to it.

Every decision is a line in `load_log` (`look = true` on the ones worth
reading: merges, moves, matches far off, inserts beside another plant or far
from any).

## Adding a source, step by step

1. Write the adapter (or the research file) and put its output in
   `data/employers/`. Record the source in the file.
2. `node scripts/build-employers-sql.mjs --check data/employers/*.json`
   Fix what it says: values of the wrong shape, a name listed as another name
   for a company of its own, one plant in two files.
3. Rehearse on a copy of production (a Neon branch):
   `node scripts/build-employers-sql.mjs --rehearse --schema migrations/0030_depth_and_provenance.sql --out rehearsal.sql data/employers/<file>.json`
   Run `rehearsal.sql` all at once on one connection. It does the whole load,
   returns a summary and the decisions to read, and undoes everything before
   it returns: the database is as it was, committed or rolled back. `--all`
   lists every decision. `--schema` is for a copy that does not yet have a
   schema migration the loader needs; leave it out otherwise.
4. Read the report. A wrong merge is an entry in `corrections.json`
   (`dropAlsoKnownAs`); a company left split shows under "similar"
   (`addAlsoKnownAs`); a plant inserted beside the row that is it takes
   `sameAs`. Rehearse again.
5. `node scripts/build-employers-sql.mjs --out migrations/00NN_<name>.sql data/employers/<file>.json`,
   add the file to the list in `scripts/migrate.mjs`, and run
   `DB=… bash tests/api/loader.sh`.

A fact already loaded is corrected in Admin Tools or by a cleanup migration,
not by loading the file again: a second load keeps the fuller fact.

## Sources worth doing next

Checked on 2026-11-18 from a script behind a proxy (no browser).

| Source | What it would add | Reachable | Notes |
|--------|-------------------|-----------|-------|
| **OSHA Injury Tracking Application, Form 300A summaries** (osha.gov/Establishment-Specific-Injury-and-Illness-Data) | A headcount for about 300,000 establishments a year: the "annual average number of employees" each reports, with name, address, NAICS and year. The research files in this folder took most of their figures from it by hand. | Yes: one CSV per year, public domain | The best next adapter for the intake pipeline (`fill: 'ranked'`, a rank for `headcount` above the registry's). Self-reported, covers the whole establishment (offices included), and has no coordinates: it needs a match on company and address, which the matcher does not have yet, and a geocoder for what is new. |
| **EPA Facility Registry Service** (national combined file) and **ECHO exporter** | Names, addresses, coordinates and NAICS for regulated sites. Most plants came from it; `external_references` keeps each plant's registry id. | Yes: zip downloads, public domain | **Done for the ECHO Exporter**: the `epa-echo` source of the intake pipeline, above, which replaces `scripts/enrich-naics.mjs`. It fills industry codes on plants we hold; the manufacturing facilities it lists that we do not are counted in every run's report and not added. |
| **EPA Toxics Release Inventory**, basic data files | What a plant handles and releases, by chemical and year, keyed by the same registry id | Yes: one CSV per year (about 60 MB), public domain | Says what is made only indirectly. Worth a table of its own (plant, year, chemical, pounds) rather than the contract. |
| **State WARN notices** (Texas Workforce Commission) | Layoffs and closures by site, with the number of people: a check on a headcount and the way to learn a plant has closed | Not by script: the page answers 202 with no body (a browser check) | Download the spreadsheet by hand into `data/`, then an adapter. Covers only sites that cut 50 or more jobs. |
| **Economic development lists** (the governor's office, regional and city corporations' major-employer tables) | Headcounts by site, as the region states them | Pages reachable; each is its own format | Research briefs, as now, rather than adapters: there is no common shape. |
| **BLS Occupational Employment and Wage Statistics** | Pay for a career, nationally and by state and metro area | The files answer 403 to a script; the public API (api.bls.gov) answers | Belongs on careers, in a table keyed by O*NET/SOC code and area, not in the contract. Download the yearly file by hand, or page the API (registration lifts its daily limit). |
| **Census County Business Patterns** | Establishments by size class and employment by industry and county | Yes: zip per year, public domain | Context for an industry in a place; the same kind of table as the industry employment statistics. Joins on `county_fips`. |
| **QCEW by county and industry** (the files the adapter already reads, one per subsector) | People, establishments and pay for each of the 21 industries in each county | The files are the documented open-data ones, but see the note under the adapter | 21 times the rows of the county file, a large share withheld. `industry_county_stats` already takes them (`industry_code` a subsector). |

## Official statistics: the QCEW adapter

How many people work in an industry is not a fact about one company or plant,
so it does not go through the contract. Its path:

```
data.bls.gov (one CSV per industry, per year)
        │      scripts/ingest/qcew.mjs
data/industries/qcew-<year>.json
        │      scripts/build-industry-stats-sql.mjs   (+ data/industries/industries.json)
migrations/00NN_industry_stats.sql  (in scripts/migrate.mjs)   ──►   industry_profiles, industry_stats
```

**The adapter** (`scripts/ingest/qcew.mjs`) reads the Bureau of Labor
Statistics' Quarterly Census of Employment and Wages: open data, no key.
(Checked 2026-11-19: `data.bls.gov/robots.txt` disallows everything to every
robot, and `www.bls.gov` answered a script 403, so the Bureau's own page on
these files, which presents them as made for programs to read, could not be
read again to settle it. The 2025 county figures were therefore built with
`--from`, out of the file fetched on 2026-11-18, with no new request. Whether
the adapter may fetch by itself is the owner's call: until it is made,
download the files in a browser and use `--from`.)

- `node scripts/ingest/qcew.mjs` takes the latest complete year: it starts at
  last year and walks back, three years at most. `--year 2025` names the year.
  `--from <dir>` reads files already downloaded (`<dir>/<code>.csv`, with
  `31_33.csv` for manufacturing as a whole) instead of fetching them, and
  `--retrieved 2026-11-18` says which day that was. Behind a proxy, Node's
  fetch needs `NODE_USE_ENV_PROXY=1`.
- The file for manufacturing as a whole also holds every county, so the same
  run writes `data/industries/qcew-<year>-counties.json`: manufacturing as a
  whole in each county (`county` is the five-digit FIPS code), the same three
  figures, a withheld one `null`. Nothing by industry at county level yet.
  `--counties-only` writes only that file and needs only `31_33.csv`. It
  reaches the database through `scripts/build-geo-sql.mjs` (below).
- It reads one file per industry: the 21 subsectors listed in
  `data/industries/industries.json`, and `31-33` for manufacturing as a whole.
  From each it keeps the private-sector annual averages, all establishment
  sizes, for the nation (`US`) and for each state the app knows:
  `establishments`, `employment` and `avgAnnualPay` (dollars).
- A figure the Bureau withheld is `null`, never zero.
- A year is complete when the nation's figure is published and at least 50
  of the state rows (the states and the District of Columbia) are there. An
  industry with no file or no national row for that year stops the run.
- It writes `data/industries/qcew-<year>.json`: the source, the year and the
  day it was retrieved, then one row per line, so a later year's file diffs
  against this one. It touches no database.

**The builder** (`scripts/build-industry-stats-sql.mjs`) turns the industries
file and one year's statistics into one migration:

```bash
node scripts/build-industry-stats-sql.mjs data/industries/industries.json data/industries/qcew-<year>.json migrations/00NN_industry_stats.sql
```

- Each industry's name and sentence go into `industry_profiles`; the figures
  go into `industry_stats`, keyed by state, industry and year, with the
  source's name and address on every row.
- It refuses statistics for an industry that is not listed, a state that is
  not a two-letter code or `US`, and a file that names no year.
- The migration is safe to run again and deletes nothing. Another year is a
  new JSON file and a new generated migration, added to the list in
  `scripts/migrate.mjs`; the year before stays in the table.

`tests/unit/industries.unit.ts` checks the adapter's reading and the stored
file; `tests/api/industries.sh` checks the pages that read the tables.

## Geography and industry keys

A plant joins to public statistics through four keys on its row
(`factories`, migration 0044): `lat` and `lng` (its coordinates as numbers),
`county_fips`, `cbsa_code` (its metro area) and `naics` (a clean six-digit
2022 code). Behind them are four small reference tables.

```
census.gov (county list, metro delineation, NAICS 2022 and its concordances)
        │      scripts/geo/build-reference.mjs        downloads stay outside the repository
data/geo/counties.json, data/geo/metros.json,
data/industries/naics-2022.json, data/industries/naics-concordance.json
        │      scripts/build-geo-sql.mjs   (+ scripts/geo/keys-schema.sql, data/industries/qcew-<year>-counties.json)
migrations/0044_geo_keys.sql   ──►   counties, metros, naics, naics_concordance, industry_county_stats, the columns on factories

census.gov (county boundaries, 1:500,000; kept outside the repository)
        │      scripts/geo/assign-keys.mjs   against a database, outside the build
factories.county_fips, factories.cbsa_code   (and naics, brought up to date)
```

**The reference lists.** `node scripts/geo/build-reference.mjs --fetch`
downloads the Census Bureau's files into the system's temporary folder
(`--dir <folder>` names another; without `--fetch` it reads what is there) and
writes the four JSON files, each with its sources and the day they were
retrieved. What it keeps:

- `counties.json`: every county and county equivalent of the 50 states and
  the District of Columbia (3,144; Connecticut as its planning regions), with
  its metro area and a point inside it.
- `metros.json`: the metropolitan and micropolitan areas those counties are in.
- `naics-2022.json`: manufacturing only (31-33), from the sector down to the
  national industry, each code with its parent. The three-digit level is the
  product's 21 industries (a unit check holds the two together).
- `naics-concordance.json`: other forms of a code that mean exactly one 2022
  national industry: a shorter 2022 code with one industry under it, and a
  six-digit code of the 2017, 2012 or 2007 edition that went whole to one
  2022 industry. A code that was split is left out: nothing says which part
  a plant is.

**The migration** is generated: `node scripts/build-geo-sql.mjs --out
migrations/0044_geo_keys.sql` (a unit check fails when the file and the lists
disagree). It adds the tables and columns, loads the lists, loads one year of
county statistics, and brings every plant's `naics` up to date in one
statement. A later year of county statistics alone is `--stats-only
data/industries/qcew-<year>-counties.json --out migrations/00NN_....sql`.

**What keeps the keys right.**

- `lat` and `lng` are generated columns: the database computes them from the
  text `latitude` and `longitude` the app reads and writes, so no write path
  can leave them behind. Text that is not a plain number, or not a latitude
  or longitude, gives NULL.
- `naics` follows `primary_naics` by a trigger (`factories_keys`):
  `naics_2022(stored)` is the code itself when it is a 2022 national
  industry, else what the concordance says, else NULL. `primary_naics` is
  never changed.
- `county_fips` and `cbsa_code` are written by the script below. The same
  trigger clears them when a plant's coordinates change (unless the same
  statement sets them), so a plant that moved has no county rather than its
  old one until the next run.

**The county script.**

```bash
DATABASE_URL=... node scripts/geo/assign-keys.mjs --fetch            # says what it would write
DATABASE_URL=... node scripts/geo/assign-keys.mjs --apply            # writes
DATABASE_URL=... node scripts/geo/assign-keys.mjs --apply --remote --report keys.json   # a database not on this machine
```

- It reads every plant, finds the county its coordinates fall in (point in
  polygon against the Bureau's boundary file, with a grid so each point is
  tried against two or three counties, not 3,200: `scripts/geo/lib/locate.mjs`)
  and writes only the rows whose keys would change. A run after a run writes
  nothing; a plant added, moved or corrected since the last run is picked up.
  44,279 plants are located in under a second.
- Before anything is written the boundary file is checked against the county
  list: every listed county must be drawn, and must hold its own inside point.
- `--boundaries <zip>` names the file; otherwise it is looked for in the
  system's temporary folder and downloaded there with `--fetch`. It is never
  committed.
- A database that is not on this machine is refused without `--remote`.
  Without `--apply` nothing is written.
- A point in no county but within 2 km of one (`--near-km`) is given to the
  nearest: the boundaries are drawn at the shoreline, and a plant on a pier
  is still in its county. These are counted apart.
- Left without a county, and listed (`--report <file>` writes every one):
  coordinates that are not usable numbers; a point outside every county; a
  point in a county the product does not cover; and a point in a county of
  another state than the one the plant is filed under. In the last case one
  of the two is wrong, usually the state (a river town filed under the state
  across the river), and the list says how far the point is from the stored
  state. Correct the plant in Admin Tools; the next run places it.
- A plant filed under no state is placed by its coordinates alone and listed:
  its county says which state it is in.
- It also runs the `naics` statement, so a change to the reference tables
  reaches the plants, and lists the stored codes that are not one industry.

New and edited plants get their county on the next run, not at write time:
the boundaries are a 12 MB file that does not belong in the website's
function. Run the script after every load that adds or moves plants (it is
written to be a step of the intake runner) and after a batch of corrections.

`tests/unit/geo.unit.ts` checks the geometry (inside, outside, on a border,
holes, islands, Alaska across the 180th meridian, just offshore), the
readers, the lists, the roll-up and the migration; `tests/api/industries.sh`
checks the keys and the county's figures; `tests/api/admin.sh` checks the
quality table (`GET /api/admin/quality`) that counts how many plants have
each key.
