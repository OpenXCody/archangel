// The official files the geography keys are built from: what each is, who
// publishes it and where it is downloaded. All are U.S. Government works in
// the public domain, offered for download without a key. They are kept
// outside the repository; only the reduced lists in data/ are committed.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CENSUS = 'U.S. Census Bureau';

export const SOURCES = {
  // County outlines, drawn at the shoreline: what a plant's coordinates are tested against.
  boundaries: {
    file: 'cb_2024_us_county_500k.zip',
    url: 'https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_500k.zip',
    name: 'Cartographic Boundary Files, counties, 1:500,000, 2024',
    publisher: CENSUS,
    about: 'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html',
  },
  // Every county and county equivalent, by code, with its name and a point inside it.
  counties: {
    file: '2024_Gaz_counties_national.zip',
    url: 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip',
    name: 'U.S. Gazetteer Files, counties, 2024',
    publisher: CENSUS,
    about: 'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html',
  },
  // Which counties make up each metropolitan and micropolitan area.
  metros: {
    file: 'list1_2023.xlsx',
    url: 'https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx',
    name: 'Core based statistical areas, delineation file, July 2023 (OMB Bulletin 23-01)',
    publisher: CENSUS,
    about: 'https://www.census.gov/geographies/reference-files/time-series/demo/metro-micro/delineation-files.html',
  },
  naics: {
    file: '2-6 digit_2022_Codes.xlsx',
    url: 'https://www.census.gov/naics/2022NAICS/2-6%20digit_2022_Codes.xlsx',
    name: '2022 NAICS, 2-6 digit codes',
    publisher: CENSUS,
    about: 'https://www.census.gov/naics/',
  },
  naics2017: {
    file: '2022_to_2017_NAICS.xlsx',
    url: 'https://www.census.gov/naics/concordances/2022_to_2017_NAICS.xlsx',
    name: '2022 NAICS to 2017 NAICS concordance',
    publisher: CENSUS,
    about: 'https://www.census.gov/naics/?68967',
  },
  naics2012: {
    file: '2017_to_2012_NAICS.xlsx',
    url: 'https://www.census.gov/naics/concordances/2017_to_2012_NAICS.xlsx',
    name: '2017 NAICS to 2012 NAICS concordance',
    publisher: CENSUS,
    about: 'https://www.census.gov/naics/?68967',
  },
  naics2007: {
    file: '2012_to_2007_NAICS.xls',
    url: 'https://www.census.gov/naics/concordances/2012_to_2007_NAICS.xls',
    name: '2012 NAICS to 2007 NAICS concordance',
    publisher: CENSUS,
    about: 'https://www.census.gov/naics/?68967',
  },
};

/** Where downloads are kept when no folder is named: the system's temporary folder, never the repository. */
export const DEFAULT_DIR = path.join(tmpdir(), 'geo-reference');

/**
 * One source's file as a Buffer, from `dir`. With `fetchMissing` a file that
 * is not there is downloaded once and kept; without it a missing file is an
 * error that names the address to download. A refusal from the publisher is
 * reported as it is and not tried again.
 */
export async function sourceFile(key, { dir = DEFAULT_DIR, fetchMissing = false, log = console.log } = {}) {
  const source = SOURCES[key];
  const file = path.join(dir, source.file);
  const there = await stat(file).then((s) => s.size > 0, () => false);
  if (!there) {
    if (!fetchMissing) throw new Error(`${file} is not there. Download ${source.url} into ${dir}, or run with --fetch.`);
    await mkdir(dir, { recursive: true });
    log(`fetching ${source.url}`);
    const response = await fetch(source.url, { headers: { 'User-Agent': 'geo-reference' } });
    if (!response.ok) throw new Error(`${source.url} answered ${response.status}. Not tried again: download it by hand into ${dir} if the publisher allows.`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  return readFile(file);
}

/** How a source is recorded in a reduced file. */
export const cite = (key, retrieved) => {
  const { name, publisher, url, about } = SOURCES[key];
  return { name, publisher, url, about, retrieved };
};
