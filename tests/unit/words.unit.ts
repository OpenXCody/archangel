// On screen a factory is a factory, never a plant (CLAUDE.md, "Words"). This
// reads the words the product can show a person and fails on "plant" where it
// means the factory. `npm run test:unit`. No browser, no database.
//
// What it reads: every string, template part and JSX text in client/src,
// server/lib, server/routes and shared (comments and identifiers are not
// words on a screen), plus client/index.html and the manifest.
//
// What it does not take for words on a screen, by rule:
//   - the module a file imports;
//   - a string in a type ('plants' | 'industry');
//   - the text of a SQL statement (a template tagged `sql`);
//   - an address: no spaces, beginning with "/" ("/admin/plants/pairs", "/jobs?plant=");
//   - an element's id, key or data attribute (<DetailSection id="plants">: an anchor).
// And by name: PHRASES (the word in another sense) and CODE (a value the code
// keeps, file by file, each with its reason). A new line in either list is a
// decision: say why beside it.
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

/** The word as a person reads it: alone, any case, singular, plural or possessive. Not `plantPairs` or `plant_merge`. */
const WORD = /\bplants?\b/i;

/** The word in another sense, or in a name: taken out before a text is judged. */
const PHRASES: [RegExp, string][] = [
  [/\bpower plants?\b/gi, 'what makes electricity, or an engine: a skill group is "Engines and power plants"'],
  [/\b(chemical|treatment|wastewater|asphalt mixing) plants?\b/gi, 'an installation a skill or a record is about, not a place in our list'],
  [/\bplant utilities\b/gi, "a skill group's name: steam, air and water for a site"],
  [/\bnuclear plant operations\b/gi, "a skill group's name"],
  [/\bPlant City\b/g, 'a town in Florida'],
];

/** Values the code keeps, by file: the exact text, and why it is not a word on a screen. */
const CODE: Record<string, Record<string, string>> = {
  'client/src/components/account/CompanyRequestForm.tsx': {
    'plant-request': "the prefix of the form's field ids",
    plant: 'the value of data-company-request, which the tests read',
  },
  'client/src/components/admin/HistoryList.tsx': {
    'plant request declined': 'an audit action as it was stored before the screen said factory; the line it is shown as says Factory',
    'plant request marked added': 'the same',
  },
  'client/src/components/admin/QualityTable.tsx': { plants: "the API's field (GET /api/admin/quality)" },
  'client/src/pages/Jobs.tsx': { plant: 'the name of the ?plant= parameter' },
  'client/src/lib/queryKeys.ts': { plants: 'a query key' },
  'server/lib/emailTemplates.ts': { 'plant-added': "an email's kind, written to the log and the outbox, never shown" },
  'server/lib/industries.ts': {
    plants: "a word of the stored industry sentences that search sets aside (PLAIN_WORDS)",
    plant: 'the same',
  },
  'server/lib/intake.ts': { '" is this plant': 'the end of a note written to load_log, which no screen reads' },
  'server/lib/plantPairs.ts': {
    'Plant not found': "the database's refusal as migration 0051 words it: the key it is reworded by",
    'The plant to merge into was not found.': 'the same',
  },
  'server/lib/quality.ts': { plants: "the API's field" },
};

/** Whole files whose strings are patterns over registry names, not words of ours. */
const PATTERN_FILES: Record<string, string> = {
  'shared/addressStubFilter.ts': 'patterns that find "ASPHALT MIXING PLANT", "WASTEWATER PLANT", "FORMER PLANT" in registry names',
};

const DIRS = ['client/src', 'server/lib', 'server/routes', 'shared'];
const PAGES = ['client/index.html', 'client/public/manifest.webmanifest'];

function sourceFiles(dir: string): string[] {
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

/** The value of an id, a key or a data attribute: a handle for code and for the address, never read out. */
function isHandle(node: ts.Node): boolean {
  const attribute = node.parent;
  return ts.isJsxAttribute(attribute) && /^(id|key|htmlFor|data-.+)$/.test(attribute.name.getText());
}

/** Every text in a file that says the word to a person: [line, text]. */
export function plantWords(rel: string, code: string): [number, string][] {
  const source = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const kept = CODE[rel] ?? {};
  const found: [number, string][] = [];
  const visit = (node: ts.Node): void => {
    const isText =
      ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
    if (isText) {
      const text = textOf(node, source);
      const parent = node.parent;
      const notWords =
        ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        ts.isLiteralTypeNode(parent) ||
        isSqlText(node) ||
        isHandle(node) ||
        (/^\/\S*$/.test(text) && !ts.isJsxText(node)) ||
        Object.hasOwn(kept, text);
      if (!notWords && WORD.test(withoutPhrases(text))) {
        found.push([source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text.replace(/\s+/g, ' ').trim()]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

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
  // What the code keeps: an identifier, a comment, an import, a type, an address, SQL.
  assert.deepEqual(lines(`import { PlantPicker } from './PlantPicker'; // a plant\nconst plantCount = plants.length;`), []);
  assert.deepEqual(lines(`type Key = 'plants' | 'industry';`), []);
  assert.deepEqual(lines('const to = `/jobs?plant=${id}`; const at = "/admin/plants/pairs";'), []);
  assert.deepEqual(lines(`const a = <DetailSection id="plants" title="Plants" data-kind="plant" />;`), ['Plants']);
  assert.deepEqual(lines('const rows = sql`SELECT COUNT(*) AS plants FROM factories WHERE id = ${id}`;', 'server/lib/example.ts'), []);
  // Another sense of the word, and a name.
  assert.deepEqual(lines(`const a = 'Engines and power plants'; const b = 'Plant City, FL'; const c = 'a water treatment plant';`), []);
  assert.deepEqual(lines(`const a = 'A power plant is not a plant of ours';`), ['A power plant is not a plant of ours']);
});

test('every value the check lets through is still there', () => {
  // A line of CODE whose text has gone from its file is a stale allowance: take it out.
  const stale: string[] = [];
  for (const [rel, kept] of Object.entries(CODE)) {
    const code = readFileSync(path.join(root, rel), 'utf8');
    for (const text of Object.keys(kept)) if (!code.includes(text)) stale.push(`${rel}: ${text}`);
  }
  assert.deepEqual(stale, []);
});
