#!/usr/bin/env node
/**
 * Repair the 2026-09-08 geography cleanup.
 *
 *   node --env-file=.env scripts/geo-cleanup-repair.mjs            # dry run: prints the plan, changes nothing
 *   node --env-file=.env scripts/geo-cleanup-repair.mjs --apply    # applies it in transactions
 *
 * What it does
 *  A. Decode quarantine rows that were stored as JSON strings instead of objects.
 *  B. Restore the two Guam plants with their real (positive) longitude.
 *  C. Restore quarantined sites that sit within 10 km of the state they claim —
 *     coastal islands/peninsulas the simplified state outline misses. Anything
 *     further stays quarantined as a bad geocode.
 *  D. For factories relabelled by polygon lookup, trust the address instead:
 *     derive the state from the zip code and revert to it. Only when the pin is
 *     more than 10 km from the address state is the row quarantined
 *     (coordinates wrong, not the label).
 *
 * Everything removed lives in factories_quarantine (row + external refs +
 * occupation links) and can be restored with restoreRow().
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, onnotice: () => {} });
const audit = { mode: APPLY ? 'apply' : 'dry-run', decoded: 0, guam: [], coastalRestored: [], keptQuarantined: [], reverted: [], kept: [], quarantined: [] };

const gj = JSON.parse(readFileSync(new URL('../client/public/data/us-states.geojson', import.meta.url), 'utf8'));
const NAME_TO_CODE = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC', 'Puerto Rico': 'PR' };

// USPS ZIP3 → state
const ZIP3 = [];
const z = (a, b, s) => ZIP3.push([a, b, s]);
z(5, 5, 'NY'); z(6, 9, 'PR'); z(10, 27, 'MA'); z(28, 29, 'RI'); z(30, 38, 'NH'); z(39, 49, 'ME'); z(50, 59, 'VT'); z(60, 69, 'CT'); z(70, 89, 'NJ'); z(100, 149, 'NY'); z(150, 196, 'PA'); z(197, 199, 'DE'); z(200, 200, 'DC'); z(201, 201, 'VA'); z(202, 205, 'DC'); z(206, 219, 'MD'); z(220, 246, 'VA'); z(247, 268, 'WV'); z(270, 289, 'NC'); z(290, 299, 'SC'); z(300, 319, 'GA'); z(320, 349, 'FL'); z(350, 369, 'AL'); z(370, 385, 'TN'); z(386, 397, 'MS'); z(398, 399, 'GA'); z(400, 427, 'KY'); z(430, 459, 'OH'); z(460, 479, 'IN'); z(480, 499, 'MI'); z(500, 528, 'IA'); z(530, 549, 'WI'); z(550, 567, 'MN'); z(570, 577, 'SD'); z(580, 588, 'ND'); z(590, 599, 'MT'); z(600, 629, 'IL'); z(630, 658, 'MO'); z(660, 679, 'KS'); z(680, 693, 'NE'); z(700, 714, 'LA'); z(716, 729, 'AR'); z(730, 749, 'OK'); z(750, 799, 'TX'); z(800, 816, 'CO'); z(820, 831, 'WY'); z(832, 838, 'ID'); z(840, 847, 'UT'); z(850, 865, 'AZ'); z(870, 884, 'NM'); z(885, 885, 'TX'); z(889, 898, 'NV'); z(900, 961, 'CA'); z(967, 968, 'HI'); z(969, 969, 'GU'); z(970, 979, 'OR'); z(980, 994, 'WA'); z(995, 999, 'AK');
const zipState = (zip) => { const n = parseInt(String(zip).slice(0, 3), 10); return ZIP3.find(([a, b]) => n >= a && n <= b)?.[2] ?? null; };

const COASTAL_KM = 10;

async function main() {
  await sql`drop table if exists st`;
  await sql`create temp table st (code text, geom geometry)`;
  for (const f of gj.features) {
    const code = NAME_TO_CODE[f.properties.name];
    if (code) await sql`insert into st values (${code}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(f.geometry)}), 4326))`;
  }
  const stateId = Object.fromEntries((await sql`select id, code from states`).map((s) => [s.code, s.id]));
  const kmToState = async (lng, lat, code) => {
    const [d] = await sql`select round((ST_Distance(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, (select geom from st where code = ${code})::geography) / 1000)::numeric, 1) km`;
    return d?.km == null ? null : Number(d.km);
  };
  const restoreRow = async (tx, r) => {
    const cols = Object.keys(r);
    await tx.unsafe(`insert into factories (${cols.map((c) => `"${c}"`).join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) on conflict (id) do nothing`, cols.map((c) => r[c]));
  };
  const run = APPLY ? (fn) => sql.begin(fn) : (fn) => fn({ ...sql, unsafe: async () => {}, begin: undefined }); // dry run: writes are no-ops

  // A. decode
  const encoded = await sql`select count(*)::int n from factories_quarantine where jsonb_typeof(row) = 'string'`;
  audit.decoded = encoded[0].n;
  if (APPLY && audit.decoded) await sql`update factories_quarantine set row = (row #>> '{}')::jsonb, external_refs = (external_refs #>> '{}')::jsonb, occupation_links = (occupation_links #>> '{}')::jsonb where jsonb_typeof(row) = 'string'`;
  const decodeRow = (r) => (typeof r === 'string' ? JSON.parse(r) : r);
  console.log(`A. quarantine rows to decode: ${audit.decoded}`);

  // B. Guam
  const q = (await sql`select id, row from factories_quarantine`).map((x) => ({ id: x.id, row: decodeRow(x.row) }));
  const guam = q.filter((x) => x.row.state === 'GU');
  await run(async (tx) => {
    for (const g of guam) {
      g.row.longitude = String(Math.abs(parseFloat(g.row.longitude)));
      if (APPLY) { await restoreRow(tx, g.row); await tx`delete from factories_quarantine where id = ${g.id}`; }
      audit.guam.push({ name: g.row.name, longitude: g.row.longitude });
    }
  });
  console.log(`B. Guam restored: ${guam.length} ${guam.map((g) => `${g.row.name} @ +${Number(g.row.longitude).toFixed(2)}`).join('; ')}`);

  // C. coastal
  await run(async (tx) => {
    for (const item of q.filter((x) => x.row.state !== 'GU')) {
      const r = item.row;
      const km = await kmToState(parseFloat(r.longitude), parseFloat(r.latitude), r.state);
      // Territories (VI, AS, MP …) have no polygon in the states file — like Guam, they are real, not errors.
      const isTerritory = km === null && /^(VI|AS|MP|GU)$/.test(r.state || '');
      if (isTerritory || (km !== null && km <= COASTAL_KM)) {
        if (APPLY) { await restoreRow(tx, r); await tx`delete from factories_quarantine where id = ${item.id}`; }
        audit.coastalRestored.push({ name: r.name, state: r.state, km: km ?? 'territory' });
      } else {
        if (APPLY) await tx`update factories_quarantine set reason = ${`coordinates ${km === null ? '(no polygon for state)' : `${km} km`} from claimed state ${r.state}`} where id = ${item.id}`;
        audit.keptQuarantined.push({ name: r.name, state: r.state, km, lat: r.latitude, lng: r.longitude });
      }
    }
  });
  console.log(`C. coastal sites restored: ${audit.coastalRestored.length} | still quarantined: ${audit.keptQuarantined.length}`);
  for (const k of audit.keptQuarantined.slice(0, 10)) console.log(`     out: ${k.state} | ${(k.name || '').slice(0, 36).padEnd(36)} ${k.lat} ${k.lng} ${k.km == null ? '(no polygon)' : `${k.km} km`}`);

  // D. relabels → trust the address
  const touched = await sql`select id, name, state, zip_code, latitude, longitude from factories where updated_at > now() - interval '3 hours' and created_at < now() - interval '2 hours'`;
  await run(async (tx) => {
    for (const r of touched) {
      const zs = r.zip_code ? zipState(r.zip_code) : null;
      if (!zs) { audit.kept.push({ name: r.name, state: r.state, why: 'no zip' }); continue; }
      const km = await kmToState(parseFloat(r.longitude), parseFloat(r.latitude), zs);
      if (km !== null && km > COASTAL_KM) {
        if (APPLY) {
          const [row] = await tx`select * from factories where id = ${r.id}`;
          row.state = zs; row.state_id = stateId[zs] ?? null;
          const refs = await tx`select * from external_references where entity_type = 'factories' and entity_id = ${r.id}`;
          await tx`insert into factories_quarantine (id, reason, row, external_refs, occupation_links) values (${r.id}, ${`coordinates ${km} km from address state ${zs}`}, ${row}, ${refs}, ${[]}) on conflict (id) do nothing`;
          await tx`delete from external_references where entity_type = 'factories' and entity_id = ${r.id}`;
          await tx`delete from entity_links where entity_type = 'factories' and entity_id = ${r.id}`;
          await tx`delete from factories where id = ${r.id}`;
        }
        audit.quarantined.push({ name: r.name, zipState: zs, km });
      } else if (zs !== r.state) {
        if (APPLY) await tx`update factories set state = ${zs}, state_id = ${stateId[zs] ?? null} where id = ${r.id}`;
        audit.reverted.push({ name: r.name, from: r.state, to: zs, km });
      } else {
        audit.kept.push({ name: r.name, state: r.state, why: 'zip agrees' });
      }
    }
  });
  console.log(`D. relabelled rows: ${touched.length} → reverted to address state: ${audit.reverted.length} | kept: ${audit.kept.length} | quarantined (pin >${COASTAL_KM} km from address state): ${audit.quarantined.length}`);
  for (const k of audit.quarantined.slice(0, 8)) console.log(`     out: ${k.zipState} | ${k.name.slice(0, 36).padEnd(36)} ${k.km} km from ${k.zipState}`);

  const [tot] = await sql`select (select count(*) from factories)::int f, (select count(*) from factories_quarantine)::int q`;
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN — nothing changed'}. factories: ${tot.f} | quarantined: ${tot.q}`);
  writeFileSync(new URL('../geo-cleanup-audit.json', import.meta.url), JSON.stringify(audit, null, 2));
  console.log('audit → geo-cleanup-audit.json');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => sql.end());
