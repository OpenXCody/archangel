import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { occupationsApi } from '../../lib/api';
import { errorMessage } from '../../lib/http';
import { KIND_ICON, fieldClass } from './parts';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { publicKeys } from '../../lib/queryKeys';
import { kindLine } from '@shared/military';

export interface CareerOption {
  id: string;
  title: string;
  /** The other name a search found it by ("PLC Programmer" for Controls Engineer), said under the title. */
  alsoCalled?: string | null;
  /** A military career's kind and code ("Navy rating · HT"), said under the title in the list that offers them. */
  line?: string | null;
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
  /**
   * The military careers in place of the civilian ones: a rating, an MOS or a
   * specialty, found by its code, its title or its service. Only the door a
   * person starts from what they have done asks for them.
   */
  military?: boolean;
  /**
   * Open the list above the field when there is not room for it under the field and more above: for a
   * picker that stands at the end of a page, whose list would otherwise open below the screen.
   */
  flip?: boolean;
}

/** How many careers the list offers at once. */
const SHOWN = 8;

/** The most room the list takes (Tailwind's max-h-72), with its margin, and the least it is worth opening in. */
const LIST_ROOM = 296;
const LIST_LEAST = 120;

/**
 * Where a list that may open above its field goes: under it while it fits there, or when there is no more
 * room above; otherwise above it, no taller than the room there. Read against what is on screen, which on a
 * phone ends where the keyboard begins.
 */
function listPlace(field: HTMLElement): { above: boolean; room: number } {
  const box = field.getBoundingClientRect();
  const view = window.visualViewport;
  const top = view?.offsetTop ?? 0;
  const bottom = top + (view?.height ?? window.innerHeight);
  // The page's header stands over the top of the screen.
  const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
  const under = bottom - box.bottom;
  const over = box.top - Math.max(top, header);
  const above = under < LIST_ROOM && over > under;
  return { above, room: Math.max(LIST_LEAST, Math.min(LIST_ROOM, above ? over : under) - 8) };
}

/**
 * Pick one career by searching the catalogue. A combobox: type to search,
 * arrow keys to move, Enter to choose, Escape to close.
 */
export default function CareerPicker({ id, value, onChange, suggestions = [], suggestionsLabel, disabled, military = false, flip = false }: CareerPickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  // Choosing a career replaces the search box it was chosen from. Focus goes
  // to what took its place, not back to the top of the page.
  const focusPicked = useRef(false);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Where the list opens, for a picker that may open it above the field (`flip`); null is under it, as ever.
  const [place, setPlace] = useState<{ above: boolean; room: number } | null>(null);
  const query = useDebouncedValue(term.trim());
  const searching = term.trim().length >= 2;

  const results = useQuery({
    queryKey: publicKeys.picker(military ? 'military-careers' : 'occupations', query),
    queryFn: () => occupationsApi.list({ search: query, limit: SHOWN, ...(military && { military: 1 }) }),
    enabled: searching && query.length >= 2,
    staleTime: 60_000,
    // Asked even when the browser says it is offline, so the list says so rather than "Searching" for ever.
    networkMode: 'always',
    retry: false,
  });
  const total = results.data?.total ?? 0;

  const waiting = searching && (query !== term.trim() || results.isPending);
  const options: CareerOption[] = searching
    ? (results.data?.data ?? []).map((occupation) => ({
        id: occupation.id,
        title: occupation.title,
        alsoCalled: occupation.alsoCalled,
        line: kindLine(occupation.kind, occupation.code),
      }))
    : suggestions;
  const CareerIcon = KIND_ICON.career;

  const showList = open && !disabled && (searching || options.length > 0);
  // Measured when the list opens and as it fills: by then a phone's keyboard has taken its part of the screen.
  const optionCount = options.length;
  useLayoutEffect(() => {
    if (!flip || !showList || !inputRef.current) return;
    const field = inputRef.current;
    const measure = () => {
      const next = listPlace(field);
      setPlace((current) => (current && current.above === next.above && current.room === next.room ? current : next));
    };
    measure();
    const view = window.visualViewport;
    view?.addEventListener('resize', measure);
    return () => view?.removeEventListener('resize', measure);
  }, [flip, showList, optionCount, waiting]);
  const above = flip && place?.above;

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
        <CareerIcon className="h-4 w-4 shrink-0 text-text-2" />
        <span className="min-w-0 flex-1 break-words text-text-1" data-picked-career={value.id}>
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
          className="shrink-0 text-sm font-medium text-text-1 underline"
        >
          Change
        </button>
      </div>
    );
  }


  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-2" />
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
        placeholder={military ? 'Rating, MOS or specialty' : 'Search careers'}
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
      {waiting && open && <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-2" />}

      {showList && (
        <div
          className={cn(
            'absolute inset-x-0 z-30 max-h-72 overflow-y-auto rounded-lg border border-line-strong bg-surface p-1',
            above ? 'bottom-full mb-1' : 'top-full mt-1'
          )}
          style={flip && place ? { maxHeight: place.room } : undefined}
          data-career-list={above ? 'above' : 'under'}
        >
          {!searching && suggestionsLabel && options.length > 0 && (
            <p className="px-2.5 pb-1 pt-1.5 text-xs text-text-3">{suggestionsLabel}</p>
          )}
          {searching && waiting ? (
            <p className="px-2.5 py-2.5 text-sm text-text-2">Searching careers</p>
          ) : searching && results.isError ? (
            <p role="alert" className="px-2.5 py-2.5 text-sm text-danger">
              {errorMessage(results.error)}
            </p>
          ) : searching && options.length === 0 ? (
            // The career is the kind of work; the title is the employer's own words.
            <p className="px-2.5 py-2.5 text-sm text-text-2" data-career-none>
              {military
                ? `Nothing matches “${query}”. Search by the code, the title or the service.`
                : `No career matches “${query}”. Search for the closest kind of work: the job title can say anything.`}
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
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm text-text-1',
                    index === activeIndex && 'bg-surface-hover'
                  )}
                >
                  <CareerIcon className="h-4 w-4 shrink-0 text-text-2" />
                  <span className="min-w-0 break-words">
                    {option.title}
                    {/* A career found by a name it is also known by says which: the title alone would look like a wrong answer. */}
                    {option.line ? (
                      <span className="block text-xs text-text-3" data-career-line>
                        {option.line}
                      </span>
                    ) : (
                      option.alsoCalled && (
                        <span className="block text-xs text-text-3" data-career-also>
                          Also called {option.alsoCalled}
                        </span>
                      )
                    )}
                  </span>
                </li>
              ))}
          </ul>
          {searching && !waiting && total > options.length && options.length > 0 && (
            <p className="px-2.5 pb-1.5 pt-2 text-xs text-text-3" data-career-more>
              {options.length} of {total.toLocaleString('en-US')}. Type more to narrow the list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
