# Bringing in data in bulk

How a mass source becomes companies and plants in the database, with where
each fact came from, and how employers' public postings become jobs. There
are two paths for plants today, and the second is where everything is headed:

- **Research files** (a few hundred curated employers and plants): the
  contract and the employer loader, below. They ship as generated migrations
  inside the site's deploy.
- **Large sources** (tens of thousands of records and up): the intake
  pipeline, next. It runs outside the deploy, keeps what each source said,
  and can be rehearsed and undone.
- **Employers' job postings** come in through the same runner, as sources of
  jobs: "Employers' job postings", below.

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
| `record_merges` | Merge history: which record was merged into which, when, by an admin, a research file, a cleanup migration or a run (`via`: `admin`, `loader`, `cleanup`, `run`). `record_now(kind, id)` follows it, so an id that pointed at a merged record still resolves; `GET /api/factories/<old id>` answers with a redirect to the plant kept. |
| `fact_sources` | For each plant and fact (`industry`, `address`, `city`, `zip`, `coordinates`, `headcount`, `products`, `opened`, `status`): who says so (a source's slug, `admin`, `curated`, or `merged` for a fact taken from a row merged into this one that had no origin on record), their rank, the day the value is for, the run and the source record that set it. A fact with no row was there before intake. `workforce_source` and `workforce_year` stay what a plant's page shows. |
| `plants_apart` | Pairs of plants an admin said are two plants: never offered as one again, by the cleanup or by Admin Tools. |
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

## Employers' job postings

Jobs come in from employers' own public postings through the same runner, as
sources of kind `job`, one per employer, every day.

```
data/employers/boards.json          one line per employer: company, system, board
        │
scripts/ingest/postings/systems/<system>.mjs   an adapter per hiring system: a board becomes postings
        │      scripts/ingest/postings/fetch.mjs   the one way anything is asked of an employer's site
scripts/ingest/postings/read/                  the reading of a posting (career, level, places, skills, makes, requirements, pay)
        │
scripts/ingest/postings/jobs.mjs    stage ──► intake_records   a kept posting: its id, a hash, what was read from it
                                    resolve ► posting_places    the places that wait for a plant (posting_decide)
                                    apply ──► jobs, job_skills, job_makes, external_references   (posting_apply)
                                              intake_changes, load_log
```

Migration `0054_job_postings.sql` holds the tables and the functions, as 0043
does for plants: the runner orchestrates, the database decides, and Admin
Tools calls the same functions.

### What is kept

- **Only what is ours.** A posting is kept when the reader
  (`postings/read/`, below) says it is one of our careers and it names a US
  city and state. Everything else is counted and let go: it is never a row,
  staged or otherwise. Where the text comes with the listing every posting is
  read once, whole. Where a text costs a request the reader is first asked
  about the title alone (`beforeText` in `jobs.mjs`): a title it keeps, or one
  it reaches for the text of (another name for a career, two careers the same
  words spell), is worth the request; a title it refuses outright is never
  asked about, and neither is one whose line in the listing names a place and
  none in the United States. The reader is given every location line the feed
  has, as one line, and the country as the feed writes it where it gives one.
- **Facts and a link.** For a kept posting staging holds its outside id, a
  hash, and what was read: the title, the location line, the department, the
  address to apply at, when it was posted, and the reading (the career and how
  it was matched, the level, the places, the skills and makes with the
  catalogue's term each was matched on, the requirements, the pay). The
  description's text is in the runner's memory while it is read and nowhere
  else: `payload.text` is a hash of it.
- **What the catalogue lacks.** The reader also gives the tool, machine and
  method words a posting asks for that no skill or make matched. A run counts
  them and keeps the thirty commonest, each with how many postings named it,
  in its own row (`intake_runs.counts.unknown`) and its report, by employer.
  They are staged nowhere and are on no job: it is how the catalogue learns,
  not the employer's wording in bulk.
- **Read and not kept.** A posting whose text was asked for and which was
  then not kept (not ours once read, or at no US place) is noted in
  `posting_passes`: its id, a hash of its line in the listing and the day.
  Its text is not asked for again while that line stands, until the reading
  changes or the adapter's days have passed.
- **A posting is a job**: a row of `jobs` with `source` (the intake source's
  slug) and `source_id` (the posting's id there), `apply_url` the employer's
  page, `created_by` null, no description. `level_word` and `level_rank`,
  `requirements` (one `jsonb` in the reader's words: `yearsMin`, `yearsMax`,
  `education`, `certifications`, `clearance`, `citizenship`, only the keys
  that were said), `last_seen_at`; its skills in `job_skills`, its makes in
  `job_makes`. A shift is stored as it is shown ("Swing shift"). It expires 14
  days after the last complete listing that included it (see "A listing read
  to its end"), so jobs leave the lists by themselves if runs stop. The API
  refuses to edit or delete one (409), and it is not among the jobs a member
  manages.

### The registry

`data/employers/boards.json`: `employers` (a `slug`, the `employer` as its
board calls itself, the `company` exactly as our data names it, `also` for
other companies we list under their own names whose plants the same board
hires for, the `system`, the `board`'s token or address, optionally a
`ceiling` of requests and a `note`) and `leftOut` (the `employer`, `why`:
`refused`, `not verified` or `no adapter`, `what` refused or is missing, and
`when`). Adding an employer is a line.

```bash
node scripts/ingest/postings/registry.mjs --check     # or: node scripts/ingest/run.mjs postings --check
```

holds the file to its shape and fails on a system no adapter reads. An
employer's source is `postings-<slug>`; its ids are kept under
`POSTINGS_<SLUG>` in `external_references`.

### The adapters

One per hiring system. Each gives the board's listing a request at a time
(`async *pages(board, tools, from)`: a page is `{ postings, next }`, `next`
being where the listing carries on, null after the last page) and, where the
list has no text, `text(board, posting)`:

| System | A board is | Requests for a run |
|--------|------------|--------------------|
| `greenhouse`, `lever`, `ashby` | its token | 1: the whole board with text |
| `successfactors` | the address of its feed | 1: every posting with text (John Deere) |
| `jibe` (iCIMS career sites) | the career site's host | 1 per 100 postings, text included |
| `oracle` | `<host>/<site number>` | 1 per 100 postings, then 1 per posting that could be ours and is new or changed |
| `workday` | its address under `/wday/cxs` | 1 per 20 postings (narrowed to the United States where the board offers that filter), then 1 per posting that could be ours and is new or changed |

Plus one request per host per run for its robots file. A run reads each
page's postings, texts included, before it asks for the next page. A posting
whose text costs a request is asked for only when its title could be ours and
its line in the listing (title, places, path) is new or has changed, or its
reading is 30 days old (60 for Workday: `rereadDays`); `--again` reads every
one again (after the reader changed). An adapter decides nothing: a field the
feed states on its own (Lever's and Ashby's pay, a shift, full-time) is
passed as a hint and used where the text says nothing.

### The fetcher's manners

One user agent that says what it is
(`ArchangelPostings/1.0 (+https://www.o-10.com; …)`), no browser imitation,
nothing private. Each host's robots file is read once per run and obeyed (the
group naming us, else `*`; the longest rule wins; a `Crawl-delay` up to 30
seconds is kept, a longer one leaves the employer for a person). A host with
no robots file (any answer but 200, 403, 429 or a server error) is taken to
allow. Requests to one host are at least a second apart: 1.5 for Oracle, two
for Jibe (five where its robots file asks, as Rivian's and Panasonic's do),
four for Workday. An employer has a ceiling of 400 requests a run, and Oracle
of 60 texts a board a run: postings past either wait for the next run, staged
as they were.

**A platform's budget.** Every Workday board is a tenant of one platform, and
the platform turns a busy robot away (it reset the scout after about 870
requests in an hour, and answered 429 to a first request the same day). So
the platform has a budget for the whole run, across all of its boards: 300
requests (`budget` in `systems/workday.mjs`; `--budget <n>` for another
number), four seconds apart, twenty minutes. The boards without a budget are
read first, in the registry's order. Then the budget is spent where it is
most needed (`inTurn` in `jobs.mjs`): a listing an earlier run left cut first,
then a board never listed to its end, then the board whose last complete
listing is oldest; the registry's order settles a tie. A board the budget did
not reach has no run that day and is said in the summary. Listing all twelve
Workday boards is about 930 requests, so in the steady state each is listed
in full every three to four days; while they are first read in, the texts
(about one posting in five could be ours) take most of the budget, and the
first pass over all of them takes about two weeks.

**The stop rule.** A 401, 403 or 429, a challenge page, or a connection reset
ends that employer for the run. It is written to the run (`refused`, with what
refused) and nothing is asked again, with these headers or any others. A 429
or a reset also ends every other employer on that platform for the run. A
site that does not answer, or answers a server error, is `unreachable`: tried
again the next run. A feed whose shape changed is `failed`, for that employer
only, and says what was missing.

### Which plant

`posting_decide`, for each kept posting at each place it names:

1. the place an admin pointed at a plant (`posting_places`);
2. the company's plant in that city and state. "The company" is the registry's
   company and `also`, found by exact name or other name in any letter case,
   and the companies recorded as parts of them; the job is filed under the
   company the plant is filed under;
3. of several there: the one whose street address the posting's words carry,
   else the one whose name they carry (the words of the plant's name that are
   not the company's, the city's or generic), else the one with the most
   people. With none of those to choose by, the order the plant merge keeps a
   row in (`plant_keeps`): the plant written from sources, then the one placed
   in a county, then the one with more facts, then the older (the id settles
   what is left), so the choice is the same every run. That last case is
   marked for a look, and its `load_log` line says how the plant was chosen.
   The posting's words are what staging keeps: its title, location line,
   street address and department;
4. none in that city: the company's nearest plant in the state within 10 km of
   the city's centre, the centre being the middle of every plant we list there
   (no outside geocoder). Marked for a look;
5. none: the posting waits, and its place goes on the list an admin sees. A
   plant is never added and a state is never guessed.

A posting at several places is a job at each place that has a plant. One
outside id is one job: `<posting id>@<place key>`.

### A listing read to its end

A posting is gone only against a listing that was read to its end
(`counts.complete` on the run). A listing that was refused part way, that
stopped answering, or that the budget or a ceiling cut is no evidence of what
it did not list: what it did list is staged and its jobs are added and
corrected, but nothing is marked gone, no job is closed, and no job's last
sighting is moved. This holds for every system (`tests/api/postings.sh`
refuses a two-page board on its second page, twice, and nothing closes). A
run that listed nothing at all is `refused`, `unreachable` or `failed` and
stages nothing.

Where the system allows it (Workday: an offset), a listing that was cut is
taken up at the next run where it stopped, two pages back, so that postings
which left since do not hide the ones that followed them. Where it stopped
and the ids of ours it had shown are kept on the cut run
(`counts.resume = { next, seen }`); the run that reaches the end counts as
present everything the listing showed over all of its runs. Any other system
starts its listing again.

A job from a source expires 14 days after the last complete listing that
included it. Fourteen because a board on a budgeted platform is listed in
full every three to four days once it is read in, and about every two weeks
while all of them are first read in: an expiry shorter than the slowest cycle
would take a job off the lists between two listings that both had it. The
other boards are listed in full daily, so for them 14 days is how long jobs
stay if runs stop altogether.

### The life of a posting

A posting that changed is read again and its job corrected. One that is
missing from a complete listing is marked; when the next complete listing
still does not have it, its job is closed (`closed_reason`: "No longer on the
company's careers site"); if it returns, the job reopens. A posting that no
longer names a place closes the job there at once. A job is never deleted by
a run. A job that is as it should be is not written, except for the day it
was last seen, which a complete listing moves once a day.

`undo <run>` takes a run back, newest first: a job it added is removed (closed
instead, if anyone applied), a job it changed, closed or reopened is put back
as it was, staging, the notes of postings read and not kept, and the waiting
list are put back as they stood. With every run undone and the source
forgotten, every table is as it was (`tests/api/postings.sh` compares them
all).

### Running it

```bash
node scripts/ingest/run.mjs postings --check                  # the registry alone
node scripts/ingest/run.mjs fetch postings-spacex             # read one board and count; no database
node scripts/ingest/run.mjs rehearse postings-spacex          # everything, rolled back
node scripts/ingest/run.mjs postings --rehearse               # every employer, rolled back
node scripts/ingest/run.mjs postings [--only spacex,boeing]   # every employer, one run each
node scripts/ingest/run.mjs report 31 --all
node scripts/ingest/run.mjs undo 31
```

Behind a proxy, Node's fetch needs `NODE_USE_ENV_PROXY=1`. `--feeds
http://127.0.0.1:<port>` sends every request to a local server standing in for
the feeds (`tests/api/postings/feeds.mjs --dir <folder>`), for the suite and
for runs over saved boards; `--registry <file.json>` is another registry,
`--budget <n>` another budget for a platform that has one.

`postings` ends with what the run did as a whole: its requests by platform
(against the budget where there is one), the boards listed in full, the ones
cut short and why (and whether each is taken up there or started again), and
the ones the budget did not reach; then a line per employer and each run's
report. A day's run of every employer is under half an hour: twenty minutes
of it is Workday's budget, about four are Oracle's texts while those boards
are first read in, a minute and a half the two Jibe sites, and the rest
seconds.

**On production** the workflow `.github/workflows/postings.yml` runs every
employer daily (09:23 UTC) and by hand, against `INGEST_DATABASE_URL`, and
keeps the report as an artifact. Without the secret it says so and ends
green. A refusal or a site that does not answer is recorded and is not a red
run; a changed feed is. Admin Tools, Data shows each employer's latest run
(read, kept, new, changed, closed, waiting; what refused; a listing read in
part) and "Postings
with no plant": point a place at a plant and every posting naming it becomes a
job there at once, or leave it.

`tests/unit/postings.unit.ts` checks the registry, the fetcher against a
local server that plays each refusal, a platform's budget, a listing cut and
taken up again, and every adapter against a reduced copy of what its system
answered (`tests/fixtures/postings/`); `tests/api/postings.sh` runs made-up
boards, written as an employer writes a posting, through all of it with the
reader that ships.

### One row for one plant

Two rows can turn out to be one plant: two spellings of one registry
record, a plant a source and a research file both described. Merging them is
the database's own work (`scripts/plant-merge.sql`, in migration 0051), so a
migration, Admin Tools and a run do it by one rule.

- `plant_keeps(a, b)` says which row stays: the one written from sources
  (`curated`); else the one with a headcount; else the one placed in a county
  (its coordinates agree with its state); else the one with more facts filled
  in; else the older; else the lower id. Its name is the name that stays.
- `plant_merge(keep, gone, via, actor, load, why, look, run, evidence)` folds
  one row into the other. The kept row keeps its name, company, place and
  every fact it has, and takes the other's where its own are empty: address
  (also over a post office box, unless the kept row is curated), city, ZIP,
  industry name and code, people with their year, source and note, what it
  makes, year opened (`plant_merge_takes` lists them). Never a fact an admin
  emptied, and never the status: every row has one. It is curated if either
  was. Each fact's `fact_sources` row follows the fact. Jobs, careers recorded
  at the plant, citations, outside ids, staged records, matches waiting in the
  queue and what an admin said the plant is not all move; an id both rows
  carried is held once and is no longer marked `duplicate`. It writes
  `record_merges` and one `load_log` line (which row was kept and why, what was
  taken, what moved). It refuses a curated plant merged into one that is not
  (`PM409`): that merge is made the other way round. A request to add a plant
  names a company and a place, never a plant row, so there is nothing of
  theirs to move.
- A run does not merge plants yet: `undo` has no way to bring a merged row
  back. When it does, it calls this function with `via => 'run'`.

**The cleanup** (`migrations/0051_plant_duplicates.sql`, load
`plant-duplicates`) is generated by `scripts/build-duplicates-sql.mjs` from
`plant-merge.sql`, the employer loader and `scripts/plant-duplicates.sql`. It
names no id: it finds every outside id more than one live plant carries and
decides pair by pair, in SQL, on the database it runs on. A pair is merged
when it is certainly one plant *and* certainly one company; anything else is
left for a person, with the reason.

*One plant*, in this order: within 5 km and the street addresses agree; within
5 km and the names are one name; within 100 m; within 1.5 km when one name
says only the company and the place; further than 5 km (one row's coordinates
are wrong) only when the street addresses agree exactly and the names do not
disagree, and that merge is marked for a look. Never rows filed under two
states, and never two rows both written from sources.

*One company*: the same row; or two rows whose names are the same but for
legal endings, one being known by the other's name, or the same words but for
abbreviation, plural, spacing and punctuation ("A & L Labs", "A & L
Laboratories"); or one recorded as part of the other; or one whose name begins
with the other's ("Bunge", "Bunge Oils") unless both have a profile of their
own. The merged plant is filed under the company a curated row was written
under, else the part before its parent, else the one with a profile, else the
one with more plants. A company row of the same name left with nothing (no
plants, people, jobs, requests, domain, featured flag, description,
headquarters, headcounts, citations, parts) is merged in by the loader's
company merge, its name kept as another name; any other row left without
plants is said so and left.

*Named for.* Two companies that nothing on record ties together are still
settled in one case: the plant is certain by an address or a name (never by
nearness or a shared spot alone), and both rows' names begin with the name of
one of the two companies and not the other's ("AMSTED RAIL CO INC" under
Amsted Rail and under Amsted Industries). The plant is filed under the
company it is named for, which is the loader's own rule for a stranger's row
that names a company. Never when both companies have a profile; never when
the company that would be left has a profile and the named one has none (a
plant is not taken off a profiled company's page onto a bare row); and never
when a row written from sources stands under the other company. Every such
merge is marked for a look (`evidence.company = 'named for'`), and the other
company row is left exactly as it is, said so when it is left without plants.

Any other rows under two companies that nothing ties together (a predecessor
and a successor, a joint venture and a parent, a landlord and a tenant) are
never merged, however plainly the plant is one: which company it belongs to
is for a person.

Then plants of one company on one spot (coordinates equal to three decimal
places) with no id in common: merged only when the names are the same plant by
the loader's own rule (`el_bare`) and the street addresses do not disagree.
Two buildings of one site stay two rows. References to a plant that no longer
exists are removed (one whose plant was merged follows it). The two steps
repeat until a pass merges nothing, so a second application changes nothing
and writes nothing.

Reading it: `SELECT * FROM load_log WHERE load = 'plant-duplicates' AND look`
(merges across two company rows or placed far apart, company rows merged or
left without plants, every pair left for review, the summary). The pairs left
are listed in Admin Tools, Data, "Plants listed twice"
(`GET /api/admin/plants/pairs?list=id`): Merge, with the row to keep chosen
there, or Two plants. The quality table's Duplicates count opens the plants
of one company on one spot the same way (`list=spot&state=TX`).

Rehearse it on a copy of production before it ships, and again whenever the
rules change:

```bash
node scripts/build-duplicates-sql.mjs --rehearse --out rehearsal.sql   # --all for every line
```

Run `rehearsal.sql` all at once on one connection. It does the whole cleanup,
returns the summary and the lines marked for a look, and undoes everything
before it returns. Changing a rule is a change to `scripts/plant-duplicates.sql`
and, once 0051 has been applied to production, a new generated migration
(`--out migrations/00NN_....sql`): the cleanup is safe to run again.
`tests/api/dupes.sh` checks the merge, the cleanup on rows shaped like
production's, and the Admin Tools routes; `tests/unit/dupes.unit.ts` that the
migration is what the three files build.

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
  are ready for them; two plant rows are merged by `plant_merge`, above);
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

## Reading a posting (`postings/read/`)

An employer's job posting is read by rules over the curated vocabulary in `data/` and nothing else: no network, no file after the vocabulary is loaded, no clock, no model. A run is cheap, repeatable and every match says what it matched on.

```js
import { loadVocabulary, readPosting } from './postings/read/index.mjs';
const vocab = loadVocabulary(root);               // once per run: careers, their names and paths, skills, makes
const reading = readPosting({ employer, title, location, department, text }, vocab);   // text: HTML or plain
// { career: { title, how: 'title' | 'other name' | 'close', matched } | null,
//   level: { word, rank: 1..4 } | null, places: [{ city, state }],
//   skills: [{ name, on }], makes: [{ skill, make, on }],
//   requirements: { yearsMin, yearsMax, education, certifications, clearance, citizenship, shift, employmentType },
//   pay: { min, max, period: 'hour' | 'year' } | null, unknown: [{ phrase }] }
```

`career` is null when the posting is not one of the careers, and then nothing else is read: four postings in five are refused on their title alone. 9,215 postings read in under four seconds on one core.

**What it knows, and where.** Careers, their former titles and other names: `data/careers/catalogue.json` (`title`, `was`) and `aliases.json`. Paths: `data/careers/paths.json`. Skills, their other names and tools: `data/skills/catalogue.json`; groups: `taxonomy.json`; makes: `makes.json`. A name the reader should know is added there, never in the reader. What the reader holds itself is how English and postings work: level and shift words, job words ("technician", "engineer"), words that say nothing ("manufacturing", "process"), the fields that are not ours (software, finance), headings, state names, certificates, and a short list of three-letter codes that also mean something else.

**The career** (`title.mjs`, `career.mjs`, `decide.mjs`). A wrong career is worse than a missed posting.
- The title is cut into parts at dashes, commas, colons and brackets; level, shift, employment words, requisition codes and aircraft designations are set aside. A part that holds a job word is the job; the others are a site, a programme or a team.
- A part is a career when its words are a career's title or another name (`how: 'title' | 'other name'`); when a name ends it and the words before it leave it what it is, or a name opens it with a word or two after; when it is a name said backwards ("Technician, Composites"); with "technician" for "mechanic"; or with a skill's short name spelled out ("AFP Operator"). These are `'close'`.
- Refused on the title: managers, supervisors, directors, leads, interns, students, recruiters, buyers, planners; any title that names software, IT, data, security, sales, finance, EHS or construction; a word that changes the job before the name ("Field", "Service", "Supplier").
- A name that ends in no job word ("welding", "CNC", "quality assurance") is for search, not for titles. An initialism ("Assembly ME") counts only if the text spells the career out.
- A one-word name ("operator", "mechanic") matches only alone or after a plain word ("Production"); machinist, welder and electrician stay themselves after anything. A title that opens with "Systems", "Process", "Product", "Design" takes no word before it: a "Fluid Systems Engineer" is not a systems engineer.
- **The text can refuse.** Another name made only of words any job could carry ("manufacturing specialist", "design engineer", "mechanic") needs two skills of the career's path in the text (three for an engineer); a former title needs one; an engineer's title with words around it needs one. A skill most careers share counts half. In a software department, or under a text full of software's words, two path skills are needed whatever the title.
- **Two careers.** Where the same words spell two careers ("Test Automation Engineer", "Assembler / Machine Operator", "Reliability Engineer" beside "Product Reliability Engineer"), the one whose path's skills the text names is taken, with at least two more than the other; where it is even the answer is null.

**Skills and makes** (`text.mjs`, `vocabulary.mjs`, `skills.mjs`).
- The text becomes lines, each knowing its part of the posting (duties, required, preferred, about, benefits, legal, physical); an unbroken paragraph is cut at its inline headings. Only lines that ask for something are read.
- A skill is found by its name or another name; by its name without its tail ("Torque Wrench Use" as "torque wrenches", "CNC Milling" as "CNC mills"); by a code ("GD&T", "5S"); and, only on the matched career's path or with a second tool of the same skill, by a tool. Words are compared whole, with plurals and -ing set aside, and written together or apart ("lock-out / tag out"). No term runs across a comma.
- A short code needs a neighbour: two letters ("UT", "PT") a word of the same kind in the same line; three letters the skill's long form, its place on the career's path, another skill of its category, or a posting that names two other skills of the catalogue; the codes that are also something else ("SPI", "CIP", "DOE") another skill of their own group.
- A term several skills share ("PLC", "CAD", "FMEA") goes to the one the posting also names, else the one on the path, else the first of one group, else nowhere.
- A make is written as its maker writes it and is not the employer's own name. It goes to its skill the posting names (the same line first), else to its one skill on the career's path, else nowhere; an everyday word or a few capitals ("Star", "NI") only beside its skill.
- `unknown` holds up to eight codes and names per posting that nothing matched, from requirement lines: the catalogue's next pass.

**Facts** (`facts.mjs`). Places from the location field in each feed's form ("Bastrop, TX", "US-TX-Austin", "United States-Utah-Salt Lake City", "City, Region, CC, postcode"); the text only when the field is empty; remote and abroad are no place. Years: the first requirement stated, a range as min and max. Education: the least that qualifies. Certificates by name (NADCAP is a company's, not a person's). Clearance by the level named. A U.S. citizen where citizenship is required; a U.S. person where the export rules are cited. Pay as dollars and a period; where a band is given per level the title's level picks it, and with no level the span.

**Measured.** `tests/fixtures/postings/gold.json` is 480 hand-labelled postings (half a naive word match would keep, half it would refuse), in reduced form: title, department, location, a few lines, the labels. Half was tuned on; half was not looked at until the reader was done. `tests/unit/postings-read.unit.ts` holds the figures as a floor and names every trap. The figures and what is still missed are in the round's report; the short of it, on the held-out half: no wrong career among 54 kept, nothing kept of 127 that are plainly not ours, three in four of ours kept, and of the skills read 87 in 100 are ones the labelled lines ask for (93 in 100 judged by hand on the whole text).

**Known limits.** "Amsterdam, NH" reads as New Hampshire: a feed that gives a country should pass it in `location`. A title a career has no name for is refused: the list of names to add is the way to raise what is kept. An alias that is an everyday phrase ("Injection Molding", "Electrical Design") is matched wherever it is written.
