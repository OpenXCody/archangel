import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { formatFactoryName } from '@shared/displayName';
import { US_STATES } from '@shared/states';
import { cn } from '@/lib/utils';
import type { EmployerFactory } from '../../lib/account';
import { formatPlace } from '../../lib/jobFormat';
import { ENTITY, fieldClass } from './parts';

/** A plant's name as it reads everywhere else: not the raw upper-case record. */
export function plantName(factory: Pick<EmployerFactory, 'name'>): string {
  return formatFactoryName(factory.name) || factory.name;
}

/** Where a plant is: its street when on record, then the city and state. */
export function plantWhere(factory: Pick<EmployerFactory, 'address' | 'city' | 'state'>): string {
  const street = factory.address ? formatFactoryName(factory.address) : '';
  return [street, formatPlace(factory.city, factory.state)].filter(Boolean).join(' · ');
}

const STATE_NAMES = new Map<string, string>(US_STATES.map((state) => [state.code, state.name]));

/** Everything a plant can be found by, lower case. */
function searchText(factory: EmployerFactory): string {
  const stateName = factory.state ? (STATE_NAMES.get(factory.state.toUpperCase()) ?? '') : '';
  return [factory.name, factory.address, factory.city, factory.state, stateName].filter(Boolean).join(' ').toLowerCase();
}

interface PlantPickerProps {
  /** Id for the text input, so a label can point at it. */
  id: string;
  factories: EmployerFactory[];
  /** The chosen plant's id, or '' for none. */
  value: string;
  onChange: (factoryId: string) => void;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * Pick one of a company's plants. A combobox like the career field: the whole
 * list opens on focus, typing narrows it by name, street, city or state, the
 * arrow keys move, Enter chooses, Escape closes. Works the same for three
 * plants and for ninety.
 */
export default function PlantPicker({ id, factories, value, onChange, invalid, describedBy }: PlantPickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Choosing replaces the search box; focus goes to what took its place.
  const focusPicked = useRef(false);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const picked = factories.find((factory) => factory.id === value) ?? null;
  const FactoryIcon = ENTITY.factory.icon;

  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const options = words.length === 0 ? factories : factories.filter((factory) => words.every((word) => searchText(factory).includes(word)));

  useEffect(() => {
    if (value && focusPicked.current) changeRef.current?.focus();
    focusPicked.current = false;
  }, [value]);

  // The highlighted row stays in view while the arrow keys move through a long list.
  useEffect(() => {
    if (open) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const choose = (factory: EmployerFactory) => {
    focusPicked.current = true;
    onChange(factory.id);
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

  if (picked) {
    return (
      <div className={cn(fieldClass, 'flex min-h-[42px] items-center gap-2.5')}>
        <FactoryIcon className={cn('h-4 w-4 shrink-0', ENTITY.factory.text)} />
        <span className="min-w-0 flex-1" data-picked-factory={picked.id}>
          <span className="block break-words text-fg-default">{plantName(picked)}</span>
          {plantWhere(picked) && <span className="block break-words text-xs text-fg-muted">{plantWhere(picked)}</span>}
        </span>
        {factories.length > 1 && (
          <button
            ref={changeRef}
            type="button"
            onClick={() => {
              onChange('');
              setOpen(true);
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="shrink-0 text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default"
          >
            Change
          </button>
        )}
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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={factories.length > 8 ? 'Search by name, city or street' : 'Choose a factory'}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn(fieldClass, 'pl-9')}
      />

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-bg-surface p-1 shadow-lg">
          {options.length === 0 && <p className="px-2.5 py-2.5 text-sm text-fg-muted">No factory matches “{term.trim()}”.</p>}
          <ul ref={listRef} id={listId} role="listbox" aria-label="Factories">
            {options.map((factory, index) => (
              <li
                key={factory.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // Keep focus in the input so choosing does not blur-close the list first.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(factory)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn('flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-default', index === activeIndex && 'bg-bg-elevated')}
              >
                <FactoryIcon className={cn('mt-0.5 h-4 w-4 shrink-0', ENTITY.factory.text)} />
                <span className="min-w-0">
                  <span className="block break-words">{plantName(factory)}</span>
                  {plantWhere(factory) && <span className="block break-words text-xs text-fg-muted">{plantWhere(factory)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
