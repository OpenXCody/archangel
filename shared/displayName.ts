// Display-layer helpers for cleaning up factory/company names that come
// from the Pillar bulk import. The raw records are frequently ALL CAPS with
// EPA registry prefixes ("105123 - CATERPILLAR…"), stray annotations
// ("(FORMER WOODS EQUIPMENT CO)"), and address-style leaders.
//
// These helpers only touch presentation — the canonical name in the DB is
// preserved so search, dedup, and exports stay stable.

const ACRONYMS = new Set([
  'LLC', 'INC', 'CO', 'CORP', 'LP', 'LLP', 'PLLC', 'LTD', 'PC',
  'USA', 'US', 'UK', 'EU', 'LA', 'SF', 'NYC', 'DC', 'NY',
  'HVAC', 'PCB', 'CNC', 'IT', 'IP', 'AI', 'ML', 'RV',
  'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX',
  'TX', 'CA', 'FL', 'IL', 'MI', 'WA', 'OR', 'AZ', 'NV', 'CO', 'GA',
  // Common corporate acronyms observed in the dataset
  'ADM', 'BASF', 'BAE', 'BMW', 'BP', 'CEMEX', 'APAC', 'AECOM', 'AMD',
  'GE', 'GM', 'IBM', 'HP', 'AT&T', 'JP', 'UPS', 'FMC', 'FCA',
  'PPG', 'RPM', 'TDK', 'KLA', 'TSMC', 'ASML', 'NXP', 'ST', 'SK',
]);

const LOWERCASE_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on',
  'or', 'the', 'to', 'vs', 'with',
]);

function titleCaseWord(word: string, isFirst: boolean): string {
  if (!word) return word;
  // Strip surrounding punctuation so "(PROPERTY" and "%CBE" map correctly.
  const match = word.match(/^([^A-Za-z0-9]*)([A-Za-z0-9].*?)([^A-Za-z0-9]*)$/);
  if (!match) return word;
  const [, leading, core, trailing] = match;
  const upper = core.toUpperCase();
  if (ACRONYMS.has(upper)) return leading + upper + trailing;
  const lower = core.toLowerCase();
  if (!isFirst && LOWERCASE_WORDS.has(lower)) return leading + lower + trailing;
  // Preserve hyphenated chunks ("3M-Dyneon" → "3M-Dyneon")
  if (core.includes('-')) {
    return leading + core.split('-').map((p, i) => titleCaseWord(p, i === 0 && isFirst)).join('-') + trailing;
  }
  // Handles possessive/curly punctuation ("O'BRIEN" → "O'Brien")
  if (core.includes("'")) {
    return leading + core.split("'").map((p, i) => titleCaseWord(p, i === 0 && isFirst)).join("'") + trailing;
  }
  return leading + lower.charAt(0).toUpperCase() + lower.slice(1) + trailing;
}

function fixAcronymsInPlace(name: string): string {
  // Even if the source is already properly cased, we still want known
  // corporate acronyms to be ALL CAPS ("Cemex" → "CEMEX", "Basf" → "BASF").
  return name
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return chunk;
      const match = chunk.match(/^([^A-Za-z0-9]*)([A-Za-z0-9].*?)([^A-Za-z0-9]*)$/);
      if (!match) return chunk;
      const [, leading, core, trailing] = match;
      if (ACRONYMS.has(core.toUpperCase())) {
        return leading + core.toUpperCase() + trailing;
      }
      return chunk;
    })
    .join('');
}

function smartTitleCase(name: string): string {
  // Only title-case if the input is majority uppercase — otherwise respect
  // whatever the source already provided (but still fix known acronyms).
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return name;
  const upperRatio = [...letters].filter((c) => c === c.toUpperCase()).length / letters.length;
  if (upperRatio < 0.7) return fixAcronymsInPlace(name);
  return name
    .split(/(\s+)/)
    .map((chunk, i) => (/^\s+$/.test(chunk) ? chunk : titleCaseWord(chunk, i === 0)))
    .join('');
}

export function formatFactoryName(raw: string | null | undefined): string {
  if (!raw) return '';
  let name = raw.trim();

  // Strip EPA-style registry prefixes: "105123 - FOO", "#411 - FOO".
  // Require whitespace before the dash so compound names like
  // "1-2-3 Copy Center" are left alone.
  name = name.replace(/^#?\d+\s+[-–]\s*/, '');

  // Strip trailing EPA ID in parens: "… (0145000399)"
  name = name.replace(/\s*\(\d{4,}[-\d]*\)\s*$/, '');

  // Strip a bare "(FORMER …)" that's the entire name — leaves nothing
  // useful, so fall back to the original trimmed string.
  const strippedFormer = name.replace(/^\(FORMER\s+[^)]+\)\s*$/i, '').trim();
  if (strippedFormer) name = strippedFormer;

  // Collapse double spaces
  name = name.replace(/\s{2,}/g, ' ');

  return smartTitleCase(name);
}

export function formatCompanyName(raw: string | null | undefined): string {
  if (!raw) return '';
  return smartTitleCase(raw.trim());
}
