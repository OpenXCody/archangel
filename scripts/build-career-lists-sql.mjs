// Turns the two curated lists that hang from the careers catalogue into one
// idempotent SQL migration:
//   data/careers/industries.json   the careers typical of each industry
//   data/careers/aliases.json      the everyday names careers go by
//
//   node scripts/build-career-lists-sql.mjs [catalogue.json] [industries.json] [aliases.json] [output.sql]
//   node scripts/build-career-lists-sql.mjs --check [catalogue.json] [industries.json] [aliases.json]
//
// Both lists name careers by title, and every title must be a career of the
// catalogue (data/careers/catalogue.json). --check validates and writes
// nothing. It fails unless:
//   - every title in either list is a career of the catalogue, and every
//     career of the catalogue is listed for some industry or under
//     "everywhere";
//   - no industry is listed twice, and no career twice in one industry;
//   - an everyday name is listed once, in any letter case, and is not a
//     career's title, a title folded into another career, or a name the
//     catalogue says must not follow that career.
//
// The migration is applied after the catalogue's own (it matches careers by
// exact title, and skips a title with no career). It:
//   - makes industry_occupations exactly the list for the catalogue's careers:
//     a link the list does not have goes, the rest are added or re-ranked.
//     "everywhere" careers are stored once per industry with common = true,
//     after the industry's own. A career the catalogue does not name keeps
//     whatever links it has;
//   - adds each everyday name that is not already another name for some
//     career. It deletes no name.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const [
  catalogueFile = 'data/careers/catalogue.json',
  industriesFile = 'data/careers/industries.json',
  aliasesFile = 'data/careers/aliases.json',
  output = 'migrations/0047_career_lists.sql',
] = args.filter((arg) => arg !== '--check');

const text = (value) => typeof value === 'string' && value.trim().length > 0 && value === value.trim();
const key = (name) => String(name).toLowerCase();

/** Everything wrong with the two lists, as sentences. None means they can be loaded. */
export function listProblems(catalogue, industries, aliases) {
  const problems = [];
  const careers = catalogue?.careers ?? [];
  const titles = new Set(careers.map((career) => career.title));

  // Industries.
  const everywhere = Array.isArray(industries?.everywhere) ? industries.everywhere : [];
  const listed = new Set();
  const titlesOf = (list, where) => {
    const seen = new Set();
    for (const title of list) {
      if (!titles.has(title)) problems.push(`${where}: "${title}" is not a career of the catalogue`);
      if (seen.has(title)) problems.push(`${where}: "${title}" is listed twice`);
      seen.add(title);
      listed.add(title);
    }
  };
  titlesOf(everywhere, '"everywhere"');
  const names = new Set();
  const rows = Array.isArray(industries?.industries) ? industries.industries : [];
  if (rows.length === 0) problems.push('"industries" is empty');
  for (const row of rows) {
    if (!text(row?.industry)) {
      problems.push(`an industry has no name: ${JSON.stringify(row?.industry)}`);
      continue;
    }
    if (names.has(row.industry)) problems.push(`"${row.industry}" is listed twice`);
    names.add(row.industry);
    titlesOf(Array.isArray(row.careers) ? row.careers : [], `"${row.industry}"`);
  }
  for (const title of titles) if (!listed.has(title)) problems.push(`"${title}" is a career of the catalogue and is listed for no industry`);

  // Everyday names.
  const folded = new Map(careers.flatMap((career) => (career.was ?? []).map((was) => [key(was), career.title])));
  const titleKeys = new Set([...titles].map(key));
  const dropped = new Map(careers.map((career) => [career.title, new Set((career.dropAliases ?? []).map(key))]));
  const owner = new Map();
  const seenTitles = new Set();
  for (const row of Array.isArray(aliases?.careers) ? aliases.careers : []) {
    if (!titles.has(row?.title)) {
      problems.push(`everyday names: "${row?.title}" is not a career of the catalogue`);
      continue;
    }
    if (seenTitles.has(row.title)) problems.push(`everyday names: "${row.title}" has two lists`);
    seenTitles.add(row.title);
    for (const alias of Array.isArray(row.aliases) ? row.aliases : []) {
      if (!text(alias)) {
        problems.push(`everyday names of "${row.title}": ${JSON.stringify(alias)} is not a name`);
        continue;
      }
      if (titleKeys.has(key(alias))) problems.push(`"${alias}" (listed for "${row.title}") is a career's title`);
      else if (folded.has(key(alias))) problems.push(`"${alias}" (listed for "${row.title}") is a title folded into "${folded.get(key(alias))}": the catalogue already keeps it`);
      if (dropped.get(row.title)?.has(key(alias))) problems.push(`"${alias}" is listed for "${row.title}", and the catalogue says it must not follow that career`);
      if (owner.has(key(alias))) problems.push(`"${alias}" is listed for both "${owner.get(key(alias))}" and "${row.title}"`);
      else owner.set(key(alias), row.title);
    }
  }
  return problems;
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** The migration's text. `sources` are the files' names, for the header. */
export function listSql(catalogue, industries, aliases, sources) {
  const values = (rows) => rows.map((row, i) => `  (${row.join(', ')})${i === rows.length - 1 ? ';' : ','}`);

  const industryRows = [];
  for (const { industry, careers } of industries.industries) {
    careers.forEach((title, i) => industryRows.push([q(industry), q(title), i + 1, false]));
    industries.everywhere
      .filter((title) => !careers.includes(title))
      .forEach((title, i) => industryRows.push([q(industry), q(title), careers.length + i + 1, true]));
  }
  const aliasRows = aliases.careers.flatMap(({ title, aliases: list }) => list.map((alias) => [q(alias), q(title)]));
  const titleRows = catalogue.careers.map((career) => [q(career.title)]);

  return [
    `-- The careers typical of each industry and the everyday names careers go by,`,
    `-- generated from ${sources.industries} and ${sources.aliases}`,
    '-- by scripts/build-career-lists-sql.mjs. Edit the JSON and regenerate; do not edit this file by hand.',
    '-- Idempotent. Applied after the careers catalogue, whose titles both lists name:',
    '-- careers are matched by exact title and a title with no career is skipped.',
    '',
    'DROP TABLE IF EXISTS pg_temp.list_careers, pg_temp.list_industries, pg_temp.list_names;',
    'CREATE TEMP TABLE list_careers (title text PRIMARY KEY);',
    'CREATE TEMP TABLE list_industries (industry text NOT NULL, title text NOT NULL, rank integer NOT NULL, common boolean NOT NULL, PRIMARY KEY (industry, title));',
    'CREATE TEMP TABLE list_names (alias text NOT NULL, title text NOT NULL);',
    '',
    "-- The catalogue's careers: the ones whose industry links this list decides.",
    'INSERT INTO list_careers (title) VALUES',
    ...values(titleRows),
    '',
    'INSERT INTO list_industries (industry, title, rank, common) VALUES',
    ...values(industryRows),
    '',
    'INSERT INTO list_names (alias, title) VALUES',
    ...values(aliasRows),
    '',
    '-- Careers by industry -----------------------------------------------------------',
    "-- For the catalogue's careers the links are exactly the list's: one the list does",
    '-- not have goes (a link that followed a folded title to a career it does not fit),',
    '-- the rest are added or put in the list\'s order. Other careers keep theirs.',
    '',
    'DELETE FROM industry_occupations io USING occupations o',
    '  WHERE o.id = io.occupation_id',
    '    AND EXISTS (SELECT 1 FROM list_careers c WHERE c.title = o.title)',
    '    AND NOT EXISTS (SELECT 1 FROM list_industries l WHERE l.industry = io.industry AND l.title = o.title);',
    'INSERT INTO industry_occupations (industry, occupation_id, rank, common)',
    '  SELECT l.industry, o.id, l.rank, l.common FROM list_industries l INNER JOIN occupations o ON o.title = l.title',
    '  ON CONFLICT (industry, occupation_id) DO UPDATE SET rank = EXCLUDED.rank, common = EXCLUDED.common',
    '    WHERE (industry_occupations.rank, industry_occupations.common) IS DISTINCT FROM (EXCLUDED.rank, EXCLUDED.common);',
    '',
    '-- Everyday names -----------------------------------------------------------------',
    "-- A name is left out when it is already another name for some career, or is a",
    "-- career's own title, in any letter case. Nothing is changed or deleted.",
    '',
    'INSERT INTO occupation_aliases (alias_text, canonical_occupation_id)',
    '  SELECT n.alias, o.id FROM list_names n INNER JOIN occupations o ON o.title = n.title',
    '  WHERE NOT EXISTS (SELECT 1 FROM occupations t WHERE lower(t.title) = lower(n.alias))',
    '    AND NOT EXISTS (SELECT 1 FROM occupation_aliases a WHERE lower(a.alias_text) = lower(n.alias))',
    '  ON CONFLICT (alias_text) DO NOTHING;',
    '',
    'DROP TABLE pg_temp.list_careers, pg_temp.list_industries, pg_temp.list_names;',
    '',
  ].join('\n');
}

async function main() {
  const catalogue = JSON.parse(await readFile(catalogueFile, 'utf8'));
  const industries = JSON.parse(await readFile(industriesFile, 'utf8'));
  const aliases = JSON.parse(await readFile(aliasesFile, 'utf8'));
  const problems = listProblems(catalogue, industries, aliases);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'} in ${industriesFile} and ${aliasesFile}.`);
    process.exit(1);
  }
  const links = industries.industries.reduce((sum, row) => sum + row.careers.length, 0);
  const names = aliases.careers.reduce((sum, row) => sum + row.aliases.length, 0);
  const summary = `${industries.industries.length} industries with ${links} careers of their own and ${industries.everywhere.length} found everywhere; ${names} everyday names for ${aliases.careers.length} careers`;
  if (checkOnly) {
    console.log(`valid. ${summary}.`);
    return;
  }
  const sql = listSql(catalogue, industries, aliases, { industries: industriesFile, aliases: aliasesFile });
  await writeFile(output, sql);
  console.log(`${output}: ${sql.split('\n').length} lines. ${summary}.`);
}

// Run only when started as a script: the unit checks import the two functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
