// Readers for the file formats the public agencies publish in, written here
// so the geography scripts need no package: a zip archive, a spreadsheet
// (.xlsx, and the numbers of an old .xls), a shapefile's polygons and its
// attribute table. Each reads a Buffer and returns plain values. They read
// what the Census Bureau's files use and refuse the rest rather than guess.
import { inflateRawSync } from 'node:zlib';

/**
 * The files of a zip archive: Map of name -> Buffer. Reads the central
 * directory; entries are stored or deflated. Archives of 4 GB and over
 * (zip64) are refused.
 */
export function unzip(buffer) {
  // The end-of-central-directory record is the last 22 bytes, or sits before a comment.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('Not a zip archive');
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('A zip64 archive is not read here');
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('The zip directory is damaged');
    const method = buffer.readUInt16LE(at + 10);
    const packed = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    // The local header repeats the name and has its own extra field.
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const body = buffer.subarray(start, start + packed);
    if (method === 0) files.set(name, body);
    else if (method === 8) files.set(name, inflateRawSync(body, { maxOutputLength: Math.max(size, 1) }));
    else throw new Error(`${name} is packed in a way this reader does not know (${method})`);
  }
  return files;
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (text) =>
  text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, name) =>
    name[0] === '#' ? String.fromCodePoint(name[1] === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))) : (XML_ENTITIES[name] ?? whole)
  );

/** "AB12" -> the column's position, counting from 0. */
function columnOf(ref) {
  let n = 0;
  for (const ch of ref) {
    if (ch < 'A' || ch > 'Z') break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/**
 * The first sheet of an .xlsx workbook as rows of text (a number comes back
 * as the text it was stored as; an empty cell as ''). Formats are ignored.
 */
export function xlsxRows(buffer) {
  const files = unzip(buffer);
  const sheetName = [...files.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  if (!sheetName) throw new Error('The workbook has no sheet');
  const strings = [];
  const shared = files.get('xl/sharedStrings.xml');
  if (shared) {
    for (const item of shared.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      // A string may be several runs; phonetic runs (<rPh>) are not part of it.
      const body = item[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '');
      strings.push(unescapeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')));
    }
  }
  const rows = [];
  for (const row of files.get(sheetName).toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cell of row[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cell[1]);
      if (!ref) continue;
      const type = /\bt="(\w+)"/.exec(cell[1])?.[1];
      const body = cell[2] ?? '';
      let value = '';
      if (type === 'inlineStr') value = unescapeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
        value = type === 's' ? (strings[Number(v)] ?? '') : unescapeXml(v);
      }
      const at = columnOf(ref[1]);
      while (cells.length < at) cells.push('');
      cells[at] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * The numbers in the first sheet of an old .xls workbook: rows of cells,
 * where a cell is a number or undefined (text is not read). Enough for a
 * table of codes; nothing here reads strings, formulas or formats.
 */
export function xlsNumbers(buffer) {
  if (buffer.readUInt32LE(0) !== 0xe011cfd0 || buffer.readUInt32LE(4) !== 0xe11ab1a1) throw new Error('Not an .xls workbook');
  const sectorSize = 1 << buffer.readUInt16LE(30);
  const sector = (n) => buffer.subarray(512 + n * sectorSize, 512 + (n + 1) * sectorSize);
  // The table of sector chains: its own sectors are listed in the header, then in further sectors.
  const fatSectors = [];
  for (let i = 0; i < 109; i++) {
    const n = buffer.readInt32LE(76 + i * 4);
    if (n >= 0) fatSectors.push(n);
  }
  let more = buffer.readInt32LE(68);
  for (let guard = 0; more >= 0 && guard < 1000; guard++) {
    const block = sector(more);
    for (let i = 0; i < sectorSize / 4 - 1; i++) {
      const n = block.readInt32LE(i * 4);
      if (n >= 0) fatSectors.push(n);
    }
    more = block.readInt32LE(sectorSize - 4);
  }
  const fat = [];
  for (const n of fatSectors) {
    const block = sector(n);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(block.readInt32LE(i * 4));
  }
  const chain = (first) => {
    const parts = [];
    for (let n = first, guard = 0; n >= 0 && guard < fat.length + 1; n = fat[n], guard++) parts.push(sector(n));
    return Buffer.concat(parts);
  };
  const directory = chain(buffer.readInt32LE(48));
  let book = null;
  for (let at = 0; at + 128 <= directory.length; at += 128) {
    const name = directory.toString('utf16le', at, at + Math.max(0, directory.readUInt16LE(at + 64) - 2));
    if (name === 'Workbook' || name === 'Book') {
      const size = directory.readUInt32LE(at + 120);
      if (size < 4096) throw new Error('The workbook is too small to be read here');
      book = chain(directory.readInt32LE(at + 116)).subarray(0, size);
      break;
    }
  }
  if (!book) throw new Error('The .xls file holds no workbook');

  // A compressed number: an integer or a float in 30 bits, optionally divided by 100.
  const rk = (raw) => {
    const value = raw & 2 ? raw >> 2 : Buffer.from(new BigUint64Array([BigInt(raw >>> 2) << 34n]).buffer).readDoubleLE(0);
    return raw & 1 ? value / 100 : value;
  };
  const rows = [];
  const put = (row, column, value) => {
    (rows[row] ??= [])[column] = value;
  };
  // Records: [type, length, body]. The first sheet starts at the second BOF and ends at its EOF.
  let sheets = 0;
  for (let at = 0; at + 4 <= book.length; ) {
    const type = book.readUInt16LE(at);
    const length = book.readUInt16LE(at + 2);
    const body = book.subarray(at + 4, at + 4 + length);
    at += 4 + length;
    if (type === 0x0809) sheets++;
    if (sheets !== 2) continue;
    if (type === 0x000a) break;
    if (type === 0x0203) put(body.readUInt16LE(0), body.readUInt16LE(2), body.readDoubleLE(6));
    else if (type === 0x027e) put(body.readUInt16LE(0), body.readUInt16LE(2), rk(body.readInt32LE(6)));
    else if (type === 0x00bd) {
      const row = body.readUInt16LE(0);
      const first = body.readUInt16LE(2);
      for (let i = 0; 4 + i * 6 + 6 <= length - 2; i++) put(row, first + i, rk(body.readInt32LE(4 + i * 6 + 2)));
    }
  }
  return rows;
}

/**
 * The polygons of a shapefile (.shp): one entry per record, in file order,
 * each { box: [west, south, east, north], rings: [Float64Array of x, y, x, y, ...] }.
 * A record with no shape is null. Only polygon files are read.
 */
export function shpPolygons(buffer) {
  if (buffer.readInt32BE(0) !== 9994) throw new Error('Not a shapefile');
  const kind = buffer.readInt32LE(32);
  if (kind !== 5) throw new Error(`The shapefile holds shapes of type ${kind}, not polygons`);
  const shapes = [];
  for (let at = 100; at + 8 <= buffer.length; ) {
    const length = buffer.readInt32BE(at + 4) * 2;
    const start = at + 8;
    at = start + length;
    const type = buffer.readInt32LE(start);
    if (type === 0) {
      shapes.push(null);
      continue;
    }
    if (type !== 5) throw new Error(`A record holds a shape of type ${type}, not a polygon`);
    const box = [buffer.readDoubleLE(start + 4), buffer.readDoubleLE(start + 12), buffer.readDoubleLE(start + 20), buffer.readDoubleLE(start + 28)];
    const parts = buffer.readInt32LE(start + 36);
    const points = buffer.readInt32LE(start + 40);
    const pointsAt = start + 44 + parts * 4;
    const rings = [];
    for (let p = 0; p < parts; p++) {
      const from = buffer.readInt32LE(start + 44 + p * 4);
      const to = p + 1 < parts ? buffer.readInt32LE(start + 44 + (p + 1) * 4) : points;
      const ring = new Float64Array((to - from) * 2);
      for (let i = from; i < to; i++) {
        ring[(i - from) * 2] = buffer.readDoubleLE(pointsAt + i * 16);
        ring[(i - from) * 2 + 1] = buffer.readDoubleLE(pointsAt + i * 16 + 8);
      }
      rings.push(ring);
    }
    shapes.push({ box, rings });
  }
  return shapes;
}

/** The rows of a shapefile's attribute table (.dbf), in file order: objects of trimmed text by column name. */
export function dbfRows(buffer, encoding = 'utf8') {
  const count = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const rowLength = buffer.readUInt16LE(10);
  const columns = [];
  for (let at = 32; at + 32 <= headerLength && buffer[at] !== 0x0d; at += 32) {
    const nameEnd = buffer.indexOf(0, at);
    columns.push({ name: buffer.toString('ascii', at, Math.min(nameEnd === -1 ? at + 11 : nameEnd, at + 11)), length: buffer[at + 16] });
  }
  const rows = [];
  for (let n = 0; n < count; n++) {
    let at = headerLength + n * rowLength + 1; // the first byte marks a deleted row
    const row = {};
    for (const column of columns) {
      row[column.name] = buffer.toString(encoding, at, at + column.length).trim();
      at += column.length;
    }
    rows.push(row);
  }
  return rows;
}
