/**
 * Company Name Normalization System
 *
 * Maps various company name variations to their canonical/display names.
 * Handles patterns like:
 * - "THE BOEING COMPANY" → "Boeing"
 * - "BOEING CO" → "Boeing"
 * - "BOEING*" → "Boeing"
 */

export interface CompanyRule {
  patterns: RegExp[];
  canonical: string;
}

// Company normalization rules - order matters (more specific patterns first)
export const COMPANY_RULES: CompanyRule[] = [
  // Aerospace & Defense
  {
    patterns: [
      /\bBOEING\b/i,
      /\bTHE\s+BOEING\s+COMPANY\b/i,
      /\bBOEING\s+CO\.?\b/i,
    ],
    canonical: 'Boeing',
  },
  {
    patterns: [
      /\bLOCKHEED\s*MARTIN\b/i,
      /\bLOCKHEED\b/i,
      /\bLMT\b/i,
    ],
    canonical: 'Lockheed Martin',
  },
  {
    patterns: [
      /\bNORTHROP\s*GRUMMAN\b/i,
      /\bNORTHROP\b/i,
      /\bGRUMMAN\b/i,
      /\bNGC\b/i,
    ],
    canonical: 'Northrop Grumman',
  },
  {
    patterns: [
      /\bRAYTHEON\b/i,
      /\bRTX\b/i,
      /\bRAYTHEON\s+TECHNOLOGIES\b/i,
      /\bRAYTHEON\s+MISSILES\b/i,
    ],
    canonical: 'Raytheon',
  },
  {
    patterns: [
      /\bGENERAL\s+DYNAMICS\b/i,
      /\bGD\s+LAND\s+SYSTEMS\b/i,
      /\bGD\s+ELECTRIC\s+BOAT\b/i,
    ],
    canonical: 'General Dynamics',
  },
  {
    patterns: [
      /\bL3\s*HARRIS\b/i,
      /\bL3HARRIS\b/i,
      /\bHARRIS\s+CORP/i,
    ],
    canonical: 'L3Harris',
  },
  {
    patterns: [
      /\bBAE\s+SYSTEMS\b/i,
      /\bBAE\b/i,
    ],
    canonical: 'BAE Systems',
  },

  // Textron family
  {
    patterns: [
      /\bTEXTRON\b/i,
      /\bBEECHCRAFT\b/i,
      /\bCESSNA\b/i,
      /\bBELL\s+(HELICOPTER|TEXTRON)/i,
      /\bTEXTRON\s+AVIATION\b/i,
      /\bTEXTRON\s+SYSTEMS\b/i,
    ],
    canonical: 'Textron',
  },

  // Automotive
  {
    patterns: [
      /\bFORD\s+MOTOR\b/i,
      /\bFORD\b/i,
    ],
    canonical: 'Ford',
  },
  {
    patterns: [
      /\bGENERAL\s+MOTORS\b/i,
      /\bGM\s+MANUFACTURING\b/i,
      /\bCHEVROLET\b/i,
      /\bCADILLAC\b/i,
      /\bBUICK\b/i,
      /\bGMC\b/i,
    ],
    canonical: 'General Motors',
  },
  {
    patterns: [
      /\bTESLA\b/i,
      /\bTESLA\s+MOTORS\b/i,
      /\bTESLA\s+ENERGY\b/i,
      /\bTESLA,?\s*INC\.?\b/i,
    ],
    canonical: 'Tesla',
  },
  {
    patterns: [
      /\bTOYOTA\b/i,
      /\bLEXUS\b/i,
    ],
    canonical: 'Toyota',
  },
  {
    patterns: [
      /\bHONDA\b/i,
      /\bACURA\b/i,
    ],
    canonical: 'Honda',
  },

  // Heavy Equipment & Industrial
  {
    patterns: [
      /\bCATERPILLAR\b/i,
      /\bCAT\s+INC\b/i,
    ],
    canonical: 'Caterpillar',
  },
  {
    patterns: [
      /\bJOHN\s+DEERE\b/i,
      /\bDEERE\s+(&|AND)\s+CO/i,
      /\bDEERE\b/i,
    ],
    canonical: 'John Deere',
  },
  {
    patterns: [
      /\bCUMMINS\b/i,
    ],
    canonical: 'Cummins',
  },
  {
    patterns: [
      /\bPACCAR\b/i,
      /\bKENWORTH\b/i,
      /\bPETERBILT\b/i,
    ],
    canonical: 'PACCAR',
  },

  // Technology & Electronics
  {
    patterns: [
      /\bAPPLE\s+INC\b/i,
      /\bAPPLE\b/i,
    ],
    canonical: 'Apple',
  },
  {
    patterns: [
      /\bINTEL\s+CORP/i,
      /\bINTEL\b/i,
    ],
    canonical: 'Intel',
  },
  {
    patterns: [
      /\bMICRON\s+TECHNOLOGY\b/i,
      /\bMICRON\b/i,
    ],
    canonical: 'Micron',
  },
  {
    patterns: [
      /\bTEXAS\s+INSTRUMENTS\b/i,
      /\bTI\s+INC\b/i,
    ],
    canonical: 'Texas Instruments',
  },

  // Steel & Metals
  {
    patterns: [
      /\bNUCOR\b/i,
    ],
    canonical: 'Nucor',
  },
  {
    patterns: [
      /\bU\.?S\.?\s+STEEL\b/i,
      /\bUNITED\s+STATES\s+STEEL\b/i,
    ],
    canonical: 'U.S. Steel',
  },
  {
    patterns: [
      /\bALCOA\b/i,
    ],
    canonical: 'Alcoa',
  },

  // Consumer Goods & Food
  {
    patterns: [
      /\bPROCTER\s*(&|AND)\s*GAMBLE\b/i,
      /\bP\s*&\s*G\b/i,
    ],
    canonical: 'Procter & Gamble',
  },
  {
    patterns: [
      /\b3M\s+COMPANY\b/i,
      /\b3M\b/i,
    ],
    canonical: '3M',
  },
  {
    patterns: [
      /\bJOHNSON\s*(&|AND)\s*JOHNSON\b/i,
      /\bJ\s*&\s*J\b/i,
    ],
    canonical: 'Johnson & Johnson',
  },

  // Energy
  {
    patterns: [
      /\bEXXON\s*MOBIL\b/i,
      /\bEXXON\b/i,
      /\bMOBIL\b/i,
    ],
    canonical: 'ExxonMobil',
  },
  {
    patterns: [
      /\bCHEVRON\s+CORP/i,
      /\bCHEVRON\b/i,
    ],
    canonical: 'Chevron',
  },
];

/**
 * Normalize a company name to its canonical form
 */
export function normalizeCompanyName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return rawName;
  }

  const trimmed = rawName.trim();

  // Check each rule
  for (const rule of COMPANY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) {
        return rule.canonical;
      }
    }
  }

  // No match - apply basic cleanup
  return cleanCompanyName(trimmed);
}

/**
 * Clean up a company name that didn't match any rules
 * - Remove common suffixes (INC, LLC, CORP, etc.)
 * - Convert to title case
 * - Remove "THE" prefix
 */
export function cleanCompanyName(name: string): string {
  if (!name) return name;

  let cleaned = name
    // Remove common legal suffixes
    .replace(/,?\s*(INC\.?|INCORPORATED|LLC|L\.L\.C\.?|LTD\.?|LIMITED|CORP\.?|CORPORATION|CO\.?|COMPANY)$/gi, '')
    // Remove "THE" prefix
    .replace(/^THE\s+/i, '')
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Convert to title case
  cleaned = toTitleCase(cleaned);

  return cleaned;
}

/**
 * Convert string to Title Case
 */
function toTitleCase(str: string): string {
  // Words that should stay lowercase (unless first word)
  const lowercaseWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of']);

  // Words/acronyms that should stay uppercase
  const uppercaseWords = new Set(['USA', 'US', 'UK', 'LLC', 'LLP', 'IBM', 'GE', 'GM', 'HP', 'IT', 'AI', 'CEO', 'CFO', 'CTO']);

  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (uppercaseWords.has(upper)) {
        return upper;
      }
      if (index > 0 && lowercaseWords.has(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Extract company name from a facility/factory name
 * e.g., "BOEING COMPANY THE - MESA FACILITY" → "Boeing"
 */
export function extractCompanyFromFacilityName(facilityName: string): string | null {
  if (!facilityName) return null;

  // Try to match known company patterns
  for (const rule of COMPANY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(facilityName)) {
        return rule.canonical;
      }
    }
  }

  // Try to extract company name before common separators
  const separators = [' - ', ' – ', ' — ', ' / ', ', '];
  for (const sep of separators) {
    const idx = facilityName.indexOf(sep);
    if (idx > 0) {
      const potentialCompany = facilityName.substring(0, idx).trim();
      // Recursively try to normalize
      const normalized = normalizeCompanyName(potentialCompany);
      if (normalized !== potentialCompany) {
        return normalized;
      }
      return cleanCompanyName(potentialCompany);
    }
  }

  return null;
}

/**
 * Generate a factory name from company name and location
 */
export function generateFactoryName(
  companyName: string,
  city?: string | null,
  state?: string | null,
  suffix: string = 'Plant'
): string {
  const parts: string[] = [];

  // Get the short company name
  const shortName = normalizeCompanyName(companyName);
  parts.push(shortName);

  // Add city if available
  if (city) {
    // Clean up city name
    const cleanCity = toTitleCase(city.trim());
    parts.push(cleanCity);
  } else if (state) {
    // Use state if no city
    parts.push(state.toUpperCase());
  }

  // Add suffix
  parts.push(suffix);

  return parts.join(' ');
}

/**
 * Check if a row has valid location data
 * Returns: 'valid' | 'address_only' | 'invalid'
 */
export function checkLocationData(row: {
  latitude?: string | number | null;
  longitude?: string | number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): 'valid' | 'address_only' | 'invalid' {
  // Check for valid coordinates
  const hasLat = row.latitude != null && row.latitude !== '' && !isNaN(Number(row.latitude));
  const hasLng = row.longitude != null && row.longitude !== '' && !isNaN(Number(row.longitude));

  if (hasLat && hasLng) {
    return 'valid';
  }

  // Check for address data
  const hasAddress = !!(row.address && row.address.toString().trim());
  const hasCity = !!(row.city && row.city.toString().trim());
  const hasState = !!(row.state && row.state.toString().trim());
  const hasZip = !!(row.zip && row.zip.toString().trim());

  // Need at least address+city or address+state or city+state
  if ((hasAddress && hasCity) || (hasAddress && hasState) || (hasCity && hasState) || hasZip) {
    return 'address_only';
  }

  return 'invalid';
}

// Export types for use in other modules
export type LocationStatus = ReturnType<typeof checkLocationData>;
