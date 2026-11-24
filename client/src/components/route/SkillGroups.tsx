import { useId, useMemo, useState, type ReactNode } from 'react';
import { groupRoute } from '@shared/route';
import { cn, plural } from '@/lib/utils';
import { readStored, writeStored } from '../../lib/storage';
import { SectionHeading } from '../layout/Page';
import { panelClass, secondaryActionClass } from '../layout/Panel';
import { Tree, TreeBranch, TreeItem, TreeRoot, TreeToggle, type TreeMark } from '../layout/Tree';
import { SecondLine } from '../path/SkillTag';
import { shareOf, type MarkStatus, type PlacedSkill, type SkillMarks } from '../path/model';
import { SkillPreview } from './SkillPreview';

interface Group {
  key: string;
  name: string;
  skills: PlacedSkill[];
}

interface SkillGroupsProps {
  /** The career's name as its page says it: the tree's root. */
  title: string;
  /** The path's skills, in the route's order (the server's `routeOf`): never reordered here. */
  skills: readonly PlacedSkill[];
  /** A seeker's marks, read and never changed: without them no mark and no figure but a group's size. */
  marks: SkillMarks | null;
  /** What a person's own opening and closing is kept under for the visit: the career, or the career at a company. */
  keepAs: string;
  /** What follows the tree inside the section (a company's version: the skills it leaves out). */
  after?: ReactNode;
  /** What stands above the heading inside the section (a note that the marks could not be read). */
  before?: ReactNode;
}

/**
 * A career's skills (`#skills`), drawn as the same connector tree as where it
 * leads (`Tree`, `components/layout/Tree.tsx`): the heading with "Open all",
 * one sentence that says how many skills in how many groups and why they stand
 * in this order (and, on a line of its own, how many a seeker holds, once
 * they hold one), then one frame holding the tree. The career is the root; an
 * elbow runs to each skill group, in the order the route first reaches it,
 * each one row: the group's name and, at its right end, its size ("10
 * skills"; "1 of 2 held" for a seeker who holds some of it).
 *
 * A group is a node that opens its own branch: its skills, in the route's
 * order, each on an elbow off the group's own spine (across, from 1024 px, in
 * the next column, level with the group; under that, stacked under the group
 * and indented). A skill is a node that opens what it is under itself
 * (`SkillPreview`). Every group and every skill starts closed, for everyone.
 *
 * A seeker's held skills carry the product's mark on their node in place of
 * the open ring; nothing else about them changes. No skill is called next or
 * then, and nothing asks anyone to sign in: a visitor reads the same tree.
 */
export function SkillGroups({ title, skills, marks, keepAs, after, before }: SkillGroupsProps) {
  const headingId = useId();
  const base = useId();
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

  // The skill opened in each group: none until one is pressed; pressing it again, or another, closes it.
  const [chosenIn, setChosenIn] = useState<Record<string, string | null>>({});
  const toggleGroup = (group: Group) => {
    if (open[group.key]) setChosenIn((current) => ({ ...current, [group.key]: null }));
    change({ ...open, [group.key]: !open[group.key] });
  };
  const choose = (group: Group, skillId: string) =>
    setChosenIn((current) => ({ ...current, [group.key]: current[group.key] === skillId ? null : skillId }));

  return (
    <section id="skills" aria-labelledby={headingId} className="mt-14 scroll-mt-20" data-skills-section>
      {before}
      <SectionHeading
        id={headingId}
        title="Skills"
        description={
          <>
            <span className="block" data-skills-size>
              {plural(skills.length, 'skill', 'skills')} in {plural(groups.length, 'group', 'groups')}, in the order a person usually comes to them.
            </span>
            {/* A seeker's one line of progress, under the sentence and never inside it; nothing while they hold none. */}
            {share && share.held > 0 && (
              <span className="mt-1 block" data-held-count>
                You hold <span className="tabular-nums">{share.held}</span> of these {plural(skills.length, 'skill', 'skills')}.
              </span>
            )}
          </>
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
      <div className={cn(panelClass, 'mt-1')} data-skill-groups="">
        <Tree across="lg" shape="tree" after data-skill-tree="">
          <TreeRoot>{title}</TreeRoot>
          <TreeBranch>
            {groups.map((group, index) => {
              const isOpen = Boolean(open[group.key]);
              const held = ready ? shareOf(group.skills, ready).held : 0;
              const branchId = `${base}-group-${index}`;
              return (
                <TreeItem
                  key={group.key}
                  branches
                  open={isOpen}
                  data-route-section={group.key}
                  node={
                    <TreeToggle
                      as="h3"
                      title={group.name}
                      figure={
                        <span data-group-figure>
                          {held > 0 ? `${held} of ${group.skills.length} held` : plural(group.skills.length, 'skill', 'skills')}
                        </span>
                      }
                      open={isOpen}
                      onToggle={() => toggleGroup(group)}
                      controls={branchId}
                    />
                  }
                >
                  {isOpen && (
                    <TreeBranch nested id={branchId} aria-label={group.name}>
                      {group.skills.map((skill) => (
                        <SkillNode
                          key={skill.id}
                          skill={skill}
                          status={ready ? ready.statusOf(skill.id) : null}
                          open={chosenIn[group.key] === skill.id}
                          previewId={`${base}-skill-${skill.id}`}
                          onToggle={() => choose(group, skill.id)}
                        />
                      ))}
                    </TreeBranch>
                  )}
                </TreeItem>
              );
            })}
          </TreeBranch>
        </Tree>
      </div>
      {after}
    </section>
  );
}

/** The mark a skill's node carries: a seeker's own where they hold it or are learning it, else the open ring. */
const MARK: Record<MarkStatus, TreeMark> = { held: 'held', learning: 'learning', none: 'node' };

/** What a screen reader hears after a skill's name, for a seeker. */
const SAID: Record<MarkStatus, string> = { held: ', held', learning: ', learning', none: ', not held' };

/** One skill on its group's branch: a node that opens what it is under itself. */
function SkillNode({
  skill,
  status,
  open,
  previewId,
  onToggle,
}: {
  skill: PlacedSkill;
  /** A seeker's mark on it; null for anyone else. */
  status: MarkStatus | null;
  open: boolean;
  previewId: string;
  onToggle: () => void;
}) {
  return (
    <TreeItem
      open={open}
      data-skill-tag={skill.id}
      data-status={status ?? undefined}
      data-added={skill.added || undefined}
      data-chosen={open || undefined}
      node={
        <TreeToggle
          mark={status ? MARK[status] : 'node'}
          title={skill.name}
          meta={<SecondLine skill={skill} />}
          said={status ? SAID[status] : undefined}
          open={open}
          onToggle={onToggle}
          controls={previewId}
        />
      }
    >
      {open && <SkillPreview id={previewId} skill={skill} status={status} />}
    </TreeItem>
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
