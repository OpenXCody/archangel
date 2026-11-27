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
//     catalogue says must not follow that career;
//   - a name taken back from a career (`not`) is not also listed for it;
//   - the words that make a title not ours (`notOurs` in the names file: a
//     `why` and `words`) are each one to three plain words in lower case,
//     listed once, and none stands in a career's title, a title folded into
//     one or an everyday name: such a name could never be read. `exceptIn`,
//     where given, lists the phrases a word of the list may stand in and not
//     count ("proving grounds"): each two or three plain words, listed once,
//     and sharing a word with the list, or it would except nothing.
//
// The migration is applied after the catalogue's own (it matches careers by
// exact title, and skips a title with no career). It:
//   - makes industry_occupations exactly the list for the catalogue's careers:
//     a link the list does not have goes, the rest are added or re-ranked.
//     "everywhere" careers are stored once per industry with common = true,
//     after the industry's own. A career the catalogue does not name keeps
//     whatever links it has;
//   - takes back each name the list says is not a career's after all (`not`):
//     the alias is deleted from that career only, and a line in load_log (load
//     'career-lists') says so. A name that is not stored is left in peace;
//   - adds each everyday name that is not already another name for some
//     career, with a line in load_log, and says once which names it did not add
//     because another career holds them. It deletes no other name. A second run
//     changes nothing and writes nothing.
//
// 0047 was the first, 0056 the second and 0074, which listed the careers 0073
// added, the third, each as it was applied; 0085 follows 0084, which took four
// careers out of the catalogue (their industry links and other names went with
// them), and takes "Oven Operator" back from the paint shop's career. Only the
// latest is what this script writes today.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const [
  catalogueFile = 'data/careers/catalogue.json',
  industriesFile = 'data/careers/industries.json',
  aliasesFile = 'data/careers/aliases.json',
  output = 'migrations/0085_career_lists_4.sql',
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
    // Names taken back.
    if (row.not !== undefined && !Array.isArray(row.not)) problems.push(`"not" of "${row.title}" is not a list`);
    const taken = new Set();
    for (const name of Array.isArray(row.not) ? row.not : []) {
      if (!text(name)) {
        problems.push(`names taken back from "${row.title}": ${JSON.stringify(name)} is not a name`);
        continue;
      }
      if (key(name) === key(row.title)) problems.push(`"${name}" is the title of "${row.title}" and cannot be taken back from it`);
      if (taken.has(key(name))) problems.push(`"${name}" is taken back from "${row.title}" twice`);
      taken.add(key(name));
      if ((Array.isArray(row.aliases) ? row.aliases : []).some((alias) => key(alias) === key(name))) problems.push(`"${name}" is both listed for "${row.title}" and taken back from it`);
    }
  }

  // The words that make a title not ours. They load into no table: the posting reader takes them from the file.
  const notOurs = aliases?.notOurs;
  if (notOurs !== undefined) {
    if (notOurs === null || typeof notOurs !== 'object' || Array.isArray(notOurs)) problems.push('"notOurs" is not a why and a list of words');
    else {
      if (!text(notOurs.why) || notOurs.why.includes('\n')) problems.push('"notOurs" has no one-line "why"');
      const extra = Object.keys(notOurs).filter((name) => name !== 'why' && name !== 'words' && name !== 'exceptIn');
      if (extra.length) problems.push(`"notOurs" holds ${extra.map((name) => `"${name}"`).join(', ')}: only "why", "words" and "exceptIn" are read`);
      if (!Array.isArray(notOurs.words) || notOurs.words.length === 0) problems.push('"notOurs" lists no words');
      const seenWords = new Set();
      // A name as compared words, a plural counting as its singular: how the reader looks for a word of the list in a title.
      const wordsOf = (name) => String(name).toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9+#]+/).filter(Boolean);
      const holds = (name, wanted) => {
        const words = wordsOf(name);
        return words.some((_, at) => wanted.every((word, i) => words[at + i] === word || words[at + i] === `${word}s`));
      };
      const named = [
        ...careers.flatMap((career) => [[career.title, `the career "${career.title}"`], ...(career.was ?? []).map((was) => [was, `"${was}", a title folded into "${career.title}"`])]),
        ...(Array.isArray(aliases?.careers) ? aliases.careers : []).flatMap((row) => (Array.isArray(row?.aliases) ? row.aliases : []).map((alias) => [alias, `"${alias}", an everyday name of "${row.title}"`])),
      ];
      for (const word of Array.isArray(notOurs.words) ? notOurs.words : []) {
        if (typeof word !== 'string' || !/^[a-z]+( [a-z]+){0,2}$/.test(word)) {
          problems.push(`words that make a title not ours: ${JSON.stringify(word)} is not one to three plain words in lower case`);
          continue;
        }
        if (seenWords.has(word)) problems.push(`words that make a title not ours: "${word}" is listed twice`);
        seenWords.add(word);
        for (const [name, what] of named) if (holds(name, word.split(' '))) problems.push(`"${word}" makes a title not ours, and ${what} has it: the name could never be read`);
      }
      // The phrases a word of the list may stand in and not count.
      if (notOurs.exceptIn !== undefined && !Array.isArray(notOurs.exceptIn)) problems.push('"notOurs.exceptIn" is not a list of phrases');
      const listed = new Set((Array.isArray(notOurs.words) ? notOurs.words : []).flatMap((word) => (typeof word === 'string' ? word.split(' ') : [])));
      const seenPhrases = new Set();
      for (const phrase of Array.isArray(notOurs.exceptIn) ? notOurs.exceptIn : []) {
        if (typeof phrase !== 'string' || !/^[a-z]+( [a-z]+){1,2}$/.test(phrase)) {
          problems.push(`phrases a word that makes a title not ours may stand in: ${JSON.stringify(phrase)} is not two or three plain words in lower case`);
          continue;
        }
        if (seenPhrases.has(phrase)) problems.push(`phrases a word that makes a title not ours may stand in: "${phrase}" is listed twice`);
        seenPhrases.add(phrase);
        if (!phrase.split(' ').some((word) => listed.has(word))) problems.push(`"${phrase}" shares no word with the words that make a title not ours: it excepts nothing`);
        if (seenWords.has(phrase)) problems.push(`"${phrase}" is both a word that makes a title not ours and a phrase one may stand in`);
      }
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
  const notRows = aliases.careers.flatMap(({ title, not = [] }) => not.map((name) => [q(name), q(title)]));
  const titleRows = catalogue.careers.map((career) => [q(career.title)]);

  return [
    `-- The careers typical of each industry and the everyday names careers go by,`,
    `-- generated from ${sources.industries} and ${sources.aliases}`,
    '-- by scripts/build-career-lists-sql.mjs. Edit the JSON and regenerate; do not edit this file by hand.',
    '-- Idempotent. Applied after the careers catalogue, whose titles both lists name:',
    '-- careers are matched by exact title and a title with no career is skipped.',
    '',
    'DROP TABLE IF EXISTS pg_temp.list_careers, pg_temp.list_industries, pg_temp.list_names, pg_temp.list_not;',
    'CREATE TEMP TABLE list_careers (title text PRIMARY KEY);',
    'CREATE TEMP TABLE list_industries (industry text NOT NULL, title text NOT NULL, rank integer NOT NULL, common boolean NOT NULL, PRIMARY KEY (industry, title));',
    'CREATE TEMP TABLE list_names (alias text NOT NULL, title text NOT NULL);',
    'CREATE TEMP TABLE list_not (alias text NOT NULL, title text NOT NULL);',
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
    ...(notRows.length ? ['INSERT INTO list_not (alias, title) VALUES', ...values(notRows), ''] : []),
    '-- Names taken back -----------------------------------------------------------------',
    '-- A name the list says is not a career\'s after all is deleted from that career',
    '-- only, in any letter case, and the log says so. A name that is not stored, or is',
    '-- stored for another career, is left alone: a second run finds nothing to do.',
    '',
    'WITH gone AS (',
    '  DELETE FROM occupation_aliases a USING list_not n, occupations o',
    '    WHERE o.title = n.title AND a.canonical_occupation_id = o.id AND lower(a.alias_text) = lower(n.alias)',
    '    RETURNING a.alias_text, o.id, o.title',
    ')',
    'INSERT INTO load_log (load, kind, action, look, detail, entity_id)',
    "  SELECT 'career-lists', 'career', 'name removed', false, format('\"%s\" is no longer another name of %s', alias_text, title), id FROM gone;",
    '',
    '-- Everyday names -----------------------------------------------------------------',
    "-- A name is left out when it is already another name for some career, or is a",
    "-- career's own title, in any letter case: the log says once which, for a person",
    '-- to read. Nothing else is changed or deleted.',
    '',
    'INSERT INTO load_log (load, kind, action, look, detail, entity_id)',
    "  SELECT 'career-lists', 'career', 'name not added', true,",
    "    format('\"%s\" was not added to %s: it is %s', n.alias, n.title,",
    "      coalesce((SELECT format('the title of %s', t.title) FROM occupations t WHERE lower(t.title) = lower(n.alias) LIMIT 1),",
    "               (SELECT format('another name of %s', h.title) FROM occupation_aliases a INNER JOIN occupations h ON h.id = a.canonical_occupation_id WHERE lower(a.alias_text) = lower(n.alias) LIMIT 1))), o.id",
    '  FROM list_names n INNER JOIN occupations o ON o.title = n.title',
    '  WHERE (EXISTS (SELECT 1 FROM occupations t WHERE lower(t.title) = lower(n.alias))',
    '      OR EXISTS (SELECT 1 FROM occupation_aliases a WHERE lower(a.alias_text) = lower(n.alias) AND a.canonical_occupation_id <> o.id))',
    "    AND NOT EXISTS (SELECT 1 FROM load_log l WHERE l.load = 'career-lists' AND l.action = 'name not added' AND l.entity_id = o.id AND starts_with(l.detail, format('\"%s\" was not added to ', n.alias)));",
    '',
    'WITH added AS (',
    '  INSERT INTO occupation_aliases (alias_text, canonical_occupation_id)',
    '    SELECT n.alias, o.id FROM list_names n INNER JOIN occupations o ON o.title = n.title',
    '    WHERE NOT EXISTS (SELECT 1 FROM occupations t WHERE lower(t.title) = lower(n.alias))',
    '      AND NOT EXISTS (SELECT 1 FROM occupation_aliases a WHERE lower(a.alias_text) = lower(n.alias))',
    '    ON CONFLICT (alias_text) DO NOTHING',
    '    RETURNING alias_text, canonical_occupation_id',
    ')',
    'INSERT INTO load_log (load, kind, action, look, detail, entity_id)',
    "  SELECT 'career-lists', 'career', 'name added', false, format('\"%s\" is another name of %s', d.alias_text, o.title), o.id",
    '  FROM added d INNER JOIN occupations o ON o.id = d.canonical_occupation_id;',
    '',
    'DROP TABLE pg_temp.list_careers, pg_temp.list_industries, pg_temp.list_names, pg_temp.list_not;',
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
  const taken = aliases.careers.reduce((sum, row) => sum + (row.not ?? []).length, 0);
  const notOurs = aliases.notOurs?.words?.length ?? 0;
  const summary = `${industries.industries.length} industries with ${links} careers of their own and ${industries.everywhere.length} found everywhere; ${names} everyday names for ${aliases.careers.filter((row) => row.aliases.length > 0).length} careers; ${taken} names taken back; ${notOurs} words that make a title not ours`;
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
