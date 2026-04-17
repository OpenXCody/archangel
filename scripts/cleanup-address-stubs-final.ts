// FINAL aggressive address-stub cleanup. Uses the same regex set that
// the Pillar ECHO connector + Archangel import-pillar-bulk now use to
// reject new rows. Goal: one appearance of "10218 TOLUCA LLC" in a demo
// is worse than losing a real company that happens to start with a house
// number. Bias: aggressive drop.
//
// Usage:
//   npx tsx scripts/cleanup-address-stubs-final.ts            # dry run
//   npx tsx scripts/cleanup-address-stubs-final.ts --execute  # apply

import postgres from 'postgres';
import 'dotenv/config';
import {
  ADDRESS_STUB_PATTERNS_PG,
  EPA_PREFIX_PG,
  DBA_PG,
} from '../shared/addressStubFilter.js';

async function main() {
  const execute = process.argv.includes('--execute');
  const sql = postgres(process.env.DATABASE_URL!);

  // Build a composite WHERE that matches ANY of the stub patterns but
  // excludes EPA prefix / DBA rows.
  const anyStub = ADDRESS_STUB_PATTERNS_PG
    .map((_p, i) => `name ~* $${i + 1}`)
    .join(' OR ');
  const whereClause = `(${anyStub}) AND name !~ $${ADDRESS_STUB_PATTERNS_PG.length + 1} AND name !~* $${ADDRESS_STUB_PATTERNS_PG.length + 2}`;
  const params = [...ADDRESS_STUB_PATTERNS_PG, EPA_PREFIX_PG, DBA_PG];

  const [{ count: beforeF }] = await sql`SELECT COUNT(*)::int FROM factories`;
  const [{ count: beforeC }] = await sql`SELECT COUNT(*)::int FROM companies`;

  // @ts-expect-error postgres.js supports unsafe with params
  const targetsRaw = await sql.unsafe(
    `SELECT COUNT(*)::int FROM factories WHERE ${whereClause}`,
    params,
  );
  const targets = targetsRaw[0].count as number;
  console.log(`Factories matching address-stub patterns: ${targets} / ${beforeF} (${(100*targets/beforeF).toFixed(2)}%)`);

  if (!execute) {
    console.log('\nRandom sample (50):');
    // @ts-expect-error postgres.js supports unsafe with params
    const sample = await sql.unsafe(
      `SELECT name, primary_naics FROM factories WHERE ${whereClause} ORDER BY random() LIMIT 50`,
      params,
    );
    for (const r of sample) console.log(`  [${r.primary_naics ?? '-'}] ${r.name}`);
    console.log('\n(dry run — re-run with --execute to apply.)');
    await sql.end();
    return;
  }

  console.log('\nExecuting deletion...');
  // @ts-expect-error
  const deleted = await sql.unsafe(
    `DELETE FROM factories WHERE ${whereClause} RETURNING id`,
    params,
  );
  console.log(`Deleted ${deleted.length} factories`);

  const orphaned = await sql`
    DELETE FROM companies
    WHERE NOT EXISTS (SELECT 1 FROM factories f WHERE f.company_id = companies.id)
      AND NOT EXISTS (SELECT 1 FROM company_industries ci WHERE ci.company_id = companies.id)
    RETURNING id
  `;
  console.log(`Deleted ${orphaned.count} orphaned companies`);

  // Also clean up companies whose NAME matches the stub pattern (even if
  // they still have some factories — those factories are probably part
  // of the same stub group).
  // @ts-expect-error
  const stubCos = await sql.unsafe(
    `DELETE FROM companies WHERE ${whereClause} RETURNING id`,
    params,
  );
  console.log(`Deleted ${stubCos.length} companies whose names match stub patterns`);

  // Clean orphaned factories (whose company we just deleted).
  const orphanedFactories = await sql`
    DELETE FROM factories WHERE company_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = factories.company_id)
    RETURNING id
  `;
  console.log(`Deleted ${orphanedFactories.count} factories orphaned by company removal`);

  const [{ count: afterF }] = await sql`SELECT COUNT(*)::int FROM factories`;
  const [{ count: afterC }] = await sql`SELECT COUNT(*)::int FROM companies`;
  console.log(`\nFactories: ${beforeF} → ${afterF} (-${beforeF - afterF})`);
  console.log(`Companies: ${beforeC} → ${afterC} (-${beforeC - afterC})`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
