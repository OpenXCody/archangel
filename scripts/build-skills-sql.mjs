// Turns the skills catalogue (data/skills/catalogue.json) into one idempotent
// SQL migration.
//
//   node scripts/build-skills-sql.mjs [input.json] [output.sql]
//
// The catalogue names every skill the product keeps, with what it is, how it
// is learned or shown and what it is done with, and every stored skill that is
// removed. The migration is the whole catalogue, restated: applied to a
// database that already holds an earlier catalogue it changes only what the
// file changed. It:
//   - stops, before it changes anything, when a stored skill is one the file
//     does not know (not kept, not an earlier name, not removed): a skill an
//     admin added or renamed has to be brought into the file first;
//   - renames and merges stored skills into the kept ones, by exact name. A
//     merge moves the careers, jobs and people that pointed at the merged skill
//     (and its makes, once there are any) and keeps its name in skill_aliases,
//     so the old name still finds it;
//   - deletes the removed skills;
//   - adds each kept skill that is not stored yet;
//   - says in load_log (load 'skills-catalogue', look = true) each stored skill
//     it renamed, merged or removed;
//   - writes each kept skill's details where they differ, and says in load_log
//     (load 'skills-catalogue', look = true) which stored details it put back;
//   - adds each other name that is not stored, and says each in load_log; one
//     stored for another skill is left there and said once.
// Every step is a no-op once it has been done.
//
// 0033 was the first, 0048 the pass that added the trades and folded the brand
// names, 0057 the other names employers' postings use, 0059 the skills of the
// military careers (66 added, none renamed or removed). Each is as it was applied;
// only the latest is what this script writes today.
//
// It attaches no skill to a career: a path is written in data/paths/. (The
// first catalogue migration, 0033, did; the file no longer carries "careers".)
// A skill's group and level are the taxonomy's (scripts/build-taxonomy-sql.mjs),
// whose migration follows this one and places every skill this one leaves.
import { readFile, writeFile } from 'node:fs/promises';

const [input = 'data/skills/catalogue.json', output = 'migrations/0059_skills_catalogue_4.sql'] = process.argv.slice(2);
const q = (text) => `'${String(text).replace(/'/g, "''")}'`;
const data = JSON.parse(await readFile(input, 'utf8'));

// --- The catalogue must agree with itself before any SQL is written ---------
const problems = [];
const kept = new Map();
const sources = new Map();
for (const skill of data.skills) {
  const where = `"${skill.name}"`;
  if (kept.has(skill.name)) problems.push(`${where} is listed twice`);
  kept.set(skill.name, skill);
  if (!data.categories.includes(skill.category)) problems.push(`${where} has a category that is not in "categories": ${skill.category}`);
  if (typeof skill.what !== 'string' || skill.what.trim().length < 60) problems.push(`${where} needs "what": what it is and what a person who has it can do`);
  if (typeof skill.learned !== 'string' || skill.learned.trim().length < 12) problems.push(`${where} needs "learned": how it is usually learned or shown`);
  if (skill.tools && (!Array.isArray(skill.tools) || skill.tools.some((tool) => !tool.trim()))) problems.push(`${where} has a bad "tools" list`);
  for (const was of skill.was ?? []) {
    if (sources.has(was)) problems.push(`"${was}" becomes both "${sources.get(was)}" and ${where}`);
    sources.set(was, skill.name);
  }
  if (skill.careers !== undefined) problems.push(`${where} has "careers": the catalogue no longer attaches a skill to a career (a path is written in data/paths/)`);
}
for (const [was, into] of sources) {
  if (kept.has(was)) problems.push(`"${was}" is kept and also merged into "${into}"`);
}
const removed = new Set();
for (const group of data.removed) {
  for (const name of group.names) {
    if (removed.has(name)) problems.push(`"${name}" is removed twice`);
    removed.add(name);
    if (kept.has(name)) problems.push(`"${name}" is both kept and removed`);
    if (sources.has(name)) problems.push(`"${name}" is both merged into "${sources.get(name)}" and removed`);
  }
}
for (const skill of data.skills) {
  for (const alias of skill.aliases ?? []) {
    if (kept.has(alias)) problems.push(`"${skill.name}" lists another skill's name as its other name: ${alias}`);
  }
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

// --- SQL --------------------------------------------------------------------
const out = [];
const say = (...lines) => out.push(...lines);

/** Every name the file decides: kept, an earlier name of a kept skill, or removed. */
function knownNames() {
  const names = [...new Set([...kept.keys(), ...sources.keys(), ...removed])];
  const lines = [];
  // Short statements: one long VALUES list is hard to read in a diff.
  for (let i = 0; i < names.length; i += 6) {
    lines.push(`INSERT INTO catalogue_names (name) VALUES ${names.slice(i, i + 6).map((name) => `(${q(name)})`).join(', ')};`);
  }
  return lines;
}

say(
  `-- The skills catalogue, generated from ${input} by scripts/build-skills-sql.mjs.`,
  '-- Edit the JSON and regenerate; do not edit this file by hand.',
  '-- Idempotent: each step does nothing once its rows are already as it leaves them.',
  '',
  '-- What a person needs to understand a skill. `description` says what it is and',
  '-- what a person who has it can do; these say how it is learned or shown and',
  '-- what it is done with.',
  'ALTER TABLE skills ADD COLUMN IF NOT EXISTS how_learned text;',
  'ALTER TABLE skills ADD COLUMN IF NOT EXISTS tools text[];',
  '',
  '-- Every name the file knows ---------------------------------------------------',
  '-- A stored skill the file does not know stops the migration before anything is',
  '-- changed: it was added or renamed by hand since the file was written, and the',
  "-- taxonomy migration that follows would refuse it anyway. Not when",
  '-- scripts/create-db.mjs is building a database from nothing (it says so for its',
  '-- session): the skills there are only what earlier migrations created.',
  '',
  'DROP TABLE IF EXISTS pg_temp.catalogue_names;',
  'CREATE TEMP TABLE catalogue_names (name text PRIMARY KEY);',
  ...knownNames(),
  '',
  `DO $check$
DECLARE
  unknown_count integer;
  unknown_names text;
BEGIN
  IF current_setting('archangel.from_nothing', true) = 'on' THEN RETURN; END IF;
  SELECT COUNT(*), string_agg(name, ', ' ORDER BY name) FILTER (WHERE n <= 10) INTO unknown_count, unknown_names
    FROM (SELECT s.name, ROW_NUMBER() OVER (ORDER BY s.name) AS n FROM skills s WHERE NOT EXISTS (SELECT 1 FROM catalogue_names c WHERE c.name = s.name)) extra;
  IF unknown_count > 0 THEN
    RAISE EXCEPTION 'skills catalogue: % of the stored skills are not in the file as a kept, earlier or removed name (%). Nothing was changed.',
      unknown_count, COALESCE(unknown_names, 'none');
  END IF;
END $check$;`,
  'DROP TABLE pg_temp.catalogue_names;',
  '',
  '-- Helpers live in pg_temp: they exist for this session only.',
  `CREATE OR REPLACE FUNCTION pg_temp.merge_skill(keep_name text, merged_name text) RETURNS void AS $fn$
DECLARE k uuid; m uuid;
BEGIN
  SELECT id INTO k FROM skills WHERE name = keep_name;
  SELECT id INTO m FROM skills WHERE name = merged_name;
  IF m IS NULL OR k IS NULL OR k = m THEN RETURN; END IF;
  -- A career that listed both keeps one line, at the earlier stage.
  UPDATE occupation_skills y SET stage = LEAST(y.stage, x.stage) FROM occupation_skills x
    WHERE x.skill_id = m AND y.skill_id = k AND y.occupation_id = x.occupation_id AND x.stage IS NOT NULL AND y.stage IS NOT NULL;
  UPDATE occupation_skills x SET skill_id = k WHERE skill_id = m
    AND NOT EXISTS (SELECT 1 FROM occupation_skills y WHERE y.skill_id = k AND y.occupation_id = x.occupation_id);
  UPDATE job_skills x SET skill_id = k WHERE skill_id = m
    AND NOT EXISTS (SELECT 1 FROM job_skills y WHERE y.skill_id = k AND y.job_id = x.job_id);
  -- A person who marked both keeps the stronger mark (held over learning).
  UPDATE user_skills y SET status = 'held' FROM user_skills x
    WHERE x.skill_id = m AND y.skill_id = k AND y.user_id = x.user_id AND x.status = 'held';
  -- Its makes go with it (migration 0050; before that there are none). A person's
  -- marks are set aside by the make's name, and put back on the kept skill's makes
  -- once their holding of the skill has moved.
  IF to_regclass('public.skill_makes') IS NOT NULL THEN
    DROP TABLE IF EXISTS pg_temp.merged_marks;
    CREATE TEMP TABLE merged_marks AS
      SELECT um.user_id, lower(sm.name) AS name FROM user_skill_makes um INNER JOIN skill_makes sm ON sm.id = um.make_id WHERE um.skill_id = m;
    DELETE FROM user_skill_makes WHERE skill_id = m;
  END IF;
  UPDATE user_skills x SET skill_id = k WHERE skill_id = m
    AND NOT EXISTS (SELECT 1 FROM user_skills y WHERE y.skill_id = k AND y.user_id = x.user_id);
  IF to_regclass('public.skill_makes') IS NOT NULL THEN
    UPDATE skill_makes x SET skill_id = k,
        position = x.position + COALESCE((SELECT MAX(y.position) FROM skill_makes y WHERE y.skill_id = k), 0)
      WHERE x.skill_id = m AND NOT EXISTS (SELECT 1 FROM skill_makes y WHERE y.skill_id = k AND lower(y.name) = lower(x.name));
    INSERT INTO user_skill_makes (user_id, skill_id, make_id)
      SELECT mm.user_id, k, sm.id FROM merged_marks mm INNER JOIN skill_makes sm ON sm.skill_id = k AND lower(sm.name) = mm.name
      WHERE EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = mm.user_id AND us.skill_id = k)
      ON CONFLICT DO NOTHING;
    DROP TABLE pg_temp.merged_marks;
  END IF;
  UPDATE skills SET parent_skill_id = k WHERE parent_skill_id = m;
  UPDATE skill_aliases SET canonical_skill_id = k WHERE canonical_skill_id = m;
  INSERT INTO skill_aliases (alias_text, canonical_skill_id) VALUES (merged_name, k) ON CONFLICT (alias_text) DO NOTHING;
  DELETE FROM skills WHERE id = m;
END $fn$ LANGUAGE plpgsql;`,
  '',
  `-- A rename whose new name is already taken is a merge into the skill that has it.
CREATE OR REPLACE FUNCTION pg_temp.rename_skill(old_name text, new_name text) RETURNS void AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM skills WHERE name = old_name) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM skills WHERE name = new_name) THEN
    PERFORM pg_temp.merge_skill(new_name, old_name);
    RETURN;
  END IF;
  UPDATE skills SET name = new_name WHERE name = old_name;
  INSERT INTO skill_aliases (alias_text, canonical_skill_id)
    SELECT old_name, id FROM skills WHERE name = new_name ON CONFLICT (alias_text) DO NOTHING;
END $fn$ LANGUAGE plpgsql;`,
  ''
);

say(
  '-- The skills as they stand, so the log can say which this run renamed, merged or',
  '-- removed: on a database that already holds this catalogue that is none, unless a',
  '-- skill was added by hand since under a name the file merges away or removes.',
  'DROP TABLE IF EXISTS pg_temp.skill_names_before;',
  'CREATE TEMP TABLE skill_names_before AS SELECT id, name FROM skills;',
  ''
);
say('-- Renames and merges --------------------------------------------------------', '');
for (const skill of data.skills) {
  for (const was of skill.was ?? []) say(`SELECT pg_temp.rename_skill(${q(was)}, ${q(skill.name)});`);
}
say('');

say('-- Removed -------------------------------------------------------------------', '');
for (const group of data.removed) {
  say(`-- ${group.why}`);
  // Short statements: one long IN list is hard to read in a diff.
  for (let i = 0; i < group.names.length; i += 8) {
    say(`DELETE FROM skills WHERE name IN (${group.names.slice(i, i + 8).map(q).join(', ')});`);
  }
  say('');
}
say('UPDATE skills SET parent_skill_id = NULL WHERE parent_skill_id IS NOT NULL AND parent_skill_id NOT IN (SELECT id FROM skills);', '');

say(
  "INSERT INTO load_log (load, kind, action, look, detail, entity_id)",
  "SELECT 'skills-catalogue', 'skill', 'renamed, merged or removed', true,",
  "       format('%s is no longer stored under that name', b.name), (SELECT s.id FROM skills s WHERE s.id = b.id)",
  '  FROM skill_names_before b',
  ' WHERE NOT EXISTS (SELECT 1 FROM skills s WHERE s.id = b.id AND s.name = b.name)',
  ' ORDER BY b.name;',
  ''
);
say('-- Kept skills that are not stored yet ------------------------------------------', '');
say(
  '-- Added without a group or a level: the taxonomy migration that follows places',
  "-- every one. `category` is given so the row is whole until then; it becomes the",
  "-- domain's name there, and nothing reads it.",
  ''
);
for (const skill of data.skills) {
  say(`INSERT INTO skills (name, category) SELECT ${q(skill.name)}, ${q(skill.category)} WHERE NOT EXISTS (SELECT 1 FROM skills WHERE name = ${q(skill.name)});`);
}
say('');

say(
  '-- What each kept skill is ---------------------------------------------------',
  '',
  '-- The details as they stand, so the log can say which were put back to the file\'s:',
  '-- a description, a way of learning or a tools line corrected by hand since the',
  '-- last catalogue migration is restated here, and somebody should know.',
  'DROP TABLE IF EXISTS pg_temp.skills_before;',
  'CREATE TEMP TABLE skills_before AS SELECT id, description, how_learned, tools FROM skills WHERE description IS NOT NULL;',
  ''
);
for (const skill of data.skills) {
  const tools = skill.tools?.length ? `ARRAY[${skill.tools.map(q).join(', ')}]` : 'NULL';
  say(
    `UPDATE skills SET description = ${q(skill.what)},`,
    `  how_learned = ${q(skill.learned)}, tools = ${tools}`,
    `  WHERE name = ${q(skill.name)}`,
    `    AND (description, how_learned, tools) IS DISTINCT FROM (${q(skill.what)}, ${q(skill.learned)}, ${tools === 'NULL' ? 'NULL::text[]' : tools});`
  );
}
say(
  '',
  "INSERT INTO load_log (load, kind, action, look, detail, entity_id)",
  "SELECT 'skills-catalogue', 'skill', 'details restated', true,",
  "       format('%s: what it is, how it is learned or its tools were put back to the catalogue''s', s.name), s.id",
  '  FROM skills s JOIN skills_before b ON b.id = s.id',
  ' WHERE (s.description, s.how_learned, s.tools) IS DISTINCT FROM (b.description, b.how_learned, b.tools);',
  ''
);

say(
  '-- Other names a skill is known by --------------------------------------------',
  '',
  '-- The names as they stand, so the log can say which this run added.',
  'DROP TABLE IF EXISTS pg_temp.aliases_before;',
  'CREATE TEMP TABLE aliases_before AS SELECT id FROM skill_aliases;',
  ''
);
const otherNames = [];
for (const skill of data.skills) {
  for (const alias of skill.aliases ?? []) {
    otherNames.push([alias, skill.name]);
    say(
      `INSERT INTO skill_aliases (alias_text, canonical_skill_id) SELECT ${q(alias)}, id FROM skills WHERE name = ${q(skill.name)}`,
      `  AND NOT EXISTS (SELECT 1 FROM skills WHERE lower(name) = lower(${q(alias)})) ON CONFLICT (alias_text) DO NOTHING;`
    );
  }
}
say(
  '',
  "-- An other name that is now a skill's own name says nothing.",
  'DELETE FROM skill_aliases a USING skills s WHERE lower(a.alias_text) = lower(s.name);',
  '',
  '-- What this run did to the names: each one added, and each the file lists that',
  '-- is stored for another skill (left where it is; said once, for a person to read).',
  "INSERT INTO load_log (load, kind, action, look, detail, entity_id)",
  "SELECT 'skills-catalogue', 'skill', 'name added', false, format('\"%s\" is another name of %s', a.alias_text, s.name), s.id",
  '  FROM skill_aliases a JOIN skills s ON s.id = a.canonical_skill_id',
  ' WHERE NOT EXISTS (SELECT 1 FROM aliases_before b WHERE b.id = a.id)',
  ' ORDER BY s.name, a.alias_text;',
  '',
  'DROP TABLE IF EXISTS pg_temp.catalogue_aliases;',
  'CREATE TEMP TABLE catalogue_aliases (alias text, skill text);'
);
for (let i = 0; i < otherNames.length; i += 4) {
  say(`INSERT INTO catalogue_aliases (alias, skill) VALUES ${otherNames.slice(i, i + 4).map(([alias, name]) => `(${q(alias)}, ${q(name)})`).join(', ')};`);
}
say(
  '',
  "INSERT INTO load_log (load, kind, action, look, detail, entity_id)",
  "SELECT 'skills-catalogue', 'skill', 'name not added', true,",
  "       format('\"%s\" was not added to %s: it is stored as another name of %s', c.alias, c.skill, other.name), s.id",
  '  FROM catalogue_aliases c',
  '  JOIN skills s ON s.name = c.skill',
  '  JOIN skill_aliases a ON lower(a.alias_text) = lower(c.alias) AND a.canonical_skill_id <> s.id',
  '  JOIN skills other ON other.id = a.canonical_skill_id',
  " WHERE NOT EXISTS (SELECT 1 FROM skill_aliases mine WHERE lower(mine.alias_text) = lower(c.alias) AND mine.canonical_skill_id = s.id)",
  "   AND NOT EXISTS (SELECT 1 FROM load_log l WHERE l.load = 'skills-catalogue' AND l.action = 'name not added'",
  "                      AND starts_with(l.detail, format('\"%s\" was not added to %s:', c.alias, c.skill)));",
  ''
);

await writeFile(output, out.join('\n'));
const merged = [...sources.keys()].length;
console.log(`${output}: ${out.length} lines. ${data.skills.length} skills kept (from ${merged} renamed or merged names), ${removed.size} removed, ${otherNames.length} other names.`);
