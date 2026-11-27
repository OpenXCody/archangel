# BACKLOG

## HOW TO USE
- IDs: B### in rank order as written on 2026-11-27. P0 false, broken or lost; P1 the main promise falls short or the owner has complained of it; P2 friction and inconsistency; P3 polish; widest reach first inside a level. Work top down unless `deps` says otherwise. `grep '^### B' BACKLOG.md` lists the items.
- When an item ships, delete it from this file. Its id is never reused. A new item takes the next free number and is placed by priority.
- Fields: area | kind, reach, verified (yes = the synthesiser re-ran the request or query, or read the code or the screenshot, on 2026-11-27; tester = only the tester saw it) | is (what happens now) | want (a rule that can be checked) | do | check | deps, size (S under an hour of agent work, M a session, L several, XL the owner decides first) | ask (the owner's question; take the default when unanswered) | evidence.
- Evidence: a ref is tester#index, the 0-based index into that tester's `findings` array in $UT/findings.json (672 findings, 19 testers; `jq '.[]|select(.tester=="seeker").findings[4]' findings.json`). Screenshots, outputs and test scripts are under $UT/<tester>/. $UT = /tmp/claude-0/-home-user-archangel/728f945c-8fb4-575f-b9ba-13d011704fd5/scratchpad/ut (a scratchpad that can be cleared: copy what an item needs).
- Tested 2026-11-26 and 27: main at fa17dcc (PR #95) built for production, as three local instances over a copy of production's data (43,132 factories; 28,038 company rows, 27,902 listed; 231 civilian and 118 military careers; 1,284 open jobs, every one from a careers site). The repository has since moved to ea73bd5 (PR #96, the Atlas wheel).
- Reproduce locally: page :5900, API :3900, database archangel_ut (visitors, seekers; counts in items are from it unless said); :5910, :3910, archangel_ut2 (hiring); :5920, :3920, archangel_ut3 (Admin Tools; testers changed it: a test company was merged into U.S. Navy there). Postgres 127.0.0.1:5432, postgres/postgres. Nothing here was checked against production or GitHub.
- Before starting an item, re-read its `is` against the code: four builds are in flight (IN FLIGHT below) and the career page's and Skills list's skills are being redrawn as a connector tree in /home/user/wt-tree.
- The owner's direction of 2026-11-26 outranks any item's wording: standard names in the product's own words; a career is a template with a range of skills, and a job or a company's variant is its own combination (a job's page must not present the whole path as the job's requirements); no levelling system yet; collect postings before consolidating into standards; new jobs from Texas only, the largest Texas employers first, machines, transportation and industrial equipment before food; the product's own sector tags in place of government industry categories; no janitorial or food-prep work; no filler text; nothing said twice.
- CLAUDE.md binds every item (words, colour tokens, one order for companies). Data changes are a change to a file in data/ and a new generated migration (next free number after 0083), checked, rehearsed on a copy of production, never an edit to an applied migration.
- This file is the record: edit it by hand. $UT/_synth/ holds the item sources and build.py it was first assembled from; do not regenerate over later edits.
- Accounting: 672 findings = 616 under 143 items + 54 under in-flight checks + 2 dropped. Items by level: P0 10, P1 35, P2 76, P3 22.

## IN FLIGHT
Each build is not in what was tested. The checks are to be made when it lands; a finding a tester tagged with a build that the build does not cover is an item, named under the build.

### job-names
- build: a job from a careers site is named by its career alone, not the employer's title; a job's page names the factory without repeating the company; places always read "City, ST"; four careers (Sanitation Technician, Meat Cutter, Slaughterer, Baker) and janitorial titles leave
- check: No list, page, panel, search row or email shows an employer's raw title. Look for: "John Deere Harvester Works - Production Welder", "Quality Control Inspector I NV - Assembly NCR, Days M/Tu/Sa/Su & M/Tu/Su 6:30am to 7:15pm", "Pipe Welder, Stage 0 Ground Fabriciation (Starship)", "General Machinist - N0309 South", "Sr. CNC Machinist | 5-Axis | Fanuc | Swing Shift", "OFP Quality Engineer - Weld" on /jobs, the map panels (titles were cut at 360 px), company, factory, career, skill and industry pages, the header search, a job's "More ... jobs" rows. A job page's title, company tag and factory tag no longer say the company three times; the note "This job comes from X's careers site ..." is B014's. evidence: visitor-map#19, visitor-explore#17, visitor-records#22, seeker#27, layout-keyboard#18, gap-conditions#41, gap-jobs-search-memory#28, gap-admin-queues-editors#37, speed-words#30, employer#19, admin#38
- check: The factory's tag does not repeat the company ("Dal-Tile" beside "Dal-Tile Corp Dallas Manufacturing"; "Caterpillar" beside "Caterpillar Work Tools Waco Facility"; "Lone Star Lathe Works Austin"), on hand-posted jobs too. When a job is named by its career, the career tag under the title must not say the same word again ("Facilities Engineer" title over a "Facilities Engineer" tag). evidence: account#34, gap-hiring-scale#35, gap-applicant#23
- check: Every place beside a job reads "City, ST": no "John Deere Kernersville · Kernersville", "Starbase · Starbase", "East Moline", "Boeing · HAZELWOOD, MO", "MCHENRY MS", "Mchenry", "North Charleston" with no state; a factory's own page does not repeat its city on every job row. Check also the two places job-names may not reach: the new-applicant email ("(WACO, TX)", server/lib/notices.ts:380) and GET /api/me/applications city ('WACO'), and the header search's job rows; what is left goes to B020. evidence: visitor-records#21, layout-keyboard#17, veteran#28, speed-words#20, gap-admin-people-layout#28, gap-breakage#27, gap-jobs-search-memory#17, gap-jobs-search-memory#27, gap-applicant#13
- check: A job's factory is not shown by a registry legal name: "Anduril Industries Inc · Costa Mesa, CA" (418 of 1,284 open jobs sit on such rows: Anduril Costa Mesa 287, Ashville 46, McHenry 21; Northrop Grumman Salt Lake City and Iuka; SpaceX Bloomfield; Caterpillar Peoria); /jobs?plant=<id> reads "287 open jobs at Anduril Industries Inc" with no place. If job-names only hides the company's name, the rows still need names: B018 step 5. evidence: data-as-shown#13, speed-words#21, gap-jobs-search-memory#6
- check: Sanitation Technician, Meat Cutter, Slaughterer, Baker and janitorial titles are gone from career search ("production" listed Baker and Brewer), the Careers list, industry pages' "Careers in this industry" and the jobs list. evidence: seeker#28
- check: A subsidiary's jobs read with one company name: "John Deere A&I Rock Valley - CNC Machinist" was listed under company "A & I Products" (no slug, no mark) at factory "A&I Products Rock Valley". evidence: gap-addresses-head-industries#34
- not covered by this build, filed as items: B011 (seeker#2, data-as-shown#15); B014 (employer#18); B017 (employer#33, admin#12); B020 (data-as-shown#12, gap-hiring-scale#11); B036 (data-as-shown#14, speed-words#3); B037 (admin#10); B046 (seeker#25, speed-words#24, gap-admin-people-layout#27); B047 (gap-conditions#40); B048 (visitor-map#18); B050 (employer#32); B064 (gap-addresses-head-industries#8); B128 (data-as-shown#21); B129 (gap-addresses-head-industries#23)

### texas-scope
- build: new jobs are ported from Texas only; more large Texas employers are added; food and drink jobs are listed last within a day
- check: Each focus area has open jobs: GET /api/map/areas/houston/overview, .../dfw/overview and .../san-antonio/overview return openJobs above 0 (all three were 0; Austin 162, of which 110 SpaceX Bastrop); /jobs near 77002 within 50 miles is not empty (it was empty at 100 miles); the panels show the Open jobs figure (a panel with none silently dropped the figure: a person could not tell "no jobs" from "not loaded"). evidence: visitor-map#12, seeker#3, gap-conditions#33, veteran#3
- check: The feed is no longer two employers' engineering jobs: 1,069 of 1,284 open jobs were Anduril (549) and SpaceX (520); 160 of 231 careers had no open job; Welder 31, Production Operator 24, Production Assembler 4, MIG Welder, Aircraft Mechanic, Aircraft Engine Mechanic, Shipfitter, Pipefitter and CNC Machine Operator 0. Check the trades a veteran is pointed to (aircraft and ship work) have Texas jobs. Jobs outside Texas (Norfolk, VA had none) stay as they are by the owner's direction: not an item. evidence: data-as-shown#18, veteran#2
- check: The first screen of /jobs is not one employer (14 to 16 of the first 20 rows were John Deere, read on one day); Texas comes first and food and drink last within a day; combine with B035's window rule. evidence: seeker#26, speed-words#22
- check: The largest Texas employers carry what makes them show: Tesla (Giga Texas), Samsung Austin Semiconductor and NXP's Austin fabs had no headcount, Tesla and Samsung no domain or slug; after the build Austin's panel and /industries/electronics?area=austin list them. What it does not fill goes to B003 step 3 and B021. evidence: visitor-explore#2, speed-words#4
- check: The Houston panel's companies are not led by food firms (it listed Frito-Lay, Dessert Holdings, Buckhead Meat & Seafood among its first): confirm whether "machines, transportation and industrial equipment before food" applies to company lists as well as jobs. The panel's county list ("... Chambers, Austin and San Jacinto counties") is B014's. evidence: seeker#35
- not covered by this build, filed as items: B002 (admin#5); B003 (visitor-map#0, data-as-shown#9); B035 (gap-jobs-search-memory#10); B085 (gap-hiring-scale#33)

### sectors
- build: a company's industry label (derived from government codes) is replaced by the product's own sector tags, and the Companies list filters by sector
- check: Labels that read wrong are right: Tesla ("Electrical equipment and appliances"), Northrop Grumman and Raytheon ("Computers and electronics"), SpaceX and Blue Origin ("Transportation equipment"; SpaceX Bastrop "Computers and electronics"), Applied Materials and SLB ("Machinery"), PanTeXas Deterrence ("Chemicals"), Ford ("Electrical equipment and appliances"), Raytheon Tucson ("Transportation equipment"), Goulds Pumps ("Primary metals"), John Deere, Flex; companies with no label (Welderaft, Foodbrands America) get one or consistently none. Look in the Companies list, search rows, overview tiles, company and factory pages, map panels. evidence: visitor-map#20, visitor-explore#20, visitor-records#36, layout-keyboard#47, gap-conditions#42
- check: The map's hover card says what the panel says: it printed the raw "Transportation Equipment Manufacturing" (client/src/components/map/Map.tsx:118 passes properties.industry unshortened). evidence: visitor-map#15
- check: The Companies list narrowed to one sector does not end every row with that sector (narrowed to Food every row ended "· Food"). evidence: visitor-explore#21
- check: Industry pages stop ranking companies by coded industry where that reads wrong: Collins Aerospace as the largest plastics company, Northrop Grumman the largest in fabricated metals, PanTeXas Deterrence in chemicals; misfiled rows as an industry's companies (Advanced Tobacco Products first under Food in San Antonio; Austin Foam Plastics as Austin's only Paper company; Siemens under Primary metals in Austin; Datapoint under Electronics). Decide whether industry pages stay on the 21 codes; raw names there ("Levi Strauss &", "Aviat U.s.") are B006's and B019's. evidence: gap-addresses-head-industries#21, gap-addresses-head-industries#24
- not covered by this build, filed as items: B004 (employer#5); B021 (admin#3); B023 (visitor-map#11, gap-hiring-scale#13); B028 (visitor-map#5, visitor-map#6); B042 (gap-addresses-head-industries#14); B043 (data-as-shown#11); B047 (visitor-records#17); B061 (gap-addresses-head-industries#26); B129 (gap-hiring-scale#14)

### atlas
- build: /atlas is replaced by a new drawing (a wheel with a list beside it); merged to the repository as PR #96 (commit ea73bd5) after the tested build was made, so these can be checked now
- check: With a career laid over (/atlas?career=<id>), the list shows the domains the career reaches, not all 16 with 10 to 13 blank rows; a military career can be laid over and reads its skills by domain. evidence: seeker#36, veteran#29
- check: On a phone the names on the drawing are legible and inside the frame ("Battery and electric drive" ran against the right edge at 10 px) and no descriptive caption sits under it ("Fundamentals sit nearest the centre ..."). evidence: layout-keyboard#44, gap-conditions#45
- check: The Atlas says what its total counts: its domain rows summed to 1,023 while Explore says 966 skills (skills a civilian career uses); see B062. evidence: gap-conditions#39
- check: /atlas?career=nope shows the product's own not-found line, not the raw "Invalid id: expected a UUID", and does not offer "Compare with another career". evidence: gap-addresses-head-industries#29
- not covered by this build, filed as items: B014 (visitor-explore#28)

## ITEMS

### B001 P0 Show a job's own skills, not the career's whole path
- area: jobs
- kind: data   reach: every job page from a careers site (1,284 of 1,284 open jobs; path.of='career' on all). Mean 20 skills listed, 19.7% of them named by the posting; 52 jobs name 0 and 154 name 1 of the 12-24 listed.   verified: yes
- is: /jobs/john-deere/welder/40990 lists the Welder career's 20 skills (MIG, Stick, Flux-Cored, TIG, Pipe, Stainless, Aluminum, Welder Performance Qualification, Destructive Weld Testing ...) under "Skills" with "What the career takes: the path of Welder. The posting names 1 of these 20."; the posting's own job_skills is ['Forklift Operation']. 40863 names MIG Welding + Forklift Operation, and Robotic Arc Welding sits apart under "Also named in the posting". A seeker's "You hold 11 of 20" is measured against the career, so an electron-beam welding job (40099) reads as half held. Same on every career: Process Engineer at Anduril (40417) lists Wet End Chemistry Control, Distillation Column Operation, cGMP; Facilities Engineer at John Deere lists Ultrapure Water, Ammonia Refrigeration. Cause: readJobPath (server/routes/jobs.ts:209-265) sets onPath = routeOf(occupation) for a sourced job whose company has no version.
- want: A job's Skills section is the job's own combination and nothing else (owner, Nov 26: a career is a template with a range of skills; a job is its own combination). Rule: for a job with fromSource and no company version, path.skills = exactly the skills the posting names (job_skills plus the skill of each job_makes row), in routeOrder(); no "Named in the posting" / "Also named" split; no sentence about the career's path; the career's range is one link under the list ("Welder: all 20 skills" to /occupations/<id>#skills). The held figure counts that list only, and is not drawn when the list is empty or nothing is held. No page, email or applicant count presents a skill the posting did not name as the job's.
- do: (1) server/routes/jobs.ts readJobPath: for fromSource without a version return of:'posting', skills = the named set (ownIds + makeSkillIds), alsoNamed = []; add career: { id, title, skillCount } to the answer for the link. Keep of:'version' (the company's own combination, named ones marked) and of:'job'. (2) client/src/components/jobs/JobSkills.tsx: drop the "What the career takes..." sentence and the alsoNamed section; one column of groups (the two-column grid is ragged and leaves holes); the ring line reads the new list; with 0 named skills draw only the link line. (3) tests/api/jobs.sh and tests/api/postings.sh: assert a sourced job's path.skills is a subset of job_skills + make skills. (4) CLAUDE.md "Employers: jobs and applicants": rewrite the paragraph that begins "A job is an opening for a career, so its skills are the career's path". (5) grep for other readers of path.skills / alsoNamed (JobDetail.tsx, emailTemplates.ts) and bring them to the same list.
- check: curl -s localhost:3900/api/jobs/by-number/40863 | jq -r '.path.skills[].name' prints only Forklift Operation, MIG Welding, Robotic Arc Welding; the page /jobs/john-deere/welder/40863 contains none of "Stick Welding", "TIG Welding", "Pipe Welding", "What the career takes"; npm run test:unit and tests/api/jobs.sh pass.
- deps: none (ship first; B012 and B011 then improve what is named; B038 is the same rule for hand-posted jobs)   size: M
- ask: A posting that names 0 skills (52 jobs) or 1 (154): show the short list plus the link to the career, or hide the section? Default: show whatever is named, then the link; never fill from the career.
- evidence: visitor-map#2, visitor-explore#0, visitor-records#0, visitor-records#24, visitor-records#25, seeker#0, seeker#1, account#0, employer#0, admin#1, veteran#4, data-as-shown#0, layout-keyboard#0, layout-keyboard#13, layout-keyboard#14, speed-words#0, speed-words#18, gap-applicant#0, gap-applicant#19, gap-hiring-scale#3, gap-admin-people-layout#8, gap-conditions#0, gap-breakage#26, gap-jobs-search-memory#0, gap-jobs-search-memory#1, gap-addresses-head-industries#0; files: $UT/seeker/12-jd-job-visitor-desk.png, $UT/seeker/27-job-ebw.png, $UT/visitor-records/shots/j-deere-desk.png, $UT/gap-applicant/jd-01-deere-phone-seek.png, $UT/gap-jobs-search-memory/j3-process-engineer.png, $UT/gap-jobs-search-memory/details.json

### B002 P0 Confirm the daily postings run is alive before open jobs expire on Dec 3; flag stale boards in Admin
- area: pipeline
- kind: data   reach: all 1,284 open jobs: in the copy 976 have expires_at 2026-12-03 and 308 have 2026-12-08   verified: yes (database copy archangel_ut; production and GitHub Actions not checked)
- is: in the copy of production, intake_runs holds posting runs for one day only (2026-11-19 16:10-16:15 UTC: 63 applied, 12 failed); open jobs' last_seen_at is Nov 19 (976 jobs, 13 companies) or Nov 24 (308 jobs, 18 companies) and a sourced job expires 14 days after its last complete listing. /admin/activity?view=postings shows every board as "Nov 19" with nothing marking it stale. Four boards fail as "not listed" (Apptronik, Hermeus, Relativity, Rocket Lab); Ford read 901 and kept 0, GE Aerospace 463/0, Texas Instruments 914/0.
- want: either .github/workflows/postings.yml has a green run in the last 24 h that wrote intake_runs rows on production, or its pause is a written decision; Admin Tools marks a board whose latest complete listing is older than 48 h as stale and the index counts it.
- do: (1) GitHub, Actions, "Postings": read the run history since Nov 19; confirm the repository secret INGEST_DATABASE_URL is set (without it the run ends green and does nothing). (2) production, read-only: select source, max(started_at), (array_agg(state order by started_at desc))[1] from intake_runs where source like 'postings-%' group by 1; select expires_at::date, count(*) from jobs where status='open' and source is not null group by 1. (3) if stale and not paused on purpose: Run workflow, mode apply, before 2026-12-03. (4) client/src/components/admin/Postings.tsx: a latest run older than 48 h reads "Last read Nov 19 · stale" in full ink; GET /api/admin/overview gains staleBoards; AdminIndex.tsx prints the count beside Activity. (5) boards read with 0 kept: the run report already lists the titles turned away; feed them to B011.
- check: production query of step 2 shows max(started_at) within 24 h for every board that has an adapter; on a database whose runs are 3 days old /admin/activity?view=postings shows the stale mark and /admin shows the count; tests/api/postings.sh covers staleBoards.
- deps: texas-scope (changes what the runner ports; steps 1-3 regardless)   size: S
- ask: If the run was paused on purpose while texas-scope is built: do the non-Texas jobs expire on Dec 3 and Dec 8, or are they kept alive? Default: run it (jobs already listed stay listed; "Texas only" speaks of new jobs).
- evidence: admin#5; files: $UT/admin/77-activity-postings.png

### B003 P0 Stop presenting partial headcount sums as a company's people or as the order of largest employers
- area: data
- kind: data   reach: every list of companies (Companies list, Explore overview, map state/area/place panels, industry pages, search ties); 664 of 43,132 factories carry workforce_size   verified: yes
- is: companyStandings/byCompanyStanding (server/lib/industries.ts) rank by the sum of recorded headcounts, unknown last. Tesla = 183 people (1 of 7 factories: the Robstown lithium refinery; Giga Texas is null), Ball 236 (1 of 86), International Paper 225 (2 of 48), Tyson Foods 876 (1 of 49); 3M (0 of 134) and Lockheed Martin (0 of 126) rank nowhere. GET /api/map/areas/austin/overview topCompanies: Applied Materials 4,462, Flex 3,532, SpaceX 1,486, Saronic 879 ...: no Tesla, no Samsung Austin Semiconductor. DFW: no Lockheed Martin, no Bell. San Antonio: no Toyota. A Companies list row says "236 people" with no qualifier (the industry page says "People at 2 of 5 factories"). /industries/food for the United States: the ten Factories are all Texas sites.
- want: (a) a figure shown as a company's people says its coverage whenever it is not complete for the scope ("236 people at 1 of 86 factories") on every surface, through companyFigure; (b) an order read as "largest" never buries a company for lacking a figure (rule in ask); (c) each focus area's ten largest employers have a headcount on their anchor factory.
- do: (1) client/src/lib/utils.ts companyFigure: take known and total factory counts (companyStandings returns both, or add them) and print coverage when known < total. (2) server/lib/industries.ts byCompanyStanding: the coverage-aware order chosen in ask; tests/api/industries.sh holds the order: update it. (3) data: a research file in data/employers/ (corrections in corrections.json; node scripts/build-employers-sql.mjs --check, --rehearse, then generate) with headcounts and years for Giga Texas, Samsung Austin Semiconductor (Austin, Taylor), NXP's Austin fabs, Lockheed Martin Fort Worth (Air Force Plant 4), Bell (Fort Worth, Amarillo), Toyota San Antonio, then each area's next largest. (4) CLAUDE.md "One order for companies".
- check: GET /api/map/areas/austin/overview topCompanies contains Tesla and Samsung Austin Semiconductor; /explore?tab=companies row for Ball states its coverage; psql: select f.name from factories f join companies c on c.id=f.company_id where c.name in ('Tesla','Samsung Austin Semiconductor') and f.state='TX' and f.workforce_size is null returns no anchor site.
- deps: texas-scope (adds Texas employers: check first whether it fills these headcounts)   size: L
- ask: The order while most headcounts are unknown: (a) keep "most people recorded" and print coverage on every row, or (b) rank by factories listed until a company's coverage passes one half? Default: (a), plus step 3 for Texas.
- evidence: visitor-map#0, visitor-explore#1, data-as-shown#9; also touches: visitor-explore#2, speed-words#4, visitor-records#18; files: $UT/visitor-map/area-desk-AustinTX.png, $UT/data-as-shown/shots/map-tx-desk.png, $UT/data-as-shown/shots/explore-desk.png, $UT/visitor-explore/co-scroll.txt

### B004 P0 Remove registry rows that are not factories (offices, warehouses, remediation sites, dealers, contractors)
- area: data
- kind: data   reach: company pages, map pins, every factory count, the job form's factory picker, posting_decide. Boeing shows "292 factories · 30 states". Name-pattern counts in the copy: 67 remediation/parking/landfill/asphalt/portable/parcel, 23 CLOSED, 18 STORMWATER, 99 construction/contractors/paving, 72 warehouse/terminal/office, 11 cleaners/school/data centre.   verified: yes
- is: Boeing's rows include 'BOEING C-1 FACILITY - GW REMEDIATION PROGRAM' (11 rows on one Long Beach spot), 'BOEING 88-53 PARKING LOT EXPANSION', 'BOEING 250TPH ASPHALT' (city PORTABLE SOURCE, NM), 'BOEING REALTY CORPORATION', 'AT&T MOBILITY - OC0284-01 BOEING HB', 'ALLSTATE ELECTRONIC RECYCLING - BOEING D', 'BOEING AUBURN ALGONA WHSE' (an open job is attached to it), 'Boeing South Carolina Expansion and Improvements Phase 2 Site Improvements Build' (a permit project). Elsewhere: 'Bell Helicopter Textron Closed'; 18 '(STORMWATER)' rows under a company named 'Stormwater'; 'Dimmitt, TX' under company 'Dimmitt'; 'PAUL YOUNG CHEVROLET' and 'DELCO ELECTRONICS MCALLEN WARE HOUSE' as General Motors factories; 'Arc Kohler School' under Kohler; 'ARMY CORPS OF ENGINEERS (WHITTIER NARROWS DAM)'; 'US ARMY GARRISON-REDSTONE'; 'AIR FORCE PLANT 39 (FORMERLY)' under company 'Formerly'; 'JOHN DEERE SUPPORT CENTER'; dry cleaners ('2400 Newport Inc Dba Fairchild Cleaners'); '20th Television Inc'; 'Houston Chemical Distributors'; '1PointFive Stratos' (direct air capture, TX); about half of the 79 Leather factories ('ALLIED GENERAL NUCLEAR SERVICES - CLOSED', 'ADIDAS NAM CORPORATE HEADQUARTERS (PDX)'). GE Aerospace sites are split between General Electric and GE Aerospace. data/employers/not-theirs.json (scripts/build-not-theirs-sql.mjs, migration 0066) already moved or merged 27 such rows and holds 49 more in `leftInPlace` "for the owner" (General Motors 26, Ford 9, Boeing 6, Raytheon 5: cell sites, property firms, dealers, the asphalt plant); nothing yet removes a row that is nobody's factory.
- want: every row in factories is a site that makes a product on its own site (CLAUDE.md "What counts as manufacturing"); none matches the rule file's refuse patterns; a company's factory count is its real sites; such rows cannot be loaded again.
- do: (1) a rule file data/cleanup/<date>-not-factories.json (or a `remove` list added to data/employers/not-theirs.json and its builder): refuse patterns (remediation, parking lot, landfill, asphalt / hot plant / portable, stormwater, closed / former, realty, recreation, mobile carriers' cell sites, warehouse / whse / terminal / distribution, office / headquarters / support center, school, cleaners, dealer) plus explicit ids for reviewed exceptions both ways. (2) generate a migration with scripts/build-cleanup-sql.mjs (as 0022 and 0038): delete only rows that are not curated, hold no job with applications and are not the kept row of a merge; re-point sourced jobs first (posting_decide); every decision to load_log, look=true on the uncertain. (3) rehearse on a copy of production; read the look=true lines; list every company that loses over half its rows. (4) refuse at the door: NOT_COVERED in scripts/build-employers-sql.mjs and the intake resolve step (scripts/ingest/lib/pipeline.mjs) read the same pattern file. (5) posting_decide (scripts/posting-decide.sql; a new generated migration): never choose a factory whose name matches. (6) delete companies left with no factory and nothing else attached (Stormwater, Formerly, Dimmitt, Pdx). (7) move the GE Aerospace sites under one company (data/employers/corrections.json).
- check: psql: select count(*) from factories where name ~* '(remediation|parking lot|stormwater|asphalt|realty|\mclosed\M)' = 0; Boeing's factory count is under 60 and /companies/boeing lists no Parking, Remediation or Realty row; the migration applied a second time changes nothing.
- deps: none (B022 and B018 after it)   size: L
- ask: May rows that are nobody's factory be deleted: the 49 waiting in not-theirs.json `leftInPlace`, then the pattern classes? Default: delete the classes that are plainly not sites (remediation, parking, stormwater, cell sites, realty, closed), as 0038 did for concrete, keep the pattern file so they cannot return, and list offices, warehouses and dealers for the owner before removing them.
- evidence: visitor-map#9, visitor-explore#6, visitor-explore#8, visitor-records#5, employer#4, employer#5, admin#13, veteran#13, data-as-shown#4, layout-keyboard#8, gap-addresses-head-industries#22; also touches: gap-hiring-scale#33, data-as-shown#14; files: $UT/data-as-shown/shots/c-boeing.png, $UT/data-as-shown/shots/f-boeing-hist.png, $UT/employer/24-boeing-picker-open.png, $UT/visitor-map/rawfac-65667c.png

### B005 P0 Let a seeker add a goal at any time; fix the Profile links that lead nowhere
- area: seeker
- kind: missing   reach: every seeker once they have one goal or one skill; /me Goals and Skills empty states   verified: yes
- is: useAddGoal is called only by the "Start with a career" starter (client/src/pages/Me.tsx:107-158, drawn only with no goal, skill or application) and by GoalsSection's Undo. After the first goal no control anywhere adds another (the career page has none by design; Within reach and Closest careers rows have none). Goals' empty state "None yet. Browse careers" (GoalsSection.tsx:67) and Skills' "None yet. Mark skills on a career's path" (SkillsSection.tsx:84) link to /explore?tab=occupations, where neither can be done.
- want: Goals on /me always carries the career search under its list: choosing a civilian career adds it as a goal; the empty states point at controls on the same page (Goals: the picker; Skills: the "Add a skill" field). No link on Profile promises an action its target lacks.
- do: (1) client/src/components/me/GoalsSection.tsx: an "Add a goal" row (CareerPicker from components/account, civilian careers, already chosen ones left out) calling useAddGoal; focus moves to the new goal. (2) SkillsSection.tsx:84 and GoalsSection.tsx:67: replace the links with a button that focuses the field on the page. (3) Within reach / Closest careers rows (Me.tsx): a quiet "Set as goal" at the row's end. (4) Playwright step in tests/responsive.spec.ts: a second goal from /me.
- check: as a seeker with one goal: /me, type "cnc" in Add a goal, choose CNC Machinist: two goals listed after reload; no element on /me links to /explore?tab=occupations with the words "Mark skills" or "Browse careers".
- deps: none   size: S
- ask: Also "Set as goal" on a career's own page? CLAUDE.md says a career's page has no action. Default: no; Profile only.
- evidence: seeker#4, gap-applicant#3, gap-breakage#1, gap-breakage#23, gap-jobs-search-memory#3; files: $UT/seeker/39-maya-after-suggest.png, $UT/gap-jobs-search-memory/j6-one-goal.png

### B006 P0 Repair company names cut by the legal-suffix rule (Graco is "Gra", Tyco "Ty")
- area: data
- kind: data   reach: about 217 companies / 355 factories truncated (in the copy: Hars 22 factories, Ty 20, Ag 13, Amo 9, Atlas Cop 6, Asar 5, Wit 5, Westva 4, Gra 3, Sono 2, Nib 2) plus 101 names ending in '&', ',', '-', 'and', 'of' or 'the' ('Benjamin Moore &', 'Levi Strauss &', 'Milliken &', 'W R Grace &', 'Bama Co the')   verified: yes
- is: shared/companyNormalization.ts:290 strips /,?\s*(INC\.?|...|CO\.?|COMPANY)$/gi; \s* allows no space, so a name that ends in the letters "co" loses them: normalizeCompanyName('TYCO') = 'Ty', ('BENJAMIN MOORE & CO') = 'Benjamin Moore &', ('BAMA CO THE') = 'Bama Co the'. /companies/225139fb-ce8b-4983-bd43-efbf3312e042 is headed "Gra" over factories "Graco Inc North Canton", "Graco-High Pressure", "Graco Inc"; GET /api/search?q=graco finds no company.
- want: no stored company name is a truncation of its factories' names; the normaliser never removes letters from inside a word and never leaves a dangling '&', 'and', 'of', 'the', ',' or '-'.
- do: (1) shared/companyNormalization.ts: a suffix needs a separator before it ((?:,\s*|\s+)); "& CO" / "AND CO" / "& SONS CO" drop to the name before them; a trailing "THE" is dropped. Cases in tests/unit/shared.unit.ts: TYCO, GRACO, GRACO INC, HARSCO CORP, ATLAS COPCO, AGCO, BENJAMIN MOORE & CO, LEVI STRAUSS & CO, BAMA CO THE. (2) data/cleanup/<date>-company-names.json + scripts/build-cleanup-sql.mjs: for a company whose name is a strict prefix of its factories' raw names followed directly by CO|INC|CORP, rename to the fixed normaliser's reading of the factory names; keep the old name in companies.aliases; where the fixed name already exists as another company, merge with the moves recordMerge.ts makes (versions included) and log look=true. (3) strip the 101 dangling endings, logged. (4) rehearse on a copy of production and read every look=true line.
- check: psql: select count(*) from companies where name in ('Gra','Ty','Hars','Ag','Amo','Asar','Westva','Sono','Nib','Wit','Atlas Cop') = 0; select count(*) from companies where name ~ '[&,-]$' or name ~* ' (and|of|the)$' = 0; GET /api/search?q=graco returns the company Graco; npm run test:unit passes.
- deps: none (before B019)   size: M
- evidence: data-as-shown#1; also touches: gap-addresses-head-industries#21; files: $UT/data-as-shown/shots/c-gra.png

### B007 P0 Fall back to the plain map when MapTiler cannot be reached
- area: map
- kind: bug   reach: every map view for anyone whose network blocks or drops api.maptiler.com (style.json or tiles.json)   verified: yes
- is: client/src/components/map/Map.tsx:328-346: the 'error' handler acts only when the message contains 'style', 'Style' or '401'; a network failure (AJAXError "Failed to fetch") matches none, so basemapUnavailable is never set: a spinner stays over an empty map for good while the search and the panel work beside it (Texas panel filled, no states, no pins).
- want: when the basemap has not loaded within 8 s, or any error arrives before 'load' after the retries, the map is rebuilt with plainStyle() and draws states, focus areas and pins (CLAUDE.md, Map: "if the basemap fails, the map draws on a plain canvas").
- do: Map.tsx initMap: track loaded; in on('error') treat any error before loaded as a basemap failure once maxRetries is spent; add a timer from construction to 'load' that sets basemapUnavailable and re-inits; errors after load (a single tile) stay silent. tests/responsive.spec.ts: route **/api.maptiler.com/** to abort and expect the pins layer.
- check: Playwright: context.route(/maptiler\.com/, r => r.abort()); open /map?state=TX: within 12 s there is no spinner, Texas is outlined and pins are drawn; the same with only tiles.json aborted.
- deps: none   size: S
- evidence: gap-breakage#0; files: $UT/gap-breakage/13-notiles-texas-desktop.png, $UT/gap-breakage/14-tilesdown-austin-phone.png

### B008 P0 Stop an admin from taking over another admin through the reset link
- area: admin
- kind: bug   reach: POST /api/admin/users/:id/reset-link and /users/:id/sign-out for any target, the first admin included   verified: yes
- is: server/routes/admin.ts:464-484 makes a reset token for any user id and returns it ({link}); the People panel shows it on screen. A second admin got a working link for the protected first admin (GET /api/auth/reset/<token> answered the first admin's email) and ended their sessions ({ended:2}), which gets round FIRST_ADMIN (role removal and deletion are refused, line 334).
- want: for a target who is an admin, the link is never in the response or on screen: it is emailed only, and refused when mail is off; for the first admin, another admin's reset-link and sign-out answer 403 with FIRST_ADMIN's wording. Audited as now.
- do: server/routes/admin.ts reset-link: read the target's is_admin and firstAdminId(tx); first admin and actor is not the target: 403; another admin: require mail on, send, answer { emailed: true } with no link; the same first-admin guard on /users/:id/sign-out. client/src/components/admin/PeopleTab.tsx: hide the two buttons where refused, say "Emailed to them" where no link is shown. tests/api/admin.sh: three cases.
- check: tests/api/admin.sh: as admin B, POST /api/admin/users/<first admin>/reset-link = 403 and .../sign-out = 403; for another admin C the answer has no `link`; for a non-admin target the link is still returned.
- deps: none   size: S
- evidence: gap-admin-people-layout#0; files: $UT/gap-admin-people-layout/j2-first-open.png

### B009 P0 Make "Mark added" on a factory request name the factory that was added
- area: admin
- kind: bug   reach: /admin/access, every factory request; the requester's inbox   verified: yes
- is: server/routes/companyRequests.ts:233-249: for a request with companyId the PATCH sets status 'added' with no factory chosen or checked and calls companyRequestAnswered: the requester is emailed "The factory you asked for (Round Rock, TX) is now listed for John Deere. You can post jobs there." though no such factory exists. No confirm, no notice, no Undo (client/src/components/admin/CompanyRequests.tsx never calls notice.say).
- want: a factory request is answered 'add' only with the id of a factory of that company (400 with field otherwise); the email names that factory and links its page; the admin sees a notice with links (and the hold of B040).
- do: (1) companyRequests.ts PATCH: for plant requests require factoryId (isUuid; factories.company_id = request.companyId), store it (company_requests.added_factory_id: new idempotent migration + server/db/schema.ts), pass the factory's name and page address to companyRequestAnswered; server/lib/emailTemplates.ts wording. (2) CompanyRequests.tsx: the row offers "Add this factory" (to /admin/add?kind=factory with company, city and state prefilled: B098) and a picker over the company's factories, newest first, before "Mark added"; notice.say with links. (3) tests/api/admin.sh and tests/api/email.sh.
- check: PATCH /api/admin/company-requests/<plant request> {decision:'add'} without factoryId = 400 with field 'factoryId'; with a real factory the outbox line names the factory and its URL.
- deps: none   size: M
- evidence: gap-admin-people-layout#1; files: $UT/gap-admin-people-layout/j5-access.png, $UT/gap-admin-people-layout/j5-hire-employer.png

### B010 P0 Refuse a company merge that would give a military service factories, jobs or members
- area: admin
- kind: bug   reach: POST /api/admin/records/company/:id/merge; the Merge picker on every company record   verified: yes
- is: server/lib/recordMerge.ts:69-104 moves factories, jobs, members, requests and versions to intoId and refuses only two different services. 'UT Coord Works' was merged into U.S. Navy on instance 3: the Navy's public page then showed a factory, "39 careers · Zzyzxqvt, TX" and a map dot; pickers read "U.S. Navy · navy.mil · 1 factory". Direct adds are refused (400, isService / notAnEmployerHere in server/lib/military.ts).
- want: a merge where either company has `service` set and the other has factories, jobs, members, requests or versions answers 409 before anything moves; the Merge picker does not offer a service to a company that is not one.
- do: recordMerge.ts company branch: read both rows' service; when exactly one is a service and attachedTo(tx,'company', other) counts factories, jobs, members or versions above 0, throw RecordRefusal(409, notAnEmployerHere wording). The Merge panel's RecordPicker (client/src/components/admin/RecordEditor.tsx) leaves services out (GET /api/admin/records/company gains service=0). tests/api/military.sh: the 409.
- check: tests/api/military.sh: merging a company with one factory into the Navy = 409, and select count(*) from factories f join companies c on c.id=f.company_id where c.service is not null = 0.
- deps: none   size: S
- evidence: admin#0, gap-admin-queues-editors#3, gap-admin-people-layout#2; files: $UT/admin/41-navy-after-merge.png, $UT/gap-admin-people-layout/j3-picker-USNavy.png

### B011 P1 File each posting under the narrowest career the catalogue has
- area: pipeline
- kind: data   reach: 31 open jobs under Welder while MIG Welder has 0; the title pairs listed; boards read with 0 kept (Ford 901 read, GE Aerospace 463, Texas Instruments 914)   verified: yes (job counts by career and data/careers/aliases.json read; the other pairs tester)
- is: data/careers/aliases.json line 13-14: Welder carries "welding technician", "pipe welder", "structural welder", "stick welder", "fitter welder"; MIG Welder only "MIG", "GMAW welder". So 'John Deere ... - Production Welder' x5, 'Electron Beam Welder (Raptor)', 'Orbital Tube Welder', 'Automated Welding Technician', 'Weld Technician, EDV Body' are all Welder (whose description is every process). Other pairs read as wrong: 'Sr. Manufacturing Engineer - Paint' to Manufacturing Engineer (the catalogue has Paint Process Engineer); 'Rigger (Critical Movement Team)' to Millwright; 'CMM Inspector' to CMM Programmer; 'Injection Molding Technician' to Injection Molding Operator (0073 moved those names to Plastics Process Technician); 'Building Maintenance Technician' and 'Laboratory Maintenance Technician' ($89k-$134k) to Maintenance Technician; 'Senior Test Automation Engineer' to Test Engineer; 'Starlink Assembly Technician' to Spacecraft Integration Technician; 'Fitter' (shipyard) to Metal Fabricator; 'Electromechanical Technician' to Automation Technician.
- want: a title that names a specialisation the catalogue has goes to it (production welder to MIG Welder; automated or robotic welding technician to Robotic Welding Technician; electron beam and orbital tube welder to Aerospace Welder); a title the reader is not sure of is turned away (CLAUDE.md: a wrong career is worse than a missed posting); the gold fixture holds each case.
- do: (1) data/careers/aliases.json: add the names to the narrower careers and `not` entries on the generalists; confirm 0073's dropAliases reach scripts/ingest/postings/read/vocabulary.mjs. (2) scripts/ingest/postings/read/title.mjs and career.mjs: when two careers match prefer the longer alias; a qualifier after a dash, comma or in brackets ("- Paint", "(Starship Electronics)") takes part in the match. (3) tests/fixtures/postings/gold.json: add the listed titles with the right career or "none"; tests/unit/postings-read.unit.ts floors stay or rise. (4) node scripts/build-career-lists-sql.mjs --check, then generate migrations/<next>_career_lists_4.sql; point tests/unit/careers.unit.ts at it. (5) node scripts/ingest/run.mjs postings --rehearse on a copy and compare kept and career per board; live jobs change career at each board's next run.
- check: after a rehearse on a copy: select o.title, count(*) from jobs j join occupations o on o.id=j.occupation_id where j.status='open' and j.title ilike '%production welder%' group by 1 returns MIG Welder only; npm run test:unit (postings-read) at or above its floor.
- deps: job-names (a job will be named by its career, so a wrong career becomes the job's name); B013 for which welding careers stay   size: M
- evidence: visitor-records#1, visitor-records#4, seeker#2, employer#1, data-as-shown#15, layout-keyboard#1; also touches: gap-applicant#23

### B012 P1 Make the posting reader read the trade from the title and stop reading boilerplate
- area: pipeline
- kind: data   reach: job_skills, requirements, level_word and pay of all sourced jobs; 22 open jobs with no skill read, 98 with one   verified: yes (job_skills of 40990, 40075, 39931, 40996, the A&P certificates, pay of 40167 and the level words read from the copy; the other examples tester)
- is: 5 of 6 John Deere welder postings name only Forklift Operation (40996 also Overhead Crane): no welding process read. 'Pipe Welder (Starship)' 40075 names MIG, Stick, Flux-Cored, TIG but not Pipe Welding; 'Lead Structural Welder' names only Pipe Welding. Boilerplate read as skills: Forklift and Overhead Crane on almost every SpaceX welder posting (physical demands); 'Automated Welding Technician' 39931 names CAM Programming, G-Code Programming, Quality System Auditing, Machine Lubrication and no welding; 'TIG Welder (Starship Electronics)' names Box Build, Conformal Coating, IPC-A-610; 'Equipment Maintenance Technician, Silicon Assembly' 39836 gets 18 extra skills (Photolithography, Epitaxial Growth, Ion Implantation). Requirements: certificate 'A&P' on welding jobs (39931, 40161); SHIFT 'Night shift' read from "B Shift" (40910); LEVEL 'I', 'II', 'IV' from numerals in titles (open jobs: II 34, I 29, IV 26, III 12); pay $20,000 a year on 40167 (pay_min = pay_max = 2000000).
- want: (a) a skill named in the title is in job_skills ("Pipe Welder" gives Pipe Welding); process words in the text (GMAW, MIG, FCAW, SMAW, GTAW) give their skill; (b) text under physical-demands, benefits, equal-opportunity and about-the-company headings is not read for skills; (c) a certificate is kept only when required and of the trade; (d) no level word that is a bare numeral or letter is kept or shown (owner: no levelling system yet); (e) yearly pay under $15,000 or hourly under $7.25 is treated as not read; (f) the gold fixture holds these and its floors rise.
- do: scripts/ingest/postings/read/: text.mjs splits sections and drops the boilerplate ones before skills.mjs; skills.mjs reads the title first; facts.mjs rules for certificates, shift, level and pay. Vocabulary only from data/: the welding abbreviations as other names in data/skills/catalogue.json (new catalogue migration via scripts/build-skills-sql.mjs; no taxonomy migration needed for other names). Label 30 of the cases named here in tests/fixtures/postings/gold.json. client/src/components/jobs/JobFacts.tsx: do not draw LEVEL when level_word matches /^(I{1,3}|IV|V|[1-5])$/. Texts are not stored: a job is re-read at its board's next complete listing.
- check: npm run test:unit -- postings-read passes with the new cases; after a rehearse on a copy job 40075's reading has Pipe Welding; no welding-career job has requirements.certifications containing 'A&P'; no job page shows "LEVEL I".
- deps: B001 (after it the reading is the whole Skills section)   size: L
- evidence: visitor-records#2, visitor-records#3, visitor-records#23, seeker#13, seeker#14, data-as-shown#16, data-as-shown#17, layout-keyboard#11; also touches: data-as-shown#0, visitor-map#2

### B013 P1 Decide how a career stands as a template; fix descriptions and collect what postings name
- area: data
- kind: data   reach: Welder (20 skills: four arc processes, pipe, alloys, testing), Process Engineer (chemical, paper, plastics and pharma trades in one path), CNC Machinist, Maintenance Technician; every "N of M" against them; the career's sentence on its page, in search rows and on company version pages   verified: yes (Welder's path and description read from the API)
- is: the Welder career says "Joins metal with several processes (stick, MIG, flux-cored, TIG) in all positions, on structural steel, pipe and plate" and its path is the union of MIG Welder, TIG Welder and pipe work; a Navy HT "misses" Flux-Cored, Stainless, Aluminum, Pipe, WPQ and Destructive Weld Testing to be a Welder (12 of 20). The path editor (client/src/components/admin/PathEditor.tsx) can only include or remove a skill. Every path is a draft (0 approved).
- want: owner, Nov 26: a career is a template with a range of variable skills; a job or a company's variant is its own combination; no levelling system yet; collect postings before consolidating into standards. So: no description claims one person does every process; nothing presents a career's whole range as required (B001, B038, B031); the evidence for later consolidation is collected and visible to an admin.
- do: (1) no schema change now (no core/optional flag). (2) data/careers/catalogue.json: reword Welder and any description that lists alternatives as a conjunction into a range ("with one or more of ..."); regenerate with scripts/build-careers-sql.mjs (new numbered migration; tests/unit/careers.unit.ts). (3) node scripts/build-career-paths-sql.mjs --report: add, per career, each path skill's share of that career's open postings naming it (job_skills) and the commonest named skills that are not on the path. (4) Admin Tools, Review, Draft career paths: PathEditor shows the share beside each skill ("named in 9 of 31 postings"), read-only (GET /api/admin/records/career/:id path rows gain `named`, `postings`).
- check: /occupations/11b8231c-09f1-409a-a2f9-b21ebec61c39 no longer reads "several processes (stick, MIG, flux-cored, TIG) in all positions"; --report prints the shares; the path editor shows them for Welder.
- deps: B001; B011   size: XL
- ask: (1) Does the wide Welder stay beside MIG Welder, TIG Welder, Aerospace Welder and Robotic Welding Technician, or fold into them (likewise Process Engineer by industry)? (2) Once postings are collected, is a career's standard the skills most of its postings name, with the rest as its range? Default until answered: keep the catalogue, do steps 2-4, add nothing to the model.
- evidence: admin#2, veteran#5, gap-admin-queues-editors#34; also touches: gap-jobs-search-memory#0, data-as-shown#0, visitor-records#1, employer#1; files: $UT/admin/05-welder-editor.png, $UT/gap-admin-queues-editors/j3-welder-editor-desk.png

### B014 P1 Remove every sentence that only describes the screen
- area: copy
- kind: copy   reach: /me, /jobs, /employer, /settings, /sign-in, the map's first visit and panels, career, job and military sections, every Admin Tools page, the Skills list's domain headings   verified: yes (Jobs.tsx:189, Me.tsx:73, SkillsSection.tsx:70 grepped; the rest tester)
- is: sentences found, with file where known. Jobs.tsx:189 "Open jobs. Each is tied to a career and its skills." Me.tsx:73 "Goals, skills and applications."; GoalsSection.tsx:58 "Careers you are aiming for, and the skills you hold toward each."; starter "Choose one to aim for. Its skills become your list to mark off."; SkillsSection.tsx:70 "Held or learning."; CareerPicker's no-match text "Search for the closest kind of work: the job title can say anything." (the employer's advice, shown to seekers). Employer.tsx: "Post jobs at a company's factories and review applicants."; "Find your company and request access. An admin approves each request."; "Enter at least two letters." before anything is typed (:615); "Posting opens once approved." on every waiting row; "Set it to hire and this page leads your menu. Nothing is removed."; CompanyCareers.tsx "How a career is done here: the skills it takes and the makes you run. Shown with your company on the career's page." once per company; JobForm.tsx "Listed at once. Open for 60 days.", "Every job shows its pay."; VersionEditor.tsx instruction line about makes where the career has none. JobDetail.tsx manager view: "Seen only by people who manage jobs for X.", "The job as applicants see it." (:249), "The skills X lists for this job.", "Closing takes it off the jobs list. People who applied can still see it. A job with applicants can be closed, not deleted.", "Ranked by required skills held. Skills are self-reported, not verified."; JobSkills.tsx:195 "The machines and software the posting names."; SourcedJob.tsx "This job comes from X's careers site and is kept in step with it. It is changed there." OccupationDetailView.tsx:180 "How much of this career's skills each already has.", :129 "Each says how this career is done there."; CivilianReach.tsx:22 "Where these skills carry over." Settings.tsx:649 "Decides which tools you see. Nothing is removed by changing it."; signed out "Your name, sign-in and what the account is for are here once you are signed in."; "Sign-in emails are always sent."; "Now <address>. Your other devices are signed out by the change." MapSearch.tsx:41 first-visit line; a focus area's county list under its name and in search rows ("Harris, Fort Bend, ... Austin and San Jacinto counties", shared/scope.ts); OccupationView.tsx "Factories in these industries are lit on the map." Admin: Admin.tsx:135 "Choose what you came to do."; lib/adminPages.ts descriptions repeated as page subtitle, panel heading and panel sentence (People, Access, Invites, Activity, Review and each Review sub-list); PathsList.tsx "Drafts are written but not yet reviewed..."; HistoryTab "Every change an admin makes is kept here, with who made it and when." data/skills/taxonomy.json: each domain's run-on description under its heading in the Skills list (SkillTree.tsx), repeating the group names listed under it.
- want: no heading is followed by a sentence that restates the heading, the page or how the interface works; a line under a heading stays only when it states a fact a person needs and cannot see (a limit, a consequence), once per screen; hints such as "Enter at least two letters." appear only after input.
- do: delete the strings above (description props of PageHeader, PageSection, DetailSection, Panel); lib/adminPages.ts: the line stays on the /admin index only; RegionViews.tsx and search rows: no county list (keep it in shared/scope.ts for the API); CareerPicker: a seeker's no-match text is "No career matches <q>." plus the closest titles; taxonomy.json domain descriptions: cut to none in the Skills list (SkillTree stops printing them; the data file may keep them). Add scripts/check-filler.mjs to npm run lint: a `description=` string literal in client/src/pages or components longer than 6 words fails unless its line is in an allow file with a reason.
- check: rg -n "Each is tied to a career|Goals, skills and applications|Choose what you came to do|The job as applicants see it|Where these skills carry over|Decides which tools you see" client/src returns nothing; npm run lint passes; npm run test:ui passes.
- deps: B001 removes the job page's own sentence   size: M
- evidence: visitor-map#24, visitor-explore#28, visitor-explore#32, visitor-records#26, visitor-records#27, seeker#22, seeker#23, account#19, account#29, employer#18, employer#31, admin#28, veteran#18, veteran#19, layout-keyboard#27, speed-words#15, speed-words#16, speed-words#17, gap-applicant#22, gap-hiring-scale#25, gap-admin-queues-editors#28, gap-admin-people-layout#11, gap-admin-people-layout#29, gap-conditions#23, gap-conditions#24, gap-breakage#24, gap-jobs-search-memory#14, gap-jobs-search-memory#23, gap-addresses-head-industries#38; also touches: visitor-map#21, visitor-map#23, employer#19, admin#38, account#34, gap-hiring-scale#18, layout-keyboard#26, seeker#35; files: $UT/seeker/09-me-empty.png, $UT/employer/05-landing-desk.png, $UT/admin/01-index-desk.png, $UT/speed-words/strings.txt

### B015 P1 Say each fact once per screen
- area: copy
- kind: copy   reach: map panels (company, factory, area, state), single-factory company pages, /employer waiting state, job page after applying, /me applications, /settings for an admin, /admin/add, service pages   verified: yes (Austin panel screenshot: figure "OPEN JOBS 162" then heading "OPEN JOBS"; the rest tester)
- is: map panels: the figure "OPEN JOBS 162" and directly under it the section heading "OPEN JOBS"; "FACTORIES 4" then "FACTORIES"; "Show all 4 on the map" under four listed rows; "and 15 more on the map" plus "Show all 21 on the map" (CompanyView.tsx, FactoryView.tsx, RegionViews.tsx). Single-factory company: "Makes dry pasta." then the facts row "Makes / Dry pasta"; "3 factories · 3 states" then "Ohio 1 · Pennsylvania 1 · Texas 1". /employer: "Waiting for approval" as section heading, as the finder row's status and as the account menu's label. Job page after applying: "You applied today. Follow it on your profile." beside "Applied". /me application row: the stage at the right and again in the history line; the note the person sent is shown nowhere. /settings as admin: the same two descriptions under "This account is for" and under "View as". /admin/add: the added record in the notice and again under "Added this visit"; an empty submit prints the city and state errors twice. Goals' "Next" skills repeated as the first Suggested rows.
- want: on one screen a figure, state or name appears once; a "show all N" is not drawn when N rows are already shown; an error is printed once, beside its field.
- do: components/map/panel/parts.tsx Figures + the three views: one rule (the figure row keeps the number, the section heading under it drops when it would repeat the label, or the reverse: pick one and apply to all panels); ListLink is not drawn when rows.length equals the total; CompanyDetailView.tsx single-factory lead: no facts-row "Makes" when the description is the products line, no states line when it repeats the heading facts; Employer.tsx waiting rows; JobDetail.tsx apply panel; ApplicationsSection.tsx (stage once; show the person's own note); Settings.tsx View as tiles without descriptions; AddPage.tsx / CompanyAddForm.tsx / PlaceFields.tsx.
- check: /map?area=austin panel contains the words "Open jobs" once above the list; /map?company=<a 4-factory company> has no "Show all 4"; the single-factory company page shows its product once; Playwright text-count assertions for these in tests/responsive.spec.ts.
- deps: none   size: M
- evidence: visitor-map#16, visitor-records#12, employer#9, employer#29, admin#30, data-as-shown#22, gap-applicant#10, gap-admin-people-layout#23; also touches: account#11, gap-hiring-scale#25, veteran#20, admin#22, gap-jobs-search-memory#21, gap-breakage#24; files: $UT/visitor-map/area-desk-AustinTX.png, $UT/visitor-records/shots/c-interamerican-desk.png

### B016 P1 Replace "plant" for a factory in stored text and hold it with a check
- area: copy
- kind: copy   reach: 19 of 21 industry summaries, 35 career descriptions, 33 skill descriptions, 4 company descriptions (counts from the copy); shown on industry pages, search rows, Explore overview tiles, career and skill pages, Profile's starter   verified: yes
- is: industry_profiles.summary: "Plants that turn crops, milk and livestock into food", "Shops and plants that cut, form, weld..."; careers: "Keeps a plant's machines running", "Troubleshoots a plant's electrical controls", "Designs how work flows through a plant", "The entry job in most plants."; skills: "as it moves through the plant". tests/unit/words.unit.ts reads code strings and cannot see data.
- want: no on-screen sentence from data says plant for a factory; other senses stay (power plant, reactor plant, "Plant utilities", "Nuclear plant operations", a real site's name); a unit check reads the data files.
- do: edit data/careers/catalogue.json, data/skills/catalogue.json, data/careers/military/*.json, data/companies/profiles.json and data/industries/industries.json (each industry's `summary`); regenerate: scripts/build-careers-sql.mjs, scripts/build-skills-sql.mjs, scripts/build-military-sql.mjs (each a new numbered migration, its unit test pointed at it), and one small migration updating industry_profiles.summary; extend tests/unit/words.unit.ts to load those JSON files with the same allow-list of senses.
- check: psql: select count(*) from industry_profiles where summary ~* '\mplants?\M' = 0; the occupations and skills counts equal the allow-listed senses only; npm run test:unit -- words passes and fails when "a plant's machines" is put back.
- deps: none   size: M
- evidence: visitor-explore#12, account#27, layout-keyboard#10, speed-words#14, gap-hiring-scale#34, gap-admin-queues-editors#33, gap-conditions#38, gap-breakage#28, gap-jobs-search-memory#18, gap-addresses-head-industries#13

### B017 P1 Fix the name formatter: prototype keys, acronyms, initials, curated names
- area: system
- kind: bug   reach: every place a factory, company or city name is formatted (pages, lists, map, search, pickers, Admin Tools)   verified: yes (ran shared/displayName.ts on the inputs)
- is: shared/displayName.ts:63 and :92 index plain objects with a word: formatFactoryName('AKM, LLC - VOLKS CONSTRUCTOR DIVISION') = "Akm, LLC - Volks function Object() { [native code] } Division" (heading of /factories/f68fbb5e-77ec-451a-876a-ed480292f12d). formatCompanyName('RTX') = 'Rtx' ("Part of Rtx" on Raytheon and Collins), 'JCB' = 'Jcb', 'SABIC' = 'Sabic'. 'BAE SYSTEMS IESI' gives 'BAE Systems Iesi'; 'C&W FABRICATORS' gives 'C&w Fabricators'; 'BOEING COMPANY THE ST LOUIS BLDG 306' gives 'Boeing Company the ST Louis Bldg 306'; 'BOEING MROTC' gives 'Boeing Mrotc'; a curated name is reshaped: 'Thermo Fisher Scientific Austin (Woodward St)' gives '(Woodward ST)'; 'Boeing A&m 41st ST', 'Mcguire Afb', 'Aurora Flight Sciences of Wv', 'Absolute Precision Cnc Machining'.
- want: (a) lookups use Object.hasOwn or a Map; (b) a curated factory's and a profiled company's name is returned as written (CLAUDE.md); (c) a token of 2-5 capitals that is not a dictionary word, or is listed, stays capital (RTX, JCB, BAE, AFB, CNC, MROTC); (d) single letters round '&' stay capital (C&W, A&M); (e) "ST" before a capitalised word is "St" (St Louis) and after a street name "St"; (f) "CO THE" / trailing "THE" is dropped; (g) Mc + letter gives McAllen, McKinney, McGregor, McHenry; a trailing two-letter state code stays capital.
- do: shared/displayName.ts (titleCaseWord, fixAcronymsInPlace, formatFactoryName, formatCompanyName) and client/src/lib/places.ts titleCase share one word rule; formatFactoryName takes the row's `curated` and returns its name untouched: callers pass it (FactoryDetailView, map panel parts, PlantPicker, server/routes/search.ts, PlantPairs, HistoryList, Postings). Cases for every example above in tests/unit/shared.unit.ts.
- check: node --import tsx -e on the 12 inputs prints the wanted forms; /factories/f68fbb5e-77ec-451a-876a-ed480292f12d has no "function" in its heading; /companies/rtx is headed RTX; npm run test:unit passes.
- deps: none   size: S
- evidence: visitor-records#6, employer#33, admin#12, data-as-shown#2, gap-hiring-scale#12, gap-admin-queues-editors#14; also touches: visitor-map#10, speed-words#2, gap-conditions#16, gap-admin-people-layout#24; files: $UT/data-as-shown/shots/f-akm.png, $UT/gap-hiring-scale/j24-close-dialog.png

### B018 P1 Give every factory a clean display name
- area: data
- kind: data   reach: 43,132 factories: 41,364 names stored in capitals, 27,870 end in a legal form, 550 carry DBA / FKA / Former, 96 a registry id in brackets, about 4,064 are the company's name alone; 418 of 1,284 open jobs sit on factories named by a raw legal name   verified: yes (counts from the copy; examples tester)
- is: 'Astron, Inc'; 'Bimbo Bakeries USA Inc' nine times on one company page (rows differ only by city); 'ANDURIL INDUSTRIES INC' (287 jobs) and 'ANDURIL INDUSTRIES, INC'; 'Bridgeport Brass D/b/a Olin Brass'; 'Arcosa Marine Products, Inc. [Plant No. 296]'; 'As America Inc - Am Std Brands (0370010176)as America Inc - Am Std Brands (03700' (doubled, cut at 80 characters, six lines at 40px on a phone); 'ACH FOOD CO INC/2801 S W 15TH ST'; 'AGILENT TECHNOLOGIES - 15 TIGAN ST'; 'Raytheon-Rafael Area Protection Systems, LLC - R2s East Camden Facility'; 'Intel Corp (F23)'; 'Ford Motor Company (Former Sacp)'; registry abbreviations (Plt, Div, Prods, Cntr). Curated names that are not names: 'North Campus' and 'RFAB' (Texas Instruments), 'Austin manufacturing campus (Harris Branch)', 'Gmi'.
- want: a factory reads "<Company> <City>" or its real site name ("John Deere Harvester Works"): no legal form, DBA / FKA note, registry or plant number, street address, doubled or cut text; two factories of one company in one town are told apart by a site word or street; the raw registry name is kept for matching.
- do: (1) new column factories.display_name (idempotent migration + server/db/schema.ts; `name` stays as loaded: the loader, intake and external ids match on it). (2) scripts/build-factory-names-sql.mjs (new, plain Node, --check): rules from data/cleanup/factory-names.json (strip legal forms, DBA / FKA, bracketed ids, "PLANT NO", addresses; a company-only name becomes "<Company> <City>"; abbreviations written out) generate a migration that fills display_name and logs each change class to load_log; curated rows keep their name. (3) every reader takes display_name ?? formatFactoryName(name) through one helper (server/lib/records.ts or shared/displayName.ts), the pins included. (4) curated oddities through data/employers/corrections.json ('Texas Instruments North Campus', RFAB; check whether DISH Network El Paso is a factory at all). (5) first, by hand, the factory rows behind open jobs (Anduril Costa Mesa, Ashville OH, McHenry MS; Northrop Grumman Salt Lake City, Iuka; SpaceX Bloomfield; Caterpillar Peoria).
- check: select count(*) from factories where coalesce(display_name,name) ~* '[ ,](inc|llc|corp|co|ltd)\.?$' = 0; /factories/5956f739-24f7-4a6d-8e33-219e5304c6eb is headed on one line; /companies/bimbo-bakeries-usa factory rows are told apart by name.
- deps: B017; B004 (fewer rows to name); job-names (how a job's page names its factory)   size: L
- evidence: visitor-explore#35, visitor-records#10, data-as-shown#3, layout-keyboard#7; also touches: visitor-records#9, data-as-shown#13, speed-words#21, gap-jobs-search-memory#6, gap-hiring-scale#11, gap-admin-queues-editors#38; files: $UT/layout-keyboard/shots/fac-asam-p390-dark.png, $UT/data-as-shown/shots/f-asamerica.png

### B019 P1 Merge companies written several ways and strip registry text from company names
- area: data
- kind: data   reach: 157 groups / 316 rows collapse to one name when punctuation and spaces are removed (tester's wider grouping: 215 groups / 435 rows); 32 names end in a state code as a word, 46 carry Dba   verified: yes (counts from the copy; examples tester)
- is: 'BAE Systems' (92 factories) and 'B a E Systems'; 'A O Smith', 'Ao Smith', 'A. O. Smith'; 'BorgWarner' and 'Borg-warner'; '48 Forty Solutions', '48forty Solutions', '48fortysolutions'; 'Wr Grace &', 'W R Grace &', 'Wrgrace & Co-conn'; 'Bertch Cabinet Mfg' and 'Bertch Cabinet, Llc.'; 'Nestle' and 'Nestle USA'; 'Tyco International' and 'Tyco International (us)'. Registry text in names: 'Air Liquide Industrial US LP 2700 Post Oak Blvd Houston TX 7' (its one factory is in Millington, TN); 'Bodycote Thermal Processing Dallas Tx'; 'Aurora Flight Sciences of Wv'; 'Breed Automotive Mfg of Tx'; 'Plc', 'Gkn Plc', 'Bodycote Plc'; 'Brugmann Gmbh Kanalstr'; 'Biomedical Research Foundation of Nw La Dba Southern Isotopes'; 'Welderaft' with factory 'Welderaft Inc'; 'A & I Products' with jobs titled 'John Deere A&I ...'.
- want: one row per company; a company's name carries no address, legal form, state code or DBA note; the merged spellings live in companies.aliases and still find it.
- do: (1) after B006: data/cleanup/<date>-companies.json with `merge` groups (kept name first), built from the normalised-name grouping and read by hand for false friends (Bell vs Bell Incorporated), and `rename` entries. (2) scripts/build-cleanup-sql.mjs: merges make the moves server/lib/recordMerge.ts makes (factories, jobs, members, requests, versions: a generated migration moves versions itself), aliases kept, load_log lines, look=true on any group over three rows. (3) rehearse on a copy. (4) the near-duplicate warning (server/lib/recordSearch.ts similar; POST /api/employer/company-requests) uses the same normalisation, so "Daltile" finds Dal-Tile before a request is sent.
- check: select count(*) from (select 1 from companies group by regexp_replace(lower(name),'[^a-z0-9]','','g') having count(*)>1) x = the exceptions listed in the JSON; GET /api/search?q=grace returns one W. R. Grace company; select count(*) from companies where name ~ ' (Wv|Tx|Nc|Pa|Oh)$' = 0.
- deps: B006   size: L
- evidence: visitor-map#10, visitor-explore#7, data-as-shown#6, layout-keyboard#9, layout-keyboard#30, speed-words#2; also touches: admin#13, veteran#13, gap-hiring-scale#9, gap-addresses-head-industries#34; files: $UT/layout-keyboard/shots/co-airliquide-p390-dark.png

### B020 P1 Normalise place names: one spelling per town, always "City, ST"
- area: data
- kind: data   reach: 41,352 factory cities stored in capitals and title-cased on display; 168 Mc-names; 139 "City Of" / Twp forms; 21 factories with no state; emails and API answers that pass the raw column through   verified: yes (counts from the copy; formatter run on 'MCALLEN STAMPING')
- is: 'Mcallen' and 'Mc Allen' (both TX), 'Mckinney' / 'Mc Kinney' beside a curated 'McKinney', 'Mcgregor', 'Mchenry', 'Truth Or Consequences', 'Laporte' beside 'La Porte'; 'Boston, City Of', 'Franklin Twp', 'Denver, 0.6 Mi Nw Of', 'PORTABLE SOURCE'; 'Ft Wayne', 'N Charleston' (three spellings of North Charleston on one factory page); 21 factories without a state show a town alone ('Renton', 'North Charleston'); 'Boeing, Arlington, DC' is Arlington, VA. The raw column reaches people: company finder rows '1 factory · ARDEN HILLS, MN', the new-applicant email "(WACO, TX)", /api/me/applications city 'WACO', search job rows 'Boeing · HAZELWOOD, MO'.
- want: every stored city is the Census place name in mixed case; every place on a screen or in an email is "City, ST" from one formatter; no factory has a null state.
- do: (1) data/cleanup/cities.json (spelling map) + the Census places already reduced under data/geo: a generated migration updates factories.city where a case-insensitive or mapped match exists (columns named; lat/lng untouched), the rest logged look=true. (2) the 21 stateless rows: state from the point (scripts/geo/assign-keys.mjs has the polygons) or removal under B004. (3) one cityState() (shared/) used by server/lib/companySearch.ts (the `where` line), server/lib/notices.ts:380, server/routes/me.ts applications, server/routes/search.ts subtitles, PlantPicker and the client's lib/places.ts.
- check: select count(*) from factories where city = upper(city) and city ~ '[A-Z]{4}' = 0; select count(*) from factories where state is null = 0; with EMAIL_OUTBOX a new applicant's email reads "(Waco, TX)".
- deps: job-names (job rows and job pages: check what it already normalises); B004; B017   size: M
- evidence: visitor-records#7, data-as-shown#12, gap-hiring-scale#11; also touches: visitor-explore#8, layout-keyboard#8, gap-applicant#13, speed-words#20, gap-jobs-search-memory#17, gap-breakage#27

### B021 P1 Re-apply company profiles (slug, domain, featured, description) and give every company a slug
- area: data
- kind: data   reach: 27,826 of 28,038 companies have no slug and no domain; 37 of the first 100 companies in the one order have no domain, 32 no description   verified: yes
- is: data/companies/profiles.json has Tesla (tesla.com, featured), Lockheed Martin, Raytheon (rtx.com), Samsung Austin Semiconductor, 3M Company and 124 more; the stored rows 'Tesla', 'Lockheed Martin', '3M', 'Raytheon', 'Samsung Austin Semiconductor', 'Honeywell', 'Tyson Foods', 'Collins Aerospace', 'Kohler', 'BAE Systems' have slug null, domain null, featured false (load_log: the Tesla row was created by the texas-electronics load, after 0012-0014 had run). So /companies/tesla (CLAUDE.md's example address) is "This company is not listed" (GET /api/companies/tesla = 404, asked three times) and /map?company=tesla says "That company is not listed."; lettermarks for Tesla, 3M, Lockheed Martin, Raytheon, Collins Aerospace, Pratt & Whitney, Samsung, Tyson, NXP, International Paper though client/src/lib/logos.json lists their domains; the Factories list shows no mark slot at all on those rows, so the column is ragged. A company added in Admin Tools gets slug null.
- want: every company named in profiles.json and the domains files carries those values on the row that now has that name or alias; every company has a unique slug from insert on; the first 100 of the one order have a mark or a reason in data/companies/logo-decisions.json.
- do: (1) a new generated migration from profiles.json (scripts/build-company-profiles-sql.mjs and build-company-descriptions-sql.mjs) and from domains.json + domains-2.json (scripts/build-domains-sql.mjs), extended to match by exact name or alias in any letter case; fill only an empty domain and description, set featured, write load_log. (2) slugs: a migration fills slug for all rows (0014's rule; a collision takes the headquarters or first factory's city), server/lib/companyAdd.ts and scripts/employers-loader.sql set it on insert. (3) data/companies/domains-3.json for the top 100 without one; node scripts/fetch-logos.mjs --sheet out.html and look at every mark before committing. (4) client/src/components/explorer/EntityRow.tsx: Factories rows reserve the mark slot (lettermark when none).
- check: curl -s -o /dev/null -w '%{http_code}' localhost:3900/api/companies/tesla = 200; select count(*) from companies where slug is null = 0; select count(*) from companies where name in ('Tesla','Lockheed Martin','3M','Raytheon','Samsung Austin Semiconductor') and domain is null = 0.
- deps: B019 (slugs after merges); sectors replaces the label, not these fields   size: M
- evidence: visitor-map#1, visitor-explore#5, admin#3, data-as-shown#10, gap-addresses-head-industries#6; also touches: speed-words#4, gap-admin-queues-editors#38, gap-addresses-head-industries#34, gap-hiring-scale#32, employer#5; files: $UT/admin/30-tesla-page.png, $UT/visitor-explore/co-desk.png, $UT/visitor-explore/fa-1600.png

### B022 P1 Merge factories listed several times and list spot-duplicates in Review
- area: data
- kind: data   reach: 147 groups (313 rows) share company and coordinates to 3 decimals; tester: 536 groups at 2 decimals (612 extra rows); counts on company pages, state panels and Explore are inflated by them   verified: yes (3-decimal count from the copy; examples tester)
- is: Boeing Renton: the curated 'Boeing Renton Factory' plus 'Boeing 800 Park Renton', 'Boeing Commercial Airplane Group - Renton', 'Boeing Company Renton 6th Street N'; 'BAE Systems Irving' twice; Kohler Brownwood as 'Kohler Brownwood' and 'Kohler Co'; SpaceX McGregor twice; Austin Foam Plastics Pflugerville twice; 'ANDURIL INDUSTRIES INC' and 'ANDURIL INDUSTRIES, INC' split one site's jobs. /admin/review says "Factories listed twice: None" (it counts shared registry ids only) while Data quality counts 313 factories at 147 spots, reachable only from that table. plant_keeps keeps the registry name ('BAE SYSTEMS IESI' over 'BAE Systems Austin'; 'LOCKHEED MISSILES & SPACE COMPANY INC').
- want: no two live rows of one company are one site; Review lists spot pairs with a count; the kept row has the better name (curated, else mixed case, else the longer site name).
- do: (1) scripts/plant-duplicates.sql: add certain cases: same company and same normalised name and city; same company within 150 m where one name is the company's alone; generate a new migration with scripts/build-duplicates-sql.mjs (--check, --rehearse); the rest stay for a person. (2) scripts/plant-merge.sql plant_keeps: a row whose name is all capitals or the bare legal name loses to a written name, or the kept row takes the other's name when its own is raw (a new generated migration; 0051 is applied). (3) client/src/components/admin/ReviewPage.tsx and GET /api/admin/overview: a line "Factories on one spot" with the count from server/lib/quality.ts, opening /admin/review?pairs=spot.
- check: the 3-decimal query (select count(*) from (select 1 from factories where latitude is not null group by company_id, round(lat::numeric,3), round(lng::numeric,3) having count(*)>1) x) falls from 147 to the pairs marked apart; /admin/review shows the spot line with its number; tests/api/dupes.sh passes.
- deps: B004   size: L
- evidence: data-as-shown#5, gap-admin-queues-editors#38; also touches: visitor-map#9, employer#5, admin#7, gap-admin-queues-editors#13, employer#29, layout-keyboard#8, speed-words#21

### B023 P1 Fill the industry of the 15,302 factories that have none, and say the remainder
- area: data
- kind: data   reach: 15,302 of 43,132 factories (35%) have primary_naics_description null (Ohio 1,091 of 2,099)   verified: yes
- is: such factories vanish under any industry filter and are never lit for a career subject; breakdowns do not reconcile: /industries heads "Factories listed 43,132" over 21 rows that sum to 27,830; /map?state=OH Factories 2,099 while its industries sum to about 850; a Waterloo place panel shows 17 factories and 9 across industries (John Deere's Waterloo works missing from Machinery). The job form's "Careers in this industry" is empty at such a factory (4 of Dal-Tile's 7).
- want: every factory with an EPA registry id carries the registry's NAICS; where none is known, any breakdown by industry prints "N without an industry" so the parts add up to the total; the career picker falls back to the company's leading industry.
- do: (1) production, GitHub Actions, Ingest, source epa-echo: rehearse, read the report, apply (fills empty facts only, naics among them). (2) scripts/enrich-naics.mjs for the rest (a company's commonest code among its other factories), logged look=true, never over a curated value. (3) IndustryList.tsx and RegionViews.tsx print the remainder line (total minus the sum; the API has both). (4) server/routes/factories.ts typicalCareers: fall back to companyIndustry().
- check: select count(*) from factories where primary_naics_description is null is under 5,000 after the intake; /industries shows the remainder line and column + remainder = the heading figure.
- deps: sectors (the company's label changes; confirm the factory-level industry stays)   size: M
- evidence: visitor-map#11, visitor-explore#11, gap-hiring-scale#13

### B024 P1 Run the county keys on production and fill addresses from the registry
- area: pipeline
- kind: data   reach: county_fips null on all 43,132 factories; address on 1,504 (3.5%); 21 factories without a state   verified: yes
- is: GET /api/map/factories/<id>/county answers {county:null,metro:null,manufacturing:null} for every factory though 3,144 counties and 3,081 county statistics are loaded, so the county sentence under a factory's address (components/entity/CountyLine.tsx) never appears; /admin/activity?view=quality reads County 0% in every state, Outside id 0.1%, Code 1.5%.
- want: every factory whose point falls in its filed state has county_fips and cbsa_code; Data quality's County column is above 95%; addresses are filled where the row has a registry id.
- do: (1) GitHub Actions, Ingest, source `counties` (scripts/geo/assign-keys.mjs): the dry run first; read the list of factories whose point lies in another state; then apply. (2) Ingest, source epa-echo: rehearse, then apply (it fills only empty facts: address, naics, ids). (3) keep it current: add `counties` as the last step after any load that adds or moves factories (CLAUDE.md asks for it) or a weekly schedule in .github/workflows/ingest.yml.
- check: production: select count(county_fips)::float / count(*) from factories > 0.95; /factories/a269b614-91d5-4b91-9072-f8aa0f5f33cd shows the county sentence; the Data quality County column is non-zero.
- deps: none (needs the repository secret INGEST_DATABASE_URL and a person to start the workflow)   size: S
- evidence: visitor-map#8, visitor-records#11, admin#4, data-as-shown#8; files: $UT/admin/51-quality.png

### B025 P1 Make search tolerant of spelling and put the exact match first
- area: search
- kind: bug   reach: header search and map search (GET /api/search), every query   verified: yes
- is: 'teslla', 'catepillar', 'machinst', 'welidng' return nothing ("No results"); 'gm' lists GM Industries, Gmp, Boyd Gmn and the skills Pigment Dispersion and Six Sigma DMAIC but not General Motors (alias GM); '3m' lists five factories and no company 3M; 'plastic injection' finds no career; 'welder' lists the skills Cell Sealing and Wire Drawing (matched on a tools line) before welding skills; 'tig' finds Airtight Construction; 'dell' finds LyondellBasell; 'HT' puts the Navy HT career under five companies and five factories and adds Millwright and Slaughterer; 'weld' fills a phone's first screen with companies. GET /api/occupations and /api/employer/companies already fall back to the closest names.
- want: (a) a query with no match returns the closest names by trigram similarity per group, said as closest; (b) an exact name or alias match in any letter case leads its group and the results; (c) a query of three letters or fewer matches word starts and exact aliases only; (d) a tools-line or mid-word match never outranks a name match and is dropped when five name matches exist; (e) careers and skills come before companies when the query is exactly a career's or skill's name or other name.
- do: server/routes/search.ts: per group a word-start pass, then the similarity fallback (pg_trgm is installed; add missing GIN indexes in a new migration); companies also match companies.aliases; reuse the closest-name code of server/lib/companySearch.ts and careerSearch.ts; scoring tiers stay written once in client/src/components/search/results.ts, held by tests/unit/search-results.unit.ts. A one-letter query answers empty without a query (q=a took 287 ms).
- check: curl 'localhost:3900/api/search?q=teslla' returns Tesla; q=gm: first company General Motors; q=3m: company 3M; q=machinst: Machinist careers; q=welder: the skills group starts with welding skills; npm run test:unit -- search-results passes.
- deps: none   size: M
- evidence: visitor-map#13, visitor-explore#3, visitor-explore#4, visitor-explore#15, veteran#12, gap-conditions#37; also touches: seeker#17, employer#7, admin#20, speed-words#13

### B026 P1 Show a failed request as a failure, never as "not listed", empty or blank
- area: system
- kind: bug   reach: every record page, /me, /map, Explore, industry pages, both searches, /jobs paging; whenever the API fails, hangs or the person is offline   verified: yes (EntityDetail.tsx:150 read; screenshot of the false not-listed page)
- is: client/src/pages/EntityDetail.tsx:150 `if (error || !data)` draws "This company is not listed. The link may be old, or the record was removed." for a 503 or an HTML 200; a `{}` answer leaves the page blank; while pending a record page is blank (no skeleton), and the 20 s timeout retries once silently, so the first message comes at about 40 s. /me with /api/me/* failing shows the name and nothing else. /map with pins or overview failing shows an empty map and no word. Explore, Industry and the Atlas print the raw error body ("down") beside Try again. Offline: both searches say 'No results for "Boeing"'; /jobs "Show more" does nothing; the map panel opens with only its kind word.
- want: one LoadError with one sentence ("Something went wrong on our side." or "You are offline.") and a working Try again on every page and panel; not-found only on 404 and 400; a skeleton while pending; no raw server text; search tells an error from an empty answer; a timeout is not retried silently.
- do: client/src/lib/api.ts apiFetch: a non-JSON or empty body is a server failure; lib/http.ts retryUnlessClientError: no retry after a timeout; EntityDetail.tsx: branch on the error's status and draw a skeleton from components/layout/Page.tsx; Me.tsx and components/me/*: isError gives LoadError; Map.tsx: usePins error gives one line beside the search with Try again; BrowseList.tsx, ExploreOverview.tsx, Industry.tsx use the shared sentence; GlobalSearch.tsx and MapSearch.tsx: an error row "Search could not reach the server."; Jobs.tsx Show more busy and error; one offline line in Layout.tsx (navigator.onLine and the online/offline events).
- check: Playwright with page.route('**/api/**') fulfilling 503 {"error":"down"} (auth/me passed through): /companies/john-deere, /me, /map, /explore, /industries/food each show the shared sentence and a Try again that recovers after unroute; none shows "not listed" or "down".
- deps: none   size: M
- evidence: layout-keyboard#2, layout-keyboard#3, layout-keyboard#4, layout-keyboard#5, gap-breakage#5, gap-breakage#8, gap-breakage#9, gap-breakage#19, gap-breakage#20; files: $UT/layout-keyboard/fail-company.png, $UT/layout-keyboard/fail-explore.png, $UT/gap-breakage/22-hang-record-21s-phone.png

### B027 P1 Match a typed ZIP code exactly and filter place results
- area: search
- kind: data   reach: /jobs Where field, the map's search, the saved ZIP in /settings (shown to companies)   verified: yes (client/src/lib/geocode.ts has no exact-postcode check; behaviour seen by five testers)
- is: geocode.ts takes the geocoder's nearest postal_code feature: '99999' is offered as "99999 — Greenwich, CT" on /jobs and in the map search and can be chosen, so jobs are filtered around Greenwich. 'Norfolk' offers 'Norfolk County, VA' (no such county; the city, home of the largest naval base, is missing); 'San Antonio' offers 'Caguas County, Puerto Rico'; 'Baytown' offers 'Baytowne Apartments'; 'Texas' offers 'Texas, Town of Mexico, NY'; a misspelt 'Housten' resolves but the row keeps the misspelling. With the geocoder down a real ZIP says 'No place matches "78701"'. PATCH /api/me accepts homeZip 00000 and 99999 ("Saved"), and a value over 10 characters answers 200 and clears the stored ZIP (server/routes/me.ts:96-100).
- want: a five-digit query matches only a feature whose postal code equals it, else "No ZIP code 99999"; place results are US towns, counties and ZIP codes only (no points of interest, no Puerto Rico), a city before a same-named county, labelled by the feature's own name; a geocoder failure says place search is unavailable and offers the states; a saved ZIP is a real one; too-long input is a 400 with field.
- do: geocode.ts searchPlaces: exact-postcode rule, type and region filters, independent cities; components/jobs/JobPlaceFilter.tsx and components/map/MapSearch.tsx: the error state; server/routes/me.ts: 400 on length and on a ZIP outside a bundled table (data/geo: a ZCTA list with state and centroid, reduced by scripts/geo/build-reference.mjs; B032 reuses the centroids).
- check: /jobs Where: 99999 gives "No ZIP code 99999"; 78701 gives Austin, TX; with maptiler blocked the unavailable line shows; curl -X PATCH localhost:3900/api/me -d '{"homeZip":"99999"}' (signed in) = 400 with field.
- deps: none   size: M
- evidence: visitor-map#29, seeker#16, account#17, veteran#22, gap-applicant#15, gap-conditions#20, gap-conditions#21, gap-breakage#6, gap-breakage#7, gap-breakage#17, gap-jobs-search-memory#8; files: $UT/gap-conditions/shots/I-d-jobs-where-bad.png

### B028 P1 Make the map's panel agree with the industry filter
- area: map
- kind: bug   reach: /map with ?industry= and any state, focus area, place, company or career; "Open on the map" from an industry page   verified: yes (server/routes/map.ts overviews take no industry; behaviour tester)
- is: with an industry chosen the pins are filtered and the panel is not: /map?industry=Food+Manufacturing&state=TX still reads 6,061 factories, 4,504 companies, 285 jobs with Texas Instruments and SpaceX first; /industries/machinery?area=houston "Open on the map" lands on a panel of 1,563 factories (the page said 227). An unknown value (?industry=Nothing, or the slug ?industry=machinery) hides every pin, shows the raw word as the chip, drops an open factory panel and says nothing. ?company=john-deere&industry=Food Manufacturing: no pins while the panel says 21 factories. ?career=<Welder>&industry=Food Manufacturing: empty map under "Factories in these industries are lit on the map."
- want: with an industry chosen, every figure and list in a state, area or place panel is of that industry and the panel says so beside its name; an industry in the address is read by name or slug through shared/industry.ts and anything else calls notFound(); a subject and industry with no pins in common says "None of <subject>'s factories are in <industry>" with one press to clear the filter.
- do: server/routes/map.ts: states/:code/overview, areas/:id/overview and bounds/overview accept `industry` (one of the 21 by name or slug; 400 otherwise, through onlyQuery) in their conditions; client/src/lib/queryKeys.ts and queries.ts carry it; RegionViews.tsx names it; client/src/pages/MapView.tsx and stores/mapStore.ts resolve a slug or short name and call notFound() otherwise; CompanyView.tsx and OccupationView.tsx: the empty-pair line.
- check: curl 'localhost:3900/api/map/states/TX/overview?industry=food' gives the factory count shown on /industries/food?state=TX; /map?industry=Nothing shows the not-found line with all pins; tests/api/industries.sh holds the case.
- deps: sectors (if the map's filter becomes a sector, the same rule applies to it)   size: M
- evidence: visitor-map#5, visitor-map#6, gap-conditions#3, gap-conditions#4, gap-conditions#5, gap-conditions#6, gap-addresses-head-industries#19; files: $UT/visitor-map/filter-desk-food-tx.png, $UT/gap-conditions/shots/M-ind-company.png, $UT/gap-addresses-head-industries/ind-openmap-desk.png

### B029 P1 Give a new seeker a first step: land on Profile, start from careers that are hiring, be told where skills are marked
- area: seeker
- kind: ux   reach: every new account that signs up from the header, a job or a career; /me's starter; a seeker's view of job and career skills   verified: yes (client/src/pages/SignIn.tsx:144 read; behaviour tester)
- is: every sign-in link carries ?next=<page> and SignIn.tsx:144 sends a new account to `next` before '/me': signing up from the map, a career or a job returns there with nothing new, and Profile is reachable only through the avatar menu; on a phone the sign-in control is an unlabelled door icon. The starter's "Careers to aim for" is the same five for everyone (Explore overview's first five: Upholsterer, Furniture Finisher, Millwright, NDT Technician (Magnetic Particle), RF Technician; on another day Controls Technician, Spacecraft Integration Technician, ...), none chosen for open jobs. On a job or career page a signed-in seeker sees circles and "You hold 0 of 20" that cannot be pressed and no word on where to mark; a person who signs up from a job applies as "0 of 15 required" and ranks last. Signing in again lands on /map with nothing new said.
- want: a new account lands on /me unless `next` is a job page, where one line beside the skills reads "Mark the skills you hold on Profile" (a link); the starter lists the careers with the most open jobs (in the person's state once a ZIP is saved); the phone header says "Sign in" in words; a returning seeker with a goal lands on /me.
- do: client/src/pages/SignIn.tsx:144 (the order for signUp.isSuccess; returning sign-in with goals); components/account/AccountMenu.tsx phone label; Me.tsx Starter source: GET /api/occupations?sort=openJobs (new sort in server/routes/occupations.ts through jobIsOpen()), six rows; JobSkills.tsx and the route's heading line: for a seeker holding none, the Profile line (add id="skills" on /me); JobDetail.tsx apply panel repeats it above Apply when none of the job's skills is held.
- check: Playwright: sign up from /map lands on /me; sign up from a job stays on the job and shows the Profile line; the starter's first career has openJobCount above 0; at 390 px the header shows the words "Sign in".
- deps: B005   size: M
- ask: Should the held mark be a toggle on a job's skills? CLAUDE.md says both "never on a job's page" and "a toggle on Profile, on a job's skills". Default: read-only on the job page with the link to Profile; correct CLAUDE.md to say so.
- evidence: seeker#6, seeker#7, seeker#12, seeker#31, seeker#32, gap-applicant#2, gap-conditions#25, gap-jobs-search-memory#22; files: $UT/seeker/07-landing-phone.png, $UT/seeker/09-me-empty.png, $UT/gap-applicant/j1c-01-after-signup-phone.png

### B030 P1 Stop saying skills are "shown to a company when you apply" while every Apply leaves the site; remember where a person applied
- area: seeker
- kind: copy   reach: /me Skills, /settings Account; all 1,284 open jobs (0 posted by hand in production's copy)   verified: yes (select count(*) filter (where source is null) from jobs where status='open' = 0; strings grepped)
- is: Apply on every listed job opens the employer's page in a new tab and records nothing (no API call), so /me never shows Applications and the account dot never lights for a seeker. Yet /me says "Shown to a company when you apply." (SkillsSection.tsx:70) and Settings says "Name, email and ZIP code are shown to a company on application."
- want: those sentences are drawn only when the person has an in-app application; pressing Apply on a sourced job leaves a private line on the person's Profile ("Opened John Deere's careers site · Nov 26" under the job's name, removable), with no claim that the company knows.
- do: SkillsSection.tsx:70 and Settings.tsx: condition on the person's applications; new table job_visits (user_id, job_id, opened_at; idempotent migration + server/db/schema.ts); POST /api/jobs/:id/opened (requireUser, sourced jobs only, once a day per job); components/jobs/SourcedJob.tsx posts it on click for a seeker; GET /api/me/applications returns them as `elsewhere`; components/me/ApplicationsSection.tsx draws them as a second quiet list; DELETE to remove one; account deletion removes them.
- check: as a seeker press Apply on /jobs/john-deere/welder/40990 (outside requests blocked), open /me: the job is listed under the new heading; with no in-app application the words "Shown to a company" are not on /me or /settings.
- deps: none   size: M
- ask: Record outbound applies at all? Default: yes, private to the person, no employer-facing use.
- evidence: seeker#8, seeker#9

### B031 P1 Rank "Next" skills and "within reach" by the trade, not by shop basics
- area: seeker
- kind: ux   reach: /me goals (Next), Within reach, Closest careers, Suggested; a military career's "Civilian careers within reach" and its Missing lists   verified: tester
- is: next and missing are the first unheld skills in routeOrder() (level first): a Welder goal reads "Next: Shop Math, Forklift Operation, Overhead Crane Operation"; MIG Welder, Welder, TIG Welder and Metal Fabricator show the same three; TIG Welder's next is never TIG Welding; 'Overhead Crane Operation' leads 9 of a Navy HT's 22 reach rows. The reach share counts every skill alike: the five shop basics make Truss Builder (4 of 11) a welder's only career within reach; an HT reaches Saw Filer, Sign Fabricator and Production Operator; 2A7X1 reaches Woodworking Machine Operator (6 of 16); one shared fundamental lists Truss Designer "1 of 8" under Closest careers; a maintenance tech holding 8 of 23 is offered Laser Technician, not the careers her ladder leads to. Goals that share skills repeat them, and Suggested repeats them again.
- want: next and missing lead with the skills that set the career apart: skills of the career's home domain first, fewest-careers-using first (the taxonomy's `careers` count), then the rest in route order; for ranking, reach and closest ignore skills that more than a third of civilian careers use (the printed "N of M" stays the plain count), need one held skill in the career's home domain, and put the ladder neighbours of a goal first; a skill named as Next under one goal is not repeated under another on the same screen.
- do: shared/reach.ts (withinReach plus a `distinctive` helper), server/lib/reach.ts (civilianCareersWithinReach, reachOrClosest), server/routes/me.ts (goals `next`, careers/reach, skills/suggested); routeOrder() stays the order of a path itself; expectations in tests/unit/route.unit.ts, tests/api/seeker.sh, tests/api/military.sh; recount "98 of the 118 reach a civilian career" and correct CLAUDE.md.
- check: seeker with goal Welder holding only Blueprint Reading: GET /api/me/goals next[0] is an Arc welding skill; holder of the five shop basics: /api/me/careers/reach has no Truss Builder; on the HT's page the first Missing skill of Welder is a welding skill.
- deps: B013 (the wide Welder path shapes these lists)   size: M
- ask: Which skills count as shop basics is a product choice. Default: the frequency rule above, no hand-kept list.
- evidence: seeker#10, seeker#30, veteran#8, layout-keyboard#29, speed-words#5, speed-words#31, gap-applicant#21, gap-jobs-search-memory#21; also touches: veteran#5, gap-breakage#25; files: $UT/seeker/16-me-after-add.png, $UT/veteran/me-a.png

### B032 P1 Lead a seeker from a goal and from a career page to that career's open jobs near them
- area: seeker
- kind: missing   reach: /me goal rows; a career page's Open jobs for a signed-in seeker   verified: tester
- is: Within reach rows carry "14 open jobs" as a link; the goal row (Welder, 31 open jobs) has no jobs link or count; nothing on Profile uses the ZIP saved in Settings; /jobs opens on Iowa and Illinois for a Houston welder. A career page's five open jobs are John Deere in IA, IL and NC with no distance, and for a civilian seeker the page ends in "Military careers that reach this".
- want: each goal row carries "N open jobs" (to /jobs?career=<id>) and, when a ZIP is saved, "3 within 50 miles of 77002" (adding &near=); a career page's Open jobs for a seeker with a ZIP are nearest first with miles.
- do: GET /api/me/goals adds openJobs and nearJobs (users.home_zip through the ZIP centroid table of B027); components/me/GoalsSection.tsx row; GET /api/occupations/:id jobs take an optional `near`; OccupationDetailView.tsx passes the seeker's point.
- check: seeker with goal Welder and ZIP 78701: the goal row shows the count and its link opens /jobs narrowed to Welder near Austin.
- deps: B027   size: M
- evidence: seeker#11, seeker#29; also touches: seeker#26

### B033 P1 Let a veteran find a military job by its own title and from the Careers list
- area: search
- kind: bug   reach: 118 military careers; header search, Profile's career search, the Careers list   verified: yes (GET /api/search?q=hull maintenance technician&military=named is empty; q=navy hull finds it)
- is: a military career is found only when the query names its service or code (shared/military.ts readMilitaryQuery / namesCareer): 'hull maintenance technician' (the rating's official title), 'helicopter repairer', 'UH-60 helicopter repairer', 'aircraft metals technology', 'Hull Technician' and 'navy welder' return no career; Profile's search answers with Maintenance Technician. The Careers list has no text field though GET /api/occupations?military=1&search= finds by code: a veteran scrolls 118 rows (39 under Navy). Branch offers Marine Corps: "0 Marine Corps careers / No careers / Nothing matches these filters / Clear filters"; /companies/us-marine-corps lists "None yet." Nothing on the map, Explore's overview, Jobs or Profile says military careers exist; the only door is a switch on a tab that is clipped on a phone.
- want: a query that contains every word of a military career's official title (two words or more), or equals one of its stored other names, lists that career in the header search after the civilian careers, never leading; a plain trade word ("welder") still lists civilian careers only; the Careers list has a find field in both modes (title, other name, code); Branch lists only services that have careers; Explore's overview Careers section ends with one row "Military careers" to ?tab=occupations&military=1.
- do: shared/military.ts namesCareer: the whole-official-title rule and other names from data/careers/military/careers.json (`was`: add 'Hull Technician', 'UH-60', 'Black Hawk' and the like, then scripts/build-military-sql.mjs to a new migration); server/lib/military.ts namedMilitaryCareers; tests/unit/military-search.unit.ts; client/src/components/explorer/FilterBar.tsx: a search input bound to ?q= (BrowseList passes `search`), Branch options from GET /api/explore/facets militaryCareerDomains[].services; ExploreOverview.tsx row; CLAUDE.md "Military careers".
- check: curl 'localhost:3900/api/search?q=hull%20maintenance%20technician&military=named' lists Navy Hull Maintenance Technician; q=welder lists no military career; /explore?tab=occupations&military=1 has an input and "15T" leaves one row; Branch has no Marine Corps.
- deps: none   size: M
- ask: CLAUDE.md says a military career is reached on purpose (service or code in the query). Does its full official title count as on purpose? Default: yes, listed last among careers.
- evidence: veteran#0, veteran#9, veteran#10, veteran#11; also touches: veteran#12, visitor-explore#25; files: $UT/veteran/phone-hs-hull_maintenance_technician.png, $UT/veteran/d-careers-marines.png

### B034 P1 Decide whether a veteran can mark a military job's skills held in one step
- area: seeker
- kind: missing   reach: every veteran: 118 military careers, 10 to 30 skills each   verified: tester (CLAUDE.md confirms the door was removed on purpose)
- is: Profile asks nothing about service; the military career's page has no action; Profile's career search lists no military career ("No career matches HT"). To enter a Navy HT's 28 skills each is typed into "Add a skill" (28 searches and 28 presses; 44 s scripted). POST /api/me/careers/:id/held and /held/undo exist and no screen calls them (the owner removed "Start with what you have done").
- want: the owner's decision. If yes: one action for a seeker on a military career's page ("I did this job") marks its path held and leaves "Marked 28 skills held. Undo" until the page is left; nothing else changes.
- do: only if approved: client/src/components/entity/OccupationDetailView.tsx (military branch, behind useSeekerTools()), a mutation in lib/seeker.ts that invalidates the skills, goals and reach keys, the Undo line through /held/undo { at, added, raised }; CLAUDE.md "Military careers" and "Seekers"; tests/api/military.sh already covers the routes.
- check: as a seeker on /occupations/52d85de0-f571-4ce6-84dc-ff8702bf8703 press the action: GET /api/me/skills has 28 held; Undo returns to the count before.
- deps: none   size: S
- ask: Put "I did this job" back, on the military career's page only? Default if unanswered: build nothing (the door was removed on purpose).
- evidence: veteran#1; files: $UT/veteran/phone-me-search-HT.png, $UT/veteran/phone-me-after-marking.png

### B035 P1 Order and date jobs by when they were last seen on the careers site
- area: jobs
- kind: data   reach: /jobs and every list of jobs: 163 open jobs posted over 180 days ago, 33 over a year (oldest 2024-02-07); 22 undated jobs   verified: yes (counts from the copy)
- is: the 22 undated jobs (the feed gives no date; posted_at is the first sighting) sort as the newest: rows 1-15 of /jobs are John Deere "Listed 3 days ago" and 21 of the first 24, so "one job of each company in turn" does not show. Postings from 2024 and 2025 read "Posted on Feb 7, 2025" as if current.
- want: a sourced job's row and page date it by its last complete sighting ("On the careers site Nov 24", last_seen_at through formatDay), with the feed's own date as a second quiet fact only when under 60 days old; jobsInOrder() takes companies in turn across a 7-day window, so one board's first read cannot fill the first screen; older postings stay listed and never rank above newer ones.
- do: server/lib/openJobs.ts jobsInOrder(): bucket by week of the dated posted_at (undated: the first sighting), round-robin by company inside a bucket; client/src/pages/Jobs.tsx row and components/jobs/JobFacts.tsx date line; CLAUDE.md "Job postings" on "Listed" and "Posted"; tests/api/jobs.sh order case.
- check: GET /api/jobs?limit=20 has at least eight companies among its first 20 rows; no row or page reads "Posted on <a date over 60 days old>".
- deps: texas-scope (it changes the order: Texas first, food last within a day; fold this rule into it)   size: S
- ask: Hide postings older than 180 days? Default: keep them (they are still on the employer's site), dated by last sighting.
- evidence: seeker#15, gap-jobs-search-memory#10; also touches: data-as-shown#17, speed-words#22, seeker#26; files: $UT/gap-jobs-search-memory/j1-desk-top.png

### B036 P1 Fold repeated postings into one row and keep jobs off rows that are not factories
- area: jobs
- kind: data   reach: 36 title+factory groups hold 80 open jobs; tester: 82 title+company pairs spread over several factories (197 jobs)   verified: yes (36 groups / 80 jobs in the copy)
- is: Anduril 'Senior Electrical Engineer' six times at one factory, 'Manufacturing Engineer' five; two identical John Deere Waterloo rows side by side on /jobs; Boeing 'Experienced or Senior Mechanical System Design Engineers' four times on its company page (St. Clair, St. Charles, St. Louis, 'BOEING COMPANY THE ST LOUIS BLDG 306'); one posting is two jobs where a company has two rows for a site ('Boeing Auburn' and 'BOEING AUBURN ALGONA WHSE'); an Aircraft Painter sits on 'BOEING AVIONICS REPAIR FACILITY'; SpaceX 'TIG Welder (Starship)' twice.
- want: in any list, open jobs with the same company, factory, career and title are one row saying "N openings" (each keeps its own page, reached from the row's page); on a company-wide list a posting at several sites is one row saying "N places"; no job is attached to a row B004 removes.
- do: server: the list reads (server/routes/jobs.ts GET /, the `jobs` on record answers, the map overviews) group by (company_id, factory_id, occupation_id, lower(title)) and return `openings` with the newest serial; rows (Jobs.tsx JobCard, the record pages' job rows) print it; the job page gains "Other openings like this"; posting_decide's tie-break (scripts/posting-decide.sql; a new generated migration) never prefers a row whose name says warehouse, office or terminal (the pattern file of B004).
- check: GET /api/jobs?q=senior%20electrical%20engineer returns one Anduril Costa Mesa row with openings 6; the /jobs count line states what it counts.
- deps: job-names (when a job is named by its career alone, identical rows multiply: land this with it or right after); B004   size: M
- evidence: data-as-shown#14, speed-words#3; also touches: employer#32; files: $UT/speed-words/full-jobs-desktop.png, $UT/data-as-shown/shots/c-boeing.png

### B037 P1 Give admins a way to correct or hide a job from a careers site
- area: admin
- kind: missing   reach: all sourced jobs (1,284); Admin Tools has no jobs anywhere   verified: tester
- is: an admin sees no Edit on a job's page; Records searches companies, factories, careers and skills only; a sourced job's career, factory and visibility cannot be corrected from the product (PATCH answers 409), so a wrong career or a non-manufacturing posting stays until the reader's data changes.
- want: on a sourced job's page an admin sees Edit: set the career (civilian catalogue), set the factory (one of the company's), hide. The correction is stored against the posting's outside id so the next run keeps it; it is audited and can be taken back.
- do: new table posting_overrides (source, source_id, occupation_id, factory_id, hidden, decided_by, decided_at; migration + server/db/schema.ts); posting_decide and posting_apply read it (scripts/posting-decide.sql; a new generated migration replacing the functions); PATCH /api/admin/jobs/:id; client/src/pages/JobDetail.tsx admin strip (as Edit on record pages); server/lib/recordSearch.ts lists jobs by title in Records; recordAudit lines; tests/api/postings.sh.
- check: as admin set job 40990's career to MIG Welder: its page and /jobs say MIG Welder; node scripts/ingest/run.mjs postings --rehearse keeps it; the audit line is in History.
- deps: job-names; B011 (fix the rule first; the override is for the remainder)   size: L
- evidence: admin#10

### B038 P1 Start a hand-posted job from no skills chosen, not the whole path marked required
- area: employer
- kind: data   reach: POST /api/jobs and the job form for every career; the applicant ranking and the new-applicant email (0 hand-posted jobs in production's copy today)   verified: yes (server/routes/jobs.ts:551-554 read)
- is: with no `skills` sent, POST /api/jobs takes routeOf(career) up to 60 skills and sets required = (level is not 3); the form pre-tags the same. A Welder job posts with 17 required skills (TIG, Stick, Stainless, Aluminum, Oxy-Fuel ...) under "The skills Kohler lists for this job."; Maintenance Technician with 20 required. Applicants are "Ranked by required skills held": a certified welder who marked nothing on her profile shows "0 of 17", "Missing 17", ranks last, and her note is not hinted on the closed row; the email says "They hold 0 of the 17 required skills" while she saw "You hold 4 of 20".
- want: choosing a career offers its skills as unchosen chips by group (a company version preselects that version's skills); nothing is required unless the poster says so; POST /api/jobs without `skills` stores none; an applicant with no marked skills reads "No skills on their profile" and is ordered by time; a note shows on the closed row; one figure (held of the job's skills) in the page, the list and the email.
- do: server/routes/jobs.ts:540-556: default [] (with a version: its skills, required false); client/src/components/jobs/JobForm.tsx skills step ("Which of these does the job use?") and JobSkillTags.tsx; components/jobs/ApplicantList.tsx wording and note marker; server/lib/emailTemplates.ts: the new-applicant line counts the job's list and drops the figure when the applicant has no marks; tests/api/jobs.sh.
- check: POST /api/jobs for Welder with no skills: GET returns skills []; the form shows none chosen; an applicant with no skills reads "No skills on their profile".
- deps: B001 (the same rule: a job is its own combination)   size: M
- evidence: employer#2, employer#3, gap-applicant#1, gap-hiring-scale#2, gap-admin-people-layout#9; also touches: employer#21, gap-applicant#6; files: $UT/employer/38-after-post.png, $UT/employer/59-applicants-desk.png, $UT/gap-hiring-scale/j5-form-filled-desk.png

### B039 P1 Guard shared company records against stale writes
- area: employer
- kind: bug   reach: applicant stage changes and job edits wherever two people manage one company   verified: yes (server/routes/jobs.ts:884-891 read: only the row's state during the request is checked)
- is: the client never sends the stage it saw and the list does not refetch (refetchOnWindowFocus off, staleTime 5 min): member A set Interview; member B, still seeing Applied, declined 7 s later; both were accepted, the applicant got "Interview" then "Declined", A's page kept showing Interview, B's Undo was drawn from the stale value. PATCH /api/jobs/:id sends every field: B's title edit silently put back the pay A had just changed.
- want: a stage change carries `from` (the stage shown) and answers 409 "<Name> moved this applicant to Interview 10 seconds ago" when it differs; a job edit sends only changed fields or an `ifUpdatedAt` precondition (409 naming what changed); the applicant list and the manage panel refetch on window focus and every 60 s while visible; a stage's history says who.
- do: server/routes/jobs.ts: applications PATCH (`from`), job PATCH (`ifUpdatedAt` against jobs.updated_at); client/src/lib/employerJobs.ts (changed-fields body), components/jobs/ApplicantList.tsx (send `from`; refetch options on the employer keys in lib/queryKeys.ts); application_events already holds the actor: show "by <name>" to the company's people.
- check: tests/api/jobs.sh: two stage PATCHes with the same `from`: the second = 409; an edit with a stale ifUpdatedAt = 409.
- deps: none   size: M
- evidence: gap-hiring-scale#0, gap-hiring-scale#1; files: $UT/gap-hiring-scale/j7-b-after-decline.png

### B040 P1 Hold a notice email until its action can no longer be undone
- area: system
- kind: bug   reach: stage-change emails to applicants, access decisions to requesters, access requests to admins   verified: yes (sent inline: server/routes/jobs.ts:893, admin.ts:171/206/218, employer.ts:171; outbox seen by four testers)
- is: every stage pick emails at once: five emails in a minute, among them "marked your application as hired" that was then taken back; "declined" then "Reviewing" a minute later; the page offers "Marked declined. Undo" after the email has gone. Admin Approve sends "You can now post jobs for John Deere"; Undo takes the approval back and no correction follows; decline, undo, decline sends two declines. Request access, Cancel request, Request access sends a new email to every admin each time (9 emails for 3 presses). The Hired email gives no next step; Interview and Offer say the company will write to this address.
- want: a notice for a reversible action is queued and sent after a hold (stage changes 10 min; access decisions the Undo window, 60 s); a reversal inside the hold cancels it; one email per application per hold stating the latest stage; one access-request email per requester and company per 24 h; no email states something that was already taken back.
- do: server/lib/notices.ts: write intents to notice_log with send_after and a collapse key; a sender runs at the start of later requests and from a Vercel cron (vercel.json crons to an internal route; the one function has no worker); cancel on undo (memberships PATCH decision 'reopen', a stage moved back); server/lib/emailTemplates.ts: the Hired line gains the contact sentence; tests/api/email.sh with the hold read from env.
- check: tests/api/email.sh: Approve then Undo inside the hold leaves 0 lines in the outbox; Interview, Offer, Interview inside the hold gives one email saying Interview; three request and cancel cycles give one admin email.
- deps: none   size: M
- ask: Hold lengths (10 min for stages, 60 s for access)? Default as written.
- evidence: employer#20, admin#8, gap-applicant#12, gap-hiring-scale#8

### B041 P1 Always name and link the company on a factory's page and panel
- area: records
- kind: bug   reach: factory pages whose name equals the company's (about 4,064 rows); every map factory panel of a company with no description (27,792 companies)   verified: tester (FactoryView.tsx:57-60 cited)
- is: /factories/e2a8f682-59a6-49a9-a302-8206fd29b953: no Company tag and the mark before the name is not a link; the page's only link is "Open on the map". The map's factory panel prints the company's name only inside the company paragraph: Giga Texas shows a "T" lettermark and no "Tesla" until the heading "More Tesla factories".
- want: every factory page has the Company tag (RecordTag) under its name whatever the two names are; every factory panel says the company's name on the line under the factory's name and carries the "Company page" button.
- do: client/src/components/entity/FactoryDetailView.tsx: draw CompanyTag unconditionally; components/map/panel/FactoryView.tsx: the name line outside the description branch.
- check: both addresses above contain a link to /companies/<id>; /map?factory=a269b614-91d5-4b91-9072-f8aa0f5f33cd shows the word "Tesla" under "Giga Texas".
- deps: none   size: S
- evidence: visitor-map#3, visitor-records#8; files: $UT/visitor-map/fac-phone-giga.png, $UT/visitor-records/shots/f-precious-phone.png

### B042 P1 Close the dead ends on industry pages
- area: explore
- kind: missing   reach: /industries/<slug> for the country, every state and focus area   verified: tester
- is: Open jobs ends in plain text "and 516 more" (no link; /jobs has no industry filter). Companies stops at ten rows with no "All N" though the figure above says 26, 65 or 2,162. The Factories section is not drawn when no factory in the place has a headcount (/industries/food?area=san-antonio: 27 factories, no list) and is one row plus "All 79 factories" where one has (/industries/leather). "Where · Show all 12" opens 12 cities of Texas's 128. Where rows put official People beside listed Factories with blank cells (Maine 1,218 / blank). ?area=bogus says '"bogus" is not a state.' and keeps the address. The place picker lists District of Columbia after Wyoming.
- want: every "N more" is a link to the full list filtered the same way; a section is drawn whenever its count is not zero; "Show all N" shows N or is labelled "N largest"; a zero is written 0; an unknown place says it is not a place we list and the address is cleaned.
- do: server/routes/jobs.ts GET /: an `industry` filter (the factory's primary_naics_description, by the 21's slug) and /jobs names it in its count line; client/src/pages/Industry.tsx: links for jobs and companies (to /explore?tab=companies&industry=&state= or &area=: B043); largestPlants in server/routes/industries.ts falls back to name order when no headcount exists; the cities answer returns all or is labelled; components/industry/parts.tsx FigureList zero cells and the year beside People; shared/states.ts order in the picker.
- check: /industries/transportation-equipment: "All N open jobs" is a link and /jobs?industry=transportation-equipment lists them; /industries/food?area=san-antonio has a Factories section ending "All 27 factories"; tests/api/industries.sh.
- deps: B043; sectors (may replace these pages' company lists)   size: M
- evidence: visitor-explore#9, visitor-explore#33, gap-addresses-head-industries#14, gap-addresses-head-industries#15, gap-addresses-head-industries#16, gap-addresses-head-industries#18, gap-addresses-head-industries#20; files: $UT/gap-addresses-head-industries/s-sa-food.png, $UT/gap-addresses-head-industries/s-ind-leather.png

### B043 P1 Add a find field and a place filter to Explore's lists
- area: explore
- kind: missing   reach: Companies (27,902 rows), Factories (43,132), Careers (231 + 118), Skills   verified: tester (API totals reported for state=TX and state=ZZ)
- is: no Explore list has a text field: one company among 27,902 is found only by leaving for the header search. The Companies list ignores ?state= (GET /api/companies?state=TX and ?state=ZZ both total 27,902); its only filter is industry. No list narrows to a focus area: the overview's Austin tile and "By state" rows open the map.
- want: each list has one find field (?q=: name and other names; debounced; in the address); Companies and Factories take ?state= and ?area= (a company is in a place when it has a factory there; figures and order are of that place through companyStandings); an unknown state is 400.
- do: server/routes/companies.ts list: state and area conditions (server/lib/scope.ts, companyFilters.ts) and `search`; server/routes/factories.ts: `area` (the FOCUS_AREAS ring and bounds, as the map overview) and `search`; client/src/components/explorer/FilterBar.tsx and BrowseList.tsx; the overview's focus-area tiles link to ?tab=factories&area=<id> beside "Open on the map".
- check: curl 'localhost:3900/api/companies?state=TX' total is under 27,902 and its first row is a Texas employer; ?state=ZZ = 400; /explore?tab=companies&area=austin lists Austin's companies; typing "deere" narrows the list.
- deps: sectors (adds a sector filter to the same bar)   size: M
- evidence: visitor-explore#24, visitor-explore#25, data-as-shown#11; also touches: veteran#9, gap-addresses-head-industries#14, gap-addresses-head-industries#26

### B044 P1 Stop spending a record page's first screen on a one-dot US map; put what is known first
- area: records
- kind: ux   reach: every company and factory page; 98.5% of factories have no people, 96.5% no street address, 99% of companies no description, 23,522 companies have one factory   verified: yes (counts from the copy; screenshots c-gra.png, f-akm.png read)
- is: a typical page is a name, "Gardner, MA · Fabricated metal products", a 450 px outline of the whole country with one dot, and one row repeating the name. At 1440x900 and 1920x1080 the first screen of Boeing or John Deere is the heading and the map: no factories, jobs or careers. A factory's street address stands alone under the map, far from "City, ST" in the heading.
- want: FootprintMap is drawn only for a company with factories in three or more states; a factory page has no outline map (its action is "Open on the map"); a factory's full address is one line under its name ("1 Electric Avenue, Sparks, NV 89434"); a single-factory company leads with the factory's facts.
- do: client/src/components/entity/FootprintMap.tsx (condition, height), CompanyDetailView.tsx, FactoryDetailView.tsx, RecordFacts.tsx (the address line).
- check: /factories/c554e9af-c759-42b6-bce5-e769497fc0ca: the address is one line directly under the heading and there is no US outline; /companies/john-deere at 1440x900: the "Open jobs" heading is visible without scrolling.
- deps: none   size: S
- evidence: visitor-records#9, visitor-records#13, visitor-records#14, data-as-shown#7, layout-keyboard#22; files: $UT/data-as-shown/shots/c-cw-phone.png, $UT/visitor-records/shots/c-boeing-desk-first.png, $UT/visitor-records/shots/v-fac-1440-light.png

### B045 P1 Shrink the pins answer and say that factories are loading
- area: perf
- kind: perf   reach: every first load of /map; worst on a phone network   verified: yes (5,525,212 bytes; Cache-Control: public, max-age=0, s-maxage=300)
- is: GET /api/factories/pins is 5.5 MB of JSON (2.39 MB gzipped): 43,132 pins each with a 36-character uuid and the raw capitals name and city, plus a 27,995-entry company array (723 KB). A 304 still runs the whole query and serialisation (330-440 ms locally; 3.0 s in a browser on a second visit). On Fast 3G with 4x CPU the map shows states and no factory after 30 s and nothing says factories are loading (the spinner covers the basemap only); in headless Chromium the eastern half of the pins arrived about 2.5 s after the west.
- want: the pins answer is under 800 KB gzipped (short ids, names formatted once and deduplicated or fetched for the hover card, coordinates as integers); the browser keeps it 5 minutes and a revalidation costs a cheap version check (count and max(updated_at)); a "Loading factories" line stands beside the search until pins are drawn.
- do: shared/pins.ts packPins and its reader (version the format); server/routes/factories.ts /pins: the version check before building, Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate; client/src/lib/queries.ts usePins and components/map/Map.tsx: the loading line; MapHoverCard.tsx reads names from the packed table (already formatted: B017, B018).
- check: through the page origin with compression the pins answer is under 800,000 bytes; a request with If-None-Match answers 304 in under 30 ms; Playwright throttled to Fast 3G shows the loading line, then pins.
- deps: B018 (which name the pin carries)   size: L
- evidence: visitor-map#28, layout-keyboard#41, speed-words#1, speed-words#12; files: $UT/speed-words/shot-map-phone3g.png, $UT/layout-keyboard/slow-_map-20000.png

### B046 P2 Give a job row one shape everywhere
- area: jobs
- kind: consistency   reach: /jobs, the job rows on company, factory, career, skill and industry pages, map panels, Your jobs   verified: tester
- is: /jobs rows: some show pay, some "Full-time ·", some a clock icon with the shift; the career sits on the shift line, on its own line, or is absent (a row whose title equals its career drops it; Flex's 'Automation Technician' shows only "Full-time"); a hand-posted row has a third line "Full-time · Welder" and a careers-site row has none; a pin icon and a clock icon in every row; pay as "$22–$28 an hour" beside "$24.50–$31.00 an hour"; Kohler and Dal-Tile show lettermarks.
- want: a job row is two lines and no icon: line 1 the job's name; line 2 "Company · City, ST" (the company dropped on its own page, the place dropped on a factory's page); pay at the right only where stated; type and shift are on the job's page, not the row; pay through one formatter that never prints ".00".
- do: one JobRow in client/src/components/jobs/ used by pages/Jobs.tsx (JobCard, about line 380), the record views' job lists, components/map/panel and pages/Employer.tsx; lib/jobFormat.ts pay; a unit test for the formatter.
- check: /jobs at 390 and 1440: every row has two text lines and no svg; no row contains ".00 an hour"; npm run test:unit.
- deps: job-names (it changes line 1 and the place: build on it)   size: S
- evidence: seeker#25, speed-words#24, gap-applicant#27, gap-admin-people-layout#27; also touches: layout-keyboard#16

### B047 P2 One grey line per kind of row on record pages
- area: records
- kind: consistency   reach: company pages (Factories, subsidiaries), industry pages (Companies, Factories, Where)   verified: tester
- is: a company's factory rows end in the industry ("Waterloo, IA · 3,184 people · Machinery"), or in the products sentence wrapping to two lines or cut ("Four-wheel-drive lo…"), or in nothing after the city (Raytheon); Anduril Santa Ana's products line is a filler clause. Subsidiary rows say "41 factories" / "90 factories" though people are known (Collins Aerospace 29,347; Raytheon 21,107) and 'Atlantic Inertial Systems' has an empty grey line. Industry pages: company rows read "1 factory", "2 factories" or "People at 3 of 4 factories"; factory rows sometimes name the company ("W&W|AFCO Steel · San Angelo") and sometimes only the town; Where lists cities without a state.
- want: a factory row is its name over "City, ST · N people" (people only when recorded); products and industry are never on a row inside one company's page; outside it a factory row reads "Company · City, ST"; a company row anywhere shows companyFigure and nothing else.
- do: client/src/components/entity/CompanyDetailView.tsx (factory rows; subsidiaries through companyFigure in lib/utils.ts), pages/Industry.tsx rows, components/layout/Page.tsx RecordRow.
- check: /companies/john-deere: no factory row carries products or an industry; /companies/rtx: Collins Aerospace's row reads "29,347 people"; /industries/fabricated-metals?state=TX factory rows all read "Company · City, ST".
- deps: sectors (the industry label); B003 (coverage wording)   size: S
- evidence: visitor-records#16, visitor-records#17, data-as-shown#23, layout-keyboard#20, gap-conditions#40; also touches: gap-addresses-head-industries#35, data-as-shown#22

### B048 P2 One way on and one row shape in the map's panels
- area: map
- kind: consistency   reach: company, factory, career, skill, state, area and place panels   verified: tester
- is: the company panel ends its jobs with a bordered button "All 21 open jobs"; area, state and place panels with a small grey text link "All 162 open jobs"; the career panel with a plain sentence "and 28 more on the career's page" (no link); factories with "and 15 more on the map" plus a button; careers with "and 5 more on the company's page" (text). A tap on a company or career row makes it the map's subject and the camera jumps to the whole country (the Austin context is lost); a job or industry row leaves the map. Rows: a factory icon in some panels, a company lettermark in place panels, a briefcase on career rows (CLAUDE.md: no icon per row); place-panel factory rows give the city with no state; the career panel's job rows show no company or place; company rows switch between "N people", "N open jobs" and "N factories" in one list.
- want: every "rest of the list" is the ListLink button to the full list; no icon per row (a company's mark may lead its row); factory rows "Name / City, ST"; job rows as B046; a company row pressed from an area or state panel keeps that place (the subject is framed inside it).
- do: client/src/components/map/panel/parts.tsx (ListLink, RowList) and CompanyView.tsx, FactoryView.tsx, OccupationView.tsx, SkillView.tsx, RegionViews.tsx; components/map/camera.ts for a subject within an area.
- check: rg -n "more on the" client/src/components/map/panel shows only ListLink uses; the panels at /map?area=austin, ?company=john-deere, ?career=<Welder id> and ?skill=<MIG id> have no icon inside a row.
- deps: job-names (job rows)   size: M
- evidence: visitor-map#17, visitor-map#18, gap-conditions#34; also touches: gap-conditions#35, visitor-map#12

### B049 P2 Give search rows one short meta line
- area: search
- kind: consistency   reach: header search and map search results   verified: tester
- is: a career row's second line is its whole description cut mid-sentence ("Joins metal with several processes (stick, MIG, flux-c..."); an industry row's is a full sentence; companies and factories get a short line; a factory's company is dropped when the factory's name contains it ("Welderaft Inc / Kenosha, WI") and shown otherwise ("Airgas · Tye, TX"); 'Tesla Power and Automation' the company and its factory repeat one name; some companies have no grey line.
- want: career: its home domain, or "Also called X" when found by another name; industry: "N factories"; factory: always "Company · City, ST"; company: its figure or nothing; no result row carries a sentence.
- do: server/routes/search.ts subtitles; client/src/components/search/results.ts; tests/unit/search-results.unit.ts; CLAUDE.md "Search".
- check: Ctrl K "welder": no row's second line is longer than 48 characters or ends in an ellipsis.
- deps: B025   size: S
- evidence: visitor-map#14, visitor-explore#13, visitor-explore#14

### B050 P2 Write every day one way
- area: copy
- kind: consistency   reach: /jobs rows, job rows elsewhere, Admin History   verified: yes (client/src/lib/dates.ts formatAgo read)
- is: /jobs rows use formatAgo (lib/dates.ts:43-50): "Listed 2 days ago", "Posted 25 days ago", then "Posted on Oct 27, 2026" (this year, with the year), while the job's page says "Listed Nov 24" (formatDay). Admin History prints "Nov 26, 2026, 11:36 PM".
- want: today, yesterday, then "Nov 18", the year only when it is not this one, on every screen (CLAUDE.md, Words); only History adds the time.
- do: pages/Jobs.tsx JobCard to formatDay; remove formatAgo; components/admin/HistoryList.tsx year rule.
- check: rg -n formatAgo client/src finds no caller; /jobs shows no "days ago" and no "Posted on".
- deps: B035 (which date a row shows); job-names   size: S
- evidence: visitor-explore#18, employer#32, layout-keyboard#15, speed-words#23, gap-conditions#22, gap-jobs-search-memory#11; also touches: visitor-map#30, seeker#25, gap-admin-people-layout#24, gap-admin-people-layout#27

### B051 P2 Write experience under a year in months
- area: jobs
- kind: copy   reach: every job whose requirements.yearsMin is a fraction (the John Deere production jobs)   verified: yes (API: requirements.yearsMin 0.5; screenshot reads "0.5 years or more")
- is: client/src/components/jobs/JobFacts.tsx years(): "EXPERIENCE 0.5 years or more".
- want: "6 months or more"; any value under one year in months; 1.5 reads "18 months".
- do: JobFacts.tsx years() with a unit test.
- check: /jobs/john-deere/welder/40990 reads "6 months or more".
- deps: none   size: S
- evidence: visitor-explore#19, layout-keyboard#12, speed-words#19, gap-conditions#1, gap-addresses-head-industries#33; also touches: visitor-records#23, seeker#14, data-as-shown#17, employer#19

### B052 P2 One held figure, and never "0 of"
- area: seeker
- kind: consistency   reach: job pages, career pages, /me goals and skill groups, the employer's applicant rows   verified: tester
- is: a seeker holding nothing sees "You hold 0 of 20" on a job and "· 0 of 2" on each of its eight group lines; a new goal reads "0 of 20 skills held"; the career page never says "0 of". One group has two wholes: /me "Arc welding · 5 of 9" (the taxonomy's group) against "5 of 7" on the Welder career and job (the path's share); "Shop basics · 1 of 3" against "1 of 2". On a hand-posted job the seeker reads "You hold 7 of 17" while the employer's row for the same person reads "7 of 15" (required only). One-skill groups show no count while others do.
- want: "N of M" is drawn only when N is 1 or more (else the plain count); Profile's group line counts the person's held skills of the group without borrowing a path's denominator ("Arc welding · 5 held"); the job page, the applicant list and the email count against the same list.
- do: client/src/components/jobs/JobSkills.tsx (reuse the group line of components/route/RouteSection.tsx), components/me/GoalsSection.tsx and SkillsSection.tsx, components/jobs/ApplicantList.tsx.
- check: a seeker with no skills on any job page sees no "0 of"; /me goal row reads "20 skills".
- deps: B001; B038   size: S
- evidence: seeker#21, seeker#37, gap-applicant#6, gap-conditions#2, gap-jobs-search-memory#2

### B053 P2 Keep /jobs filters in history and in sight
- area: jobs
- kind: bug   reach: /jobs for everyone who filters   verified: yes (client/src/pages/Jobs.tsx:94,115,120 write with replace; behaviour tester)
- is: every change to What, Where, distance and Clear writes the address with replace: after six changes Back leaves /jobs for the page before. The count line drops what the list is narrowed to: "285 jobs match" (never "in Texas"); ?company=&q= says "7 jobs match" with no John Deere; ?company=&career= says "2 open jobs for CNC Machinist"; with ?career=Welder and a place the career's line disappears and the empty state says "fits these filters" with only the place in sight. Text typed in Where and left with Tab is thrown away silently; "Houst" + Enter before the lookup returns leaves "Houst" in the field over an unfiltered list. ?company=not-a-uuid and ?near=garbage show every job with no word; a valid unknown id shows "No jobs match"; ?state=ZZ puts "ZZ" in Where; ?within=0 or 5000 stays in the address while 50 is used.
- want: a committed choice (a place picked, Enter in What, a filter from a link) pushes a history entry and typing replaces; the count line names every filter in force (company, factory, skill, career, place), each removable; Where commits its first option on Enter or restores the last value in sight; a bad parameter gives one line ("That company is not listed.") and is cleaned from the address.
- do: client/src/pages/Jobs.tsx (push or replace; summary and narrowedTo), components/jobs/JobPlaceFilter.tsx (blur and Enter).
- check: Playwright: /explore, /jobs, choose Texas, type "technician" + Enter, Back: Texas is still chosen; /jobs?company=<John Deere id>&q=welder count line contains "John Deere"; /jobs?state=ZZ shows the line and the address becomes /jobs.
- deps: none   size: M
- evidence: veteran#21, gap-jobs-search-memory#4, gap-jobs-search-memory#5, gap-jobs-search-memory#7, gap-jobs-search-memory#9; also touches: seeker#3

### B054 P2 Make "jobs in a focus area" and "jobs near a place" mean what they say
- area: jobs
- kind: consistency   reach: the map panels' "All N open jobs" links; /jobs?near=   verified: tester
- is: the Austin panel's "All 162 open jobs" opens /jobs?near=...&within=50: a 50-mile circle, not the five counties; nearest-first puts one employer's 50 jobs at one point first (Saronic, 3.5 miles), then 110 SpaceX Bastrop rows; within 25 and within 50 return the same 162.
- want: /jobs?area=<id> filters by the focus area's ring (as the map overview counts) and names the area in the count line; with near, jobs at the same distance (to the mile) take companies in turn.
- do: server/routes/jobs.ts GET / (`area` through FOCUS_AREAS; the near order), components/map/panel/RegionViews.tsx link, pages/Jobs.tsx count line.
- check: /jobs?area=austin total equals GET /api/map/areas/austin/overview openJobs; the first ten rows near Austin show three companies when three have jobs within 30 miles.
- deps: texas-scope (the order); B035   size: S
- evidence: visitor-map#30, gap-jobs-search-memory#13

### B055 P2 Match whole words in the jobs search
- area: jobs
- kind: bug   reach: /jobs ?q=   verified: tester
- is: the "what" field matches inside words (server/lib/jobSearch.ts): "entry" returns four "Sentry" Quality Engineer jobs among 12; "welder" returns 51 with 'OFP Quality Engineer - Weld' first. There is no way to list jobs that ask for no experience: no filter, no level on rows, and career search has nothing for "entry level" or "apprentice".
- want: each typed word matches at a word start; a title or career equal to the query ranks first.
- do: server/lib/jobSearch.ts (word-start pattern through likeLiteral, or a tsvector prefix), the order for an exact title; tests/api/jobs.sh.
- check: GET /api/jobs?q=entry returns no title containing "Sentry"; q=welder's first row is a welder.
- deps: none   size: S
- ask: Add a "No experience asked" filter (requirements.yearsMin absent or 0)? The owner said no levelling system yet. Default: the word-start fix only.
- evidence: seeker#17, seeker#18

### B056 P2 Give a closed job's address a page that says so and leads on
- area: jobs
- kind: ux   reach: every old link to a closed or expired job (emails, bookmarks, search engines)   verified: tester
- is: once closed, everyone but the job's applicants and managers gets "This job is not available. It may have been filled or closed, or the link is wrong." with one button (GET /api/jobs/by-number/:n = 404): no company, career or factory, nothing to go on to. Pressing Apply on a job closed meanwhile prints "This job is not taking applications." while the page still shows the open job.
- want: the address of a closed or expired job answers with a stub (name, company, career, factory, the day it closed) headed "Closed Nov 26", with the career's and the company's open jobs under it; an Apply that meets a closed job refreshes the page to that state.
- do: server/routes/jobs.ts by-number and /:id: for a job that is not open return { job: <stub>, closed: true } (no description, no applicants); client/src/pages/JobDetail.tsx closed view reusing the `others` lists; the apply error invalidates the job's query.
- check: close a job, open its address signed out: the page names the job, says Closed and lists other jobs.
- deps: none   size: M
- evidence: gap-applicant#8, gap-applicant#9

### B057 P2 Do not wrap a single skill in a group disclosure
- area: records
- kind: ux   reach: career pages and company versions: 1,184 of 2,013 groups on civilian paths hold one skill   verified: tester
- is: Tire Builder's 8 skills are 7 disclosures, each "Group · 1" over its one skill's name; Saw Filer's 12 skills are 6, four of one; a Navy HT's 28 skills are 13 groups, five of one, with the welding groups parted by Measurement, Inspection and Safety. Opening a group of one adds a tap and nothing else.
- want: a group of one is a plain row (the skill's name, its group quiet beside it) with no disclosure; "Open all" counts only groups of two or more.
- do: client/src/components/route/RouteSection.tsx and Route.tsx (grouped mode); shared/route.ts groupRoute marks singles.
- check: /occupations/<Tire Builder id>: no disclosure button controls a single skill.
- deps: the career page's skills are being redrawn as a connector tree in /home/user/wt-tree (not one of the four builds): read that branch before touching components/route   size: S
- evidence: veteran#15, data-as-shown#19, layout-keyboard#43, gap-admin-queues-editors#35

### B058 P2 Make a military career's "within reach" rows lead somewhere
- area: records
- kind: missing   reach: 118 military career pages   verified: tester
- is: a row is the career and "N of M skills": it does not say whether a job is open (Profile's Within reach does: "31 open jobs"); Shipfitter (13 of 18, the HT's first row) has no job anywhere. Missing skills are plain text, not links. Aircraft Mechanic reads "15 of 21 skills" with no word that the job is gated by the FAA A&P certificate. Army Wheeled Vehicle Mechanic (91B, 12 skills) reaches nothing and its page simply ends.
- want: each row carries "N open jobs" as a link to /jobs?career= when above 0; each Missing skill links to its page; a military career that reaches none lists its three closest civilian careers under "Closest civilian careers".
- do: server/lib/reach.ts civilianCareersWithinReach adds openJobs (jobIsOpen()) and the closest fallback (as reachOrClosest); client/src/components/reach/CivilianReach.tsx; tests/api/military.sh.
- check: /occupations/52d85de0-f571-4ce6-84dc-ff8702bf8703: the Welder row shows its open jobs link and Missing skills are links; /occupations/5d89eb94-... shows the Closest list.
- deps: B031 (order of Missing)   size: S
- ask: Record the credential a career is gated by (A&P, a welder qualification) as a fact on the career? Default: no; say nothing.
- evidence: visitor-records#30, veteran#6, veteran#7, veteran#26

### B059 P2 Tidy the company page: its subsidiaries' heading, its states line, long names
- area: records
- kind: ux   reach: company pages   verified: tester
- is: a section headed "Companies" on a company's own page lists its subsidiaries (A & I Products on John Deere; a raw-named row on Boeing): it reads as other companies. The states line "California 83 · ... · 24 more": "24 more" is a paragraph, not a control, and the states are not links (CLAUDE.md: chips for states that open on the map). The fact line "140 people at 1 factory" on Bimbo's 66 factories reads as broken; headcount lines carry a year on some factories and not others. On a phone the 40 px mark is centred against a five or six line title and squeezes it.
- want: subsidiaries are headed "Part of <Company>" (the companies it owns); states are chips to /map?company=<id>&state=<ST> and "24 more" opens them; the people line uses B003's coverage wording and a year whenever one is recorded; on a phone a name over two lines stands under its mark, not beside it.
- do: client/src/components/entity/CompanyDetailView.tsx, RecordFacts.tsx, components/layout/Page.tsx DetailHeader.
- check: /companies/john-deere: the heading over A & I Products names John Deere; /companies/boeing: "24 more" is a button that lists the states.
- deps: B003   size: S
- evidence: visitor-records#15, visitor-records#18, layout-keyboard#19, layout-keyboard#23, gap-addresses-head-industries#35; also touches: visitor-records#16

### B060 P2 Make Explore's overview and default orders say something
- area: explore
- kind: consistency   reach: /explore overview; the Careers list   verified: tester (server/routes/explore.ts:101 cited: WHERE c.featured)
- is: the overview's company tiles are featured companies only: Collins Aerospace (29,347), Raytheon and Pratt & Whitney, 4th, 6th and 8th in the one order, are absent while Caterpillar (7,331) is shown. Career tiles split each career into FUNDAMENTALS / INTERMEDIATE / ADVANCED counts (the career's own page names no level), the selection reads as random and each description is cut at two lines. The Careers list opens on "Most skills" (Composite Technician 24, Materials Engineer 24) and every row's second line is a sentence cut with an ellipsis; there is no order by open jobs.
- want: overview companies are the first rows of the one order; a career tile is the name and "N open jobs" (no level counts: no levelling system yet); the Careers list opens on most open jobs, then name; a career row's second line is "Home domain · N skills".
- do: server/routes/explore.ts overview; client/src/components/explorer/ExploreOverview.tsx, FilterBar.tsx SORTS (a server sort by open jobs, shared with B029), BrowseList.tsx career rows.
- check: the overview's first three companies equal the first three of /explore?tab=companies; /explore?tab=occupations first row is the career with the most open jobs.
- deps: B003 (the one order)   size: S
- evidence: visitor-explore#22, visitor-explore#23, visitor-explore#29, layout-keyboard#25

### B061 P2 Show the filter that is set, and clean filters that are not real
- area: explore
- kind: consistency   reach: Explore lists reached by old or hand-edited links   verified: tester
- is: ?industry=bogus on Companies is ignored silently (27,902 listed); ?domain=bogus on Careers or Skills shows "0 careers / No careers / Nothing matches these filters." while the control reads "All domains"; the same for a real domain with no careers (?domain=safety, ?military=1&domain=semiconductor) and for a group that is not of the chosen domain (?tab=skills&domain=quality&group=arc-welding); "Clear" and "Clear filters" stand together; ?state= and ?sort= on Companies and ?tab=bogus stay in the address.
- want: an unknown value is removed from the address with replace; a control always shows the value in force; an empty list reads "None yet." once with one Clear; a group outside the chosen domain switches the domain to its own.
- do: client/src/pages/Explore.tsx (normalise the parameters), components/explorer/FilterBar.tsx withCurrent, BrowseList.tsx empty state.
- check: /explore?tab=occupations&domain=bogus ends at /explore?tab=occupations with the list shown; /explore?tab=skills&group=arc-welding&domain=quality shows Fabrication chosen.
- deps: B043 (state on Companies becomes a real filter); sectors   size: S
- evidence: visitor-explore#26, gap-addresses-head-industries#25, gap-addresses-head-industries#26

### B062 P2 Make the skills count agree across views
- area: explore
- kind: consistency   reach: Explore's Skills list in its three orders; the overview; the Atlas   verified: tester
- is: "966 skills" By domain against "964 skills" by Most careers (the tree counts skills no career uses); rows change shape by sort: By domain is the name and "Intermediate · 11 careers"; Most careers adds a description paragraph and "Shop basics · Fundamentals · 95 careers"; narrowed to a group the careers count disappears; the overview says "in 95 careers", the list "95 careers".
- want: one count (GET /api/stats/counts skills: skills a civilian career uses) on every view; the tree marks the others ("no career yet") without counting them; one row shape for a skill in every order.
- do: client/src/components/explorer/BrowseList.tsx treeTotal, SkillTree.tsx, EntityRow.tsx skill rows.
- check: the count line reads the same number under all three orders.
- deps: atlas (its own total: check that it says what it counts)   size: S
- evidence: visitor-explore#27; also touches: gap-conditions#39

### B063 P2 One not-found page; never retry a 4xx
- area: system
- kind: consistency   reach: every unknown address and missing record   verified: tester (three GETs per missing record seen by three testers)
- is: four shapes: a bad address "This page doesn’t exist / Open the map / Explore" (title "Not found · Archangel"); a missing company or career "Back / This company is not listed / Browse companies" (tab title "Archangel", or the previous page's); a missing industry (title "Industries"); a missing job (title "Jobs"). A missing record is asked for three times (404 and 400 retried) under a spinner for seconds. An id of another kind (/companies/<a factory's id>) says not listed though the record exists.
- want: one layout (kind word, one sentence, one or two buttons, an h1, the title "Not found · Archangel"); a 4xx is never retried; an id that belongs to another kind is sent to that record.
- do: client/src/lib/http.ts retryUnlessClientError used by recordQuery (lib/queries.ts) and the default in main.tsx; EntityDetail.tsx, Industry.tsx, JobDetail.tsx and NotFound.tsx share one component; GET /api/search?id=<uuid> or a small kind lookup for the redirect.
- check: /companies/no-such-co makes one GET and shows the shared layout within 500 ms.
- deps: B026   size: S
- evidence: visitor-explore#31, admin#32, gap-addresses-head-industries#31; also touches: gap-addresses-head-industries#5, gap-addresses-head-industries#6

### B064 P2 Give every page and state its own tab title
- area: system
- kind: bug   reach: browser tabs, history and bookmarks on every route   verified: tester
- is: every Explore tab and filter is "Explore · Archangel"; record pages carry the name alone ("Welder · Archangel" for the career, its map panel and a job of that name); an old /jobs/<id> address, once replaced, shows "Jobs · Archangel" (Layout's title effect runs after JobDetail's); Back to a job leaves "Jobs"; a missing record keeps "Archangel" or the previous page's title; every /sign-in state says "Sign in"; /map?industry= says "Map"; /Jobs (capital) says "Archangel".
- want: records read "<Name> · <Kind> · Archangel" (a job: "<Job> at <Company>"); Explore reads "<Tab> · Explore" with its filter in words; sign-in states name themselves; the map names its subject or place; titles are set on every navigation, Back included; the matcher ignores letter case.
- do: one useTitle helper; components/layout/Layout.tsx (namesItself covers /jobs/..., isAt lower-cases), pages/JobDetail.tsx (effect keyed on location.key), EntityDetail.tsx (every branch), Explore.tsx, MapView.tsx, SignIn.tsx.
- check: Playwright title assertions for twelve addresses, Back to a job among them.
- deps: job-names (a job named by its career collides with the career's title unless the kind is in it)   size: S
- evidence: account#13, gap-addresses-head-industries#3, gap-addresses-head-industries#4, gap-addresses-head-industries#5, gap-addresses-head-industries#7, gap-addresses-head-industries#8, gap-addresses-head-industries#37; also touches: visitor-explore#17, gap-addresses-head-industries#9

### B065 P2 Serve a real head for shared links, real 404s and a share image
- area: system
- kind: missing   reach: every link pasted into a message; crawlers   verified: tester
- is: every address returns the same 3,199-byte index.html: <title>Archangel</title>, one description, og:image the app icon (a white dot on black), no og:url, no canonical: a shared job previews as "Archangel" and a dot. Unknown addresses answer 200; /sitemap.xml returns the app. The icons are a plain white disc at every size with no maskable purpose.
- want: job, company, factory, career, skill and industry addresses answer with their own title, description and og tags (a job: its name, company and "City, ST"); an unknown record address answers 404; a share image that says Archangel; robots.txt and a sitemap when the product is opened to indexing.
- do: api/index.ts (the one function) renders the head for those routes into the built index.html (vercel.json rewrites for record routes; s-maxage); client/public/icons and manifest.webmanifest (a maskable icon; the lint holds the manifest colours).
- check: curl -s localhost:5900/jobs/john-deere/welder/40990 | grep og:title names the job; curl -o /dev/null -w '%{http_code}' localhost:5900/companies/no-such = 404.
- deps: B064   size: L
- ask: Is the product meant to be indexed and shared before launch? Default: build the head and the 404; leave the sitemap until launch.
- evidence: gap-addresses-head-industries#1, gap-addresses-head-industries#2, gap-addresses-head-industries#39

### B066 P2 Fix the header search's memory and its Enter key
- area: search
- kind: bug   reach: header search on shared browsers and for fast typists   verified: tester
- is: recent searches are kept in localStorage per browser and survive sign-out: the next person sees "production welder, mig welding, cnc machinist, ..."; what is kept is the typed text, so a recent runs the search again. Enter acts on the previous query's rows while the new query is loading: "weld" + Enter opened the first job of the earlier "production welder" results. A state result leaves for /map?state=, where Ctrl K did not reopen the header search.
- want: recents are cleared at sign-out and at account deletion; Enter does nothing until the rows belong to the query typed; Ctrl K on the map focuses the map's search.
- do: client/src/components/search/GlobalSearch.tsx (RECENT_SEARCHES_KEY; the settled guard on Enter), lib/account.ts sign-out, lib/shortcut.ts.
- check: Playwright: sign out, open the search: no recents; a fast Enter navigates nowhere.
- deps: none   size: S
- evidence: gap-jobs-search-memory#15, gap-jobs-search-memory#16, gap-jobs-search-memory#19

### B067 P2 Keep employer-specific titles out of "Also called"
- area: data
- kind: data   reach: header search and Records search career rows   verified: tester
- is: searching "tesla" lists Robot Programmer "Also called Tesla Robot Programmer" and Robotics Technician "Also called Tesla Robot Technician"; "plc" lists Controls Engineer "Also called PLC" and Electronics Assembler "Also called PLC Assembly Technician"; "electrician" lists RV Assembler "Also called RV electrician".
- want: an other name that contains a company's name, or is the bare abbreviation of a skill, still matches postings but is never shown as "Also called" and is not matched by people's search.
- do: data/careers/aliases.json: mark such names (a `postingsOnly` list per career); scripts/build-career-lists-sql.mjs writes occupation_aliases.shown (new boolean column; migration + schema.ts); server/routes/search.ts, server/lib/careerSearch.ts and recordSearch.ts read only shown names; the posting reader reads all.
- check: GET /api/search?q=tesla returns no career; npm run test:unit -- careers.
- deps: none   size: S
- evidence: visitor-explore#16, speed-words#29; also touches: admin#20

### B068 P2 Decide on careers for material handling
- area: data
- kind: missing   reach: the job form's career picker; career search   verified: tester (GET /api/occupations?search=material handler returns [])
- is: "forklift", "material handler", "warehouse" and "lift truck" find no career; "shipping" finds Quality Control Inspector; a poster is told to "Search for the closest kind of work". These are among the commonest factory hires.
- want: the owner's decision; either the careers exist with paths, or the picker answers such words with the closest production career.
- do: if yes: data/careers/catalogue.json, paths.json, industries.json, aliases.json, then scripts/build-careers-sql.mjs, build-career-paths-sql.mjs, build-career-lists-sql.mjs to new migrations (the unit tests pointed at them). If no: aliases.json maps the words to Production Operator.
- check: GET /api/occupations?search=forklift returns a career.
- deps: none   size: M
- ask: Add Material Handler (forklift, shipping and receiving inside a factory) as a career? The owner's order is machines, transportation and industrial equipment first, and no janitorial or food-prep work. Default: no new career; map the words to Production Operator.
- evidence: employer#6

### B069 P2 Fill makes where the trades are; one kind of thing per chip row
- area: data
- kind: data   reach: the version editor, skill pages, job equipment lines   verified: tester
- is: MIG Welding, Flux-Cored Welding, Plasma Cutting, Forklift Operation and Overhead Crane Operation have no makes (Lincoln, Miller, ESAB, Hypertherm, Toyota, Crown) while Robotic Arc Welding has six: the editor's "tap the makes you run" offers nothing for what a welding shop runs. PLC Programming mixes software (Studio 5000, TIA Portal, TwinCAT) with manufacturers (Allen-Bradley, Siemens, Beckhoff) in one row, so Siemens and TIA Portal both appear.
- want: the 50 skills postings name most each have their makes; a skill's makes are one kind (the machine family or the software), written maker then product where both exist.
- do: data/skills/makes.json; node scripts/build-makes-sql.mjs --check; generate the next makes migration; tests/unit/makes.unit.ts pointed at it.
- check: GET /api/skills/01213ccc-8a81-4e21-83dc-bf01de6bbfc7 (MIG Welding) has makes; the makes unit test passes.
- deps: none   size: M
- evidence: visitor-records#33, employer#28; also touches: gap-hiring-scale#18

### B070 P2 Keep a company's version, its page and its jobs in step
- area: employer
- kind: consistency   reach: company versions of careers (none in production's copy; seen on instances 2 and 3)   verified: tester
- is: the version page (/occupations/<Welder>?at=<company>) shows the standard paragraph "Joins metal with several processes (stick, MIG, flux-cored, TIG)..." over a version that leaves out Stick and TIG, and the standard's ladder. A job posted before the version keeps its 20 skills while its career tag changes to "Kohler Welder". A job posted from a version shows no make beside a skill though the version has Fanuc on Robotic Arc Welding, and nothing marks the company's additions or what it left out.
- want: a version's page carries no standard paragraph (its tags say "Standard Welder"); a job older than the version keeps the standard career's tag until a manager presses "Use <Company> Welder's skills"; a job posted from a version carries the version's makes.
- do: client/src/components/entity/CareerVersionView.tsx; server/routes/jobs.ts POST (job_makes from the version's makes) and hasVersion; pages/JobDetail.tsx manager strip; lib/employerJobs.ts.
- check: on instance 2: a Welder version without Stick: its page has no "several processes" sentence; a job posted after it lists the version's makes.
- deps: B038; B013   size: M
- evidence: employer#26, employer#27, gap-applicant#4, gap-applicant#5, gap-hiring-scale#16, gap-hiring-scale#17

### B071 P2 Draw the version editor by group, like the page it edits
- area: employer
- kind: consistency   reach: /employer?company=&career=   verified: tester
- is: the editor cuts the route into stops (buildRoute): "Arc welding" is a group of five plus single rows for Weld Symbol Interpretation and Pipe Welding; single-skill stops sit under the previous group's heading ("Material handling · 2" over four rows); an added skill sits under a different group than on the page. "Saved" shows before any change; "Add a career" opens a search that is not focused; a failed save leaves the counts changed and the tag unmarked; the line about makes shows where no skill has any.
- want: the editor uses groupRoute as CareerVersionView does; "Saved" appears only after a save; the opened search has focus; a change that failed is reverted or marked "not saved".
- do: client/src/components/versions/VersionEditor.tsx, CompanyCareers.tsx, lib/versionDraft.ts.
- check: the editor for Welder shows each group once, as /occupations/<Welder>?at=<company> does.
- deps: B057   size: S
- evidence: employer#25, gap-hiring-scale#15, gap-hiring-scale#18, gap-hiring-scale#19

### B072 P2 One way to add a skill on Profile
- area: seeker
- kind: consistency   reach: /me "Add a skill"   verified: tester
- is: each result offers two buttons, "Learning" and "Held" (CLAUDE.md: nothing in the interface sets Learning; everywhere else the mark is one held toggle); after an add the query and its row stay with both buttons; on a phone the results open under a field at the bottom of the screen, out of sight.
- want: a result is the skill's tag with the held mark (one tap adds it held); the field clears after an add; opening the results scrolls the field so they can be seen.
- do: client/src/components/me/SkillsSection.tsx (search results) with SkillHeldToggle from components/account/SkillStatusButton.tsx.
- check: /me, type "mig": no button named Learning; one tap adds MIG Welding held and empties the field.
- deps: none   size: S
- evidence: seeker#19, seeker#20, veteran#17

### B073 P2 Keep Undo after removing a goal
- area: seeker
- kind: bug   reach: /me Goals   verified: tester
- is: removing the only goal of a person with no skills flips /me to "Start with a career" at once: "Removed X. Undo" never appears. Undo after removing the second of four goals re-creates it at the end of the list.
- want: the removed line stays until the page is left, whatever else the page holds; Undo puts the goal back in its place.
- do: client/src/pages/Me.tsx starter condition (count the removed list: lift it from GoalsSection.tsx); server/routes/me.ts PUT /goals/:id accepts the earlier created_at on an undo, or the client deletes only when the page is left.
- check: one goal, no skills: Remove shows the Undo line; Undo restores; with four goals the undone goal keeps its position after reload.
- deps: B005   size: S
- evidence: seeker#5, gap-breakage#2, gap-jobs-search-memory#20

### B074 P2 Finish the optimistic marking on Profile
- area: seeker
- kind: bug   reach: /me skill marks; /settings saves   verified: tester
- is: mark then unmark a suggested skill while both requests fail: a ghost "Material handling · 0 of 4" with a quiet Forklift Operation tag stays until reload. A mark updates the skills list at once but the goal's "N of M", ring and Next and the Closest careers figures only after the server answers (CLAUDE.md: every figure follows at once). A failed mark prints one generic line between sections that names no skill and stays after the connection returns; three presses offline send three failing PUTs. /settings keeps each section's red line long after.
- want: every figure follows a mark at once; a rollback leaves nothing; the error names the skill ("Forklift Operation was not saved") and clears on the next success or when the browser comes online.
- do: client/src/lib/seeker.ts useMarkSkill onMutate also patches the goals and reach caches; components/me/SkillsSection.tsx removed[] handling and error line; pages/Settings.tsx error lifetime.
- check: Playwright with PUT /api/me/skills/* fulfilled 500: after mark and unmark no group reads "0 of"; with a delayed 200 the goal's figure changes within 150 ms.
- deps: none   size: S
- evidence: gap-breakage#13, gap-breakage#14, gap-breakage#15, gap-breakage#16

### B075 P2 Say what happened when a session is lost or cannot start
- area: account
- kind: ux   reach: sign-in with cookies blocked, expired sessions, two tabs, slow sign-up   verified: tester
- is: with the cookie refused, a correct sign-in clears the form and lands on /map signed out with no word. With GET /api/auth/me failing (500) the header says "Sign in" while /me, /settings and even /sign-in show only the error (no form). A 401 on an action redirects to /sign-in?next= with no reason and the change is lost unnamed. A mark made in tab A never reaches tab B (refetchOnWindowFocus off, staleTime 5 min) though sign-out does. A sign-up whose answer is lost says the server took too long, then "An account with that email already exists". "Send reset link" double-clicked sends two requests.
- want: after sign-in the client confirms /api/auth/me and says "Your browser blocked the sign-in cookie." when it is still signed out; an auth/me error is unknown, not signed out (no "Sign in" claim; the form still draws); a 401 mid-action lands on sign-in with "You were signed out. Sign in to carry on."; account reads refetch on window focus; sign-up after a timeout tries sign-in with the same details; the forgot button is busy-guarded.
- do: client/src/pages/SignIn.tsx, lib/account.ts, components/layout/Layout.tsx, main.tsx (refetchOnWindowFocus for accountKeys).
- check: Playwright cases for the six situations (the scripts under gap-breakage/ are a start).
- deps: none   size: M
- evidence: gap-breakage#10, gap-breakage#11, gap-breakage#12, gap-breakage#18, gap-breakage#21, gap-breakage#22

### B076 P2 Keep the header while a page loads, and recover from a failed page chunk
- area: system
- kind: bug   reach: every client navigation on a slow or interrupted connection, and after each deploy   verified: yes (client/src/App.tsx:51-54: Suspense wraps the Layout route)
- is: while a page's chunk downloads, the header and the old page vanish to a centred spinner on a blank screen. A failed lazy import reloads once silently; the second failure shows "This page could not be shown. Something failed while drawing it. Trying again usually works." whose Try again never works (React.lazy caches the rejection), after which the outer boundary drops the header too; only Reload gets out.
- want: the header is always drawn (Suspense inside Layout, round the Outlet); a chunk error says "This page needs reloading: the app was updated or the connection dropped." with Reload; lazy imports retry once before failing.
- do: client/src/App.tsx; components/layout/ErrorBoundary.tsx (detect a chunk error by its message or name); a lazyWithRetry helper.
- check: Playwright: abort assets/Explore-*.js and click Explore: the header stays and the message offers Reload; unroute and Reload opens Explore.
- deps: none   size: S
- evidence: gap-breakage#3, gap-breakage#4; files: $UT/gap-breakage/17-chunk-Explore-2-desktop.png, $UT/gap-breakage/18-chunk-slow-1s-phone.png

### B077 P2 Tidy the sign-in page: say why, say it once, confirm what was done
- area: account
- kind: ux   reach: /sign-in in every state   verified: tester
- is: "Sign in" appears four times on one screen (header button, title, tab, submit) and "Create account" three; the header's Sign in shows on /sign-in itself. A visitor sent from /employer?post=1 gets no reason and the Sign in tab; "Find a career" is preselected and the two purpose tiles are uneven. A dead or superseded reset link shows a quiet grey "Reset link not valid or expired." with no way to send another and the token left in the address. After a reset the person is dropped on /map with no word. Opening /sign-in or an invite link while signed in goes silently to /map.
- want: the title names the page and the tabs and submit do not repeat it (submit reads "Continue"); no header sign-in button on /sign-in; a reason line from `next` ("Sign in to post a job"); next=/employer opens Create account with Hire; a dead reset link says "This link was used or replaced." with "Send a new link"; after a reset the person lands on /settings with "Password changed. Other devices were signed out."; a signed-in person opening an invite reads "This invite is for <email>. Sign out to use it."
- do: client/src/pages/SignIn.tsx; components/layout/Layout.tsx.
- check: /sign-in contains the words "Sign in" at most twice; /sign-in?reset=junk shows the send-again control and the address loses the token.
- deps: none   size: M
- evidence: account#6, account#10, account#11, account#15, employer#30, layout-keyboard#28, gap-breakage#30, gap-addresses-head-industries#27; also touches: account#24, seeker#22

### B078 P2 Verify an email change and tell people about security changes
- area: account
- kind: missing   reach: /settings sign-in section; the emails around it   verified: tester
- is: a new email address takes effect at once, unverified (a typo cuts the person off from reset links; sign-up does not verify either). The notice to the old address says "ask an Archangel admin for help" with no address, link or way back, and its only link is /sign-in. A password change or reset sends no email. A new password equal to the current one is accepted and ends other sessions. No password field can show what was typed and new passwords are typed once. A person cannot see or end their other sessions (only an admin can).
- want: an email change takes effect when a link sent to the new address is opened (24 h); the old address's notice carries a one-press "This was not me" that reverts within 7 days; a "password changed" email; the same password is refused; password fields have a show control; Settings has "Sign out other devices".
- do: server/routes/auth.ts (email, password), server/lib/notices.ts and emailTemplates.ts, a new table email_changes (token hash; migration + schema.ts), components/account/parts.tsx password field, pages/Settings.tsx; tests/api/accounts.sh and email.sh.
- check: tests/api/email.sh: changing the email sends one mail to the new address and the address changes only after its link; a password change sends one mail.
- deps: none   size: L
- ask: What does "ask an Archangel admin" mean to a user: is there a support address? Default: the revert link, no address.
- evidence: account#1, account#2, account#3, account#4, account#22, account#23

### B079 P2 Name every form problem beside its field
- area: account
- kind: consistency   reach: reset password, Settings account and password forms   verified: tester
- is: "Save password" with an empty field goes to the server (400) and the error lands in the form's general note while the hint stays: "At least 8 characters." and "Use a password of at least 8 characters." together. Settings name and ZIP: the server's refusals appear one at a time in a note under the whole form. A wrong current password is printed under both fields.
- want: checks run in the browser first; a server refusal carries `field` and is printed beside that field; all problems are shown at once and the first is focused (Code Style).
- do: client/src/pages/SignIn.tsx ChoosePassword; pages/Settings.tsx ProfileSection and PasswordChange; server/routes/me.ts returns every field's problem.
- check: Settings with an empty name and ZIP "abcde": two messages, each under its field.
- deps: none   size: S
- evidence: account#5, account#16, account#21

### B080 P2 Make account deletion say what it ends, and confirm that it did
- area: account
- kind: ux   reach: /settings Delete account; Admin People delete; the employer's applicant list   verified: tester
- is: with an application at Interview the dialog says only "Your skills, goals and applications are removed..."; afterwards the applicant vanishes from the employer's list, counts and CSV with no trace or notice. The person lands on the bare map with no word, and Back opens /sign-in?next=/me. The admin's dialog says "skills and goals" when there are none and does not say the company loses an applicant.
- want: the dialog lists what exists ("1 application in progress at Caterpillar will be withdrawn"); the employer keeps a row "Withdrawn · account deleted" without personal data; the person lands on a page that says "Your account was deleted."; Back does not lead to a sign-in form.
- do: server/routes/me.ts DELETE /api/me (withdraw with an event, then anonymise: applications.user_id nullable; migration + schema.ts); pages/Settings.tsx DeleteSection; lib/account.ts justLeft; components/jobs/ApplicantList.tsx; components/admin/PeopleTab.tsx wording.
- check: tests/api/accounts.sh: after deletion the job's applications still count the row as withdrawn; the UI shows the confirmation.
- deps: none   size: M
- ask: Keep an anonymised "withdrawn" row for the employer? Default: yes.
- evidence: account#7, gap-applicant#14; also touches: gap-admin-people-layout#25, account#8

### B081 P2 Let an account's purpose change emphasis, not reach
- area: account
- kind: ux   reach: hire accounts; admins using View as   verified: tester
- is: after choosing Hire the header's "Jobs" becomes "Your jobs", the account menu loses Profile, and /me redirects to /employer when the person has no goals, skills or applications (client/src/pages/Me.tsx:68; CLAUDE.md: pages reached by their address always work); the public jobs list is reachable only by "All open jobs" at the foot of /employer. View as employer shows an admin the admin's own copy ("Join a company to see its employer's page. Admins join at once."), not what an employer reads.
- want: "Jobs" stays in the header for everyone and "Your jobs" is added for a hire account; /me always draws (an empty Profile with its starter); copy on /employer follows the viewer (useViewer()), not isAdmin.
- do: client/src/components/layout/Layout.tsx, pages/Me.tsx:68, pages/Employer.tsx.
- check: as a hire account the header has Map, Explore, Jobs and Your jobs; /me draws Profile; View as employer shows "Find your company".
- deps: none   size: S
- evidence: account#28, gap-hiring-scale#31, gap-admin-people-layout#19, gap-admin-people-layout#30; also touches: employer#31

### B082 P2 Shorten the way from "Post a job" to a posted job, and tell a requester when access is decided
- area: employer
- kind: ux   reach: every new person here to hire   verified: tester (server/lib/notices.ts newsFor: `access` needs is_admin)
- is: "Hiring? Post a job" sits under 40 rows and "Show more" on /jobs; it opens /sign-in?next=/employer on the Sign in tab and drops ?post=1; nothing says an admin must approve or how long that takes. When an admin approves or declines, the requester gets no dot and no sign in the app (GET /api/me/news `access` is true for admins only): with mail off they learn nothing until they open /employer.
- want: the link stands in the /jobs heading line; it opens Create account with Hire and next=/employer?post=1; news.access is true for a requester whose request was decided since they last opened /employer, so the dot leads there.
- do: client/src/pages/Jobs.tsx (usePostJobLink), pages/SignIn.tsx, server/lib/notices.ts newsFor (users.access_seen_at exists), components/account/AccountMenu.tsx.
- check: tests/api/accounts.sh: after an approval the requester's GET /api/me/news has access true until POST /api/me/seen.
- deps: B077   size: S
- evidence: employer#10, gap-hiring-scale#30; also touches: account#10

### B083 P2 Make the company finder rank by closeness and show clean rows
- area: employer
- kind: ux   reach: /employer company finder; "Ask for it to be added"   verified: tester
- is: "Jon Deer" lists 'Deer Horn Aviation' and 'Pemex Deer Park' above John Deere; "daltile" answers 'No company is named "daltile". The closest:' with Dal-Tile beside Dalb and Dale while "dal tile" matches. Each row leads with a generic building icon (John Deere has a mark), shouts its place ("MIDLAND, TX") and carries a filled "Request access" button (eight in a column). A request to add "Daltile" or "Dal Tile Corporation" is accepted though Dal-Tile is listed.
- want: closest names in order of similarity; hyphens and spaces fold; a row is the mark, the name and "N factories · City, ST"; "Request access" is the secondary button; POST /api/employer/company-requests answers 409 with `existing` when the finder's own match finds the company.
- do: server/lib/companySearch.ts (normalisation, order, the place through cityState()), server/routes/companyRequests.ts, client/src/pages/Employer.tsx rows (CompanyLogo).
- check: GET /api/employer/companies?q=Jon%20Deer lists John Deere first; q=daltile matches Dal-Tile; POST a request for "Daltile" = 409.
- deps: B020   size: S
- evidence: employer#7, employer#8, gap-hiring-scale#9, gap-hiring-scale#10; also touches: gap-hiring-scale#11

### B084 P2 Make Your jobs list everything, scale, and confirm what was done
- area: employer
- kind: ux   reach: /employer for members   verified: tester
- is: a company's careers-site jobs are not listed: Boeing reads "None yet." and on the next line "10 open jobs come from the company's careers site...". After Post job, Save and Delete the page returns to the list with no notice and no link to the job. With 31 jobs: one column, no paging, search or grouping (11,528 px on a phone); thirty rows read alike ("Production Operator / Open until Jan 25, 2027 · Dal-Tile Corp, Conroe / 0 applicants"). Each company repeats a Careers section under the same sentence; a version row's second line is a make ("Fanuc"). A company with no factory shows "None yet." with no word that posting needs a factory.
- want: per company: its jobs grouped by factory, twenty at a time, each row with its number and pay; then "From the careers site · 10" as a link to /jobs?company=; a notice after post, save and delete with a link ("Posted Production Welder. View"); a company with no factory says so and offers "Ask for a factory".
- do: client/src/pages/Employer.tsx; components/versions/CompanyCareers.tsx; components/jobs/JobForm.tsx onSuccess; lift AdminNotice into a shared notice for the employer's pages.
- check: post a job: a notice with a link appears; a member of a company with sourced jobs sees their count as a link, never "None yet." beside it.
- deps: B014   size: M
- evidence: employer#13, employer#14, gap-hiring-scale#20, gap-hiring-scale#32

### B085 P2 Fix the job form's controls
- area: employer
- kind: ux   reach: /employer?post=1, ?edit=, ?copy=   verified: tester
- is: on a failed submit the Factory field is focused, which opens its dropdown over the pay and title errors, at every retry. Each skill chip has a bare ↓ or ↑ (moves it between Required and Optional: only the aria-label says) and an ×: 40 extra Tab stops for 20 skills. Skills are in route order in a new post and alphabetical in copy and edit. Labels are small capitals except "Pay range", "Skills" and "Applications" (and "Factory", "Career" in edit). Pay placeholders "24.00" and "29.00" read as values. A factory under construction is not marked in the picker.
- want: the picker opens on a person's click or typing, never on programmatic focus; a skill's required or optional state is a labelled choice; one order (the route's) in every form; one label style (labelClass); placeholders in quiet ink that cannot be read as values; the picker says "under construction".
- do: client/src/components/jobs/PlantPicker.tsx, JobForm.tsx, JobSkillTags.tsx.
- check: submit an empty form: the errors are in sight and no list is open; Tab from the career to pay passes each skill once.
- deps: B038   size: S
- evidence: employer#15, employer#17, gap-hiring-scale#22, gap-hiring-scale#23, gap-hiring-scale#24, gap-hiring-scale#33; also touches: employer#16, account#29

### B086 P2 Fix the applicant list's stages, order and export
- area: employer
- kind: bug   reach: a managed job's Applicants   verified: tester
- is: with a stage filter chosen, an open row of another stage stays listed ("Interview 1" over two rows). After Hired the stage menu lacks Declined. On a phone a closed row hides its stage, and on desktop an opened row's stage leaves the Stage column. "Offer" is drawn dimmer than "Applied". A withdrawn applicant stays ranked among active ones and is counted in "All 11". Export CSV with a filter on exports the filtered rows with no word. Filter and search are not in the address. The Missing list and the CSV's skill columns are alphabetical, not in route order.
- want: the filter applies whatever is open; the menu offers every stage the server allows; the stage is always on the row; a later stage is never dimmer than an earlier one; withdrawn rows come last and are counted apart; the export says "N of M, filtered" or offers all; ?stage= and ?q= are in the address; skills are in routeOrder().
- do: client/src/components/jobs/ApplicantList.tsx, lib/employerJobs.ts applicantsCsv, server/routes/jobs.ts GET /:id/applications order.
- check: tests/api/jobs.sh: applications' skills come in route order; Playwright: Interview filter shows only Interview rows.
- deps: B038   size: M
- evidence: employer#22, employer#23, employer#24, gap-applicant#17, gap-applicant#18; also touches: gap-hiring-scale#29

### B087 P2 Refuse the edit form for a job from a careers site
- area: employer
- kind: bug   reach: /employer?edit=<id> for the 1,284 sourced jobs   verified: tester
- is: /employer?edit=79a4b70e-8a97-4082-b921-536980f1556f (a Saronic careers-site job) draws the full edit form: "Changes show on the listing at once", editable skills, required pay fields empty, the raw Ashby URL in Application link; Save is refused with "Enter the lowest pay."
- want: the same answer the job's page gives: one line saying the job comes from the company's careers site, with a link to the job; no form.
- do: client/src/pages/Employer.tsx (or JobForm.tsx): when job.fromSource draw the line; PATCH already answers 409.
- check: the address above shows no form and links to the job.
- deps: none   size: S
- evidence: gap-hiring-scale#4

### B088 P2 Show who manages a company, and handle leaving and removal
- area: employer
- kind: missing   reach: every company with members   verified: tester
- is: "Company access" lists only the person's own companies: nobody sees who else manages the jobs, who posted one or who moved an applicant. The last member can Leave ("Its jobs and applicants stay with the company"), which leaves an open job and an applicant that no one can move; nobody is told. A member an admin removes gets no email; their open post form then answers a generic "You can only post jobs for a company you belong to." and keeps the company selected.
- want: each company on /employer lists its active members by name; Leave as the last member warns ("You are the last person managing 1 open job with 1 applicant") and offers to close the jobs; Admin Review counts companies with open hand-posted jobs and no member; a removal emails the person; a 403 on post refetches the memberships and says "Your access to <Company> was removed."
- do: server/routes/employer.ts (members in GET /; the Leave guard), server/routes/admin.ts memberships remove with server/lib/notices.ts and emailTemplates.ts, client/src/pages/Employer.tsx, components/jobs/JobForm.tsx 403 handling, server overview count.
- check: tests/api/accounts.sh: GET /api/employer lists members; the last member's DELETE answers with the warning data; a removal writes one outbox line.
- deps: none   size: M
- evidence: gap-hiring-scale#5, gap-hiring-scale#6, gap-hiring-scale#7

### B089 P2 Make every admin action say what it did, with an Undo that works
- area: admin
- kind: bug   reach: Review (matches, pairs, postings places), Access, Invites, People, Records   verified: yes (MatchReview.tsx:73-86 and InvitesTab.tsx:284-287 pass onSuccess to mutate(); CompanyRequests.tsx has no say() call)
- is: Same and Different on uncertain matches, Two factories on pairs, Revoke on an invite, Give access / Mark added / Decline on company and factory requests and Delete account all succeed with no notice: the per-call onSuccess given to mutate() never runs because the row unmounts when the list refetches (CompanyRequests.tsx never calls notice.say); focus falls to <body>; Revoke acts on one Enter with no question and focus lands on the next row's Revoke. After Undo on pairs, postings places and a path's Approve, the old notice stays with its Undo still offered and the list is stale until reload. Undo exists for one action and not its twin (Approve a path, not Return to draft; Access approve, not People's Remove access; none for make admin, makes, mark, revoke). An old success notice stays beside a new inline error.
- want: every admin write calls notice.say from the mutation hook's own onSuccess; an Undo press replaces the notice with "Taken back." and refetches; an action with no Undo asks first (Revoke); focus moves to the next row or the list's heading; a new notice replaces the old.
- do: client/src/lib/admin.ts, lib/intake.ts, lib/plantPairs.ts, lib/postings.ts hooks (onSuccess there); components/admin/MatchReview.tsx, PlantPairs.tsx, InvitesTab.tsx, CompanyRequests.tsx, PeopleTab.tsx, Postings.tsx, PathEditor.tsx, AdminNotice.tsx.
- check: Playwright on a local database with the intake fixture (tests/api/intake): each of the eight actions leaves a non-empty [data-admin-notice]; after Undo it reads "Taken back".
- deps: none   size: M
- evidence: admin#14, admin#15, admin#37, gap-admin-queues-editors#0, gap-admin-queues-editors#1, gap-admin-people-layout#3, gap-admin-people-layout#4, gap-admin-people-layout#10; also touches: admin#33, employer#12

### B090 P2 Validate admin edits that silently break the product's rules
- area: admin
- kind: bug   reach: Records editors and Add forms   verified: tester
- is: setting Service to None on a military career saves with no question, clears its code, system and official title and makes it civilian with a military path (GET /api/stats/counts occupations 232 to 233). A Navy rating code accepts '15T' and 'ZZZ9', and 'ht ' is stored in lower case. A code already used shows "Already listed: Navy Machinery Repairman ... merge this one into it" in place of the server's "already has that code". Add factory with Name empty does nothing though the placeholder shows a default name, and a server 400 (field 'company') is shown nowhere. A skill can be renamed to another skill's other name ('SPC'): search then finds two. A factory saves as Under construction with 250 people (2025) and "Opened 2027". The Service select offers no Marine Corps.
- want: a military career with a path cannot lose its service (409 with the reason); codes are checked against their system's shape and upper-cased; a 409 that carries `field` shows the server's sentence beside that field, and the merge advice only for a true duplicate name; Add factory names every problem and uses "<Company> <City>" when Name is empty; a skill's name may not be another skill's other name (409, as careers); an opening year in the future reads "Opens 2027" and people on a site under construction is asked about; the four services are offered.
- do: server/lib/records.ts (militaryFacts, code checks, the skill alias check, factory cross-checks); shared/military.ts CODE_SYSTEMS patterns; client/src/components/admin/RecordForm.tsx (409 handling; service options) and AddPage.tsx; components/entity/RecordFacts.tsx wording; tests/api/admin.sh and military.sh.
- check: tests/api/military.sh: PUT service null on a military career with a path = 409; code '15t' for the Navy = 400; tests/api/admin.sh: renaming a skill to another's alias = 409.
- deps: none   size: M
- evidence: admin#36, gap-admin-queues-editors#4, gap-admin-queues-editors#5, gap-admin-queues-editors#6, gap-admin-queues-editors#7, gap-admin-queues-editors#12, gap-admin-queues-editors#15

### B091 P2 Check an admin's address against what was typed
- area: admin
- kind: bug   reach: Add company, Add factory, the factory editor's place fields   verified: tester
- is: street "1901 E Ben White Blvd", city Austin, state Ohio, ZIP 78741: "Found: Austin, OH ... the town only: add the street" (the street was given) and it would save in Ohio. "1100 Congress Ave, Austin, TX 78701" is found as "South Congress Avenue, Austin, TX 78745", 6 km away, with only "the street, not the building number". "1 Main St, Norfolk, VA" is found in Smithfield. Coordinates typed by hand in another state are saved: the factory reads "Austin, TX" with its pin in Oklahoma City and no county. A town that does not exist is accepted. A town-only answer reads "Found: Norfolk VA, VA". "Find the address again" with no street replaces a real point with the town's centre. "Enter coordinates instead" discards the point just found. "Look again" drops keyboard focus.
- want: a found address whose state, ZIP or town differs from what was typed is refused with the difference named; the server refuses a point outside the filed state (400, field latitude); "Find again" with no street keeps the point and says so; the coordinate fields open with the found point; the place prints as "City, ST".
- do: client/src/lib/geocode.ts findAddress (compare the parts), components/admin/PlaceFields.tsx, server/lib/writes.ts and records.ts (state bounds from data/geo), focus kept on a busy control.
- check: tests/api/admin.sh: POST /api/factories with state TX and a point in Ohio = 400; the form refuses the Ohio/78741 case with the reason.
- deps: B027   size: M
- evidence: admin#9, gap-admin-queues-editors#9, gap-admin-queues-editors#10, gap-admin-queues-editors#11, gap-admin-people-layout#6; also touches: gap-admin-people-layout#7

### B092 P2 Do not offer in a picker what the server will refuse; state a refusal before the confirm
- area: admin
- kind: ux   reach: Admin pickers (company, career, factory), Delete panels, the employer's finder   verified: tester
- is: pickers offer military services as companies (Add factory; People, "Add to a company") and military careers for a civilian career's Merge and Leads to; each is refused only after the form or the confirm. The employer's finder says 'No company matches "U.S. Navy"' with "Ask for it to be added", and refuses after the form is filled. Delete dialogs list "Goes with it: 1 job, 1 application" and refuse after the confirm, with no link to the job; the Navy's dialog says "Goes with it: 1 factory, 39 careers", refuses, and advises deleting them; a company with a subsidiary reads "Nothing else is attached to it."
- want: each picker takes the filter the server's rule implies (civilian careers only; no services); a Delete panel shows the blocking reason in place of the button ("Has a job with applications: close it", linked); subsidiaries and a service's careers are counted; the finder says a service is a military service and links its page.
- do: client/src/components/admin/RecordPicker.tsx, CompanyPicker.tsx, LeadsToField.tsx (also a Down control), RecordEditor.tsx Delete panel; GET /api/admin/records/:kind/:id `attached` gains subsidiaries and `blocked`; server/lib/companySearch.ts marks services for the finder; client/src/pages/Employer.tsx.
- check: the Merge picker on a civilian career lists no military career; a company with a job that has applications shows the reason and no Delete button.
- deps: B010   size: M
- evidence: admin#17, admin#18, gap-admin-queues-editors#8, gap-admin-queues-editors#19, gap-admin-queues-editors#23, gap-admin-people-layout#31, gap-hiring-scale#26

### B093 P2 Warn before an irreversible merge of unlike records
- area: admin
- kind: ux   reach: factory merges (the editor and Review), skill merges   verified: tester
- is: a factory merge goes ahead on one confirm however far apart the rows are: a Bellefonte, PA factory (Computers and electronics) was merged into one in Austin, TX (Chemicals), 2,258.8 km away; the dialog says only "keeps its name, company and place ... Cannot be undone." Merging Design of Experiments into Process Capability Analysis moved 59 jobs and 19 careers with no hint the two differ; the dialog said "3 makes" though two were folded.
- want: a factory merge across states, over 5 km or across industries states the distance and needs the word "merge" typed; the server refuses across states without `force`; a skill merge lists the counts and says "59 jobs that asked for A will read as asking for B".
- do: client/src/components/admin/PlantPairs.tsx and RecordEditor.tsx merge dialogs (ConfirmDialog with a typed word); server/lib/plantPairs.ts.
- check: tests/api/dupes.sh: a merge across states without force = 409.
- deps: none   size: S
- evidence: gap-admin-queues-editors#2, gap-admin-queues-editors#36

### B094 P2 Follow a merged record's old address for every kind
- area: records
- kind: bug   reach: bookmarks, shared links and History links to merged skills, careers and companies   verified: tester (GET /api/skills/<merged id> = 404 while /api/factories/<merged id> = 301)
- is: after a skill merge /skills/<old id> reads "This skill is not listed. The link may be old, or the record was removed."; History's links to merged records lead to the same page. /map?factory=<merged id> opens the kept factory and keeps the old id in the address.
- want: GET /api/skills|occupations|companies/<merged id> answers 301 to the kept record through record_merges (record_now), and the page replaces its address; the map replaces ?factory=.
- do: server/routes/skills.ts, occupations.ts, companies.ts (as factories.ts does); client/src/pages/EntityDetail.tsx follows; pages/MapView.tsx replace.
- check: tests/api/admin.sh: after a skill merge GET /api/skills/<old> = 301 with the kept id.
- deps: none   size: S
- evidence: gap-admin-queues-editors#16, gap-admin-queues-editors#32

### B095 P2 Make Review count what needs a decision
- area: admin
- kind: ux   reach: /admin index and /admin/review   verified: tester
- is: the index says "352 waiting" (357 on another day): 349 are every career's draft path (0 approved), so the two or three real decisions are lost. "Factories listed twice: None" while 313 factories share 147 spots. Activity, Postings, says boards have postings "waiting" (Anduril 74, Panasonic 61, Rivian 40, SpaceX 31, John Deere 17) while Review's "Postings with no factory" lists 3 places. The drafts list is 349 rows in name order mixing civilian and military careers with no code, filter or priority.
- want: the index counts decisions that block something (uncertain matches, pairs including spot pairs, posting places with their postings, access); draft paths are counted apart, can be ordered by open jobs and by goals, and filtered civilian or military with the code shown; "waiting" has one definition shared by Postings and Review, each linking the other.
- do: server/routes/admin.ts overview, server/lib/postings.ts counts, client/src/components/admin/AdminIndex.tsx, ReviewPage.tsx, PathsList.tsx, Postings.tsx.
- check: on the copy the index number is under 20 and the Postings rows' waiting figures sum to Review's.
- deps: B022   size: M
- evidence: admin#6, admin#7, admin#29, gap-admin-queues-editors#27

### B096 P2 Give pair cards the evidence to decide
- area: admin
- kind: ux   reach: /admin/review?pairs=id and ?pairs=spot; the factory editor's Merge panel   verified: tester
- is: a card shows name, company, town and industry: no address, map, link or headcount ('AIR LIQUIDE - LA PORTE ASU' against 'AIR LIQUIDE LA PORTE SMR', two different units, cannot be judged); names in capitals; nothing says a card is pressed to choose the kept row, and "MERGED INTO IT" reads as done; the default kept row is often the worse name; cards sit inside a panel (two levels of box). The Merge panel's search matches names only ("Bellefonte" and "aryzta" find nothing though ARYZTA LLC is listed below as within 2 km) and mixes in other companies' nearby factories.
- want: each card: the display name with the raw name quiet under it, address, people, outside ids, a link to its page and the distance between the two; "Keep this one" as a labelled radio; the search matches name, city and company.
- do: client/src/components/admin/PlantPairs.tsx; server/lib/plantPairs.ts (the pair's fields; nearPlants).
- check: a spot pair's card shows both addresses and the distance; GET /api/admin/plants/<id>/near?q=Bellefonte returns the Bellefonte row.
- deps: B022 (which row is kept); B018   size: S
- evidence: admin#25, gap-admin-queues-editors#13, gap-admin-queues-editors#30, gap-admin-queues-editors#31

### B097 P2 Explain and complete "Postings with no factory"
- area: admin
- kind: ux   reach: /admin/review?postings=places; Activity, Postings   verified: tester
- is: "Point here" answered "Pointed St. Louis City, MO at Boeing St. Louis: 0 jobs listed." with no reason. Rows differ: two have a sentence and "Leave"; one has a native select and the label fragment "The factory St. Louis City, MO is". "Add the factory, and the next run places these postings." has no link to Add with the company and place filled. Posting titles are raw. "Not in our data: Apptronik" offers no way to add the company.
- want: the notice says how many jobs were written and, when none, why (the posting is gone; it is not one of our careers); every row has the same controls (the app's picker); "Add this factory" opens /admin/add?kind=factory with company, city and state filled; a not-listed board offers "Add this company".
- do: client/src/components/admin/Postings.tsx; server/lib/postings.ts (the answer's reasons); components/admin/AddPage.tsx prefill parameters.
- check: pointing a place whose posting has gone says so in the notice.
- deps: B089   size: S
- evidence: admin#11, admin#24

### B098 P2 Carry a request's details into Add and back
- area: admin
- kind: missing   reach: /admin/access "Companies and factories to add"   verified: tester
- is: the request says "Add the record under Add, then answer the request here.": Add opens empty (name, website and place are retyped) and, back on Access, the company is searched for again before "Give access".
- want: "Add this company" opens /admin/add?kind=company&request=<id> with the request's fields filled; saving answers the request and gives access in the same step, with one notice.
- do: client/src/components/admin/CompanyRequests.tsx, AddPage.tsx, CompanyAddForm.tsx; server/routes/companyRequests.ts (POST /api/companies accepts `request`).
- check: from a company request: one form, one save; the request reads added and the requester has access.
- deps: B009; B089   size: S
- evidence: employer#12, admin#26

### B099 P2 Make Add ask for what Edit asks for
- area: admin
- kind: consistency   reach: /admin/add for a career, a skill and a factory   verified: tester
- is: a career added is public at once with no path ('Spring Coiling Operator': skillCount 0, in GET /api/occupations and search). Add career takes no ladder or other names; Add skill takes no "How it is learned" or tools (every skill has them); Add factory has no Industry field though Edit has, so the factory and its company get no industry.
- want: Add shows Edit's fields for the kind; a career with no path is not listed publicly until it has skills, and saving it leads to its Path panel.
- do: client/src/components/admin/RecordForm.tsx and AddPage.tsx; server/routes/occupations.ts list and search conditions (path_status set or a skill).
- check: add a career: GET /api/occupations?search=<its title> is empty until a path is saved.
- deps: none   size: S
- evidence: admin#19

### B100 P2 Add the picked skill when a path is saved
- area: admin
- kind: bug   reach: a career's Path panel   verified: tester
- is: picking a skill in "Add a skill" does not add it: a second press on "Add" is needed. "Save path" or "Save and approve" after picking saves without it and leaves it in the field ("Ultrasonic Testing | Change") as if pending.
- want: choosing a skill adds it at once, or Save includes a pending pick.
- do: client/src/components/admin/PathEditor.tsx.
- check: pick a skill and press Save path: the audit line "path edited" lists the addition.
- deps: none   size: S
- evidence: admin#16

### B101 P2 Make Records search tolerant and complete
- area: admin
- kind: ux   reach: /admin/records?q=   verified: tester
- is: "Teslaa" answers "No match. Add it" (an invitation to add a duplicate); each kind stops at three to five rows with no "more" (Tesla has 7 factories, 3 shown) and there is no filter by kind.
- want: the closest names when nothing matches; "All N" per kind; a ?kind= filter.
- do: server/lib/recordSearch.ts; client/src/components/admin/RecordsPage.tsx.
- check: /admin/records?q=Teslaa lists Tesla.
- deps: B025   size: S
- evidence: admin#20

### B102 P2 Let an admin open a source's run, and keep an undo from taking back a person's decisions
- area: admin
- kind: missing   reach: /admin/activity?view=sources; the intake runner's undo   verified: tester
- is: a source's row cannot be opened: no list of what a run changed, queued or held; it still says "2 queued" after both matches were decided; the source's name links out of the app; the description shows a file path. A command-line undo of the run removed the factory an admin had added with Different and the facts filled by Same; the page changed "Applied" to "Undone" and said nothing more.
- want: a run opens to its intake_changes (the fact, the factory, a link); queued counts follow decisions; undo leaves records an admin decided (or lists them and asks first), and the page says what the undo took back.
- do: client/src/components/admin/IntakeSources.tsx; GET /api/admin/intake/sources/:source/runs/:run; scripts/ingest/lib/pipeline.mjs undo and intake_undo_run (a new migration); tests/api/intake.sh.
- check: tests/api/intake.sh: an undo after an admin's Different keeps that factory and reports it.
- deps: none   size: M
- evidence: gap-admin-queues-editors#26

### B103 P2 Warn before replacing an invite; say plainly what an invite gives
- area: admin
- kind: ux   reach: /admin/invites; /sign-in?invite=; the invite emails   verified: tester
- is: a second invite to an address silently replaces the first, even lowering Admin to User (the Role choice snaps back to User after every invite); afterwards one quiet line says the earlier link no longer works. The page reads "Invited as Employer (John Deere) by Acct Admin" (a role code) with no expiry; switching to the Sign in tab drops the line with nothing saying the invite needs a new account. The user invite's email says "invited by an Archangel admin" though the page names the person, and opens with a product blurb. The employer's menu carries a role label "EMPLOYER (JOHN DEERE)".
- want: creating an invite for an address that has one pending shows it (role, by whom, expiry) and asks to replace; the role chosen stays chosen; the page reads "<Name> invited you to post jobs for John Deere. The link works until Dec 10."; the email names the inviter; no role label in the menu.
- do: client/src/components/admin/InvitesTab.tsx; server/lib/invites.ts (409 with `existing` unless replace is sent); pages/SignIn.tsx inviteRoleLabel; server/lib/emailTemplates.ts; components/account/AccountMenu.tsx.
- check: tests/api/admin.sh: a second invite without replace = 409; the invite page shows the expiry.
- deps: none   size: S
- evidence: account#30, account#31, gap-admin-people-layout#5, gap-admin-people-layout#26

### B104 P2 Keep the closed Explore menu out of the Tab order
- area: a11y
- kind: a11y   reach: every page for keyboard users   verified: yes (client/src/components/layout/Layout.tsx:46-64: ExploreMenu opens onFocus)
- is: Tab onto Explore opens its menu and its six links (Overview, Industries, Companies, Factories, Careers, Skills) join the Tab order: 7 Tabs from Explore to Jobs, 13 to the map's search, about 21 to an Admin form, on every page. /sign-in does not put focus in Email.
- want: focus on Explore does not open the menu; ArrowDown or Enter opens it, arrows move inside (roving tabindex), Escape returns; closed items cannot take focus; /sign-in focuses Email on load.
- do: Layout.tsx ExploreMenu (remove open-on-focus; keys through lib/roving.ts; tabIndex -1 on items); pages/SignIn.tsx.
- check: Playwright: from the top of /map, three Tabs after "Skip to content" land on Jobs.
- deps: none   size: S
- evidence: visitor-map#25, visitor-records#35, account#24, layout-keyboard#32, gap-hiring-scale#27, gap-admin-people-layout#15

### B105 P2 Bring touch targets to 44 px outside the map
- area: a11y
- kind: a11y   reach: phone layouts of Explore, record pages, sign-in, settings, Profile   verified: tester (measured at 390 px with touch)
- is: the Industry | Military switch is 84x30; List | Atlas 53x36; "All 21" links 38-47x22; inline "Welder" and "Sign in" links 15 px tall; a service's link 34x28; sign-in tabs 36 tall, "Forgot password?" 22, "Dark or light theme" 15; the settings toggle 44x24 and "Change" 52x38; inputs 42 tall; Profile's goal and next-skill links 22; "Set to hire" 36.
- want: every control has a hit area of at least 44x44 on pointer: coarse (padding or a pseudo-element; the drawn size may stay).
- do: client/src/lib/utils.ts segmentedClass and segmentClass; components/layout/Page.tsx ShowAll; components/ui inputs; pages/SignIn.tsx and Settings.tsx; a size sweep in tests/responsive.spec.ts (layout-keyboard/sweep.js is a start).
- check: the sweep finds no interactive element under 44 px on either axis at 390x844 with touch.
- deps: none   size: M
- evidence: layout-keyboard#31

### B106 P2 Give every page an h1 and ordered headings
- area: a11y
- kind: a11y   reach: /map, not-found pages, /industries, /atlas, Explore lists, Admin People   verified: tester
- is: /map has no heading until a panel opens; not-found pages have no h1; /industries and /atlas have only the h1 "Explore"; the Careers list goes from h1 to h3; the overview's labels ("BY STATE", "Focus area") are headings; an opened person in Admin People has no headings (NAME AND EMAIL, ADMIN, COMPANIES, SIGN-IN are plain text).
- want: one h1 per page naming it; no skipped level; labels are not headings; each section of an opened person is an h3.
- do: client/src/pages/MapView.tsx (a visually hidden h1), NotFound.tsx, components/explorer/IndustryList.tsx, BrowseList.tsx rows, ExploreOverview.tsx labels, components/admin/PeopleTab.tsx.
- check: an axe run (page-has-heading-one, heading-order) over fifteen routes in tests/responsive.spec.ts.
- deps: none   size: S
- evidence: layout-keyboard#34, layout-keyboard#35, gap-admin-people-layout#13, gap-addresses-head-industries#36

### B107 P2 Fix accessible names and label associations
- area: a11y
- kind: a11y   reach: Admin record editors, sourced job pages, the account button, the applicant list, the Explore tab row   verified: tester
- is: the editors' selects (career Home and Service, skill Group and Level, factory State, Industry and Status, company HQ State) are not tied to their visible labels, and "LEADS TO" points at the first Remove button; the Apply link is named "Apply , in a new tab"; the account button's name does not change when the news dot shows; an applicant row's name drops its stage when opened and two role=status regions speak together; the visible "Give access" and "Approve after all" buttons carry aria-labels that differ from their words; the Explore tab row is plain links on which arrow keys do nothing, unlike the segmented controls.
- want: every control's accessible name contains its visible words; every field is tied to its label; state shown by a mark is in the name.
- do: client/src/components/admin/RecordForm.tsx and LeadsToField.tsx (htmlFor and id), CompanyRequests.tsx:109, components/jobs/SourcedJob.tsx, ApplicantList.tsx, components/account/AccountMenu.tsx, components/explorer/ExploreNav.tsx (onGroupArrowKeys).
- check: an axe run (label, label-content-name-mismatch) over the editors and a sourced job page.
- deps: none   size: S
- evidence: layout-keyboard#36, layout-keyboard#37, gap-hiring-scale#29, gap-admin-queues-editors#18, gap-admin-people-layout#14

### B108 P2 Raise the contrast of input edges and of meta text on hovered rows
- area: a11y
- kind: a11y   reach: every input and every hovered row, both themes   verified: tester (computed from the tokens)
- is: --line-strong, an input's only boundary, is 1.70:1 on --bg in dark and 1.56:1 in light; on --surface 1.56 and 1.42 (WCAG 1.4.11 asks 3:1). --text-3 on --surface-hover is 4.14:1 dark and 4.17:1 light (13 px meta needs 4.5); the light --accent on --surface-hover is 4.05:1.
- want: an input's edge is 3:1 against the page and the surface; the three inks hold 4.5:1 on --surface-hover; held by the unit test.
- do: client/src/styles/globals.css token values in both :root blocks; tests/unit/theme.unit.ts adds the two checks.
- check: npm run test:unit -- theme passes with the new assertions.
- deps: none   size: S
- ask: Each theme was set by hand: is a stronger input edge (3:1) acceptable? Default: yes.
- evidence: layout-keyboard#38

### B109 P2 Let text follow the browser's font size
- area: a11y
- kind: a11y   reach: every page for people who raise their browser's default text size   verified: tester
- is: type sizes are in px (tailwind.config.ts fontSize; text-[Npx] utilities): with the browser's default at 24 px the spacing and buttons grow 1.5 times while all text stays 40, 15 and 13 px. At 200% zoom /jobs shows one job above the fold under its header, title, sentence and two fields.
- want: font sizes in rem with the same computed sizes at a 16 px root.
- do: tailwind.config.ts fontSize; client/src/styles/globals.css; every text-[Npx] in client/src; look at /settings and /jobs with the root at 24 px.
- check: with the browser's default size at 24 px the body text computes to 22.5 px and nothing overflows at 1440.
- deps: none   size: M
- evidence: layout-keyboard#46, gap-conditions#26

### B110 P2 Give the map a keyboard path to factories and a proper context menu
- area: a11y
- kind: a11y   reach: /map for keyboard and screen-reader users   verified: tester
- is: the canvas takes focus and arrows pan it, but Enter selects nothing; no pin or hover card can be reached except through search; nothing lists the factories in view. The context menu has no role=menu, does not take focus, cannot be opened from the keyboard, and is cut off near the bottom edge (its clamp assumes 150 px).
- want: a control "Factories in view" opens the bounds panel (GET /api/map/bounds/overview exists) and Enter on the focused canvas does the same; the context menu has role=menu and menuitem, takes focus, moves by arrows, closes on Escape, opens on Shift+F10 and is clamped by its measured size.
- do: client/src/components/map/Map.tsx, MapContextMenu.tsx, panel/RegionViews.tsx.
- check: Playwright: focus the canvas, Enter: a panel lists factories; Shift+F10 opens a menu whose first item has focus.
- deps: none   size: M
- evidence: layout-keyboard#33, gap-conditions#10

### B111 P2 Put focus somewhere after an action removes its control
- area: a11y
- kind: a11y   reach: map search, job posting, the Close job field, the admin address fields   verified: tester
- is: choosing a map search result with the keyboard opens the panel and leaves focus on <body>; after Post job focus is on <body> of the new page with nothing announced; Escape from the Close job reason drops focus to <body>; "Look again" is replaced while it looks and focus is lost.
- want: after a keyboard selection the panel's heading takes focus; a new page focuses its h1; Escape returns focus to the control that opened the field; a busy control stays mounted (aria-busy).
- do: client/src/components/map/MapSearch.tsx and MapDetailPanel.tsx; components/jobs/JobForm.tsx onSuccess; pages/JobDetail.tsx close panel; components/admin/PlaceFields.tsx.
- check: Playwright: after each of the four actions document.activeElement is not BODY.
- deps: none   size: S
- evidence: visitor-map#26, gap-hiring-scale#28, gap-admin-people-layout#7; also touches: gap-hiring-scale#27

### B112 P2 Make the map's phone layout work with the sheet, the keyboard and landscape
- area: map
- kind: bug   reach: /map on phones   verified: tester
- is: with a panel at peek the sheet covers the bottom of the search results (rows cut in half; with the keyboard up all but three). In landscape at 568x320 the search field covers "Reset view", and search, chips and sheet leave about 60 px of map with the chosen factory under the chips. At 844x390 the focus-area chips wrap to two rows (in portrait they swipe) and cover a third of the map; chips sit over place names in portrait too.
- want: focusing the search folds the sheet to its bar; chips swipe wherever the pointer is coarse, at any width; a viewport under 500 px tall uses the side panel or the bar detent only, and no control is covered.
- do: client/src/components/map/MapDetailPanel.tsx (sheetDetent on search focus; a height query), MapSearch.tsx chip row, client/src/styles/globals.css .map-control placement.
- check: Playwright at 390x844: with Austin open, typing in the search shows whole rows above the sheet; at 568x320 the reset control can be pressed.
- deps: none   size: M
- evidence: visitor-map#4, layout-keyboard#45, gap-conditions#17, gap-conditions#18

### B113 P2 Keep the selection when resetting the view or opening the menu
- area: map
- kind: bug   reach: /map with a panel open   verified: tester (Map.tsx contextmenu handler cited: clearSelection)
- is: "Reset view" closes the open panel and drops ?factory=. A right-click anywhere closes the panel as the context menu opens. A long press on a phone closes the panel and shows no menu. After the menu's "Reset view" the address fragment was unchanged (needs a look).
- want: Reset view moves the camera and nothing else; a right-click or long press never clears the selection.
- do: client/src/components/map/Map.tsx contextmenu handler; MapContextMenu.tsx resetView; camera.ts.
- check: Playwright: /map?factory=<id>, right-click: the address still has ?factory= and the panel is open; Reset view keeps it and the fragment changes to the home view.
- deps: none   size: S
- evidence: visitor-map#32, gap-conditions#8, gap-conditions#9, gap-conditions#11

### B114 P2 Make a career or skill on the map say truly what is lit and why
- area: map
- kind: ux   reach: /map?career= and ?skill=; the "Careers in these industries" lists of every area and state   verified: tester
- is: with a career as subject, on dark the lit and stepped-back pins are hard to tell apart; in light the factories of the career's industries go faint grey and whole towns go blank (the opposite of dark). "States with the most of these factories" and "Where this work is done" are industry-typical lists that read as places hiring the career (4,991 fabricated-metal factories as places that hire welders). "Careers in these industries" hardly varies by place: Welder and MIG Welder are in the first four everywhere; Austin leads with Wafer Fab Operator though no fab is among its Companies. A skill as subject changes nothing on the map; its panel lists five careers in name order and hides the most relevant behind "and 6 more on the skill's page", which is not a link (Saw Filer ahead of Welder for TIG Welding).
- want: in light the subject's factories keep full ink and the rest fade, as dark does; the career panel leads with factories that have open jobs for the career and heads the rest "Industries with this career"; a skill's careers are ordered by open jobs, then by how many of them share its group, and end in a ListLink.
- do: client/src/components/map/layers.ts LOOK and setPinView (light); panel/OccupationView.tsx and SkillView.tsx; server/routes/map.ts careers weighting.
- check: screenshots of /map?career=<Welder id>#6.5/41.8/-88.5 in both themes show the same factories emphasised; /map?skill=<TIG id> lists TIG Welder and Welder first.
- deps: B028   size: M
- evidence: visitor-map#21, visitor-map#22, visitor-map#33, gap-conditions#7, gap-conditions#36

### B115 P2 Fix the first visit to the map
- area: map
- kind: ux   reach: every first visit; phones most   verified: tester
- is: the one sentence under the search describes the product and names nothing to do; it shows again after a reload and after a subject chip is removed, though it is meant once per browser (archangel.map.seen). On a phone the country sits small in the upper half over an empty lower half. On a desktop the four chips wrap and San Antonio stands alone on a second row.
- want: the sentence goes (B014) or, if the owner keeps it, shows once; the phone's home view fills the usable area; the chips fit one row at 1440.
- do: client/src/components/map/MapSearch.tsx (INTRODUCTION and the storage write through lib/storage.ts), camera.ts homePadding on phones, the overlay's width.
- check: fresh browser: /map, reload: no sentence the second time; at 390x844 the country spans at least 85% of the width.
- deps: B014   size: S
- evidence: visitor-map#23, gap-conditions#14, gap-conditions#31

### B116 P2 Make a searched place's panel describe the place
- area: map
- kind: data   reach: the map's search: ZIP codes, towns, counties   verified: tester
- is: choosing ZIP 78701 (downtown Austin, about 2 km across) opens a panel for the geocoder's bounding box, 24 km tall: 78 factories under the label "78701". "Travis County" is a rectangle that takes in SpaceX Bastrop (Bastrop County) and NOV Cedar Park (Williamson County). No outline is drawn.
- want: a county's panel is the county (county_fips); a town's or ZIP's panel is a stated radius or the feature's own shape ("within 5 miles of 78701"), and the area counted is drawn.
- do: client/src/lib/geocode.ts; server/routes/map.ts (bounds/overview takes a radius; a county overview by fips); panel/RegionViews.tsx wording; layers.ts outline.
- check: the Travis County panel lists no Bastrop County factory; the ZIP panel states its radius.
- deps: B024   size: M
- evidence: visitor-map#7

### B117 P2 Stop cutting figures and labels at phone widths
- area: system
- kind: bug   reach: 320 to 390 px: industry pages, the Explore tab row, the map's search   verified: tester
- is: at 320 px industry headline figures are cut with an ellipsis ("12,579,9…", "$89,471 a…", "$109,33..."); the Explore tab row scrolls sideways with tabs cut mid-word and no cue (on Careers the first tab reads "dustries"; Overview is out of sight on Skills); the map search placeholder is cut ("Place, company or care…").
- want: a number is never truncated (figures drop to two per row or a smaller size); the tab row fades at a cut edge and scrolls the current tab into view; the placeholder is shorter at narrow widths.
- do: client/src/components/industry/parts.tsx figure row; components/explorer/ExploreNav.tsx; components/map/MapSearch.tsx.
- check: at 320x568: /industries shows 12,579,906 whole; the current Explore tab is fully in view.
- deps: none   size: S
- evidence: visitor-map#27, visitor-explore#10, visitor-explore#36, layout-keyboard#6, layout-keyboard#24, gap-conditions#44

### B118 P2 Stop requesting each list page twice
- area: perf
- kind: perf   reach: Explore's Companies, Factories and Careers lists   verified: yes (client/src/components/explorer/BrowseList.tsx:154-157 and :343-345 read; duplicates seen by four testers)
- is: every next page is requested twice (offset=20, 20, 40, 40, ...; three times on the military list) and on desktop one duplicate stays open, so the page never goes idle (31 s to network idle against 1.6 s on a phone). The virtualizer effect (BrowseList.tsx:154-157) calls onLoadMore, which is loadMore (:343-345); its dependencies include that callback, so it fires again before isFetchingNextPage turns true, and TanStack's default cancelRefetch aborts the first request and sends another.
- want: each offset is requested once.
- do: BrowseList.tsx: fetchNextPage({ cancelRefetch: false }) in loadMore, and a ref that remembers the last offset asked for.
- check: Playwright request log on /explore?tab=factories at 1440: each offset appears once and the page reaches network idle within 3 s.
- deps: none   size: S
- evidence: visitor-explore#30, veteran#27, layout-keyboard#42, speed-words#10

### B119 P2 Cache public job reads
- area: perf
- kind: perf   reach: GET /api/jobs, /api/jobs/summary, /api/jobs/by-number/:n for visitors   verified: yes (server/app.ts:73; Cache-Control: private, no-store)
- is: the whole jobs router is mounted with noStore, so the busiest public list and every job page always run the function and the database, unlike companies, factories and careers (s-maxage 60 to 300).
- want: a visitor's job reads carry the public cache headers; what depends on the person (held, myApplication, canManage) comes from a separate signed-in read.
- do: server/app.ts; server/routes/jobs.ts (split the personal fields into GET /api/jobs/:id/mine); server/middleware/cache.ts; client/src/lib/jobs.ts and pages/JobDetail.tsx.
- check: curl -D - localhost:3900/api/jobs?limit=40 shows s-maxage; signed in, the job page still shows the ring and Apply state.
- deps: B001 (same answer)   size: M
- evidence: speed-words#8

### B120 P2 Trim answers that carry what the page does not show
- area: perf
- kind: perf   reach: /me, company pages, Explore row hovers, search   verified: tester
- is: /me downloads the whole taxonomy (185 KB raw, 1.6 s on Fast 3G) to place a few skills under their group. Hovering a company row prefetches /api/companies/<id> and the page then fetches /api/companies/<slug> again (Boeing: 126.7 KB twice). The company answer carries all 292 factories with raw fields while the page shows twelve. Slow reads on a local database: /api/search?q=a 287 ms, bounds/overview 185 ms, areas/austin/overview 164 ms, a companies page 85 ms.
- want: /api/me/skills rows carry their group and domain; a prefetch uses the key the page reads; a company's factories come twelve at a time with the count; company standings are computed once per scope and cached.
- do: server/routes/me.ts and client/src/components/me/SkillsSection.tsx:40; components/explorer/EntityRow.tsx:145; server/routes/companies.ts GET /:id with GET /:id/factories; server/lib/industries.ts.
- check: /me makes no request to /api/skills/taxonomy; opening a company from the list makes one company request; GET /api/companies/boeing is under 30 KB.
- deps: none   size: M
- evidence: speed-words#7, speed-words#9, speed-words#11, speed-words#13

### B121 P2 Do not draw every skill at once
- area: perf
- kind: perf   reach: /explore?tab=skills in its default order   verified: tester
- is: the Skills list By domain renders all 966 skills (46,844 px tall on a 390 px phone) with a long paragraph at the head of each domain.
- want: each domain is one line (its name and counts) that opens in place, or the list is virtualised as the other lists are; no domain paragraph.
- do: client/src/components/explorer/SkillTree.tsx.
- check: /explore?tab=skills at 390 px is under 4,000 px tall on arrival.
- deps: B014; the Skills list is also being redrawn as a connector tree in /home/user/wt-tree: read that branch first   size: S
- evidence: layout-keyboard#26

### B122 P3 Bring empty states, plurals and small wording to the house rules
- area: copy
- kind: copy   reach: client strings and a few stored sentences   verified: tester (file and line cited from a grep of client strings)
- is: empty states that are not "None yet.": "No skills" / "No companies" with "Nothing matches these filters." (BrowseList.tsx:403, 426); "No open jobs" with "Jobs posted by employers appear here." (Jobs.tsx:265; jobs now come from careers sites); "Nothing here yet" with "Companies, careers and skills appear here once they are imported." (ExploreOverview.tsx:473); "No factories are listed for this company." (CompanyView.tsx:43); "No factories are listed here." (RegionViews.tsx:43); "No industries listed." (MapSearch.tsx:228); "Path not written yet." (GoalsSection.tsx:127) against the career page's "None yet."; "This job lists no skills." (ApplicantList.tsx:402); "No skills tagged." (JobForm.tsx:381); "None waiting." (MatchReview.tsx). Hidden unit text reads "1 factories" (components/industry/parts.tsx:235). "Please try again" only in lib/http.ts:21 and :99, "Try again" elsewhere; "e.g." in JobDetail.tsx:655; the one contraction "doesn’t" (NotFound.tsx:15); "Forgot password?" on screen and "Forgot your password?" in SignIn.tsx:405; "Day shift" / "Night shift" under a clock icon. British spellings in stored text: "defence systems", "Air-defence", "modernisation", "sterilising".
- want: an empty list reads "None yet." (CLAUDE.md, Words) with at most one action; singular and plural are both written; one wording per thing; US spelling in data.
- do: the files and lines above; data/employers/corrections.json and data/careers/catalogue.json for the spellings (regenerated through their builders); add "None yet." to tests/unit/words.unit.ts as the only empty-list wording it accepts for the listed components.
- check: rg -n "Nothing matches these filters|Nothing here yet|No skills tagged|1 factories" client/src returns nothing; rg -n "defence|modernisation|sterilising" data returns nothing.
- deps: B061   size: S
- evidence: visitor-explore#34, visitor-records#20, speed-words#25, speed-words#28, gap-addresses-head-industries#17

### B123 P3 Stop showing server error strings written for code
- area: copy
- kind: copy   reach: any failed action whose 4xx message reaches the screen   verified: tester (client/src/lib/http.ts:67-75 messageFor shows a 4xx `error` as is)
- is: strings a person can meet: "Occupation not found" (three routes; the word on screen is Career), "Invalid id: expected a UUID" (shown raw on /atlas?career=nope), "Not Found", "Failed to delete occupation", "Record not found", "Not your job to change.", "status must be ...", "purpose must be work or hire.", "Workforce and open positions are whole numbers from 0 up." (server/routes/factories.ts:399: people, not workforce), "Jobs are limited to ${SCOPE.stateName} for now." (server/routes/jobs.ts:528). The 429 after 30 posts says "Post the next one a little later." with no time.
- want: every `error` a route can return is a sentence for a person in the product's words, or the client maps the status to a written sentence; a limit says when it lifts ("You can post again at 11:42 PM").
- do: grep "error:" in server/routes and server/lib and rewrite; client/src/lib/http.ts messageFor: a fallback sentence per status for strings on a deny list; server/routes/jobs.ts 429 computes the time of the oldest counted post plus one hour.
- check: rg -n "Occupation not found|expected a UUID|Workforce and open positions" server returns nothing; tests/unit/words.unit.ts covers server strings already: add "occupation" and "workforce" to what it refuses in messages.
- deps: none   size: S
- evidence: speed-words#27, gap-hiring-scale#21; also touches: gap-addresses-head-industries#29

### B124 P3 Correct the notice emails' wording and links
- area: copy
- kind: copy   reach: access, company-request and applicant emails   verified: tester (outbox2.jsonl read)
- is: the decline email ends "Open your jobs: .../employer". A company request that ended with the company added says "Your request for access to Brazos Valley Fabrication was approved", not that the company was added; the subject says "request to join" and the body "access". The new-applicant email says "They hold 4 of the 17 required skills" where the applicant saw "You hold 4 of 20". Every notice's last line links /settings, which opens at the top: the switch is the third section.
- want: a decline carries no "Open your jobs" link; a company request's answer says the company was added and that the person has access; one figure for held skills (B052); the footer links /settings#email-notices and the page scrolls there.
- do: server/lib/emailTemplates.ts; client/src/pages/Settings.tsx (the section's id exists as email-notices: scroll to a hash on load); tests/api/email.sh expectations.
- check: tests/api/email.sh passes with the new wording; opening /settings#email-notices shows the switch in view on a phone.
- deps: B040; B052   size: S
- evidence: employer#11, employer#21, gap-applicant#24

### B125 P3 One "show all" pattern and no icons on rows
- area: system
- kind: consistency   reach: record pages, /me, /jobs, pickers, map panels   verified: tester
- is: two patterns for the rest of a list: "All 21" as a link at the heading's right (jobs) and "Show all 21" under the list (factories, careers); a factory's page heads "Careers here" where a company's says "Careers". "Show all" under Within reach on /me adds two rows (four become six) though a list one or two longer is meant to be shown whole. Icons on rows against the rule: a briefcase on career results in Profile's picker and on the map panels' career rows; a pin and a clock on every /jobs row.
- want: "All N" at the heading's right when it leads to another page, "Show all N" under the list when it opens in place, everywhere; a list at most two longer than its cut is shown whole (one rule in ShowAll); no icon on a row except a company's mark and a skill's held mark.
- do: client/src/components/layout/Page.tsx ShowAll (the rule and its use on /me), the record views' headings, components/account/CareerPicker.tsx, components/map/panel/*, pages/Jobs.tsx.
- check: rg -n "Briefcase|MapPin|Clock" client/src/components/account/CareerPicker.tsx client/src/components/map/panel client/src/pages/Jobs.tsx returns nothing.
- deps: B046; B048   size: S
- evidence: visitor-records#37, seeker#24, seeker#34, layout-keyboard#16, gap-conditions#35

### B126 P3 Remember where a person was in a long list
- area: system
- kind: ux   reach: /jobs, Explore lists, a company's factories   verified: tester
- is: reaching the end of /jobs takes 32 presses of "Show more" (40 a page, 38 s); Back restores rows and scroll, but a reload at any depth returns to the first 40 at the top; on a desktop the two-column grid reads row-wise, so the date order zigzags. After "Show all" on a company's factories, opening one and pressing Back restores the scroll and collapses the list again (21 rows to 12). Explore lists reload to the top with the first page.
- want: the count of pages shown and an opened "Show all" are kept in history state, so Back and reload land on the same rows; /jobs reads column-wise or is one column.
- do: client/src/pages/Jobs.tsx and lib/jobs.ts (JOBS_PAGE; history.state); components/layout/Page.tsx ShowAll (history state); pages/Explore.tsx.
- check: Playwright: /companies/john-deere, Show all, open the 15th factory, Back: 21 rows and the same scroll.
- deps: none   size: S
- evidence: gap-jobs-search-memory#12, gap-jobs-search-memory#25, gap-jobs-search-memory#26

### B127 P3 Polish career, skill, service and company pages
- area: records
- kind: consistency   reach: record pages   verified: tester
- is: (a) company headquarters reads "Headquarters in Arlington, Virginia" / "Moline, Illinois" while every other place is "City, ST". (b) career page at 1440: the Skills route is about 560 px wide over lists 850 px wide; "Sign in to see which of these skills you have" sits after the ladder, away from the skills. (c) a service's page: every row repeats "Navy" in its title on the Navy's own page; the grey line is "AD · Maintenance" where the Careers list writes "Navy rating · AD"; "39 careers" as a fact and again as "Show all 39"; name order with no find, so HT is in the hidden 31. (d) skill page: "Skills that go with it" starts with a row that has no group line and is already in the Group section above; the heading GROUP stands over the group's name "PLC programming" over a list containing "PLC Programming"; some Group sections show level subheads and others do not; a skill no career uses, or only military careers use, simply ends after "Done with". (e) a military title at 320 px breaks inside a word ("Repairer/Aircre" / "w Member"). (f) Back from a military career opened directly goes to the civilian Careers list. (g) an opened "within reach" row has a grey fill that is offset from the row (a state is never a grey fill).
- want: (a) "Headquarters in Moline, IL"; (b) sections share one width and the sign-in line stands with the skills' heading; (c) on a service's page rows drop the service's word and read "<kind> · <code>" as elsewhere, with a find field over 12 rows; (d) the skill itself is not listed among those that go with it, one rule for level subheads, and a skill with no civilian career says "No career uses it yet." or lists the military ones first; (e) a slash in a title allows a break after it and titles over 28 characters take longTitle; (f) Back goes to the Military list; (g) an opened row is marked by its hairlines only.
- do: client/src/components/entity/CompanyDetailView.tsx, OccupationDetailView.tsx, SkillDetailView.tsx, components/route/Route.tsx, components/reach/CivilianReach.tsx, components/layout/Page.tsx DetailHeader (back target; longTitle), shared/military.ts.
- check: /companies/boeing reads "Arlington, VA"; /companies/us-navy rows carry no "Navy" prefix; /occupations/1e129d3c-c959-4b44-bb3f-edbc717b9120 at 320 px breaks after the slash.
- deps: the connector-tree branch in /home/user/wt-tree redraws the career page's skills: do (b) there   size: M
- evidence: visitor-records#19, visitor-records#28, visitor-records#31, visitor-records#32, visitor-records#34, veteran#14, veteran#20, veteran#23, veteran#24, veteran#25, layout-keyboard#21

### B128 P3 Fix catalogue oddities: a misplaced skill, near-duplicate skills, thin paths
- area: data
- kind: data   reach: skills taxonomy and career paths   verified: tester
- is: Food Processing Operator's path shows the group "Tablet manufacturing · Weighing and Dispensing" (a pharma group on a food career). Near-duplicate skills: Electrode Coating and Dry Electrode Coating; Folder Gluer Operation and Flexo Folder Gluer Operation; Anodizing and Hard Anodizing; Wire Bonding and Copper Wire Bonding; Instrumentation Calibration and Electrical Instrument Calibration; Boiler Operation and Recovery Boiler Operation; Truss Design and Truss Repair Design. 19 groups hold two skills (Open molding, Machine vision, Wire and cable, Jewelry making, Grain milling ...). Paths under ten skills: Tire Builder 8, Truss Designer 8, Prepress Technician 9 (Slaughterer 8, Meat Cutter 9 and Sanitation Technician 9 leave with job-names).
- want: Weighing and Dispensing sits in a group both industries share; each near-duplicate pair is one skill with the other as an other name, or the difference is stated in both descriptions; the three thin paths are reviewed.
- do: data/skills/taxonomy.json and catalogue.json (the pass rules of scripts/build-skills-sql.mjs and build-taxonomy-sql.mjs: catalogue migration first, then taxonomy), data/careers/paths.json (scripts/build-career-paths-sql.mjs --check); the unit tests pointed at the new migrations.
- check: node scripts/build-taxonomy-sql.mjs --check and build-career-paths-sql.mjs --check pass; /occupations/9d649d60-... shows no "Tablet manufacturing".
- deps: B013 (consolidation is the owner's call: collect postings first)   size: M
- ask: Fold the near-duplicate pairs now, or wait for postings? Default: wait; move only Weighing and Dispensing.
- evidence: visitor-records#29, data-as-shown#20, data-as-shown#21

### B129 P3 Review "Careers in this industry" for each of the 21
- area: data
- kind: data   reach: industry pages; the job form's suggestions at a factory   verified: tester
- is: Beverages and tobacco lists no tobacco career; Leather lists Fabric Cutter and Textile Machine Technician and no leather cutter or tanner; Glass, cement and minerals lists Heat Treat Operator and Welder; Printing lists Hydraulics Technician; a construction-equipment factory (Machinery) is offered Optical Technician and Brazer among its first six; the list is the same in every place and in no evident order.
- want: each industry's list is its own trades first (the catalogue's careers whose home or path is of the industry), then shared production careers; the order is the file's.
- do: data/careers/industries.json; node scripts/build-career-lists-sql.mjs --check; the next career-lists migration; tests/unit/careers.unit.ts.
- check: GET /api/industries/machinery careers has no Optical Technician in its first ten.
- deps: job-names (four food careers leave); sectors   size: M
- evidence: gap-hiring-scale#14, gap-addresses-head-industries#23

### B130 P3 Polish Profile's skills: tag flow, the ring at small shares, long lists
- area: seeker
- kind: ux   reach: /me Skills, Closest careers   verified: tester
- is: held tags flow two to a line where they fit and one otherwise, so neighbouring groups look different ("Weld Joint Fit-Up | MIG Welding" on one line, "Sheet Metal Layout" and "Sheet Metal Forming" each alone). At 1 of 8 the ring beside a Closest career is a thin open arc that reads as a loading spinner. With 63 held skills the section is about 60 group lines of one skill each (6,480 px on a phone) with no way to collapse or find one's own skills, and Suggested sits under all of it; a Suggested row's right text is cut ("CNC Machinist and 2 m...").
- want: one tag per line inside a group, or a fixed two-column grid; the ring has a full faint track under its arc; domains with held skills close to a line each above 20 skills; Suggested rows wrap instead of cutting.
- do: client/src/components/path/ (SkillGroupBox, SkillTag, HeldShare.tsx ShareRing), components/me/SkillsSection.tsx.
- check: /me with 60 held skills is under 2,500 px tall at 390 px on arrival; the ring at 1 of 8 shows a whole circle track.
- deps: none   size: S
- evidence: seeker#33, veteran#16, gap-breakage#25, gap-jobs-search-memory#24

### B131 P3 Tidy applying and the application's history for a seeker
- area: seeker
- kind: consistency   reach: job pages' Apply (hand-posted and sourced); /me Applications   verified: tester
- is: Apply is drawn two ways: a hand-posted job with a company link has its own APPLY section with a sentence and "Apply on the company website"; a careers-site job has "Apply" and "On John Deere's careers site" in the facts panel; a hand-posted in-app job puts Apply in a section below "About the job" (CLAUDE.md: the facts panel's last row). /me's history appends every move on one line ("Applied today · Reviewing today · Interview today · Offer today · Declined today · Interview today · Hired today · Offer today"). The note field cuts a pasted 2,610 characters at 2,000 with no counter or word; a second tab's Apply after the first drops its note silently. A withdrawn row offers no "Apply again" though the confirm said one can.
- want: one Apply row, the facts panel's last, for every kind of job; the history shows the current stage and the path to it without reversed moves; the note shows a count from 1,800 and refuses over 2,000 with a message; a withdrawn row links "Apply again" while the job is open.
- do: client/src/pages/JobDetail.tsx, components/jobs/SourcedJob.tsx and JobFacts.tsx; components/me/ApplicationsSection.tsx.
- check: the three kinds of job page each have one Apply control inside the facts panel; an application moved Offer, Declined, Interview reads "Applied · Interview".
- deps: B015   size: S
- evidence: gap-applicant#7, gap-applicant#11, gap-applicant#16, gap-applicant#26

### B132 P3 Refuse implausible pay
- area: employer
- kind: bug   reach: the job form and POST / PATCH /api/jobs   verified: tester
- is: the form accepts $0.50 an hour with no question (only a high hourly or a low yearly figure asks "Per hour or per year?"); the API takes payMin 27 (cents) and the public page shows "$0.27–$0.34 an hour".
- want: hourly pay under the federal minimum ($7.25) and yearly pay under $15,000 are refused with the field named, in the form and in the API.
- do: client/src/lib/employerJobs.ts checkPay; server/routes/jobs.ts readJobFields; tests/api/jobs.sh.
- check: POST /api/jobs with payMin 27 = 400 with field 'payMin'.
- deps: none   size: S
- evidence: employer#16, gap-applicant#25

### B133 P3 Polish the account pages
- area: account
- kind: ux   reach: /sign-in, /settings   verified: tester
- is: after Sign out, Back opens /sign-in?next=/employer (justLeft covers the first redirect only); every sign-in state carries a "Dark or light theme" link; the forgot-password form has no address of its own (reload or Back loses it) and its "Back to sign in" is centred under left-aligned text; a name is saved with a double space inside it; "Map: © MapTiler © OpenStreetMap contributors" sits under the Dark | Light choice as if part of it; a reload empties the name and email typed into sign-up; an unchanged form's Save rests as a solid grey slab (the inverse pair at 0.4) that looks broken, worst in light; after ten wrong passwords the right one is refused with "Try again in a few minutes." and no time.
- want: Back after sign-out stays off gated pages; the theme link is on /sign-in's plain state only; /sign-in?mode=forgot; inner whitespace collapsed; the map credit under its own small heading "Map data"; sign-up fields kept in session storage; a resting Save is the secondary style until something changes; the 429 says when.
- do: client/src/lib/account.ts, pages/SignIn.tsx, pages/Settings.tsx (MapCredits), server/routes/me.ts cleanText, client/src/lib/utils.ts busyButtonClass, server/routes/auth.ts.
- check: sign out then Back lands on a public page; a name typed "Dana  Ruiz" is stored with one space.
- deps: B077   size: S
- evidence: account#8, account#12, account#14, account#18, account#20, account#25, account#32, account#33

### B134 P3 Show visitors the not-found page on admin addresses
- area: admin
- kind: consistency   reach: /admin and its pages, /admin?tab=..., /import, /import/bulk when signed out   verified: tester
- is: signed out, every admin address redirects to /sign-in?next=/admin..., which shows that an admin area exists; a signed-in person who is not an admin gets the not-found page (CLAUDE.md: to anyone who is not an admin every one of these addresses is the not-found page).
- want: a signed-out visitor gets the not-found page too; an admin who is signed out signs in from the header and returns by hand.
- do: client/src/pages/Admin.tsx gate (and the old-address redirects in client/src/lib/adminPages.ts and App.tsx).
- check: signed out, /admin/people draws the not-found layout and the address does not change.
- deps: B063   size: S
- ask: An admin whose session ended will also see not-found on /admin. Acceptable? Default: yes, as CLAUDE.md says.
- evidence: account#9, admin#35, gap-admin-people-layout#18, gap-addresses-head-industries#30

### B135 P3 Polish Admin Tools: headings, labels, phone layout, History wording
- area: admin
- kind: ux   reach: Admin Tools pages and editors   verified: tester
- is: (a) while a record is edited the page is still titled "Records" with the record's name a small heading, and the way back is "Find another record", not the page the admin came from. (b) the Mark preview shows two "?" boxes before a website is typed; a text file named .png shows a lettermark under "The image chosen" and offers "Use this mark"; with no logo found the panel says "Found from <domain>. Replace it when it is the wrong one." over a letter; a mark set by hand stays stale in a second browser until reload (useHandMarks reads the list once); replacing a mark says "Set the mark". (c) labels shout an email ("RESET LINK FOR HIRER-UT-ADMIN@EXAMPLE.COM", the same on invites); "Role" and "Featured" are sentence case among small-capitals labels; a factory's products field is labelled "Makes" (the word used for a skill's equipment); the Industry select lists the 21 by their full NAICS names; a person's purpose is not shown; the name field keeps a double space the save removed. (d) the skill Group select is one flat list of 194 groups with no domain headings; the company form asks for "HEADQUARTERS LATITUDE" and "LONGITUDE" (never asked elsewhere) and its HQ State lists only US states beside a free-text Country; Description is two rows tall under "One line on what the company makes." (e) errors: another career's name is refused without naming that career; only the first clash is reported; renaming a make 'Wafios' to 'WAFIOS' passes without comment; a stale "Already listed: Welder" line stays after the title changes. (f) History prints raw keys and values ("codeSystem: Navy rating → none", "latitude: 30.20338 → 35.4676", "makes: none → Electron microscopes"), lower-case intake lines with no detail ("added from a source ..."), raw capitals names and the year on this year's dates. (g) People: the list does not say which admin is the first admin; delete says "skills and goals" when there are none; no notice after delete. (h) Access puts Approve / Decline at a row's right for join requests and under the text for company and factory requests. (i) on a phone the tab "Data quality" is cut to "Data qual…", the table scrolls sideways with no sign of more columns, and the pinned notice covers the control just pressed for seven seconds. (j) the uncertain-matches list runs two matches together with no hairline, preselects the first candidate without saying one must be chosen, and repeats "Different adds it as a new factory." on every row.
- want: (a) the editor is headed by the record's name and kind with "Back" to where the admin came from; (b) no preview until there is something to preview, a refused file is refused on choice, marks refetch on focus, "Replaced the mark"; (c) labels do not capitalise addresses; one label style; the field is "Products"; short industry names; (d) Group options under domain optgroups; headquarters through the address fields; (e) refusals name the record and list every clash; (f) History words fields as the forms do and formats names and days as the app does; (g) "First admin" on the row; counts only of what exists; (h) one button placement; (i) the view switch wraps, the table shows a fade at its cut edge, the notice sits above the bottom controls; (j) a hairline between matches, an explicit choice, the sentence once.
- do: client/src/components/admin/RecordsPage.tsx, RecordEditor.tsx, MarkEditor.tsx, CopyLinkField.tsx, RecordForm.tsx, MakesEditor.tsx, HistoryList.tsx, PeopleTab.tsx, CompanyRequests.tsx, AccessTab.tsx, ActivityPage.tsx, QualityTable.tsx, AdminNotice.tsx, MatchReview.tsx; client/src/lib/marks.ts; server/lib/audit.ts action words; server/lib/records.ts aliases check.
- check: the editor of a factory shows a field labelled Products; History shows no camelCase key; /admin/activity?view=quality at 390 px shows the whole label "Data quality".
- deps: B089   size: L
- evidence: admin#21, admin#22, admin#23, admin#27, admin#31, admin#33, admin#34, gap-admin-queues-editors#17, gap-admin-queues-editors#20, gap-admin-queues-editors#21, gap-admin-queues-editors#22, gap-admin-queues-editors#24, gap-admin-queues-editors#25, gap-admin-queues-editors#29, gap-admin-people-layout#12, gap-admin-people-layout#16, gap-admin-people-layout#17, gap-admin-people-layout#20, gap-admin-people-layout#21, gap-admin-people-layout#22, gap-admin-people-layout#24, gap-admin-people-layout#25

### B136 P3 Frame subjects and shared addresses sensibly
- area: map
- kind: ux   reach: /map with a subject, a shared fragment, a rotated phone   verified: tester
- is: framing a company puts its factories at the frame's edges (the El Paso pin under the left overlay, Austin's against the panel) while the four focus-area outlines and chips stay on screen; a shared address /map?company=john-deere#9.5/29.76/-95.37 opens on Houston, where the company has nothing, with no cue; opening a link in the same tab whose only difference is the #zoom/lat/lng does not move the camera; rotating a phone with Houston selected keeps the panel and leaves Houston half under it.
- want: fits use padding equal to the overlays; when the fragment's view holds none of the subject's pins a line offers "Show all 21"; a hashchange moves the camera; a resize re-fits the selection.
- do: client/src/components/map/camera.ts; client/src/pages/MapView.tsx (hashchange; the empty-view line).
- check: Playwright: on /map#7.2/41.85/-87.85 navigate to /map#13/41.507/-90.44: the centre changes.
- deps: none   size: S
- evidence: visitor-map#31, gap-conditions#12, gap-conditions#13, gap-conditions#19

### B137 P3 Polish pins, the hover card and the selected chip
- area: map
- kind: ux   reach: /map close in; hover on desktop; light theme chips   verified: tester
- is: close in, pins come in three sizes and shades and nothing says the large ones have open jobs (size also follows the company's tier, so hiring cannot be told from established); the hover card is a wide box with one line, the registry's legal name ('Top Die Casting Co', 'Union Special Corp'): no company, place, people or open jobs, and the raw NAICS description where it shows an industry; in light the selected focus-area chip differs from the others only by slightly darker text.
- want: one meaning per visual variable (size for open jobs or for tier, not both) and the hover card says it ("3 open jobs"); the hover card reads "Display name / Company · City, ST / N people · N open jobs" from the pin's own properties; the selected chip takes the inverse pair or the accent outline.
- do: client/src/components/map/layers.ts (HIRING_SCALE, tier sizing), MapHoverCard.tsx, Map.tsx:118, shared/pins.ts (which fields a pin carries), client/src/styles/globals.css .map-chip[aria-pressed].
- check: hovering Giga Texas shows "Tesla · Austin, TX"; the Austin chip is plainly selected in light.
- deps: B045; B018; sectors (the label)   size: S
- evidence: gap-conditions#15, gap-conditions#16, gap-conditions#32; also touches: visitor-map#15

### B138 P3 Cover small text, reduced motion on the sheet and forced colours
- area: a11y
- kind: a11y   reach: lettermarks, the Skills tree, the phone sheet, Windows high-contrast mode   verified: tester (the forced-colours map needs a second look with a longer wait)
- is: lettermarks draw their letter at 9 px; the Skills tree's 188 group names are 11 px small capitals (content set at label size); map panel and job fact labels are 11 px. Under prefers-reduced-motion the phone sheet keeps its 0.3 s height transition (map flights are already instant). In forced-colours mode a career page's group markers flip meaning (groups with none held are solid discs, part-held nearly full) and the map canvas was black with no basemap or pins after 4.5 s; no forced-colors rule exists in the CSS.
- want: no content under 12 px; the sheet does not animate under reduce; under forced colours marks keep their meaning (system colours, outlines) and the map falls back to the plain style.
- do: client/src/components/CompanyLogo.tsx lettermark size; components/explorer/SkillTree.tsx group heading class; client/src/styles/globals.css (the reduced-motion block; an @media (forced-colors: active) block for route markers, ShareRing, SkillHeldToggle); components/map/layers.ts token reads under forced colours.
- check: Playwright with forcedColors 'active': a group with none held is an outline; with reducedMotion 'reduce' the sheet's computed transition is none.
- deps: none   size: M
- evidence: layout-keyboard#39, gap-conditions#27, gap-conditions#28, gap-conditions#43

### B139 P3 Follow the system theme on a first visit and keep theme state in step
- area: system
- kind: ux   reach: first visits, two tabs, phones in light theme, browsers that refuse storage   verified: tester
- is: a person whose system is light gets dark (prefers-color-scheme is never read); switching the theme in one tab leaves another tab as it was until reload (no storage listener); with storage refused the choice lasts one page; on a cold load of a job or industry page in light the phone's theme-color stays the dark #0e0e0f for good (paintChrome runs before the stylesheet and on a load event already fired).
- want: with no stored choice the first paint follows prefers-color-scheme; a storage event switches other tabs; the choice is held in memory when storage throws; theme-color is painted when the document is complete as well.
- do: client/index.html pre-paint script (its hash is in vercel.json's policy: update it; npm run lint checks); client/src/lib/theme.ts.
- check: Playwright with colorScheme 'light' and a fresh profile: data-theme is light; on /jobs/<any> in light meta[name=theme-color] is #ffffff after load.
- deps: none   size: S
- ask: Dark is the stated default: should a first visit follow the system instead? Default: yes.
- evidence: gap-conditions#29, gap-conditions#30, gap-breakage#29, gap-addresses-head-industries#12

### B140 P3 Hold layout steady while late data arrives
- area: perf
- kind: perf   reach: /me, Explore lists on a phone   verified: tester
- is: /me on a phone has a cumulative layout shift of 0.25: Goals or Skills jump about 1.7 s after load when careers within reach, suggested skills and the taxonomy arrive; a new account's starter draws, then "Careers to aim for" pushes it down; Explore lists shift 0.03 to 0.04 as the count line and filters settle.
- want: sections reserve their place (skeleton rows of the final height); CLS under 0.1 on /me at 390 px over 4G.
- do: client/src/pages/Me.tsx, components/me/GoalsSection.tsx and SkillsSection.tsx, components/explorer/BrowseList.tsx count line and FilterBar.tsx.
- check: the tester's perf.js (speed-words/) on /me phone4g reports CLS under 0.1.
- deps: B120 (the taxonomy read goes away)   size: S
- evidence: account#26, speed-words#6, speed-words#32

### B141 P3 Normalise addresses: letter case, trailing slash, section anchors
- area: system
- kind: consistency   reach: typed and pasted addresses   verified: tester
- is: /Jobs draws the Jobs list under the tab title "Archangel" with the header item unlit; /companies/john-deere/ and /explore/ keep their trailing slash, so one page has two addresses; /me#skills and /settings#appearance open at the top because no element has those ids.
- want: a route in the wrong case or with a trailing slash is replaced by its canonical address; /me has #applications, #goals, #skills and /settings has an id per section, scrolled to on load.
- do: client/src/App.tsx (a normalising redirect) or vercel.json trailingSlash; client/src/pages/Me.tsx and Settings.tsx ids.
- check: /Jobs/ ends at /jobs with the title "Jobs · Archangel"; /me#skills scrolls to Skills.
- deps: B064   size: S
- evidence: gap-addresses-head-industries#9, gap-addresses-head-industries#10, gap-addresses-head-industries#28

### B142 P3 Add a print stylesheet
- area: system
- kind: missing   reach: printing a job, a career, a company or Profile   verified: tester
- is: there is no print stylesheet: without backgrounds the dark theme prints pale grey ink on white; with them, solid black pages; the header prints; controls print (skill circles, "Add a skill", remove marks, "Show all"); lists print cut at their on-screen size; the Apply link prints as a word with no address, so a printed job cannot be applied to.
- want: print uses the light tokens, hides the header and controls, opens every list and disclosure, and prints a link's address after it for Apply.
- do: client/src/styles/globals.css @media print (tokens only; scripts/check-theme-colors.mjs still passes).
- check: page.pdf() of /jobs/john-deere/welder/40990 shows dark ink on white, no header, and the Apply address.
- deps: none   size: S
- evidence: gap-addresses-head-industries#11

### B143 P3 One sign-in prompt over skills, said once
- area: copy
- kind: consistency   reach: signed-out job and career pages   verified: tester
- is: a signed-out job page offers sign-in three times (the header; "Sign in to apply" and "Create an account"; a "Sign in" button before "to see how many of these skills you hold."), and on a phone that last sentence breaks into a button on one line and its words on the next. The career page says "Sign in to see which of these skills you have." (two wordings: hold and have). The sign-up page reached from a job does not say which job.
- want: one line in one wording ("Sign in to see which of these skills you hold") as a text link that wraps as a sentence; on a job page the Apply panel's sign-in is the only button; the sign-in page names the job from `next`.
- do: client/src/components/jobs/JobSkills.tsx, components/entity/OccupationDetailView.tsx, pages/JobDetail.tsx, pages/SignIn.tsx.
- check: rg -n "skills you have" client/src returns nothing; at 390 px the line wraps as text.
- deps: B001; B077   size: S
- evidence: data-as-shown#24, speed-words#26, gap-applicant#20

## NOT REPRODUCED OR DROPPED
- layout-keyboard#40: not reproduced: "map flights ignore prefers-reduced-motion" was read from camera.ts only; gap-conditions#43 ran the map with reducedMotion 'reduce' and saw flights instant (MapLibre honours it). The phone sheet's transition under reduce is in B138.
- gap-addresses-head-industries#32: not a defect: the tester recorded that old ?path= and &domain= addresses are cleaned as designed, for coverage only.

## COVERAGE
- not walked by anyone: production itself and GitHub Actions (nothing outside the three local instances was touched; the Apply links to employers' sites were read, never followed); a real screen reader (the accessibility tree through Playwright only); a phone rotated live, safe-area insets, true browser zoom; 768 and 1920 widths and the light theme on most hiring and Admin Tools pages; a closed or expired job from a careers site (none in the copy); a company's version of a career on instance 1 (none in production's copy: versions were made on instances 2 and 3); an in-app application on instance 1 (no hand-posted job in production's copy); emails in a mail client (read as outbox lines); a second visit a day later; deleting the last admin; removing a make people had marked; the Atlas beyond a light look (in flight).
- visitor-explore (37 findings)
  - walked: /explore overview desktop 1440, phone 390, 320, light theme desktop; every link on it enumerated | /industries desktop and phone; place picker opened | /industries/transportation-equipment, /electronics, /food each for US, ?state=TX, ?area=austin (desktop), TX at 320, food in light on phone; Back button | /explore?tab=companies desktop + infinite scroll to ~240 rows; phone; industry=food filter; bogus industry | /explore?tab=factories desktop 1440, 1280, 1600, 768, phone; sort Name A-Z; state=TX; WY+leather empty state | /explore?tab=occupations default, military=1, service=navy phone, domain=safety, domain=bogus, military+semiconductor, 320 military | /explore?tab=skills by domain, Most careers, domain=fabrication, group=arc-welding phone, bogus domain; List->Atlas->List switch and browser Back | /atlas light look desktop (domain open) and phone | Header: Explore menu on hover and by keyboard (Tab, ArrowDown, Escape), Ctrl+K, wordmark -> /map | Header search: 34 queries via API and UI (tesla, teslla, catepillar, welder, cnc machinist, fanuc, haas, austin, texas, TX, forklift, boeing, john deer, maintenance tech… | /jobs/john-deere/welder/40990 (owner's welder question) desktop + API; /api/jobs?q=welder career mapping | Not-found: /nothing-here, /refs/123, /companies/no-such-co, /occupations/<zero uuid>, /industries/bogus, /jobs/x/y/999999 | /settings signed out phone; theme switch to light, persistence across reload, another page and a new tab; map credits line
  - not walked: Explore menu with a screen reader (only keyboard focus checked) | Every link on all three industry pages clicked one by one (links enumerated on Overview only; industry links read from text) | Companies list beyond ~240 rows / end of list | Header search on 768 tablet and 1920 | Rotation of the phone (landscape) not tested | Light theme on Factories/Companies lists at desktop (checked Overview and an industry page only) | Map credits link targets not followed (outside sites) | Atlas beyond a light look (in-flight rebuild)
- visitor-map (34 findings)
  - walked: / -> /map first visit, phone 390x844 and desktop 1440x900 (dark) | /map at 320x568, 768x1024, 1920x1080 and phone landscape 844x390 | Map search, desktop: austin, 78701, Travis County, tesla, welder, welidng, weldng, machinst, Housten, cnc machinist, plastic injection, boeing, deere, ge aerospace, TX, … | Map search: picked places 78701, Travis County, Waterloo IA, Cabot -> place panels (/map?place=...&box=) | Map search on phone with sheet open; keyboard simulated by shrinking the viewport; picked career Welder from search | Focus area chips: Austin, Houston, Dallas-Fort Worth, San Antonio (desktop); Austin on phone; DFW at 320 and 768 | Phone sheet: peek on open, swipe up to full, scroll to bottom, swipe down to bar; toggle button | State panels: /map?state=OH, ?state=KS (clicking the state on the map), ?state=TX with the Food filter | Austin panel links: All 162 open jobs -> /jobs?near=..., job row -> job page, industry row -> /industries/electronics?area=austin, All industries -> /industries?area=aus… | Factory: hover card and click on Giga Texas (z14) and SpaceX Bastrop (z15), desktop; tap on phone at z14; tap at z4.5 (selects area) | Factory panels for raw rows: Bell Helicopter Textron Closed, Dimmitt TX, Boeing North Charleston | Factory page and Company page buttons from the Giga Texas panel -> /factories/:id, /companies/:id | Company subjects: ?company=john-deere (desktop), spacex (phone, chip removed), Applied Materials from the Austin panel, Austin Foam Plastics (small), Dimmitt (one factor… | John Deere panel -> Production Welder job page /jobs/john-deere/welder/40990 (Skills read) | Career subject ?career=<Welder>; skill panel ?skill=<MIG Welding> | Filter menu: industry list, Food chosen (?industry=Food+Manufacturing) | Not-found links: ?factory=zero uuid, ?company=no-such-co, ?state=ZZ, ?area=nowhere, ?career=bogus uuid, ?skill=abc, ?industry=Nothing, ?company=us-navy | Back/forward: map -> Austin -> company -> company page -> back x3 -> forward -> reload | Phone: double tap (zoom 9 to 10), touch drag, Zoom in, Reset view | Keyboard: Tab order from page load, Enter on a chip, Escape closes panel, search with arrows and Enter | Light theme via /settings Appearance, then /map home, ?area=houston, ?company=spacex (desktop) | API reads: /api/map/areas/*/overview, /api/map/states/*/overview, bounds overview timing, /api/factories/pins size and headers, /api/search, /api/companies/tesla, /api/j…
  - not walked: Light theme on the phone: done on desktop only, for lack of time | A real on-screen keyboard: simulated by shrinking the viewport, which matches Android's resize but not iOS's visual viewport | Opening a link in a new tab: shared links were tested by loading each address directly in a fresh page, which is equivalent | The hover card on dense far-out clusters and the touch reach at low zoom were not measured | Atlas: not in this brief (map only) | Factory and company pages beyond the first screen: other testers own them; reached only from the map buttons | The Apply link was read (jobs.deere.com) and not followed, as instructed
- visitor-records (38 findings)
  - walked: 15 company pages desktop 1440 + phone 390 (Boeing, Ford, John Deere, Intel, Raytheon, RTX, Collins Aerospace, Interamerican Foods, US Conec, SIMFLO, A T & E, 7100 K, And… | 13 factory pages desktop + phone (Pantex, Panasonic Nevada, Boeing San Antonio, Anduril Waltham under construction, Port Alpha under construction, Aero Metals, Abitibi, … | 12 career pages desktop + phone (Welder, Manufacturing Engineer, Distiller, Glass Forming Operator, Paint Process Engineer, Electronics Assembler, Sewing Machine Operato… | 12 skill pages desktop + phone (PLC Programming, CAM Programming, Blueprint Reading, Shop Safety Practices, Structural Casting Machining, Diesel Engine Maintenance, Para… | 8 job pages (John Deere welder 40863, SpaceX pipe welder 40075, SpaceX CNC 39966, Anduril ME 40445, Panasonic 41060, Rivian 40883, Hussmann 41065, Boeing 40893) | light theme 390 and 1440, 320x568, 768x1024, 1920x1080 for job, career, company, factory, skill pages (no horizontal overflow) | Back on a fresh tab; Boeing Show all 292; '24 more' click; career Open all; All 31 link target; job tag links and skill links; old /jobs/<id> and wrong-words job URL red… | keyboard Tab order on career page | API timing for company/occupation/skill/job reads; console errors and failed requests on 120 page loads (none) | /api/map/factories/:id/county for 4 factories; DB checks of county_fips, welding job mapping
  - not walked: Company's version of a career page (?at=): no company_careers rows exist in this copy of production | Atlas light look: not opened (in flight) | Following Apply links out (forbidden; addresses read only) | Screen reader pass beyond heading structure and one Tab walk | Rotation on phone | Every 'Show all' on every page: checked Boeing factories only; others read as text only
- seeker (38 findings)
  - walked: /map phone+desktop (signed out, signed in), /map?area=houston phone | header sign-in link from map, career page, job page | /sign-in: sign in tab, create account tab; empty submit; bad emails (ray@, no TLD); short password; common passwords (password123, 12345678); duplicate email; success; w… | sign-up landing from map, career page, job page (3 accounts: Ray welder, Maya maintenance tech, Jordan grad) | account menu (phone), sign out, gated /me redirect when signed out | /me empty state: Start with a career search (welder, weld, welding, mig welder, pipe welder, xyzzy, entry level, no experience, warehouse, apprentice, technician, assemb… | goal remove (only goal), attempted undo, re-pick; looked for adding a second goal | skills: mark from Suggested, More, Add a skill search (SMAW, GMAW, flux core, stick, tig, mig, welding, gtaw, 6G), Held from search, counts by domain/group, ring | Within reach / Closest careers, Show all, '1 open job' link to /jobs?career= | /jobs: default list phone; q=welder; Where: Houston, 77002, 78701, 00000, 99999, TX, Texas, Pasadena, Baytown; 25/50/100 miles; state=TX; empty states; ZIP from settings… | job pages read: John Deere Production Welder 40990 (phone seeker, desktop visitor), Anduril Welder 40406, SpaceX EB Welder 40099, Blue Origin Pipe Welder II 40902, Space… | Apply pressed (outside traffic blocked), popup and API calls checked, return to /me | career page /occupations/<Welder> as seeker (phone), Maintenance Technician as visitor (desktop) | skill page /skills/<TIG Welding> as seeker | /atlas?career=<Welder> light theme phone+desktop | /settings: ZIP validation (7700), save 77002, theme switch | missing/old links: /jobs/.../999999, /occupations/<zero uuid>, /skills/nope, /jobs/<uuid> redirect, wrong-slug redirect | layout at 320x568, 768x1024, 1920x1080 for /me, a job page, /jobs (no horizontal overflow); light theme /me and job page
  - not walked: Account menu dot and Applications on Profile: every open job (1,284 of 1,284) comes from a careers site, so no in-app application can be made on instance 1 and no news can be produced | 'A career with no path' in Start with a career: every one of the 231 careers has a path of 8 or more skills | A real second visit a day later: could not move time; judged only from what Profile and Jobs show on returning (nothing time-relative) | Phone rotation (landscape) not exercised | Keyboard-only walk of Profile marks and the Jobs Where combobox not done in depth | Header global search on phone: my click did not open it, so its results for 'welder' were not captured | Did not follow any Apply link off-site (by rule)
- account (35 findings)
  - walked: /sign-in phone+desktop: sign in empty, wrong password, correct password; Create account tab; empty create; tab titles | Sign-up via API with common passwords (password1, 12345678, qwertyui, Password123, archangel), invalid email, duplicate email in another letter case, 300-char password, … | Sign-up via UI as Find a career (phone) -> /me; Hire via /employer > Create account with keyboard Tab+Enter (desktop) -> /employer | Account menu for seeker (phone, desktop), hirer, invited employer | Forgot password: prefilled email, empty, invalid, unknown address (same answer, timing 1-4ms either way), outbox email text+html, link host, throttle (10 requests -> 1 e… | Reset: superseded token, made-up token, good token, empty, common password, reload mid-way, success landing, reuse of used token, other sessions ended, old password refu… | /settings seeker and hirer, phone and desktop, light theme: name+ZIP (blank, abcde, 00000, ZIP+4, double space, reload mid-edit); API ZIP edge cases | Change password: empty, wrong current, common, same as current, success, other session signed out | Change email: invalid, wrong password, same address in capitals, success; mail to the old address read | Email notices off/on, persisted on reload | Theme light on /settings, /me (as hire -> /employer), /sign-in; theme attribute set | Purpose switch work->hire->work: header nav, menu, /me redirect, /employer, a job page as hirer | Delete account: empty, wrong password, Escape returns focus, reopen clears password, real delete, landing, Back, sign-in after delete refused, forgot after delete, DB ro… | Signed-out /me, /employer, /employer?post=1, /settings, /admin, /admin/people, /admin/review?list=paths on phone and desktop | Sign out from menu, Back, Back again; /employer after sign-out; second browser stays signed in | Invites on instance 3 (admin made there): employer invite good -> sign-up -> /employer; used; expired (set in DB); made-up (instance 1); invite for another address while… | Layout at 320x568, 768x1024, 1920x1080 for create and visitor settings (no horizontal scroll) | Session cookie headers (HttpOnly, SameSite=Lax, no-store) | Login rate limit (10 then 429)
  - not walked: Admin invite and admin-made password reset link UI (Admin Tools pages) not driven; invites were created through the API on instance 3 | Notices emails (applications, access approve/decline) with notices on versus off: needs an application or access request, which belong to other testers' instances | Email notices switch's effect on actual mail not verified | View as (admin-only) not exercised on instance 1 by instruction | Rotation of the phone not done | Cookie Secure flag not judged: the local instance runs on http
- employer (34 findings)
  - walked: /sign-in: Sign in tab, Create account tab, empty submit validation, common password refused, sign up as Hire (desktop) | /employer landing before access (desktop, phone) | Company finder: exact 'John Deere', misspelt 'Jon Deer', 'Deere & Company', 'Deere and Co', 'Tyson Foods Inc', 'precision' (223 near namesakes), 'Bradley Machine Product… | Request access via UI (Kohler, John Deere); waiting state | Ask for a missing company (empty 'where' validation, then sent) | Ask for a missing factory of Kohler (sent; admin emailed) | Admin account made with make-admin; /admin index; /admin/access approve Kohler, decline John Deere, Approve after all, Undo shown; Add link from request; Give access for… | Outbox: access approved, declined, added, admin-added (Boeing), new applicant, stage changes, factory request | Account dot and menu for manager (desktop) | Your jobs with 1, 3 and 4 companies | Job form: company switch, factory picker with 1, 7 and 292 factories plus search, career picker by title, another name, misspelling and a missing name, default skills, k… | Job page as manager: Edit/Save, Post another like this (copy), Close with reason, Reopen, Delete (job with no applications), deleted link 404 page | Public: /jobs?q=welder&state=TX, company page, factory page, career page (Open jobs, Companies), map factory panel | Seekers: two accounts, apply without and with a note (phone), withdraw from /me (phone) | Applicants: list, open row, skills held/missing, applicant's note, private note save, stages Reviewing/Interview/Offer/Hired (confirm, Undo shown), back to Interview, De… | Careers-site job as member (John Deere, desktop and phone) | Company Careers: add Welder version, leave out 6 skills, add Robotic Arc Welding, mark make Fanuc, See the page, version on career page Companies, job tag shows version,… | Leave a company (confirmation text, result) | Layouts: phone 390 applicants and post form, 320 job page (no horizontal overflow), light theme on the job manager page
  - not walked: 30-jobs-an-hour limit not reached in the UI; read from server/routes/jobs.ts (MAX_POSTS_PER_HOUR = 30, 429 with a message) | Applicant search by name (shown only above eight applicants); not reached with two applicants | 768x1024 and 1920x1080 not captured for the employer pages; 320 only for the job page | The job on the map as a pin with open jobs (only the factory panel was checked); no zoom check | Applicant contact by ZIP: neither seeker had a ZIP code, so ZIP display was not seen | Light theme checked on one page only | Apply on a careers-site job as a seeker (only the member's read-only view; the outside link was read, not followed)
- admin (39 findings)
  - walked: Signed up admin-ut@example.com via API, made admin with scripts/make-admin.mjs (instance 3) | /admin index desktop and phone | /admin/review desktop; ?list=paths with filter 'welder'; ?list=matches; ?pairs=id; ?pairs=spot&state=TX: Two factories, Undo, Merge; ?postings=places: Point here, Undo, … | Career editor Welder: remove skill, add-a-skill picker, Save path, Approve, Undo, Return to draft | /admin/add: company empty submit; company found by address; street-only; town-only; not found; wrong state with foreign ZIP; coordinates by hand (bad latitude, out-of-st… | /admin/records search: tesla, Teslaa, john deere, weld tech, cnc, Kentucky Truck, GE Aerospace, fanuc, 15T, zzqx | Company editor: Details bad values (empty name, bad domain, bad HQ latitude), good save with other names and Part of; Mark: 294 KB PNG, text file named .png, SVG with sc… | Factory editor: Details bad (ZIP, negative people, year 3020) and good values | Skill editor: Makes add x2, duplicate add, rename, move down, remove; empty name save; History panel | Merge: company into company; company into U.S. Navy (succeeded); civilian career into military career (refused); factory curated vs uncurated | Delete: factory, company and career with a job with applications (refused); skill (deleted) | Posted a job by API and applied as a second account to create an application | Edit from /occupations, /companies/john-deere, /skills page and browser Back | Access: made a join request (seeker), a second join request and a company-add request (hirer); Approve, Undo; Decline, Undo, Decline; Give access after adding the compan… | People: role filters admin/employer/waiting/user; search deere/hana/zzz; open person; email taken; bad email; rename; make admin; remove admin; remove company access; pa… | Invites: empty email; user; employer of a company; admin; existing account; re-invite same address; revoke; accepted employer invite in a fresh phone browser (common pas… | Activity: History with Careers filter; Sources; Postings; Data quality (desktop, phone) | View as user from /settings (desktop and phone), career page while viewing, the sign back to admin | Old addresses /admin?tab=people, ?tab=data, ?tab=history&kind=career, /import | Non-admin (seeker) and signed-out view of six admin addresses | Light theme on Review pairs and company editor | Public: /companies/tesla, unknown company/factory/career pages, U.S. Navy page after merge, John Deere welder job page and its API
  - not walked: Uncertain matches: none waiting in this copy, so Same/Different/Skip could not be exercised | Factories listed twice by registry id: none waiting | Sources view: no intake runs recorded ('None yet.'), nothing to open | View as employer: only View as user was exercised | Merge of skills and a factory merge refusal (curated into uncurated): the factory merge UI picks the kept row itself so the refusal could not be provoked from the page | Phone was used for the index, postings places, career editor, data quality and access only; 320/768/1920 widths not checked for Admin Tools | Expired invite path and invite email for admin role were read in the outbox only, not accepted | A make removal that people had marked (no marks in this copy)
- data-as-shown (25 findings)
  - walked: SQL sweep (read only) of archangel_ut: factories, companies, jobs, job_skills, occupations, occupation_skills, skills, skill_groups, counties | Every factory and company name run through shared/displayName.ts formatFactoryName and formatCompanyName (names.ts), classified | GET /api/stats/counts, /api/companies (list, ?state=), /api/factories (sorted, by state), /api/jobs (all 1,284), /api/jobs/by-number/40864, /api/search?q= grace, a o smi… | GET /api/explore/overview, /api/map/states/TX/overview, /api/map/factories/:id/county | Read about 300 open-job title and career pairs, and the factory each job is attached to | /jobs/john-deere/welder/40864 desktop dark, phone dark, phone light | /factories/f68fbb5e... (Akm) desktop; /factories/189b90ce... (Boeing C-1) desktop; /factories/5956f739... phone | /companies/225139fb... (Gra), /companies/d424022c... (Ty), /companies/boeing, /companies/tesla (404), C&w Fabricators phone | /map?state=TX desktop panel | /explore overview desktop; /explore?tab=companies&state=TX phone; /explore?tab=factories&state=TX desktop | /industries?state=TX, /industries/fabricated-metals?state=TX desktop | /occupations/<Tire Builder> phone
  - not walked: Factories list screenshot: one run logged a failed request at offset=20 and took 31s; the same request answered in 10ms when retried, so no finding is reported | 320x568, 768x1024 and 1920x1080 layouts: not taken, because the brief was the data as shown | Map panels for focus areas and careers against the database: only Texas was checked | Skill pages and the Skills list: checked through the API and SQL only | No account was created: none of the data checks needed one | Atlas not opened (in flight)
- veteran (30 findings)
  - walked: /map phone: map search 'hull maintenance technician', '15T', 'navy hull' | /map?career=<HT id> (answered 'That career is not on the map.') | /explore overview phone and desktop | Header search on phone: 'HT', 'navy hull', '15T', 'air force metals', 'hull maintenance technician', 'helicopter' | API /api/search?military=named for about 35 queries (codes, titles, service names, 'veteran', 'military') | /explore?tab=occupations phone; Military switch; Branch menu (Navy) and Domain menu on desktop; service=marine-corps empty state; sort=name scroll | /occupations/<Navy HT> phone signed out (top to bottom, Open all), desktop, phone signed in, phone light theme | Civilian careers within reach on the HT page: opened rows (one at a time), Show all 22, 'N more' in Missing, Career page, browser back | /occupations/<Army 15T> phone and 320x568 | /occupations/<AF 2A7X1> via API (path, withinReach) | /occupations/<Aircraft Mechanic> phone: Military careers that reach this | /occupations/<Shipfitter> phone and desktop | /companies/us-navy, us-army, us-marine-corps phone and desktop | /atlas?career=<HT> phone and desktop | /occupations/<nonexistent uuid> not-found | /sign-in: Create account (Find a career), empty submit, common password refused, successful sign-up landing on /me | /me: Start with a career search ('navy hull', 'HT', 'hull maintenance technician', '15T', 'welder', 'shipfitter'), Set Shipfitter as goal, Add a skill x28 held, Within r… | /jobs?career=Welder phone; Where: Norfolk, ZIP 76541 (Killeen), 00000, San Antonio; empty states | /jobs/john-deere/welder/40990 signed out and signed in (skills section, You hold 12 of 20) | /settings Appearance: Light; light theme on HT page, Careers Military list, /me | API jobs near Norfolk, Killeen, San Antonio, by career and overall; openJobCount of every civilian career reached
  - not walked: Profile for the Army 15T and Air Force 2A7X1 personas was not done by hand: I did the HT journey fully, and the 15T and 2A7X1 only through their pages and the API (same mechanism) | Rotating the phone and the 768/1920 widths on the military pages (I covered 320, 390 and 1440 only) | Applying to a job: the reached careers' jobs are all from careers sites, so Apply links out (only the address was read, not followed) | The Atlas marking flow for a seeker: the Atlas is being replaced, so it got a light look only | Keyboard-only walk of the reach rows and the Branch/Domain menus
- layout-keyboard (48 findings)
  - walked: Instance 1 seeker account created via API (lk-seeker@example.com), goal Welder set, 5 skills held | Sweep with metrics and full-page screenshots for 31 routes: /map, /map?area=austin, /explore, the companies, factories, occupations, occupations&military=1 and skills ta… | Viewports: 390 and 1440 dark for all routes; 320, 768, 1024 and 1920 dark for all routes; 390 light for the first 7 routes; extra light shots of /me, Navy HT, /map?area=… | Phone landscape 844x390 on /map?area=austin; 200% zoom simulated at 720x450 on /jobs | Keyboard Tab walk on /map, /explore, the job page and the Welder career page | Explore menu arrows and Escape; Explore tab row arrows; Industry/Military segmented arrows; account menu open, arrows and Escape focus return; career group disclosure wi… | Sign-in form: empty submit (aria-invalid, describedby, role=alert, focus first field) and wrong password | Accessibility tree (headings, landmarks, live regions, unnamed controls, input labels, image alt) on /map, /explore, careers, /jobs, the job page, the company page, the … | Contrast computed for every ink and the accent, line and line-strong on bg, surface and surface-hover, in both themes | Reduced motion checked in code (globals.css media queries, camera.ts) | API failure (503 on /api/* except auth/me) and Try again on 11 pages | Slow network (400 kbps, 400ms) with CPU x4 on the job page, /explore and /map | Network timings for the Explore factories and skills tabs; pins payload size and compression | SQL counts of raw names, the word 'plant' in stored text, level words, and the classification of welder jobs
  - not walked: Light theme at 1440 for the full route list, and 390 light past the first 7 routes: I stopped the background sweep to finish, and covered light with spot shots of key pages instead | A real screen reader (NVDA or VoiceOver): only the DOM and accessibility tree through Playwright | Phone safe areas (notch, home indicator): Playwright cannot emulate env(safe-area-inset-*) | True browser 200% zoom: simulated by halving the viewport | Keyboard walk of the /employer job form, the applicant list and Admin Tools: these belong to instances 2 and 3 | Confirm dialogs (removing a goal, deleting the account) by keyboard: not exercised | Hover cards on map pins: confirmed mouse-only by design (no keyboard path) and not screenshotted | Atlas keyboard and panel in depth: given a light look only, as briefed (in-flight rebuild)
- speed-words (33 findings)
  - walked: Instance 1 cold loads, cache off, laptop 1440 and phone 390 with 4x CPU on 4G: /map, /explore, ?tab=companies, ?tab=factories, ?tab=occupations, ?tab=skills, /industries… | Fast 3G phone: /map, /explore, a job, a career, /me, the Skills tab | Second visit to /map with cache on (304 revalidation) | Client navigation: map, reload, Explore, Companies, a company, back, forward, Map, Jobs, a job, back, Careers, a career (requests per step) | curl x10 timing of 32 API reads, including pins, overviews, search, lists and records; gzip sizes of the largest | Sign-up through the API (sw-seeker@example.com), goal Welder, two skills marked held | Full-page screenshots and text of the job page (desktop), the Anduril job (phone), /jobs (desktop, and phone in light), explore, company, factory, career, skill, industr… | Strings sweep: every capitalised JSX text and string literal in client/src (753 lines), server error strings in routes, lib and middleware, email templates | Database checks: 'plant' in descriptions, company names with state suffixes, slugs and domains, duplicate open jobs, Tesla and Giga Texas
  - not walked: Admin index speed on instance 3: not measured (time spent on instance 1 pages) | Your jobs as a company member with jobs and applicants: the instance 1 account has no membership and I was told not to make an admin there | Layouts at 320x568, 768x1024 and 1920x1080, and phone rotation: not done for speed; only 390 and 1440 were measured | Light theme checked on /jobs (phone) only | Hover cards on the map and the map's panel text: not opened, so how the raw uppercase pin names are formatted there is not verified | The text of the John Deere posting itself: not fetched (outside site), so it is not known whether it names MIG | Compression: the local Express API and vite preview send no gzip or brotli and use no-cache asset headers, unlike Vercel; download sizes above are raw, with gzip sizes measured separately | Emails were read in code only (server/lib/emailTemplates.ts); none was triggered on instance 1 and the outbox was not read
- gap-applicant (28 findings)
  - walked: Setup: API sign-up hire/admin/seeker accounts; make-admin.mjs; membership request + admin approve (Caterpillar) | /employer (Your jobs) desktop; Add a career -> version editor /employer?company=&career= (Welder); version via PUT (left out 4, added Robotic Arc Welding, make Fanuc) | POST /api/jobs x3: plain Maintenance Technician (Seguin), CNC Machinist with application link typed without https (Victoria), Production Welder with company version (Wac… | Job pages signed out phone+desktop (all three) | Create an account from a job -> back to job (phone) | Sign in from job with wrong then right password -> back to job | Job page as seeker: You hold N of M, ticks, optional, group counts; desktop light theme | Apply with empty note, 2,610-char note, pasted HTML; second tab double apply | Apply while job closed by employer; closed job reload as non-applicant; closed job as applicant and as visitor; reopen | Application-link job as seeker (href read, not followed) | John Deere careers-site welder job as seeker phone and visitor desktop; SQL on welder job mapping | Version page /occupations/<Welder>?at=caterpillar as seeker phone, visitor phone, seeker desktop | Employer applicant list desktop/phone, open row, stage select through Reviewing, Interview, Offer, Declined (confirm), Interview, Hired (confirm), Offer | Seeker account dot, menu, /me after each stage; news API clearing | Outbox: stage-changed text and HTML, new-applicant mail, '3 more people' mail after backdating notice_log | /me and /settings signed out -> sign-in next | /settings email notices switch off -> no stage mail; employer notices off -> no new-applicant mail, dot on | Withdraw from /me (confirm, focus), employer view of withdrawn | Change name, ZIP (99999, 7866, 78666) and sign-in email; employer row + CSV | Delete account at Interview; employer list/CSV after | Nine+ applicants via API with varied skills: ranking, name search, stage filter + search, CSV all and filtered, phone and desktop | /me light theme desktop
  - not walked: A careers-site job that is closed or expired: none exist in archangel_ut2 (SQL: 0 closed, 0 expired), so the old-link view was seen only through hand-closed job 41117 | The exact 'N more applied' count under real timing: I backdated notice_log by 61 minutes, which also counted the applicant from the earlier email, so the '3 more' figure could not be judged | Email links opened in a browser signed in vs out beyond /me and /settings (both redirect to sign-in with next and return correctly) | Rotating the phone, and 320/768/1920 widths: not done for these pages | Undo after Declined in the UI: not pressed; the reversal was tested through the stage select instead | Job form UI posting: jobs were posted through the API for speed (the employer tester covers the form)
- gap-hiring-scale (36 findings)
  - walked: Sign-up via API as hire (A, B, C, admin) and work (S); make-admin for the admin | /employer before access: phone and desktop | Company finder: 'dal tile', 'daltile', 'U.S. Navy', 'navy', 'army' | Request access, Cancel request (UI), re-request (API) with outbox count | Ask for a company to be added: U.S. Navy refused in UI, Daltile and Dal Tile Corporation accepted (API), withdraw one via Cancel request (UI) | Admin approve A and B, decline C; C re-asks inside 7 days (API 409) and the declined page view (UI) | A posts a Welder job through the form: empty submit, reversed pay, success (desktop) | Seeker applies (API); new-applicant emails to A and B read in the outbox | Two browsers: A sets Interview while B has the row open, B declines from the out-of-date view; applicant emails | Two browsers: A and B edit the same job at once (lost update) | A Leave with confirm dialog; A's view of the job afterwards | Admin removes B while B has the post form open and the applicant row open in a second tab; Post job and a stage change; reload | Admin adds a company without a factory (API) and gives B access; Your jobs with 2 and 4 companies; the form for a company with no factory; ask for a factory (empty submi… | Factory under construction (JCB San Antonio) in the picker; career suggestions with and without an industry | 30 posts via API, 31st through the form, reload with the draft restored | ?edit for a careers-site job (opened and Save tried), a foreign job, a deleted job, a garbage id; ?copy; ?post=1 signed out and as a seeker | /jobs 'Hiring? Post a job' as visitor, hire, waiting and seeker; sign-up as hire from it; signing in again with a waiting request lands on /employer; account menu | Version editor on a phone: add career, leave out TIG and Stick, failed PUT with Try again, search to add a skill, See the page; Delete version confirm (keyboard) | Layouts 320x568, 768x1024, 1024x768, 1920x1080, 844x390, all in the light theme, for the finder, /employer with 4 companies, the form, the manager page with the applican… | Keyboard only: sign-in, form with the company select, PlantPicker, career picker, pay, Post; applicant row disclosure, stage select, Hired confirm, Close job reason, Lea… | Accessibility tree of the applicant list
  - not walked: Admin adding the company through the /admin/add UI: done through POST /api/companies instead (the brief allowed admin setup) | Making a version from a company version and posting from it with the 'Started from your version' line seen: the form did start from the version's skills (Robot Cell Safety, no Stick or TIG), but the restored draft hid the line, so I did not see it | Browser Back and a closed tab mid-form: only reload was tested; two drafts (new and edit) at once was not tested | Light theme on a phone (390x844) and dark at the layout sizes: light was checked at the other five sizes | Screen-reader live announcements in a real screen reader: only Playwright's aria snapshot was read | Waiting for the real 7-day window or the 1-hour limit to lapse: not possible in session time
- gap-admin-queues-editors (39 findings)
  - walked: Sign-up through /sign-in (Create account, desktop) and make-admin on archangel_ut3 | Two seekers by API: held 3 skills and marked makes (DoE Minitab+Design-Expert, PCA Minitab, PDM Teamcenter) | Intake fixture SQL plus run.mjs load e2e-intake (run 636): 2 queued, 2 held | Three id-duplicate pairs by SQL (BAE, Lockheed, Thermo Fisher) | /admin index and /admin/review on desktop and phone | /admin/review?list=matches: Skip (goes to the end, with a notice), Same with the second candidate chosen, Different (no notices) | /admin/review?pairs=id: kept-card radio, Merge confirm dialog, merged, Two factories, looked for Undo (none) | /factories/<merged id> (follows to the kept factory) and /map?factory=<merged id>, desktop and phone | /factories/<matched TWIN LLC> | /admin/activity?view=sources before and after the CLI undo of run 636, desktop and phone | Career editor (Welder; Saw Filer): Home cleared and saved; Leads to: added 3, tried to add a 4th (no field), military rung refused, ladder-closing link refused with mess… | Other names: another career's alias (409), another career's title (409, by API), duplicates in case (folded), 85 names (400) | Public career page /occupations/<Saw Filer> desktop and phone; Careers list | Military career editor (Navy Hull): code 15T, a used code MR, lowercase ht, Service None, restored by API | Military career public page after it was made civilian; Navy list | Skill editor: group change (domain follows), level change, skill page via the Skill page link, career path order (API), no empty option for group | Skill rename to an existing name (409), to another skill's alias (saved), near-duplicate line | Skill merge DoE into PCA: dialog, notice, History, marks and makes moved, old /skills/<id> page on phone, search 'Also called' | Remove a marked make (Teamcenter) on phone: dialog with count, notice | Factory editor via Edit on the public page, Back, Factory page link (desktop and phone) | Factory: Find the address again (no street; with street), Enter coordinates (Oklahoma point), status under construction, people and year, products, opening year; public … | Factory Merge panel: search by name, city and other company; merged a curated factory with an uncurated one 2,259 km away | Company editor (BAE): domain pasted as a URL, Featured; company page logo, header search logo, pins tier 2 | Mark set by hand, then replaced: same tab company page and search; second browser before and after reload; map panel ?company= | Delete company: jobs without applications (A & I Products), with a subsidiary (dialog only), service U.S. Navy (409) | U.S. Navy editor; Add > Factory for U.S. Navy (silent failures; API refusal) | Activity > History: Everything, each show= kind, More paging; the factory filter paged to the match and pair lines | Light theme on Review pairs and the skill editor (desktop and phone)
  - not walked: Curated-into-uncurated merge refusal wording: the UI always forces the curated row as kept, so I could not reach the refusal from the editor or Review. I did not call the API with that direction. | Undo after a factory merge: none is offered by design ('Cannot be undone'). | Companies list logo check: Explore's Companies list was not inspected for BAE after the domain was set (I checked the company page, header search and map panel only). | A job tag showing the new company mark: there is no BAE job to check. | Phone run of every editor action: phone covered the views and the make removal; most saves were done on desktop only. | Sizes 320, 768 and 1920 were not run for the admin pages. | Featured pin tier was checked through the API (tier 2), not visually on the map. | An undo from the UI: Sources has none. The undo was run from the command line only.
- gap-admin-people-layout (32 findings)
  - walked: Signed up gapadm2, gapadm3, gapseek, gaphire (hire) on instance 3; made gapadm2 and gapadm3 admins with make-admin.mjs | View as Employer in /settings on desktop and phone; walked /map, /jobs, a careers-site job (/jobs/john-deere/welder/40863), a hand-posted job (/jobs/lone-star-lathe-work… | Side by side with the real hire account gaphire on the same 8 pages | Admin rules: opened the first admin (acctadmin) — no remove or delete offered; API PATCH isAdmin:false and DELETE refused; reset link for the first admin obtained and va… | People: gave gaphire access to John Deere and Tesla from the person row; tried U.S. Navy (refused); searched by company 'John Deere'; role 'waiting' filter; sign out eve… | Invites: created an admin invite (UI), a second invite to the same address (replaced), two more admin invites (API), read the outbox emails; accepted on a fresh phone (l… | Access: hire account asked for two factories and one company (API); admin index counts and Access count; Mark added (factory), Decline (factory), Decline (company) on a … | Notice bar: timing (about 220 ms to appear, about 6.9 s to go), held under hover and under keyboard focus, gone after navigation, position on phone and desktop; focus af… | Layout sweep of 22 admin addresses (index, add x4, records search, company, factory, career and skill editors, review and its 4 lists, people with a person open, access,… | Keyboard only: Tab order from the top; Add company with its first factory (State chosen by typing, address found, Look again, Enter coordinates instead, submit with empt… | Accessibility tree checks: Records editor (company, career) and People with a person open (headings, unlabelled controls) | Old addresses: /admin?tab=access, invites, people&q=, data, history, bogus, /import, /import/bulk as an admin, signed out and as a non-admin
  - not walked: Being the last admin and deleting my account in /settings: impossible by design here, because the first admin (acctadmin…) cannot be demoted by another admin, and demoting the other testers' admins (admin-ut, gap-admin) would have broken their runs | Approving or declining a join request with Undo on Access: the only waiting one (Sam Seeker) belongs to another tester; my hire account was added directly from People | Keyboard walk through every Records editor panel (Mark upload, Makes, Merge, Delete): only the Details and Path headings and labels were checked, to avoid colliding with the editors tester | Light theme at 320 and in landscape, and the dark theme at 768, 1024 and 1920: screenshots were taken for the light set, and only a sample was read | The dot appearing and clearing visually on the admin's own account button was not measured in pixels; only the accessible name was checked | Rotating the phone mid-flow: landscape was loaded as a separate viewport, not rotated live
- gap-conditions (46 findings)
  - walked: Seeker account via API (sign-up, ZIP 78701, goal Welder, 8 held skills); second empty seeker account | Light theme 1440 and 390 (phone sweep screenshots taken): /map, ?state=TX, ?area=austin, ?factory, ?company=john-deere, ?career=Welder, ?skill=TIG, /explore and 4 tabs, … | Light: sign-in empty and wrong password, create-account empty errors (desktop and phone) | Light: /me empty, /jobs Where with 99999 and Waco, header search 'tig weld' with results + Enter + recents, account menu, delete-account confirm dialog (desktop, phone) | Theme mechanics: OS light first visit; switch in second tab with map open; map > settings > switch > Back (camera and panel kept); throttled reload in light and dark (no… | Landscape 844x390 and 568x320: map, map factory panel, map search open, job page, /me, /sign-in, /jobs, career, explore companies | Rotation mid-task: sheet full (Houston) portrait > landscape > portrait; search open then rotate; settings name half-filled then rotate (value kept) | Reduced motion: map focus-area flight timing (instant under reduce), transitions on phone sheet and career page | Forced colours desktop and phone: job, career, /me, map, settings | Larger default font 24px via CDP: job, career, /me, /jobs, /settings | Map: right-click menu (items, Escape, edge, Show every factory, Reset view, Search), phone long-press, shared #zoom/lat/lng in fresh browser alone and with ?state, ?comp… | API timings for /me reads; pins and taxonomy payload sizes
  - not walked: Several light-theme screenshots were taken but not read: factory page, military career, skill page, industry page, explore tab filters open, phone /me full, Explore hover menu. Reading every image would have cost too much context. | Light /me full on desktop was not read; only the landscape dark /me was read | Filter combination 'how each is cleared' via the chip X was not exercised; only the context menu's 'Show every factory' was | Forced-colours map blank needs a confirm with a longer wait; I did not rerun it | The panel's counts with industry + focus area were not checked separately from industry + state | Not-found page in landscape and dialogs in landscape at 568x320 were not captured | The hover-card sweep at zoom 6 and 8 only covered zoom 7.2 | The Map2 background run was stopped by its time limit; its hover and drag parts were redone in hov.js
- gap-breakage (31 findings)
  - walked: /me offline: mark 3 suggested quickly, take one off, reconnect, reload (desktop+phone) | /me 500 and 429 on PUT/DELETE /api/me/skills with delay: tick, N held, goal figure, reload vs server | /me remove goal offline and 500; remove ok then Undo offline/500; Undo retry | /me remove the only goal with no skills | /settings offline and 500: name+ZIP Save, notices switch, purpose Hire, Change password; reload vs server | /settings ZIP 99999, 7870, abcde with geocoder blocked | /sign-in Create account: double click+Enter, offline, 500, 429, hang 25s with re-press at 3s/21s, server-created-but-slow | /sign-in Enter pressed 8 times, wrong password, Forgot password double click (outbox checked) | Back after sign-up, Back after sign-out | Sign out in tab A with tab B on /me | Cookie cleared mid-visit then mark skill on /me | Delete account in tab A then mark in tab B | Two tabs: mark in A, read B after 30s and focus | Cookies blocked (Set-Cookie stripped) on sign-in | localStorage/sessionStorage throwing: map, theme, header search | MapTiler fully blocked: /map, zoom fragment, search, Texas panel; tiles.json only blocked on phone /map?area=austin | Geocoder blocked: /jobs Where field 78701, Pflugerville, Texas, 99999; geocoder up comparison on phone | Favicon service blocked on /explore?tab=companies&state=TX | Lazy chunk aborted for Explore (twice) and EntityDetail (Try again after network back); slow chunk 4s | Wrong-shaped answers for /api/occupations/:id: skills null, {}, [], HTML | 404 on company API after navigating away and Back | /api/auth/me 500 on /me, /settings, career page, /sign-in | 25s hold: career record page, /jobs list, /me reads, a skill mark | Offline: /jobs Show more, Explore factories infinite scroll, header search, map search, map focus-area panel, reconnect | /jobs/john-deere/welder/40863 as a seeker (owner's welder concern); career page goal controls
  - not walked: Apply on a job posted in-app: instance 1 has 0 open non-sourced jobs (all 1,284 are from careers sites), so double-submitting Apply and Apply with a dead session could not be tested; the sourced job's Apply is a plain external link (_blank), read but not followed | Light theme screenshots under failure: not taken | Reload during a save: not done meaningfully (a route hold aborts before reaching the server, so it cannot show a server-side commit) | Sign-in hold of 25s on the Sign in button: done for sign-up only; same code path | Rotation and 320/768/1920 widths: not in this brief's breakage cases | Phone sheet with the map broken: the phone panel was checked under a tiles failure (it opens), but sheet detents were not exercised | Explore list 'Show more' under 500 or 429: offline only | Whether a deleted record (404) eventually replaces a cached page: the cached company still showed after 3s; not followed further, so not reported
- gap-jobs-search-memory (29 findings)
  - walked: /jobs: Show more to the end for all 1,284 (desktop and phone), compared ids to /api/jobs paged at limits 37 and 50 | /jobs: open 70th job, Back, reload, Forward (desktop, phone); Back after 40 s away | /jobs?q=technician API paging; q+state; q+near within 10/25/50/100; career+near; company, plant, skill, career links from company/skill/career pages; company+career; com… | /jobs bogus params: company=not-a-uuid, zero uuids for company/career/skill, state=ZZ, state=tx, near=garbage, within=0, within=5000, near without place | /jobs Where combobox by keyboard: type+Enter (Texas), ZIP 78701, ZIP 99999, Tab away, fast Enter, Escape | /jobs at 320x568, 768x1024, 1920x1080 | /api/jobs/by-number for all 1,284 jobs (path totals, named, alsoNamed by career) | 11 job pages as a seeker on phone (Welder, CNC Machinist, Maintenance Technician, QC Inspector, Production Assembler, Industrial Electrician, Process Engineer, Productio… | /explore?tab=companies and factories deep scroll, open, Back, reload (desktop, phone) | /explore?tab=occupations&military=1&service=army open/Back | /explore?tab=skills deep, open/Back | /industries open/Back | /companies/john-deere Show all then factory then Back | /occupations/<CNC Machinist> three groups opened, skill opened, Back (groups stayed open) | /map?factory= panel, Company page, Back | Header search: one result of each group (state, industry, company, factory, career, skill, job), recents list, Enter empty, Enter fast, sign-out then recents (desktop, p… | /me: sign-up, first run, Set as goal, four goals (3 via API), plate link #skills, remove middle + Undo, reload, mark 3 suggested (held still), 63 held skills at 390 and …
  - not walked: Industry page company list after Show all + Back: my script found no Show all link on /industries/transportation-equipment, not retried | Map panel scrolled then Back: panel scroll position not measured, only that the panel came back | Light theme: not checked on /jobs or /me (time) | Recent search remove-one and Clear all buttons were not pressed | Within dropdown changed by keyboard not exercised; only by address | Phone rotation not done
- gap-addresses-head-industries (40 findings)
  - walked: Titles cold (desktop): /map bare, ?area=austin, ?state=TX, ?factory=, ?company=john-deere, ?career=, ?skill=, ?industry=; /explore and all tabs incl. state, military, do… | Titles after client navigation: Explore -> company -> factory -> Back/Back/Forward; Explore tabs by click; /jobs -> job -> career tag -> Back -> Back; client nav to a bo… | Crawler head via curl: /, job, company, career, /nothing, /companies/no-such, /jobs/x/y/999999, robots.txt, sitemap.xml, manifest, all icons, favicon | Print to PDF (with and without backgrounds): job, career with Open all, company, /me (seeker) | Odd addresses cold as visitor and as seeker (44 addresses each, incl. Back check): /tree, /import, /import/bulk, /refs/1, /schools/1, /programs/1, ?path=atlas|route&doma… | All 21 industries via API for US, TX and all four focus areas (figures, companies order, row figures, caps, careers); all 21 industry pages US and ?state=TX on desktop (… | Place picker on desktop and phone: four focus areas, Ohio, Wyoming, Hawaii, back to United States; type-ahead; Open on the map from Houston machinery and Back | Every 'All N'/'Show all' on /industries/leather, /industries/machinery?state=TX, /companies/john-deere, two skill pages, followed or expanded and counted | Light theme on industry, job and industries pages (desktop and phone); theme-color meta timing | In-page Back links on a not-found company, career, industry, job and factory (phone) | Seeker account created via API (goal Welder, two held skills) for /me print and signed-in addresses
  - not walked: A company's version of a career: none exist in archangel_ut (company_careers is empty), so no version page could be titled or printed | Favicon rendering inside a real light/dark browser tab strip: headless Chromium has no tab strip; judged from the icon files only | Desktop 320x568, 768x1024 and 1920x1080 layouts of the industry pages were not captured (phone 390 and desktop 1440 only) | Light theme was checked on three pages only, not on every industry | Social card rendering in a real messaging app: not possible offline; inferred from the served head | Light-theme screenshots of the five per-area phone industry pages: dark only

## ACCOUNTING
- findings in findings.json: 672
- under items: 616 (in 143 items)
- under in-flight checks: 54
- dropped or not reproduced: 2
- sum: 672
