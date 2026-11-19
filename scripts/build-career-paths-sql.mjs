// Turns the careers' skill paths (data/careers/paths.json) into one idempotent
// SQL migration.
//
//   node scripts/build-career-paths-sql.mjs [paths.json] [careers catalogue] [skills catalogue] [taxonomy] [output.sql]
//   node scripts/build-career-paths-sql.mjs --check [paths.json] [careers catalogue] [skills catalogue] [taxonomy]
//   node scripts/build-career-paths-sql.mjs --report [...]    the same check, then the figures behind it
//
// A path is the list of skills a career needs. It names skills and sets no
// level: each skill sits at its own level (data/skills/taxonomy.json), so the
// path lays itself out as Fundamentals, Intermediate, Advanced. The file is
// the only place the paths are decided; data/paths/*.json are the lists the
// earlier path migrations (0011, 0016, 0018) were made from, kept as history.
//
// --check validates the file and writes nothing. It fails unless:
//   - every career of the careers catalogue has exactly one entry, by title,
//     and no entry names anything else;
//   - every skill is a kept skill of the skills catalogue, by its exact name,
//     and is placed in the taxonomy; no skill is twice in one path;
//   - a path has PATH_MIN to PATH_MAX skills, at least LEVEL_MIN of them at
//     Fundamentals and at Intermediate, and at least one from the career's
//     home domain (a path pasted under the wrong title fails this);
//   - no skill is on more than half of all paths (a foundation pasted
//     everywhere is not one);
//   - every entry says where it was read from (`basis`), a `why` is a
//     sentence, and `lacks` names nothing the catalogue already has;
//   - across every ladder link of the careers catalogue at least a third of
//     the lower career's skills are on the upper career's path, or the link
//     is acknowledged in `weakLinks` with its reason; and nothing is
//     acknowledged that is not a link, or is not weak.
//
// The migration decides in SQL, on the database it meets, and writes what it
// decided to load_log (load 'career-paths'; look = true on the lines to read):
//   - a career is found by its exact title; one that is not stored is said and
//     skipped. A career the file does not name is left alone, and said;
//   - a skill is found by its name, else by another name it goes by
//     (skill_aliases), in any letter case. A name that is neither is said and
//     that line skipped: the migration does not stop;
//   - a path a person approved (path_status = 'approved') is left exactly as
//     it is, and the log says what the file would have changed;
//   - every other career of the file gets exactly the file's skills: a line
//     the file does not have goes, the missing ones are added (each takes its
//     skill's level from the trigger 0042 created), and the path is a draft.
// Applied a second time it changes nothing.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check') || args.includes('--report');
const report = args.includes('--report');
const [
  input = 'data/careers/paths.json',
  careersFile = 'data/careers/catalogue.json',
  skillsFile = 'data/skills/catalogue.json',
  taxonomyFile = 'data/skills/taxonomy.json',
  output = 'migrations/0052_career_paths.sql',
] = args.filter((arg) => !arg.startsWith('--'));

/** The fewest and the most skills a path may have. The guide is 12 to 22; the floor is for careers the catalogue cannot yet describe. */
export const PATH_MIN = 8;
export const PATH_MAX = 24;
/** The fewest skills a path has at Fundamentals, and at Intermediate. */
export const LEVEL_MIN = 2;
/** The share of the lower career's skills that the upper career of a ladder link keeps, below which the link must be acknowledged. */
export const LINK_FLOOR = 1 / 3;

const sentence = (value) => typeof value === 'string' && value.trim().length > 0 && value === value.trim() && !/[\r\n]/.test(value);
const nameOf = (entry) => (typeof entry === 'string' ? entry : entry?.skill);

/** Each skill's level and domain, from the taxonomy. */
function placed(taxonomy) {
  const place = new Map();
  for (const domain of taxonomy?.domains ?? []) {
    for (const group of domain.groups ?? []) {
      for (const skill of group.skills ?? []) place.set(skill.name, { level: skill.level, domain: domain.slug, group: group.name });
    }
  }
  return place;
}

/** The share of `from`'s skills that are on `to`'s path. */
const kept = (from, to) => from.filter((skill) => to.has(skill)).length / from.length;

/** A file's paths as title -> skill names, for the entries that have a readable list. */
function pathsOf(paths) {
  const byTitle = new Map();
  for (const entry of Array.isArray(paths?.careers) ? paths.careers : []) {
    if (typeof entry?.title === 'string' && Array.isArray(entry.skills) && !byTitle.has(entry.title)) {
      byTitle.set(entry.title, entry.skills.map(nameOf).filter((name) => typeof name === 'string'));
    }
  }
  return byTitle;
}

/** Everything wrong with a paths file, as sentences. None means it can be loaded. */
export function pathProblems(paths, careers, skills, taxonomy) {
  const problems = [];
  const entries = Array.isArray(paths?.careers) ? paths.careers : null;
  if (!entries) return ['"careers" must be a list of { title, basis, skills }'];
  const catalogue = careers?.careers ?? [];
  const titles = new Set(catalogue.map((career) => career.title));
  const home = new Map(catalogue.map((career) => [career.title, career.home]));
  const known = new Set((skills?.skills ?? []).map((skill) => skill.name));
  const place = placed(taxonomy);

  const seen = new Set();
  for (const entry of entries) {
    const title = entry?.title;
    if (typeof title !== 'string' || !title) {
      problems.push('an entry has no "title"');
      continue;
    }
    const where = `"${title}"`;
    if (!titles.has(title)) problems.push(`${where} is not a career of the catalogue`);
    if (seen.has(title)) problems.push(`${where} has two entries`);
    seen.add(title);
    if (!sentence(entry.basis)) problems.push(`${where} does not say where its path was read from ("basis")`);

    const list = Array.isArray(entry.skills) ? entry.skills : null;
    if (!list) {
      problems.push(`${where} has no "skills" list`);
      continue;
    }
    const names = new Set();
    const levels = [0, 0, 0];
    let atHome = 0;
    for (const item of list) {
      const name = nameOf(item);
      if (typeof name !== 'string' || !name) {
        problems.push(`${where}: ${JSON.stringify(item)} is not a skill name or { skill, why }`);
        continue;
      }
      if (typeof item !== 'string') {
        const extra = Object.keys(item).filter((key) => key !== 'skill' && key !== 'why');
        if (extra.length > 0) problems.push(`${where}, "${name}": unknown key ${extra.map((key) => `"${key}"`).join(', ')}`);
        if (!sentence(item.why)) problems.push(`${where}, "${name}": "why" must be a sentence on one line`);
      }
      if (names.has(name)) problems.push(`${where} lists "${name}" twice`);
      names.add(name);
      if (!known.has(name)) {
        problems.push(`${where}: "${name}" is not a skill in the catalogue`);
        continue;
      }
      const at = place.get(name);
      if (!at) {
        problems.push(`${where}: "${name}" is not placed in the taxonomy`);
        continue;
      }
      levels[at.level - 1] += 1;
      if (at.domain === home.get(title)) atHome += 1;
    }
    if (names.size < PATH_MIN || names.size > PATH_MAX) problems.push(`${where} has ${names.size} skills; a path has ${PATH_MIN} to ${PATH_MAX}`);
    if (levels[0] < LEVEL_MIN) problems.push(`${where} has ${levels[0]} skills at Fundamentals; a path stands on at least ${LEVEL_MIN}`);
    if (levels[1] < LEVEL_MIN) problems.push(`${where} has ${levels[1]} skills at Intermediate; a path has at least ${LEVEL_MIN}`);
    if (titles.has(title) && atHome === 0) problems.push(`${where} has no skill from its home domain, "${home.get(title)}"`);

    if (entry.lacks !== undefined) {
      if (!Array.isArray(entry.lacks) || entry.lacks.length === 0 || !entry.lacks.every(sentence)) {
        problems.push(`${where}: "lacks" must be a list of what the catalogue has no skill for`);
      } else {
        for (const item of entry.lacks) if (known.has(item)) problems.push(`${where} says the catalogue lacks "${item}", which is a skill in it`);
      }
    }
    const extra = Object.keys(entry).filter((key) => !['title', 'basis', 'skills', 'lacks'].includes(key));
    if (extra.length > 0) problems.push(`${where}: unknown key ${extra.map((key) => `"${key}"`).join(', ')}`);
  }
  for (const title of titles) if (!seen.has(title)) problems.push(`"${title}" is a career of the catalogue and has no path`);

  // A foundation is shared by many careers, never by most of them.
  const byTitle = pathsOf(paths);
  const uses = new Map();
  for (const list of byTitle.values()) for (const name of new Set(list)) uses.set(name, (uses.get(name) ?? 0) + 1);
  for (const [name, count] of uses) {
    if (count * 2 > byTitle.size) problems.push(`"${name}" is on ${count} of ${byTitle.size} paths: more than half`);
  }

  // The ladders: a link either shows in the skills or is acknowledged.
  const weak = Array.isArray(paths.weakLinks) ? paths.weakLinks : [];
  const links = new Set(catalogue.flatMap((career) => (career.leadsTo ?? []).map((to) => `${career.title}\n${to}`)));
  const acknowledged = new Set();
  for (const link of weak) {
    const key = `${link?.from}\n${link?.to}`;
    const where = `weak link "${link?.from}" to "${link?.to}"`;
    if (!links.has(key)) problems.push(`${where} is not a link of the careers catalogue`);
    if (acknowledged.has(key)) problems.push(`${where} is acknowledged twice`);
    acknowledged.add(key);
    if (!sentence(link?.why)) problems.push(`${where} does not say why`);
  }
  for (const career of catalogue) {
    const from = byTitle.get(career.title);
    if (!from || from.length === 0) continue;
    for (const to of career.leadsTo ?? []) {
      const upper = byTitle.get(to);
      if (!upper) continue;
      const share = kept(from, new Set(upper));
      const key = `${career.title}\n${to}`;
      const said = `"${career.title}" leads to "${to}", which keeps ${Math.round(share * 100)}% of its skills`;
      if (share < LINK_FLOOR && !acknowledged.has(key)) problems.push(`${said}: under a third. Write the two paths against each other, or acknowledge the link in "weakLinks"`);
      if (share >= LINK_FLOOR && acknowledged.has(key)) problems.push(`${said}: it is acknowledged as weak and is not`);
    }
  }
  return problems;
}

/** The figures a reader of the paths asks for. Call it only on a file with no problems. */
export function pathFigures(paths, careers, skills, taxonomy) {
  const place = placed(taxonomy);
  const byTitle = pathsOf(paths);
  const sizes = [...byTitle.values()].map((list) => list.length).sort((a, b) => a - b);
  const uses = new Map();
  for (const list of byTitle.values()) for (const name of list) uses.set(name, (uses.get(name) ?? 0) + 1);
  const links = [];
  for (const career of careers.careers) {
    for (const to of career.leadsTo ?? []) {
      const from = byTitle.get(career.title);
      links.push({ from: career.title, to, share: kept(from, new Set(byTitle.get(to))), of: from.length });
    }
  }
  return {
    careers: byTitle.size,
    lines: sizes.reduce((sum, size) => sum + size, 0),
    smallest: sizes[0],
    median: sizes.length % 2 ? sizes[(sizes.length - 1) / 2] : (sizes[sizes.length / 2 - 1] + sizes[sizes.length / 2]) / 2,
    largest: sizes[sizes.length - 1],
    nothingAdvanced: [...byTitle].filter(([, list]) => !list.some((name) => place.get(name).level === 3)).map(([title]) => title),
    skills: skills.skills.length,
    onNoPath: skills.skills.map((skill) => skill.name).filter((name) => !uses.has(name)),
    mostUsed: [...uses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20),
    links,
    weak: links.filter((link) => link.share < LINK_FLOOR),
  };
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** The migration's text. `source` is the file's name, for the header. */
export function pathSql(paths, source) {
  const careers = paths.careers;
  const values = (rows) => rows.map((row, i) => `  (${row.join(', ')})${i === rows.length - 1 ? ';' : ','}`);
  const careerRows = careers.map((career, i) => [i + 1, q(career.title)]);
  const lineRows = careers.flatMap((career) => career.skills.map((skill) => [q(career.title), q(nameOf(skill))]));
  return [
    `-- The skill path of every career, generated from ${source}`,
    '-- by scripts/build-career-paths-sql.mjs. Edit the JSON and regenerate; do not edit this file by hand.',
    '-- Idempotent: applied a second time it changes nothing.',
    '--',
    `-- ${careerRows.length} careers, ${lineRows.length} path lines. A path names skills and sets no level: each line takes`,
    "-- its skill's level from the trigger occupation_skills_stage_is_level (0042). Applied after the careers",
    '-- catalogue (which stores every career) and the skills catalogue and taxonomy (which store and place every',
    "-- skill). What it decided on this database is in load_log (load 'career-paths'; the lines with",
    '-- look = true are the ones to read).',
    '',
    '-- The file, as rows -------------------------------------------------------------',
    '',
    'DROP TABLE IF EXISTS pg_temp.path_careers, pg_temp.path_lines, pg_temp.path_found;',
    'CREATE TEMP TABLE path_careers (position integer PRIMARY KEY, title text NOT NULL UNIQUE);',
    'CREATE TEMP TABLE path_lines (title text NOT NULL, skill text NOT NULL, PRIMARY KEY (title, skill));',
    '',
    'INSERT INTO path_careers (position, title) VALUES',
    ...values(careerRows),
    '',
    'INSERT INTO path_lines (title, skill) VALUES',
    ...values(lineRows),
    '',
    '-- Each name, found -----------------------------------------------------------------',
    '-- By the skill\'s own name; else, in any letter case, by its name or by another name it',
    '-- goes by (a skill an admin renamed or merged since the file was written). NULL: not stored.',
    '',
    'CREATE TEMP TABLE path_found AS',
    '  SELECT l.title, l.skill,',
    '    COALESCE(',
    '      (SELECT s.id FROM skills s WHERE s.name = l.skill),',
    '      (SELECT s.id FROM skills s WHERE lower(s.name) = lower(l.skill) ORDER BY s.name COLLATE "C" LIMIT 1),',
    '      (SELECT a.canonical_skill_id FROM skill_aliases a WHERE lower(a.alias_text) = lower(l.skill) ORDER BY a.alias_text COLLATE "C" LIMIT 1)',
    '    ) AS skill_id',
    '  FROM path_lines l;',
    '',
    '-- One line of the log.',
    `CREATE OR REPLACE FUNCTION pg_temp.path_log(p_action text, p_look boolean, p_detail text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO load_log (load, kind, action, look, detail) VALUES ('career-paths', 'career', p_action, p_look, p_detail)
$f$;`,
    '',
    '-- Names, shortened for a log line.',
    `CREATE OR REPLACE FUNCTION pg_temp.path_names(p_names text[]) RETURNS text LANGUAGE sql AS $f$
  SELECT CASE WHEN cardinality(p_names) <= 8 THEN array_to_string(p_names, ', ')
    ELSE array_to_string(p_names[1:8], ', ') || ' and ' || (cardinality(p_names) - 8) || ' more' END
$f$;`,
    '',
    '-- The paths ----------------------------------------------------------------------',
    '',
    `DO $load$
DECLARE
  c record;
  m record;
  v_id uuid;
  v_status text;
  v_stored integer;
  v_wanted integer;
  v_added integer;
  v_removed integer;
  v_add text[];
  v_drop text[];
  n_written integer := 0;
  n_same integer := 0;
  n_approved integer := 0;
  n_absent integer := 0;
  n_unfound integer := 0;
BEGIN
  -- A name that is no stored skill: said once, with the careers it was listed for. Those lines are skipped.
  FOR m IN SELECT f.skill, array_agg(f.title ORDER BY f.title COLLATE "C") AS titles
      FROM path_found f WHERE f.skill_id IS NULL GROUP BY f.skill ORDER BY f.skill COLLATE "C" LOOP
    n_unfound := n_unfound + 1;
    PERFORM pg_temp.path_log('skill not found', true, format('"%s" is not a stored skill, nor another name for one. Left off %s: %s',
      m.skill, CASE WHEN cardinality(m.titles) = 1 THEN '1 path' ELSE cardinality(m.titles) || ' paths' END, pg_temp.path_names(m.titles)));
  END LOOP;

  FOR c IN SELECT * FROM path_careers ORDER BY position LOOP
    v_id := NULL;
    SELECT o.id, o.path_status INTO v_id, v_status FROM occupations o WHERE o.title = c.title;
    IF v_id IS NULL THEN
      n_absent := n_absent + 1;
      PERFORM pg_temp.path_log('no career', true, format('"%s" is not stored under that title. Its path was not written', c.title));
      CONTINUE;
    END IF;

    SELECT COUNT(*)::int INTO v_stored FROM occupation_skills WHERE occupation_id = v_id;
    SELECT COUNT(DISTINCT f.skill_id)::int INTO v_wanted FROM path_found f WHERE f.title = c.title AND f.skill_id IS NOT NULL;
    -- What the file has and the path does not, and what the path has and the file does not.
    SELECT COALESCE(array_agg(s.name ORDER BY s.name COLLATE "C"), '{}') INTO v_add FROM skills s
      WHERE s.id IN (SELECT f.skill_id FROM path_found f WHERE f.title = c.title)
        AND NOT EXISTS (SELECT 1 FROM occupation_skills os WHERE os.occupation_id = v_id AND os.skill_id = s.id);
    SELECT COALESCE(array_agg(s.name ORDER BY s.name COLLATE "C"), '{}') INTO v_drop FROM occupation_skills os INNER JOIN skills s ON s.id = os.skill_id
      WHERE os.occupation_id = v_id
        AND NOT EXISTS (SELECT 1 FROM path_found f WHERE f.title = c.title AND f.skill_id = os.skill_id);

    -- A path a person approved is theirs. Nothing of it is touched.
    IF v_status = 'approved' THEN
      n_approved := n_approved + 1;
      PERFORM pg_temp.path_log('approved, left', true, format('%s: a person approved this path, so it is left exactly as it is (%s skills). The file has %s%s%s',
        c.title, v_stored, v_wanted,
        CASE WHEN cardinality(v_add) > 0 THEN '; it would add ' || pg_temp.path_names(v_add) ELSE '' END,
        CASE WHEN cardinality(v_drop) > 0 THEN '; it would take off ' || pg_temp.path_names(v_drop) ELSE '' END));
      CONTINUE;
    END IF;

    IF v_wanted = 0 THEN
      PERFORM pg_temp.path_log('no skills', true, format('%s: none of the skills the file lists for it is stored. Its path was left as it is (%s skills)', c.title, v_stored));
      CONTINUE;
    END IF;

    DELETE FROM occupation_skills os WHERE os.occupation_id = v_id
      AND NOT EXISTS (SELECT 1 FROM path_found f WHERE f.title = c.title AND f.skill_id = os.skill_id);
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    INSERT INTO occupation_skills (occupation_id, skill_id)
      SELECT DISTINCT v_id, f.skill_id FROM path_found f WHERE f.title = c.title AND f.skill_id IS NOT NULL
      ON CONFLICT (occupation_id, skill_id) DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;
    UPDATE occupations SET path_status = 'draft' WHERE id = v_id AND path_status IS DISTINCT FROM 'draft';

    IF v_added = 0 AND v_removed = 0 AND v_status IS NOT DISTINCT FROM 'draft' THEN
      n_same := n_same + 1;
    ELSE
      n_written := n_written + 1;
      PERFORM pg_temp.path_log('written', false, format('%s: %s skills%s%s', c.title, v_wanted,
        CASE WHEN v_stored = 0 THEN ', its first path' ELSE format(' (%s added, %s taken off, of %s before)', v_added, v_removed, v_stored) END,
        CASE WHEN v_status IS NULL AND v_stored > 0 THEN '; now a draft' ELSE '' END));
    END IF;
  END LOOP;

  -- A career the file does not name is left alone, and said.
  PERFORM pg_temp.path_log('not in the file', true, format('"%s" is not in the file. Its path (%s skills) is left as it is', o.title,
      (SELECT COUNT(*) FROM occupation_skills os WHERE os.occupation_id = o.id)))
    FROM occupations o
    WHERE NOT EXISTS (SELECT 1 FROM path_careers k WHERE k.title = o.title)
    ORDER BY o.title COLLATE "C";

  PERFORM pg_temp.path_log('summary', false, format(
    '%s careers of the file: %s written, %s already as the file has them, %s approved and left, %s not stored; skill names not found: %s; path lines now stored for the file''s careers: %s; careers not in the file: %s',
    (SELECT COUNT(*) FROM path_careers), n_written, n_same, n_approved, n_absent, n_unfound,
    (SELECT COUNT(*) FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id INNER JOIN path_careers k ON k.title = o.title),
    (SELECT COUNT(*) FROM occupations o WHERE NOT EXISTS (SELECT 1 FROM path_careers k WHERE k.title = o.title))));
END $load$;`,
    '',
    'DROP FUNCTION pg_temp.path_log(text, boolean, text);',
    'DROP FUNCTION pg_temp.path_names(text[]);',
    'DROP TABLE pg_temp.path_careers, pg_temp.path_lines, pg_temp.path_found;',
    '',
  ].join('\n');
}

async function main() {
  const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
  const [paths, careers, skills, taxonomy] = await Promise.all([json(input), json(careersFile), json(skillsFile), json(taxonomyFile)]);
  const problems = pathProblems(paths, careers, skills, taxonomy);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error(`${input}: ${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  const figures = pathFigures(paths, careers, skills, taxonomy);
  const summary = `${figures.careers} careers, ${figures.lines} path lines (${figures.smallest} to ${figures.largest} a path, median ${figures.median}); ${figures.skills - figures.onNoPath.length} of ${figures.skills} skills on a path; ${figures.links.length} ladder links, ${figures.weak.length} acknowledged as weak`;
  if (report) {
    const pct = (share) => `${Math.round(share * 100)}%`;
    console.log(`${input}: valid. ${summary}.\n`);
    console.log(`Nothing at Advanced (${figures.nothingAdvanced.length}): ${figures.nothingAdvanced.join(', ')}\n`);
    console.log(`Skills on no path (${figures.onNoPath.length}): ${figures.onNoPath.join(', ')}\n`);
    console.log(`The twenty skills on the most paths:\n${figures.mostUsed.map(([name, count]) => `  ${String(count).padStart(3)}  ${name}`).join('\n')}\n`);
    console.log(`Ladder links, the share of the lower career's skills the upper keeps:\n${figures.links
      .map((link) => `  ${pct(link.share).padStart(4)}  ${link.from} -> ${link.to}${link.share < LINK_FLOOR ? '   (weak)' : ''}`)
      .join('\n')}`);
    return;
  }
  if (checkOnly) {
    console.log(`${input}: valid. ${summary}.`);
    return;
  }
  const sql = pathSql(paths, input);
  await writeFile(output, sql);
  console.log(`${output}: ${sql.split('\n').length} lines. ${summary}.`);
}

// Run only when started as a script: the unit checks import the functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
