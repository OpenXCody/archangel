import { memo, useMemo } from 'react';
import { branchPath, type AtlasLayout } from './layout';
import { dotsPath, walkOf } from './walk';

/**
 * A career as a small plate: a picture of how much of it is filled, readable
 * at the size of a thumb. No names and no camera. The career's branches are
 * in the accent, as on the Atlas; what the person holds is bright, from the
 * centre out to each held skill; a career held whole is all bright.
 *
 * Many of these must cost little. The plate's own ground (its rim, one
 * hairline circle: at the size of a thumb sixteen arcs would read as a
 * dashed dial) is drawn once on the page and shown in each plate
 * (`GoalPlateGround`, an SVG symbol); a career adds five paths to it whatever
 * its size: its branches, the walked ones, and its skills still ahead, being
 * learned and held, each set of dots one path. None of the Atlas's 722 leaves
 * is drawn.
 */

/** The plate's radius in the drawing's own units, and half the frame. */
const S = 100;
const BOX = 92;
const GROUND = 'goal-plate-ground';

/** The ground every small plate on the page shows. Render it once, anywhere on the page that has plates. */
export const GoalPlateGround = memo(function GoalPlateGround({ layout }: { layout: AtlasLayout }) {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute" data-goal-plate-ground>
      <defs>
        <symbol id={GROUND} viewBox={`${-BOX} ${-BOX} ${2 * BOX} ${2 * BOX}`} overflow="visible">
          <circle className="goal-plate-ring" r={layout.geometry.ring * S} />
          <circle className="goal-plate-root" r={layout.geometry.root * S} />
        </symbol>
      </defs>
    </svg>
  );
});

interface GoalPlateProps {
  layout: AtlasLayout;
  /** Every skill of the career, by id. A skill the taxonomy does not hold has no leaf. */
  skillIds: readonly string[];
  /** The person's mark on a skill. */
  statusOf: (skillId: string) => 'held' | 'learning' | 'none' | undefined;
  className?: string;
}

export default function GoalPlate({ layout, skillIds, statusOf, className }: GoalPlateProps) {
  // What is held and being learned of this career, as one string: the paths are worked out again only when it changes.
  const state = skillIds.map((id) => (statusOf(id) === 'held' ? 'h' : statusOf(id) === 'learning' ? 'l' : '-')).join('');
  const shapes = useMemo(() => {
    const leaves: number[] = [];
    const status = new Map<number, 'held' | 'learning'>();
    skillIds.forEach((id, at) => {
      const leaf = layout.leafById.get(id);
      if (!leaf) return;
      leaves.push(leaf.index);
      if (state[at] === 'h') status.set(leaf.index, 'held');
      else if (state[at] === 'l') status.set(leaf.index, 'learning');
    });
    const walk = walkOf(leaves, (index) => status.get(index));
    return {
      walk,
      career: branchPath(layout, leaves, S),
      walked: branchPath(layout, walk.heldLeaves, S),
      ahead: dotsPath(layout, walk.aheadLeaves, S),
      learning: dotsPath(layout, walk.learningLeaves, S),
      held: dotsPath(layout, walk.heldLeaves, S),
    };
  }, [layout, skillIds, state]);

  return (
    <svg
      viewBox={`${-BOX} ${-BOX} ${2 * BOX} ${2 * BOX}`}
      aria-hidden="true"
      className={`goal-plate ${className ?? ''}`}
      data-goal-plate={`${shapes.walk.held}/${shapes.walk.total}`}
      data-whole={shapes.walk.whole || undefined}
    >
      <use href={`#${GROUND}`} x={-BOX} y={-BOX} width={2 * BOX} height={2 * BOX} />
      <path className="goal-plate-career" d={shapes.career} />
      {shapes.walked && <path className="goal-plate-walked" d={shapes.walked} />}
      {shapes.ahead && <path className="goal-plate-ahead" d={shapes.ahead} />}
      {shapes.learning && <path className="goal-plate-learning" d={shapes.learning} />}
      {shapes.held && <path className="goal-plate-held" d={shapes.held} />}
    </svg>
  );
}
