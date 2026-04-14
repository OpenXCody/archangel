import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { ChevronDown, X, ArrowUpDown } from 'lucide-react';
import { US_STATES, STATE_CODE_TO_NAME, type StateCode } from '../../../../shared/states';
import type { EntityType } from '../../lib/api';

// Sort options per entity type
export type SortOption = {
  value: string;
  label: string;
  field: string;
  order: 'asc' | 'desc';
};

const SORT_OPTIONS: Record<EntityType | 'all', SortOption[]> = {
  all: [
    { value: 'name-asc', label: 'Name A-Z', field: 'name', order: 'asc' },
    { value: 'name-desc', label: 'Name Z-A', field: 'name', order: 'desc' },
  ],
  companies: [
    { value: 'name-asc', label: 'Name A-Z', field: 'name', order: 'asc' },
    { value: 'name-desc', label: 'Name Z-A', field: 'name', order: 'desc' },
    { value: 'factories-desc', label: 'Factory count (high to low)', field: 'factoryCount', order: 'desc' },
  ],
  factories: [
    { value: 'name-asc', label: 'Name A-Z', field: 'name', order: 'asc' },
    { value: 'name-desc', label: 'Name Z-A', field: 'name', order: 'desc' },
    { value: 'workforce-desc', label: 'Workforce size (high to low)', field: 'workforceSize', order: 'desc' },
  ],
  occupations: [
    { value: 'name-asc', label: 'Name A-Z', field: 'title', order: 'asc' },
    { value: 'name-desc', label: 'Name Z-A', field: 'title', order: 'desc' },
  ],
  skills: [
    { value: 'name-asc', label: 'Name A-Z', field: 'name', order: 'asc' },
    { value: 'name-desc', label: 'Name Z-A', field: 'name', order: 'desc' },
  ],
};

// Filter types
export interface FilterState {
  state?: StateCode;
  industry?: string;
  category?: string;
}

export interface FilterBarProps {
  activeTab: EntityType | 'all';
  sortValue: string;
  onSortChange: (value: string) => void;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  industries?: string[];
  categories?: string[];
}

// Dropdown component for reuse
function Dropdown({
  label,
  value,
  options,
  onChange,
  placeholder = 'All',
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || placeholder;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2
          bg-bg-surface border border-border-subtle rounded-lg
          text-sm text-fg-default
          hover:bg-bg-elevated hover:border-border-strong
          transition-colors
          ${isOpen ? 'border-border-strong' : ''}
        `}
      >
        <span className="text-fg-muted text-xs">{label}:</span>
        <span className={value ? 'text-fg-default' : 'text-fg-soft'}>{selectedLabel}</span>
        <ChevronDown className={`w-4 h-4 text-fg-soft transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="
          absolute top-full left-0 mt-1 z-50
          min-w-[180px] max-h-[280px] overflow-y-auto
          bg-bg-surface/95 backdrop-blur-xl
          border border-border-subtle rounded-lg
          shadow-lg
          py-1
        ">
          <button
            onClick={() => {
              onChange(undefined);
              setIsOpen(false);
            }}
            className={`
              w-full px-3 py-2 text-left text-sm
              ${!value ? 'bg-white/10 text-fg-default' : 'text-fg-muted hover:bg-white/5 hover:text-fg-default'}
              transition-colors
            `}
          >
            {placeholder}
          </button>
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`
                w-full px-3 py-2 text-left text-sm
                ${value === option.value
                  ? 'bg-white/10 text-fg-default'
                  : 'text-fg-muted hover:bg-white/5 hover:text-fg-default'
                }
                transition-colors
              `}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Sort dropdown with icon
function SortDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SortOption[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || options[0]?.label || 'Sort';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2
          bg-bg-surface border border-border-subtle rounded-lg
          text-sm text-fg-default
          hover:bg-bg-elevated hover:border-border-strong
          transition-colors
          ${isOpen ? 'border-border-strong' : ''}
        `}
      >
        <ArrowUpDown className="w-4 h-4 text-fg-soft" />
        <span>{selectedLabel}</span>
        <ChevronDown className={`w-4 h-4 text-fg-soft transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="
          absolute top-full right-0 mt-1 z-50
          min-w-[200px]
          bg-bg-surface/95 backdrop-blur-xl
          border border-border-subtle rounded-lg
          shadow-lg
          py-1
        ">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`
                w-full px-3 py-2 text-left text-sm
                ${value === option.value
                  ? 'bg-white/10 text-fg-default'
                  : 'text-fg-muted hover:bg-white/5 hover:text-fg-default'
                }
                transition-colors
              `}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Active filter badge
function FilterBadge({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <span className="
      inline-flex items-center gap-1.5
      px-2.5 py-1
      bg-white/5 border border-white/10 rounded-full
      text-xs text-fg-default
    ">
      <span className="text-fg-muted">{label}:</span>
      <span>{value}</span>
      <button
        onClick={onClear}
        className="ml-0.5 p-0.5 rounded-full hover:bg-white/10 text-fg-muted hover:text-fg-default transition-colors"
        aria-label={`Clear ${label} filter`}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

export default function FilterBar({
  activeTab,
  sortValue,
  onSortChange,
  filters,
  onFilterChange,
  industries = [],
  categories = [],
}: FilterBarProps) {
  // Get sort options for current tab
  const sortOptions = useMemo(() => {
    return SORT_OPTIONS[activeTab] || SORT_OPTIONS.all;
  }, [activeTab]);

  // State options
  const stateOptions = useMemo(() => {
    return US_STATES.map(s => ({ value: s.code, label: s.name }));
  }, []);

  // Industry options
  const industryOptions = useMemo(() => {
    return industries.map(i => ({ value: i, label: i }));
  }, [industries]);

  // Category options
  const categoryOptions = useMemo(() => {
    return categories.map(c => ({ value: c, label: c }));
  }, [categories]);

  // Handler for filter changes
  const handleFilterChange = useCallback(
    (key: keyof FilterState, value: string | undefined) => {
      onFilterChange({ ...filters, [key]: value });
    },
    [filters, onFilterChange]
  );

  // Check if any filters are active
  const hasActiveFilters = filters.state || filters.industry || filters.category;

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    onFilterChange({});
  }, [onFilterChange]);

  // Determine which filters to show based on active tab
  const showStateFilter = activeTab === 'factories' || activeTab === 'all';
  const showIndustryFilter = activeTab === 'companies' || activeTab === 'factories' || activeTab === 'all';
  const showCategoryFilter = activeTab === 'skills' || activeTab === 'all';

  return (
    <div className="space-y-3">
      {/* Filter and Sort row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left side: Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {showStateFilter && (
            <Dropdown
              label="State"
              value={filters.state}
              options={stateOptions}
              onChange={(value) => handleFilterChange('state', value as StateCode | undefined)}
              placeholder="All states"
            />
          )}

          {showIndustryFilter && industryOptions.length > 0 && (
            <Dropdown
              label="Industry"
              value={filters.industry}
              options={industryOptions}
              onChange={(value) => handleFilterChange('industry', value)}
              placeholder="All industries"
            />
          )}

          {showCategoryFilter && categoryOptions.length > 0 && (
            <Dropdown
              label="Category"
              value={filters.category}
              options={categoryOptions}
              onChange={(value) => handleFilterChange('category', value)}
              placeholder="All categories"
            />
          )}
        </div>

        {/* Right side: Sort */}
        <SortDropdown
          value={sortValue}
          options={sortOptions}
          onChange={onSortChange}
        />
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.state && (
            <FilterBadge
              label="State"
              value={STATE_CODE_TO_NAME[filters.state] || filters.state}
              onClear={() => handleFilterChange('state', undefined)}
            />
          )}
          {filters.industry && (
            <FilterBadge
              label="Industry"
              value={filters.industry}
              onClear={() => handleFilterChange('industry', undefined)}
            />
          )}
          {filters.category && (
            <FilterBadge
              label="Category"
              value={filters.category}
              onClear={() => handleFilterChange('category', undefined)}
            />
          )}
          <button
            onClick={clearAllFilters}
            className="text-xs text-fg-muted hover:text-fg-default transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// Export sort options for use in queries
export { SORT_OPTIONS };
