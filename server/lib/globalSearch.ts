// Global Search - Single Source of Truth for all entity search
import { db } from '../db';
import { companies, factories, occupations, skills, states, refs, schools, programs } from '../db/schema';
import { ilike, or, count, and, sql } from 'drizzle-orm';

// Score a result based on how well it matches the query
// Lower score = better match (for sorting)
function getMatchScore(name: string, query: string): number {
  const nameLower = name.toLowerCase();
  const queryLower = query.toLowerCase();

  if (nameLower === queryLower) return 0;
  if (nameLower.startsWith(queryLower)) return 1;

  const words = nameLower.split(/\s+/);
  if (words.some(word => word.startsWith(queryLower))) return 2;

  if (nameLower.includes(queryLower)) return 3;

  return 4;
}

// Sort results by match quality, then alphabetically
function sortByRelevance<T extends { name: string }>(items: T[], query: string): T[] {
  return items.sort((a, b) => {
    const scoreA = getMatchScore(a.name, query);
    const scoreB = getMatchScore(b.name, query);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.name.localeCompare(b.name);
  });
}

export interface SearchResultItem {
  id: string;
  name: string;
  type: 'companies' | 'factories' | 'occupations' | 'skills' | 'states' | 'refs' | 'schools' | 'programs';
  subtitle?: string;
  meta?: string;
}

export interface SearchResults {
  query: string;
  results: {
    companies: { count: number; items: SearchResultItem[] };
    factories: { count: number; items: SearchResultItem[] };
    occupations: { count: number; items: SearchResultItem[] };
    skills: { count: number; items: SearchResultItem[] };
    states: { count: number; items: SearchResultItem[] };
    refs: { count: number; items: SearchResultItem[] };
    schools: { count: number; items: SearchResultItem[] };
    programs: { count: number; items: SearchResultItem[] };
  };
  totalCount: number;
}

export interface GlobalSearchOptions {
  query: string;
  types?: string[];
  limit?: number;
}

/**
 * Global search across all 8 entity types
 * Returns all buckets with counts and top items
 */
export async function globalSearch(options: GlobalSearchOptions): Promise<SearchResults> {
  const { query, types, limit = 5 } = options;
  
  const searchPattern = `%${query}%`;
  const maxLimit = Math.min(limit, 20);

  // Default to all types if not specified
  const typeFilter = types || ['companies', 'factories', 'occupations', 'skills', 'states', 'refs', 'schools', 'programs'];

  const results: SearchResults = {
    query,
    results: {
      companies: { count: 0, items: [] },
      factories: { count: 0, items: [] },
      occupations: { count: 0, items: [] },
      skills: { count: 0, items: [] },
      states: { count: 0, items: [] },
      refs: { count: 0, items: [] },
      schools: { count: 0, items: [] },
      programs: { count: 0, items: [] },
    },
    totalCount: 0,
  };

  // Search companies - exclude junk names (same filter as list endpoint)
  if (typeFilter.includes('companies')) {
    const nameFilter = and(
      sql`${companies.name} ~ '[A-Za-z]{2,}'`,
      sql`${companies.name} !~ '^[#(]'`,
      sql`${companies.name} !~ '^\\d+\\s'`,
      sql`${companies.name} !~ '^\\d+/\\d'`,
    );
    const searchFilter = or(
      ilike(companies.name, searchPattern),
      ilike(companies.industry, searchPattern)
    );

    const [countRes, dataRes] = await Promise.all([
      db.select({ count: count() }).from(companies).where(and(nameFilter, searchFilter)),
      db.select({ id: companies.id, name: companies.name, industry: companies.industry })
        .from(companies)
        .where(and(nameFilter, searchFilter))
        .orderBy(companies.name)
        .limit(maxLimit),
    ]);

    const companyItems = dataRes.map(c => ({
      id: c.id,
      name: c.name,
      type: 'companies' as const,
      subtitle: c.industry || undefined,
    }));

    results.results.companies = {
      count: countRes[0]?.count ?? 0,
      items: sortByRelevance(companyItems, query),
    };
  }

  // Search factories
  if (typeFilter.includes('factories')) {
    const [countRes, dataRes] = await Promise.all([
      db.select({ count: count() }).from(factories)
        .where(or(
          ilike(factories.name, searchPattern),
          ilike(factories.specialization, searchPattern),
          ilike(factories.state, searchPattern)
        )),
      db.select({
        id: factories.id,
        name: factories.name,
        state: factories.state,
        specialization: factories.specialization,
      })
        .from(factories)
        .where(or(
          ilike(factories.name, searchPattern),
          ilike(factories.specialization, searchPattern),
          ilike(factories.state, searchPattern)
        ))
        .orderBy(factories.name)
        .limit(maxLimit),
    ]);

    const factoryItems = dataRes.map(f => ({
      id: f.id,
      name: f.name,
      type: 'factories' as const,
      subtitle: f.specialization || undefined,
      meta: f.state || undefined,
    }));

    results.results.factories = {
      count: countRes[0]?.count ?? 0,
      items: sortByRelevance(factoryItems, query),
    };
  }

  // Search occupations
  if (typeFilter.includes('occupations')) {
    const [countRes, dataRes] = await Promise.all([
      db.select({ count: count() }).from(occupations)
        .where(ilike(occupations.title, searchPattern)),
      db.select({ id: occupations.id, title: occupations.title })
        .from(occupations)
        .where(ilike(occupations.title, searchPattern))
        .orderBy(occupations.title)
        .limit(maxLimit),
    ]);

    const occupationItems = dataRes.map(o => ({
      id: o.id,
      name: o.title,
      type: 'occupations' as const,
    }));

    results.results.occupations = {
      count: countRes[0]?.count ?? 0,
      items: sortByRelevance(occupationItems, query),
    };
  }

  // Search skills
  if (typeFilter.includes('skills')) {
    const [countRes, dataRes] = await Promise.all([
      db.select({ count: count() }).from(skills)
        .where(or(
          ilike(skills.name, searchPattern),
          ilike(skills.category, searchPattern)
        )),
      db.select({ id: skills.id, name: skills.name, category: skills.category })
        .from(skills)
        .where(or(
          ilike(skills.name, searchPattern),
          ilike(skills.category, searchPattern)
        ))
        .orderBy(skills.name)
        .limit(maxLimit),
    ]);

    const skillItems = dataRes.map(s => ({
      id: s.id,
      name: s.name,
      type: 'skills' as const,
      subtitle: s.category || undefined,
    }));

    results.results.skills = {
      count: countRes[0]?.count ?? 0,
      items: sortByRelevance(skillItems, query),
    };
  }

  // Search states
  if (typeFilter.includes('states')) {
    const [countRes, dataRes] = await Promise.all([
      db.select({ count: count() }).from(states)
        .where(or(
          ilike(states.name, searchPattern),
          ilike(states.code, searchPattern)
        )),
      db.select({ id: states.id, name: states.name, code: states.code })
        .from(states)
        .where(or(
          ilike(states.name, searchPattern),
          ilike(states.code, searchPattern)
        ))
        .orderBy(states.name)
        .limit(maxLimit),
    ]);

    const stateItems = dataRes.map(s => ({
      id: s.code,
      name: s.name,
      type: 'states' as const,
      meta: s.code,
    }));

    results.results.states = {
      count: countRes[0]?.count ?? 0,
      items: sortByRelevance(stateItems, query),
    };
  }

  // Search refs (elements library)
  if (typeFilter.includes('refs')) {
    const [countRes, dataRes] = await Promise.all([
      db.select({ count: count() }).from(refs)
        .where(or(
          ilike(refs.name, searchPattern),
          ilike(refs.description, searchPattern),
          ilike(refs.manufacturer, searchPattern)
        )),
      db.select({
        id: refs.id,
        name: refs.name,
        type: refs.type,
        manufacturer: refs.manufacturer,
      })
        .from(refs)
        .where(or(
          ilike(refs.name, searchPattern),
          ilike(refs.description, searchPattern),
          ilike(refs.manufacturer, searchPattern)
        ))
        .orderBy(refs.name)
        .limit(maxLimit),
    ]);

    const refItems = dataRes.map(r => ({
      id: r.id,
      name: r.name,
      type: 'refs' as const,
      subtitle: r.type || undefined,
      meta: r.manufacturer || undefined,
    }));

    results.results.refs = {
      count: countRes[0]?.count ?? 0,
      items: sortByRelevance(refItems, query),
    };
  }

  // Search schools
  if (typeFilter.includes('schools')) {
    const [countRes, dataRes] = await Promise.all([
      db.select({ count: count() }).from(schools)
        .where(or(
          ilike(schools.name, searchPattern),
          ilike(schools.description, searchPattern)
        )),
      db.select({
        id: schools.id,
        name: schools.name,
        schoolType: schools.schoolType,
        state: schools.state,
      })
        .from(schools)
        .where(or(
          ilike(schools.name, searchPattern),
          ilike(schools.description, searchPattern)
        ))
        .orderBy(schools.name)
        .limit(maxLimit),
    ]);

    const schoolItems = dataRes.map(s => ({
      id: s.id,
      name: s.name,
      type: 'schools' as const,
      subtitle: s.schoolType || undefined,
      meta: s.state || undefined,
    }));

    results.results.schools = {
      count: countRes[0]?.count ?? 0,
      items: sortByRelevance(schoolItems, query),
    };
  }

  // Search programs
  if (typeFilter.includes('programs')) {
    const [countRes, dataRes] = await Promise.all([
      db.select({ count: count() }).from(programs)
        .where(or(
          ilike(programs.title, searchPattern),
          ilike(programs.description, searchPattern)
        )),
      db.select({
        id: programs.id,
        title: programs.title,
        credentialType: programs.credentialType,
      })
        .from(programs)
        .where(or(
          ilike(programs.title, searchPattern),
          ilike(programs.description, searchPattern)
        ))
        .orderBy(programs.title)
        .limit(maxLimit),
    ]);

    const programItems = dataRes.map(p => ({
      id: p.id,
      name: p.title,
      type: 'programs' as const,
      subtitle: p.credentialType || undefined,
    }));

    results.results.programs = {
      count: countRes[0]?.count ?? 0,
      items: sortByRelevance(programItems, query),
    };
  }

  // Calculate total count across all buckets
  results.totalCount =
    results.results.companies.count +
    results.results.factories.count +
    results.results.occupations.count +
    results.results.skills.count +
    results.results.states.count +
    results.results.refs.count +
    results.results.schools.count +
    results.results.programs.count;

  return results;
}
