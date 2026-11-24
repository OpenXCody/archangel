// On screen a factory is a factory, never a plant (CLAUDE.md, "Words"). This
// reads the words the product can show a person and fails on "plant" where it
// means the factory. `npm run test:unit`. No browser, no database.
//
// What it reads:
//   - every string, template part and JSX text in client/src, server (all of
//     it but the sample data in server/scripts), shared and api: comments and
//     identifiers are not words on a screen;
//   - client/index.html and the manifest, line by line;
//   - the two places the database words something a screen shows as written:
//     the reason a source's match waits (scripts/ingest/lib/pipeline.mjs) and
//     the refusals of the plant merge (scripts/plant-merge.sql), which
//     server/lib/plantPairs.ts must reword.
//
// What it does not take for words on a screen, by rule:
//   - the module a file imports;
//   - a string in a type ('plants' | 'industry');
//   - the text of a SQL statement (a template tagged `sql`), except a quoted
//     sentence inside it ('The company has no plant here'): a single quoted
//     word there is a kind or a key;
//   - an address: no spaces, beginning with "/" ("/admin/plants/pairs", "/jobs?plant=");
//   - an element's key, htmlFor or data attribute. An id is judged: it is the
//     end of an address a person can read (/industries/food#plants).
// And by name: PHRASES (the word in another sense) and CODE (a value the code
// keeps: the file, the exact text, how many times it stands there, and why).
// One more of an allowed text in its file fails, naming every line it stands
// on, so a count said as `n === 1 ? 'plant' : 'plants'` cannot hide behind a
// field called `plants`. A new line in either list is a decision: say why beside it.
//
// It cannot see a sentence that arrives from the database (a career's or a
// skill's description, an industry's sentence, a name): those are restated in
// data/, and the name of a real site keeps its word.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The word as a person reads it: alone, any case, singular, plural or possessive,
 * and joined without a hyphen ("plantwide"; "plant-wide" is the word alone).
 * Not `plantPairs` or `plant_merge`.
 */
const WORD = /\bplant(s|wide|side)?\b/i;

/**
 * The word in another sense, or in a name: taken out before a text is judged.
 * Each is matched as it is written in a sentence or as the name is spelled, so
 * a label of ours ("Chemical plants" as a tab) is still judged.
 */
const PHRASES: [RegExp, string][] = [
  [/\bpower plants?\b/g, 'what makes electricity, or an engine: a skill group is "Engines and power plants"'],
  [/\b(chemical|treatment|wastewater|asphalt mixing) plants?\b/g, 'an installation a skill or a record is about, not a place in our list'],
  [/\bPlant utilities\b/g, "a skill group's name: steam, air and water for a site"],
  [/\bNuclear plant operations\b/g, "a skill group's name"],
  [/\bPlant City\b/g, 'a town in Florida'],
];

/** Values the code keeps, by file: the exact text, how many times it stands in the file, and why it is not a word on a screen. */
const CODE: Record<string, Record<string, [times: number, why: string]>> = {
  'client/src/components/account/CompanyRequestForm.tsx': {
    'plant-request': [1, "the prefix of the form's field ids"],
    plant: [1, 'the value of data-company-request, which the tests read'],
  },
  'client/src/components/admin/HistoryList.tsx': {
    'plant request declined': [1, 'an audit action as it was stored before the screen said factory; the line it is shown as says Factory'],
    'plant request marked added': [1, 'the same'],
  },
  'client/src/components/admin/QualityTable.tsx': { plants: [3, "the API's field (GET /api/admin/quality): the column's key, the first sort, the column in full ink"] },
  'client/src/pages/Industry.tsx': { plants: [1, "the section's id as it was before the screen said factory: an address someone may hold"] },
  'client/src/pages/Jobs.tsx': { plant: [1, 'the name of the ?plant= parameter'] },
  'client/src/lib/queryKeys.ts': { plants: [4, 'a query key, in the four keys of the pairs'] },
  'server/db/schema.ts': { plant: [1, "load_log's column"] },
  'server/lib/emailTemplates.ts': { 'plant-added': [1, "an email's kind, written to the log and the outbox, never shown"] },
  'server/lib/industries.ts': {
    plants: [1, 'a word of the stored industry sentences that search sets aside (PLAIN_WORDS)'],
    plant: [1, 'the same'],
  },
  'server/lib/intake.ts': {
    '" is this plant': [1, 'the end of a note written to load_log, which no screen reads'],
    'an admin said it is none of the plants proposed': [1, 'a note written to load_log'],
  },
  'server/lib/plantPairs.ts': {
    'Plant not found': [1, "the database's refusal as migration 0051 words it: the key it is reworded by"],
    'The plant to merge into was not found.': [1, 'the same'],
    'Choose a different plant to merge into.': [1, 'the same'],
    'an admin said they are one plant': [1, 'a note written to load_log'],
  },
  'server/lib/quality.ts': { plants: [1, "the API's field"] },
};

/** Whole files whose strings are patterns over registry names, not words of ours. */
const PATTERN_FILES: Record<string, string> = {
  'shared/addressStubFilter.ts': 'patterns that find "ASPHALT MIXING PLANT", "WASTEWATER PLANT", "FORMER PLANT" in registry names',
};

const DIRS = ['client/src', 'server', 'shared', 'api'];
/** Folders inside them that are not read. */
const NOT_READ: Record<string, string> = {
  'server/scripts': 'the local sample and its made-up names ("EV Battery Plant", the career "Plant Manager"); the bulk importer',
};
const PAGES = ['client/index.html', 'client/public/manifest.webmanifest'];

function sourceFiles(dir: string): string[] {
  if (NOT_READ[dir]) return [];
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}

const withoutPhrases = (text: string): string => PHRASES.reduce((left, [phrase]) => left.replace(phrase, ' '), text);

/** The text a node holds, as written, without its quotes or the braces of a template. */
function textOf(node: ts.Node, source: ts.SourceFile): string {
  if (ts.isJsxText(node)) return node.getText(source);
  return (node as ts.LiteralLikeNode).text;
}

/** Inside a template tagged `sql`: the statement's own text, not a string handed to it. */
function isSqlText(node: ts.Node): boolean {
  const template = ts.isNoSubstitutionTemplateLiteral(node) ? node : ts.isTemplateHead(node) ? node.parent : ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.parent.parent : null;
  if (!template) return false;
  const tagged = template.parent;
  return ts.isTaggedTemplateExpression(tagged) && tagged.template === template && tagged.tag.getText() === 'sql';
}

/** The sentences a SQL statement quotes: a literal of two words or more. One word ('plant', 'plant-merge') is a kind or a key. */
const sqlSentences = (statement: string): string[] =>
  [...statement.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1].replace(/''/g, "'")).filter((literal) => /\S\s+\S/.test(literal));

/** The value of a key or a data attribute: a handle for code, never read out. An id is not here: it is in the address. */
function isHandle(node: ts.Node): boolean {
  const attribute = node.parent;
  return ts.isJsxAttribute(attribute) && /^(key|htmlFor|data-.+)$/.test(attribute.name.getText());
}

/**
 * A file's texts that say the word: `said` to a person, [line, text], and
 * `kept`, how many times each text CODE allows was met. An allowed text met
 * more often than its count is said once, with every line it stands on.
 */
function read(rel: string, code: string): { said: [number, string][]; kept: Record<string, number> } {
  const source = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const allowed = CODE[rel] ?? {};
  const said: [number, string][] = [];
  const kept: Record<string, number> = {};
  const keptAt: Record<string, number[]> = {};
  const judge = (node: ts.Node, text: string): void => {
    if (!WORD.test(withoutPhrases(text))) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (Object.hasOwn(allowed, text)) {
      kept[text] = (kept[text] ?? 0) + 1;
      (keptAt[text] ??= []).push(line);
      return;
    }
    said.push([line, text.replace(/\s+/g, ' ').trim()]);
  };
  const visit = (node: ts.Node): void => {
    const isText =
      ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
    if (isText) {
      const text = textOf(node, source);
      const parent = node.parent;
      if (isSqlText(node)) {
        for (const sentence of sqlSentences(text)) judge(node, sentence);
      } else {
        const notWords =
          ts.isImportDeclaration(parent) ||
          ts.isExportDeclaration(parent) ||
          ts.isLiteralTypeNode(parent) ||
          isHandle(node) ||
          (/^\/\S*$/.test(text) && !ts.isJsxText(node));
        if (!notWords) judge(node, text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  // One more than the list says: which of them is new cannot be told, so all its lines are named.
  for (const [text, lines] of Object.entries(keptAt)) {
    const [times] = allowed[text];
    if (lines.length > times) said.push([lines[0], `"${text}" stands ${lines.length} times (lines ${lines.join(', ')}); the list allows ${times}`]);
  }
  return { said: said.sort(([a], [b]) => a - b), kept };
}

/** Every text in a file that says the word to a person: [line, text]. */
export const plantWords = (rel: string, code: string): [number, string][] => read(rel, code).said;

test('no screen says "plant" for a factory', () => {
  const said: string[] = [];
  for (const rel of DIRS.flatMap(sourceFiles)) {
    if (PATTERN_FILES[rel]) continue;
    for (const [line, text] of plantWords(rel, readFileSync(path.join(root, rel), 'utf8'))) said.push(`${rel}:${line}: ${text}`);
  }
  for (const rel of PAGES) {
    readFileSync(path.join(root, rel), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (WORD.test(withoutPhrases(line))) said.push(`${rel}:${index + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(said, [], `On screen it is a factory. ${said.length} ${said.length === 1 ? 'text says' : 'texts say'} plant:\n${said.join('\n')}\n`);
});

test('the check tells a word on a screen from a value the code keeps', () => {
  const lines = (code: string, rel = 'client/src/example.tsx') => plantWords(rel, code).map(([, text]) => text);
  // What a person reads: a label, a sentence, the two forms a count is said in, a template's parts, JSX text.
  assert.deepEqual(lines(`const a = 'Plants';`), ['Plants']);
  assert.deepEqual(lines(`const a = plural(n, 'plant', 'plants');`), ['plant', 'plants']);
  assert.deepEqual(lines('const a = `Other ${name} plants`;'), ['plants']);
  assert.deepEqual(lines(`const a = <p>No plants are listed here.</p>;`), ['No plants are listed here.']);
  assert.deepEqual(lines(`const a = <Section title="About this plant's people" />;`), ["About this plant's people"]);
  assert.deepEqual(lines(`const a = 'Plantwide'; const b = 'plant-wide';`), ['Plantwide', 'plant-wide']);
  // What the code keeps: an identifier, a comment, an import, a type, an address, a key, a data attribute, SQL.
  assert.deepEqual(lines(`import { PlantPicker } from './PlantPicker'; // a plant\nconst plantCount = plants.length;`), []);
  assert.deepEqual(lines(`type Key = 'plants' | 'industry';`), []);
  assert.deepEqual(lines('const to = `/jobs?plant=${id}`; const at = "/admin/plants/pairs";'), []);
  assert.deepEqual(lines(`const a = <Row key="plants" title="Plants" data-kind="plant" />;`), ['Plants']);
  assert.deepEqual(lines("const rows = sql`SELECT COUNT(*) AS plants FROM factories WHERE kind = 'plant' AND id = ${id}`;", 'server/lib/example.ts'), []);
  // An id is in the address (/companies/tesla#factories), so it is read.
  assert.deepEqual(lines(`const a = <DetailSection id="plants" title="Factories" />;`), ['plants']);
  // A sentence a SQL statement quotes can reach a screen.
  assert.deepEqual(lines("const rows = sql`SELECT 'The company has no plant here' AS why FROM factories WHERE id = ${id}`;", 'server/lib/example.ts'), [
    'The company has no plant here',
  ]);
  // Another sense of the word, and a name; but not a label of ours that borrows the phrase.
  assert.deepEqual(lines(`const a = 'Engines and power plants'; const b = 'Plant City, FL'; const c = 'a water treatment plant';`), []);
  assert.deepEqual(lines(`const a = 'A power plant is not a plant of ours';`), ['A power plant is not a plant of ours']);
  assert.deepEqual(lines(`const tabs = { factories: 'Chemical plants' };`), ['Chemical plants']);
});

test('a value the code keeps is let through as often as its file holds it, and no more', () => {
  const lines = (rel: string, code: string) => plantWords(rel, code).map(([, text]) => text);
  // The ?plant= parameter's name, once; the same word as a count beside it is a word on a screen.
  assert.deepEqual(lines('client/src/pages/Jobs.tsx', `const plant = linked('plant');`), []);
  assert.deepEqual(lines('client/src/pages/Jobs.tsx', `const plant = linked('plant');\nconst said = n === 1 ? 'plant' : 'factories';`), [
    '"plant" stands 2 times (lines 1, 2); the list allows 1',
  ]);
  // The quality table's field, three times; a fourth is a label.
  const table = `const a = { key: 'plants' }; const b = { key: 'plants' }; const c = key === 'plants';`;
  assert.deepEqual(lines('client/src/components/admin/QualityTable.tsx', table), []);
  assert.deepEqual(lines('client/src/components/admin/QualityTable.tsx', `${table} const d = { label: 'plants' };`), [
    '"plants" stands 4 times (lines 1, 1, 1, 1); the list allows 3',
  ]);
  // In another file the same text is not let through at all.
  assert.deepEqual(lines('client/src/pages/Explore.tsx', `const plant = linked('plant');`), ['plant']);
});

test('every value the check lets through is there as often as the list says', () => {
  // Fewer than the list says is a stale allowance: lower the count or take the line out. (More fails the first test.)
  const off: string[] = [];
  for (const [rel, allowed] of Object.entries(CODE)) {
    const { kept } = read(rel, readFileSync(path.join(root, rel), 'utf8'));
    for (const [text, [times]] of Object.entries(allowed)) {
      if ((kept[text] ?? 0) < times) off.push(`${rel}: "${text}" stands ${kept[text] ?? 0} ${kept[text] === 1 ? 'time' : 'times'}, the list says ${times}`);
    }
  }
  assert.deepEqual(off, []);
  for (const dir of Object.keys(NOT_READ)) assert.ok(readdirSync(path.join(root, dir)).length > 0, `${dir} is still there`);
});

test('what the database words for a screen says factory', () => {
  // The reason a source's match waits for a person is composed in SQL by the intake runner and shown as written
  // (Admin Tools, Review: components/admin/MatchReview.tsx).
  const pipeline = readFileSync(path.join(root, 'scripts/ingest/lib/pipeline.mjs'), 'utf8');
  const reasons = [...pipeline.matchAll(/concat_ws\('; ',([\s\S]*?)\) AS why/g)].map((match) => match[1]);
  assert.equal(reasons.length, 1, "the reasons of a match to review are one concat_ws(...) AS why in pipeline.mjs's resolve");
  assert.ok(reasons[0].includes('filed under another company'), 'that block is the reasons');
  const reasonsSaying = sqlSentences(reasons[0]).filter((sentence) => WORD.test(withoutPhrases(sentence)));
  assert.deepEqual(reasonsSaying, [], 'a reason a match waits for says factory');

  // The plant merge's refusals are worded by the database (migration 0051, built from scripts/plant-merge.sql, never
  // edited). Each one that says plant is a key of SAID in server/lib/plantPairs.ts, which rewords it before it is shown.
  const merge = readFileSync(path.join(root, 'scripts/plant-merge.sql'), 'utf8');
  const refusals = [...merge.matchAll(/MESSAGE = (?:format\()?'((?:[^']|'')*)'/g)].map((match) => match[1].replace(/''/g, "'"));
  assert.ok(refusals.length >= 3, 'the merge words its refusals as MESSAGE = ...');
  const saying = refusals.filter((refusal) => WORD.test(withoutPhrases(refusal)));
  const said = /const SAID: Record<string, string> = \{([\s\S]*?)\n\};/.exec(readFileSync(path.join(root, 'server/lib/plantPairs.ts'), 'utf8'));
  assert.ok(said, 'server/lib/plantPairs.ts holds SAID');
  const reworded = [...said[1].matchAll(/^\s*'((?:[^'\\]|\\.)*)': '((?:[^'\\]|\\.)*)',$/gm)].map((match) => [match[1], match[2]]);
  assert.deepEqual(saying.filter((refusal) => !reworded.some(([from]) => from === refusal)), [], 'every refusal that says plant is reworded');
  assert.deepEqual(reworded.filter(([, to]) => WORD.test(withoutPhrases(to))), [], 'and reworded without the word');
});
