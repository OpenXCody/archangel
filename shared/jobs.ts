/**
 * A job's address: /jobs/<company>/<career>/<number>, such as
 * /jobs/caterpillar/cnc-machine-operator/1140.
 *
 * Only the number names the job (its `serial`, which never changes). The two
 * words before it are there for the person reading the link: the company's
 * slug and the career's title in lower case with hyphens. They are written
 * from the names as they are today and never read back, so a company or a
 * career that is renamed breaks no link: the page finds the job by its number
 * and puts the right words in the address.
 *
 * The older address, /jobs/<job id>, still opens the job and is replaced by
 * this one once the job has loaded.
 */

/** A name as a word of an address: lower case, letters and digits, hyphens between. "CNC Machine Operator" is "cnc-machine-operator". */
export function addressWord(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** A career's word in an address. Careers have no stored slug: it is always derived from the title. */
export const careerSlug = (title: string | null | undefined): string => addressWord(title) || 'career';

/** What a job's address is written from. Every list of jobs the API gives carries these. */
export interface JobAddress {
  /** The job's id: the older address, used only when the number is not known. */
  id?: string;
  /** The job's number. */
  serial?: number | null;
  /** The company's slug where it has one, else its name. */
  companySlug?: string | null;
  companyName?: string | null;
  occupationTitle?: string | null;
}

/** The address of a job's page. Every link to a job is written by this. */
export function jobPath(job: JobAddress): string {
  if (typeof job.serial !== 'number' || !Number.isInteger(job.serial) || job.serial < 1) return `/jobs/${job.id ?? ''}`;
  const company = job.companySlug || addressWord(job.companyName) || 'company';
  return `/jobs/${company}/${careerSlug(job.occupationTitle)}/${job.serial}`;
}

/** A job's number as it stands in an address or a request: a whole number from 1, or null. */
export function readJobNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,8}$/.test(value)) return null;
  return Number(value);
}
