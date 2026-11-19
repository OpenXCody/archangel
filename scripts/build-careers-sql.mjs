// Turns the careers catalogue (data/careers/catalogue.json) into one
// idempotent SQL migration.
//
//   node scripts/build-careers-sql.mjs [catalogue.json] [taxonomy.json] [output.sql]
//   node scripts/build-careers-sql.mjs --check [catalogue.json] [taxonomy.json]
//
// The catalogue is the list of careers the product has. Each has a title, a
// home (one domain of data/skills/taxonomy.json), a `what`, up to three
// `leadsTo` (the next rungs of its ladder) and `was`: the titles the product
// used to list separately, now other names for this career. `removed` are
// titles that are not manufacturing careers.
//
// --check validates the file and writes nothing. It fails unless:
//   - every career has a title, a `what`, and a home that is a domain of the
//     taxonomy;
//   - a title appears once in the whole file, in any letter case: as a
//     career, in one career's `was`, or under `removed`;
//   - every `leadsTo` names a career of the file, not the career itself, at
//     most three of them, none twice, and no chain of them comes back to
//     where it started.
//
// The migration cannot see the database it will run on, so it decides there,
// in SQL, and writes each decision to load_log (load 'careers-catalogue';
// look = true on the lines a person should read). In one transaction it:
//   - adds occupations.home_domain and occupation_links;
//   - for each career finds the stored rows titled as its title or one of its
//     `was`, in any letter case. The row already carrying the title stays,
//     else the one with the most skills. It takes the title, the `what` and
//     the home; goals, jobs, careers recorded at a plant, industry links and
//     other names move to it from the rest, each folded title becomes another
//     name for it, and the rest go;
//   - keeps one path: the title row's own when it has ten skills or more,
//     else that of whichever row had the most, with that row's path_status.
//     Paths are not joined together;
//   - creates a career none of whose titles is stored;
//   - deletes the removed titles, except one that has a job with applications
//     or is somebody's goal;
//   - leaves a career the file does not name as it is;
//   - makes the links between the file's careers exactly the file's.
// Every step is a no-op once it has been done.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const [input = 'data/careers/catalogue.json', taxonomyFile = 'data/skills/taxonomy.json', output = 'migrations/0046_careers_catalogue.sql'] = args.filter((arg) => arg !== '--check');

/** The most careers one career leads to. */
export const MAX_LEADS_TO = 3;
/** A title row keeps its own path when it has at least this many skills. */
const OWN_PATH = 10;

const text = (value) => typeof value === 'string' && value.trim().length > 0 && value === value.trim();
const key = (title) => String(title).toLowerCase();

/** Everything wrong with a catalogue, as sentences. None means it can be loaded. */
export function catalogueProblems(catalogue, taxonomy) {
  const problems = [];
  const careers = Array.isArray(catalogue?.careers) ? catalogue.careers : [];
  if (careers.length === 0) problems.push('"careers" is empty');
  const domains = new Set((taxonomy?.domains ?? []).map((domain) => domain.slug));

  // Where each title is used, whatever its letter case.
  const used = new Map();
  const use = (title, where) => {
    if (!text(title)) {
      problems.push(`${where}: ${JSON.stringify(title)} is not a title`);
      return;
    }
    if (used.has(key(title))) problems.push(`"${title}" is used twice: ${used.get(key(title))} and ${where}`);
    else used.set(key(title), where);
  };

  const titles = new Set();
  for (const career of careers) {
    if (!text(career?.title)) {
      problems.push(`a career has no title: ${JSON.stringify(career?.title)}`);
      continue;
    }
    use(career.title, 'a career');
    titles.add(career.title);
    if (!text(career.what)) problems.push(`"${career.title}" needs a "what"`);
    if (!domains.has(career.home)) problems.push(`"${career.title}" has home ${JSON.stringify(career.home)}, which is not a domain of the taxonomy`);
    if (!Array.isArray(career.was)) problems.push(`"${career.title}": "was" must be a list (an empty one when nothing is folded in)`);
    else for (const was of career.was) use(was, `"was" of "${career.title}"`);
    if (career.dropAliases !== undefined && !(Array.isArray(career.dropAliases) && career.dropAliases.every(text))) {
      problems.push(`"${career.title}": "dropAliases" must be a list of names`);
    }
    if (career.note !== undefined && typeof career.note !== 'string') problems.push(`"${career.title}": "note" must be text`);
  }
  for (const group of Array.isArray(catalogue?.removed) ? catalogue.removed : []) {
    if (!text(group?.why)) problems.push('a group under "removed" has no "why"');
    if (!Array.isArray(group?.titles) || group.titles.length === 0) problems.push('a group under "removed" has no titles');
    else for (const title of group.titles) use(title, '"removed"');
  }

  const leads = new Map();
  for (const career of careers) {
    if (!text(career?.title)) continue;
    const next = career.leadsTo;
    if (!Array.isArray(next)) {
      problems.push(`"${career.title}": "leadsTo" must be a list (an empty one when it leads nowhere)`);
      continue;
    }
    if (next.length > MAX_LEADS_TO) problems.push(`"${career.title}" leads to ${next.length} careers: at most ${MAX_LEADS_TO}`);
    const seen = new Set();
    for (const title of next) {
      if (title === career.title) problems.push(`"${career.title}" leads to itself`);
      else if (!titles.has(title)) problems.push(`"${career.title}" leads to "${title}", which is not a career of the file`);
      if (seen.has(title)) problems.push(`"${career.title}" leads to "${title}" twice`);
      seen.add(title);
    }
    leads.set(career.title, next.filter((title) => titles.has(title) && title !== career.title));
  }
  // A ladder never comes back to where it started. Each career is walked once.
  const state = new Map();
  const walk = (title, trail) => {
    if (state.get(title) === 'done') return;
    if (state.get(title) === 'open') {
      problems.push(`the ladder comes back on itself: ${[...trail.slice(trail.indexOf(title)), title].join(' → ')}`);
      return;
    }
    state.set(title, 'open');
    for (const next of leads.get(title) ?? []) walk(next, [...trail, title]);
    state.set(title, 'done');
  };
  for (const title of leads.keys()) walk(title, []);
  return problems;
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** The migration's text. `source` is the file's name, for the header. */
export function catalogueSql(catalogue, source) {
  const out = [];
  const say = (...lines) => out.push(...lines);
  // One row to a line, so a diff of the migration reads like a diff of the file.
  const values = (rows) => rows.map((row, i) => `  (${row.join(', ')})${i === rows.length - 1 ? ';' : ','}`);
  const insert = (table, columns, rows) => (rows.length > 0 ? [`INSERT INTO ${table} (${columns}) VALUES`, ...values(rows), ''] : []);

  const careerRows = catalogue.careers.map((career, i) => [i + 1, q(career.title), q(career.home), q(career.what.trim())]);
  const wasRows = catalogue.careers.flatMap((career) => career.was.map((was) => [q(career.title), q(was)]));
  const linkRows = catalogue.careers.flatMap((career) => career.leadsTo.map((to, i) => [q(career.title), q(to), i + 1]));
  const dropRows = catalogue.careers.flatMap((career) => (career.dropAliases ?? []).map((alias) => [q(career.title), q(alias)]));
  const removedRows = (catalogue.removed ?? []).flatMap((group) => group.titles).map((title, i) => [i + 1, q(title)]);

  say(
    `-- The careers catalogue, generated from ${source} by scripts/build-careers-sql.mjs.`,
    '-- Edit the JSON and regenerate; do not edit this file by hand.',
    '-- Idempotent: each step does nothing once its rows are already as it leaves them.',
    '--',
    `-- ${careerRows.length} careers, each with a home domain and the careers it leads to. ${wasRows.length} titles`,
    `-- the product used to list separately are folded into them and kept as other names;`,
    `-- ${removedRows.length} are removed. What it decided on this database is in load_log`,
    "-- (load 'careers-catalogue'; the lines with look = true are the ones to read).",
    '',
    '-- Columns and tables --------------------------------------------------------------',
    '',
    "-- A career's home: the domain most of its work is in. Not every career has one",
    '-- (one added by hand may not), and a domain that goes takes no career with it.',
    'ALTER TABLE occupations ADD COLUMN IF NOT EXISTS home_domain text REFERENCES skill_domains (slug) ON UPDATE CASCADE ON DELETE SET NULL;',
    'CREATE INDEX IF NOT EXISTS occupations_home_domain_idx ON occupations (home_domain);',
    '',
    '-- A ladder, one step at a time: the first career leads to the second. `position`',
    '-- orders the careers one career leads to. Nothing in the database stops a chain',
    '-- of links from closing on itself; every write checks (server/lib/careerLinks.ts).',
    'CREATE TABLE IF NOT EXISTS occupation_links (',
    '  from_occupation_id uuid NOT NULL REFERENCES occupations (id) ON DELETE CASCADE,',
    '  to_occupation_id uuid NOT NULL REFERENCES occupations (id) ON DELETE CASCADE,',
    '  position integer NOT NULL,',
    '  PRIMARY KEY (from_occupation_id, to_occupation_id),',
    '  CONSTRAINT occupation_links_not_itself CHECK (from_occupation_id <> to_occupation_id)',
    ');',
    'CREATE INDEX IF NOT EXISTS occupation_links_to_idx ON occupation_links (to_occupation_id);',
    '',
    '-- The file, as rows -------------------------------------------------------------',
    '',
    'DROP TABLE IF EXISTS pg_temp.cat_careers, pg_temp.cat_was, pg_temp.cat_links, pg_temp.cat_drop, pg_temp.cat_removed;',
    'CREATE TEMP TABLE cat_careers (position integer PRIMARY KEY, title text NOT NULL UNIQUE, home text NOT NULL, what text NOT NULL);',
    'CREATE TEMP TABLE cat_was (title text NOT NULL, was text NOT NULL);',
    'CREATE TEMP TABLE cat_links (from_title text NOT NULL, to_title text NOT NULL, position integer NOT NULL);',
    'CREATE TEMP TABLE cat_drop (title text NOT NULL, alias text NOT NULL);',
    'CREATE TEMP TABLE cat_removed (position integer PRIMARY KEY, title text NOT NULL);',
    '',
    ...insert('cat_careers', 'position, title, home, what', careerRows),
    ...insert('cat_was', 'title, was', wasRows),
    ...insert('cat_links', 'from_title, to_title, position', linkRows),
    ...insert('cat_drop', 'title, alias', dropRows),
    ...insert('cat_removed', 'position, title', removedRows),
    '-- One line of the log.',
    `CREATE OR REPLACE FUNCTION pg_temp.cat_log(p_action text, p_look boolean, p_detail text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO load_log (load, kind, action, look, detail) VALUES ('careers-catalogue', 'career', p_action, p_look, p_detail)
$f$;`,
    '',
    '-- The careers -------------------------------------------------------------------',
    '',
    `DO $load$
DECLARE
  c record;
  m record;
  v_names text[];
  v_here text[];
  v_keeper uuid;
  v_keeper_title text;
  v_keeper_n integer;
  v_donor uuid;
  v_donor_title text;
  v_donor_n integer;
  v_status text;
  v_goals integer;
  v_jobs integer;
  v_industries integer;
  v_plants integer;
  v_names_moved integer;
  v_names_dropped integer;
  v_skills integer;
  -- A database with no careers is being built: nothing in it is worth a look.
  v_new boolean := NOT EXISTS (SELECT 1 FROM occupations);
  n_found integer := 0;
  n_renamed integer := 0;
  n_created integer := 0;
  n_folded integer := 0;
  n_removed integer := 0;
BEGIN
  FOR c IN SELECT * FROM cat_careers ORDER BY position LOOP
    v_names := ARRAY[lower(c.title)] || COALESCE((SELECT array_agg(lower(w.was)) FROM cat_was w WHERE w.title = c.title), '{}');

    -- The row that stays: the one already carrying the title, else the one with the most skills.
    v_keeper := NULL;
    SELECT o.id, o.title, k.n INTO v_keeper, v_keeper_title, v_keeper_n
      FROM occupations o, LATERAL (SELECT COUNT(*)::int AS n FROM occupation_skills s WHERE s.occupation_id = o.id) k
      WHERE lower(o.title) = ANY (v_names)
      ORDER BY (lower(o.title) = lower(c.title)) DESC, (o.title = c.title) DESC, k.n DESC, o.title COLLATE "C"
      LIMIT 1;

    IF v_keeper IS NULL THEN
      INSERT INTO occupations (title, description, home_domain)
        VALUES (c.title, c.what, (SELECT slug FROM skill_domains WHERE slug = c.home))
        RETURNING id INTO v_keeper;
      n_created := n_created + 1;
      PERFORM pg_temp.cat_log('created', NOT v_new, format('%s: none of its %s titles is stored. Created, with no path', c.title, array_length(v_names, 1)));
    ELSE
      -- One path: the title row's own when it is a full one, else that of the row with the most skills.
      IF NOT (lower(v_keeper_title) = lower(c.title) AND v_keeper_n >= ${OWN_PATH}) THEN
        SELECT o.id, o.title, k.n, o.path_status INTO v_donor, v_donor_title, v_donor_n, v_status
          FROM occupations o, LATERAL (SELECT COUNT(*)::int AS n FROM occupation_skills s WHERE s.occupation_id = o.id) k
          WHERE lower(o.title) = ANY (v_names)
          ORDER BY k.n DESC, (o.id = v_keeper) DESC, o.title COLLATE "C"
          LIMIT 1;
        IF v_donor <> v_keeper AND v_donor_n > v_keeper_n THEN
          DELETE FROM occupation_skills WHERE occupation_id = v_keeper;
          UPDATE occupation_skills SET occupation_id = v_keeper WHERE occupation_id = v_donor;
          UPDATE occupations SET path_status = v_status WHERE id = v_keeper;
          PERFORM pg_temp.cat_log('path', false, format('%s: takes the path of "%s" (%s skills%s) in place of its own (%s)',
            c.title, v_donor_title, v_donor_n, COALESCE(', ' || v_status, ''), v_keeper_n));
        END IF;
      END IF;

      -- Everything attached to the other rows moves to the one that stays.
      v_here := ARRAY[lower(v_keeper_title)];
      FOR m IN SELECT o.id, o.title FROM occupations o WHERE lower(o.title) = ANY (v_names) AND o.id <> v_keeper ORDER BY o.title COLLATE "C" LOOP
        SELECT COUNT(*)::int INTO v_skills FROM occupation_skills WHERE occupation_id = m.id;
        UPDATE user_goals x SET occupation_id = v_keeper WHERE x.occupation_id = m.id
          AND NOT EXISTS (SELECT 1 FROM user_goals y WHERE y.occupation_id = v_keeper AND y.user_id = x.user_id);
        GET DIAGNOSTICS v_goals = ROW_COUNT;
        UPDATE industry_occupations x SET occupation_id = v_keeper WHERE x.occupation_id = m.id
          AND NOT EXISTS (SELECT 1 FROM industry_occupations y WHERE y.occupation_id = v_keeper AND y.industry = x.industry);
        GET DIAGNOSTICS v_industries = ROW_COUNT;
        UPDATE factory_occupations x SET occupation_id = v_keeper WHERE x.occupation_id = m.id
          AND NOT EXISTS (SELECT 1 FROM factory_occupations y WHERE y.occupation_id = v_keeper AND y.factory_id = x.factory_id);
        GET DIAGNOSTICS v_plants = ROW_COUNT;
        UPDATE jobs SET occupation_id = v_keeper WHERE occupation_id = m.id;
        GET DIAGNOSTICS v_jobs = ROW_COUNT;
        -- Links, when a ladder already exists: moved unless that would point a career at itself or repeat a link.
        UPDATE occupation_links x SET from_occupation_id = v_keeper WHERE x.from_occupation_id = m.id AND x.to_occupation_id <> v_keeper
          AND NOT EXISTS (SELECT 1 FROM occupation_links y WHERE y.from_occupation_id = v_keeper AND y.to_occupation_id = x.to_occupation_id);
        UPDATE occupation_links x SET to_occupation_id = v_keeper WHERE x.to_occupation_id = m.id AND x.from_occupation_id <> v_keeper
          AND NOT EXISTS (SELECT 1 FROM occupation_links y WHERE y.to_occupation_id = v_keeper AND y.from_occupation_id = x.from_occupation_id);
        -- Other names travel, except the ones that mean a different job.
        DELETE FROM occupation_aliases a WHERE a.canonical_occupation_id = m.id
          AND lower(a.alias_text) IN (SELECT lower(d.alias) FROM cat_drop d WHERE d.title = c.title);
        GET DIAGNOSTICS v_names_dropped = ROW_COUNT;
        UPDATE occupation_aliases SET canonical_occupation_id = v_keeper WHERE canonical_occupation_id = m.id;
        GET DIAGNOSTICS v_names_moved = ROW_COUNT;
        DELETE FROM occupations WHERE id = m.id;
        v_here := v_here || lower(m.title);
        n_folded := n_folded + 1;
        PERFORM pg_temp.cat_log('folded', false, format('"%s" into "%s"%s', m.title, c.title, COALESCE(': ' || NULLIF(concat_ws(', ',
          CASE WHEN v_goals > 0 THEN v_goals || ' goals' END,
          CASE WHEN v_jobs > 0 THEN v_jobs || ' jobs' END,
          CASE WHEN v_plants > 0 THEN v_plants || ' plants' END,
          CASE WHEN v_industries > 0 THEN v_industries || ' industries' END,
          CASE WHEN v_names_moved > 0 THEN v_names_moved || ' other names' END,
          CASE WHEN v_names_dropped > 0 THEN v_names_dropped || ' other names dropped' END,
          CASE WHEN v_skills > 0 THEN 'its path of ' || v_skills || ' skills not kept' END), ''), '')));
      END LOOP;

      DELETE FROM occupation_aliases a WHERE a.canonical_occupation_id = v_keeper
        AND lower(a.alias_text) IN (SELECT lower(d.alias) FROM cat_drop d WHERE d.title = c.title);
      UPDATE occupations o SET title = c.title, description = c.what, home_domain = (SELECT slug FROM skill_domains WHERE slug = c.home)
        WHERE o.id = v_keeper
          AND (o.title, o.description, o.home_domain) IS DISTINCT FROM (c.title, c.what, (SELECT slug FROM skill_domains WHERE slug = c.home));
      IF v_keeper_title = c.title THEN
        n_found := n_found + 1;
        PERFORM pg_temp.cat_log('kept', false, c.title);
      ELSE
        n_renamed := n_renamed + 1;
        PERFORM pg_temp.cat_log('renamed', false, format('%s: was "%s"', c.title, v_keeper_title));
      END IF;

      -- A title to fold in that is neither stored nor already another name for this career.
      FOR m IN SELECT w.was FROM cat_was w WHERE w.title = c.title
          AND lower(w.was) <> ALL (v_here)
          AND NOT EXISTS (SELECT 1 FROM occupation_aliases a WHERE a.canonical_occupation_id = v_keeper AND lower(a.alias_text) = lower(w.was))
          ORDER BY w.was COLLATE "C" LOOP
        PERFORM pg_temp.cat_log('not found', NOT v_new, format('"%s", to fold into "%s", is not stored. Kept as another name all the same', m.was, c.title));
      END LOOP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM skill_domains WHERE slug = c.home) THEN
      PERFORM pg_temp.cat_log('no home', NOT v_new, format('%s: the domain "%s" is not stored', c.title, c.home));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM occupation_skills WHERE occupation_id = v_keeper) THEN
      PERFORM pg_temp.cat_log('no path', NOT v_new, format('%s: none of its titles had a skill', c.title));
    END IF;
  END LOOP;

  -- Each folded title is another name for its career, whichever career had it before.
  UPDATE occupation_aliases a SET canonical_occupation_id = o.id
    FROM cat_was w INNER JOIN occupations o ON o.title = w.title
    WHERE lower(a.alias_text) = lower(w.was) AND a.canonical_occupation_id <> o.id;
  INSERT INTO occupation_aliases (alias_text, canonical_occupation_id)
    SELECT w.was, o.id FROM cat_was w INNER JOIN occupations o ON o.title = w.title
    WHERE NOT EXISTS (SELECT 1 FROM occupation_aliases a WHERE lower(a.alias_text) = lower(w.was))
    ON CONFLICT (alias_text) DO NOTHING;
  -- A name that is a career's own title is not another name for anything ("CNC machinist").
  DELETE FROM occupation_aliases a WHERE EXISTS (SELECT 1 FROM occupations o WHERE lower(o.title) = lower(a.alias_text));

  -- The titles that are not manufacturing careers go. Not one that has a job with
  -- applications (such a job is closed, never deleted), nor one that is somebody's goal.
  FOR m IN SELECT r.title AS named, o.id, o.title,
        (SELECT COUNT(*)::int FROM applications a INNER JOIN jobs j ON j.id = a.job_id WHERE j.occupation_id = o.id) AS applications,
        (SELECT COUNT(*)::int FROM user_goals g WHERE g.occupation_id = o.id) AS goals
      FROM cat_removed r LEFT JOIN occupations o ON lower(o.title) = lower(r.title) ORDER BY r.position LOOP
    IF m.id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM load_log l WHERE l.load = 'careers-catalogue' AND l.action = 'removed' AND l.detail = m.named) THEN
        PERFORM pg_temp.cat_log('not found', NOT v_new, format('"%s", to remove, is not stored', m.named));
      END IF;
    ELSIF m.applications > 0 THEN
      PERFORM pg_temp.cat_log('not removed', true, format('"%s" has a job with applications. Left as it is: close the job, then delete the career by hand', m.title));
    ELSIF m.goals > 0 THEN
      PERFORM pg_temp.cat_log('not removed', true, format('"%s" is the goal of %s. Left as it is, for an admin to delete or merge', m.title,
        CASE WHEN m.goals = 1 THEN '1 person' ELSE m.goals || ' people' END));
    ELSE
      DELETE FROM occupations WHERE id = m.id;
      n_removed := n_removed + 1;
      PERFORM pg_temp.cat_log('removed', false, m.named);
    END IF;
  END LOOP;

  -- A career the file does not name is left alone, and said.
  PERFORM pg_temp.cat_log('not in the file', true, format('"%s" is not in the catalogue. Left as it is', o.title))
    FROM occupations o
    WHERE NOT EXISTS (SELECT 1 FROM cat_careers k WHERE k.title = o.title)
      AND NOT EXISTS (SELECT 1 FROM cat_removed r WHERE lower(r.title) = lower(o.title))
    ORDER BY o.title COLLATE "C";

  -- The ladders: between the file's careers the links are exactly the file's.
  DELETE FROM occupation_links l USING occupations f, occupations t
    WHERE f.id = l.from_occupation_id AND t.id = l.to_occupation_id
      AND EXISTS (SELECT 1 FROM cat_careers k WHERE k.title = f.title)
      AND EXISTS (SELECT 1 FROM cat_careers k WHERE k.title = t.title)
      AND NOT EXISTS (SELECT 1 FROM cat_links cl WHERE cl.from_title = f.title AND cl.to_title = t.title);
  INSERT INTO occupation_links (from_occupation_id, to_occupation_id, position)
    SELECT f.id, t.id, cl.position FROM cat_links cl
      INNER JOIN occupations f ON f.title = cl.from_title
      INNER JOIN occupations t ON t.title = cl.to_title
    ON CONFLICT (from_occupation_id, to_occupation_id) DO UPDATE SET position = EXCLUDED.position
      WHERE occupation_links.position IS DISTINCT FROM EXCLUDED.position;
  -- A link to or from a career added by hand may now close a ladder on itself: it goes.
  FOR m IN
    WITH RECURSIVE reach (origin, node) AS (
      SELECT l.to_occupation_id, l.to_occupation_id FROM occupation_links l
      UNION
      SELECT r.origin, l.to_occupation_id FROM reach r INNER JOIN occupation_links l ON l.from_occupation_id = r.node
    )
    DELETE FROM occupation_links l USING occupations f, occupations t
      WHERE f.id = l.from_occupation_id AND t.id = l.to_occupation_id
        AND EXISTS (SELECT 1 FROM reach r WHERE r.origin = l.to_occupation_id AND r.node = l.from_occupation_id)
        AND NOT EXISTS (SELECT 1 FROM cat_links cl WHERE cl.from_title = f.title AND cl.to_title = t.title)
      RETURNING f.title AS from_title, t.title AS to_title
  LOOP
    PERFORM pg_temp.cat_log('link removed', true, format('"%s" leads to "%s" closed a ladder on itself', m.from_title, m.to_title));
  END LOOP;

  PERFORM pg_temp.cat_log('summary', false, format(
    '%s careers of the file (%s under their title, %s renamed, %s created); %s titles folded in; %s removed; %s not in the file; %s of the file''s careers with a path, %s without; %s links',
    (SELECT COUNT(*) FROM cat_careers), n_found, n_renamed, n_created, n_folded, n_removed,
    (SELECT COUNT(*) FROM occupations o WHERE NOT EXISTS (SELECT 1 FROM cat_careers k WHERE k.title = o.title)),
    (SELECT COUNT(*) FROM occupations o INNER JOIN cat_careers k ON k.title = o.title WHERE EXISTS (SELECT 1 FROM occupation_skills s WHERE s.occupation_id = o.id)),
    (SELECT COUNT(*) FROM occupations o INNER JOIN cat_careers k ON k.title = o.title WHERE NOT EXISTS (SELECT 1 FROM occupation_skills s WHERE s.occupation_id = o.id)),
    (SELECT COUNT(*) FROM occupation_links)));
END $load$;`,
    '',
    'DROP FUNCTION pg_temp.cat_log(text, boolean, text);',
    'DROP TABLE pg_temp.cat_careers, pg_temp.cat_was, pg_temp.cat_links, pg_temp.cat_drop, pg_temp.cat_removed;',
    ''
  );
  return out.join('\n');
}

async function main() {
  const catalogue = JSON.parse(await readFile(input, 'utf8'));
  const taxonomy = JSON.parse(await readFile(taxonomyFile, 'utf8'));
  const problems = catalogueProblems(catalogue, taxonomy);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error(`${input}: ${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  const careers = catalogue.careers;
  const folded = careers.reduce((sum, career) => sum + career.was.length, 0);
  const links = careers.reduce((sum, career) => sum + career.leadsTo.length, 0);
  const removed = (catalogue.removed ?? []).reduce((sum, group) => sum + group.titles.length, 0);
  const homes = new Set(careers.map((career) => career.home)).size;
  const summary = `${careers.length} careers in ${homes} domains, ${folded} titles folded in, ${removed} removed, ${links} links`;
  if (checkOnly) {
    console.log(`${input}: valid. ${summary}.`);
    return;
  }
  const sql = catalogueSql(catalogue, input);
  await writeFile(output, sql);
  console.log(`${output}: ${sql.split('\n').length} lines. ${summary}.`);
}

// Run only when started as a script: the unit checks import the two functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
