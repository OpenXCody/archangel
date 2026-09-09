#!/usr/bin/env node
/**
 * Fill in missing NAICS codes from EPA ECHO, by FRS registry ID.
 *
 *   node --env-file=.env scripts/enrich-naics.mjs                    # dry run over ALL candidates: prints the plan, writes nothing
 *   node --env-file=.env scripts/enrich-naics.mjs --apply            # writes factories.primary_naics + the review queue
 *   node --env-file=.env scripts/enrich-naics.mjs --source api --limit 40   # per-facility API instead (slow: ECHO throttles hard)
 *
 * Source "bulk" (default) downloads EPA's ECHO Exporter once (~400 MB zip,
 * one row per facility with FAC_NAICS_CODES / FAC_SIC_CODES) to the OS temp
 * dir and joins locally — minutes, no rate limits. Re-runs reuse the file.
 *
 * Outcome per factory:
 *   manufacturing NAICS (31–33) found → primary_naics + description set (verified)
 *   only non-manufacturing NAICS      → primary_naics set, queued in factory_review
 *   no NAICS / not in ECHO            → queued in factory_review
 * Nothing is deleted.
 */
import postgres from 'postgres';
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Papa from 'papaparse';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const SOURCE = arg('--source', 'bulk');
const LIMIT = Number(arg('--limit', '0')) || 0;
const CONCURRENCY = Math.max(1, Math.min(4, Number(arg('--concurrency', '2')) || 2));
const SPACING_MS = Number(arg('--spacing', '350')) || 350;
const BULK_URL = 'https://echo.epa.gov/files/echodownloads/echo_exporter.zip';
const BULK_ZIP = join(tmpdir(), 'echo_exporter.zip');

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, onnotice: () => {} });

// NAICS titles. Our DB labels factories with the 3-digit subsector title
// ("Fabricated Metal Product Manufacturing"); keep that convention.
const SUBSECTOR = {
  311: 'Food Manufacturing', 312: 'Beverage and Tobacco Product Manufacturing', 313: 'Textile Mills', 314: 'Textile Product Mills',
  315: 'Apparel Manufacturing', 316: 'Leather and Allied Product Manufacturing', 321: 'Wood Product Manufacturing', 322: 'Paper Manufacturing',
  323: 'Printing and Related Support Activities', 324: 'Petroleum and Coal Products Manufacturing', 325: 'Chemical Manufacturing',
  326: 'Plastics and Rubber Products Manufacturing', 327: 'Nonmetallic Mineral Product Manufacturing', 331: 'Primary Metal Manufacturing',
  332: 'Fabricated Metal Product Manufacturing', 333: 'Machinery Manufacturing', 334: 'Computer and Electronic Product Manufacturing',
  335: 'Electrical Equipment, Appliance, and Component Manufacturing', 336: 'Transportation Equipment Manufacturing',
  337: 'Furniture and Related Product Manufacturing', 339: 'Miscellaneous Manufacturing',
};
const SECTOR = {
  11: 'Agriculture, Forestry, Fishing and Hunting', 21: 'Mining, Quarrying, and Oil and Gas Extraction', 22: 'Utilities', 23: 'Construction',
  42: 'Wholesale Trade', 44: 'Retail Trade', 45: 'Retail Trade', 48: 'Transportation and Warehousing', 49: 'Transportation and Warehousing',
  51: 'Information', 52: 'Finance and Insurance', 53: 'Real Estate and Rental and Leasing', 54: 'Professional, Scientific, and Technical Services',
  55: 'Management of Companies and Enterprises', 56: 'Administrative and Support and Waste Management and Remediation Services',
  61: 'Educational Services', 62: 'Health Care and Social Assistance', 71: 'Arts, Entertainment, and Recreation',
  72: 'Accommodation and Food Services', 81: 'Other Services (except Public Administration)', 92: 'Public Administration',
};
const isManufacturing = (code) => /^3[123]/.test(code);
const describe = (code) => SUBSECTOR[code.slice(0, 3)] ?? SECTOR[code.slice(0, 2)] ?? 'Unclassified';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const splitCodes = (s) => String(s ?? '').split(/[\s,;]+/).filter((c) => /^\d{2,6}$/.test(c));

// ── source: per-facility API (fallback) ─────────────────────────────────────
async function fetchEcho(registryId, attempt = 0) {
  const url = `https://echodata.epa.gov/echo/echo_rest_services.get_facility_info?output=JSON&p_frs=${encodeURIComponent(registryId)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'archangel-naics-enrichment/1.0' }, signal: AbortSignal.timeout(30_000) });
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      if (attempt < 5) { await sleep(Math.max(retryAfter * 1000, 3000 * 2 ** attempt)); return fetchEcho(registryId, attempt + 1); }
      return { ok: false, error: `HTTP ${res.status} after ${attempt} retries` };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const fac = (await res.json())?.Results?.Facilities?.[0];
    if (!fac) return { ok: true, found: false };
    return { ok: true, found: true, naics: splitCodes(fac.FacNAICSCodes), sic: splitCodes(fac.FacSICCodes), epaName: fac.FacName ?? null };
  } catch (e) {
    if (attempt < 3) { await sleep(1000 * 2 ** attempt); return fetchEcho(registryId, attempt + 1); }
    return { ok: false, error: String(e.message || e) };
  }
}

// ── source: ECHO Exporter bulk file ─────────────────────────────────────────
function ensureBulkFile() {
  if (existsSync(BULK_ZIP) && statSync(BULK_ZIP).size > 100_000_000) { console.log(`bulk: using cached ${BULK_ZIP} (${(statSync(BULK_ZIP).size / 1048576).toFixed(0)} MB)`); return; }
  console.log(`bulk: downloading ${BULK_URL} → ${BULK_ZIP}`);
  const r = spawnSync('curl', ['-L', '--fail', '--progress-bar', '-o', BULK_ZIP, BULK_URL], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('download failed');
}

function bulkCsvName() {
  const list = spawnSync('unzip', ['-Z1', BULK_ZIP], { encoding: 'utf8' });
  const name = list.stdout.split('\n').find((n) => /\.csv$/i.test(n));
  if (!name) throw new Error('no CSV inside the ECHO exporter zip');
  return name;
}

/** Stream the exporter and keep only the registry IDs we care about. */
function loadBulk(wanted) {
  return new Promise((resolve, reject) => {
    const csv = bulkCsvName();
    const found = new Map();
    let rows = 0, cols = null;
    const proc = spawn('unzip', ['-p', BULK_ZIP, csv]);
    Papa.parse(proc.stdout, {
      header: true,
      skipEmptyLines: true,
      step: ({ data }) => {
        if (!cols) {
          cols = Object.keys(data);
          for (const need of ['REGISTRY_ID', 'FAC_NAICS_CODES']) if (!cols.includes(need)) { proc.kill(); reject(new Error(`exporter is missing column ${need}; has: ${cols.slice(0, 20).join(', ')}`)); }
        }
        rows++;
        const id = String(data.REGISTRY_ID ?? '').trim();
        if (wanted.has(id)) found.set(id, { naics: splitCodes(data.FAC_NAICS_CODES), sic: splitCodes(data.FAC_SIC_CODES), epaName: data.FAC_NAME ?? null, lat: data.FAC_LAT, lng: data.FAC_LONG });
        if (rows % 250_000 === 0) console.log(`  … scanned ${rows.toLocaleString()} facilities, matched ${found.size.toLocaleString()}`);
      },
      complete: () => resolve({ found, rows }),
      error: reject,
    });
  });
}

function classify(r) {
  if (!r.ok) return { outcome: 'error', detail: r.error };
  if (!r.found) return { outcome: 'not_in_echo' };
  if (r.naics.length === 0) return { outcome: 'no_naics', sic: r.sic };
  const mfg = r.naics.find(isManufacturing);
  if (mfg) return { outcome: 'manufacturing', primary: mfg, all: r.naics, sic: r.sic };
  return { outcome: 'non_manufacturing', primary: r.naics[0], all: r.naics, sic: r.sic };
}

async function main() {
  if (APPLY) {
    await sql`create table if not exists factory_review (
      factory_id uuid primary key references factories(id) on delete cascade,
      reason text not null, naics text, naics_all text, sic_all text, epa_name text,
      created_at timestamp not null default now(), resolved_at timestamp, resolution text)`;
  }
  const rows = await sql`
    select f.id, f.name, f.state, er.external_id as registry_id
    from factories f
    join external_references er on er.entity_type = 'factories' and er.entity_id = f.id and er.source = 'EPA_ECHO'
    where f.primary_naics is null
    order by f.name`;
  const batch = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · source ${SOURCE} · candidates ${rows.length} · this run ${batch.length}`);

  const tally = { manufacturing: 0, non_manufacturing: 0, no_naics: 0, not_in_echo: 0, error: 0 };
  const samples = { manufacturing: [], non_manufacturing: [], no_naics: [], not_in_echo: [], error: [] };
  const started = Date.now();

  let lookup;
  if (SOURCE === 'bulk') {
    ensureBulkFile();
    const { found, rows: scanned } = await loadBulk(new Set(batch.map((r) => r.registry_id)));
    console.log(`bulk: scanned ${scanned.toLocaleString()} facilities, matched ${found.size.toLocaleString()} of ${batch.length}`);
    lookup = async (id) => { const f = found.get(id); return f ? { ok: true, found: true, ...f } : { ok: true, found: false }; };
  } else {
    lookup = fetchEcho;
  }

  async function handle(r) {
    const result = classify(await lookup(r.registry_id));
    tally[result.outcome]++;
    if (samples[result.outcome].length < 8) samples[result.outcome].push(`${r.state} | ${r.name.slice(0, 34).padEnd(34)} → ${result.primary ?? result.detail ?? '-'} ${result.primary ? describe(result.primary) : ''}`.trim());
    if (APPLY && result.outcome !== 'error') {
      await sql.begin(async (tx) => {
        if (result.primary) await tx`update factories set primary_naics = ${result.primary}, primary_naics_description = ${describe(result.primary)}, updated_at = now() where id = ${r.id}`;
        if (result.outcome !== 'manufacturing') {
          await tx`insert into factory_review (factory_id, reason, naics, naics_all, sic_all)
                   values (${r.id}, ${result.outcome}, ${result.primary ?? null}, ${result.all?.join(' ') ?? null}, ${result.sic?.join(' ') ?? null})
                   on conflict (factory_id) do update set reason = excluded.reason, naics = excluded.naics, naics_all = excluded.naics_all, sic_all = excluded.sic_all`;
        }
      });
    }
    if (SOURCE === 'api') await sleep(SPACING_MS);
  }

  let next = 0, processed = 0;
  const workers = SOURCE === 'bulk' ? 1 : CONCURRENCY;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < batch.length) {
      await handle(batch[next++]);
      if (++processed % 2000 === 0) console.log(`  … ${processed}/${batch.length} ${JSON.stringify(tally)}`);
    }
  }));

  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN — nothing written'} in ${Math.round((Date.now() - started) / 1000)}s`);
  console.log('  outcomes:', tally);
  for (const [k, v] of Object.entries(samples)) if (v.length) { console.log(`  ${k}:`); v.forEach((s) => console.log('     ', s)); }
  writeFileSync(new URL('../enrich-naics-audit.json', import.meta.url), JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', source: SOURCE, tally, samples }, null, 2));
  if (APPLY) {
    const q = await sql`select reason, count(*)::int n from factory_review where resolved_at is null group by reason`;
    console.log('  review queue:', q.map((x) => `${x.reason}=${x.n}`).join(', ') || 'empty');
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => sql.end());
