import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { occupationsApi } from '../../lib/api';
import { errorMessage } from '../../lib/http';
import { KIND_ICON, fieldClass } from './parts';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { publicKeys } from '../../lib/queryKeys';

export interface CareerOption {
  id: string;
  title: string;
  /** The other name a search found it by ("PLC Programmer" for Controls Engineer), said under the title. */
  alsoCalled?: string | null;
}

interface CareerPickerProps {
  /** Id for the text input, so a label can point at it. */
  id: string;
  value: CareerOption | null;
  onChange: (value: CareerOption | null) => void;
  /** Offered before anything is typed, e.g. the careers at the chosen factory. */
  suggestions?: CareerOption[];
  suggestionsLabel?: string;
  disabled?: boolean;
}

/** How many careers the list offers at once. */
const SHOWN = 8;

/**
 * Pick one career by searching the catalogue. A combobox: type to search,
 * arrow keys to move, Enter to choose, Escape to close.
 */
export default function CareerPicker({ id, value, onChange, suggestions = [], suggestionsLabel, disabled }: CareerPickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  // Choosing a career replaces the search box it was chosen from. Focus goes
  // to what took its place, not back to the top of the page.
  const focusPicked = useRef(false);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = useDebouncedValue(term.trim());
  const searching = term.trim().length >= 2;

  const results = useQuery({
    queryKey: publicKeys.picker('occupations', query),
    queryFn: () => occupationsApi.list({ search: query, limit: SHOWN }),
    enabled: searching && query.length >= 2,
    staleTime: 60_000,
    // Asked even when the browser says it is offline, so the list says so rather than "Searching" for ever.
    networkMode: 'always',
    retry: false,
  });
  const total = results.data?.total ?? 0;

  const waiting = searching && (query !== term.trim() || results.isPending);
  const options: CareerOption[] = searching
    ? (results.data?.data ?? []).map((occupation) => ({ id: occupation.id, title: occupation.title, alsoCalled: occupation.alsoCalled }))
    : suggestions;
  const CareerIcon = KIND_ICON.career;

  const pickedId = value?.id;
  useEffect(() => {
    if (pickedId && focusPicked.current) changeRef.current?.focus();
    focusPicked.current = false;
  }, [pickedId]);

  const choose = ({ id: chosen, title }: CareerOption) => {
    focusPicked.current = true;
    // What it was found by is the list's to say, not the form's to keep.
    onChange({ id: chosen, title });
    setTerm('');
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (options.length > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((index) => (index + step + options.length) % options.length);
      }
    } else if (event.key === 'Enter') {
      // Never submit the surrounding form from the search box.
      event.preventDefault();
      const option = open ? options[Math.min(activeIndex, options.length - 1)] : undefined;
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      if (open) event.stopPropagation();
      setOpen(false);
    }
  };

  if (value) {
    return (
      <div className={cn(fieldClass, 'flex min-h-[42px] items-center gap-2.5')}>
        <CareerIcon className="h-4 w-4 shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1 break-words text-fg-default" data-picked-career={value.id}>
          {value.title}
        </span>
        <button
          ref={changeRef}
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setOpen(true);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="shrink-0 text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default"
        >
          Change
        </button>
      </div>
    );
  }

  const showList = open && !disabled && (searching || options.length > 0);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder="Search careers"
        disabled={disabled}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn(fieldClass, 'pl-9 pr-9')}
      />
      {waiting && open && <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-muted" />}

      {showList && (
        <div
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-bg-surface p-1 shadow-lg"
        >
          {!searching && suggestionsLabel && options.length > 0 && (
            <p className="px-2.5 pb-1 pt-1.5 text-xs text-fg-muted">{suggestionsLabel}</p>
          )}
          {searching && waiting ? (
            <p className="px-2.5 py-2.5 text-sm text-fg-muted">Searching careers</p>
          ) : searching && results.isError ? (
            <p role="alert" className="px-2.5 py-2.5 text-sm text-danger">
              {errorMessage(results.error)}
            </p>
          ) : searching && options.length === 0 ? (
            // The career is the kind of work; the title is the employer's own words.
            <p className="px-2.5 py-2.5 text-sm text-fg-muted" data-career-none>
              No career matches “{query}”. Search for the closest kind of work: the job title can say anything.
            </p>
          ) : null}
          <ul id={listId} role="listbox" aria-label="Careers">
            {!(searching && waiting) &&
              options.map((option, index) => (
                <li
                  key={option.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  // Keep focus in the input so choosing does not blur-close the list first.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm text-fg-default',
                    index === activeIndex && 'bg-bg-elevated'
                  )}
                >
                  <CareerIcon className="h-4 w-4 shrink-0 text-fg-muted" />
                  <span className="min-w-0 break-words">
                    {option.title}
                    {/* A career found by a name it is also known by says which: the title alone would look like a wrong answer. */}
                    {option.alsoCalled && (
                      <span className="block text-xs text-fg-muted" data-career-also>
                        Also called {option.alsoCalled}
                      </span>
                    )}
                  </span>
                </li>
              ))}
          </ul>
          {searching && !waiting && total > options.length && options.length > 0 && (
            <p className="px-2.5 pb-1.5 pt-2 text-xs text-fg-muted" data-career-more>
              {options.length} of {total.toLocaleString('en-US')}. Type more to narrow the list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
