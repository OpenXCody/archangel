import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { skillsApi } from '../../lib/api';
import { errorMessage } from '../../lib/http';
import { fieldClass, useDebouncedValue } from '../account/parts';
import { publicKeys } from '../../lib/queryKeys';

/** One skill a job asks for. Required skills rank applicants; optional ones are listed. */
export interface JobSkillTag {
  id: string;
  name: string;
  required: boolean;
}

interface JobSkillTagsProps {
  /** Id for the "Add a skill" input, so a label can point at it. */
  id: string;
  value: JobSkillTag[];
  onChange: (value: JobSkillTag[]) => void;
  /** Shown in place of the groups when nothing is tagged. */
  emptyNote?: string;
  disabled?: boolean;
}

type FocusTarget = { id: string; control: 'move' | 'remove' } | 'input';

/** The most results offered at once. More are fetched, since tagged skills are left out. */
const SHOWN = 8;

/**
 * The skills tagged on a job, in two groups, with a type-ahead to add more.
 * Each tag can be moved to the other group or removed. The group a tag moves
 * to is the one its arrow points at: Required sits above Optional.
 */
export default function JobSkillTags({ id, value, onChange, emptyNote, disabled }: JobSkillTagsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusNext = useRef<FocusTarget | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // The tag removed last and where it sat, so one slip is put right in one press.
  const [removed, setRemoved] = useState<{ skill: JobSkillTag; index: number } | null>(null);

  const required = value.filter((skill) => skill.required);
  const optional = value.filter((skill) => !skill.required);

  // A moved or removed tag takes its buttons with it, so put focus somewhere
  // sensible once the new list has rendered.
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    if (target === 'input') return inputRef.current?.focus();
    const button = rootRef.current?.querySelector<HTMLButtonElement>(
      `[data-skill-tag="${target.id}"] [data-control="${target.control}"]`
    );
    (button ?? inputRef.current)?.focus();
  }, [value]);

  const move = (skill: JobSkillTag) => {
    // Lands at the end of the other group.
    focusNext.current = { id: skill.id, control: 'move' };
    setAnnouncement(`${skill.name} moved to ${skill.required ? 'Optional' : 'Required'}.`);
    onChange([...value.filter((s) => s.id !== skill.id), { ...skill, required: !skill.required }]);
  };

  const remove = (skill: JobSkillTag) => {
    const group = skill.required ? required : optional;
    const index = group.findIndex((s) => s.id === skill.id);
    const neighbour = group[index + 1] ?? group[index - 1];
    focusNext.current = neighbour ? { id: neighbour.id, control: 'remove' } : 'input';
    setAnnouncement(`${skill.name} removed.`);
    setRemoved({ skill, index: value.findIndex((s) => s.id === skill.id) });
    onChange(value.filter((s) => s.id !== skill.id));
  };

  const undoRemove = () => {
    if (!removed) return;
    const { skill, index } = removed;
    setRemoved(null);
    if (value.some((s) => s.id === skill.id)) return;
    focusNext.current = { id: skill.id, control: 'remove' };
    setAnnouncement(`${skill.name} put back.`);
    onChange([...value.slice(0, index), skill, ...value.slice(index)]);
  };

  const add = (skill: { id: string; name: string }) => {
    if (value.some((s) => s.id === skill.id)) return;
    setAnnouncement(`${skill.name} added to Required.`);
    onChange([...value, { id: skill.id, name: skill.name, required: true }]);
  };

  return (
    <div ref={rootRef} className="min-w-0 space-y-3">
      {value.length === 0 ? (
        emptyNote && <p className="text-sm text-fg-muted">{emptyNote}</p>
      ) : (
        <>
          <TagGroup label="Required" skills={required} onMove={move} onRemove={remove} disabled={disabled} />
          <TagGroup label="Optional" skills={optional} onMove={move} onRemove={remove} disabled={disabled} />
        </>
      )}
      {removed && !value.some((skill) => skill.id === removed.skill.id) && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-fg-muted" data-skill-removed>
          Removed {removed.skill.name}.
          <button
            type="button"
            onClick={undoRemove}
            className="text-sm font-medium text-fg-muted underline underline-offset-4 transition-colors hover:text-fg-default"
          >
            Undo
          </button>
        </p>
      )}
      <SkillAdder id={id} inputRef={inputRef} taken={value} onAdd={add} disabled={disabled} />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

interface TagGroupProps {
  label: 'Required' | 'Optional';
  skills: JobSkillTag[];
  onMove: (skill: JobSkillTag) => void;
  onRemove: (skill: JobSkillTag) => void;
  disabled?: boolean;
}

const tagButtonClass =
  'flex w-9 shrink-0 items-center justify-center border-l border-border-subtle text-fg-muted transition-colors ' +
  'hover:bg-bg-elevated hover:text-fg-default disabled:pointer-events-none disabled:opacity-60';

function TagGroup({ label, skills, onMove, onRemove, disabled }: TagGroupProps) {
  const headingId = useId();
  const other = label === 'Required' ? 'Optional' : 'Required';
  const MoveIcon = label === 'Required' ? ArrowDown : ArrowUp;

  return (
    <div className="min-w-0" data-skill-group={label.toLowerCase()}>
      <p id={headingId} className="mb-1.5 text-xs font-medium text-fg-muted">
        {label}
      </p>
      {skills.length === 0 ? (
        <p className="text-sm text-fg-soft">None</p>
      ) : (
        <ul aria-labelledby={headingId} className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <li
              key={skill.id}
              data-skill-tag={skill.id}
              className="flex min-h-[38px] max-w-full items-stretch overflow-hidden rounded-md border border-border-strong text-sm text-fg-default"
            >
              <span className="min-w-0 self-center break-words px-2.5 py-1.5">{skill.name}</span>
              <button
                type="button"
                data-control="move"
                disabled={disabled}
                onClick={() => onMove(skill)}
                aria-label={`Move ${skill.name} to ${other}`}
                title={`Move to ${other}`}
                className={tagButtonClass}
              >
                <MoveIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-control="remove"
                disabled={disabled}
                onClick={() => onRemove(skill)}
                aria-label={`Remove ${skill.name}`}
                title="Remove"
                className={tagButtonClass}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface SkillAdderProps {
  id: string;
  inputRef: RefObject<HTMLInputElement>;
  taken: JobSkillTag[];
  onAdd: (skill: { id: string; name: string }) => void;
  disabled?: boolean;
}

/**
 * Search the skills catalogue and add a result. A combobox: type to search,
 * arrow keys to move, Enter to add, Escape to close. Tagged skills are left out.
 */
function SkillAdder({ id, inputRef, taken, onAdd, disabled }: SkillAdderProps) {
  const listId = useId();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = useDebouncedValue(term.trim());
  const searching = term.trim().length >= 2;

  const results = useQuery({
    queryKey: publicKeys.picker('job-skills', query),
    queryFn: () => skillsApi.list({ search: query, limit: SHOWN + 16 }),
    enabled: searching && query.length >= 2,
    staleTime: 60_000,
    // Asked even when the browser says it is offline, so the list says so rather than "Searching" for ever.
    networkMode: 'always',
    retry: false,
  });

  const waiting = searching && (query !== term.trim() || results.isPending);
  const matches = searching && !waiting ? (results.data?.data ?? []) : [];
  const options = matches.filter((skill) => !taken.some((tag) => tag.id === skill.id)).slice(0, SHOWN);
  const showList = open && !disabled && searching;

  const choose = (skill: { id: string; name: string }) => {
    onAdd(skill);
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
      const option = showList ? options[Math.min(activeIndex, options.length - 1)] : undefined;
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      // The first press closes the list; the next clears what was typed.
      if (open) event.stopPropagation();
      else if (term) setTerm('');
      setOpen(false);
    }
  };

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
        aria-label="Add a skill"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder="Add a skill"
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
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-bg-surface p-1 shadow-lg">
          {waiting ? (
            <p className="px-2.5 py-2.5 text-sm text-fg-muted">Searching skills</p>
          ) : results.isError ? (
            <p role="alert" className="px-2.5 py-2.5 text-sm text-danger">
              {errorMessage(results.error)}
            </p>
          ) : options.length === 0 ? (
            <p className="px-2.5 py-2.5 text-sm text-fg-muted">
              {matches.length > 0 ? `Every match for “${query}” is already tagged.` : `No skills match “${query}”.`}
            </p>
          ) : null}
          <ul id={listId} role="listbox" aria-label="Skills">
            {options.map((option, index) => (
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
                  'flex cursor-pointer flex-wrap items-baseline gap-x-2.5 rounded-md px-2.5 py-2.5 text-sm text-fg-default',
                  index === activeIndex && 'bg-bg-elevated'
                )}
              >
                <span className="min-w-0 break-words">{option.name}</span>
                {option.category && <span className="min-w-0 truncate text-xs text-fg-muted">{option.category}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
