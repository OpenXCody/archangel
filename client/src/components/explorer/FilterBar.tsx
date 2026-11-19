import { useMemo, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { US_STATES, type StateCode } from '@shared/states';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { industryLabel } from '@shared/industry';
import { cn, focusRing } from '@/lib/utils';
import type { BrowseTab } from './ExploreNav';

// Sort options per list
type SortOption = {
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

/** The Skills list's first order: not a sort of rows but the taxonomy's tree. */
export const SKILLS_BY_DOMAIN = 'domain';

export const SORT_OPTIONS: Record<BrowseTab, SortOption[]> = {
  // Most plants first by default, so the big manufacturers come before the
  // long tail of one-plant companies.
  companies: [{ value: 'factories-desc', label: 'Most plants', field: 'factoryCount', order: 'desc' }, ...BY_NAME],
  // Most people first by default: the plants whose size is known lead, the
  // largest first, and the rest follow by name.
  factories: [{ value: 'people-desc', label: 'Most people', field: 'workforceSize', order: 'desc' }, ...BY_NAME],
  // Careers with a path first, the fullest first: the list opens on the ones
  // with something to follow, and a career that is only a title comes last.
  occupations: [{ value: 'skills-desc', label: 'Most skills', field: 'skillCount', order: 'desc' }, ...BY_TITLE],
  // By domain first: the taxonomy's own order, domain by domain and group by
  // group, which is the Atlas as a list (SkillTree). Then the skills most
  // careers use, and the alphabet.
  skills: [
    { value: SKILLS_BY_DOMAIN, label: 'By domain', field: 'domain', order: 'asc' },
    { value: 'careers-desc', label: 'Most careers', field: 'occupationCount', order: 'desc' },
    ...BY_NAME,
  ],
};

export interface FilterState {
  state?: StateCode;
  industry?: string;
  /** Skills: a domain's slug, and the slug of one of its groups. Careers: the slug of their home domain. */
  domain?: string;
  group?: string;
}

/** A domain a list can be narrowed to, in the taxonomy's order: for Skills with its groups, for Careers alone. */
export interface DomainChoice {
  slug: string;
  name: string;
  groups?: { slug: string; name: string }[];
}

interface FilterBarProps {
  activeTab: BrowseTab;
  sortValue: string;
  onSortChange: (value: string) => void;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  /** Industries to offer, by the name a plant carries; shown by their short names. */
  industries?: string[];
  /** Skills: the domains to offer, each with its groups. Careers: the domains that are some career's home. */
  domains?: DomainChoice[];
  /** Leads the bar (the Skills list's switch to the Atlas). On a phone it shares the first line with the sort, and the filters follow. */
  leading?: ReactNode;
}

const ALL = '__all__';

const TRIGGER = `inline-flex h-11 min-w-0 items-center gap-1.5 text-sm transition-colors sm:h-9 ${focusRing}`;

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
          className={cn(TRIGGER, selected && allLabel ? 'font-medium text-text-1' : 'text-text-2 hover:text-text-1')}
        >
          <span className="min-w-0 truncate">{selected ?? allLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-3" />
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
 * set reads as its value; "Clear" puts the list back. How many rows match is
 * the list's own line, under this one.
 */
export default function FilterBar({
  activeTab,
  sortValue,
  onSortChange,
  filters,
  onFilterChange,
  industries = [],
  domains = [],
  leading,
}: FilterBarProps) {
  const sortOptions = SORT_OPTIONS[activeTab];
  const stateOptions = useMemo(() => US_STATES.map((s) => ({ value: s.code as string, label: s.name as string })), []);
  // A value arriving by link may not be in the fetched list: keep it choosable.
  const withCurrent = (values: string[], current: string | undefined, label: (value: string) => string = (value) => value) =>
    (current && !values.includes(current) ? [...values, current] : values)
      .map((value) => ({ value, label: label(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  // An industry is offered, and reads once chosen, by its short name ("Food", not "Food Manufacturing").
  const industryOptions = useMemo(() => withCurrent(industries, filters.industry, industryLabel), [industries, filters.industry]);
  // Domains and groups keep the taxonomy's order. A group is offered once its domain is chosen.
  const domainOptions = useMemo(() => domains.map((domain) => ({ value: domain.slug, label: domain.name })), [domains]);
  const groupOptions = useMemo(
    () => (domains.find((domain) => domain.slug === filters.domain)?.groups ?? []).map((group) => ({ value: group.slug, label: group.name })),
    [domains, filters.domain]
  );

  const showState = activeTab === 'factories';
  const showIndustry = (activeTab === 'companies' || activeTab === 'factories') && industryOptions.length > 0;
  const showDomain = (activeTab === 'skills' || activeTab === 'occupations') && domainOptions.length > 0;
  const showGroup = activeTab === 'skills' && showDomain && groupOptions.length > 0;
  const filtered = Boolean(filters.state || filters.industry || filters.domain || filters.group);

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 sm:mt-4">
      {leading}
      <div className={cn('flex min-w-0 flex-wrap items-center gap-x-6', leading && 'order-3 w-full sm:order-none sm:w-auto sm:flex-1')}>
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
        {showDomain && (
          <Choice
            label="Domain"
            value={filters.domain}
            options={domainOptions}
            // A group belongs to one domain: another domain, or none, clears it.
            onChange={(value) => onFilterChange({ ...filters, domain: value, group: undefined })}
            allLabel="All domains"
          />
        )}
        {showGroup && (
          <Choice
            label="Group"
            value={filters.group}
            options={groupOptions}
            onChange={(value) => onFilterChange({ ...filters, group: value })}
            allLabel="All groups"
          />
        )}
        {filtered && (
          <button type="button" onClick={() => onFilterChange({})} className={cn(TRIGGER, 'text-text-1 underline')}>
            Clear
          </button>
        )}
      </div>

      <Choice label="Sort" value={sortValue} options={sortOptions} onChange={(value) => value && onSortChange(value)} align="end" />
    </div>
  );
}
