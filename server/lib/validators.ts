import { db, companies, factories, occupations, skills } from '../db';

export type EntityType = 'companies' | 'factories' | 'occupations' | 'skills';

export type ErrorType =
  | 'missing_required'
  | 'duplicate_exact'
  | 'potential_alias'
  | 'unlinked_relationship'
  | 'invalid_format'
  | 'out_of_range';

export interface ValidationError {
  row: number;
  errorType: ErrorType;
  field: string;
  value: unknown;
  suggestion: string | null;
}

export interface PotentialDuplicate {
  incomingRow: number;
  incomingValue: string;
  existingId: string;
  existingValue: string;
  confidence: number;
}

export interface ValidationResult {
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  errors: ValidationError[];
  potentialDuplicates: PotentialDuplicate[];
  validRows: number[];
  errorRows: number[];
}

export interface MappedRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

/**
 * Map source data to target fields using column mappings
 */
export function mapRowsToFields(
  rows: Record<string, unknown>[],
  mappings: Record<string, string | null>
): MappedRow[] {
  return rows.map((row, index) => {
    const mappedData: Record<string, unknown> = {};

    for (const [sourceCol, targetField] of Object.entries(mappings)) {
      if (targetField && row[sourceCol] !== undefined) {
        mappedData[targetField] = row[sourceCol];
      }
    }

    return {
      rowNumber: index + 1, // 1-indexed for user-friendly display
      data: mappedData,
    };
  });
}

/**
 * Validate all rows for a given entity type
 */
export async function validateRows(
  mappedRows: MappedRow[],
  entityType: EntityType
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const potentialDuplicates: PotentialDuplicate[] = [];
  const validRows: number[] = [];
  const errorRows: number[] = [];

  // Load existing entities for duplicate checking
  const existingEntities = await loadExistingEntities(entityType);

  for (const { rowNumber, data } of mappedRows) {
    const rowErrors = await validateRow(data, entityType, rowNumber, existingEntities);

    if (rowErrors.length > 0) {
      const hasBlockingError = rowErrors.some(
        (e) => e.errorType === 'missing_required' || e.errorType === 'invalid_format' || e.errorType === 'unlinked_relationship'
      );

      if (hasBlockingError) {
        errorRows.push(rowNumber);
      } else {
        validRows.push(rowNumber);
      }

      errors.push(...rowErrors);
    } else {
      validRows.push(rowNumber);
    }

    // Check for duplicates
    const duplicate = checkForDuplicate(data, entityType, rowNumber, existingEntities);
    if (duplicate) {
      potentialDuplicates.push(duplicate);
    }
  }

  const warningCount = errors.filter(
    (e) => e.errorType === 'duplicate_exact' || e.errorType === 'potential_alias' || e.errorType === 'out_of_range'
  ).length;

  const errorCount = errors.filter(
    (e) => e.errorType === 'missing_required' || e.errorType === 'invalid_format' || e.errorType === 'unlinked_relationship'
  ).length;

  return {
    totalRows: mappedRows.length,
    validCount: validRows.length,
    warningCount,
    errorCount,
    errors,
    potentialDuplicates,
    validRows,
    errorRows,
  };
}

/**
 * Validate a single row
 */
async function validateRow(
  data: Record<string, unknown>,
  entityType: EntityType,
  rowNumber: number,
  _existingEntities: ExistingEntity[]
): Promise<ValidationError[]> {
  switch (entityType) {
    case 'companies':
      return validateCompany(data, rowNumber);
    case 'factories':
      return validateFactory(data, rowNumber);
    case 'occupations':
      return validateOccupation(data, rowNumber);
    case 'skills':
      return validateSkill(data, rowNumber);
    default:
      return [];
  }
}

/**
 * Validate a company row
 */
function validateCompany(data: Record<string, unknown>, rowNumber: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required: name
  if (!data.name || String(data.name).trim() === '') {
    errors.push({
      row: rowNumber,
      errorType: 'missing_required',
      field: 'name',
      value: data.name,
      suggestion: null,
    });
  }

  // Validate coordinates if provided
  if (data.headquartersLat !== undefined && data.headquartersLat !== null && data.headquartersLat !== '') {
    const lat = parseFloat(String(data.headquartersLat));
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push({
        row: rowNumber,
        errorType: 'invalid_format',
        field: 'headquartersLat',
        value: data.headquartersLat,
        suggestion: 'Latitude must be a number between -90 and 90',
      });
    }
  }

  if (data.headquartersLng !== undefined && data.headquartersLng !== null && data.headquartersLng !== '') {
    const lng = parseFloat(String(data.headquartersLng));
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push({
        row: rowNumber,
        errorType: 'invalid_format',
        field: 'headquartersLng',
        value: data.headquartersLng,
        suggestion: 'Longitude must be a number between -180 and 180',
      });
    }
  }

  return errors;
}

/**
 * Validate a factory row
 */
function validateFactory(data: Record<string, unknown>, rowNumber: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required: name
  if (!data.name || String(data.name).trim() === '') {
    errors.push({
      row: rowNumber,
      errorType: 'missing_required',
      field: 'name',
      value: data.name,
      suggestion: null,
    });
  }

  // Check if we have coordinates OR address info
  const hasCoordinates = data.latitude !== undefined && data.latitude !== null && data.latitude !== '' &&
                         data.longitude !== undefined && data.longitude !== null && data.longitude !== '';
  const hasAddress = (data.address && String(data.address).trim() !== '') ||
                     (data.city && String(data.city).trim() !== '');

  // If no coordinates and no address, that's a warning (not blocking error)
  if (!hasCoordinates && !hasAddress) {
    errors.push({
      row: rowNumber,
      errorType: 'out_of_range',
      field: 'location',
      value: null,
      suggestion: 'Row has neither coordinates nor address - location data may be missing',
    });
  }

  // Validate latitude if provided
  if (data.latitude !== undefined && data.latitude !== null && data.latitude !== '') {
    const lat = parseFloat(String(data.latitude));
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push({
        row: rowNumber,
        errorType: 'invalid_format',
        field: 'latitude',
        value: data.latitude,
        suggestion: 'Latitude must be a number between -90 and 90',
      });
    }
  }

  // Validate longitude if provided
  if (data.longitude !== undefined && data.longitude !== null && data.longitude !== '') {
    const lng = parseFloat(String(data.longitude));
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push({
        row: rowNumber,
        errorType: 'invalid_format',
        field: 'longitude',
        value: data.longitude,
        suggestion: 'Longitude must be a number between -180 and 180',
      });
    }
  }

  // Validate workforce size if provided
  if (data.workforceSize !== undefined && data.workforceSize !== null && data.workforceSize !== '') {
    const workforce = parseInt(String(data.workforceSize), 10);
    if (isNaN(workforce)) {
      errors.push({
        row: rowNumber,
        errorType: 'invalid_format',
        field: 'workforceSize',
        value: data.workforceSize,
        suggestion: 'Workforce size must be a number',
      });
    } else if (workforce < 0) {
      errors.push({
        row: rowNumber,
        errorType: 'out_of_range',
        field: 'workforceSize',
        value: data.workforceSize,
        suggestion: 'Workforce size cannot be negative',
      });
    }
  }

  // Validate open positions if provided
  if (data.openPositions !== undefined && data.openPositions !== null && data.openPositions !== '') {
    const positions = parseInt(String(data.openPositions), 10);
    if (isNaN(positions)) {
      errors.push({
        row: rowNumber,
        errorType: 'invalid_format',
        field: 'openPositions',
        value: data.openPositions,
        suggestion: 'Open positions must be a number',
      });
    } else if (positions < 0) {
      errors.push({
        row: rowNumber,
        errorType: 'out_of_range',
        field: 'openPositions',
        value: data.openPositions,
        suggestion: 'Open positions cannot be negative',
      });
    }
  }

  // Validate state code if provided (allow full state names too, not just codes)
  if (data.state !== undefined && data.state !== null && data.state !== '') {
    const stateValue = String(data.state).trim();
    // Accept 2-letter codes or longer state names
    if (stateValue.length < 2) {
      errors.push({
        row: rowNumber,
        errorType: 'invalid_format',
        field: 'state',
        value: data.state,
        suggestion: 'State must be a two-letter code (e.g., CA, NY) or full state name',
      });
    }
  }

  return errors;
}

/**
 * Validate an occupation row
 */
function validateOccupation(data: Record<string, unknown>, rowNumber: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required: title
  if (!data.title || String(data.title).trim() === '') {
    errors.push({
      row: rowNumber,
      errorType: 'missing_required',
      field: 'title',
      value: data.title,
      suggestion: null,
    });
  }

  // Validate O*NET code if provided
  if (data.onetCode !== undefined && data.onetCode !== null && data.onetCode !== '') {
    const code = String(data.onetCode);
    // O*NET codes follow pattern: XX-XXXX.XX (e.g., 51-4041.00)
    if (!/^\d{2}-\d{4}\.\d{2}$/.test(code)) {
      errors.push({
        row: rowNumber,
        errorType: 'invalid_format',
        field: 'onetCode',
        value: data.onetCode,
        suggestion: 'O*NET code must follow format XX-XXXX.XX (e.g., 51-4041.00)',
      });
    }
  }

  return errors;
}

/**
 * Validate a skill row
 */
function validateSkill(data: Record<string, unknown>, rowNumber: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required: name
  if (!data.name || String(data.name).trim() === '') {
    errors.push({
      row: rowNumber,
      errorType: 'missing_required',
      field: 'name',
      value: data.name,
      suggestion: null,
    });
  }

  return errors;
}

interface ExistingEntity {
  id: string;
  name: string;
}

/**
 * Load existing entities for duplicate checking
 */
async function loadExistingEntities(entityType: EntityType): Promise<ExistingEntity[]> {
  switch (entityType) {
    case 'companies': {
      const results = await db.select({ id: companies.id, name: companies.name }).from(companies);
      return results;
    }
    case 'factories': {
      const results = await db.select({ id: factories.id, name: factories.name }).from(factories);
      return results;
    }
    case 'occupations': {
      const results = await db.select({ id: occupations.id, name: occupations.title }).from(occupations);
      return results.map((r) => ({ id: r.id, name: r.name }));
    }
    case 'skills': {
      const results = await db.select({ id: skills.id, name: skills.name }).from(skills);
      return results;
    }
    default:
      return [];
  }
}

/**
 * Check for duplicate entities
 */
function checkForDuplicate(
  data: Record<string, unknown>,
  entityType: EntityType,
  rowNumber: number,
  existingEntities: ExistingEntity[]
): PotentialDuplicate | null {
  const nameField = entityType === 'occupations' ? 'title' : 'name';
  const incomingName = String(data[nameField] || '').trim().toLowerCase();

  if (!incomingName) return null;

  for (const existing of existingEntities) {
    const existingName = existing.name.toLowerCase();

    // Exact match
    if (incomingName === existingName) {
      return {
        incomingRow: rowNumber,
        incomingValue: String(data[nameField]),
        existingId: existing.id,
        existingValue: existing.name,
        confidence: 1.0,
      };
    }

    // Fuzzy match - simple contains check
    const similarity = calculateSimilarity(incomingName, existingName);
    if (similarity >= 0.8) {
      return {
        incomingRow: rowNumber,
        incomingValue: String(data[nameField]),
        existingId: existing.id,
        existingValue: existing.name,
        confidence: similarity,
      };
    }
  }

  return null;
}

/**
 * Calculate string similarity (Levenshtein-based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  return 1 - matrix[len1][len2] / maxLen;
}

/**
 * Prepare data for database insertion
 */
export function prepareForInsert(
  data: Record<string, unknown>,
  entityType: EntityType
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  switch (entityType) {
    case 'companies':
      cleaned.name = String(data.name).trim();
      if (data.industry) cleaned.industry = String(data.industry).trim();
      if (data.description) cleaned.description = String(data.description).trim();
      if (data.headquartersLat) cleaned.headquartersLat = String(data.headquartersLat);
      if (data.headquartersLng) cleaned.headquartersLng = String(data.headquartersLng);
      break;

    case 'factories':
      cleaned.name = String(data.name).trim();
      // Coordinates are optional now
      if (data.latitude !== undefined && data.latitude !== null && data.latitude !== '') {
        cleaned.latitude = String(data.latitude);
      }
      if (data.longitude !== undefined && data.longitude !== null && data.longitude !== '') {
        cleaned.longitude = String(data.longitude);
      }
      if (data.companyId) cleaned.companyId = String(data.companyId);
      if (data.address) cleaned.address = String(data.address).trim();
      if (data.city) cleaned.city = String(data.city).trim();
      if (data.country) cleaned.country = String(data.country).trim();
      if (data.zipCode) cleaned.zipCode = String(data.zipCode).trim();
      if (data.specialization) cleaned.specialization = String(data.specialization).trim();
      if (data.description) cleaned.description = String(data.description).trim();
      if (data.state) {
        // Convert to uppercase if it's a 2-letter code
        const stateVal = String(data.state).trim();
        cleaned.state = stateVal.length === 2 ? stateVal.toUpperCase() : stateVal;
      }
      if (data.workforceSize) cleaned.workforceSize = parseInt(String(data.workforceSize), 10);
      if (data.openPositions) cleaned.openPositions = parseInt(String(data.openPositions), 10);
      break;

    case 'occupations':
      cleaned.title = String(data.title).trim();
      if (data.description) cleaned.description = String(data.description).trim();
      if (data.onetCode) cleaned.onetCode = String(data.onetCode).trim();
      break;

    case 'skills':
      cleaned.name = String(data.name).trim();
      if (data.category) cleaned.category = String(data.category).trim();
      if (data.description) cleaned.description = String(data.description).trim();
      break;
  }

  return cleaned;
}
