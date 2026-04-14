import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Search,
  Check,
  Plus,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { companiesApi, type Company } from '../../lib/api';

export interface CompanyLinkConfig {
  mode: 'auto' | 'manual' | 'column';
  sourceColumn: string | null;
  companyMappings: Map<string, string | 'create'>;
  companyNameEdits: Map<string, string>;
  autoCreateCompanies: boolean;
}

interface CompanyLinkerProps {
  uniqueCompanyNames: string[];
  config: CompanyLinkConfig;
  onChange: (config: CompanyLinkConfig) => void;
}

export default function CompanyLinker({
  uniqueCompanyNames,
  config,
  onChange,
}: CompanyLinkerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch existing companies
  const { data: companiesData, isLoading: isLoadingCompanies } = useQuery({
    queryKey: ['companies', 'all'],
    queryFn: async () => {
      const response = await companiesApi.list({ limit: 500 });
      return response.data;
    },
  });

  const existingCompanies = companiesData || [];

  // Group company names by their edited/final name
  const groupedCompanies = useMemo(() => {
    const groups = new Map<string, string[]>();

    for (const name of uniqueCompanyNames) {
      const finalName = config.companyNameEdits.get(name) || name;
      if (!groups.has(finalName)) {
        groups.set(finalName, []);
      }
      groups.get(finalName)!.push(name);
    }

    return new Map([...groups.entries()].sort((a, b) => b[1].length - a[1].length));
  }, [uniqueCompanyNames, config.companyNameEdits]);

  // Filter by search
  const filteredCompanies = useMemo(() => {
    if (!searchQuery) return [...groupedCompanies.keys()];
    const query = searchQuery.toLowerCase();
    return [...groupedCompanies.keys()].filter((name) =>
      name.toLowerCase().includes(query)
    );
  }, [groupedCompanies, searchQuery]);

  // Count linked vs unlinked
  const linkedCount = useMemo(() => {
    let count = 0;
    for (const [finalName] of groupedCompanies) {
      if (config.companyMappings.has(finalName)) {
        count++;
      }
    }
    return count;
  }, [groupedCompanies, config.companyMappings]);

  // Update a single company mapping
  const updateMapping = useCallback(
    (companyName: string, value: string | 'create' | null) => {
      const newMappings = new Map(config.companyMappings);
      if (value === null) {
        newMappings.delete(companyName);
      } else {
        newMappings.set(companyName, value);
      }
      onChange({ ...config, companyMappings: newMappings });
    },
    [config, onChange]
  );

  // Auto-link all matching companies
  const autoLinkAll = useCallback(() => {
    const newMappings = new Map(config.companyMappings);

    for (const [finalName] of groupedCompanies) {
      // Find best match
      const normalizedName = finalName.toLowerCase().trim();
      const exactMatch = existingCompanies.find(
        (c) => c.name.toLowerCase().trim() === normalizedName
      );
      if (exactMatch) {
        newMappings.set(finalName, exactMatch.id);
      } else {
        // Partial match
        const partialMatch = existingCompanies.find(
          (c) =>
            c.name.toLowerCase().includes(normalizedName) ||
            normalizedName.includes(c.name.toLowerCase())
        );
        if (partialMatch) {
          newMappings.set(finalName, partialMatch.id);
        }
      }
    }

    onChange({ ...config, companyMappings: newMappings });
  }, [groupedCompanies, existingCompanies, config, onChange]);

  // Mark all unlinked as "create new"
  const createAllUnlinked = useCallback(() => {
    const newMappings = new Map(config.companyMappings);

    for (const [finalName] of groupedCompanies) {
      if (!newMappings.has(finalName)) {
        newMappings.set(finalName, 'create');
      }
    }

    onChange({ ...config, companyMappings: newMappings });
  }, [groupedCompanies, config, onChange]);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-fg-muted">
          {groupedCompanies.size} companies
        </span>
        <span className="text-emerald-400">{linkedCount} linked</span>
        <span className="text-amber-400">{groupedCompanies.size - linkedCount} pending</span>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={autoLinkAll}
          disabled={isLoadingCompanies}
          className="
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
            bg-bg-elevated border border-border-subtle text-fg-muted hover:text-fg-default hover:border-border-strong
            disabled:opacity-50 transition-colors
          "
        >
          <Check className="w-4 h-4" />
          Auto-link matches
        </button>
        <button
          onClick={createAllUnlinked}
          className="
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
            bg-bg-elevated border border-border-subtle text-fg-muted hover:text-fg-default hover:border-border-strong
            transition-colors
          "
        >
          <Plus className="w-4 h-4" />
          Create all unlinked
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-soft" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter companies..."
          className="
            w-full pl-10 pr-4 py-2 rounded-lg
            bg-bg-surface border border-border-subtle
            text-fg-default placeholder:text-fg-soft
            focus:outline-none focus:ring-2 focus:ring-amber-500/30
          "
        />
      </div>

      {/* Company list - simplified inline dropdowns */}
      {isLoadingCompanies ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-fg-soft" />
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredCompanies.map((finalName) => {
            const originalNames = groupedCompanies.get(finalName) || [];
            const currentMapping = config.companyMappings.get(finalName);
            const linkedCompany =
              currentMapping && currentMapping !== 'create'
                ? existingCompanies.find((c) => c.id === currentMapping)
                : undefined;

            return (
              <CompanyRow
                key={finalName}
                companyName={finalName}
                variationCount={originalNames.length}
                currentMapping={currentMapping}
                linkedCompany={linkedCompany}
                existingCompanies={existingCompanies}
                onSelect={(value) => updateMapping(finalName, value)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Simplified company row with inline dropdown
function CompanyRow({
  companyName,
  variationCount,
  currentMapping,
  linkedCompany,
  existingCompanies,
  onSelect,
}: {
  companyName: string;
  variationCount: number;
  currentMapping: string | 'create' | undefined;
  linkedCompany: Company | undefined;
  existingCompanies: Company[];
  onSelect: (value: string | 'create' | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Filter companies for dropdown
  const filteredOptions = useMemo(() => {
    if (!search) return existingCompanies.slice(0, 10);
    const query = search.toLowerCase();
    return existingCompanies
      .filter((c) => c.name.toLowerCase().includes(query))
      .slice(0, 10);
  }, [existingCompanies, search]);

  // Get display text
  const getDisplayText = () => {
    if (linkedCompany) return linkedCompany.name;
    if (currentMapping === 'create') return `Create "${companyName}"`;
    return 'Select action...';
  };

  const getStatusColor = () => {
    if (linkedCompany) return 'text-emerald-400 border-emerald-500/30';
    if (currentMapping === 'create') return 'text-amber-400 border-amber-500/30';
    return 'text-fg-muted border-border-subtle';
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-bg-surface border border-border-subtle">
      {/* Company name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="font-medium text-fg-default truncate">{companyName}</span>
          {variationCount > 1 && (
            <span className="text-xs text-fg-soft">({variationCount})</span>
          )}
        </div>
      </div>

      {/* Action dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm min-w-[200px]
            bg-bg-elevated border ${getStatusColor()}
            hover:border-border-strong transition-colors
          `}
        >
          <span className="flex-1 text-left truncate">{getDisplayText()}</span>
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
            <div className="absolute z-[110] right-0 mt-1 w-72 rounded-lg bg-bg-elevated border border-border-strong shadow-xl">
              {/* Search input */}
              <div className="p-2 border-b border-border-subtle">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search companies..."
                  autoFocus
                  className="
                    w-full px-3 py-1.5 rounded-md text-sm
                    bg-bg-surface border border-border-subtle
                    text-fg-default placeholder:text-fg-soft
                    focus:outline-none focus:border-amber-500/50
                  "
                />
              </div>

              <div className="max-h-[250px] overflow-y-auto p-1">
                {/* Create new option */}
                <button
                  onClick={() => {
                    onSelect('create');
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left
                    hover:bg-bg-surface transition-colors
                    ${currentMapping === 'create' ? 'bg-amber-500/10 text-amber-400' : 'text-fg-default'}
                  `}
                >
                  <Plus className="w-4 h-4" />
                  Create new company
                </button>

                {/* Divider */}
                <div className="h-px bg-border-subtle my-1" />

                {/* Existing companies */}
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-fg-muted">No companies found</div>
                ) : (
                  filteredOptions.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => {
                        onSelect(company.id);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`
                        w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left
                        hover:bg-bg-surface transition-colors
                        ${currentMapping === company.id ? 'bg-emerald-500/10 text-emerald-400' : 'text-fg-default'}
                      `}
                    >
                      <Building2 className="w-4 h-4 text-amber-500" />
                      <span className="flex-1 truncate">{company.name}</span>
                      {currentMapping === company.id && <Check className="w-4 h-4" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const DEFAULT_COMPANY_LINK_CONFIG: CompanyLinkConfig = {
  mode: 'auto',
  sourceColumn: null,
  companyMappings: new Map(),
  companyNameEdits: new Map(),
  autoCreateCompanies: true,
};
