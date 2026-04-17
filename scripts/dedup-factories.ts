// Dedup factories that have EXACT duplicate (name + lat + lng).
// Keeps one (earliest createdAt) per group, deletes the rest.

import postgres from 'postgres';
import 'dotenv/config';

async function main() {
  const execute = process.argv.includes('--execute');
  const sql = postgres(process.env.DATABASE_URL!);

  const groups = await sql`
    SELECT name, latitude, longitude, ARRAY_AGG(id ORDER BY created_at ASC) as ids
    FROM factories
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    GROUP BY name, latitude, longitude
    HAVING COUNT(*) > 1
  `;
  const allDeleteIds: string[] = [];
  for (const g of groups) {
    const ids = g.ids as string[];
    const [keep, ...drop] = ids;
    allDeleteIds.push(...drop);
  }
  console.log(`Duplicate groups: ${groups.length}`);
  console.log(`Factories to delete: ${allDeleteIds.length}`);

  if (!execute) {
    console.log('(dry run — re-run with --execute)');
    await sql.end();
    return;
  }

  if (allDeleteIds.length > 0) {
    const del = await sql`DELETE FROM factories WHERE id = ANY(${allDeleteIds})`;
    console.log(`Deleted ${del.count} duplicate factories`);
  }

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
