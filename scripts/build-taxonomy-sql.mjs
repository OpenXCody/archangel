// Turns the skill taxonomy (data/skills/taxonomy.json) into one idempotent SQL
// migration.
//
//   node scripts/build-taxonomy-sql.mjs [taxonomy.json] [catalogue.json] [output.sql]
//   node scripts/build-taxonomy-sql.mjs --check [taxonomy.json] [catalogue.json]
//
// The taxonomy puts every skill of the catalogue (data/skills/catalogue.json)
// in one skill group, every group in one domain, and gives every skill one
// level: 1 Fundamentals, 2 Intermediate, 3 Advanced. Domains, groups and
// skills are in the order they are shown.
//
// --check validates the file and writes nothing. It fails unless:
//   - the levels are the three above, each with a `what`;
//   - every domain and group has a well formed slug (lowercase words joined
//     by hyphens), a name and a `what`; no two domains share a slug, and no
//     two groups do, whichever domains they are in;
//   - every group holds 2 to 12 skills, each with a level of 1, 2 or 3;
//   - every skill of the catalogue is placed exactly once, and nothing else is.
//
// The migration:
//   - creates skill_domains and skill_groups and adds skills.group_slug,
//     skills.level and skills.group_position;
//   - loads the domains and groups by slug; one the file no longer has goes
//     once no skill or group points at it;
//   - sets every skill's group, level and place in its group by name, and
//     skills.category to its domain's name (the column is kept, unread);
//   - makes occupation_skills.stage the skill's level, on every row now and,
//     by two triggers, on every write from here on;
//   - stops before it changes anything when the stored skills are not exactly
//     the file's. An empty skills table is the one exception: a database
//     being built from nothing gets the tables, the domains and the groups.
// Every step is a no-op once it has been done.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const [input = 'data/skills/taxonomy.json', catalogueFile = 'data/skills/catalogue.json', output = 'migrations/0042_skill_taxonomy.sql'] = args.filter((arg) => arg !== '--check');

export const LEVEL_NAMES = ['Fundamentals', 'Intermediate', 'Advanced'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const GROUP_MIN = 2;
const GROUP_MAX = 12;

const text = (value) => typeof value === 'string' && value.trim().length > 0;

/** Everything wrong with a taxonomy, as sentences. None means it can be loaded. */
export function taxonomyProblems(taxonomy, catalogue) {
  const problems = [];
  const levels = Array.isArray(taxonomy?.levels) ? taxonomy.levels : [];
  if (levels.length !== LEVEL_NAMES.length || LEVEL_NAMES.some((name, i) => levels[i]?.id !== i + 1 || levels[i]?.name !== name)) {
    problems.push(`"levels" must be ${LEVEL_NAMES.map((name, i) => `${i + 1} ${name}`).join(', ')}, in that order`);
  }
  for (const level of levels) if (!text(level?.what)) problems.push(`level ${level?.id} needs a "what"`);

  const domains = Array.isArray(taxonomy?.domains) ? taxonomy.domains : [];
  if (domains.length === 0) problems.push('"domains" is empty');
  const domainSlugs = new Set();
  const groupSlugs = new Set();
  const placed = new Map();
  const slugProblem = (kind, slug, seen) => {
    if (typeof slug !== 'string' || !SLUG.test(slug)) return `${kind} slug ${JSON.stringify(slug)} is not lowercase words joined by hyphens`;
    if (seen.has(slug)) return `${kind} slug "${slug}" is used twice`;
    seen.add(slug);
    return null;
  };
  for (const domain of domains) {
    const problem = slugProblem('domain', domain?.slug, domainSlugs);
    if (problem) problems.push(problem);
    const where = `domain "${domain?.slug}"`;
    if (!text(domain?.name)) problems.push(`${where} needs a name`);
    if (!text(domain?.what)) problems.push(`${where} needs a "what"`);
    const groups = Array.isArray(domain?.groups) ? domain.groups : [];
    if (groups.length === 0) problems.push(`${where} has no groups`);
    for (const group of groups) {
      const groupProblem = slugProblem('group', group?.slug, groupSlugs);
      if (groupProblem) problems.push(groupProblem);
      const at = `group "${group?.slug}"`;
      if (!text(group?.name)) problems.push(`${at} needs a name`);
      if (!text(group?.what)) problems.push(`${at} needs a "what"`);
      const skills = Array.isArray(group?.skills) ? group.skills : [];
      if (skills.length < GROUP_MIN || skills.length > GROUP_MAX) problems.push(`${at} has ${skills.length} skills: a group holds ${GROUP_MIN} to ${GROUP_MAX}`);
      for (const skill of skills) {
        if (!text(skill?.name)) {
          problems.push(`${at} lists a skill with no name`);
          continue;
        }
        if (![1, 2, 3].includes(skill.level)) problems.push(`"${skill.name}" has level ${JSON.stringify(skill.level)}: a level is 1, 2 or 3`);
        if (placed.has(skill.name)) problems.push(`"${skill.name}" is placed twice: in "${placed.get(skill.name)}" and in "${group.slug}"`);
        else placed.set(skill.name, group?.slug);
      }
    }
  }
  const known = new Set((catalogue?.skills ?? []).map((skill) => skill.name));
  for (const name of placed.keys()) if (!known.has(name)) problems.push(`"${name}" is not a skill in the catalogue`);
  for (const name of known) if (!placed.has(name)) problems.push(`"${name}" is in the catalogue and has no group`);
  return problems;
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** The migration's text. `source` is the file's name, for the header. */
export function taxonomySql(taxonomy, source) {
  const out = [];
  const say = (...lines) => out.push(...lines);
  // One row to a line, so a diff of the migration reads like a diff of the file.
  const values = (rows) => rows.map((row, i) => `  (${row.join(', ')})${i === rows.length - 1 ? ';' : ','}`);

  const domainRows = taxonomy.domains.map((domain, d) => [q(domain.slug), q(domain.name), q(domain.what.trim()), d + 1]);
  const groupRows = [];
  const skillRows = [];
  for (const domain of taxonomy.domains) {
    for (const group of domain.groups) {
      groupRows.push([q(group.slug), q(domain.slug), q(group.name), q(group.what.trim()), groupRows.length + 1]);
      group.skills.forEach((skill, s) => skillRows.push([q(skill.name), q(group.slug), skill.level, s + 1]));
    }
  }

  say(
    `-- The skill taxonomy, generated from ${source} by scripts/build-taxonomy-sql.mjs.`,
    '-- Edit the JSON and regenerate; do not edit this file by hand.',
    '-- Idempotent: each step does nothing once its rows are already as it leaves them.',
    '--',
    '-- Every skill is in one skill group, every group in one domain, and every skill',
    `-- has one level: ${LEVEL_NAMES.map((name, i) => `${i + 1} ${name}`).join(', ')}. A career's path is its skills laid`,
    "-- out by those levels, so occupation_skills.stage always equals the skill's level.",
    '',
    '-- The file, as rows -------------------------------------------------------------',
    '',
    'DROP TABLE IF EXISTS pg_temp.taxonomy_domains, pg_temp.taxonomy_groups, pg_temp.taxonomy_skills;',
    'CREATE TEMP TABLE taxonomy_domains (slug text PRIMARY KEY, name text NOT NULL, description text NOT NULL, position integer NOT NULL);',
    'CREATE TEMP TABLE taxonomy_groups (slug text PRIMARY KEY, domain_slug text NOT NULL, name text NOT NULL, description text NOT NULL, position integer NOT NULL);',
    'CREATE TEMP TABLE taxonomy_skills (name text PRIMARY KEY, group_slug text NOT NULL, level smallint NOT NULL, position integer NOT NULL);',
    '',
    'INSERT INTO taxonomy_domains (slug, name, description, position) VALUES',
    ...values(domainRows),
    '',
    'INSERT INTO taxonomy_groups (slug, domain_slug, name, description, position) VALUES',
    ...values(groupRows),
    '',
    'INSERT INTO taxonomy_skills (name, group_slug, level, position) VALUES',
    ...values(skillRows),
    '',
    '-- The stored skills must be exactly the file\'s ------------------------------------',
    '-- Checked before anything is changed. A skill the file names and the table lacks,',
    '-- or one the table has and the file does not place, stops the migration. An empty',
    '-- table has nothing to place: a database being built from nothing.',
    '',
    `DO $check$
DECLARE
  unknown_count integer;
  unplaced_count integer;
  unknown_names text;
  unplaced_names text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM skills) THEN RETURN; END IF;
  SELECT COUNT(*), string_agg(name, ', ' ORDER BY name) FILTER (WHERE n <= 10) INTO unknown_count, unknown_names
    FROM (SELECT t.name, ROW_NUMBER() OVER (ORDER BY t.name) AS n FROM taxonomy_skills t WHERE NOT EXISTS (SELECT 1 FROM skills s WHERE s.name = t.name)) missing;
  SELECT COUNT(*), string_agg(name, ', ' ORDER BY name) FILTER (WHERE n <= 10) INTO unplaced_count, unplaced_names
    FROM (SELECT s.name, ROW_NUMBER() OVER (ORDER BY s.name) AS n FROM skills s WHERE NOT EXISTS (SELECT 1 FROM taxonomy_skills t WHERE t.name = s.name)) extra;
  IF unknown_count > 0 OR unplaced_count > 0 THEN
    RAISE EXCEPTION 'skill taxonomy: the stored skills are not the ones the file places. % named in the file are not stored (%). % stored are not in the file (%). Nothing was changed.',
      unknown_count, COALESCE(unknown_names, 'none'), unplaced_count, COALESCE(unplaced_names, 'none');
  END IF;
END $check$;`,
    '',
    '-- Tables and columns --------------------------------------------------------------',
    '',
    'CREATE TABLE IF NOT EXISTS skill_domains (',
    '  slug text PRIMARY KEY,',
    '  name text NOT NULL,',
    '  description text NOT NULL,',
    '  position integer NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS skill_groups (',
    '  slug text PRIMARY KEY,',
    '  domain_slug text NOT NULL REFERENCES skill_domains (slug) ON UPDATE CASCADE,',
    '  name text NOT NULL,',
    '  description text NOT NULL,',
    '  position integer NOT NULL',
    ');',
    'CREATE INDEX IF NOT EXISTS skill_groups_domain_idx ON skill_groups (domain_slug);',
    '',
    "-- A skill's group (which fixes its domain), its level, and its place in the group",
    '-- as the file orders it. A skill added by hand has no place and sorts after them.',
    'ALTER TABLE skills ADD COLUMN IF NOT EXISTS group_slug text REFERENCES skill_groups (slug) ON UPDATE CASCADE;',
    'ALTER TABLE skills ADD COLUMN IF NOT EXISTS level smallint CHECK (level BETWEEN 1 AND 3);',
    'ALTER TABLE skills ADD COLUMN IF NOT EXISTS group_position integer;',
    'CREATE INDEX IF NOT EXISTS skills_group_idx ON skills (group_slug);',
    '',
    '-- Domains and groups ---------------------------------------------------------------',
    '',
    'INSERT INTO skill_domains (slug, name, description, position)',
    '  SELECT slug, name, description, position FROM taxonomy_domains',
    '  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, position = EXCLUDED.position',
    '  WHERE (skill_domains.name, skill_domains.description, skill_domains.position) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.position);',
    'INSERT INTO skill_groups (slug, domain_slug, name, description, position)',
    '  SELECT slug, domain_slug, name, description, position FROM taxonomy_groups',
    '  ON CONFLICT (slug) DO UPDATE SET domain_slug = EXCLUDED.domain_slug, name = EXCLUDED.name, description = EXCLUDED.description, position = EXCLUDED.position',
    '  WHERE (skill_groups.domain_slug, skill_groups.name, skill_groups.description, skill_groups.position)',
    '    IS DISTINCT FROM (EXCLUDED.domain_slug, EXCLUDED.name, EXCLUDED.description, EXCLUDED.position);',
    '',
    '-- Every skill in its group, at its level ----------------------------------------------',
    "-- `category` is the domain's name from here on. Nothing reads it; it is kept so a",
    '-- deployment that still does keeps working while this one goes out.',
    '',
    'UPDATE skills s SET group_slug = t.group_slug, level = t.level, group_position = t.position, category = d.name',
    '  FROM taxonomy_skills t',
    '  INNER JOIN taxonomy_groups g ON g.slug = t.group_slug',
    '  INNER JOIN taxonomy_domains d ON d.slug = g.domain_slug',
    '  WHERE s.name = t.name',
    '    AND (s.group_slug, s.level, s.group_position, s.category) IS DISTINCT FROM (t.group_slug, t.level, t.position, d.name);',
    '',
    '-- A group or domain the file no longer has goes once nothing points at it.',
    'DELETE FROM skill_groups g WHERE NOT EXISTS (SELECT 1 FROM taxonomy_groups t WHERE t.slug = g.slug)',
    '  AND NOT EXISTS (SELECT 1 FROM skills s WHERE s.group_slug = g.slug);',
    'DELETE FROM skill_domains d WHERE NOT EXISTS (SELECT 1 FROM taxonomy_domains t WHERE t.slug = d.slug)',
    '  AND NOT EXISTS (SELECT 1 FROM skill_groups g WHERE g.domain_slug = d.slug);',
    '',
    "-- A path's stage is the skill's level ---------------------------------------------------",
    '-- Held by the database, so no write can leave the two apart: a row written to a',
    "-- path takes its skill's level whatever stage it was given, and a skill whose",
    '-- level changes moves in every path it is on.',
    '',
    `CREATE OR REPLACE FUNCTION occupation_skill_takes_level() RETURNS trigger AS $fn$
BEGIN
  NEW.stage := (SELECT level FROM skills WHERE id = NEW.skill_id);
  RETURN NEW;
END $fn$ LANGUAGE plpgsql;`,
    'DROP TRIGGER IF EXISTS occupation_skills_stage_is_level ON occupation_skills;',
    'CREATE TRIGGER occupation_skills_stage_is_level BEFORE INSERT OR UPDATE ON occupation_skills',
    '  FOR EACH ROW EXECUTE FUNCTION occupation_skill_takes_level();',
    '',
    `CREATE OR REPLACE FUNCTION skill_level_moves_paths() RETURNS trigger AS $fn$
BEGIN
  UPDATE occupation_skills SET stage = NEW.level WHERE skill_id = NEW.id AND stage IS DISTINCT FROM NEW.level;
  RETURN NULL;
END $fn$ LANGUAGE plpgsql;`,
    'DROP TRIGGER IF EXISTS skills_level_moves_paths ON skills;',
    'CREATE TRIGGER skills_level_moves_paths AFTER UPDATE OF level ON skills',
    '  FOR EACH ROW WHEN (OLD.level IS DISTINCT FROM NEW.level) EXECUTE FUNCTION skill_level_moves_paths();',
    '',
    'UPDATE occupation_skills os SET stage = s.level FROM skills s',
    '  WHERE s.id = os.skill_id AND os.stage IS DISTINCT FROM s.level;',
    '',
    'DROP TABLE pg_temp.taxonomy_domains, pg_temp.taxonomy_groups, pg_temp.taxonomy_skills;',
    ''
  );
  return out.join('\n');
}

async function main() {
  const taxonomy = JSON.parse(await readFile(input, 'utf8'));
  const catalogue = JSON.parse(await readFile(catalogueFile, 'utf8'));
  const problems = taxonomyProblems(taxonomy, catalogue);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error(`${input}: ${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  const groups = taxonomy.domains.flatMap((domain) => domain.groups);
  const skills = groups.flatMap((group) => group.skills);
  const perLevel = [1, 2, 3].map((level) => `${skills.filter((skill) => skill.level === level).length} ${LEVEL_NAMES[level - 1]}`).join(', ');
  const summary = `${taxonomy.domains.length} domains, ${groups.length} groups, ${skills.length} skills (${perLevel})`;
  if (checkOnly) {
    console.log(`${input}: valid. ${summary}.`);
    return;
  }
  const sql = taxonomySql(taxonomy, input);
  await writeFile(output, sql);
  console.log(`${output}: ${sql.split('\n').length} lines. ${summary}.`);
}

// Run only when started as a script: the unit checks import the two functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
