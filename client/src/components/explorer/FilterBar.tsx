import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { US_STATES, type StateCode } from '@shared/states';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { BrowseTab } from './ExploreNav';

// Sort options per list
export type SortOption = {
  value: string;
  label: string;
  field: string;
  order: 'asc' | 'desc';
};

const BY_NAME: SortOption[] = [
  { value: 'name-asc', label: 'Name A-Z', field: 'name', order: 'asc' },
  { value: 'name-desc', label: 'Name Z-A', field: 'name', order: 'desc' },
];
const BY_TITLE: SortOption[] = [
  { value: 'name-asc', label: 'Name A-Z', field: 'title', order: 'asc' },
  { value: 'name-desc', label: 'Name Z-A', field: 'title', order: 'desc' },
];

export const SORT_OPTIONS: Record<BrowseTab, SortOption[]> = {
  // Most sites first by default, so the big manufacturers come before the
  // long tail of single-site companies.
  companies: [{ value: 'factories-desc', label: 'Most sites', field: 'factoryCount', order: 'desc' }, ...BY_NAME],
  factories: [...BY_NAME, { value: 'workforce-desc', label: 'Largest workforce', field: 'workforceSize', order: 'desc' }],
  occupations: BY_TITLE,
  // The skills most careers use first: the list opens on what matters most,
  // not on the alphabet.
  skills: [{ value: 'careers-desc', label: 'Most careers', field: 'occupationCount', order: 'desc' }, ...BY_NAME],
};

export interface FilterState {
  state?: StateCode;
  industry?: string;
  category?: string;
}

export interface FilterBarProps {
  activeTab: BrowseTab;
  sortValue: string;
  onSortChange: (value: string) => void;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  industries?: string[];
  categories?: string[];
  /** Shown beside the filters while one is set: how many rows match. */
  summary?: string | null;
}

const ALL = '__all__';

const TRIGGER =
  'inline-flex h-11 min-w-0 items-center gap-1.5 text-sm transition-colors sm:h-9 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';

/** A choice shown as text: the current value and a chevron. No box. */
function Choice({
  label,
  value,
  options,
  onChange,
  allLabel,
  align = 'start',
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
  /** The entry that clears the choice ("All states"). Omit when one option is always chosen. */
  allLabel?: string;
  align?: 'start' | 'end';
}) {
  const selected = options.find((o) => o.value === value)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${selected ?? allLabel ?? ''}`}
          className={cn(TRIGGER, selected && allLabel ? 'font-medium text-fg-default' : 'text-fg-muted hover:text-fg-default')}
        >
          <span className="min-w-0 truncate">{selected ?? allLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-soft" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))] min-w-[12rem]">
        <DropdownMenuRadioGroup value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : next)}>
          {allLabel && (
            <DropdownMenuRadioItem value={ALL} className="min-h-11 sm:min-h-9">
              {allLabel}
            </DropdownMenuRadioItem>
          )}
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="min-h-11 sm:min-h-9">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Filters on the left, sort on the right, all as plain text. A filter that is
 * set reads as its value; "Clear" puts the list back.
 */
export default function FilterBar({
  activeTab,
  sortValue,
  onSortChange,
  filters,
  onFilterChange,
  industries = [],
  categories = [],
  summary,
}: FilterBarProps) {
  const sortOptions = SORT_OPTIONS[activeTab];
  const stateOptions = useMemo(() => US_STATES.map((s) => ({ value: s.code as string, label: s.name as string })), []);
  // A value arriving by link may not be in the fetched list: keep it choosable.
  const withCurrent = (values: string[], current: string | undefined) =>
    (current && !values.includes(current) ? [...values, current].sort() : values).map((v) => ({ value: v, label: v }));
  const industryOptions = useMemo(() => withCurrent(industries, filters.industry), [industries, filters.industry]);
  const categoryOptions = useMemo(() => withCurrent(categories, filters.category), [categories, filters.category]);

  const showState = activeTab === 'factories';
  const showIndustry = (activeTab === 'companies' || activeTab === 'factories') && industryOptions.length > 0;
  const showCategory = activeTab === 'skills' && categoryOptions.length > 0;
  const filtered = Boolean(filters.state || filters.industry || filters.category);

  return (
    <div className="my-2 flex flex-wrap items-center justify-between gap-x-6 sm:my-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-6">
        {showState && (
          <Choice
            label="State"
            value={filters.state}
            options={stateOptions}
            onChange={(value) => onFilterChange({ ...filters, state: value as StateCode | undefined })}
            allLabel="All states"
          />
        )}
        {showIndustry && (
          <Choice
            label="Industry"
            value={filters.industry}
            options={industryOptions}
            onChange={(value) => onFilterChange({ ...filters, industry: value })}
            allLabel="All industries"
          />
        )}
        {showCategory && (
          <Choice
            label="Category"
            value={filters.category}
            options={categoryOptions}
            onChange={(value) => onFilterChange({ ...filters, category: value })}
            allLabel="All categories"
          />
        )}
        {filtered && (
          <>
            <button type="button" onClick={() => onFilterChange({})} className={cn(TRIGGER, 'text-fg-muted underline underline-offset-4 hover:text-fg-default')}>
              Clear
            </button>
            {summary && (
              <span role="status" className="text-sm tabular-nums text-fg-soft">
                {summary}
              </span>
            )}
          </>
        )}
      </div>

      <Choice label="Sort" value={sortValue} options={sortOptions} onChange={(value) => value && onSortChange(value)} align="end" />
    </div>
  );
}
