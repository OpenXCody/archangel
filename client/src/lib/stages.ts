/** The stages of a career's path, in the order they are learned and the words used everywhere. */
export type Stage = 1 | 2 | 3;

export const STAGE_LABEL: Record<Stage, string> = { 1: 'Introduction', 2: 'Fundamentals', 3: 'Advanced' };
