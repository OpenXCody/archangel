/**
 * Military careers. A military job (a Navy rating, an Army MOS, an Air Force
 * specialty) is a career, and each service is an employer: a company whose
 * `service` says which. A career is military when it has a service. Nothing
 * else is stored about it: the words shown above its name and its tags are
 * derived here, and nowhere else.
 */

/** The four services, by the key stored in `companies.service`. */
export const SERVICES = [
  { key: 'navy', name: 'U.S. Navy', short: 'Navy' },
  { key: 'army', name: 'U.S. Army', short: 'Army' },
  { key: 'air-force', name: 'U.S. Air Force', short: 'Air Force' },
  { key: 'marine-corps', name: 'U.S. Marine Corps', short: 'Marine Corps' },
] as const;

export type ServiceKey = (typeof SERVICES)[number]['key'];

/**
 * The systems a career's code can be in, by the key stored in
 * `occupations.code_system`. Each is one service's, and `kind` is what stands
 * above the career's name. The Marine Corps has no careers yet, and so no system.
 */
export const CODE_SYSTEMS = [
  { key: 'navy-rating', service: 'navy', kind: 'Navy rating' },
  { key: 'army-mos', service: 'army', kind: 'Army MOS' },
  { key: 'afsc', service: 'air-force', kind: 'Air Force specialty' },
] as const;

export type CodeSystemKey = (typeof CODE_SYSTEMS)[number]['key'];

/** The tag every military career carries, beside its service's. */
export const MILITARY_TAG = 'military';

export function isServiceKey(value: unknown): value is ServiceKey {
  return SERVICES.some((service) => service.key === value);
}

export function isCodeSystem(value: unknown): value is CodeSystemKey {
  return CODE_SYSTEMS.some((system) => system.key === value);
}

/** "Navy", "Air Force": the service as a word in a title or a filter. Null for anything that is not a service. */
export function serviceShortName(key: string | null | undefined): string | null {
  return SERVICES.find((service) => service.key === key)?.short ?? null;
}

/** "U.S. Navy": the service as the employer is named. Null for anything that is not a service. */
export function serviceName(key: string | null | undefined): string | null {
  return SERVICES.find((service) => service.key === key)?.name ?? null;
}

/** The service a code system belongs to. */
export function serviceOfCodeSystem(system: string | null | undefined): ServiceKey | null {
  return CODE_SYSTEMS.find((item) => item.key === system)?.service ?? null;
}

/** The system a service's codes are in; null for a service with none yet. */
export function codeSystemOf(service: string | null | undefined): CodeSystemKey | null {
  return CODE_SYSTEMS.find((item) => item.service === service)?.key ?? null;
}

/** The words above a military career's name: "Navy rating", "Army MOS", "Air Force specialty". Null for a civilian career. */
export function careerKind(system: string | null | undefined): string | null {
  return CODE_SYSTEMS.find((item) => item.key === system)?.kind ?? null;
}

/** A tag, as a key to filter on and the word to show. */
export interface CareerTag {
  key: string;
  word: string;
}

/**
 * A career's tags, from its service: "military" and the service's own
 * (`navy`, `army`, `air-force`, `marine-corps`). None for a civilian career.
 */
export function careerTags(service: string | null | undefined): CareerTag[] {
  const short = serviceShortName(service);
  return short && service ? [{ key: MILITARY_TAG, word: 'Military' }, { key: service, word: short }] : [];
}

/**
 * A military career's title: the service in front of the service's own name for
 * the job ("Navy Electronics Technician"), because a title is unique and the
 * civilian "Electronics Technician" exists.
 */
export function militaryTitle(service: ServiceKey, officialTitle: string): string {
  return `${serviceShortName(service)} ${officialTitle}`;
}
