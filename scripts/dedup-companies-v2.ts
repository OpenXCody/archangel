// Extends the existing dedup with normalization for:
//   "Mfg" <-> "Manufacturing"
//   " and " <-> " & "
//   "Incorporated" <-> "Inc"
//   "Corporation" <-> "Corp"
//   "Ind" <-> "Industries"
//   trailing punctuation
//
// For each canonical-key group, picks the row with the highest factory
// count as the keeper and merges the rest into it.

import postgres from 'postgres';
import 'dotenv/config';

function canonical(name: string): string {
  let n = name.trim().toLowerCase();
  // Expand/normalize common abbreviations
  n = n.replace(/\bmanufacturing\b/g, 'mfg');
  n = n.replace(/\bindustries\b/g, 'ind');
  n = n.replace(/\bincorporated\b/g, 'inc');
  n = n.replace(/\bcorporation\b/g, 'corp');
  n = n.replace(/\bcompany\b/g, 'co');
  n = n.replace(/\blimited\b/g, 'ltd');
  n = n.replace(/\band\b/g, '&');
  // Strip trailing corporate suffix
  n = n.replace(/[,]?\s+(inc|llc|ltd|co|corp|lp|plc|ag|gmbh|sa|group|holdings?)\.?\s*$/i, '');
  // Normalize punctuation
  n = n.replace(/[.,&()\-\s]+/g, ' ');
  return n.trim();
}

async function main() {
  const execute = process.argv.includes('--execute');
  const sql = postgres(process.env.DATABASE_URL!);

  const cos = await sql<{ id: string; name: string; fc: number }[]>`
    SELECT id, name, (SELECT COUNT(*)::int FROM factories WHERE company_id = c.id) AS fc
    FROM companies c
  `;

  const groups = new Map<string, { id: string; name: string; fc: number }[]>();
  for (const c of cos) {
    const key = canonical(c.name);
    if (!key || key.length < 3) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const dupGroups = [...groups.values()].filter(g => g.length > 1);
  console.log(`Duplicate groups: ${dupGroups.length}`);

  if (dupGroups.length === 0) { await sql.end(); return; }

  console.log('\nSample of merges:');
  for (const g of dupGroups.slice(0, 15)) {
    const sorted = [...g].sort((a, b) => b.fc - a.fc);
    console.log(`  KEEP: "${sorted[0].name}" (${sorted[0].fc})`);
    for (const d of sorted.slice(1)) console.log(`  DROP: "${d.name}" (${d.fc})`);
  }

  if (!execute) {
    console.log('\n(dry run — re-run with --execute)');
    await sql.end();
    return;
  }

  let merged = 0, factoriesMoved = 0;
  for (const g of dupGroups) {
    const sorted = [...g].sort((a, b) => b.fc - a.fc);
    const keep = sorted[0];
    for (const drop of sorted.slice(1)) {
      const moved = await sql`UPDATE factories SET company_id = ${keep.id} WHERE company_id = ${drop.id}`;
      factoriesMoved += moved.count;
      await sql`UPDATE external_references SET entity_id = ${keep.id} WHERE entity_type = 'companies' AND entity_id = ${drop.id}`;
      await sql`DELETE FROM company_industries WHERE company_id = ${drop.id}`;
      await sql`DELETE FROM companies WHERE id = ${drop.id}`;
      merged++;
    }
  }
  console.log(`\nMerged ${merged} companies, moved ${factoriesMoved} factories`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
