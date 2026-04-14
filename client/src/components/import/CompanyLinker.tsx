import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Search,
  Check,
  Plus,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { companiesApi, type Company } from '../../lib/api';

// Simple fuzzy matching score (lower is better)
function fuzzyScore(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Exact match
  if (s1 === s2) return 0;

  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 1;

  // Remove common suffixes/prefixes for comparison
  const normalize = (s: string) => s
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|limited|technologies|tech)\b\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  const n1 = normalize(s1);
  const n2 = normalize(s2);

  if (n1 === n2) return 0.5;
  if (n1.includes(n2) || n2.includes(n1)) return 1.5;

  // Check for common abbreviations
  const abbrev1 = s1.split(/\s+/).map(w => w[0]).join('').toLowerCase();
  const abbrev2 = s2.split(/\s+/).map(w => w[0]).join('').toLowerCase();

  if (abbrev1 === n2 || abbrev2 === n1 || abbrev1 === abbrev2) return 2;

  // Levenshtein distance (simplified)
  const len = Math.max(n1.length, n2.length);
  if (len === 0) return 100;

  let matches = 0;
  const shorter = n1.length < n2.length ? n1 : n2;
  const longer = n1.length >= n2.length ? n1 : n2;

  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }

  const similarity = matches / longer.length;
  return similarity > 0.7 ? 3 : similarity > 0.5 ? 4 : 100;
}

// Create company via API
async function createCompany(name: string): Promise<Company> {
  const response = await fetch('/api/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error('Failed to create company');
  return response.json();
}

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
      // Skip if already mapped
      if (newMappings.has(finalName)) continue;

      // Find best match using fuzzy scoring
      let bestMatch: Company | null = null;
      let bestScore = 5; // Threshold - only match if score < 5

      for (const company of existingCompanies) {
        const score = fuzzyScore(finalName, company.name);
        if (score < bestScore) {
          bestScore = score;
          bestMatch = company;
        }
      }

      if (bestMatch) {
        newMappings.set(finalName, bestMatch.id);
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
  const queryClient = useQueryClient();

  // Mutation for instant company creation
  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: (newCompany) => {
      // Invalidate companies cache to refresh list
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      // Select the newly created company
      onSelect(newCompany.id);
    },
  });

  // Filter and sort companies by fuzzy match score
  const filteredOptions = useMemo(() => {
    const query = search || companyName;
    return existingCompanies
      .map((c) => ({ company: c, score: fuzzyScore(query, c.name) }))
      .filter((x) => x.score < 10)
      .sort((a, b) => a.score - b.score)
      .slice(0, 10)
      .map((x) => x.company);
  }, [existingCompanies, search, companyName]);

  // Best suggestion for display
  const bestSuggestion = useMemo(() => {
    if (currentMapping) return null;
    const sorted = existingCompanies
      .map((c) => ({ company: c, score: fuzzyScore(companyName, c.name) }))
      .filter((x) => x.score < 3)
      .sort((a, b) => a.score - b.score);
    return sorted[0]?.company || null;
  }, [existingCompanies, companyName, currentMapping]);

  // Get display text
  const getDisplayText = () => {
    if (createMutation.isPending) return 'Creating...';
    if (linkedCompany) return linkedCompany.name;
    if (currentMapping === 'create') return `Create "${companyName}"`;
    if (bestSuggestion) return `Match: ${bestSuggestion.name}?`;
    return 'Select action...';
  };

  const getStatusColor = () => {
    if (createMutation.isPending) return 'text-sky-400 border-sky-500/30';
    if (linkedCompany) return 'text-emerald-400 border-emerald-500/30';
    if (currentMapping === 'create') return 'text-amber-400 border-amber-500/30';
    if (bestSuggestion) return 'text-violet-400 border-violet-500/30';
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
                {/* Create new option - instantly creates company */}
                <button
                  onClick={() => {
                    createMutation.mutate(companyName);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  disabled={createMutation.isPending}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left
                    hover:bg-bg-surface transition-colors disabled:opacity-50
                    ${currentMapping === 'create' ? 'bg-amber-500/10 text-amber-400' : 'text-fg-default'}
                  `}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Create "{companyName}"
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
