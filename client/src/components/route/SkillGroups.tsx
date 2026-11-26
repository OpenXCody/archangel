import { useId, useMemo, useState, type ReactNode } from 'react';
import { groupRoute } from '@shared/route';
import { cn, plural } from '@/lib/utils';
import { readStored, writeStored } from '../../lib/storage';
import { SectionHeading } from '../layout/Page';
import { panelClass, secondaryActionClass } from '../layout/Panel';
import { Tree, TreeBranch, TreeCard, TreeCardNames, TreeItem, TreeRoot, TreeToggle, type TreeMark } from '../layout/Tree';
import { SecondLine } from '../path/SkillTag';
import { shareOf, type MarkStatus, type PlacedSkill, type SkillMarks } from '../path/model';
import { SkillPreview } from './SkillPreview';

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
  /**
   * A company's version: the skills of the standard path it leaves out. They
   * are the root's last node, "Left out of the standard", which opens its
   * card of their names.
   */
  leftOut?: readonly { id: string; name: string }[];
  /** What stands above the heading inside the section (a note that the marks could not be read). */
  before?: ReactNode;
}

/**
 * A career's skills (`#skills`), drawn as the same connector tree as where it
 * leads (`Tree`, `components/layout/Tree.tsx`): the heading, with a seeker's
 * count beside it once they hold a skill ("2 of 24 held"; never "0 of") and
 * "Open all" at its right, then one frame holding the tree. Nothing else:
 * no sentence, and nothing that asks anyone to sign in.
 *
 * The root is the career, said as what hangs off it ("24 skills": the page's
 * heading has its name). An elbow runs to each skill group, in the order the
 * route first reaches it, each one row: the group's name and its size
 * straight after it ("Shop basics · 2 skills"; "1 of 2 held" for a seeker
 * who holds some of it).
 *
 * A group is a node that opens its own branch: its skills, in the route's
 * order, each on an elbow off the group's own spine, straight under the group
 * and indented, at every width, the groups after it following straight after
 * its last skill. A skill is a node that opens its card under itself
 * (`SkillPreview`), the skill's line running into the card; one card at a
 * time in a group. Every group and every skill starts closed, for everyone.
 *
 * A company's version that leaves skills of the standard out ends in one more
 * node off the root, "Left out of the standard", which opens their names as
 * its card.
 *
 * A seeker's held skills carry the product's mark on their node in place of
 * the ring; nothing else about them changes. No skill is called next or then.
 */
export function SkillGroups({ skills, marks, keepAs, leftOut = [], before }: SkillGroupsProps) {
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
  const [leftOutOpen, setLeftOutOpen] = useState(false);

  // The skill opened in each group: none until one is pressed; pressing it again, or another, closes it.
  const [chosenIn, setChosenIn] = useState<Record<string, string | null>>({});
  const toggleGroup = (group: Group) => {
    if (open[group.key]) setChosenIn((current) => ({ ...current, [group.key]: null }));
    change({ ...open, [group.key]: !open[group.key] });
  };
  const toggleAll = () => {
    // Closing them all closes the cards inside them too, so the tree opens again as it arrived.
    if (allOpen) setChosenIn({});
    change(Object.fromEntries(groups.map((group) => [group.key, !allOpen])));
  };
  const choose = (group: Group, skillId: string) =>
    setChosenIn((current) => ({ ...current, [group.key]: current[group.key] === skillId ? null : skillId }));

  return (
    <section id="skills" aria-labelledby={headingId} className="mt-14 scroll-mt-20" data-skills-section>
      {before}
      <SectionHeading
        id={headingId}
        title="Skills"
        note={
          // A seeker's one figure, beside the heading; nothing while they hold none.
          share && share.held > 0 ? (
            <span className="text-[13px] tabular-nums text-text-3" data-held-count>
              {share.held} of {share.total} held
            </span>
          ) : undefined
        }
        action={
          groups.length > 1 ? (
            <button type="button" aria-expanded={allOpen} onClick={toggleAll} className={cn(secondaryActionClass, 'px-3 sm:h-9')} data-route-open-all>
              {allOpen ? 'Close all' : 'Open all'}
            </button>
          ) : undefined
        }
      />
      <div className={panelClass} data-skill-groups="">
        <Tree across="lg" shape="tree" after data-skill-tree="">
          <TreeRoot data-skills-size="">{plural(skills.length, 'skill', 'skills')}</TreeRoot>
          <TreeBranch aria-label="Skill groups">
            {groups.map((group, index) => {
              const isOpen = Boolean(open[group.key]);
              const held = ready ? shareOf(group.skills, ready).held : 0;
              const branchId = `${base}-group-${index}`;
              return (
                <TreeItem
                  key={group.key}
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
            {leftOut.length > 0 && (
              <TreeItem
                open={leftOutOpen}
                data-left-out=""
                node={
                  <TreeToggle
                    as="h3"
                    title="Left out of the standard"
                    figure={plural(leftOut.length, 'skill', 'skills')}
                    open={leftOutOpen}
                    onToggle={() => setLeftOutOpen((value) => !value)}
                    controls={`${base}-left-out`}
                  />
                }
              >
                {leftOutOpen && (
                  <TreeCard id={`${base}-left-out`} aria-label="Skills of the standard path left out">
                    <TreeCardNames names={leftOut} data-left-out-names="" />
                  </TreeCard>
                )}
              </TreeItem>
            )}
          </TreeBranch>
        </Tree>
      </div>
    </section>
  );
}

/** The mark a skill's node carries: a seeker's own where they hold it or are learning it, else the ring. */
const MARK: Record<MarkStatus, TreeMark> = { held: 'held', learning: 'learning', none: 'node' };

/** What a screen reader hears after a skill's name, for a seeker. */
const SAID: Record<MarkStatus, string> = { held: ', held', learning: ', learning', none: ', not held' };

/** One skill on its group's branch: a node that opens its card under itself. */
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
      {open && <SkillPreview id={previewId} skill={skill} />}
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
