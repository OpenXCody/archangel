import { unpackPins, type PinsPayload } from '@shared/pins';
import type { SkillLevel } from '@shared/skillLevels';
import type { CodeSystemKey, ServiceKey } from '@shared/military';
import { API_BASE, fetchWithTimeout, queryString } from './http';
import type { VersionSummary } from './versions';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// Related entity types
export interface RelatedFactory {
  id: string;
  name: string;
  specialization: string | null;
  /** What the site makes, from its industry classification. */
  industry?: string | null;
  city?: string | null;
  state: string | null;
  workforceSize: number | null;
  /** The year the headcount is for. */
  workforceYear?: number | null;
  /** One line on what is made there. */
  products?: string | null;
  status?: FactoryStatus;
  openPositions: number | null;
  latitude?: string | null;
  longitude?: string | null;
  /** On a company's page: the street address, where the people figure was read, and the year production started. */
  address?: string | null;
  workforceSource?: string | null;
  workforceNote?: string | null;
  openedYear?: number | null;
  curated?: boolean;
}

/** Whether a factory is running yet. */
export type FactoryStatus = 'operating' | 'under construction';

/** Where a record's facts came from: a site's name and the page. */
export interface RecordSource {
  label: string;
  url: string;
}

export interface RelatedCompany {
  id: string;
  name: string;
  industry: string | null;
}

export interface RelatedOccupation {
  id: string;
  title: string;
  onetCode: string | null;
  headcount: number | null;
  avgSalaryMin: number | null;
  avgSalaryMax: number | null;
}

export interface RelatedOccupationWithImportance {
  id: string;
  title: string;
  onetCode: string | null;
  importance: 'required' | 'preferred' | 'nice_to_have';
}

// ---------------------------------------------------------------------------
// The skill taxonomy: domain > skill group > skill, and one level per skill
// ---------------------------------------------------------------------------

/** A skill's level, the same in every career: 1 Fundamentals, 2 Intermediate, 3 Advanced (names in lib/stages.ts). */
export type { SkillLevel };

/** A domain or a skill group, by what a link (`slug`) and a label (`name`) need. */
export interface TaxonomyRef {
  slug: string;
  name: string;
}

/**
 * Where a skill sits: its level, its skill group and the group's domain.
 * Every skill has all three. (The server sends null for each only from a
 * local database filled with `npm run db:seed` alone, where no migration has
 * placed the sample skills; `npm run db:create -- --sample` places them.)
 */
export interface SkillPlace {
  level: SkillLevel;
  group: TaxonomyRef;
  domain: TaxonomyRef;
}

/** A skill in the taxonomy tree. */
export interface TaxonomySkill {
  id: string;
  name: string;
  level: SkillLevel;
  /** How many careers use it. */
  careers: number;
  /** How many military careers use it: said only for a skill no other career uses. Absent from an answer cached before it existed. */
  militaryCareers?: number;
  /** Its makes by name, in the order they are shown: the leaves beyond the skill. Empty for most skills. */
  makes: string[];
}

/** A make of a skill: the named equipment or software it is run on ("Haas", "Studio 5000"). */
export interface Make {
  id: string;
  name: string;
}

/** A skill group: a named set of skills inside one domain, its skills by level and then in the curated order. */
export interface TaxonomyGroup extends TaxonomyRef {
  description: string;
  skills: TaxonomySkill[];
}

/** A domain: a department a large manufacturer has, with its groups in display order. */
export interface TaxonomyDomain extends TaxonomyRef {
  description: string;
  groups: TaxonomyGroup[];
}

/** GET /api/skills/taxonomy: the whole tree, domains in display order. Read it with `useTaxonomy()` (lib/queries.ts). */
export interface Taxonomy {
  levels: { id: SkillLevel; name: string }[];
  domains: TaxonomyDomain[];
}

/** A skill on a career's path (GET /api/occupations/:id → `skills`), in path order: by level, then domain and group. */
export interface PathSkill extends SkillPlace {
  id: string;
  name: string;
  importance?: 'required' | 'preferred' | 'nice_to_have';
}

/** A skill that shares careers with another (GET /api/skills/:id → `relatedSkills`). */
export interface RelatedSkill {
  id: string;
  name: string;
  level: SkillLevel;
  group: TaxonomyRef;
}

/** Another skill of the same group (GET /api/skills/:id → `groupSkills`). */
export interface GroupSkill {
  id: string;
  name: string;
  level: SkillLevel;
}

/** An open job listed on its career's page. Pay is in cents. */
export interface CareerJob {
  id: string;
  serial: number;
  title: string;
  payMin: number | null;
  payMax: number | null;
  payPeriod: 'hour' | 'year';
  companyName: string;
  factoryName: string;
  city: string | null;
  occupationId?: string;
  occupationTitle?: string;
}

export interface RelatedFactoryWithHeadcount {
  id: string;
  name: string;
  city?: string | null;
  state: string | null;
  companyId: string | null;
  companyName: string | null;
  headcount: number | null;
  avgSalaryMin: number | null;
  avgSalaryMax: number | null;
  latitude?: string | null;
  longitude?: string | null;
}

// Base entity types
export interface Company {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  headquartersLat: string | null;
  headquartersLng: string | null;
  /** Website domain (e.g. "micron.com"); the logo is looked up from it. */
  domain?: string | null;
  /** Short name for the company's page (/companies/tesla), when it has one. */
  slug?: string | null;
  /** A featured employer: shown first and marked on the map. */
  featured?: boolean;
  createdAt: string;
  factoryCount?: number;
  totalWorkforce?: number;
  occupationCount?: number;
}

// Company with relations
export interface CompanyOccupation {
  id: string;
  title: string;
  onetCode: string | null;
  /** How many of the company's factories employ this occupation. */
  factoryCount: number;
  headcount: number;
}

export interface CompanyDetail extends Company {
  /** Open jobs here, the newest few. */
  jobs?: CareerJob[];
  /** How many jobs are open here in all. */
  openJobCount?: number;
  factories: RelatedFactory[];
  occupations?: CompanyOccupation[];
  /** The company this one is part of. */
  parent?: { id: string; name: string; slug: string | null; domain: string | null } | null;
  /** The companies that are part of this one, the one with the most sites first. */
  subsidiaries?: { id: string; name: string; slug: string | null; domain: string | null; industry: string | null; factoryCount: number }[];
  headquarters?: { city: string; state: string | null; country: string | null } | null;
  /** People in a state, where a source says how many. */
  peopleByState?: { state: string; people: number; year: number | null; source: string | null; note: string | null }[];
  sources?: RecordSource[];
  /** For a company with one factory and no careers recorded there: the careers typical of that factory's industry. */
  typicalCareers?: { id: string; title: string }[];
  /** The careers the company has its own version of. */
  versions?: VersionSummary[];
  /** Which military service the company is; null for every other company. */
  service?: ServiceKey | null;
  /** A service's careers, by title: its page lists them in place of factories. Empty for every other company. */
  serviceCareers?: ServiceCareer[];
}

/** A military career as a list names it: its full title, with its kind and code for the grey line. */
export interface MilitaryCareerRow {
  id: string;
  title: string;
  kind: string | null;
  code: string | null;
}

/** A service's career on the service's own page. */
export interface ServiceCareer extends MilitaryCareerRow {
  /** The domain most of its work is in, by name. */
  home: string | null;
  skillCount: number;
}

export interface Factory {
  id: string;
  name: string;
  companyId: string | null;
  companyName?: string;
  specialization: string | null;
  description: string | null;
  latitude: string;
  longitude: string;
  address?: string | null;
  city?: string | null;
  state: string | null;
  /** What the site makes, from its industry classification. */
  industry?: string | null;
  /** People working at the site, when a source says how many. */
  workforceSize: number | null;
  /** The year that figure is for, where it is stated, and anything to know about it. */
  workforceYear?: number | null;
  workforceSource?: string | null;
  workforceNote?: string | null;
  /** One line on what is made there. */
  products?: string | null;
  /** The year production started. */
  openedYear?: number | null;
  status?: FactoryStatus;
  /** Its facts were written from sources, not only a facility list. */
  curated?: boolean;
  openPositions: number | null;
  createdAt: string;
  occupationCount?: number;
  /** The company's website domain, for its logo, where a response carries it. */
  companyDomain?: string | null;
}

// Factory with relations
/** The company behind a factory, with enough of its profile to introduce it. */
export interface FactoryCompany extends RelatedCompany {
  slug?: string | null;
  domain?: string | null;
  featured?: boolean;
  description?: string | null;
  /** How many sites the company has, and across how many states. */
  siteCount?: number;
  stateCount?: number;
}

/** Another site of the same company. */
export interface SisterSite {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: string;
  longitude: string;
}

export interface FactoryDetail extends Factory {
  /** Open jobs here, the newest few. */
  jobs?: CareerJob[];
  /** How many jobs are open here in all. */
  openJobCount?: number;
  company: FactoryCompany | null;
  /** The company's other sites, closest first (up to five). */
  nearby?: SisterSite[];
  /** Careers typical of this factory's industry, when none are recorded for the factory itself. */
  typicalCareers?: { id: string; title: string }[];
  occupations: RelatedOccupation[];
  /** Where the factory's facts came from. */
  sources?: RecordSource[];
}

export interface Occupation {
  id: string;
  title: string;
  description: string | null;
  onetCode: string | null;
  /** null: no path yet. 'draft': written, not reviewed. 'approved': reviewed by a person. */
  pathStatus?: 'draft' | 'approved' | null;
  createdAt: string;
  skillCount?: number;
  factoryCount?: number;
  /** How many of its skills are at each level (Fundamentals, Intermediate, Advanced), where a response carries it. */
  levelCounts?: [number, number, number] | null;
  /** The career's home: the domain most of its work is in. Null for a career added by hand without one. */
  home?: TaxonomyRef | null;
  /** In a search: the other name the career was found by, when its title did not match. */
  alsoCalled?: string | null;
  /** A military career's service: the employer, and which service it is. Null for a civilian career. */
  service?: CareerService | null;
  /** The service's code for the job ("HT", "15T", "2A3X3") and the system it is in. */
  code?: string | null;
  codeSystem?: CodeSystemKey | null;
  /** The words above a military career's name: "Navy rating", "Army MOS", "Air Force specialty". */
  kind?: string | null;
  /** The service's own title for the job, without the service in front. */
  officialTitle?: string | null;
}

/** The service a military career belongs to. */
export interface CareerService {
  id: string;
  name: string;
  slug: string | null;
  key: ServiceKey;
}

// Occupation with relations
export interface OccupationDetail extends Occupation {
  /** The career's path: its skills, each with its level, group and domain. */
  skills: PathSkill[];
  factories: RelatedFactoryWithHeadcount[];
  /** Open jobs for it, the newest few, and how many are open in all. */
  jobs?: CareerJob[];
  openJobCount?: number;
  /** Industries where this work is typically done, with their factory counts. */
  industries?: { name: string; factoryCount: number }[];
  /** True when the career is found in factories of every industry rather than a few. */
  everywhere?: boolean;
  /** True when it is listed for some industries and found in the others as well. */
  elsewhereToo?: boolean;
  /** States with the most factories in those industries. */
  topStates?: { code: string; factoryCount: number }[];
  /** The ladder: careers a person usually comes to this one from, those it is the first next step of first. Empty for a first rung. */
  comesFrom?: { id: string; title: string }[];
  /** The ladder: careers this one leads to, in the order the catalogue keeps them. */
  leadsTo?: { id: string; title: string }[];
  /** The companies that have their own version of this career. */
  versions?: VersionSummary[];
  /** On a military career: the civilian careers its path covers at least a third of, the most covered first. */
  withinReach?: CareerWithinReach[];
  /** On a civilian career: the military careers whose path covers at least a third of its own, the most covering first. */
  reachedBy?: ReachingCareer[];
}

/** A civilian career within a military career's reach: how much of its path the military career holds, and the rest. */
export interface CareerWithinReach {
  id: string;
  title: string;
  held: number;
  total: number;
  /** The skills of its path the military career does not have, lowest level first. */
  missing: { id: string; name: string; level: SkillLevel | null }[];
}

/** A military career that reaches a civilian one: how much of the civilian path it holds. */
export interface ReachingCareer extends MilitaryCareerRow {
  held: number;
  total: number;
}

export interface Skill extends SkillPlace {
  id: string;
  name: string;
  /** What it is and what a person who has it can do. */
  description: string | null;
  createdAt: string;
  occupationCount?: number;
}

/** A skill as its page shows it: one answer from GET /api/skills/:id. */
export interface SkillDetail extends Skill {
  /** How it is usually learned or shown. */
  howLearned?: string | null;
  /** The tools, machines or software it is done with. */
  tools?: string[] | null;
  /** The other skills of its group, by level and then in the curated order. */
  groupSkills: GroupSkill[];
  /** Its makes, in the order they are shown. Empty for a skill that depends on no named equipment or software. */
  makes?: Make[];
  /** The careers that use it, by title. The skill sits at its own level in each. */
  occupations: RelatedOccupationWithImportance[];
  /** The military careers whose path has it, by title. */
  militaryOccupations?: MilitaryCareerRow[];
  /** Industries those careers are typical of, the ones with most of them first. */
  industries?: { name: string; careerCount: number }[];
  /** True when its careers are found in factories of every industry rather than a few. */
  everywhere?: boolean;
  /** The skills that most often share a path with it. */
  relatedSkills: RelatedSkill[];
  /** Open jobs that ask for it, the newest few, and how many there are in all. */
  jobs?: CareerJob[];
  openJobCount?: number;
}

export type EntityType = 'companies' | 'factories' | 'occupations' | 'skills';

interface FetchOptions {
  offset?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  state?: string;
  company?: string;
  /** Skills: a domain's slug, a group's slug, a level. Careers: a domain's slug (their home). */
  domain?: string;
  group?: string;
  level?: number;
  [key: string]: string | number | boolean | undefined;
}

/**
 * A public read. Anything that changes data, or is a person's own, goes
 * through `request` in lib/http.ts. This one keeps the server's own words for
 * a failure and throws a plain Error: the map tells "not found" from the text
 * (`isNotFound` in components/map/selection.ts).
 */
async function apiFetch<T>(endpoint: string): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE}${endpoint}`);

  if (!response.ok) {
    const error: { error?: string; message?: string } = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Companies API
export const companiesApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Company>>(`/companies${queryString(options)}`),

  get: (id: string) =>
    apiFetch<CompanyDetail>(`/companies/${id}`),
};

// Factories API
export const factoriesApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Factory>>(`/factories${queryString(options)}`),

  get: (id: string) =>
    apiFetch<FactoryDetail>(`/factories/${id}`),

  /** Every factory, as the GeoJSON the map's source takes. */
  pins: async () => unpackPins(await apiFetch<PinsPayload>('/factories/pins')),
};

// Occupations API
export const occupationsApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Occupation>>(`/occupations${queryString(options)}`),

  get: (id: string) =>
    apiFetch<OccupationDetail>(`/occupations/${id}`),
};

// Skills API
export const skillsApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Skill>>(`/skills${queryString(options)}`),

  get: (id: string) =>
    apiFetch<SkillDetail>(`/skills/${id}`),

  /** Every domain, group and skill in one answer. */
  taxonomy: () =>
    apiFetch<Taxonomy>('/skills/taxonomy'),
};

// Entity counts for tabs
export interface EntityCounts {
  companies: number;
  factories: number;
  occupations: number;
  skills: number;
  total: number;
}

export const statsApi = {
  counts: () =>
    apiFetch<EntityCounts>('/stats/counts'),
};

// Search types
export type SearchEntityType = 'companies' | 'factories' | 'occupations' | 'skills' | 'states' | 'jobs' | 'industries';

export interface SearchResultItem {
  id: string;
  name: string;
  type: SearchEntityType;
  subtitle?: string;
  meta?: string;
  /** Companies only: the web domain their logo is looked up from. */
  domain?: string | null;
  /** Careers only: a military career the query named (its code, or its service with words of its title). */
  named?: true;
  /** A named career the query can be nothing but: it leads the results. */
  leads?: true;
  /** Companies only: a military service, listed because the query is its name. */
  service?: true;
}

export interface SearchResults {
  query: string;
  results: {
    companies: { count: number; items: SearchResultItem[] };
    factories: { count: number; items: SearchResultItem[] };
    occupations: { count: number; items: SearchResultItem[] };
    skills: { count: number; items: SearchResultItem[] };
    states: { count: number; items: SearchResultItem[] };
    /** Open jobs. Absent from an answer that was asked for other kinds only. */
    jobs?: { count: number; items: SearchResultItem[] };
    /** Industries, by name or by what they make; `id` is the industry's slug. Absent as jobs are. */
    industries?: { count: number; items: SearchResultItem[] };
  };
  totalCount: number;
}

export interface SearchOptions {
  types?: SearchEntityType[];
  limit?: number;
  /** Also list a military career the query names. The header's search asks; the map's never does. */
  namedMilitary?: boolean;
}

export const searchApi = {
  search: (query: string, options: SearchOptions = {}) => {
    const params: FetchOptions = { q: query };
    if (options.types?.length) {
      params.types = options.types.join(',');
    }
    if (options.limit) {
      params.limit = options.limit;
    }
    if (options.namedMilitary) {
      params.military = 'named';
    }
    return apiFetch<SearchResults>(`/search${queryString(params)}`);
  },
};

// Map API types
/** A company in an overview's Top Companies list. */
export interface TopCompany {
  id: string;
  name: string;
  /** Website domain for the logo, when known. */
  domain: string | null;
  featured: boolean;
  /** Factories inside the state or area. */
  count: number;
  /** Factories nationwide. */
  sites: number;
}

/** The totals and rankings the panel shows for a region. */
export interface RegionOverview {
  totalFactories: number;
  totalCompanies: number;
  totalWorkforce: number;
  topCompanies: TopCompany[];
  topIndustries: { label: string; count: number }[];
  /** Careers typical of the industries found here, the most characteristic first. */
  careers?: { id: string; title: string }[];
  /** How many jobs are open at the factories here. */
  openJobs?: number;
  /** The newest of them: a short list, not all. */
  jobs?: CareerJob[];
}

export interface StateOverview extends RegionOverview {
  code: string;
}

export interface AreaOverview extends RegionOverview {
  id: string;
  name: string;
  description: string;
  bounds: [[number, number], [number, number]];
}

/** A factory in a place's panel. */
export interface PlacePlant {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: string;
  longitude: string;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
}

/** What a box on the map holds: a place found by search. */
export interface BoundsOverview extends RegionOverview {
  bounds: [[number, number], [number, number]];
  /** The factories inside, the best-known companies' first; a short list, not all of them. */
  plants: PlacePlant[];
}

// Map API
export const mapApi = {
  /** Factory count per 2-letter state code — drives the choropleth. */
  stateCounts: () =>
    apiFetch<Record<string, number>>('/map/state-counts'),
  /** Panel data for a selected state. */
  stateOverview: (code: string) =>
    apiFetch<StateOverview>(`/map/states/${encodeURIComponent(code)}/overview`),
  /** Panel data for a selected focus area. */
  areaOverview: (id: string) =>
    apiFetch<AreaOverview>(`/map/areas/${encodeURIComponent(id)}/overview`),
  /** Panel data for any box: [[west, south], [east, north]]. */
  boundsOverview: ([[west, south], [east, north]]: [[number, number], [number, number]]) =>
    apiFetch<BoundsOverview>(`/map/bounds/overview${queryString({ west, south, east, north })}`),
  /** The county a factory stands in, with the official figures for manufacturing there. */
  plantCounty: (factoryId: string) =>
    apiFetch<PlantCounty>(`/map/factories/${encodeURIComponent(factoryId)}/county`),
};

/**
 * The county a factory's coordinates fall in, its metro area, and the official
 * figures for manufacturing as a whole in that county. `county` is null for a
 * factory not yet placed; `manufacturing` where nothing is published.
 */
export interface PlantCounty {
  county: { fips: string; name: string; state: string } | null;
  metro: { code: string; name: string; kind: string } | null;
  manufacturing: IndustryStats | null;
}

// Explore overview: what /explore opens on, in one response.

/** A featured employer on the overview. */
export interface ExploreEmployer {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
  industry: string | null;
  siteCount: number;
  stateCount: number;
}

/** One level of a career's path: how many of its skills are at it and the first few by name. */
export interface ExploreCareerLevel {
  level: SkillLevel;
  count: number;
  skills: string[];
}

/** A career that has a path, with the path's shape. */
export interface ExploreCareer {
  id: string;
  title: string;
  description: string | null;
  levels: ExploreCareerLevel[];
}

/** The skills of one domain that the most careers use. */
export interface ExploreSkillDomain extends TaxonomyRef {
  skills: { id: string; name: string; careerCount: number }[];
}

export interface ExploreArea {
  id: string;
  name: string;
  description: string;
  factoryCount: number;
}

export interface ExploreState {
  code: string;
  name: string;
  factoryCount: number;
}

/** One of the country's largest industries. */
export interface ExploreIndustry {
  slug: string;
  name: string;
  plants: number;
  /** Official: people employed, where published. */
  employment: number | null;
}

export interface ExploreOverview {
  employers: ExploreEmployer[];
  careers: ExploreCareer[];
  skillDomains: ExploreSkillDomain[];
  areas: ExploreArea[];
  states: ExploreState[];
  /** The largest industries, and the year their official figures are for. */
  industries?: ExploreIndustry[];
  industriesYear?: number | null;
}

/** What the browse lists can be filtered by, from every row. */
export interface ExploreFacets {
  /**
   * Of the 21 industries, those some factory carries and those that are some
   * company's industry (the one most of its factories are in), by the name a
   * factory carries. Absent from an answer cached before this field existed.
   */
  industries?: { plants: string[]; companies: string[] };
  /** The same list as `industries.plants`, under its older name. */
  factoryIndustries: string[];
  /** The domains with a skill some career uses, each with such groups, in the taxonomy's order. */
  skillDomains: (TaxonomyRef & { groups: TaxonomyRef[] })[];
  /** The domains that are some career's home, in the taxonomy's order. Absent from an answer cached before this field existed. */
  careerDomains?: TaxonomyRef[];
  /**
   * The same for the military careers: what the Careers list is narrowed by when it lists them. Each says which
   * services have a career at home in it (`services`; absent from an answer cached before it existed).
   */
  militaryCareerDomains?: (TaxonomyRef & { services?: ServiceKey[] })[];
}

export const exploreApi = {
  overview: () =>
    apiFetch<ExploreOverview>('/explore/overview'),
  facets: () =>
    apiFetch<ExploreFacets>('/explore/facets'),
};

// Industries: the 21 manufacturing industries, for the country, a state or a focus area.

/** The place an industry answer is about. */
export type IndustryPlace =
  | { kind: 'country'; name: string }
  | { kind: 'state'; code: string; name: string }
  | { kind: 'area'; id: string; name: string };

/** Official figures for an industry in a place. A figure the source withheld is null. */
export interface IndustryStats {
  year: number;
  establishments: number | null;
  /** People employed (annual average). */
  employment: number | null;
  /** Dollars a year. */
  avgAnnualPay: number | null;
  /** Who published the figures, as said on screen. */
  source: string;
  sourceUrl: string | null;
}

/** One industry in the list of all of them. */
export interface IndustrySummary {
  slug: string;
  code: string;
  /** The title a factory carries; `industryLabel` gives the short form. */
  name: string;
  /** Factories the product lists. */
  plants: number;
  /** Official: people employed and establishments, where published. */
  employment: number | null;
  establishments: number | null;
}

export interface IndustryList {
  place: IndustryPlace;
  /** Every factory listed in the place. */
  plants: number;
  /** The official figure for manufacturing as a whole. */
  manufacturing: IndustryStats | null;
  industries: IndustrySummary[];
}

/** A company among an industry's employers in a place. */
export interface IndustryEmployer {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
  /** Its factories of this industry in the place. */
  plants: number;
  /** People at those of them whose headcount is recorded (`counted` factories), or null when none is. */
  people: number | null;
  counted: number;
}

export interface IndustryPlant {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  people: number;
  companyName: string | null;
  companyDomain: string | null;
}

export interface IndustryDetail {
  industry: { slug: string; code: string; name: string; summary: string | null };
  place: IndustryPlace;
  stats: IndustryStats | null;
  /** What the product lists: factories of this industry in the place, and their companies. */
  plants: number;
  companies: number;
  employers: IndustryEmployer[];
  /** Factories whose headcount is recorded, largest first. */
  largestPlants: IndustryPlant[];
  careers: { id: string; title: string }[];
  openJobs: number;
  jobs: CareerJob[];
  /** For the country: the states, largest first. */
  states?: { code: string; name: string; plants: number; employment: number | null }[];
  /** For a state or a focus area: its cities, most factories first, each with a box around its factories for the map. */
  cities?: { name: string; state: string | null; plants: number; box: [[number, number], [number, number]] | null }[];
}

/** `place`: a state code or a focus area's id, as the page's address carries it. */
export const industriesApi = {
  list: (place: { state?: string; area?: string } = {}) =>
    apiFetch<IndustryList>(`/industries${queryString(place)}`),
  get: (slug: string, place: { state?: string; area?: string } = {}) =>
    apiFetch<IndustryDetail>(`/industries/${encodeURIComponent(slug)}${queryString(place)}`),
};
