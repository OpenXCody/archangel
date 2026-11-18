/**
 * Industries as the app says them, on the map and on a career's page alike.
 * The data carries the 21 NAICS manufacturing subsectors by their full titles
 * ("Fabricated Metal Product Manufacturing"); in a product about
 * manufacturing the last word says nothing, and the rest reads better as
 * plain words.
 */
const SHORT: Record<string, string> = {
  'Apparel Manufacturing': 'Apparel',
  'Beverage and Tobacco Product Manufacturing': 'Beverages and tobacco',
  'Chemical Manufacturing': 'Chemicals',
  'Computer and Electronic Product Manufacturing': 'Computers and electronics',
  'Electrical Equipment, Appliance, and Component Manufacturing': 'Electrical equipment and appliances',
  'Fabricated Metal Product Manufacturing': 'Fabricated metal products',
  'Food Manufacturing': 'Food',
  'Furniture and Related Product Manufacturing': 'Furniture',
  'Leather and Allied Product Manufacturing': 'Leather products',
  'Machinery Manufacturing': 'Machinery',
  'Miscellaneous Manufacturing': 'Miscellaneous',
  'Nonmetallic Mineral Product Manufacturing': 'Glass, cement and minerals',
  'Paper Manufacturing': 'Paper',
  'Petroleum and Coal Products Manufacturing': 'Petroleum and coal products',
  'Plastics and Rubber Products Manufacturing': 'Plastics and rubber',
  'Primary Metal Manufacturing': 'Primary metals',
  'Printing and Related Support Activities': 'Printing',
  'Textile Mills': 'Textile mills',
  'Textile Product Mills': 'Textile products',
  'Transportation Equipment Manufacturing': 'Transportation equipment',
  'Wood Product Manufacturing': 'Wood products',
};

/** "Fabricated Metal Product Manufacturing" as "Fabricated metal products". */
export function industryLabel(name: string): string {
  return SHORT[name] ?? name.replace(/\s+Manufacturing$/i, '');
}

/**
 * The 21 manufacturing subsectors, in NAICS order. `name` is the title a
 * plant carries (factories.primary_naics_description); `slug` is the
 * industry's page (/industries/chemicals); `code` is the NAICS subsector the
 * official statistics are published under.
 */
export const INDUSTRIES = [
  { code: '311', slug: 'food', name: 'Food Manufacturing' },
  { code: '312', slug: 'beverages-tobacco', name: 'Beverage and Tobacco Product Manufacturing' },
  { code: '313', slug: 'textile-mills', name: 'Textile Mills' },
  { code: '314', slug: 'textile-products', name: 'Textile Product Mills' },
  { code: '315', slug: 'apparel', name: 'Apparel Manufacturing' },
  { code: '316', slug: 'leather', name: 'Leather and Allied Product Manufacturing' },
  { code: '321', slug: 'wood', name: 'Wood Product Manufacturing' },
  { code: '322', slug: 'paper', name: 'Paper Manufacturing' },
  { code: '323', slug: 'printing', name: 'Printing and Related Support Activities' },
  { code: '324', slug: 'petroleum-coal', name: 'Petroleum and Coal Products Manufacturing' },
  { code: '325', slug: 'chemicals', name: 'Chemical Manufacturing' },
  { code: '326', slug: 'plastics-rubber', name: 'Plastics and Rubber Products Manufacturing' },
  { code: '327', slug: 'glass-cement', name: 'Nonmetallic Mineral Product Manufacturing' },
  { code: '331', slug: 'primary-metals', name: 'Primary Metal Manufacturing' },
  { code: '332', slug: 'fabricated-metals', name: 'Fabricated Metal Product Manufacturing' },
  { code: '333', slug: 'machinery', name: 'Machinery Manufacturing' },
  { code: '334', slug: 'electronics', name: 'Computer and Electronic Product Manufacturing' },
  { code: '335', slug: 'electrical-equipment', name: 'Electrical Equipment, Appliance, and Component Manufacturing' },
  { code: '336', slug: 'transportation-equipment', name: 'Transportation Equipment Manufacturing' },
  { code: '337', slug: 'furniture', name: 'Furniture and Related Product Manufacturing' },
  { code: '339', slug: 'miscellaneous', name: 'Miscellaneous Manufacturing' },
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/** Manufacturing as a whole, as the official statistics code it. */
export const MANUFACTURING_CODE = '31-33';

const BY_SLUG: Record<string, Industry> = Object.fromEntries(INDUSTRIES.map((industry) => [industry.slug, industry]));
const BY_NAME: Record<string, Industry> = Object.fromEntries(INDUSTRIES.map((industry) => [industry.name.toLowerCase(), industry]));

/** The industry a page address names, or undefined. */
export function industryBySlug(slug: string | null | undefined): Industry | undefined {
  return slug ? BY_SLUG[slug.toLowerCase()] : undefined;
}

/** The industry a plant's classification names ("Chemical Manufacturing"), or undefined. */
export function industryByName(name: string | null | undefined): Industry | undefined {
  return name ? BY_NAME[name.trim().toLowerCase()] : undefined;
}

/**
 * The address of an industry's page, by the name a plant carries, narrowed to
 * a place when one is given: a state code, or a focus area's id. Null when
 * the name is not one of the 21, so a caller leaves the text unlinked.
 */
export function industryPath(name: string | null | undefined, place?: { state?: string | null; area?: string | null }): string | null {
  const industry = industryByName(name);
  if (!industry) return null;
  const query = place?.area ? `?area=${encodeURIComponent(place.area)}` : place?.state ? `?state=${encodeURIComponent(place.state)}` : '';
  return `/industries/${industry.slug}${query}`;
}
