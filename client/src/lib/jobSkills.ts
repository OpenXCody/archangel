/*
 * What of a job's path its page lists, and what it keeps behind one line
 * (components/jobs/JobSkills.tsx draws both; `path` is from GET /api/jobs/:id).
 *
 * A career is a template with a wide range of skills, and a job has its own
 * combination of them. A job from a company's careers site is read for the
 * skills its posting names, and those are the job's own: the page never says
 * the career's whole path is what the job takes.
 */

/** A skill of a job's path, as far as the rule reads it. */
interface Named {
  named: boolean;
}

/** A seeker's count of the job's own skills is said only from this many: of one skill there is nothing to count. */
export const OWN_COUNTED_FROM = 2;

export interface JobSkillParts<S> {
  /** The job's own skills: what the posting names of the path, in the route's order, then what it names beside the path. */
  own: S[];
  /** The rest of the career's range: the path's skills the posting does not name, in the route's order. */
  rest: S[];
  /** Whether a seeker is told how many of the job's own skills they hold. A visitor is told nothing: no line asks them to sign in. */
  counted: boolean;
}

/** A job from a careers site, cut into its own skills and the rest of its career's range. */
export function jobSkillParts<S extends Named>(path: { skills: readonly S[]; alsoNamed: readonly S[] }): JobSkillParts<S> {
  const own = path.skills.filter((skill) => skill.named).concat(path.alsoNamed);
  const rest = path.skills.filter((skill) => !skill.named);
  return { own, rest, counted: own.length >= OWN_COUNTED_FROM };
}
