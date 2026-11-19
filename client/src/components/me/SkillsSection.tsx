import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { skillsApi, type Taxonomy } from '../../lib/api';
import {
  useMarkSkill,
  useSuggestedSkills,
  type SkillMark,
  useMySkills,
  type MySkill,
  type SkillStatus,
} from '../../lib/seeker';
import {
  CardNote,
  ErrorNote,
  LoadError,
  RowsSkeleton,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
  textButtonClass,
} from '../account/parts';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { SkillHeldToggle } from '../account/SkillStatusButton';
import { PageSection } from '../layout/Page';
import { SkillGroupBox, SkillGroups } from '../path/SkillGroupBox';
import { shareOf, type SkillMarks } from '../path/model';
import { useTaxonomy } from '../../lib/queries';
import { publicKeys } from '../../lib/queryKeys';
import { linkClass } from './parts';

export default function SkillsSection() {
  const skills = useMySkills();
  const markSkill = useMarkSkill();
  // Where each skill sits: the person's list says only which skills, the taxonomy says in which group and domain.
  const taxonomy = useTaxonomy();
  // Skills taken off while this page is open keep their place until it is left: the tag goes quiet, and its mark puts it back.
  const [removed, setRemoved] = useState<MySkill[]>([]);

  const mine = skills.data ?? [];
  const heldCount = mine.filter((skill) => skill.status === 'held').length;
  const mark = (skillId: string, name: string, next: SkillMark) => {
    const before = mine.find((skill) => skill.skillId === skillId);
    if (next === 'none' && before) setRemoved((current) => [...current.filter((each) => each.skillId !== skillId), before]);
    markSkill.mutate(
      { skillId, name, mark: next },
      // Refused: it is still on the list, so it has no place to keep.
      next === 'none' ? { onError: () => setRemoved((current) => current.filter((each) => each.skillId !== skillId)) } : undefined
    );
  };

  const hasSuggestions = (useSuggestedSkills().data?.length ?? 0) > 0;
  const learningCount = mine.length - heldCount;
  const counts = [heldCount > 0 ? `${heldCount} held` : null, learningCount > 0 ? `${learningCount} learning` : null].filter(Boolean).join(', ');
  const onList = new Map(mine.map((skill) => [skill.skillId, skill.status]));
  const listed = [...mine, ...removed.filter((skill) => !onList.has(skill.skillId))].sort((a, b) => a.name.localeCompare(b.name));
  const marks: SkillMarks = {
    statusOf: (skillId) => onList.get(skillId) ?? 'none',
    mark: (skill, next) => mark(skill.id, skill.name, next),
    pending: false,
  };

  return (
    <PageSection
      title="Skills"
      description={`${counts || 'Held or learning'}. Shown to a company when you apply.`}
    >
      <SkillSearch mySkills={mine} onAdd={mark} disabled={skills.isPending} />

      {/* The person's own list comes first and needs no name under "Skills"; what is suggested is named, below it. */}
      <div className="mt-4">
        {skills.isPending || (listed.length > 0 && taxonomy.isPending) ? (
          <RowsSkeleton rows={3} />
        ) : skills.isError ? (
          <LoadError error={skills.error} onRetry={() => void skills.refetch()} retrying={skills.isFetching} />
        ) : listed.length === 0 ? (
          hasSuggestions ? null : <CardNote>
            None yet.{' '}
            <Link to="/explore?tab=occupations" className={linkClass}>
              Mark skills on a career's path
            </Link>
          </CardNote>
        ) : (
          <MySkillGroups skills={listed} taxonomy={taxonomy.data} marks={marks} />
        )}
      </div>
      <ErrorNote error={markSkill.error} className="mt-2" />
      <SuggestedSkills mySkills={mine} onMark={mark} />
    </PageSection>
  );
}

/**
 * The person's skills where they sit: under each domain, its skill groups as
 * frames of tags, the same tags a career's path is made of. A group's figure
 * is against the whole group ("2 of 8"), so the page says how far into each
 * group the person is. A skill is taken off with its mark; learning or held
 * is chosen on the skill's own page, or when it is added from the search.
 */
function MySkillGroups({ skills, taxonomy, marks }: { skills: MySkill[]; taxonomy: Taxonomy | undefined; marks: SkillMarks }) {
  const mine = new Set(skills.map((skill) => skill.skillId));
  const domains = (taxonomy?.domains ?? [])
    .map((domain) => ({
      slug: domain.slug,
      name: domain.name,
      groups: domain.groups
        .map((group) => ({ whole: group.skills, group: { slug: group.slug, name: group.name, domain, skills: group.skills.filter((skill) => mine.has(skill.id)) } }))
        .filter((each) => each.group.skills.length > 0),
    }))
    .filter((domain) => domain.groups.length > 0);
  // A skill the taxonomy does not place (or the taxonomy itself not read) is still the person's: it is listed, under no domain.
  const placed = new Set(domains.flatMap((domain) => domain.groups.flatMap((each) => each.group.skills.map((skill) => skill.id))));
  const rest = skills.filter((skill) => !placed.has(skill.skillId)).map((skill) => ({ id: skill.skillId, name: skill.name }));
  const wholeOf = new Map(domains.flatMap((domain) => domain.groups.map((each) => [each.group.slug, each.whole] as const)));

  return (
    <div className="space-y-4" data-my-skills>
      {domains.map((domain) => (
        <section key={domain.slug} aria-label={domain.name} data-my-domain={domain.slug}>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft">{domain.name}</h3>
          <SkillGroups
            groups={domain.groups.map((each) => each.group)}
            marks={marks}
            shareOfGroup={(group) => shareOf(wholeOf.get(group.slug) ?? group.skills, marks)}
            className="lg:grid-cols-2"
          />
        </section>
      ))}
      {rest.length > 0 && <SkillGroupBox name={domains.length > 0 ? 'Other skills' : 'Your skills'} skills={rest} marks={marks} />}
    </div>
  );
}

/** How many suggestions are listed before "More". */
const SUGGESTED_SHOWN = 6;

/**
 * Skills of the person's goals and of the careers within reach that are not
 * on their list, each added with one tap on its mark (and taken off again
 * with another). The list holds still while it is being marked; "More" brings
 * the next ones. Nothing is shown when there is nothing to suggest.
 */
function SuggestedSkills({ mySkills, onMark }: { mySkills: MySkill[]; onMark: (skillId: string, name: string, mark: SkillMark) => void }) {
  const suggested = useSuggestedSkills();
  const [expanded, setExpanded] = useState(false);
  const list = suggested.data ?? [];
  if (list.length === 0) return null;

  const statusOf = new Map(mySkills.map((skill) => [skill.skillId, skill.status]));
  const shown = expanded ? list : list.slice(0, SUGGESTED_SHOWN);
  const marked = list.some((skill) => statusOf.has(skill.id));
  // Which career a skill is for is worth saying only when the rows on screen differ: one career down every row says nothing.
  const severalCareers = new Set(shown.map((skill) => skill.career)).size > 1 || shown.some((skill) => skill.careers > 1);
  // More to show from this answer, or a fresh answer worth asking for.
  const hasMore = list.length > shown.length || marked;

  return (
    <div className="mt-5" data-suggested-skills>
      <h3 className="mb-2 text-sm font-medium text-fg-muted">Suggested</h3>
      <ul className={cn(cardClass, suggested.isPlaceholderData && 'opacity-60')}>
        {shown.map((skill) => (
          <li key={skill.id} className={cn(rowClass, 'flex items-center gap-1 py-0.5 pl-1 pr-4')}>
            <SkillHeldToggle value={statusOf.get(skill.id) ?? 'none'} label={skill.name} onChange={(mark) => onMark(skill.id, skill.name, mark)} />
            <Link
              to={`/skills/${skill.id}`}
              className="min-w-0 flex-1 break-words py-2 text-sm text-fg-default underline-offset-4 hover:underline"
            >
              {skill.name}
            </Link>
            {severalCareers && (
              <span className="hidden max-w-[45%] shrink-0 truncate pl-2 text-xs text-fg-muted xs:block">
                {skill.career}
                {skill.careers > 1 && ` and ${skill.careers - 1} more`}
              </span>
            )}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          aria-busy={suggested.isFetching}
          onClick={() => {
            if (list.length > shown.length) setExpanded(true);
            else if (!suggested.isFetching) {
              setExpanded(false);
              void suggested.refetch();
            }
          }}
          className={cn(textButtonClass, 'mt-3 px-1')}
        >
          More
        </button>
      )}
    </div>
  );
}

interface SkillSearchProps {
  mySkills: MySkill[];
  onAdd: (skillId: string, name: string, status: SkillStatus) => void;
  disabled: boolean;
}

/** Search the skills catalogue and add a result as learning or held. The box empties once one is added. */
function SkillSearch({ mySkills, onAdd, disabled }: SkillSearchProps) {
  const [term, setTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useDebouncedValue(term.trim());
  const results = useQuery({
    queryKey: publicKeys.picker('skills', query),
    queryFn: () => skillsApi.list({ search: query, limit: 8 }),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
  const showResults = term.trim().length >= 2 && query.length >= 2;
  const statusOf = (skillId: string) => mySkills.find((skill) => skill.skillId === skillId)?.status;

  const add = (skillId: string, name: string, status: SkillStatus) => {
    onAdd(skillId, name, status);
    // Ready for the next one, with the focus back in the box.
    setTerm('');
    inputRef.current?.focus();
  };

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
          ref={inputRef}
          type="text"
          role="searchbox"
          enterKeyHint="search"
          aria-label="Search skills to add"
          placeholder="Add a skill"
          autoComplete="off"
          value={term}
          disabled={disabled}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setTerm('');
          }}
          className={cn(fieldClass, 'h-11 pl-9 pr-10')}
        />
        {term && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setTerm('');
              inputRef.current?.focus();
            }}
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:text-fg-default"
          >
            {results.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        )}
      </div>

      {showResults && (
        <div className={cn(cardClass, 'mt-2')} aria-live="polite">
          {results.isPending ? (
            <p className="flex items-center gap-2 p-4 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching skills
            </p>
          ) : results.isError ? (
            <ErrorNote error={results.error} className="p-4" />
          ) : results.data.data.length === 0 ? (
            <p className="p-4 text-sm text-fg-muted">No skills match “{query}”. Try a shorter or different word.</p>
          ) : (
            <ul>
              {results.data.data.map((skill) => {
                const status = statusOf(skill.id);
                return (
                  <li key={skill.id} className={cn(rowClass, 'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3')}>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="break-words text-sm font-medium text-fg-default">{skill.name}</p>
                      {skill.group && <p className="truncate text-xs text-fg-muted">{skill.group.name}</p>}
                    </div>
                    {status ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
                        <Check className="h-3.5 w-3.5" />
                        On your list
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => add(skill.id, skill.name, 'learning')}
                          aria-label={`Add ${skill.name} as learning`}
                          className={cn('h-9', outlineButtonClass)}
                        >
                          Learning
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => add(skill.id, skill.name, 'held')}
                          aria-label={`Add ${skill.name} as held`}
                          className="h-9"
                        >
                          Held
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
