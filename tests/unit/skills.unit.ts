// The skills catalogue (data/skills/catalogue.json) and the migration made
// from it. `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface CatalogueSkill {
  name: string;
  category: string;
  was?: string[];
  aliases?: string[];
  what: string;
  learned: string;
  tools?: string[];
  careers?: { title: string; stage?: number }[];
}
interface Catalogue {
  categories: string[];
  skills: CatalogueSkill[];
  removed: { why: string; names: string[] }[];
}

const catalogue = JSON.parse(readFileSync('data/skills/catalogue.json', 'utf8')) as Catalogue;

test('the skills migration is what the catalogue generates', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'skills-sql-'));
  try {
    const out = path.join(dir, 'out.sql');
    execFileSync(process.execPath, ['scripts/build-skills-sql.mjs', 'data/skills/catalogue.json', out], { stdio: 'pipe' });
    assert.equal(
      readFileSync(out, 'utf8'),
      readFileSync('migrations/0033_skills_catalogue.sql', 'utf8'),
      'run `node scripts/build-skills-sql.mjs` after editing data/skills/catalogue.json'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every kept skill says what it is, how it is learned, and sits in a listed category', () => {
  const names = new Set<string>();
  for (const skill of catalogue.skills) {
    assert.ok(!names.has(skill.name), `${skill.name} is listed twice`);
    names.add(skill.name);
    assert.ok(catalogue.categories.includes(skill.category), `${skill.name}: unknown category ${skill.category}`);
    // What it is, then what a person who has it can do: two sentences at least.
    assert.match(skill.what, /\. A person who has it /, `${skill.name}: "what" says what a person who has it can do`);
    assert.ok(skill.learned.trim().endsWith('.'), `${skill.name}: "learned" is a sentence`);
    assert.ok((skill.tools ?? []).length <= 12, `${skill.name}: at most 12 tools`);
  }
  for (const category of catalogue.categories) {
    assert.ok(catalogue.skills.some((skill) => skill.category === category), `no skill in ${category}`);
  }
});

test('a stored skill is decided once: kept, merged into one skill, or removed', () => {
  const decided = new Map<string, string>();
  const decide = (name: string, how: string) => {
    assert.ok(!decided.has(name), `${name} is ${decided.get(name)} and also ${how}`);
    decided.set(name, how);
  };
  for (const skill of catalogue.skills) for (const was of skill.was ?? []) decide(was, `merged into ${skill.name}`);
  for (const group of catalogue.removed) {
    assert.ok(group.why.length > 20, 'a removal says why');
    for (const name of group.names) decide(name, 'removed');
  }
  // A kept name may not also be merged away or removed.
  for (const skill of catalogue.skills) assert.ok(!decided.has(skill.name), `${skill.name} is kept and ${decided.get(skill.name)}`);
});
