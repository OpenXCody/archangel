/**
 * Batched import from Pillar → Archangel.
 *
 * Unlike the per-state `import-pillar-tx.ts` helper, this script:
 *  - Pulls across all states in one go (no state filter).
 *  - Uses bulk INSERTs (~1k rows per SQL roundtrip) so 50k imports in
 *    ~60s instead of ~60 minutes.
 *  - Dedupes companies (via normalized name + alias match) and factories
 *    (via EPA registry id in external_references) before insert.
 *  - Orders by (confidence DESC, source_count DESC) so the highest-quality
 *    matches land first when LIMIT caps the import.
 *
 * Env:
 *   DATABASE_URL           — Archangel (destination)
 *   PILLAR_DATABASE_URL    — Pillar (source)
 *   IMPORT_LIMIT           — max rows to pull (default 50000)
 *   IMPORT_MIN_CONFIDENCE  — default 60
 *
 * Usage:
 *   export PILLAR_DATABASE_URL=$(grep '^DATABASE_URL' ../pillar/.env | cut -d= -f2-)
 *   set -a && source .env && set +a
 *   npx tsx server/scripts/import-pillar-bulk.ts
 */
import crypto from 'node:crypto';
import postgres from 'postgres';
import { normalizeCompanyName } from '../../shared/companyNormalization.js';
import { isAddressStub } from '../../shared/addressStubFilter.js';

const archUrl = process.env.DATABASE_URL;
const pillarUrl = process.env.PILLAR_DATABASE_URL;
if (!archUrl) throw new Error('DATABASE_URL (Archangel) is not set');
if (!pillarUrl) throw new Error('PILLAR_DATABASE_URL is not set');

const LIMIT = Number(process.env.IMPORT_LIMIT ?? 50000);
const MIN_CONFIDENCE = Number(process.env.IMPORT_MIN_CONFIDENCE ?? 60);
const INSERT_BATCH = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const arch = postgres(archUrl!, { max: 5 });
  const pillar = postgres(pillarUrl!, { max: 5 });

  console.log(`\nBulk import: up to ${LIMIT.toLocaleString()} factories, confidence >= ${MIN_CONFIDENCE}\n`);

  // ─── 1. Pull Pillar rows ─────────────────────────────────────────────
  console.log('Pulling from Pillar…');
  const t0 = Date.now();
  const pillarRows = await pillar<any[]>`
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
    WHERE f.company_name IS NOT NULL
      AND f.company_name <> ''
      AND f.latitude IS NOT NULL
      AND f.longitude IS NOT NULL
      AND f.confidence >= ${MIN_CONFIDENCE}
    ORDER BY f.confidence DESC, f.source_count DESC, f.name ASC
    LIMIT ${LIMIT}
  `;
  console.log(`  ${pillarRows.length.toLocaleString()} rows fetched in ${Date.now() - t0}ms`);

  if (pillarRows.length === 0) {
    await pillar.end();
    await arch.end();
    return;
  }

  // ─── 2. Preload Archangel reference data ─────────────────────────────
  console.log('Loading Archangel reference data…');
  const stateIdByCode = new Map<string, string>();
  const states = await arch<{ id: string; code: string }[]>`SELECT id, code FROM states`;
  for (const s of states) stateIdByCode.set(s.code.toUpperCase(), s.id);

  // All existing EPA registry ids (skip factories we've already imported)
  const existingEpa = new Set<string>();
  const epaRefs = await arch<{ external_id: string }[]>`
    SELECT external_id FROM external_references
    WHERE entity_type = 'factories' AND source = 'EPA_ECHO'
  `;
  for (const r of epaRefs) existingEpa.add(r.external_id);

  // Existing company name → id (for normalized lookup)
  const companyIdByName = new Map<string, string>();
  const companyRows = await arch<{ id: string; name: string; aliases: string[] | null }[]>`
    SELECT id, name, aliases FROM companies
  `;
  for (const c of companyRows) {
    companyIdByName.set(c.name.toLowerCase().trim(), c.id);
    if (c.aliases) for (const a of c.aliases) companyIdByName.set(a.toLowerCase().trim(), c.id);
  }
  console.log(`  states: ${stateIdByCode.size}, existing EPA refs: ${existingEpa.size.toLocaleString()}, existing companies: ${companyRows.length.toLocaleString()}`);

  // ─── 3. Normalize names + group rows by canonical company ────────────
  type EnrichedRow = (typeof pillarRows)[number] & { __canonical: string };
  const enriched: EnrichedRow[] = [];
  let skippedBlockedName = 0;
  let skippedEpaDup = 0;
  let skippedAddressStub = 0;
  for (const r of pillarRows) {
    // Reject address-stub / property-owner LLC rows. Pattern match on
    // both facility and company name — either being a stub is enough.
    if (isAddressStub(r.name) || isAddressStub(r.company_name)) {
      skippedAddressStub++;
      continue;
    }
    const canonical = normalizeCompanyName(r.company_name) ?? r.company_name;
    if (!canonical) { skippedBlockedName++; continue; }
    if (r.epa_registry_id && existingEpa.has(r.epa_registry_id)) { skippedEpaDup++; continue; }
    enriched.push({ ...r, __canonical: canonical });
  }
  console.log(`  after dedup: ${enriched.length.toLocaleString()} rows (${skippedEpaDup.toLocaleString()} EPA dups, ${skippedBlockedName} blocked names, ${skippedAddressStub.toLocaleString()} address stubs)`);

  // ─── 4. Insert missing companies in bulk ─────────────────────────────
  const canonicalNeeded = new Set<string>();
  for (const r of enriched) canonicalNeeded.add(r.__canonical);

  const newCompanies: { name: string; industry: string; aliases: string[] }[] = [];
  const canonicalToInsert: string[] = [];
  for (const name of canonicalNeeded) {
    if (companyIdByName.has(name.toLowerCase().trim())) continue;
    newCompanies.push({ name, industry: 'Manufacturing', aliases: [] });
    canonicalToInsert.push(name);
  }
  if (newCompanies.length > 0) {
    console.log(`Creating ${newCompanies.length.toLocaleString()} new companies…`);
    const t1 = Date.now();
    let companiesCreated = 0;
    for (const batch of chunk(newCompanies, INSERT_BATCH)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created: any = await arch`
        INSERT INTO companies ${arch(batch as any, 'name', 'industry', 'aliases')}
        RETURNING id, name
      `;
      for (const c of created) companyIdByName.set(c.name.toLowerCase().trim(), c.id);
      companiesCreated += created.length;
      process.stdout.write(`  ${companiesCreated.toLocaleString()}/${newCompanies.length.toLocaleString()}\r`);
    }
    console.log(`\n  ${companiesCreated.toLocaleString()} companies created in ${Date.now() - t1}ms`);
  }

  // ─── 5. Build factory rows + pending EPA refs ────────────────────────
  console.log('Building factory insert set…');
  type FactoryRow = {
    id: string;
    company_id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    state_id: string | null;
    zip_code: string | null;
    latitude: string;
    longitude: string;
    primary_naics: string | null;
    primary_naics_description: string | null;
    workforce_size: number | null;
    source_count: number;
    confidence: number;
  };
  const factoryRows: FactoryRow[] = [];
  const pendingEpa: { factoryId: string; epa: string }[] = [];
  let skippedMissingCompany = 0;
  for (const r of enriched) {
    const companyId = companyIdByName.get(r.__canonical.toLowerCase().trim());
    if (!companyId) { skippedMissingCompany++; continue; }
    const id = crypto.randomUUID();
    factoryRows.push({
      id,
      company_id: companyId,
      name: r.name,
      address: r.address ?? null,
      city: r.city ?? null,
      state: r.state ?? null,
      state_id: r.state ? stateIdByCode.get(String(r.state).toUpperCase()) ?? null : null,
      zip_code: r.zip ?? null,
      latitude: String(r.latitude),
      longitude: String(r.longitude),
      primary_naics: r.primary_naics ?? null,
      primary_naics_description: r.primary_naics_description ?? null,
      workforce_size: r.employee_count ?? null,
      source_count: r.source_count ?? 1,
      confidence: r.confidence ?? 50,
    });
    if (r.epa_registry_id) pendingEpa.push({ factoryId: id, epa: r.epa_registry_id });
  }
  console.log(`  ${factoryRows.length.toLocaleString()} factory rows, ${pendingEpa.length.toLocaleString()} pending EPA refs`);

  // ─── 6. Bulk insert factories ────────────────────────────────────────
  console.log('Inserting factories…');
  const t2 = Date.now();
  let factoriesCreated = 0;
  for (const batch of chunk(factoryRows, INSERT_BATCH)) {
    await arch`INSERT INTO factories ${arch(
      batch as any,
      'id', 'company_id', 'name', 'address', 'city', 'state', 'state_id',
      'zip_code', 'latitude', 'longitude', 'primary_naics',
      'primary_naics_description', 'workforce_size', 'source_count', 'confidence',
    )}`;
    factoriesCreated += batch.length;
    process.stdout.write(`  ${factoriesCreated.toLocaleString()}/${factoryRows.length.toLocaleString()}\r`);
  }
  console.log(`\n  ${factoriesCreated.toLocaleString()} factories inserted in ${Date.now() - t2}ms`);

  // ─── 7. Bulk insert external references ──────────────────────────────
  if (pendingEpa.length > 0) {
    console.log('Inserting EPA external references…');
    const t3 = Date.now();
    const refRows = pendingEpa.map(p => ({
      entity_type: 'factories',
      entity_id: p.factoryId,
      source: 'EPA_ECHO',
      external_id: p.epa,
    }));
    let refsCreated = 0;
    for (const batch of chunk(refRows, INSERT_BATCH)) {
      await arch`INSERT INTO external_references ${arch(batch as any, 'entity_type', 'entity_id', 'source', 'external_id')}`;
      refsCreated += batch.length;
    }
    console.log(`  ${refsCreated.toLocaleString()} external refs inserted in ${Date.now() - t3}ms`);
  }

  // ─── 8. Summary ──────────────────────────────────────────────────────
  const total = await arch<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM factories`;
  console.log(`\nDone. Archangel now has ${total[0].n.toLocaleString()} factories.`);
  console.log(`Total runtime: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await pillar.end();
  await arch.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
