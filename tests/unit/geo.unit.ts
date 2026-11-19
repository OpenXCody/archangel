// Unit checks for the geography and industry keys: which county a point is
// in, the readers for the official files, the reduced reference lists, the
// NAICS roll-up, the county statistics and the migration built from them.
// `npm run test:unit`.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { INDUSTRIES, MANUFACTURING_CODE } from '../../shared/industry.js';
import { US_STATES } from '../../shared/states.js';
// @ts-expect-error a plain script, no types
import { areaIndex, kmToRings, pointInRings } from '../../scripts/geo/lib/locate.mjs';
// @ts-expect-error a plain script, no types
import { dbfRows, shpPolygons, unzip, xlsxRows } from '../../scripts/geo/lib/files.mjs';
// @ts-expect-error a plain script, no types
import { buildConcordance, olderToNewer, parseDelineation, parseGazetteer, parseNaics } from '../../scripts/geo/build-reference.mjs';
// @ts-expect-error a plain script, no types
import { checkBoundaries, isLocalDatabase, placePlant } from '../../scripts/geo/assign-keys.mjs';
// @ts-expect-error a plain script, no types
import { buildSql, checkReference, countyStatsSql, readInputs } from '../../scripts/build-geo-sql.mjs';
// @ts-expect-error a plain script, no types
import { parseQcewCounties } from '../../scripts/ingest/qcew.mjs';
// @ts-expect-error a plain script, no types
import { MIGRATIONS } from '../../scripts/migrate.mjs';

const json = async (file: string) => JSON.parse(await readFile(new URL(`../../${file}`, import.meta.url), 'utf8'));
const text = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

type Ring = number[];
interface Area {
  id: string;
  state?: string;
  rings: Ring[];
}
/** A rectangle's ring, closed, counter-clockwise unless `clockwise`. */
const box = (west: number, south: number, east: number, north: number, clockwise = false): Ring => {
  const corners = [west, south, east, south, east, north, west, north];
  const ordered = clockwise ? [west, south, west, north, east, north, east, south] : corners;
  return [...ordered, ordered[0], ordered[1]];
};
/** The same ring, run the other way. */
const reversed = (ring: Ring): Ring => {
  const out: Ring = [];
  for (let i = ring.length - 2; i >= 0; i -= 2) out.push(ring[i], ring[i + 1]);
  return out;
};
const locate = (areas: Area[], lng: number, lat: number, options?: { nearKm?: number; among?: (area: Area) => boolean }): { id: string; km: number } | null =>
  areaIndex(areas).locate(lng, lat, options);

// ---------------------------------------------------------------------------
// Point in polygon
// ---------------------------------------------------------------------------

test('a point is inside, or outside, whichever way the ring runs and whether or not it is closed', () => {
  for (const ring of [box(0, 0, 2, 2), box(0, 0, 2, 2, true), box(0, 0, 2, 2).slice(0, 8)]) {
    assert.equal(pointInRings([ring], 1, 1), true);
    assert.equal(pointInRings([ring], 0.001, 1.999), true);
    assert.equal(pointInRings([ring], 3, 1), false);
    assert.equal(pointInRings([ring], -0.001, 1), false);
    assert.equal(pointInRings([ring], 1, 2.001), false);
  }
  // A shape that is not a box: an L, with the notch outside.
  const l = [0, 0, 3, 0, 3, 1, 1, 1, 1, 3, 0, 3, 0, 0];
  assert.equal(pointInRings([l], 0.5, 2.5), true);
  assert.equal(pointInRings([l], 2.5, 0.5), true);
  assert.equal(pointInRings([l], 2, 2), false);
});

test('a point on a border two counties share is in exactly one of them', () => {
  // Four counties meeting at (1, 1), drawn in different directions.
  const areas: Area[] = [
    { id: 'sw', rings: [box(0, 0, 1, 1)] },
    { id: 'se', rings: [box(1, 0, 2, 1, true)] },
    { id: 'nw', rings: [box(0, 1, 1, 2, true)] },
    { id: 'ne', rings: [box(1, 1, 2, 2)] },
  ];
  const holders = (x: number, y: number) => areas.filter((area) => pointInRings(area.rings, x, y)).map((area) => area.id);
  // Along the border that runs north-south the point goes to the county to its east,
  assert.deepEqual(holders(1, 0.5), ['se']);
  assert.deepEqual(holders(1, 1.5), ['ne']);
  // along the one that runs east-west to the county to its north,
  assert.deepEqual(holders(0.5, 1), ['nw']);
  assert.deepEqual(holders(1.5, 1), ['ne']);
  // and where all four meet, to one of them.
  assert.deepEqual(holders(1, 1), ['ne']);
  // A slanted border with awkward numbers: every point on it has one holder.
  const a = [0, 0, 0.3, 0, 0.7, 1.1, 0, 1.1, 0, 0];
  const b = [0.3, 0, 2, 0, 2, 1.1, 0.7, 1.1, 0.3, 0];
  for (let i = 1; i < 200; i++) {
    const y = (1.1 * i) / 200;
    const x = 0.3 + ((y - 0) * (0.7 - 0.3)) / (1.1 - 0);
    const count = Number(pointInRings([a], x, y)) + Number(pointInRings([reversed(b)], x, y));
    assert.equal(count, 1, `the point at y=${y} has ${count} holders`);
  }
});

test('a county with a hole does not hold what is in the hole; the city in the hole does', () => {
  // As an independent city sits inside a Virginia county.
  const county: Area = { id: 'county', rings: [box(0, 0, 10, 10), box(4, 4, 6, 6, true)] };
  const city: Area = { id: 'city', rings: [box(4, 4, 6, 6)] };
  assert.equal(locate([county, city], 5, 5)?.id, 'city');
  assert.equal(locate([county, city], 1, 1)?.id, 'county');
  assert.equal(locate([county, city], 4.5, 5.5)?.id, 'city');
  assert.equal(locate([county], 5, 5), null, 'the hole is not the county');
  // On the hole's edge the point still has exactly one holder.
  for (const [x, y] of [[4, 5], [6, 5], [5, 4], [5, 6], [4, 4], [6, 6]]) {
    const holders = [county, city].filter((area) => pointInRings(area.rings, x, y));
    assert.equal(holders.length, 1, `(${x}, ${y})`);
  }
});

test('a county of several islands holds a point on each, and not the water between', () => {
  // Maui County: Maui, Molokai and Lanai, roughly.
  const maui: Area = { id: '15009', state: 'HI', rings: [box(-156.7, 20.57, -155.98, 21.03), box(-157.31, 21.05, -156.71, 21.22), box(-157.06, 20.73, -156.81, 20.93)] };
  const honolulu: Area = { id: '15003', state: 'HI', rings: [box(-158.28, 21.25, -157.65, 21.71)] };
  const hawaii: Area = { id: '15001', state: 'HI', rings: [box(-156.06, 18.91, -154.81, 20.27)] };
  const areas = [maui, honolulu, hawaii];
  assert.equal(locate(areas, -156.33, 20.8)?.id, '15009'); // Kahului
  assert.equal(locate(areas, -157.02, 21.09)?.id, '15009'); // Kaunakakai
  assert.equal(locate(areas, -156.92, 20.83)?.id, '15009'); // Lanai City
  assert.equal(locate(areas, -157.86, 21.31)?.id, '15003'); // Honolulu
  assert.equal(locate(areas, -155.09, 19.72)?.id, '15001'); // Hilo
  assert.equal(locate(areas, -156.75, 20.75), null, 'the channel between Maui and Lanai');
  assert.equal(locate(areas, -157.4, 21.0), null, 'the channel between Oahu and Molokai');
});

test('Alaska: far north, and islands on both sides of the 180th meridian', () => {
  // The western Aleutians cross the meridian: some islands are at 179 east, most at 179 west.
  const aleutians: Area = { id: '02016', state: 'AK', rings: [box(172.4, 52.3, 174.0, 53.1), box(179.4, 51.2, 179.8, 51.5), box(-178.2, 51.6, -176.4, 52.1), box(-167.0, 53.2, -166.2, 54.1)] };
  const northSlope: Area = { id: '02185', state: 'AK', rings: [box(-166.5, 68.0, -141.0, 71.4)] };
  const anchorage: Area = { id: '02020', state: 'AK', rings: [box(-150.4, 60.7, -148.4, 61.5)] };
  const areas = [aleutians, northSlope, anchorage];
  assert.equal(locate(areas, 173.2, 52.9)?.id, '02016'); // Attu
  assert.equal(locate(areas, 179.6, 51.4)?.id, '02016'); // Semisopochnoi, in the eastern hemisphere
  assert.equal(locate(areas, -176.6, 51.9)?.id, '02016'); // Adak
  assert.equal(locate(areas, -166.54, 53.89)?.id, '02016'); // Dutch Harbor
  assert.equal(locate(areas, -156.79, 71.29)?.id, '02185'); // Utqiagvik
  assert.equal(locate(areas, -149.9, 61.22)?.id, '02020'); // Anchorage
  // The county's islands are thousands of kilometres apart; nothing in between is in it.
  assert.equal(locate(areas, 0, 52), null);
  assert.equal(locate(areas, -170, 52.5), null);
  assert.equal(locate(areas, 180, 51.4), null);
  assert.equal(locate(areas, -180, 51.4), null);
});

test('a point just offshore goes to the nearest county within reach, and to none beyond it', () => {
  const coast: Area = { id: 'coast', state: 'TX', rings: [box(-97, 27, -96, 28)] };
  const next: Area = { id: 'next', state: 'TX', rings: [box(-97, 28, -96, 29)] };
  const areas = [coast, next];
  // 0.005 degrees of longitude at 27.5 north is about half a kilometre.
  const pier = locate(areas, -95.995, 27.5, { nearKm: 2 });
  assert.equal(pier?.id, 'coast');
  assert.ok(pier && pier.km > 0.4 && pier.km < 0.6, `about half a kilometre, not ${pier?.km}`);
  assert.equal(locate(areas, -95.995, 27.5), null, 'without a reach, a point in the water is in no county');
  assert.equal(locate(areas, -95.9, 27.5, { nearKm: 2 }), null, 'ten kilometres out is not near');
  // Of two counties within reach, the nearer one.
  assert.equal(locate(areas, -95.995, 27.99, { nearKm: 2 })?.id, 'coast');
  assert.equal(locate(areas, -95.995, 28.01, { nearKm: 2 })?.id, 'next');
  // A point inside is never "near": it is in.
  assert.deepEqual(locate(areas, -96.5, 27.5, { nearKm: 2 }), { id: 'coast', km: 0 });
  // The search can be narrowed, as to the counties of one state.
  assert.equal(locate(areas, -96.5, 27.99, { nearKm: 5, among: (area) => area.id === 'next' })?.id, 'next');
  assert.ok(Math.abs(kmToRings(coast.rings, -96.5, 26.9) - 11.12) < 0.05, 'a tenth of a degree of latitude is about 11 km');
});

test('coordinates that are not a place are in no county', () => {
  const areas: Area[] = [{ id: 'a', rings: [box(-1, -1, 1, 1)] }];
  for (const [lng, lat] of [[NaN, 0], [0, NaN], [0, 91], [0, -91], [181, 0], [-181, 0], [Infinity, 0]]) {
    assert.equal(locate(areas, lng, lat, { nearKm: 5 }), null);
  }
  assert.equal(locate(areas, 0, 0)?.id, 'a');
});

test('ten thousand points over three thousand counties are placed quickly and each in one', () => {
  // A grid of 60 x 50 one-degree "counties" over the continental box.
  const areas: Area[] = [];
  for (let x = 0; x < 60; x++) for (let y = 0; y < 50; y++) areas.push({ id: `${x}-${y}`, rings: [box(-125 + x, 24 + y * 0.5, -124 + x, 24.5 + y * 0.5)] });
  const index = areaIndex(areas);
  const started = Date.now();
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 10000; i++) {
    const lng = -125 + random() * 60;
    const lat = 24 + random() * 25;
    const found = index.locate(lng, lat);
    assert.equal(found?.id, `${Math.floor(lng + 125)}-${Math.floor((lat - 24) * 2)}`);
  }
  assert.ok(Date.now() - started < 2000, 'well under two seconds');
});

// ---------------------------------------------------------------------------
// Placing a plant
// ---------------------------------------------------------------------------

test("a plant gets the county its coordinates fall in, unless that county is in another state than the plant's", () => {
  const areas: Area[] = [
    { id: '48453', state: 'TX', rings: [box(-98.2, 30.0, -97.4, 30.6)] },
    { id: '22019', state: 'LA', rings: [box(-93.9, 29.9, -93.0, 30.5)] },
    { id: '72001', state: 'PR', rings: [box(-66.8, 18.1, -66.6, 18.3)] },
  ];
  const index = areaIndex(areas);
  const counties = new Map([
    ['48453', { name: 'Travis County', state: 'TX', cbsa: '12420' }],
    ['22019', { name: 'Calcasieu Parish', state: 'LA', cbsa: null }],
  ]);
  const place = (plant: { lat: number | null; lng: number | null; state: string | null }) => placePlant(plant, index, counties, 2);
  assert.deepEqual(place({ lat: 30.27, lng: -97.74, state: 'TX' }), { county: '48453', cbsa: '12420' });
  assert.deepEqual(place({ lat: 30.27, lng: -97.74, state: ' tx ' }), { county: '48453', cbsa: '12420' });
  // A county in no metro area has no metro code.
  assert.deepEqual(place({ lat: 30.2, lng: -93.2, state: 'LA' }), { county: '22019', cbsa: null });
  // A plant with no stored state is placed by its coordinates alone.
  assert.equal(place({ lat: 30.27, lng: -97.74, state: null }).county, '48453');
  // Filed under Texas, standing in Louisiana: one of the two is wrong, so no key.
  assert.deepEqual(place({ lat: 30.2, lng: -93.2, state: 'TX' }), { county: null, cbsa: null, why: 'county is not in the stored state', found: '22019' });
  assert.deepEqual(place({ lat: null, lng: -97.74, state: 'TX' }), { county: null, cbsa: null, why: 'no usable coordinates' });
  assert.deepEqual(place({ lat: 45, lng: -30, state: 'TX' }), { county: null, cbsa: null, why: 'outside every county' });
  assert.deepEqual(place({ lat: 18.2, lng: -66.7, state: 'TX' }), { county: null, cbsa: null, why: 'in a county the product does not cover', found: '72001' });
  // Just off the county's edge: placed, and marked as placed by nearness.
  const near = place({ lat: 30.3, lng: -97.395, state: 'TX' });
  assert.equal(near.county, '48453');
  assert.ok(near.nearKm > 0.3 && near.nearKm < 0.7);
});

test('a boundary file is checked against the county list before it is used', () => {
  const areas: Area[] = [
    { id: '01001', rings: [box(0, 0, 1, 1)] },
    { id: '01003', rings: [box(1, 0, 2, 1)] },
  ];
  const index = areaIndex(areas);
  assert.deepEqual(checkBoundaries(areas, index, [{ fips: '01001', lat: 0.5, lng: 0.5 }, { fips: '01003', lat: 0.5, lng: 1.5 }]), { inside: 2, offshore: 0 });
  // A county the file does not draw: another edition.
  assert.throws(() => checkBoundaries(areas, index, [{ fips: '09110', lat: 0.5, lng: 0.5 }]), /no outline/);
  // A county whose own point lands in its neighbour: a damaged or mislabelled file.
  assert.throws(() => checkBoundaries(areas, index, [{ fips: '01001', lat: 0.5, lng: 1.5 }, { fips: '01003', lat: 0.5, lng: 1.6 }]), /cannot be trusted/);
});

test('only a database on this machine is written without being asked twice', () => {
  for (const url of ['postgresql://postgres:postgres@127.0.0.1:5432/archangel', 'postgres://u:p@localhost/db', 'postgresql://u@[::1]:5432/db']) assert.equal(isLocalDatabase(url), true, url);
  for (const url of ['postgresql://u:p@ep-cool-name-123.us-east-2.aws.neon.tech/neondb?sslmode=require', 'postgresql://u:p@10.0.0.5/db', 'postgresql://u:p@localhost.example.com/db', 'not a url']) {
    assert.equal(isLocalDatabase(url), false, url);
  }
});

// ---------------------------------------------------------------------------
// The file readers
// ---------------------------------------------------------------------------

/** A zip archive of the given files, each stored or deflated. */
function zipOf(files: { name: string; body: Buffer; deflate?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const packed = file.deflate ? deflateRawSync(file.body) : file.body;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(file.deflate ? 8 : 0, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(file.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(file.deflate ? 8 : 0, 10);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(file.body.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    central.push(entry, name);
    offset += 30 + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('a zip archive is read, stored or deflated; a spreadsheet inside one comes back as rows', () => {
  const long = Buffer.from('county '.repeat(500));
  const files = unzip(zipOf([{ name: 'a.txt', body: Buffer.from('plain') }, { name: 'dir/b.txt', body: long, deflate: true }]));
  assert.equal(files.get('a.txt').toString(), 'plain');
  assert.equal(files.get('dir/b.txt').toString(), long.toString());
  assert.throws(() => unzip(Buffer.from('this is not an archive at all')), /Not a zip/);

  const sheet =
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>inline</t></is></c></row>' +
    '<row r="2"><c r="A2"><v>311611</v></c><c r="B2" t="s"><v>2</v></c><c r="C2"/></row>' +
    '</sheetData></worksheet>';
  const strings = '<sst><si><t>Code</t></si><si><t>Title</t></si><si><r><t>Meat &amp; </t></r><r><t xml:space="preserve">poultry</t></r></si></sst>';
  const rows = xlsxRows(zipOf([{ name: 'xl/sharedStrings.xml', body: Buffer.from(strings), deflate: true }, { name: 'xl/worksheets/sheet1.xml', body: Buffer.from(sheet), deflate: true }]));
  assert.deepEqual(rows, [['Code', 'Title', '', 'inline'], ['311611', 'Meat & poultry', '']]);
});

test('a shapefile gives back its polygons ring by ring, and its table row by row', () => {
  // One polygon of two rings (an island and a second island), as the format lays it out.
  const rings = [box(0, 0, 1, 1, true), box(2, 2, 3, 3, true)];
  const points = rings.flat();
  const content = Buffer.alloc(44 + rings.length * 4 + points.length * 8);
  content.writeInt32LE(5, 0);
  [0, 0, 3, 3].forEach((value, i) => content.writeDoubleLE(value, 4 + i * 8));
  content.writeInt32LE(rings.length, 36);
  content.writeInt32LE(points.length / 2, 40);
  content.writeInt32LE(0, 44);
  content.writeInt32LE(rings[0].length / 2, 48);
  points.forEach((value, i) => content.writeDoubleLE(value, 52 + i * 8));
  const empty = Buffer.alloc(4); // a record with no shape
  const header = Buffer.alloc(100);
  header.writeInt32BE(9994, 0);
  header.writeInt32LE(5, 32);
  const record = (n: number, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeInt32BE(n, 0);
    head.writeInt32BE(body.length / 2, 4);
    return Buffer.concat([head, body]);
  };
  const shapes = shpPolygons(Buffer.concat([header, record(1, content), record(2, empty)]));
  assert.equal(shapes.length, 2);
  assert.deepEqual(shapes[0].box, [0, 0, 3, 3]);
  assert.deepEqual(shapes[0].rings.map((ring: Float64Array) => [...ring]), rings);
  assert.equal(shapes[1], null);
  assert.equal(pointInRings(shapes[0].rings, 2.5, 2.5), true);
  assert.equal(pointInRings(shapes[0].rings, 1.5, 1.5), false);

  // A table of two columns and two rows.
  const columns = [['GEOID', 5], ['NAME', 12]] as const;
  const head = Buffer.alloc(32 + columns.length * 32 + 1);
  head.writeUInt32LE(2, 4);
  head.writeUInt16LE(head.length, 8);
  head.writeUInt16LE(1 + 5 + 12, 10);
  columns.forEach(([name, length], i) => {
    head.write(name, 32 + i * 32, 'ascii');
    head[32 + i * 32 + 11] = 0x43;
    head[32 + i * 32 + 16] = length;
  });
  head[head.length - 1] = 0x0d;
  const row = (geoid: string, name: string) => Buffer.from(` ${geoid.padEnd(5)}${name.padEnd(12)}`, 'utf8');
  assert.deepEqual(dbfRows(Buffer.concat([head, row('48453', 'Travis'), row('35013', 'Dona Ana')])), [
    { GEOID: '48453', NAME: 'Travis' },
    { GEOID: '35013', NAME: 'Dona Ana' },
  ]);
});

// ---------------------------------------------------------------------------
// Reducing the official lists
// ---------------------------------------------------------------------------

test('the county list keeps the product\'s states, and the delineation file gives each county its metro area', () => {
  const gazetteer = [
    'USPS\tGEOID\tANSICODE\tNAME\tALAND\tAWATER\tALAND_SQMI\tAWATER_SQMI\tINTPTLAT\tINTPTLONG   ',
    'TX\t48453\t01384012\tTravis County\t1\t1\t1\t1\t30.239513\t-97.69127   ',
    'NM\t35013\t00929109\tDoña Ana County\t1\t1\t1\t1\t32.349919\t-106.834968',
    'PR\t72001\t01804480\tAdjuntas Municipio\t1\t1\t1\t1\t18.181402\t-66.757841',
  ].join('\n');
  assert.deepEqual(parseGazetteer(gazetteer), [
    { fips: '35013', name: 'Doña Ana County', state: 'NM', lat: 32.349919, lng: -106.834968 },
    { fips: '48453', name: 'Travis County', state: 'TX', lat: 30.239513, lng: -97.69127 },
  ]);
  const rows = [
    ['List 1. CORE BASED STATISTICAL AREAS'],
    ['CBSA Code', 'Metropolitan Division Code', 'CSA Code', 'CBSA Title', 'Metropolitan/Micropolitan Statistical Area', 'Metropolitan Division Title', 'CSA Title', 'County/County Equivalent', 'State Name', 'FIPS State Code', 'FIPS County Code', 'Central/Outlying County'],
    ['12420', '', '', 'Austin-Round Rock-San Marcos, TX', 'Metropolitan Statistical Area', '', '', 'Travis County', 'Texas', '48', '453', 'Central'],
    ['12420', '', '', 'Austin-Round Rock-San Marcos, TX', 'Metropolitan Statistical Area', '', '', 'Hays County', 'Texas', '48', '209', 'Central'],
    ['10100', '', '', 'Aberdeen, SD', 'Micropolitan Statistical Area', '', '', 'Brown County', 'South Dakota', '46', '013', 'Central'],
    ['Source: File prepared by U.S. Census Bureau'],
  ];
  const { metros, byCounty } = parseDelineation(rows);
  assert.deepEqual(metros, [
    { code: '10100', name: 'Aberdeen, SD', kind: 'micropolitan' },
    { code: '12420', name: 'Austin-Round Rock-San Marcos, TX', kind: 'metropolitan' },
  ]);
  assert.equal(byCounty.get('48453'), '12420');
  assert.equal(byCounty.get('46013'), '10100');
  assert.equal(byCounty.size, 3);
});

test('another form of a code is kept only when it means exactly one 2022 national industry', () => {
  const codes = parseNaics([
    ['Seq. No.', '2022 NAICS US   Code', '2022 NAICS US Title'],
    ['1', '11', 'Agriculture'],
    ['2', '31-33', 'Manufacturing'],
    ['3', '311', 'Food Manufacturing'],
    ['4', '3112', 'Grain and Oilseed Milling'],
    ['5', '31122', 'Starch and Vegetable Fats and Oils Manufacturing'],
    ['6', '311224', 'Soybean and Other Oilseed Processing '],
    ['7', '311225', 'Fats and Oils Refining and Blending'],
    ['8', '31123', 'Breakfast Cereal Manufacturing'],
    ['9', '311230', 'Breakfast Cereal Manufacturing'],
    ['10', '336', 'Transportation Equipment Manufacturing'],
    ['11', '3361', 'Motor Vehicle Manufacturing'],
    ['12', '33611', 'Automobile and Light Duty Motor Vehicle Manufacturing'],
    ['13', '336110', 'Automobile and Light Duty Motor Vehicle Manufacturing'],
    ['14', '541110', 'Offices of Lawyers'],
  ]);
  assert.deepEqual(codes[0], { code: '31-33', title: 'Manufacturing', parent: null });
  assert.deepEqual(codes.find((entry: { code: string }) => entry.code === '311'), { code: '311', title: 'Food Manufacturing', parent: '31-33' });
  assert.deepEqual(codes.find((entry: { code: string }) => entry.code === '311224'), { code: '311224', title: 'Soybean and Other Oilseed Processing', parent: '31122' });
  assert.equal(codes.some((entry: { code: string }) => entry.code === '541110' || entry.code === '11'), false, 'only manufacturing is kept');

  const concordance = buildConcordance({
    codes,
    all2022: new Set(['311224', '311225', '311230', '336110', '541110', '541199']),
    // 2017 codes -> 2022: two went whole into 336110; 541191 was split.
    to2022: olderToNewer([['336110', '', '336111'], ['336110', '', '336112'], ['311224', '', '311224'], ['311225', '', '311225'], ['311230', '', '311230'], ['541110', '', '541191'], ['541199', '', '541191']]),
    // 2012 codes -> 2017.
    to2017: olderToNewer([['336111', '', '336111'], ['336112', '', '336112'], ['311224', '', '311224'], ['311225', '', '311225'], ['311230', '', '311230']]),
    // 2007 codes -> 2012: two soybean codes became one; one cereal code was split in two.
    to2012: olderToNewer([['311224', '', '311222'], ['311224', '', '311223'], ['311224', '', '311229'], ['311225', '', '311229'], ['311230', '', '311230']]),
  });
  const of = (from: string) => concordance.find((entry: { from: string }) => entry.from === from);
  // A shorter code with one national industry under it.
  assert.deepEqual(of('31123'), { from: '31123', to: '311230', basis: 'only' });
  assert.deepEqual(of('3361'), { from: '3361', to: '336110', basis: 'only' });
  assert.deepEqual(of('336'), { from: '336', to: '336110', basis: 'only' });
  assert.equal(of('31122'), undefined, 'two national industries: not one');
  assert.equal(of('311'), undefined);
  // Earlier editions.
  assert.deepEqual(of('336111'), { from: '336111', to: '336110', basis: '2017' });
  assert.deepEqual(of('311222'), { from: '311222', to: '311224', basis: '2007' });
  assert.deepEqual(of('311223'), { from: '311223', to: '311224', basis: '2007' });
  assert.equal(of('311229'), undefined, 'split between two industries');
  assert.equal(of('541191'), undefined, 'not manufacturing, and split');
  assert.equal(of('311224'), undefined, 'a 2022 code needs no other form');
});

// ---------------------------------------------------------------------------
// The lists as committed
// ---------------------------------------------------------------------------

test('the county list covers every state, and every metro area a county names is listed', async () => {
  const { counties, sources } = await json('data/geo/counties.json');
  const { metros } = await json('data/geo/metros.json');
  assert.equal(counties.length, 3144);
  assert.equal(new Set(counties.map((county: { fips: string }) => county.fips)).size, counties.length);
  const states = new Set(US_STATES.map((state) => state.code));
  const metroCodes = new Set(metros.map((metro: { code: string }) => metro.code));
  for (const county of counties) {
    assert.match(county.fips, /^\d{5}$/);
    assert.ok(states.has(county.state), `${county.fips} is in a state the product knows`);
    assert.ok(county.name.length > 2);
    assert.ok(county.cbsa === null || metroCodes.has(county.cbsa), `${county.fips} names a listed metro area`);
    assert.ok(county.lat > 18 && county.lat < 72 && (county.lng < -66 || county.lng > 172), `${county.fips} has a point in the United States`);
  }
  assert.deepEqual([...new Set(counties.map((county: { state: string }) => county.state))].sort(), [...states].sort());
  const used = new Set(counties.map((county: { cbsa: string | null }) => county.cbsa).filter(Boolean));
  assert.deepEqual([...metroCodes].sort(), [...used].sort(), 'no metro area without a county');
  for (const metro of metros) assert.ok(['metropolitan', 'micropolitan'].includes(metro.kind));
  const travis = counties.find((county: { fips: string }) => county.fips === '48453');
  assert.deepEqual([travis.name, travis.state, travis.cbsa], ['Travis County', 'TX', '12420']);
  assert.equal(metros.find((metro: { code: string }) => metro.code === '12420').kind, 'metropolitan');
  // Connecticut as planning regions, the District as one county.
  assert.equal(counties.filter((county: { state: string }) => county.state === 'CT').length, 9);
  assert.equal(counties.filter((county: { state: string }) => county.state === 'DC').length, 1);
  for (const source of sources) {
    assert.match(source.url, /^https:\/\/www2?\.census\.gov\//);
    assert.match(source.retrieved, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('every NAICS code rolls up to one of the 21 industries, and every other form points at a national industry', async () => {
  const { codes } = await json('data/industries/naics-2022.json');
  const byCode = new Map<string, { code: string; title: string; parent: string | null }>(codes.map((entry: { code: string }) => [entry.code, entry]));
  // The 21 subsectors are the product's industries, by code and by name.
  const subsectors = codes.filter((entry: { code: string }) => /^\d{3}$/.test(entry.code));
  assert.deepEqual(
    subsectors.map((entry: { code: string; title: string }) => [entry.code, entry.title]),
    INDUSTRIES.map((industry) => [industry.code, industry.name])
  );
  const industryCodes = new Set<string>(INDUSTRIES.map((industry) => industry.code));
  const national = codes.filter((entry: { code: string }) => entry.code.length === 6);
  assert.equal(national.length, 346);
  for (const entry of codes) {
    // Climb to the top: the sector, by way of exactly one of the 21.
    const path: string[] = [];
    for (let at: string | null = entry.code; at !== null; at = byCode.get(at)!.parent) {
      assert.ok(byCode.has(at), `${at} is in the list`);
      path.push(at);
      assert.ok(path.length <= 6);
    }
    assert.equal(path[path.length - 1], MANUFACTURING_CODE);
    if (entry.code !== MANUFACTURING_CODE) {
      const subsector = path[path.length - 2];
      assert.ok(industryCodes.has(subsector), `${entry.code} rolls up to an industry`);
      assert.equal(subsector, entry.code.slice(0, 3), 'which is the first three digits of the code');
    }
  }
  assert.equal(byCode.get('336110')!.title, 'Automobile and Light Duty Motor Vehicle Manufacturing');

  const { codes: forms } = await json('data/industries/naics-concordance.json');
  assert.equal(new Set(forms.map((form: { from: string }) => form.from)).size, forms.length);
  for (const form of forms) {
    assert.match(form.to, /^3[123]\d{4}$/);
    assert.ok(byCode.has(form.to), `${form.from} points at a listed code`);
    assert.ok(!(form.from.length === 6 && byCode.has(form.from)), `${form.from} is not a 2022 national industry itself`);
    if (form.basis === 'only') assert.ok(form.to.startsWith(form.from) && national.filter((entry: { code: string }) => entry.code.startsWith(form.from)).length === 1);
    else assert.match(form.basis, /^20(17|12|07)$/);
  }
  const of = (from: string) => forms.find((form: { from: string }) => form.from === from);
  assert.deepEqual(of('336111'), { from: '336111', to: '336110', basis: '2017' });
  assert.deepEqual(of('336112'), { from: '336112', to: '336110', basis: '2017' });
  assert.deepEqual(of('32411'), { from: '32411', to: '324110', basis: 'only' });
  assert.equal(of('311'), undefined);
});

// ---------------------------------------------------------------------------
// County statistics
// ---------------------------------------------------------------------------

const HEADER =
  '"area_fips","own_code","industry_code","agglvl_code","size_code","year","qtr","disclosure_code","annual_avg_estabs","annual_avg_emplvl","total_annual_wages","taxable_annual_wages","annual_contributions","annual_avg_wkly_wage","avg_annual_pay"';

test('the adapter keeps private manufacturing for each county, and a withheld figure is null', () => {
  const csv = [
    HEADER,
    '"US000","5","31-33","14","0","2025","A","",399936,12579906,0,0,0,1720,89471',
    '"48000","5","31-33","54","0","2025","A","",29000,950000,0,0,0,1800,95000',
    '"48453","5","31-33","74","0","2025","A","",1354,60968,0,0,0,2620,136250',
    '"48453","3","31-33","74","0","2025","A","",1,20,0,0,0,900,50000',
    '"48301","5","31-33","74","0","2025","A","N",1,0,0,0,0,0,0',
    '"48999","5","31-33","74","0","2025","A","",40,300,0,0,0,900,50000',
    '"72001","5","31-33","74","0","2025","A","",12,700,0,0,0,500,26000',
    '"01001","5","31-33","74","0","2025","A","",48,1958,0,0,0,1654,86028',
    '"C1242","5","31-33","44","0","2025","A","",2100,80000,0,0,0,2500,130000',
  ].join('\n');
  assert.deepEqual(parseQcewCounties(csv, '31-33'), [
    { county: '01001', code: '31-33', establishments: 48, employment: 1958, avgAnnualPay: 86028 },
    { county: '48301', code: '31-33', establishments: 1, employment: null, avgAnnualPay: null },
    { county: '48453', code: '31-33', establishments: 1354, employment: 60968, avgAnnualPay: 136250 },
  ]);
});

test('the stored county statistics belong to listed counties and are shaped as the builder expects', async () => {
  const { source, rows } = await json('data/industries/qcew-2025-counties.json');
  const { counties } = await json('data/geo/counties.json');
  const listed = new Set(counties.map((county: { fips: string }) => county.fips));
  assert.equal(source.year, 2025);
  assert.match(source.retrieved, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(rows.length > 3000 && rows.length <= counties.length);
  assert.equal(new Set(rows.map((row: { county: string }) => row.county)).size, rows.length);
  for (const row of rows) {
    assert.ok(listed.has(row.county), `${row.county} is a listed county`);
    assert.equal(row.code, MANUFACTURING_CODE);
    assert.ok(Number.isInteger(row.establishments) && row.establishments >= 0);
    assert.ok(row.employment === null || (Number.isInteger(row.employment) && row.employment >= 0));
    assert.equal(row.employment === null, row.avgAnnualPay === null, 'pay is withheld with employment');
  }
  // The counties add up to no more than their state: Texas, against the state file.
  const states = (await json('data/industries/qcew-2025.json')).rows;
  const texas = states.find((row: { state: string; code: string }) => row.state === 'TX' && row.code === MANUFACTURING_CODE);
  const sum = rows.filter((row: { county: string }) => row.county.startsWith('48')).reduce((total: number, row: { employment: number | null }) => total + (row.employment ?? 0), 0);
  assert.ok(sum <= texas.employment && sum > texas.employment * 0.8, `Texas counties sum to ${sum} of ${texas.employment}`);
});

// ---------------------------------------------------------------------------
// The migration
// ---------------------------------------------------------------------------

test('migration 0044 is what the builder makes from the committed lists', async () => {
  const built = buildSql(await readInputs());
  assert.equal(await text('migrations/0044_geo_keys.sql'), built, 'run: node scripts/build-geo-sql.mjs --out migrations/0044_geo_keys.sql');
  assert.ok((MIGRATIONS as string[]).includes('0044_geo_keys.sql'));
  assert.ok((MIGRATIONS as string[]).indexOf('0044_geo_keys.sql') > (MIGRATIONS as string[]).indexOf('0036_industry_stats.sql'));
  // Additive and repeatable: nothing is dropped but its own trigger, nothing deleted.
  assert.doesNotMatch(built, /\bDELETE\b|\bTRUNCATE\b|DROP (TABLE|COLUMN|INDEX)/i);
  assert.equal((built.match(/CREATE TABLE(?! IF NOT EXISTS)/g) ?? []).length, 0);
  assert.equal((built.match(/ADD COLUMN(?! IF NOT EXISTS)/g) ?? []).length, 0);
  assert.equal((built.match(/CREATE INDEX(?! IF NOT EXISTS)/g) ?? []).length, 0);
  assert.equal((built.match(/^INSERT INTO /gm) ?? []).length, (built.match(/^ON CONFLICT /gm) ?? []).length, 'every insert says what to do with a row that is there');
  // No plant is given a county here: that is the script's work, outside the build.
  assert.doesNotMatch(built, /SET "?county_fips/);
  assert.match(built, /\('48453', 'Travis County', 'TX', '12420'\)/);
  assert.match(built, /\('48453', '31-33', 1354, 60968, 136250\)/);
  assert.match(built, /\('02016', 'Aleutians West Census Area', 'AK', NULL\)/);
  assert.match(built, /\('31-33', 'Manufacturing', 2, NULL\)/);
  assert.match(built, /\('311', 'Food Manufacturing', 3, '31-33'\)/);
});

test('the builder refuses lists that would load wrongly', async () => {
  const inputs = await readInputs();
  const small = {
    metros: [{ code: '12420', name: 'Austin-Round Rock-San Marcos, TX', kind: 'metropolitan' }],
    counties: [{ fips: '48453', name: 'Travis County', state: 'TX', cbsa: '12420' }],
    naics: [
      { code: '31-33', title: 'Manufacturing', parent: null },
      { code: '311', title: 'Food Manufacturing', parent: '31-33' },
      { code: '3112', title: 'Grain and Oilseed Milling', parent: '311' },
      { code: '31123', title: 'Breakfast Cereal Manufacturing', parent: '3112' },
      { code: '311230', title: "Breakfast Cereal Manufacturing, O'Brien style", parent: '31123' },
    ],
    concordance: [{ from: '31123', to: '311230', basis: 'only' }],
  };
  assert.doesNotThrow(() => checkReference(small));
  const sql = buildSql({ ...small, schema: '-- schema', stats: { source: { ...inputs.stats.source }, rows: [{ county: '48453', code: '31-33', establishments: 1354, employment: null, avgAnnualPay: null }] } });
  assert.match(sql, /'Breakfast Cereal Manufacturing, O''Brien style'/, 'a quote in a title is escaped');
  assert.match(sql, /\('48453', '31-33', 1354, NULL, NULL\)/, 'a withheld figure is NULL');
  const refuses = (change: Partial<typeof small>, why: RegExp) => assert.throws(() => checkReference({ ...small, ...change }), why);
  refuses({ counties: [{ fips: '48453', name: 'Travis County', state: 'TX', cbsa: '99999' }] }, /metro area that is not listed/);
  refuses({ counties: [{ fips: '4845', name: 'Travis County', state: 'TX', cbsa: null as unknown as string }] }, /Not a county/);
  refuses({ counties: [{ fips: '72001', name: 'Adjuntas Municipio', state: 'PR', cbsa: null as unknown as string }] }, /Not a county/);
  refuses({ counties: [small.counties[0], small.counties[0]] }, /listed twice/);
  refuses({ metros: [{ code: '12420', name: 'Austin', kind: 'city' }] }, /Not a metro area/);
  refuses({ naics: small.naics.filter((entry) => entry.code !== '3112') }, /no parent/);
  refuses({ naics: [...small.naics, { code: '541110', title: 'Offices of Lawyers', parent: '31-33' }] }, /Not a manufacturing/);
  refuses({ concordance: [{ from: '31123', to: '311231', basis: 'only' }] }, /not a 2022 national industry/);
  refuses({ concordance: [{ from: '311230', to: '311230', basis: '2017' }] }, /national industry itself/);
  refuses({ concordance: [{ from: '31123', to: '311230', basis: 'guess' }] }, /Not another form/);
  const stats = (rows: unknown[], source: unknown = inputs.stats.source) => () => countyStatsSql({ source, rows }, small.counties);
  assert.throws(stats([{ county: '48999', code: '31-33', establishments: 1, employment: 1, avgAnnualPay: 1 }]), /not listed/);
  assert.throws(stats([{ county: '48453', code: '541', establishments: 1, employment: 1, avgAnnualPay: 1 }]), /not manufacturing/);
  assert.throws(stats([{ county: '48453', code: '31-33' }, { county: '48453', code: '31-33' }]), /Two rows/);
  assert.throws(stats([], { name: 'x' }), /names no year/);
});
