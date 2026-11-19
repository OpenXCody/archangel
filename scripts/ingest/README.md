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
| **Census County Business Patterns** | Establishments by size class and employment by industry and county | Yes: zip per year, public domain | Context for an industry in a place; the same kind of table as the industry employment statistics. |
