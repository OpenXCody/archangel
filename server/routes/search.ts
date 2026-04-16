import { Router, Request, Response } from 'express';
import { db } from '../db';
import { companies, factories, occupations, skills, states, refs, schools, programs } from '../db/schema';
import { ilike, or, count } from 'drizzle-orm';

const router = Router();

// Score a result based on how well it matches the query
// Lower score = better match (for sorting)
function getMatchScore(name: string, query: string): number {
  const nameLower = name.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match
  if (nameLower === queryLower) return 0;

  // Starts with query
  if (nameLower.startsWith(queryLower)) return 1;

  // Word starts with query (e.g., "New York" matches "york")
  const words = nameLower.split(/\s+/);
  if (words.some(word => word.startsWith(queryLower))) return 2;

  // Contains query
  if (nameLower.includes(queryLower)) return 3;

  // Fallback
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

interface SearchResultItem {
  id: string;
  name: string;
  type: 'companies' | 'factories' | 'occupations' | 'skills' | 'states' | 'refs' | 'schools' | 'programs';
  subtitle?: string;
  meta?: string;
}

interface SearchResults {
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

// GET /api/search - Global search across all entities
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, types, limit = '5' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const query = q.trim();
    const searchPattern = `%${query}%`;
    const maxLimit = Math.min(parseInt(limit as string) || 5, 20);

    // Parse types filter (persons excluded from search for privacy)
    const typeFilter = types
      ? (types as string).split(',').map(t => t.trim())
      : ['companies', 'factories', 'occupations', 'skills', 'states', 'refs', 'schools', 'programs'];

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

    // Search companies
    if (typeFilter.includes('companies')) {
      const [companyResults, companyCount] = await Promise.all([
        db
          .select({
            id: companies.id,
            name: companies.name,
            industry: companies.industry,
            description: companies.description,
          })
          .from(companies)
          .where(
            or(
              ilike(companies.name, searchPattern),
              ilike(companies.industry, searchPattern),
              ilike(companies.description, searchPattern)
            )
          )
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(companies)
          .where(
            or(
              ilike(companies.name, searchPattern),
              ilike(companies.industry, searchPattern),
              ilike(companies.description, searchPattern)
            )
          ),
      ]);

      const companyItems = companyResults.map((c) => ({
        id: c.id,
        name: c.name,
        type: 'companies' as const,
        subtitle: c.industry || undefined,
      }));

      results.results.companies = {
        count: companyCount[0]?.count ?? 0,
        items: sortByRelevance(companyItems, query),
      };
    }

    // Search factories
    if (typeFilter.includes('factories')) {
      const [factoryResults, factoryCount] = await Promise.all([
        db
          .select({
            id: factories.id,
            name: factories.name,
            specialization: factories.specialization,
            state: factories.state,
            companyId: factories.companyId,
          })
          .from(factories)
          .where(
            or(
              ilike(factories.name, searchPattern),
              ilike(factories.specialization, searchPattern),
              ilike(factories.description, searchPattern),
              ilike(factories.state, searchPattern)
            )
          )
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(factories)
          .where(
            or(
              ilike(factories.name, searchPattern),
              ilike(factories.specialization, searchPattern),
              ilike(factories.description, searchPattern),
              ilike(factories.state, searchPattern)
            )
          ),
      ]);

      const factoryItems = factoryResults.map((f) => ({
        id: f.id,
        name: f.name,
        type: 'factories' as const,
        subtitle: f.specialization || undefined,
        meta: f.state || undefined,
      }));

      results.results.factories = {
        count: factoryCount[0]?.count ?? 0,
        items: sortByRelevance(factoryItems, query),
      };
    }

    // Search occupations
    if (typeFilter.includes('occupations')) {
      const [occupationResults, occupationCount] = await Promise.all([
        db
          .select({
            id: occupations.id,
            title: occupations.title,
            description: occupations.description,
          })
          .from(occupations)
          .where(
            or(
              ilike(occupations.title, searchPattern),
              ilike(occupations.description, searchPattern)
            )
          )
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(occupations)
          .where(
            or(
              ilike(occupations.title, searchPattern),
              ilike(occupations.description, searchPattern)
            )
          ),
      ]);

      const occupationItems = occupationResults.map((o) => ({
        id: o.id,
        name: o.title,
        type: 'occupations' as const,
        subtitle: o.description?.slice(0, 60) || undefined,
      }));

      results.results.occupations = {
        count: occupationCount[0]?.count ?? 0,
        items: sortByRelevance(occupationItems, query),
      };
    }

    // Search skills
    if (typeFilter.includes('skills')) {
      const [skillResults, skillCount] = await Promise.all([
        db
          .select({
            id: skills.id,
            name: skills.name,
            category: skills.category,
          })
          .from(skills)
          .where(
            or(
              ilike(skills.name, searchPattern),
              ilike(skills.category, searchPattern),
              ilike(skills.description, searchPattern)
            )
          )
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(skills)
          .where(
            or(
              ilike(skills.name, searchPattern),
              ilike(skills.category, searchPattern),
              ilike(skills.description, searchPattern)
            )
          ),
      ]);

      const skillItems = skillResults.map((s) => ({
        id: s.id,
        name: s.name,
        type: 'skills' as const,
        subtitle: s.category || undefined,
      }));

      results.results.skills = {
        count: skillCount[0]?.count ?? 0,
        items: sortByRelevance(skillItems, query),
      };
    }

    // Search states
    if (typeFilter.includes('states')) {
      const [stateResults, stateCount] = await Promise.all([
        db
          .select({
            id: states.id,
            code: states.code,
            name: states.name,
          })
          .from(states)
          .where(
            or(
              ilike(states.name, searchPattern),
              ilike(states.code, searchPattern)
            )
          )
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(states)
          .where(
            or(
              ilike(states.name, searchPattern),
              ilike(states.code, searchPattern)
            )
          ),
      ]);

      const stateItems = stateResults.map((s) => ({
        id: s.id,
        name: s.name,
        type: 'states' as const,
        subtitle: s.code,
      }));

      results.results.states = {
        count: stateCount[0]?.count ?? 0,
        items: sortByRelevance(stateItems, query),
      };
    }

    // Search refs (elements)
    if (typeFilter.includes('refs')) {
      const [refResults, refCount] = await Promise.all([
        db
          .select({
            id: refs.id,
            name: refs.name,
            type: refs.type,
            manufacturer: refs.manufacturer,
          })
          .from(refs)
          .where(
            or(
              ilike(refs.name, searchPattern),
              ilike(refs.description, searchPattern),
              ilike(refs.manufacturer, searchPattern)
            )
          )
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(refs)
          .where(
            or(
              ilike(refs.name, searchPattern),
              ilike(refs.description, searchPattern),
              ilike(refs.manufacturer, searchPattern)
            )
          ),
      ]);

      const refItems = refResults.map((r) => ({
        id: r.id,
        name: r.name,
        type: 'refs' as const,
        subtitle: r.type,
        meta: r.manufacturer || undefined,
      }));

      results.results.refs = {
        count: refCount[0]?.count ?? 0,
        items: sortByRelevance(refItems, query),
      };
    }

    // Search schools
    if (typeFilter.includes('schools')) {
      const [schoolResults, schoolCount] = await Promise.all([
        db
          .select({
            id: schools.id,
            name: schools.name,
            schoolType: schools.schoolType,
            state: schools.state,
          })
          .from(schools)
          .where(
            or(
              ilike(schools.name, searchPattern),
              ilike(schools.description, searchPattern)
            )
          )
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(schools)
          .where(
            or(
              ilike(schools.name, searchPattern),
              ilike(schools.description, searchPattern)
            )
          ),
      ]);

      const schoolItems = schoolResults.map((s) => ({
        id: s.id,
        name: s.name,
        type: 'schools' as const,
        subtitle: s.schoolType || undefined,
        meta: s.state || undefined,
      }));

      results.results.schools = {
        count: schoolCount[0]?.count ?? 0,
        items: sortByRelevance(schoolItems, query),
      };
    }

    // Search programs
    if (typeFilter.includes('programs')) {
      const [programResults, programCount] = await Promise.all([
        db
          .select({
            id: programs.id,
            title: programs.title,
            credentialType: programs.credentialType,
          })
          .from(programs)
          .where(
            or(
              ilike(programs.title, searchPattern),
              ilike(programs.description, searchPattern)
            )
          )
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(programs)
          .where(
            or(
              ilike(programs.title, searchPattern),
              ilike(programs.description, searchPattern)
            )
          ),
      ]);

      const programItems = programResults.map((p) => ({
        id: p.id,
        name: p.title,
        type: 'programs' as const,
        subtitle: p.credentialType || undefined,
      }));

      results.results.programs = {
        count: programCount[0]?.count ?? 0,
        items: sortByRelevance(programItems, query),
      };
    }

    // Calculate total count
    results.totalCount =
      results.results.companies.count +
      results.results.factories.count +
      results.results.occupations.count +
      results.results.skills.count +
      results.results.states.count +
      results.results.refs.count +
      results.results.schools.count +
      results.results.programs.count;

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
