/**
 * One-shot import: pulls Texas golden records from Pillar's DB and inserts
 * them as factories into Archangel's DB.
 *
 * Requires both env vars:
 *   DATABASE_URL          — Archangel DB (destination)
 *   PILLAR_DATABASE_URL   — Pillar DB (source)
 *
 * Run:
 *   export PILLAR_DATABASE_URL=$(grep '^DATABASE_URL' ../pillar/.env | cut -d= -f2-)
 *   set -a && source .env && set +a
 *   npx tsx server/scripts/import-pillar-tx.ts
 */
import postgres from 'postgres';
import { normalizeCompanyName } from '../../shared/companyNormalization.js';

const archUrl = process.env.DATABASE_URL;
const pillarUrl = process.env.PILLAR_DATABASE_URL;

if (!archUrl) throw new Error('DATABASE_URL (Archangel) is not set');
if (!pillarUrl) throw new Error('PILLAR_DATABASE_URL is not set');

const LIMIT = Number(process.env.IMPORT_LIMIT ?? 500);
const STATE = process.env.IMPORT_STATE ?? 'TX';
const MIN_CONFIDENCE = Number(process.env.IMPORT_MIN_CONFIDENCE ?? 70);

async function main() {
  const arch = postgres(archUrl!, { max: 5 });
  const pillar = postgres(pillarUrl!, { max: 5 });

  console.log(`\nImporting up to ${LIMIT} ${STATE} factories (confidence >= ${MIN_CONFIDENCE}) from Pillar → Archangel\n`);

  // Pull golden records from Pillar
  const pillarRows = await pillar`
    SELECT
      f.name,
      f.company_name,
      f.address,
      f.city,
      f.state,
      f.zip,
      f.latitude,
      f.longitude,
      f.primary_naics,
      f.primary_naics_description,
      f.employee_count,
      f.source_count,
      f.confidence,
      f.epa_registry_id
    FROM facilities f
    WHERE f.state = ${STATE}
      AND f.company_name IS NOT NULL
      AND f.company_name <> ''
      AND f.latitude IS NOT NULL
      AND f.longitude IS NOT NULL
      AND f.confidence >= ${MIN_CONFIDENCE}
    ORDER BY f.confidence DESC, f.source_count DESC, f.name ASC
    LIMIT ${LIMIT}
  `;
  console.log(`Fetched ${pillarRows.length} rows from Pillar.`);
  if (pillarRows.length === 0) {
    await pillar.end();
    await arch.end();
    return;
  }

  // Resolve Archangel state FK for the target state
  const stateRow = await arch`SELECT id FROM states WHERE code = ${STATE} LIMIT 1`;
  const stateId = stateRow[0]?.id ?? null;

  // Pre-load existing EPA refs to skip duplicates across re-runs
  const existingEpa = await arch`
    SELECT external_id FROM external_references
    WHERE entity_type = 'factories' AND source = 'EPA_ECHO'
  `;
  const epaSet = new Set(existingEpa.map((r: any) => r.external_id as string));

  // Simple in-memory company cache (lookup by lowercased name)
  const companyCache = new Map<string, string>();

  let companiesCreated = 0;
  let factoriesCreated = 0;
  let extRefsCreated = 0;
  let skippedDup = 0;
  let skippedErr = 0;

  for (const r of pillarRows as any[]) {
    try {
      // Dedup on EPA registry
      if (r.epa_registry_id && epaSet.has(r.epa_registry_id)) {
        skippedDup++;
        continue;
      }

      // Find or create company — normalize first to collapse "3M" and "3M Company" etc.
      const normalized = normalizeCompanyName(r.company_name) ?? r.company_name;
      const cacheKey = normalized.toLowerCase().trim();
      let companyId = companyCache.get(cacheKey);
      if (!companyId) {
        // Lookup: match canonical name OR any existing alias
        const existing = await arch`
          SELECT id FROM companies
          WHERE LOWER(name) = ${cacheKey}
             OR EXISTS (SELECT 1 FROM unnest(COALESCE(aliases, ARRAY[]::text[])) AS a WHERE LOWER(a) = ${cacheKey})
          LIMIT 1
        `;
        if (existing.length > 0) {
          companyId = existing[0].id as string;
          // If the raw Pillar name differs from canonical, record it as an alias
          if (r.company_name !== normalized) {
            await arch`
              UPDATE companies
              SET aliases = (
                SELECT array_agg(DISTINCT a)
                FROM unnest(COALESCE(aliases, ARRAY[]::text[]) || ARRAY[${r.company_name}]) AS a
                WHERE a IS NOT NULL AND a <> name
              )
              WHERE id = ${companyId}
            `;
          }
        } else {
          const aliases = r.company_name !== normalized ? [r.company_name] : [];
          const [inserted] = await arch`
            INSERT INTO companies (name, industry, aliases)
            VALUES (${normalized}, 'Manufacturing', ${aliases}::text[])
            RETURNING id
          `;
          companyId = inserted.id as string;
          companiesCreated++;
        }
        companyCache.set(cacheKey, companyId!);
      }

      // Insert factory
      const [factory] = await arch`
        INSERT INTO factories (
          company_id, name, latitude, longitude,
          address, city, state, state_id, zip_code,
          workforce_size,
          primary_naics, primary_naics_description,
          source_count, confidence
        ) VALUES (
          ${companyId}, ${r.name}, ${r.latitude}, ${r.longitude},
          ${r.address ?? null}, ${r.city ?? null}, ${r.state ?? null}, ${stateId}, ${r.zip ?? null},
          ${r.employee_count ?? null},
          ${r.primary_naics ?? null}, ${r.primary_naics_description ?? null},
          ${r.source_count ?? 1}, ${r.confidence ?? 50}
        )
        RETURNING id
      `;
      factoriesCreated++;

      // External reference for EPA registry ID
      if (r.epa_registry_id) {
        await arch`
          INSERT INTO external_references (entity_type, entity_id, source, external_id)
          VALUES ('factories', ${factory.id}, 'EPA_ECHO', ${r.epa_registry_id})
        `;
        epaSet.add(r.epa_registry_id);
        extRefsCreated++;
      }
    } catch (err) {
      skippedErr++;
      if (skippedErr <= 3) console.error('  Error on row:', r.name, '-', (err as Error).message);
    }
  }

  console.log(`\nResult:`);
  console.log(`  Factories created:      ${factoriesCreated}`);
  console.log(`  Companies created:      ${companiesCreated}`);
  console.log(`  External refs created:  ${extRefsCreated}`);
  console.log(`  Skipped (duplicates):   ${skippedDup}`);
  console.log(`  Skipped (errors):       ${skippedErr}`);

  // Spot-check: count factories in TX
  const totalTx = await arch`SELECT COUNT(*)::int AS n FROM factories WHERE state = ${STATE}`;
  console.log(`\nTotal factories in state ${STATE} in Archangel: ${totalTx[0].n}`);

  await pillar.end();
  await arch.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
