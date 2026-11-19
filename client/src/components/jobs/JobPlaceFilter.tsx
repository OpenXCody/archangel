import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MapPin, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { US_STATES } from '@shared/states';
import { placeSearchAvailable, searchPlaces, type Place } from '../../lib/geocode';
import { fieldClass } from '../account/parts';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { stateName } from '../../lib/places';
import { publicKeys } from '../../lib/queryKeys';

/** Where the jobs list is narrowed to: a state, or a point with a name. */
export type JobPlace =
  | { kind: 'state'; code: string }
  | { kind: 'near'; lat: number; lng: number; label: string };

/** The distances on offer around a place, in miles. */
export const WITHIN_CHOICES = [10, 25, 50, 100];
export const DEFAULT_WITHIN = 50;

const ANYWHERE = 'anywhere';

/** "Round Rock, TX"; a ZIP code keeps its town: "78664, Round Rock, TX". */
function placeLabel(place: Place): string {
  if (!place.context) return place.name;
  if (/^\d/.test(place.name)) return `${place.name}, ${place.context}`;
  return `${place.name}, ${place.context.split(', ').pop()}`;
}

export function jobPlaceLabel(place: JobPlace | null): string {
  if (!place) return '';
  return place.kind === 'state' ? stateName(place.code) : place.label;
}

type Option =
  | { key: string; kind: 'state'; code: string; title: string; detail?: string }
  | { key: string; kind: 'place'; place: Place; title: string; detail?: string }
  | { key: string; kind: 'zip'; zip: string; title: string; detail?: string };

interface JobPlaceFilterProps {
  value: JobPlace | null;
  onChange: (value: JobPlace | null) => void;
  /** Miles around a chosen place. */
  within: number;
  onWithinChange: (miles: number) => void;
  /** States that have open jobs, offered before anything is typed. */
  states: string[];
  /** The signed-in person's ZIP code, offered first as "Near 78664". */
  homeZip?: string | null;
}

/**
 * "Where" for the jobs list. A ZIP code or town is typed and looked up (the
 * map's geocoder: towns, counties and ZIP codes), or a state is picked. The
 * browser is never asked where the person is. Without a map key there is no
 * lookup, and the control is the list of states alone.
 */
export default function JobPlaceFilter(props: JobPlaceFilterProps) {
  return placeSearchAvailable() ? <PlaceCombobox {...props} /> : <StateSelect {...props} />;
}

const triggerClass = 'h-11 min-w-0 rounded-lg border-line-strong bg-surface px-3 text-base text-text-1 sm:text-sm';
const contentClass = 'max-w-[calc(100vw-2rem)] rounded-lg border-line-strong bg-surface';

function StateSelect({ value, onChange, states }: JobPlaceFilterProps) {
  const state = value?.kind === 'state' ? value.code : '';
  const listed = [...new Set([...(state ? [state] : []), ...states])].sort((a, b) => stateName(a).localeCompare(stateName(b)));
  return (
    <Select value={state || ANYWHERE} onValueChange={(code) => onChange(code === ANYWHERE ? null : { kind: 'state', code })}>
      <SelectTrigger aria-label="Filter by state" className={triggerClass}>
        <SelectValue placeholder="Anywhere" />
      </SelectTrigger>
      <SelectContent className={contentClass}>
        <SelectItem value={ANYWHERE} className="py-2.5">
          Anywhere
        </SelectItem>
        {listed.map((code) => (
          <SelectItem key={code} value={code} className="py-2.5">
            {stateName(code)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PlaceCombobox({ value, onChange, within, onWithinChange, states, homeZip }: JobPlaceFilterProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const chosen = jobPlaceLabel(value);
  const [term, setTerm] = useState(chosen);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // The ZIP code being looked up after "Near 78664" was chosen.
  const [resolving, setResolving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // The address changed (Back, Clear filters): show what it says.
  useEffect(() => {
    setTerm(chosen);
  }, [chosen]);

  const typed = term.trim();
  const editing = typed !== chosen;
  const query = useDebouncedValue(editing ? typed : '', 300);
  const searching = editing && typed.length >= 2;
  const places = useQuery({
    queryKey: publicKeys.jobPlaces(query),
    queryFn: ({ signal }) => searchPlaces(query, signal),
    enabled: searching && query.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const waiting = searching && (query !== typed || places.isFetching);

  const options: Option[] = [];
  if (searching) {
    const lower = typed.toLowerCase();
    for (const state of US_STATES) {
      if (state.name.toLowerCase().startsWith(lower) || state.code.toLowerCase() === lower) {
        options.push({ key: `state:${state.code}`, kind: 'state', code: state.code, title: state.name, detail: 'State' });
      }
    }
    options.splice(4);
    if (query === typed) {
      for (const place of places.data ?? []) {
        options.push({ key: `place:${place.id}`, kind: 'place', place, title: place.name, detail: place.context || undefined });
      }
    }
  } else if (!editing || typed === '') {
    if (homeZip) options.push({ key: 'zip', kind: 'zip', zip: homeZip.slice(0, 5), title: `Near ${homeZip.slice(0, 5)}`, detail: 'Your ZIP code' });
    for (const code of [...states].sort((a, b) => stateName(a).localeCompare(stateName(b)))) {
      options.push({ key: `state:${code}`, kind: 'state', code, title: stateName(code) });
    }
  }

  const close = () => {
    setOpen(false);
    setActiveIndex(0);
  };

  const choose = (option: Option) => {
    setProblem(null);
    close();
    if (option.kind === 'state') onChange({ kind: 'state', code: option.code });
    else if (option.kind === 'place') {
      onChange({ kind: 'near', lat: option.place.center[1], lng: option.place.center[0], label: placeLabel(option.place) });
    } else {
      // The person's own ZIP code: look it up, then it is a place like any other.
      setResolving(option.zip);
      searchPlaces(option.zip)
        .then((found) => {
          const place = found.find((each) => each.name.startsWith(option.zip)) ?? found[0];
          if (place) onChange({ kind: 'near', lat: place.center[1], lng: place.center[0], label: placeLabel(place) });
          else setProblem(`${option.zip} was not found. Type a town instead.`);
        })
        .catch(() => setProblem('That ZIP code could not be looked up. Type a town instead.'))
        .finally(() => setResolving(null));
    }
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
      const option = open ? options[Math.min(activeIndex, options.length - 1)] : undefined;
      if (option) {
        event.preventDefault();
        choose(option);
      }
    } else if (event.key === 'Escape') {
      if (open) event.stopPropagation();
      close();
      setTerm(chosen);
    }
  };

  const showList = open && (searching || options.length > 0);
  const near = value?.kind === 'near';

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 gap-2">
        <div
          className="relative min-w-0 flex-1"
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            close();
            // Left without choosing: what was chosen before still stands.
            setTerm(chosen);
          }}
        >
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-2" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Where: a ZIP code, a town or a state"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            enterKeyHint="search"
            placeholder="ZIP code, town or state"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setActiveIndex(0);
              setOpen(true);
              setProblem(null);
            }}
            onFocus={(e) => {
              setOpen(true);
              // What is there is replaced by typing, not added to.
              e.currentTarget.select();
            }}
            onKeyDown={onKeyDown}
            className={cn(fieldClass, 'h-11 pl-9 pr-11')}
          />
          {(waiting && open) || resolving ? (
            <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-2" />
          ) : (
            value && (
              <button
                type="button"
                aria-label="Clear the place"
                onClick={() => {
                  onChange(null);
                  setTerm('');
                  inputRef.current?.focus();
                }}
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-text-2 hover:text-text-1"
              >
                <X className="h-4 w-4" />
              </button>
            )
          )}

          {showList && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line-strong bg-surface p-1">
              {searching && options.length === 0 && (
                <p className="px-2.5 py-2.5 text-sm text-text-2">{waiting ? 'Looking up places' : `No place matches “${typed}”.`}</p>
              )}
              <ul id={listId} role="listbox" aria-label="Places">
                {options.map((option, index) => (
                  <li
                    key={option.key}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    // Keep focus in the input so choosing does not blur-close the list first.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-text-1',
                      index === activeIndex && 'bg-surface-hover'
                    )}
                  >
                    <span className="min-w-0 break-words">{option.title}</span>
                    {option.detail && <span className="shrink-0 text-xs text-text-3">{option.detail}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {near && (
          <Select value={String(within)} onValueChange={(miles) => onWithinChange(Number(miles))}>
            <SelectTrigger aria-label="Distance" className={cn(triggerClass, 'w-[7.5rem] shrink-0')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={contentClass}>
              {WITHIN_CHOICES.map((miles) => (
                <SelectItem key={miles} value={String(miles)} className="py-2.5">
                  {miles} miles
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {problem && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
