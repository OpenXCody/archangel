// Cleanup pass after the address-stub + NAICS deletions. Removes:
//   - orphaned external_references (entity deleted, reference kept)
//   - factories with clearly-bogus coordinates (not in or near US)
//   - companies with 0 factories (unless linked by industries — then keep)

import postgres from 'postgres';
import 'dotenv/config';

async function main() {
  const execute = process.argv.includes('--execute');
  const sql = postgres(process.env.DATABASE_URL!);

  // 1. Orphaned external_references.
  const [{ count: orphRefBefore }] = await sql`SELECT COUNT(*)::int FROM external_references`;
  const orphRefToDelete = await sql`
    SELECT COUNT(*)::int FROM external_references er
    WHERE (er.entity_type = 'factories' AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.id = er.entity_id))
       OR (er.entity_type = 'companies' AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = er.entity_id))
  `;
  console.log(`external_references to delete: ${orphRefToDelete[0].count} / ${orphRefBefore}`);

  // 2. Factories with bogus coordinates — definitely not US manufacturing.
  //    Keep Guam (140-145° long, 13-14° lat), Puerto Rico (-67 to -65°, 17-18° lat),
  //    Virgin Islands (-65 to -64°, 17-18° lat), Alaska (60-72° lat), Hawaii
  //    (19-22° lat, -160 to -154°). Everything else is bad.
  const bogus = await sql`
    SELECT name, latitude, longitude, state FROM factories
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      AND NOT (
        -- Continental US + Alaska + Hawaii
        (CAST(latitude AS REAL) BETWEEN 18.5 AND 72 AND CAST(longitude AS REAL) BETWEEN -180 AND -65)
        -- Puerto Rico + VI
        OR (CAST(latitude AS REAL) BETWEEN 17 AND 19 AND CAST(longitude AS REAL) BETWEEN -68 AND -64)
        -- Guam + N Marianas
        OR (CAST(latitude AS REAL) BETWEEN 13 AND 16 AND CAST(longitude AS REAL) BETWEEN 144 AND 146)
        -- American Samoa
        OR (CAST(latitude AS REAL) BETWEEN -15 AND -13 AND CAST(longitude AS REAL) BETWEEN -172 AND -168)
      )
  `;
  console.log(`\nFactories with bogus coords: ${bogus.length}`);
  for (const r of bogus) console.log(`  ${r.name} @ ${r.latitude}, ${r.longitude} (${r.state})`);

  // 3. Orphaned companies.
  const [{ count: orphCos }] = await sql`
    SELECT COUNT(*)::int FROM companies c
    WHERE NOT EXISTS (SELECT 1 FROM factories f WHERE f.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM company_industries ci WHERE ci.company_id = c.id)
  `;
  console.log(`\nOrphaned companies: ${orphCos}`);

  if (!execute) {
    console.log('\n(dry run — re-run with --execute)');
    await sql.end();
    return;
  }

  console.log('\nExecuting...');

  const delRef = await sql`
    DELETE FROM external_references er
    WHERE (er.entity_type = 'factories' AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.id = er.entity_id))
       OR (er.entity_type = 'companies' AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = er.entity_id))
  `;
  console.log(`Deleted ${delRef.count} external_references`);

  const delFact = await sql`
    DELETE FROM factories
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      AND NOT (
        (CAST(latitude AS REAL) BETWEEN 18.5 AND 72 AND CAST(longitude AS REAL) BETWEEN -180 AND -65)
        OR (CAST(latitude AS REAL) BETWEEN 17 AND 19 AND CAST(longitude AS REAL) BETWEEN -68 AND -64)
        OR (CAST(latitude AS REAL) BETWEEN 13 AND 16 AND CAST(longitude AS REAL) BETWEEN 144 AND 146)
        OR (CAST(latitude AS REAL) BETWEEN -15 AND -13 AND CAST(longitude AS REAL) BETWEEN -172 AND -168)
      )
  `;
  console.log(`Deleted ${delFact.count} bogus-coord factories`);

  const delCo = await sql`
    DELETE FROM companies c
    WHERE NOT EXISTS (SELECT 1 FROM factories f WHERE f.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM company_industries ci WHERE ci.company_id = c.id)
  `;
  console.log(`Deleted ${delCo.count} orphaned companies`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
