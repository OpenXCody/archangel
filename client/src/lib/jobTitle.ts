import { formatCompanyName } from '@shared/displayName';
import { versionTitle } from '@shared/versions';

/*
 * What a job's own page is called.
 *
 * A job from a careers site is an opening for a career as one company does it,
 * and its page says whose: the company's variant of the career, titled as a
 * company's version of a career is ("SpaceX Welder", "John Deere MIG Welder":
 * `versionTitle` in shared/versions.ts, which leaves a legal form off the
 * company's name). It is composed by the page: the job's stored title stays
 * the career's, and in every list a job's standard name is the career's title
 * alone, since a row names its company on its own line. A job posted here
 * keeps the title its poster wrote.
 */

/** What of a job its page's title is written from. */
export interface JobTitled {
  title: string;
  ownName?: string | null;
  fromSource?: boolean;
  companyName: string | null;
  occupationTitle: string;
}

/** The page's title: "SpaceX Welder" for a job from a careers site, the poster's own title for one posted here. */
export function jobPageTitle(job: JobTitled): string {
  return job.fromSource ? versionTitle(job.companyName, job.occupationTitle) : job.title;
}

/**
 * The browser tab: the page's title, then the opening's own name where it has one ("SpaceX Welder · Pipe Welder
 * (Starship)"). A job posted here is named as running text names it: "Line Lead at Acme".
 */
export function jobTabTitle(job: JobTitled): string {
  if (job.fromSource) return [jobPageTitle(job), job.ownName].filter(Boolean).join(' · ');
  return [job.title, formatCompanyName(job.companyName).replace(/\.$/, '')].filter(Boolean).join(' at ');
}
