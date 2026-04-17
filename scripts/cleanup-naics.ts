// Pass 1 cleanup: drop factories whose primary_naics sector is clearly
// not manufacturing. Manufacturing is NAICS 31–33. We preserve NULL NAICS
// for a later pass (name-keyword-based), and keep all 31/32/33 rows.
//
// Usage:
//   npx tsx scripts/cleanup-naics.ts            # dry run — counts + sample
//   npx tsx scripts/cleanup-naics.ts --execute  # actually delete

import postgres from 'postgres';
import 'dotenv/config';

const KEEP_SECTORS = new Set(['31', '32', '33']);

async function main() {
  const execute = process.argv.includes('--execute');
  const sql = postgres(process.env.DATABASE_URL!);

  const [{ count: totalBefore }] = await sql`SELECT COUNT(*)::int FROM factories`;
  const [{ count: companiesBefore }] = await sql`SELECT COUNT(*)::int FROM companies`;

  const bySector = await sql`
    SELECT
      LEFT(primary_naics, 2) AS sector,
      COUNT(*)::int AS factories
    FROM factories
    WHERE primary_naics IS NOT NULL
      AND LEFT(primary_naics, 2) NOT IN ('31', '32', '33')
    GROUP BY sector
    ORDER BY factories DESC
  `;

  console.log('Non-manufacturing sectors targeted for deletion:');
  console.table(bySector);
  const totalToDrop = bySector.reduce((s, r) => s + r.factories, 0);
  console.log(`Total factories to delete: ${totalToDrop} / ${totalBefore} (${(100*totalToDrop/totalBefore).toFixed(1)}%)`);

  console.log('\nSample (30) of factory names that would be deleted:');
  const sample = await sql`
    SELECT
      f.name,
      f.primary_naics,
      f.primary_naics_description,
      f.state,
      c.name AS company
    FROM factories f
    LEFT JOIN companies c ON c.id = f.company_id
    WHERE f.primary_naics IS NOT NULL
      AND LEFT(f.primary_naics, 2) NOT IN ('31', '32', '33')
    ORDER BY random()
    LIMIT 30
  `;
  for (const r of sample) {
    console.log(`  [${r.primary_naics}] ${r.name} (${r.state}) — ${r.primary_naics_description ?? '—'} | parent: ${r.company}`);
  }

  if (!execute) {
    console.log('\n(dry run — no changes made. Re-run with --execute to apply.)');
    await sql.end();
    return;
  }

  console.log('\nExecuting deletion...');
  const deleted = await sql`
    DELETE FROM factories
    WHERE primary_naics IS NOT NULL
      AND LEFT(primary_naics, 2) NOT IN ('31', '32', '33')
    RETURNING id
  `;
  console.log(`Deleted ${deleted.count} factories`);

  // Orphaned companies: no factories, no industries → safe to delete
  const orphanedCompanies = await sql`
    DELETE FROM companies
    WHERE NOT EXISTS (SELECT 1 FROM factories f WHERE f.company_id = companies.id)
      AND NOT EXISTS (SELECT 1 FROM company_industries ci WHERE ci.company_id = companies.id)
    RETURNING id
  `;
  console.log(`Deleted ${orphanedCompanies.count} orphaned companies`);

  const [{ count: totalAfter }] = await sql`SELECT COUNT(*)::int FROM factories`;
  const [{ count: companiesAfter }] = await sql`SELECT COUNT(*)::int FROM companies`;
  console.log(`\nFactories: ${totalBefore} → ${totalAfter}`);
  console.log(`Companies: ${companiesBefore} → ${companiesAfter}`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
