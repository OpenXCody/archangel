import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { groupRoute } from '@shared/route';
import { cn, plural } from '@/lib/utils';
import { readStored, writeStored } from '../../lib/storage';
import { SkillMark } from '../account/SkillStatusButton';
import { SectionHeading } from '../layout/Page';
import { Disclosure, panelRowClass, secondaryActionClass } from '../layout/Panel';
import { SecondLine } from '../path/SkillTag';
import { shareOf, type PlacedSkill, type SkillMarks } from '../path/model';

interface SkillGroupsProps {
  /** The path's skills, in the route's order (the server's `routeOf`): never reordered here. */
  skills: readonly PlacedSkill[];
  /** A seeker's marks, read and never changed: without them no mark and no figure but a group's size. */
  marks: SkillMarks | null;
  /** What a person's own opening and closing is kept under for the visit: the career, or the career at a company. */
  keepAs: string;
  /** The id the section's heading carries, for `aria-labelledby`. */
  headingId: string;
  /**
   * Where a skill can be previewed beside the groups (a wide screen): a row is
   * then a button that shows the skill in the preview, and `selected` is the
   * one shown. Without it a row is a link to the skill's page.
   */
  onSelect?: (skill: PlacedSkill) => void;
  selected?: string | null;
  /** What stands between the heading and the groups: on a narrow screen, the person's own panel. */
  lead?: React.ReactNode;
}

/**
 * A career's skills by skill group, each group one `Disclosure` panel, in the
 * order the route first reaches it, its skills in the route's order inside
 * it. Every group starts closed, for everyone: the page arrives as a short
 * stack of named, counted panels ("Composite fabrication · 10 skills"), and a
 * tap opens one in place, its skills appearing inside its own frame. "Open
 * all" stands on the heading's line.
 *
 * A seeker's held skills carry the mark, and a group says how much of it they
 * hold ("2 of 10 held"); nobody else sees a mark. No skill is called next or
 * then here: what to learn next is said once, beside the groups, by what the
 * skill is (`SkillPreview`).
 */
export function SkillGroups({ skills, marks, keepAs, headingId, onSelect, selected = null, lead }: SkillGroupsProps) {
  const route = useMemo(() => groupRoute(skills), [skills]);
  const groups = useMemo(
    () =>
      route.map((stop) =>
        stop.kind === 'section'
          ? { key: stop.key, name: stop.group.name, skills: stop.skills }
          : // A skill no taxonomy placed stands in a group of its own name.
            { key: stop.key, name: stop.skill.name, skills: [stop.skill] }
      ),
    [route]
  );
  const ready = marks && !marks.pending ? marks : null;
  const whole = ready ? shareOf(skills, ready) : null;

  const storeKey = `archangel.groups.${keepAs}`;
  const [open, setOpen] = useState<Record<string, boolean>>(() => readOpen(storeKey));
  const choose = (change: Record<string, boolean>) =>
    setOpen((current) => {
      const next = { ...current, ...change };
      writeStored(storeKey, JSON.stringify(next), 'session');
      return next;
    });
  const allOpen = groups.every((group) => open[group.key]);

  return (
    <>
      <SectionHeading
        id={headingId}
        title="Skills"
        note={
          <span className="text-[13px] tabular-nums text-text-3" data-skills-size>
            {plural(skills.length, 'skill', 'skills')} in {plural(groups.length, 'group', 'groups')}
          </span>
        }
        action={
          groups.length > 1 ? (
            <button
              type="button"
              onClick={() => choose(Object.fromEntries(groups.map((group) => [group.key, !allOpen])))}
              className={cn(secondaryActionClass, 'h-9 px-3 sm:h-9')}
              data-route-open-all
            >
              {allOpen ? 'Close all' : 'Open all'}
            </button>
          ) : undefined
        }
      />
      {lead}
      <div className="space-y-2" data-skill-groups>
        {groups.map((group) => {
          const share = ready ? shareOf(group.skills, ready) : null;
          const size = group.skills.length;
          const meta =
            share && share.held === share.total ? (
              <span className="text-text-1">{size === 1 ? 'Held' : `All ${size} held`}</span>
            ) : share && share.held > 0 ? (
              <>
                <span className="text-text-1">{share.held}</span> of {size} held
              </>
            ) : (
              plural(size, 'skill', 'skills')
            );
          return (
            <Disclosure
              key={group.key}
              title={group.name}
              meta={meta}
              open={Boolean(open[group.key])}
              onToggle={() => choose({ [group.key]: !open[group.key] })}
              data-route-section={group.key}
            >
              <ul>
                {group.skills.map((skill) => (
                  <SkillRow key={skill.id} skill={skill} marks={ready} onSelect={onSelect} selected={skill.id === selected} />
                ))}
              </ul>
            </Disclosure>
          );
        })}
      </div>
      {whole && <span className="sr-only">{`${whole.held} of ${whole.total} skills held`}</span>}
    </>
  );
}

/**
 * One skill inside its group: the mark (a seeker's), the name, and the way
 * on. On a wide screen the row shows the skill beside the groups; on a narrow
 * one it opens the skill's page.
 */
function SkillRow({ skill, marks, onSelect, selected }: { skill: PlacedSkill; marks: SkillMarks | null; onSelect?: (skill: PlacedSkill) => void; selected: boolean }) {
  const status = marks?.statusOf(skill.id);
  const body = (
    <>
      <span className="flex w-4 shrink-0 justify-center" aria-hidden="true">
        {status ? <SkillMark status={status} className="h-4 w-4" /> : <span className="h-1 w-1 rounded-full bg-text-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block break-words text-sm leading-snug', status === 'held' ? 'text-text-2' : 'text-text-1', selected && 'font-medium text-text-1')}>{skill.name}</span>
        <SecondLine skill={skill} />
      </span>
      {status && <span className="sr-only">{status === 'held' ? ', held' : status === 'learning' ? ', learning' : ', not held'}</span>}
      <ChevronRight aria-hidden="true" className={cn('h-4 w-4 shrink-0', selected ? 'text-text-1' : 'text-text-3')} />
    </>
  );
  const rowClass = cn(
    panelRowClass,
    'relative min-h-11',
    // The one shown beside the groups: a bar of ink at the row's edge, its name in full ink.
    selected && 'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-text-1'
  );
  return (
    <li className="border-t border-line first:border-t-0" data-skill-tag={skill.id} data-status={status} data-added={skill.added || undefined}>
      {onSelect ? (
        <button type="button" aria-pressed={selected} onClick={() => onSelect(skill)} className={rowClass}>
          {body}
        </button>
      ) : (
        <Link to={`/skills/${skill.id}`} className={rowClass}>
          {body}
        </Link>
      )}
    </li>
  );
}

/** What the person opened and closed earlier in this visit; nothing when the browser will not say. */
function readOpen(key: string): Record<string, boolean> {
  try {
    const stored: unknown = JSON.parse(readStored(key, 'session') ?? '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  } catch {
    return {};
  }
}
