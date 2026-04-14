import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Wand2,
  Building2,
  Factory,
  MapPin,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Link2,
} from 'lucide-react';
import {
  normalizeCompanyName,
  extractCompanyFromFacilityName,
  generateFactoryName,
  checkLocationData,
  type LocationStatus,
} from '../../../../shared/companyNormalization';
import CompanyLinker, {
  type CompanyLinkConfig,
  DEFAULT_COMPANY_LINK_CONFIG,
} from './CompanyLinker';

export interface TransformConfig {
  extractCompanyFromName: boolean;
  companySourceColumn: string | null;
  normalizeCompanyNames: boolean;
  generateFactoryNames: boolean;
  factoryNamePattern: 'company_city' | 'company_state' | 'original';
  skipInvalidLocations: boolean;
  allowAddressOnlyLocations: boolean;
  // Company linking configuration
  companyLinkConfig: CompanyLinkConfig;
}

export interface TransformedRow {
  originalIndex: number;
  original: Record<string, unknown>;
  transformed: Record<string, unknown>;
  companyName: string | null;
  companyId: string | null; // ID of existing company if linked
  factoryName: string | null;
  locationStatus: LocationStatus;
  willSkip: boolean;
  transformations: string[];
}

export interface TransformResult {
  rows: TransformedRow[];
  stats: {
    total: number;
    valid: number;
    addressOnly: number;
    skipped: number;
    companiesFound: Map<string, number>;
  };
}

interface DataTransformerProps {
  sourceColumns: string[];
  rows: Record<string, unknown>[];
  mappings: { source: string; target: string }[];
  onTransform: (result: TransformResult, config: TransformConfig) => void;
  initialConfig?: Partial<TransformConfig>;
}

const DEFAULT_CONFIG: TransformConfig = {
  extractCompanyFromName: true,
  companySourceColumn: null,
  normalizeCompanyNames: true,
  generateFactoryNames: true,
  factoryNamePattern: 'company_city',
  skipInvalidLocations: true,
  allowAddressOnlyLocations: true,
  companyLinkConfig: DEFAULT_COMPANY_LINK_CONFIG,
};

export default function DataTransformer({
  sourceColumns,
  rows,
  mappings,
  onTransform,
  initialConfig,
}: DataTransformerProps) {
  const [config, setConfig] = useState<TransformConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  // Get mapped column names
  const getMappedColumn = useCallback(
    (targetField: string): string | null => {
      const mapping = mappings.find((m) => m.target === targetField);
      return mapping?.source || null;
    },
    [mappings]
  );

  // Transform the data based on config
  const transformResult = useMemo((): TransformResult => {
    const companiesFound = new Map<string, number>();
    let validCount = 0;
    let addressOnlyCount = 0;
    let skippedCount = 0;

    const transformedRows: TransformedRow[] = rows.map((row, index) => {
      const transformations: string[] = [];
      const transformed = { ...row };

      // Get relevant columns
      const nameCol = getMappedColumn('name') || config.companySourceColumn;
      const latCol = getMappedColumn('latitude');
      const lngCol = getMappedColumn('longitude');
      const cityCol = getMappedColumn('city') || sourceColumns.find((c) => /city/i.test(c));
      const stateCol = getMappedColumn('state') || sourceColumns.find((c) => /state/i.test(c));
      const addressCol = getMappedColumn('address') || sourceColumns.find((c) => /address/i.test(c));
      const zipCol = sourceColumns.find((c) => /zip|postal/i.test(c));

      // Extract/normalize company name
      let companyName: string | null = null;
      const rawName = nameCol ? String(row[nameCol] || '') : '';

      if (config.extractCompanyFromName && rawName) {
        companyName = extractCompanyFromFacilityName(rawName);
        if (companyName) {
          transformations.push(`Extracted company: ${companyName}`);
        }
      }

      if (!companyName && config.normalizeCompanyNames && rawName) {
        companyName = normalizeCompanyName(rawName);
        if (companyName !== rawName) {
          transformations.push(`Normalized: "${rawName}" → "${companyName}"`);
        }
      }

      if (!companyName && rawName) {
        companyName = rawName;
      }

      // Track company counts
      if (companyName) {
        companiesFound.set(companyName, (companiesFound.get(companyName) || 0) + 1);
      }

      // Generate factory name
      let factoryName: string | null = null;
      if (config.generateFactoryNames && companyName) {
        const city = cityCol ? String(row[cityCol] || '') : null;
        const state = stateCol ? String(row[stateCol] || '') : null;

        if (config.factoryNamePattern === 'company_city' && city) {
          factoryName = generateFactoryName(companyName, city, state);
          transformations.push(`Generated name: ${factoryName}`);
        } else if (config.factoryNamePattern === 'company_state' && state) {
          factoryName = generateFactoryName(companyName, null, state);
          transformations.push(`Generated name: ${factoryName}`);
        } else if (config.factoryNamePattern === 'original') {
          factoryName = rawName;
        } else {
          // Fallback to whatever we have
          factoryName = generateFactoryName(companyName, city, state);
          if (factoryName !== companyName + ' Plant') {
            transformations.push(`Generated name: ${factoryName}`);
          }
        }
      }

      // Check location status
      const locationData = {
        latitude: latCol ? row[latCol] : null,
        longitude: lngCol ? row[lngCol] : null,
        address: addressCol ? row[addressCol] : null,
        city: cityCol ? row[cityCol] : null,
        state: stateCol ? row[stateCol] : null,
        zip: zipCol ? row[zipCol] : null,
      };
      const locationStatus = checkLocationData(locationData as Record<string, string | number | null>);

      // Determine if row should be skipped
      let willSkip = false;
      if (locationStatus === 'invalid' && config.skipInvalidLocations) {
        willSkip = true;
        skippedCount++;
        transformations.push('⚠️ Missing location data - will skip');
      } else if (locationStatus === 'address_only') {
        addressOnlyCount++;
        if (!config.allowAddressOnlyLocations) {
          willSkip = true;
          skippedCount++;
          transformations.push('⚠️ Has address but no coordinates - will skip');
        } else {
          transformations.push('ℹ️ Has address but no coordinates - coords will be null');
        }
      } else {
        validCount++;
      }

      // Check if company is linked to an existing company
      let companyId: string | null = null;
      if (companyName && config.companyLinkConfig.companyMappings.has(companyName)) {
        const mapping = config.companyLinkConfig.companyMappings.get(companyName);
        if (mapping && mapping !== 'create') {
          companyId = mapping;
          transformations.push(`Linked to existing company (ID: ${companyId.slice(0, 8)}...)`);
        } else if (mapping === 'create') {
          transformations.push(`Will create new company: ${companyName}`);
        }
      }

      // Update transformed data
      if (companyName) {
        transformed._companyName = companyName;
      }
      if (companyId) {
        transformed._companyId = companyId;
      }
      if (factoryName) {
        transformed._factoryName = factoryName;
      }
      transformed._locationStatus = locationStatus;
      transformed._willSkip = willSkip;

      return {
        originalIndex: index,
        original: row,
        transformed,
        companyName,
        companyId,
        factoryName,
        locationStatus,
        willSkip,
        transformations,
      };
    });

    return {
      rows: transformedRows,
      stats: {
        total: rows.length,
        valid: validCount,
        addressOnly: addressOnlyCount,
        skipped: skippedCount,
        companiesFound,
      },
    };
  }, [rows, mappings, config, getMappedColumn, sourceColumns]);

  // Handle config change
  const updateConfig = useCallback(
    <K extends keyof TransformConfig>(key: K, value: TransformConfig[K]) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Toggle company expansion
  const toggleCompany = useCallback((company: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(company)) {
        next.delete(company);
      } else {
        next.add(company);
      }
      return next;
    });
  }, []);

  // Track if we've already notified parent with current data
  // This prevents infinite loops when parent updates state in response to onTransform
  const lastNotifiedRef = useRef<string>('');
  const onTransformRef = useRef(onTransform);
  onTransformRef.current = onTransform;

  useEffect(() => {
    // Create a simple hash of the current state to detect actual changes
    const currentHash = JSON.stringify({
      rowCount: transformResult.rows.length,
      validCount: transformResult.stats.valid,
      skippedCount: transformResult.stats.skipped,
      mappingsCount: config.companyLinkConfig.companyMappings.size,
    });

    // Only notify parent if the data actually changed
    if (currentHash !== lastNotifiedRef.current) {
      lastNotifiedRef.current = currentHash;
      onTransformRef.current(transformResult, config);
    }
  }, [transformResult, config]);

  // Get rows by company
  const rowsByCompany = useMemo(() => {
    const map = new Map<string, TransformedRow[]>();
    for (const row of transformResult.rows) {
      const company = row.companyName || 'Unknown';
      if (!map.has(company)) {
        map.set(company, []);
      }
      map.get(company)!.push(row);
    }
    // Sort by count descending
    return new Map([...map.entries()].sort((a, b) => b[1].length - a[1].length));
  }, [transformResult.rows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <Wand2 className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h3 className="font-medium text-fg-default">Configure Transform</h3>
          <p className="text-sm text-fg-muted">
            Review company extraction and link to existing companies
          </p>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Total Rows"
          value={transformResult.stats.total}
          icon={Factory}
          color="text-fg-muted"
        />
        <StatCard
          label="Valid Location"
          value={transformResult.stats.valid}
          icon={Check}
          color="text-emerald-500"
        />
        <StatCard
          label="Address Only"
          value={transformResult.stats.addressOnly}
          icon={MapPin}
          color="text-amber-500"
        />
        <StatCard
          label="Will Skip"
          value={transformResult.stats.skipped}
          icon={X}
          color="text-red-400"
        />
      </div>

      {/* Company Linking Section - FIRST */}
      {transformResult.stats.companiesFound.size > 0 && (
        <div className="space-y-4 p-4 rounded-lg bg-bg-elevated border border-border-subtle">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-medium text-fg-default">
              Link to Companies ({transformResult.stats.companiesFound.size} found)
            </h4>
          </div>
          <p className="text-xs text-fg-muted">
            Edit company names, merge variations, or link to existing companies in your database.
          </p>
          <CompanyLinker
            uniqueCompanyNames={[...transformResult.stats.companiesFound.keys()]}
            config={config.companyLinkConfig}
            onChange={(linkConfig) => updateConfig('companyLinkConfig', linkConfig)}
          />
        </div>
      )}

      {/* Transformation Options - collapsible */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg-default flex items-center gap-2 p-3 rounded-lg bg-bg-elevated border border-border-subtle">
          <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
          <RefreshCw className="w-4 h-4" />
          Advanced Options
        </summary>
        <div className="mt-2 space-y-4 p-4 rounded-lg bg-bg-elevated border border-border-subtle">
          {/* Company extraction */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.extractCompanyFromName}
                onChange={(e) => updateConfig('extractCompanyFromName', e.target.checked)}
                className="w-4 h-4 rounded border-border-subtle bg-bg-surface text-amber-500 focus:ring-amber-500/50"
              />
              <span className="text-sm text-fg-muted">
                Extract parent company from facility name
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.normalizeCompanyNames}
                onChange={(e) => updateConfig('normalizeCompanyNames', e.target.checked)}
                className="w-4 h-4 rounded border-border-subtle bg-bg-surface text-amber-500 focus:ring-amber-500/50"
              />
              <span className="text-sm text-fg-muted">
                Normalize company names (e.g., "BOEING CO" → "Boeing")
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.generateFactoryNames}
                onChange={(e) => updateConfig('generateFactoryNames', e.target.checked)}
                className="w-4 h-4 rounded border-border-subtle bg-bg-surface text-amber-500 focus:ring-amber-500/50"
              />
              <span className="text-sm text-fg-muted">
                Generate factory names from company + location
              </span>
            </label>

            {config.generateFactoryNames && (
              <div className="ml-7">
                <select
                  value={config.factoryNamePattern}
                  onChange={(e) =>
                    updateConfig('factoryNamePattern', e.target.value as TransformConfig['factoryNamePattern'])
                  }
                  className="
                    px-3 py-1.5 rounded-lg text-sm
                    bg-bg-surface border border-border-subtle
                    text-fg-default focus:outline-none focus:ring-2 focus:ring-amber-500/50
                  "
                >
                  <option value="company_city">Company + City (e.g., "Boeing Seattle Plant")</option>
                  <option value="company_state">Company + State (e.g., "Boeing WA Plant")</option>
                  <option value="original">Keep original name</option>
                </select>
              </div>
            )}
          </div>

          {/* Location handling */}
          <div className="pt-3 border-t border-border-subtle space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.skipInvalidLocations}
                onChange={(e) => updateConfig('skipInvalidLocations', e.target.checked)}
                className="w-4 h-4 rounded border-border-subtle bg-bg-surface text-amber-500 focus:ring-amber-500/50"
              />
              <span className="text-sm text-fg-muted">
                Skip rows missing both coordinates AND address
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.allowAddressOnlyLocations}
                onChange={(e) => updateConfig('allowAddressOnlyLocations', e.target.checked)}
                className="w-4 h-4 rounded border-border-subtle bg-bg-surface text-amber-500 focus:ring-amber-500/50"
              />
              <span className="text-sm text-fg-muted">
                Allow rows with address but no coordinates (coords will be null)
              </span>
            </label>
          </div>
        </div>
      </details>

      {/* Preview of factories by company - collapsible */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg-default flex items-center gap-2 p-3 rounded-lg bg-bg-elevated border border-border-subtle">
          <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
          <Building2 className="w-4 h-4" />
          Preview Factories by Company ({transformResult.stats.companiesFound.size} companies)
        </summary>
        <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto p-2">
          {[...rowsByCompany.entries()].map(([company, companyRows]) => {
            const isExpanded = expandedCompanies.has(company);
            const validRows = companyRows.filter((r) => !r.willSkip);
            const skippedRows = companyRows.filter((r) => r.willSkip);

            return (
              <div
                key={company}
                className="border border-border-subtle rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleCompany(company)}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-bg-elevated hover:bg-bg-surface transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-fg-soft" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-fg-soft" />
                  )}
                  <Building2 className="w-4 h-4 text-amber-500" />
                  <span className="font-medium text-fg-default flex-1">{company}</span>
                  <span className="text-xs text-fg-soft">
                    {validRows.length} valid
                    {skippedRows.length > 0 && (
                      <span className="text-red-400 ml-2">{skippedRows.length} skipped</span>
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-3 py-2 space-y-1 border-t border-border-subtle bg-bg-surface">
                    {companyRows.slice(0, 10).map((row) => (
                      <div
                        key={row.originalIndex}
                        className={`text-xs py-1 px-2 rounded ${
                          row.willSkip
                            ? 'bg-red-500/10 text-red-400'
                            : row.locationStatus === 'address_only'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'text-fg-muted'
                        }`}
                      >
                        <span className="font-mono">#{row.originalIndex + 1}</span>
                        {row.factoryName && (
                          <span className="ml-2">→ {row.factoryName}</span>
                        )}
                        {row.transformations.length > 0 && (
                          <span className="ml-2 opacity-75">
                            ({row.transformations[0]})
                          </span>
                        )}
                      </div>
                    ))}
                    {companyRows.length > 10 && (
                      <div className="text-xs text-fg-soft py-1">
                        ... and {companyRows.length - 10} more rows
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>

      {/* Summary footer */}
      <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
        <div className="text-sm text-fg-muted">
          <span className="text-emerald-400 font-medium">
            {transformResult.stats.total - transformResult.stats.skipped}
          </span>
          {' '}rows ready to import
          {transformResult.stats.skipped > 0 && (
            <span className="text-red-400 ml-1">
              ({transformResult.stats.skipped} will be skipped)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-bg-elevated border border-border-subtle">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-fg-soft">{label}</span>
      </div>
      <div className="text-xl font-semibold text-fg-default">{value.toLocaleString()}</div>
    </div>
  );
}

