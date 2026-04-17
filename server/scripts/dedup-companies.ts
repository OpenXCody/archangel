/**
 * One-shot dedup: merges companies whose canonical names collide.
 * Canonical = lowercase, stripped of common corporate suffixes and punctuation.
 *
 * For each group, picks the row with the highest factory count as canonical.
 * Ties broken by richer metadata (description + non-default industry).
 *
 * Moves to canonical:
 *   - factories.company_id
 *   - external_references rows pointing at the dup
 *   - company_industries junction rows
 * Merges duplicate's `name` and existing `aliases` into canonical's `aliases[]`.
 * Deletes the duplicate company row.
 *
 * Run: set -a && source .env && set +a && npx tsx server/scripts/dedup-companies.ts [--dry]
 */
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

const DRY = process.argv.includes('--dry');

async function main() {
  const groups: any = await db.execute(sql.raw(`
    WITH normalized AS (
      SELECT
        id,
        name,
        industry,
        description,
        aliases,
        (SELECT COUNT(*)::int FROM factories f WHERE f.company_id = c.id) AS factory_count,
        trim(
          regexp_replace(
            regexp_replace(
              lower(name),
              '\\s+(inc|incorporated|llc|ltd|co|corp|corporation|company|plc|ag|gmbh|sa|limited|group|holdings|holding)\\.?$',
              ''
            ),
            '[.,&()\\s-]+', ' ', 'g'
          )
        ) AS canonical
      FROM companies c
    )
    SELECT
      canonical,
      array_agg(json_build_object(
        'id', id, 'name', name, 'industry', industry,
        'description', description, 'aliases', aliases, 'factoryCount', factory_count
      ) ORDER BY factory_count DESC, (description IS NOT NULL)::int DESC, (industry <> 'Manufacturing')::int DESC, name ASC) AS members
    FROM normalized
    GROUP BY canonical
    HAVING COUNT(*) > 1
    ORDER BY canonical
  `));

  console.log(`\n${groups.length} duplicate groups found. ${DRY ? '[DRY RUN]' : '[APPLYING]'}\n`);

  let mergedCount = 0;
  let factoriesMoved = 0;
  let refsMoved = 0;
  let industriesMoved = 0;

  for (const g of groups) {
    const members = g.members as any[];
    const canonical = members[0];
    const dups = members.slice(1);
    console.log(`\n[${g.canonical}]`);
    console.log(`  KEEP:  ${canonical.name} (${canonical.factoryCount} factories)`);
    for (const d of dups) {
      console.log(`  MERGE: ${d.name} (${d.factoryCount} factories) -> ${canonical.name}`);
    }

    if (DRY) continue;

    for (const d of dups) {
      // Move factories
      const moved = await db.execute(sql.raw(
        `UPDATE factories SET company_id = '${canonical.id}' WHERE company_id = '${d.id}' RETURNING id`
      ));
      factoriesMoved += Array.isArray(moved) ? moved.length : 0;

      // Move external_references
      const refs = await db.execute(sql.raw(
        `UPDATE external_references SET entity_id = '${canonical.id}'
         WHERE entity_type = 'companies' AND entity_id = '${d.id}' RETURNING id`
      ));
      refsMoved += Array.isArray(refs) ? refs.length : 0;

      // Move company_industries (avoid PK collision)
      const inds = await db.execute(sql.raw(
        `INSERT INTO company_industries (company_id, industry_id)
         SELECT '${canonical.id}', industry_id FROM company_industries WHERE company_id = '${d.id}'
         ON CONFLICT DO NOTHING RETURNING company_id`
      ));
      industriesMoved += Array.isArray(inds) ? inds.length : 0;
      await db.execute(sql.raw(`DELETE FROM company_industries WHERE company_id = '${d.id}'`));

      // Merge aliases
      const newAliases = Array.from(new Set([
        ...(canonical.aliases ?? []),
        d.name,
        ...(d.aliases ?? []),
      ].filter((s: string) => s && s !== canonical.name)));
      await db.execute(sql.raw(
        `UPDATE companies SET aliases = ARRAY[${newAliases.map((a: string) => `'${a.replace(/'/g, "''")}'`).join(',')}]::text[], updated_at = NOW()
         WHERE id = '${canonical.id}'`
      ));

      // Delete the duplicate
      await db.execute(sql.raw(`DELETE FROM companies WHERE id = '${d.id}'`));
      mergedCount++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  Companies merged:    ${mergedCount}`);
  console.log(`  Factories moved:     ${factoriesMoved}`);
  console.log(`  External refs moved: ${refsMoved}`);
  console.log(`  Industries moved:    ${industriesMoved}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
