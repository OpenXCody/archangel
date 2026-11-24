import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { groupRoute } from '@shared/route';
import { cn, plural } from '@/lib/utils';
import { useMediaQuery } from '../../lib/media';
import { readStored, writeStored } from '../../lib/storage';
import { SkillMark } from '../account/SkillStatusButton';
import { SectionHeading } from '../layout/Page';
import { chosenClass, Disclosure, OpenChevron, panelRowClass, secondaryActionClass } from '../layout/Panel';
import { SecondLine } from '../path/SkillTag';
import { shareOf, type PlacedSkill, type SkillMarks } from '../path/model';
import { SkillPreview } from './SkillPreview';
import { YourSkills } from './YourSkills';

/** From this width an open group's chosen skill is previewed beside its rows; under it, under the skill's own row. */
export const BESIDE_QUERY = '(min-width: 1024px)';

interface Group {
  key: string;
  name: string;
  skills: PlacedSkill[];
}

interface SkillGroupsProps {
  /** The path's skills, in the route's order (the server's `routeOf`): never reordered here. */
  skills: readonly PlacedSkill[];
  /** A seeker's marks, read and never changed: without them no mark and no figure but a group's size. */
  marks: SkillMarks | null;
  /** What a person's own opening and closing is kept under for the visit: the career, or the career at a company. */
  keepAs: string;
  /** A visitor, who could have marks by signing in: the address that signs them in and brings them back. */
  signIn: string | null;
  /** What follows the groups inside the section (a company's version: the skills it leaves out). */
  after?: ReactNode;
  /** What stands above the heading inside the section (a note that the marks could not be read). */
  before?: ReactNode;
}

/**
 * A career's skills (`#skills`): the heading with "Open all", one sentence
 * that says how many skills in how many groups and why they stand in this
 * order, then each skill group as one `Disclosure` panel, in the order the
 * route first reaches it, its skills in the route's order inside it. Every
 * group starts closed, for everyone.
 *
 * An open group holds its skills and what one of them is (`SkillPreview`),
 * both inside its own frame. From 1024 px the rows stand on the left and the
 * preview on the right: a row is chosen, not followed (the chosen one has a
 * bar of ink at its edge), and a group opens on its first skill (a seeker's
 * first one not held), so an open group always says what one of its skills
 * is. Under 1024 px a row opens the preview under itself, with the chevron of
 * anything that opens in place. There is never an empty preview.
 *
 * A seeker's held skills carry the mark, and every group says its size the
 * same way with what they hold of it beside ("1 held · 2 skills"). Under the
 * groups, the person's own panel (`YourSkills`): a visitor's call to sign in,
 * a seeker's share and the way to Profile. No skill is called next or then.
 */
export function SkillGroups({ skills, marks, keepAs, signIn, after, before }: SkillGroupsProps) {
  const headingId = useId();
  const beside = useMediaQuery(BESIDE_QUERY);
  const route = useMemo(() => groupRoute(skills), [skills]);
  const groups: Group[] = useMemo(
    () =>
      route.map((stop) =>
        stop.kind === 'section'
          ? { key: stop.key, name: stop.group.name, skills: [...stop.skills] }
          : // A skill no taxonomy placed stands in a group of its own name.
            { key: stop.key, name: stop.skill.name, skills: [stop.skill] }
      ),
    [route]
  );
  const ready = marks && !marks.pending ? marks : null;
  const share = ready ? shareOf(skills, ready) : null;

  // Which groups are open: closed when the page arrives, and as the person left them for the rest of the visit.
  const storeKey = `archangel.groups.${keepAs}`;
  const [open, setOpen] = useState<Record<string, boolean>>(() => readOpen(storeKey));
  const change = (next: Record<string, boolean>) => {
    setOpen(next);
    writeStored(storeKey, JSON.stringify(next), 'session');
  };
  const allOpen = groups.every((group) => open[group.key]);

  // The skill chosen in each group: beside the rows, a group always has one (its first, until another is
  // chosen); under them, none until a row is pressed, and pressing it again closes its preview.
  const [chosenIn, setChosenIn] = useState<Record<string, string | null>>({});
  const firstOf = useCallback(
    (group: Group) => (ready ? group.skills.find((skill) => ready.statusOf(skill.id) !== 'held') : undefined) ?? group.skills[0],
    [ready]
  );
  const chosenOf = (group: Group): string | null => {
    const picked = chosenIn[group.key];
    if (beside) return picked ?? firstOf(group)?.id ?? null;
    return picked ?? null;
  };
  const choose = (group: Group, skillId: string) =>
    setChosenIn((current) => ({ ...current, [group.key]: !beside && current[group.key] === skillId ? null : skillId }));

  return (
    <section id="skills" aria-labelledby={headingId} className="mt-14 scroll-mt-20" data-skills-section>
      {before}
      <SectionHeading
        id={headingId}
        title="Skills"
        description={
          <span data-skills-size>
            {plural(skills.length, 'skill', 'skills')} in {plural(groups.length, 'group', 'groups')}, in the order a person usually comes to them.
          </span>
        }
        action={
          groups.length > 1 ? (
            <button
              type="button"
              onClick={() => change(Object.fromEntries(groups.map((group) => [group.key, !allOpen])))}
              className={cn(secondaryActionClass, 'h-9 px-3 sm:h-9')}
              data-route-open-all
            >
              {allOpen ? 'Close all' : 'Open all'}
            </button>
          ) : undefined
        }
      />
      <div className="space-y-2" data-skill-groups>
        {groups.map((group) => {
          const held = ready ? shareOf(group.skills, ready).held : 0;
          return (
            <Disclosure
              key={group.key}
              title={group.name}
              meta={
                <span data-group-figure>
                  {held > 0 && (
                    <>
                      <span className="text-text-1">{held} held</span>
                      {' · '}
                    </>
                  )}
                  {plural(group.skills.length, 'skill', 'skills')}
                </span>
              }
              open={Boolean(open[group.key])}
              onToggle={() => change({ ...open, [group.key]: !open[group.key] })}
              data-route-section={group.key}
            >
              <GroupBody group={group} marks={ready} beside={beside} chosen={chosenOf(group)} onChoose={(skillId) => choose(group, skillId)} />
            </Disclosure>
          );
        })}
      </div>
      {after}
      <YourSkills total={skills.length} share={share} signIn={signIn} className="mt-4" />
    </section>
  );
}

/**
 * An open group: its skills as rows and, from 1024 px, what the chosen one is
 * beside them, held still while a long group scrolls; under 1024 px the rows
 * alone, each opening its preview under itself.
 */
function GroupBody({ group, marks, beside, chosen, onChoose }: { group: Group; marks: SkillMarks | null; beside: boolean; chosen: string | null; onChoose: (skillId: string) => void }) {
  const previewId = useId();
  const shown = beside ? (group.skills.find((skill) => skill.id === chosen) ?? null) : null;
  const rows = (
    <ul className="min-w-0">
      {group.skills.map((skill) => (
        <SkillRow key={skill.id} skill={skill} marks={marks} beside={beside} chosen={skill.id === chosen} previewId={previewId} onChoose={() => onChoose(skill.id)} />
      ))}
    </ul>
  );
  if (!beside) return rows;
  return (
    <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {rows}
      <div className="min-w-0 border-l border-line">
        {shown && (
          <div className="sticky top-20">
            <SkillPreview key={shown.id} id={previewId} skill={shown} status={marks ? marks.statusOf(shown.id) : null} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One skill inside its group: the mark (a seeker's) or a dot, the name, and
 * its second line. From 1024 px it chooses the skill for the preview beside
 * the rows (no chevron: the bar of ink says which is chosen); under that it
 * opens the preview under itself, with the chevron of anything that opens in
 * place.
 */
function SkillRow({
  skill,
  marks,
  beside,
  chosen,
  previewId,
  onChoose,
}: {
  skill: PlacedSkill;
  marks: SkillMarks | null;
  beside: boolean;
  chosen: boolean;
  previewId: string;
  onChoose: () => void;
}) {
  const inlineId = useId();
  const status = marks?.statusOf(skill.id);
  return (
    <li className={cn('border-t border-line first:border-t-0', chosenClass(chosen))} data-skill-tag={skill.id} data-status={status} data-added={skill.added || undefined} data-chosen={chosen || undefined}>
      <button
        type="button"
        onClick={onChoose}
        {...(beside ? { 'aria-pressed': chosen, 'aria-controls': previewId } : { 'aria-expanded': chosen, 'aria-controls': inlineId })}
        className={cn(panelRowClass, 'min-h-11')}
      >
        <span className="flex w-4 shrink-0 justify-center" aria-hidden="true">
          {status ? <SkillMark status={status} className="h-4 w-4" /> : <span className="h-1 w-1 rounded-full bg-text-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block break-words text-sm leading-snug', chosen ? 'font-medium text-text-1' : 'text-text-1')}>{skill.name}</span>
          <SecondLine skill={skill} />
        </span>
        {status && <span className="sr-only">{status === 'held' ? ', held' : status === 'learning' ? ', learning' : ', not held'}</span>}
        {!beside && <OpenChevron open={chosen} />}
      </button>
      {!beside && chosen && <SkillPreview inline id={inlineId} skill={skill} status={marks ? (status ?? null) : null} />}
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
