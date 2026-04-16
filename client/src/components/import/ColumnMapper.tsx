import { useState, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  AlertCircle,
  ChevronDown,
  SkipForward,
} from 'lucide-react';

// Importable entity types (core entities only, not refs/schools/programs/persons)
type ImportableEntityType = 'companies' | 'factories' | 'occupations' | 'skills';

// Target fields for each entity type
const TARGET_FIELDS: Record<ImportableEntityType, { field: string; label: string; required: boolean; dataType?: 'numeric' | 'text' | 'state' }[]> = {
  companies: [
    { field: 'name', label: 'Name', required: true, dataType: 'text' },
    { field: 'industry', label: 'Industry', required: false, dataType: 'text' },
    { field: 'description', label: 'Description', required: false, dataType: 'text' },
    { field: 'headquartersLat', label: 'HQ Latitude', required: false, dataType: 'numeric' },
    { field: 'headquartersLng', label: 'HQ Longitude', required: false, dataType: 'numeric' },
  ],
  factories: [
    { field: 'name', label: 'Facility Name', required: true, dataType: 'text' },
    { field: 'companyName', label: 'Parent Company', required: false, dataType: 'text' },
    { field: 'address', label: 'Address', required: false, dataType: 'text' },
    { field: 'city', label: 'City', required: false, dataType: 'text' },
    { field: 'state', label: 'State', required: false, dataType: 'state' },
    { field: 'country', label: 'Country', required: false, dataType: 'text' },
    { field: 'zipCode', label: 'Zip Code', required: false, dataType: 'text' },
    { field: 'latitude', label: 'Latitude', required: false, dataType: 'numeric' },
    { field: 'longitude', label: 'Longitude', required: false, dataType: 'numeric' },
    { field: 'specialization', label: 'Specialization', required: false, dataType: 'text' },
    { field: 'workforceSize', label: 'Workforce Size', required: false, dataType: 'numeric' },
    { field: 'openPositions', label: 'Open Positions', required: false, dataType: 'numeric' },
    { field: 'description', label: 'Description', required: false, dataType: 'text' },
  ],
  occupations: [
    { field: 'title', label: 'Title', required: true, dataType: 'text' },
    { field: 'onetCode', label: 'O*NET Code', required: false, dataType: 'text' },
    { field: 'description', label: 'Description', required: false, dataType: 'text' },
  ],
  skills: [
    { field: 'name', label: 'Name', required: true, dataType: 'text' },
    { field: 'category', label: 'Category', required: false, dataType: 'text' },
    { field: 'description', label: 'Description', required: false, dataType: 'text' },
  ],
};

// Field name similarities for auto-suggestion (ordered by specificity - more specific first)
const FIELD_ALIASES: Record<string, string[]> = {
  // Coordinate fields - must be numeric, very specific aliases
  latitude: ['latitude', 'lat', 'lat_dd', 'factory_lat', 'coord_lat', 'y_coord'],
  longitude: ['longitude', 'lng', 'lon', 'long', 'long_dd', 'factory_lng', 'coord_lng', 'x_coord'],
  headquartersLat: ['headquarters_lat', 'hq_lat', 'hq_latitude'],
  headquartersLng: ['headquarters_lng', 'hq_lng', 'hq_longitude', 'hq_lon'],

  // Location text fields
  address: ['address', 'street', 'street_address', 'addr', 'location_address', 'physical_address'],
  city: ['city', 'town', 'municipality', 'locality'],
  state: ['state', 'state_code', 'st', 'province', 'region', 'state_abbr'],
  country: ['country', 'nation', 'country_code', 'ctry'],
  zipCode: ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'postcode'],

  // Entity name fields
  name: ['name', 'facility_name', 'factory_name', 'site_name', 'plant_name', 'facility'],
  title: ['title', 'job_title', 'occupation', 'position', 'role', 'occupation_title'],
  companyName: ['company', 'company_name', 'parent_company', 'owner', 'employer', 'corporation', 'parent'],

  // Other fields
  industry: ['industry', 'sector', 'naics', 'sic', 'business_type'],
  description: ['description', 'desc', 'details', 'notes', 'about', 'summary'],
  specialization: ['specialization', 'specialty', 'focus', 'product', 'product_line'],
  workforceSize: ['workforce', 'workforce_size', 'employees', 'headcount', 'emp_count', 'num_employees', 'worker_count'],
  openPositions: ['open_positions', 'openings', 'vacancies', 'jobs', 'hiring'],
  onetCode: ['onet', 'onet_code', 'o_net', 'soc', 'soc_code'],
  category: ['category', 'cat', 'group', 'skill_category', 'skill_type', 'classification'],
};

// Check if a value looks like a valid coordinate (numeric, within range)
function isLikelyCoordinate(value: unknown, type: 'lat' | 'lng'): boolean {
  if (value === null || value === undefined || value === '') return false;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return false;
  if (type === 'lat') return num >= -90 && num <= 90;
  if (type === 'lng') return num >= -180 && num <= 180;
  return false;
}


// Check if a value is purely numeric
function isNumericValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const str = String(value).trim();
  return !isNaN(parseFloat(str)) && isFinite(Number(str));
}

// Check if a value looks like text (not a number)
function isTextValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const str = String(value).trim();
  // Contains letters or is not parseable as a clean number
  return /[a-zA-Z]/.test(str) || isNaN(parseFloat(str));
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string | null; // null means skip
  sampleValue?: string;
}

interface ColumnMapperProps {
  sourceColumns: string[];
  sampleData: Record<string, unknown>[];
  entityType: ImportableEntityType;
  initialMappings?: ColumnMapping[];
  onChange: (mappings: ColumnMapping[]) => void;
}

export type { ImportableEntityType };

export default function ColumnMapper({
  sourceColumns,
  sampleData,
  entityType,
  initialMappings,
  onChange,
}: ColumnMapperProps) {
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const targetFields = TARGET_FIELDS[entityType];

  // Auto-suggest mappings based on column names AND data type validation
  const suggestMapping = (sourceColumn: string, sampleValue: unknown): string | null => {
    const normalizedSource = sourceColumn.toLowerCase().replace(/[^a-z0-9]/g, '');

    // First pass: exact and strong matches with data type validation
    for (const targetField of targetFields) {
      const aliases = FIELD_ALIASES[targetField.field] || [targetField.field];
      for (const alias of aliases) {
        const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Check for exact match or strong substring match
        const isExactMatch = normalizedSource === normalizedAlias;
        const isStrongMatch =
          normalizedSource.includes(normalizedAlias) ||
          normalizedAlias.includes(normalizedSource);

        if (isExactMatch || isStrongMatch) {
          // Validate data type matches the expected type
          const dataType = targetField.dataType;

          // For numeric fields (lat/long, workforce), verify the sample value is numeric
          if (dataType === 'numeric') {
            if (!isNumericValue(sampleValue)) {
              continue; // Skip this mapping - data type mismatch
            }
            // Extra validation for coordinates
            if (targetField.field === 'latitude' || targetField.field === 'headquartersLat') {
              if (!isLikelyCoordinate(sampleValue, 'lat')) continue;
            }
            if (targetField.field === 'longitude' || targetField.field === 'headquartersLng') {
              if (!isLikelyCoordinate(sampleValue, 'lng')) continue;
            }
          }

          // For state field, verify it looks like a state code
          if (dataType === 'state') {
            // Allow text values that could be states, but skip pure numbers
            if (isNumericValue(sampleValue) && !isTextValue(sampleValue)) {
              continue;
            }
          }

          // For text fields, don't map if the value is clearly numeric AND the column name suggests coordinates
          if (dataType === 'text') {
            // Skip if this looks like coordinate data being mapped to a text field
            const looksLikeCoordColumn = /lat|lng|lon|coord|x|y/i.test(sourceColumn);
            if (looksLikeCoordColumn && isNumericValue(sampleValue)) {
              continue;
            }
          }

          return targetField.field;
        }
      }
    }

    return null;
  };

  // Initialize mappings
  useEffect(() => {
    if (initialMappings && initialMappings.length > 0) {
      setMappings(initialMappings);
      return;
    }

    // Track which target fields have been assigned to avoid duplicates
    const assignedTargets = new Set<string>();

    const newMappings: ColumnMapping[] = sourceColumns.map((col) => {
      const sampleValue = sampleData[0]?.[col];
      let suggestedTarget = suggestMapping(col, sampleValue);

      // Don't assign the same target twice
      if (suggestedTarget && assignedTargets.has(suggestedTarget)) {
        suggestedTarget = null;
      }

      if (suggestedTarget) {
        assignedTargets.add(suggestedTarget);
      }

      return {
        sourceColumn: col,
        targetField: suggestedTarget,
        sampleValue: sampleValue != null ? String(sampleValue) : undefined,
      };
    });

    setMappings(newMappings);
    onChange(newMappings);
  }, [sourceColumns, sampleData, entityType]);

  // Update mapping for a column
  const updateMapping = (sourceColumn: string, targetField: string | null) => {
    const newMappings = mappings.map((m) =>
      m.sourceColumn === sourceColumn ? { ...m, targetField } : m
    );
    setMappings(newMappings);
    onChange(newMappings);
  };

  // Count mapped and required fields
  const mappedFields = new Set(mappings.filter((m) => m.targetField).map((m) => m.targetField));
  const requiredFields = targetFields.filter((f) => f.required);
  const missingRequired = requiredFields.filter((f) => !mappedFields.has(f.field));
  const mappedCount = mappings.filter((m) => m.targetField).length;

  return (
    <div>
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-fg-default">Map your columns</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className={mappedCount > 0 ? 'text-emerald-400' : 'text-fg-muted'}>
            {mappedCount} of {sourceColumns.length} mapped
          </span>
          {mappedCount > 0 && <Check className="w-4 h-4 text-emerald-400" />}
        </div>
      </div>

      {/* Missing required fields warning */}
      {missingRequired.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-400 font-medium">Required fields missing</p>
            <p className="text-sm text-amber-400/70 mt-0.5">
              Please map: {missingRequired.map((f) => f.label).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Mapping rows */}
      <div className="space-y-2">
        {mappings.map((mapping) => (
          <MappingRow
            key={mapping.sourceColumn}
            mapping={mapping}
            targetFields={targetFields}
            usedTargets={mappedFields}
            onSelect={(targetField) => updateMapping(mapping.sourceColumn, targetField)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-border-subtle flex items-center gap-6 text-xs text-fg-muted">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span>Mapped</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span>Required (missing)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-500" />
          <span>Skipped</span>
        </div>
      </div>
    </div>
  );
}

// Individual mapping row
function MappingRow({
  mapping,
  targetFields,
  usedTargets,
  onSelect,
}: {
  mapping: ColumnMapping;
  targetFields: { field: string; label: string; required: boolean }[];
  usedTargets: Set<string | null>;
  onSelect: (targetField: string | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedTarget = targetFields.find((f) => f.field === mapping.targetField);
  const isSkipped = mapping.targetField === null;

  return (
    <div className="flex items-center gap-3 p-3 bg-bg-surface rounded-lg border border-border-subtle">
      {/* Source column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div
            className={`
              w-2 h-2 rounded-full flex-shrink-0
              ${mapping.targetField
                ? 'bg-emerald-500'
                : 'bg-gray-500'
              }
            `}
          />
          <span className="font-mono text-sm text-fg-default truncate">
            {mapping.sourceColumn}
          </span>
        </div>
        {mapping.sampleValue && (
          <p className="text-xs text-fg-soft mt-1 ml-4 truncate">
            e.g., "{mapping.sampleValue}"
          </p>
        )}
      </div>

      {/* Arrow */}
      <ArrowRight className="w-4 h-4 text-fg-soft flex-shrink-0" />

      {/* Target field selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg text-sm
            border transition-colors min-w-[180px] justify-between
            ${isSkipped
              ? 'bg-bg-elevated border-border-subtle text-fg-soft'
              : 'bg-bg-elevated border-border-subtle text-fg-default'
            }
            hover:border-border-strong
          `}
        >
          <span className="flex items-center gap-2">
            {isSkipped ? (
              <>
                <SkipForward className="w-4 h-4" />
                Skip this column
              </>
            ) : selectedTarget ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                {selectedTarget.label}
                {selectedTarget.required && (
                  <span className="text-red-400 text-xs">*</span>
                )}
              </>
            ) : (
              'Select field...'
            )}
          </span>
          <ChevronDown className="w-4 h-4" />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute z-50 right-0 mt-1 w-56 py-1 rounded-lg bg-bg-elevated border border-border-strong shadow-lg">
              {/* Skip option */}
              <button
                onClick={() => {
                  onSelect(null);
                  setIsOpen(false);
                }}
                className={`
                  w-full px-3 py-2 text-left text-sm flex items-center gap-2
                  hover:bg-bg-surface transition-colors
                  ${isSkipped ? 'text-fg-default' : 'text-fg-muted'}
                `}
              >
                <SkipForward className="w-4 h-4" />
                Skip this column
              </button>
              <div className="h-px bg-border-subtle my-1" />

              {/* Target fields */}
              {targetFields.map((field) => {
                const isUsed = usedTargets.has(field.field) && mapping.targetField !== field.field;
                const isSelected = mapping.targetField === field.field;

                return (
                  <button
                    key={field.field}
                    onClick={() => {
                      if (!isUsed) {
                        onSelect(field.field);
                        setIsOpen(false);
                      }
                    }}
                    disabled={isUsed}
                    className={`
                      w-full px-3 py-2 text-left text-sm flex items-center gap-2
                      transition-colors
                      ${isUsed
                        ? 'text-fg-soft cursor-not-allowed'
                        : 'hover:bg-bg-surface text-fg-default'
                      }
                      ${isSelected ? 'bg-bg-surface' : ''}
                    `}
                  >
                    {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                    {!isSelected && <div className="w-4" />}
                    <span>{field.label}</span>
                    {field.required && (
                      <span className="text-red-400 text-xs">*</span>
                    )}
                    {isUsed && (
                      <span className="text-xs text-fg-soft ml-auto">already mapped</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Export helper to check if all required fields are mapped
export function areRequiredFieldsMapped(
  mappings: ColumnMapping[],
  entityType: ImportableEntityType
): boolean {
  const targetFields = TARGET_FIELDS[entityType];
  const requiredFields = targetFields.filter((f) => f.required).map((f) => f.field);
  const mappedFields = new Set(mappings.filter((m) => m.targetField).map((m) => m.targetField));
  return requiredFields.every((f) => mappedFields.has(f));
}

// Export helper to convert mappings to API format
export function mappingsToApiFormat(
  mappings: ColumnMapping[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const mapping of mappings) {
    if (mapping.targetField) {
      result[mapping.sourceColumn] = mapping.targetField;
    }
  }
  return result;
}
