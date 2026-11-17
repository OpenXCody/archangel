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
