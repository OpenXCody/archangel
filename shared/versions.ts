import { formatCompanyName } from './displayName.js';

/**
 * A company's version of a career: how the two names read together.
 *
 * As a title it is "Boeing CNC Operator"; in running text "CNC Operator at
 * Boeing". The company is named as people say it, so a legal form at the end
 * of its name ("Apex Manufacturing Corp", "Dow Inc.") is left off: the page of
 * the company still gives the whole name.
 */

/** "Inc.", "Corp", "LLC" and the like at the end of a name, with the comma before them. */
const LEGAL_FORM = /,?\s+(?:inc|incorporated|corp|corporation|llc|l\.l\.c|ltd|limited|lp|l\.p|plc|co)\.?$/i;

/** A company's name as it is said: "Dow" for "Dow Inc.". A name that is only its legal form is left whole. */
export function companyShortName(name: string | null | undefined): string {
  const shown = formatCompanyName(name);
  const short = shown.replace(LEGAL_FORM, '').trim();
  return short.length >= 2 ? short : shown;
}

/** "Boeing CNC Operator". */
export function versionTitle(companyName: string | null | undefined, careerTitle: string): string {
  return `${companyShortName(companyName)} ${careerTitle}`.trim();
}

/** The address of a company's version of a career: the career's page, at the company. */
export function versionPath(occupationId: string, company: { id: string; slug?: string | null }): string {
  return `/occupations/${occupationId}?at=${encodeURIComponent(company.slug ?? company.id)}`;
}

/** Where a version came from: one of the company's own people, an admin acting for it, or (later) a source. */
export const VERSION_ORIGINS = ['member', 'admin', 'source'] as const;
export type VersionOrigin = (typeof VERSION_ORIGINS)[number];

/** The most skills a version adds, and the most makes it names. */
export const VERSION_ADDED_MAX = 40;
export const VERSION_MAKES_MAX = 200;
