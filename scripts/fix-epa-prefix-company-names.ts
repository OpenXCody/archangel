// Fix companies whose name is a raw EPA registry id or id-prefix.
// Examples:
//   "105123" (pure numeric) — no recoverable name, orphan
//   "134321 - Boston Gear" — strip prefix → "Boston Gear"
//   "107777 - Brc Rubber & Plastics" → "Brc Rubber & Plastics"
//
// When the stripped name collides with an existing company, merge:
//   - re-link factories, external_references, company_industries to canonical
//   - absorb name + aliases
//   - delete the duplicate
//
// When the stripped name is empty (pure-numeric), try to recover a name from
// the company's factories (which usually have a readable name after
// strip). If no recoverable name, delete the company and its factories.

import postgres from 'postgres';
import 'dotenv/config';

function stripEpaPrefix(name: string): string {
  return name
    .trim()
    // Leading "105123 - " or "#411 - "
    .replace(/^#?\d+\s*[-–]\s*/, '')
    // Trailing " (0145000399)" or similar EPA ID
    .replace(/\s*\(\d{4,}[-\d]*\)\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      const upper = w.toUpperCase();
      if (['LLC', 'INC', 'CO', 'CORP', 'LP', 'LTD', 'USA', 'US'].includes(upper)) return upper;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function looksNumeric(name: string): boolean {
  return /^\d+[\s.,-]*$/.test(name.trim());
}

async function main() {
  const execute = process.argv.includes('--execute');
  const sql = postgres(process.env.DATABASE_URL!);

  // 1. Companies with EPA-prefix or pure-numeric names
  const targets = await sql`
    SELECT id, name FROM companies
    WHERE name ~ '^#?\\d+'
    ORDER BY name
  `;
  console.log(`Companies with digit-prefix names: ${targets.length}`);

  type Action = { from: { id: string; name: string }; to: string; kind: 'rename' | 'merge' | 'delete' | 'deletePureNumeric' };
  const actions: Action[] = [];

  // Lookup of existing canonical names (lowercased)
  const existing = new Map<string, string>(); // lowercase name → company id
  const allCos = await sql`SELECT id, name FROM companies`;
  for (const c of allCos) {
    existing.set(c.name.trim().toLowerCase(), c.id);
  }

  for (const co of targets) {
    const stripped = stripEpaPrefix(co.name);
    if (looksNumeric(co.name) && (!stripped || looksNumeric(stripped))) {
      // Pure numeric — try to recover from factory
      const factories = await sql`SELECT name FROM factories WHERE company_id = ${co.id} LIMIT 5`;
      let recovered: string | null = null;
      for (const f of factories) {
        const n = stripEpaPrefix(f.name);
        if (n && !looksNumeric(n) && n.length > 3) {
          recovered = n;
          break;
        }
      }
      if (recovered) {
        const titled = toTitleCase(recovered);
        const existingId = existing.get(titled.toLowerCase());
        if (existingId && existingId !== co.id) {
          actions.push({ from: co, to: existingId, kind: 'merge' });
        } else {
          actions.push({ from: co, to: titled, kind: 'rename' });
          existing.set(titled.toLowerCase(), co.id);
        }
      } else {
        actions.push({ from: co, to: '', kind: 'deletePureNumeric' });
      }
    } else if (stripped && stripped !== co.name) {
      const titled = toTitleCase(stripped);
      const existingId = existing.get(titled.toLowerCase());
      if (existingId && existingId !== co.id) {
        actions.push({ from: co, to: existingId, kind: 'merge' });
      } else {
        actions.push({ from: co, to: titled, kind: 'rename' });
        existing.set(titled.toLowerCase(), co.id);
      }
    }
  }

  const byKind = {
    rename: actions.filter(a => a.kind === 'rename').length,
    merge: actions.filter(a => a.kind === 'merge').length,
    deletePureNumeric: actions.filter(a => a.kind === 'deletePureNumeric').length,
  };
  console.log(`Actions: rename=${byKind.rename}, merge=${byKind.merge}, deletePureNumeric=${byKind.deletePureNumeric}`);

  console.log('\nSample renames:');
  for (const a of actions.filter(a => a.kind === 'rename').slice(0, 10)) {
    console.log(`  "${a.from.name}" → "${a.to}"`);
  }
  console.log('\nSample merges:');
  for (const a of actions.filter(a => a.kind === 'merge').slice(0, 10)) {
    console.log(`  "${a.from.name}" → id ${a.to}`);
  }
  console.log('\nSample pure-numeric deletions:');
  for (const a of actions.filter(a => a.kind === 'deletePureNumeric').slice(0, 10)) {
    console.log(`  "${a.from.name}" (no factory-name recovery)`);
  }

  if (!execute) {
    console.log('\n(dry run — re-run with --execute)');
    await sql.end();
    return;
  }

  console.log('\nExecuting...');
  let renamed = 0, merged = 0, deleted = 0, factoriesMoved = 0;
  for (const a of actions) {
    if (a.kind === 'rename') {
      await sql`UPDATE companies SET name = ${a.to} WHERE id = ${a.from.id}`;
      renamed++;
    } else if (a.kind === 'merge') {
      // Move factories and external refs, then delete the duplicate
      const moved = await sql`UPDATE factories SET company_id = ${a.to} WHERE company_id = ${a.from.id}`;
      factoriesMoved += moved.count;
      await sql`UPDATE external_references SET entity_id = ${a.to} WHERE entity_type = 'companies' AND entity_id = ${a.from.id}`;
      await sql`DELETE FROM company_industries WHERE company_id = ${a.from.id}`;
      await sql`DELETE FROM companies WHERE id = ${a.from.id}`;
      merged++;
    } else if (a.kind === 'deletePureNumeric') {
      const delF = await sql`DELETE FROM factories WHERE company_id = ${a.from.id}`;
      factoriesMoved += delF.count;
      await sql`DELETE FROM external_references WHERE entity_type = 'companies' AND entity_id = ${a.from.id}`;
      await sql`DELETE FROM company_industries WHERE company_id = ${a.from.id}`;
      await sql`DELETE FROM companies WHERE id = ${a.from.id}`;
      deleted++;
    }
  }
  console.log(`renamed=${renamed}, merged=${merged}, companies deleted=${deleted}, factories moved or deleted=${factoriesMoved}`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
