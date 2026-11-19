# Bringing in data in bulk

How a mass source becomes companies and plants in the database, with where
each fact came from. One path, whatever the source:

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

An **adapter** is a script that reads one source's download and writes
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
| **OSHA Injury Tracking Application, Form 300A summaries** (osha.gov/Establishment-Specific-Injury-and-Illness-Data) | A headcount for about 300,000 establishments a year: the "annual average number of employees" each reports, with name, address, NAICS and year. The research files in this folder took most of their figures from it by hand. | Yes: one CSV per year, public domain | The best next adapter. Self-reported, covers the whole establishment (offices included), and has no coordinates: match on company and address, geocode what is new. Load as `employees` with the OSHA page as the source and the establishment row named in `employeesNote`. |
| **EPA Facility Registry Service** (national combined file) and **ECHO exporter** | Names, addresses, coordinates and NAICS for regulated sites. The 47,590 plants came from it; `external_references` keeps each plant's registry id. | Yes: zip downloads, public domain | Use to refresh coordinates and industry codes and to find plants opened since the first import, not to add headcounts (it has none). `scripts/enrich-naics.mjs` already reads ECHO. |
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
