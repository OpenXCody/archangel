import { memo, useMemo } from 'react';
import type { AtlasModel } from './model';
import { plateBox, ringRadii, routePath } from './plate';

/**
 * A career as a small plate: the wheel at rest at the size of a thumb, a
 * picture of how much of a career is filled. No names, no camera and none of
 * the wheel's thousand lines. The career's route is in the accent, as on the
 * Atlas, from the centre ring out to the rim; what the person holds of it is
 * bright over that; a career held whole is all bright.
 *
 * Many of these must cost little. The plate's own ground (the five rings, as
 * hairlines) is drawn once on the page and shown in each plate
 * (`GoalPlateGround`, an SVG symbol); a career adds two paths to it whatever
 * its size: its route, and the part of it the person holds.
 */

/** The plate's radius in the drawing's own units, and half the frame. */
const S = 100;
const BOX = plateBox(S);
const VIEW = `${-BOX} ${-BOX} ${2 * BOX} ${2 * BOX}`;
const GROUND = 'goal-plate-ground';

/** The ground every small plate on the page shows. Render it once, anywhere on the page that has plates. */
export const GoalPlateGround = memo(function GoalPlateGround() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute" data-goal-plate-ground>
      <defs>
        <symbol id={GROUND} viewBox={VIEW} overflow="visible">
          {ringRadii(S).map((r) => (
            <circle key={r} className="goal-plate-ring" r={r} />
          ))}
        </symbol>
      </defs>
    </svg>
  );
});

interface GoalPlateProps {
  model: AtlasModel;
  /** Every skill of the career, by id. A skill the wheel does not hold has no line. */
  skillIds: readonly string[];
  /** The person's mark on a skill. */
  statusOf: (skillId: string) => 'held' | 'learning' | 'none' | undefined;
  className?: string;
}

export default function GoalPlate({ model, skillIds, statusOf, className }: GoalPlateProps) {
  // What is held of this career, as one string: the paths are worked out again only when it changes.
  const state = skillIds.map((id) => (statusOf(id) === 'held' ? 'h' : '-')).join('');
  const shapes = useMemo(() => {
    const all: number[] = [];
    const held: number[] = [];
    skillIds.forEach((id, at) => {
      const s = model.skillById.get(id);
      if (s === undefined || all.includes(s)) return;
      all.push(s);
      if (state[at] === 'h') held.push(s);
    });
    return { total: all.length, held: held.length, career: routePath(model, all, S), walked: routePath(model, held, S) };
  }, [model, skillIds, state]);

  return (
    <svg
      viewBox={VIEW}
      aria-hidden="true"
      className={`goal-plate ${className ?? ''}`}
      data-goal-plate={`${shapes.held}/${shapes.total}`}
      data-whole={(shapes.total > 0 && shapes.held === shapes.total) || undefined}
    >
      <use href={`#${GROUND}`} x={-BOX} y={-BOX} width={2 * BOX} height={2 * BOX} />
      {shapes.career && <path className="goal-plate-career" d={shapes.career} />}
      {shapes.walked && <path className="goal-plate-held" d={shapes.walked} />}
    </svg>
  );
}
