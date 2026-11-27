import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import { factoryNameBesideCompany } from '@shared/factoryName';
import { titleSaysCareer } from '@shared/jobs';
import { cityState, titleCase } from '@shared/places';
import { formatDay } from './dates';
import { employmentLabel, formatPay } from './jobFormat';

/*
 * What a row of a list of jobs says, wherever one is drawn: the Jobs list, a
 * career's, a company's, a factory's, a skill's and an industry's page, the
 * other jobs on a job's own page, the map's panels.
 *
 * A job has two names. Its STANDARD NAME is its title: a job from a careers
 * site is named for its career ("Welder"), a job posted here by what its
 * poster wrote. Its OWN NAME is what the employer called that opening, with
 * what a page states elsewhere cut out ("Pipe Welder (Starship)"; `ownName`
 * on every job the API gives, null where the posting says nothing beyond the
 * career). Five openings for one career at one factory are five rows, and the
 * own name is what tells them apart.
 *
 * THE FIRST LINE OF A ROW IS ALWAYS A JOB'S NAME: never a place, never a
 * company. Under a heading that has already named the career ("More Welder
 * jobs at SpaceX", a career's page, the Jobs list narrowed to one career) it
 * is the opening's own name, or the standard name where it has none.
 * Everywhere else it is the standard name, and the own name is the next line,
 * in secondary ink.
 *
 * Then the facts, in one order: the company and where the job is, each only
 * where the heading has not said it; what the job states (its shift, the kind
 * of employment, its pay); and, where every row of the list is one career at
 * one company, its day ("Listed Oct 30"), which then tells openings apart.
 *
 *   the Jobs list, a skill's page, a region's panel   Welder
 *                                                     Pipe Welder (Starship)
 *                                                     SpaceX · Starbase, TX · Night shift
 *   a career's page (Welder)                          Pipe Welder (Starship)
 *                                                     SpaceX · Starbase, TX · Night shift
 *   a company's page (John Deere)                     MIG Welder
 *                                                     Production Welder
 *                                                     Harvester Works · East Moline, IL
 *   "More Welder jobs at SpaceX"                      Pipe Welder (Starship)
 *                                                     Starbase, TX · Night shift · Listed Oct 30
 *   the same, an opening with no name of its own      Welder
 *                                                     Starbase, TX · Listed Oct 30
 *   a factory's page                                  Welder
 *                                                     Pipe Welder (Starship)
 *                                                     Night shift
 *
 * Where the company is said by the surroundings, the factory is said by its
 * own name beside that company (`factoryNameBesideCompany`: "Harvester Works"
 * of John Deere, nothing for "SpaceX Bastrop" in Bastrop); where the row names
 * the company itself, the place alone says where. No line of a row is empty,
 * and two rows that still read alike are two postings: both are kept.
 */

/** What a list's heading, page or panel has already said of every job in it. */
export interface JobListSays {
  /** The career: a career's page or panel, "More <career> jobs at <company>", the Jobs list narrowed to one. */
  career?: boolean;
  /** The company: a company's page or panel, a job's own page. */
  company?: boolean;
  /** The factory, and with it its company and its place: a factory's page or panel, "Other jobs at this factory". */
  factory?: boolean;
  /** The state: a state's or a focus area's page or panel. A place is then its city alone. */
  state?: boolean;
  /** The list the row stands in. An opening's own name is said under its standard name only where another row of the list would otherwise read the same. */
  among?: readonly JobRowJob[];
}

/** What of a job a row is written from: every list of jobs the API gives carries these. */
export interface JobRowJob {
  /** The standard name: the career's title on a job from a careers site, the poster's own words on a job posted here. */
  title: string;
  /** The opening's own name beside it, where it has one. */
  ownName?: string | null;
  occupationTitle?: string | null;
  companyName?: string | null;
  factoryName?: string | null;
  city?: string | null;
  state?: string | null;
  shift?: string | null;
  employmentType?: string | null;
  /** Integer cents. */
  payMin?: number | null;
  payMax?: number | null;
  payPeriod?: 'hour' | 'year';
  postedAt?: string | null;
  /** The posting gives no date: the day is the one it was first seen, and the row says "Listed". */
  undated?: boolean | null;
}

export interface JobRowPart {
  /**
   * `name` the standard name; `own` the opening's own name; `career` where a job titled by hand does not say it;
   * `site` the factory's own name beside its company; then what the job states, and its day.
   */
  kind: 'name' | 'own' | 'career' | 'company' | 'site' | 'place' | 'shift' | 'type' | 'pay' | 'day';
  text: string;
}

export interface JobRowWords {
  /** The first line: a job's name, always (`name` or `own`). */
  head: JobRowPart;
  /** The opening's own name, where the first line is the standard name: the next line, in secondary ink. */
  second: string | null;
  /** Everything after the names, in the order it is said. Empty where the names are all there is to say. */
  facts: JobRowPart[];
}

const same = (a?: string | null, b?: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Another job of the list has this one's standard name, company and place. */
function hasTwin(job: JobRowJob, among: readonly JobRowJob[] | undefined): boolean {
  if (!among) return false;
  return among.some(
    (other) =>
      other !== job && same(other.title, job.title) && same(other.companyName, job.companyName) && same(other.city, job.city) && same(other.state, job.state)
  );
}

export function jobRow(job: JobRowJob, said: JobListSays = {}): JobRowWords {
  const standard = job.title?.trim() || job.occupationTitle?.trim() || 'Job';
  const own = job.ownName?.trim() || null;
  const careerSaid = Boolean(said.career);
  const companySaid = Boolean(said.company || said.factory);
  // Under a heading that names the career, the opening's own name is what a row has left to say of what the job is.
  const head: JobRowPart = careerSaid && own ? { kind: 'own', text: own } : { kind: 'name', text: standard };
  // Under the standard name the own name is said only to tell apart rows that would otherwise read alike.
  const second = head.kind === 'name' && own && hasTwin(job, said.among) ? own : null;
  // A job a company titled in its own words says its career under them, except under a heading that names the career.
  const career = !careerSaid && job.occupationTitle && !titleSaysCareer(job.title, job.occupationTitle) ? job.occupationTitle : null;
  // The factory by its own name only where the company stands above the list and not in the row.
  const site = companySaid && !said.factory ? factoryNameBesideCompany({ name: job.factoryName, city: job.city, state: job.state }, job.companyName) : null;
  const state = said.state ? null : job.state;
  const place = job.city?.trim()
    ? said.state
      ? titleCase(job.city)
      : cityState(job.city, job.state)
    : // Not every factory has a city on record: its name places it well enough, where the row does not say it already.
      [site || companySaid ? null : formatFactoryName(job.factoryName), state].filter(Boolean).join(', ');
  const paid = job.payMin != null || job.payMax != null;
  // The day, where the heading has said both the career and the company: openings that read alike are told apart by it.
  const day = careerSaid && companySaid && job.postedAt ? formatDay(job.postedAt) : '';

  const parts: (JobRowPart | null)[] = [
    career ? { kind: 'career', text: career } : null,
    companySaid ? null : { kind: 'company', text: formatCompanyName(job.companyName) },
    site ? { kind: 'site', text: site } : null,
    said.factory ? null : { kind: 'place', text: place },
    job.shift ? { kind: 'shift', text: job.shift } : null,
    job.employmentType ? { kind: 'type', text: employmentLabel(job.employmentType) } : null,
    // A job from a company's careers site that states no pay says nothing about pay.
    paid ? { kind: 'pay', text: formatPay(job.payMin ?? null, job.payMax ?? null, job.payPeriod ?? 'hour') } : null,
    day ? { kind: 'day', text: `${job.undated ? 'Listed' : 'Posted'} ${day}` } : null,
  ];
  return { head, second, facts: parts.filter((part): part is JobRowPart => part !== null && part.text.trim() !== '') };
}

/** The facts of a row of the given kinds (all of them where none is named), as one line: "SpaceX · Starbase, TX". */
export function jobRowText(facts: JobRowPart[], ...kinds: JobRowPart['kind'][]): string {
  return facts
    .filter((part) => kinds.length === 0 || kinds.includes(part.kind))
    .map((part) => part.text)
    .join(' · ');
}
