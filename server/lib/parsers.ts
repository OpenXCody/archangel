import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface ParsedFile {
  fileId: string;
  fileName: string;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, unknown>[];
  allRows: Record<string, unknown>[];
  sheets?: string[];
}

export interface ParseOptions {
  sheetName?: string;
}

/**
 * Parse a CSV file and return structured data
 */
export function parseCSV(filePath: string, fileName: string, fileId: string): ParsedFile {
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  const result = Papa.parse<Record<string, unknown>>(fileContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    const firstError = result.errors[0];
    throw new Error(`CSV parse error at row ${firstError.row}: ${firstError.message}`);
  }

  const allRows = result.data;
  const columns = result.meta.fields || [];
  const sampleRows = allRows.slice(0, 100);

  return {
    fileId,
    fileName,
    rowCount: allRows.length,
    columns,
    sampleRows,
    allRows,
  };
}

/**
 * Parse an Excel file and return structured data
 */
export function parseExcel(
  filePath: string,
  fileName: string,
  fileId: string,
  options?: ParseOptions
): ParsedFile {
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    throw new Error('Excel file contains no sheets');
  }

  const sheetName = options?.sheetName || sheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" not found in Excel file`);
  }

  const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
  });

  if (allRows.length === 0) {
    throw new Error('Sheet contains no data');
  }

  const columns = Object.keys(allRows[0] || {});
  const sampleRows = allRows.slice(0, 100);

  return {
    fileId,
    fileName,
    rowCount: allRows.length,
    columns,
    sampleRows,
    allRows,
    sheets: sheetNames,
  };
}

/**
 * Parse a JSON file and return structured data
 */
export function parseJSON(filePath: string, fileName: string, fileId: string): ParsedFile {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(fileContent);

  let allRows: Record<string, unknown>[];

  if (Array.isArray(parsed)) {
    allRows = parsed;
  } else if (parsed && typeof parsed === 'object') {
    // Single object, wrap in array
    allRows = [parsed];
  } else {
    throw new Error('JSON file must contain an array or object');
  }

  if (allRows.length === 0) {
    throw new Error('JSON file contains no data');
  }

  // Extract columns from all rows to handle sparse objects
  const columnSet = new Set<string>();
  for (const row of allRows) {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach((key) => columnSet.add(key));
    }
  }

  const columns = Array.from(columnSet);
  const sampleRows = allRows.slice(0, 100);

  return {
    fileId,
    fileName,
    rowCount: allRows.length,
    columns,
    sampleRows,
    allRows,
  };
}

/**
 * Detect file type and parse accordingly
 */
export function parseFile(
  filePath: string,
  fileName: string,
  fileId: string,
  options?: ParseOptions
): ParsedFile {
  const ext = path.extname(fileName).toLowerCase();

  switch (ext) {
    case '.csv':
      return parseCSV(filePath, fileName, fileId);
    case '.xlsx':
    case '.xls':
      return parseExcel(filePath, fileName, fileId, options);
    case '.json':
      return parseJSON(filePath, fileName, fileId);
    default:
      throw new Error(`Unsupported file format: ${ext}. Supported formats: .csv, .xlsx, .xls, .json`);
  }
}

/**
 * Column mapping hints for auto-detection (ordered by specificity)
 */
export const COLUMN_MAPPING_HINTS: Record<string, { aliases: string[]; dataType: 'numeric' | 'text' | 'state' }> = {
  // Coordinate fields - must be numeric
  latitude: { aliases: ['latitude', 'lat', 'lat_dd', 'factory_lat', 'coord_lat', 'y_coord'], dataType: 'numeric' },
  longitude: { aliases: ['longitude', 'lng', 'lon', 'long', 'long_dd', 'factory_lng', 'coord_lng', 'x_coord'], dataType: 'numeric' },
  headquartersLat: { aliases: ['headquarters_lat', 'hq_lat', 'hq_latitude'], dataType: 'numeric' },
  headquartersLng: { aliases: ['headquarters_lng', 'hq_lng', 'hq_longitude', 'hq_lon'], dataType: 'numeric' },

  // Location text fields
  address: { aliases: ['address', 'street', 'street_address', 'addr', 'location_address', 'physical_address'], dataType: 'text' },
  city: { aliases: ['city', 'town', 'municipality', 'locality'], dataType: 'text' },
  state: { aliases: ['state', 'state_code', 'st', 'province', 'region', 'state_abbr'], dataType: 'state' },
  country: { aliases: ['country', 'nation', 'country_code', 'ctry'], dataType: 'text' },
  zipCode: { aliases: ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'postcode'], dataType: 'text' },

  // Entity name fields
  name: { aliases: ['name', 'facility_name', 'factory_name', 'site_name', 'plant_name', 'facility', 'company_name'], dataType: 'text' },
  title: { aliases: ['title', 'job_title', 'occupation', 'position', 'role', 'occupation_title'], dataType: 'text' },
  companyName: { aliases: ['company_name', 'parent_company', 'owner', 'employer', 'corporation'], dataType: 'text' },
  companyId: { aliases: ['company_id', 'companyid', 'parent_id'], dataType: 'text' },

  // Other fields
  industry: { aliases: ['industry', 'sector', 'business_type'], dataType: 'text' },
  description: { aliases: ['description', 'desc', 'about', 'summary', 'notes', 'details'], dataType: 'text' },
  specialization: { aliases: ['specialization', 'specialty', 'focus', 'product', 'product_line'], dataType: 'text' },
  workforceSize: { aliases: ['workforce', 'workforce_size', 'employees', 'employee_count', 'headcount', 'emp_count', 'num_employees', 'worker_count'], dataType: 'numeric' },
  openPositions: { aliases: ['open_positions', 'openings', 'vacancies', 'jobs', 'hiring'], dataType: 'numeric' },
  onetCode: { aliases: ['onet', 'onet_code', 'o_net', 'soc', 'soc_code'], dataType: 'text' },
  category: { aliases: ['category', 'cat', 'group', 'skill_category', 'skill_type', 'classification'], dataType: 'text' },

  // Industry classification (NAICS, stored as reference on factory)
  primaryNaics: { aliases: ['naics', 'naics_code', 'primary_naics', 'naics_primary'], dataType: 'text' },
  primaryNaicsDescription: { aliases: ['naics_description', 'primary_naics_description', 'naics_desc', 'naics_label'], dataType: 'text' },

  // Data provenance (from Pillar golden records)
  sourceCount: { aliases: ['source_count', 'sources_count', 'num_sources'], dataType: 'numeric' },
  confidence: { aliases: ['confidence', 'confidence_score', 'match_confidence'], dataType: 'numeric' },

  // External reference — not a factory column; handled via external_references post-insert
  epaRegistryId: { aliases: ['epa_registry_id', 'epa_id', 'frs_id', 'epa_frs'], dataType: 'text' },
};

/**
 * Check if a value looks numeric
 */
function isNumericValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return !isNaN(num) && isFinite(num);
}

/**
 * Check if a value looks like a valid coordinate
 */
function isLikelyCoordinate(value: unknown, type: 'lat' | 'lng'): boolean {
  if (!isNumericValue(value)) return false;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (type === 'lat') return num >= -90 && num <= 90;
  if (type === 'lng') return num >= -180 && num <= 180;
  return false;
}

/**
 * Check if value contains letters (is text)
 */
function isTextValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  return /[a-zA-Z]/.test(String(value));
}

/**
 * Suggest column mappings based on fuzzy matching AND data type validation
 */
export function suggestColumnMappings(
  columns: string[],
  entityType: string,
  sampleRows?: Record<string, unknown>[]
): { mappings: Record<string, string | null>; unmappedColumns: string[]; missingRequired: string[] } {
  const targetFields = getTargetFieldsForEntity(entityType);
  const mappings: Record<string, string | null> = {};
  const mappedTargets = new Set<string>();

  // Normalize column names for comparison
  const normalizeColumn = (col: string) => col.toLowerCase().replace(/[_\-\s]+/g, '');

  // Get sample value for a column
  const getSampleValue = (column: string): unknown => {
    if (!sampleRows || sampleRows.length === 0) return null;
    return sampleRows[0]?.[column];
  };

  for (const column of columns) {
    const normalizedCol = normalizeColumn(column);
    const sampleValue = getSampleValue(column);
    let bestMatch: string | null = null;

    for (const [targetField, config] of Object.entries(COLUMN_MAPPING_HINTS)) {
      if (!targetFields.includes(targetField)) continue;
      if (mappedTargets.has(targetField)) continue;

      const { aliases, dataType } = config;

      for (const alias of aliases) {
        const normalizedAlias = normalizeColumn(alias);
        const isMatch = normalizedCol === normalizedAlias || normalizedCol.includes(normalizedAlias);

        if (isMatch) {
          // Validate data type if we have sample data
          if (sampleValue !== null && sampleValue !== undefined) {
            // For numeric fields, verify sample is numeric
            if (dataType === 'numeric') {
              if (!isNumericValue(sampleValue)) continue;
              // Extra validation for coordinates
              if (targetField === 'latitude' || targetField === 'headquartersLat') {
                if (!isLikelyCoordinate(sampleValue, 'lat')) continue;
              }
              if (targetField === 'longitude' || targetField === 'headquartersLng') {
                if (!isLikelyCoordinate(sampleValue, 'lng')) continue;
              }
            }
            // For text fields mapped from columns that look like coords, skip if value is numeric
            if (dataType === 'text') {
              const looksLikeCoordColumn = /lat|lng|lon|coord/i.test(column);
              if (looksLikeCoordColumn && isNumericValue(sampleValue) && !isTextValue(sampleValue)) {
                continue;
              }
            }
          }

          bestMatch = targetField;
          break;
        }
      }

      if (bestMatch) break;
    }

    if (bestMatch) {
      mappings[column] = bestMatch;
      mappedTargets.add(bestMatch);
    } else {
      mappings[column] = null;
    }
  }

  const unmappedColumns = columns.filter((col) => mappings[col] === null);
  const requiredFields = getRequiredFieldsForEntity(entityType);
  const missingRequired = requiredFields.filter((field) => !mappedTargets.has(field));

  return { mappings, unmappedColumns, missingRequired };
}

/**
 * Get target fields available for an entity type
 */
function getTargetFieldsForEntity(entityType: string): string[] {
  switch (entityType) {
    case 'companies':
      return ['name', 'industry', 'description', 'headquartersLat', 'headquartersLng'];
    case 'factories':
      return [
        'name', 'companyId', 'companyName', 'address', 'city', 'state', 'country', 'zipCode',
        'latitude', 'longitude', 'specialization', 'description', 'workforceSize', 'openPositions',
        'primaryNaics', 'primaryNaicsDescription', 'sourceCount', 'confidence', 'epaRegistryId',
      ];
    case 'occupations':
      return ['title', 'description', 'onetCode'];
    case 'skills':
      return ['name', 'category', 'description'];
    default:
      return [];
  }
}

/**
 * Get required fields for an entity type
 * Note: latitude/longitude are no longer strictly required since we support address-only imports
 */
function getRequiredFieldsForEntity(entityType: string): string[] {
  switch (entityType) {
    case 'companies':
      return ['name'];
    case 'factories':
      return ['name']; // coords can be null if address is provided
    case 'occupations':
      return ['title'];
    case 'skills':
      return ['name'];
    default:
      return [];
  }
}
