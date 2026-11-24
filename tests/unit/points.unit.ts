// Where a factory's point may come from (scripts/ingest/README.md, "The contract"): a source whose terms let it be
// kept. No research file in data/employers/ names the ArcGIS World Geocoding Service, Esri or OpenStreetMap's
// searches as where a plant was read or placed, and our corrections place none from them. The one exception is the
// plants posting-employers.json placed with the World Geocoder before this was held here: migration 0065 is
// generated from that file and applied, so the file stays as it is and migration 0079 puts the points right
// (data/employers/points-replaced.json, scripts/build-points-sql.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { NOT_RESEARCH } from '../../scripts/build-employers-sql.mjs';
import { FORBIDDEN, buildSql, checkPoints, namesForbidden, plantsOf } from '../../scripts/build-points-sql.mjs';
import { MIGRATIONS } from '../../scripts/migrate.mjs';

interface Plant {
  company: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  sources?: string[];
  coordinatesFrom?: string | null;
}
interface Entry {
  company: string;
  plant: string;
  was: { latitude: number; longitude: number };
  latitude?: number;
  longitude?: number;
  source?: string;
  left?: string;
}
interface PointsFile {
  plants: Entry[];
  checked: { company: string; plant: string; source: string; found: string }[];
}
type Research = { companies: { name: string; plants?: Omit<Plant, 'company'>[] }[] };

const DIR = 'data/employers';
const RESEARCH = `${DIR}/posting-employers.json`;
const POINTS = `${DIR}/points-replaced.json`;
const MIGRATION = 'migrations/0079_points_replaced.sql';
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const points = read<PointsFile>(POINTS);
const research = read<Research>(RESEARCH);
const key = (company: string, plant: string) => `${company} / ${plant}`;
const putRight = new Set(points.plants.map((e) => key(e.company, e.plant)));

// Every research file beside the others, as the employer builder reads them.
const researchFiles = readdirSync(DIR)
  .filter((name) => name.endsWith('.json') && !NOT_RESEARCH.includes(name))
  .sort();

test('the research files are the ones the employer builder reads, and this file is not one of them', () => {
  assert.ok(NOT_RESEARCH.includes('points-replaced.json'));
  assert.ok(researchFiles.includes('posting-employers.json') && researchFiles.includes('texas-hubs.json'));
  for (const name of researchFiles) assert.ok(Array.isArray(read<Research>(`${DIR}/${name}`).companies), `${name}: companies`);
});

test('no research file places a plant from a source whose points are not kept, but the ones 0079 puts right', () => {
  for (const name of researchFiles) {
    for (const p of plantsOf(read<Research>(`${DIR}/${name}`)) as Plant[]) {
      for (const s of [...(p.sources ?? []), p.coordinatesFrom ?? '']) {
        if (!FORBIDDEN.test(s)) continue;
        assert.equal(name, 'posting-employers.json', `${name}: ${key(p.company, p.name)}: ${s}`);
        assert.ok(putRight.has(key(p.company, p.name)), `${key(p.company, p.name)}: ${s}, and not in ${POINTS}`);
      }
    }
  }
});

test('our corrections place no plant from such a source either', () => {
  const { companies } = read<{ companies: Record<string, { plants?: Record<string, { sources?: string[]; coordinatesFrom?: string }> }> }>(`${DIR}/corrections.json`);
  for (const [company, fix] of Object.entries(companies)) {
    for (const [plant, set] of Object.entries(fix.plants ?? {})) {
      for (const s of [...(set.sources ?? []), set.coordinatesFrom ?? '']) assert.equal(FORBIDDEN.test(s), false, `${key(company, plant)}: ${s}`);
    }
  }
});

test('the rule names the World Geocoder, Esri and OpenStreetMap\'s searches, and lets a government\'s own ArcGIS service through', () => {
  for (const s of [
    'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=1%20Main%20St&f=json',
    'https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates',
    'https://example.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode',
    "Esri's World Geocoder (a point address)",
    'ArcGIS World Geocoding Service',
    'https://nominatim.openstreetmap.org/search?q=1+Main+St&format=json',
    'https://photon.komoot.io/api/?q=1+Main+St',
    'https://www.openstreetmap.org/way/123456',
  ]) {
    assert.ok(FORBIDDEN.test(s), s);
  }
  for (const s of [
    // A county's address locator, a state's E911 address points and parcels, a city's permits: each government's own.
    'https://gis.wilco.org/arcgis/rest/services/locator/County_GIS_Address_Locator/GeocodeServer',
    'https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Emergency_SiteStructureAddressPoint_point_SP_v1_VIEW/FeatureServer/0',
    'https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0',
    'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer',
    'https://geocoding.geo.census.gov/geocoder/locations/address?street=1+Main+St&city=Austin&state=TX&benchmark=Public_AR_Current&format=json',
    'https://frs-public.epa.gov/ords/frs_public2/fii_query_detail.disp_program_facility?p_registry_id=110071508807',
    'https://www.example.com/photonics/lasers',
    'Chips on 300 mm wafers: silicon photonics',
  ]) {
    assert.equal(FORBIDDEN.test(s), false, s);
  }
});

test('every point 0079 writes is the Census geocoder\'s or the EPA registry\'s, near the address, and the migration is what the file builds', () => {
  assert.deepEqual(checkPoints(points, research), []);
  assert.equal(readFileSync(MIGRATION, 'utf8'), buildSql(points, research), `run: node scripts/build-points-sql.mjs --out ${MIGRATION}`);
  // The thirteen the research notes say the World Geocoder placed: the nine of Rocket Lab, Hermeus's two, Apptronik's
  // and Relativity's Wormhole, which cites no geocoder but was placed by it too.
  assert.equal(points.plants.length, 13);
  assert.equal(points.plants.filter((e) => e.company === 'Rocket Lab').length, 9);
  assert.ok(putRight.has('Relativity Space / Relativity Space Wormhole'));
  const placed = points.plants.filter((e) => !e.left);
  assert.equal(placed.length, 11);
  assert.deepEqual(points.plants.filter((e) => e.left).map((e) => e.plant).sort(), ['Geost', 'Rocket Lab Integration and Control Facility']);
  for (const e of placed) assert.match(String(e.source), /^https:\/\/(geocoding\.geo\.census\.gov|frs-public\.epa\.gov)\//, e.plant);
});

test('0079 changes a point only while it is the one 0065 wrote and no admin set it, deletes only the World Geocoder\'s citations, and stands last', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /v_held := f\.lat = \(r->'was'->>'latitude'\)::numeric AND f\.lng = \(r->'was'->>'longitude'\)::numeric;/);
  assert.match(sql, /IF NOT coalesce\(v_held, false\) THEN[\s\S]*?CONTINUE;[\s\S]*?IF f\.by_admin THEN[\s\S]*?CONTINUE;[\s\S]*?UPDATE factories SET latitude/);
  assert.match(sql, /e\.external_id = 'posting-employers'/, 'a row is found by the citations 0065 wrote');
  assert.equal(sql.match(/\bDELETE FROM\b/gi)?.length, 1);
  assert.match(sql, /DELETE FROM external_references x WHERE x\.source = 'CURATED' AND \(x\.url ~\* '\^https\?:\/\/geocode\(-api\)\?\[\.\]arcgis\[\.\]com\/' OR x\.url ~\* '\/World\/GeocodeServer'\)/);
  assert.match(sql, /VALUES \(NULL, '', 'factory'/, 'the audit line names no person');
  const at = (name: string) => MIGRATIONS.indexOf(name);
  assert.ok(at('0079_points_replaced.sql') > at('0065_posting_employers.sql'));
  assert.ok(at('0079_points_replaced.sql') > at('0076_texas_hubs.sql'));
  assert.equal(MIGRATIONS[MIGRATIONS.length - 1], '0079_points_replaced.sql');
});

test('posting-employers.json\'s other ArcGIS-hosted citations are the four checked: a government\'s own data, not the World Geocoder', () => {
  const hosted = /\.arcgis\.com\/|\/arcgis\/rest\//i;
  const others = (plantsOf(research) as Plant[]).filter((p) => (p.sources ?? []).some((s) => hosted.test(s)) && !namesForbidden(p));
  assert.deepEqual(others.map((p) => key(p.company, p.name)).sort(), points.checked.map((c) => key(c.company, c.plant)).sort());
  for (const c of points.checked) {
    const p = others.find((o) => o.company === c.company && o.name === c.plant);
    assert.ok(p?.sources?.includes(c.source), `${key(c.company, c.plant)}: cites ${c.source}`);
    assert.ok(c.found.length > 0);
  }
});

test('a points file is refused when it does not match the research, or names a source that is not kept', () => {
  const plant = { name: 'Acme Works', city: 'Postville', state: 'NV', address: '1 Main St', latitude: 39.5, longitude: -119.8, sources: ['https://example.com/acme'] };
  const file = (plants: Omit<Plant, 'company'>[]) => ({ companies: [{ name: 'Acme', plants }] });
  const r = file([plant]);
  const census = 'https://geocoding.geo.census.gov/geocoder/locations/address?street=1+Main+St&city=Postville&state=NV&benchmark=Public_AR_Current&format=json';
  const entry = {
    company: 'Acme',
    plant: 'Acme Works',
    address: '1 Main St, Postville, NV',
    was: { latitude: 39.5, longitude: -119.8 },
    wasFrom: 'the World Geocoder',
    latitude: 39.5005,
    longitude: -119.8004,
    coordinatesFrom: 'U.S. Census Bureau geocoder, matched as 1 MAIN ST, POSTVILLE, NV',
    source: census,
  };
  assert.deepEqual(checkPoints({ plants: [entry] }, r), []);
  assert.deepEqual(checkPoints({ plants: [{ ...entry, latitude: undefined, longitude: undefined, coordinatesFrom: undefined, source: undefined, left: 'No match.' }] }, r), []);
  assert.equal(checkPoints({ plants: [{ ...entry, plant: 'Acme Gone' }] }, r).length, 1, 'a plant the research does not have');
  assert.equal(checkPoints({ plants: [{ ...entry, was: { latitude: 39.6, longitude: -119.8 } }] }, r).length, 1, 'not the point the research gives');
  assert.equal(checkPoints({ plants: [{ ...entry, left: 'No match.' }] }, r).length, 1, 'a point and left');
  assert.equal(checkPoints({ plants: [{ ...entry, latitude: 39.6 }] }, r).length, 1, 'too far from the address');
  assert.equal(checkPoints({ plants: [{ ...entry, latitude: 39.5, longitude: -119.8 }] }, r).length, 1, 'the point it had');
  assert.ok(checkPoints({ plants: [{ ...entry, source: 'https://nominatim.openstreetmap.org/search?q=1+Main+St', coordinatesFrom: 'Nominatim' }] }, r).length >= 1, 'OpenStreetMap');
  assert.equal(checkPoints({ plants: [{ ...entry, source: 'https://frs-public.epa.gov/ords/frs_public2/fii_query_detail.disp_program_facility?p_registry_id=110000000001', coordinatesFrom: 'EPA registry facility' }] }, r).length, 1, 'an EPA point says its registry id');
  assert.equal(checkPoints({ plants: [entry, entry] }, r).length, 1, 'twice');
  // A research plant placed by the World Geocoder must be in the file.
  const placedBy = file([plant, { ...plant, name: 'Acme Two', sources: ['https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'] }]);
  assert.equal(checkPoints({ plants: [entry] }, placedBy).length, 1, 'a plant placed by the World Geocoder left out');
  assert.equal(checkPoints({ plants: [{ ...entry }] }, file([{ ...plant, sources: [] }])).length, 1, 'a plant whose row cannot be found');
});
