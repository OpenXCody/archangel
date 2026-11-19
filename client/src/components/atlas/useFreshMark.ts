import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkillMarks } from '../path/model';
import type { AtlasFresh } from './AtlasDrawing';
import type { AtlasLayout } from './layout';

/** How long the plate takes to answer a mark: the way drawn in, the mark arriving, the ring opening (globals.css, `.atlas-moving`). */
const ARRIVAL_MS = 1050;

/**
 * A person's marks, with the plate told which skill was just marked held, so
 * it can draw the way to that leaf in once (`fresh`, which lets go a moment
 * later). Clearing a mark, or marking a skill the plate does not hold, is not
 * answered.
 */
export function useFreshMark(marks: SkillMarks | null, layout: AtlasLayout | null): { marking: SkillMarks | null; fresh: AtlasFresh | null } {
  const [fresh, setFresh] = useState<AtlasFresh | null>(null);
  const tick = useRef(0);
  const marking = useMemo<SkillMarks | null>(() => {
    if (!marks || !layout) return marks;
    return {
      ...marks,
      mark: (skill, next) => {
        marks.mark(skill, next);
        const leaf = layout.leafById.get(skill.id);
        tick.current += 1;
        setFresh(next === 'held' && leaf ? { index: leaf.index, tick: tick.current } : null);
      },
    };
  }, [marks, layout]);
  useEffect(() => {
    if (!fresh) return;
    const done = window.setTimeout(() => setFresh(null), ARRIVAL_MS);
    return () => window.clearTimeout(done);
  }, [fresh]);
  return { marking, fresh };
}
