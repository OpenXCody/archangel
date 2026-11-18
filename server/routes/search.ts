import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { companies, factories, jobs, occupations, skills } from '../db/schema.js';
import { ilike, or, and, count, eq, sql, type AnyColumn } from 'drizzle-orm';
import { jobTextFilter } from '../lib/jobSearch.js';
import { browsableCompanyFilter } from '../lib/companyFilters.js';
import { companyInScope, factoryInScope } from '../lib/scope.js';
import { US_STATES } from '../../shared/states.js';
import { pageLimit } from '../lib/paging.js';
import { searchIndustries } from '../lib/industries.js';

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
  type: 'companies' | 'factories' | 'occupations' | 'skills' | 'states' | 'jobs' | 'industries';
  subtitle?: string;
  meta?: string;
  /** Companies only: the web domain their logo is looked up from. */
  domain?: string | null;
}

interface SearchResults {
  query: string;
  results: {
    companies: { count: number; items: SearchResultItem[] };
    factories: { count: number; items: SearchResultItem[] };
    occupations: { count: number; items: SearchResultItem[] };
    skills: { count: number; items: SearchResultItem[] };
    states: { count: number; items: SearchResultItem[] };
    jobs: { count: number; items: SearchResultItem[] };
    industries: { count: number; items: SearchResultItem[] };
  };
  totalCount: number;
}

// GET /api/search - Search across companies, factories, careers, skills and states.
// Companies and factories only match in scope, so a hit never links to a
// detail page that would 404.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, types, limit = '5' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    // Capped, with the term's own LIKE wildcards made literal ("100%" is not "everything").
    const query = q.trim().slice(0, 80);
    const literal = query.replace(/[\\%_]/g, '\\$&');
    const searchPattern = `%${literal}%`;
    // The best matches must be chosen by the database, before the limit: with
    // 120 companies matching "texas", five arbitrary ones are not an answer.
    // Exact name, then a name that starts with the term, then a word that
    // starts with it, then anything that contains it; shorter names first.
    const byRelevanceRank = (column: AnyColumn) =>
      sql`CASE
            WHEN lower(${column}) = ${query.toLowerCase()} THEN 0
            WHEN ${column} ILIKE ${`${literal}%`} THEN 1
            WHEN ${column} ILIKE ${`% ${literal}%`} THEN 2
            ELSE 3
          END`;
    const byRelevance = (column: AnyColumn) =>
      sql`CASE
            WHEN lower(${column}) = ${query.toLowerCase()} THEN 0
            WHEN ${column} ILIKE ${`${literal}%`} THEN 1
            WHEN ${column} ILIKE ${`% ${literal}%`} THEN 2
            WHEN ${column} ILIKE ${searchPattern} THEN 3
            ELSE 4
          END, length(${column}), ${column}`;
    const maxLimit = pageLimit(limit, 5, 20);

    const typeFilter = types
      ? (types as string).split(',').map(t => t.trim())
      : ['companies', 'factories', 'occupations', 'skills', 'states', 'jobs', 'industries'];

    const results: SearchResults = {
      query,
      results: {
        companies: { count: 0, items: [] },
        factories: { count: 0, items: [] },
        occupations: { count: 0, items: [] },
        skills: { count: 0, items: [] },
        states: { count: 0, items: [] },
        jobs: { count: 0, items: [] },
        industries: { count: 0, items: [] },
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
            domain: companies.domain,
          })
          .from(companies)
          .where(
            and(
              browsableCompanyFilter,
              companyInScope(),
              or(
                ilike(companies.name, searchPattern)
              )
            )
          )
          .orderBy(byRelevanceRank(companies.name), sql`${companies.featured} DESC`, sql`length(${companies.name})`, companies.name)
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(companies)
          .where(
            and(
              browsableCompanyFilter,
              companyInScope(),
              or(
                ilike(companies.name, searchPattern)
              )
            )
          ),
      ]);

      const companyItems = companyResults.map((c) => ({
        id: c.id,
        name: c.name,
        type: 'companies' as const,
        subtitle: c.industry || undefined,
        domain: c.domain,
      }));

      results.results.companies = {
        count: companyCount[0]?.count ?? 0,
        items: companyItems, // already ranked by the database, featured first within a rank
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
            and(
              factoryInScope(),
              or(
                ilike(factories.name, searchPattern),
                ilike(factories.city, searchPattern)
              )
            )
          )
          .orderBy(byRelevance(factories.name))
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(factories)
          .where(
            and(
              factoryInScope(),
              or(
                ilike(factories.name, searchPattern),
                ilike(factories.city, searchPattern)
              )
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
          .orderBy(byRelevance(occupations.title))
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
          .orderBy(byRelevance(skills.name))
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

    // States come from the fixed list (shared/states.ts), matched by name or
    // by the whole two-letter code. A state has no id of its own: its code
    // stands in, and the client opens it on the map.
    if (typeFilter.includes('states')) {
      const term = query.toLowerCase();
      const stateItems = US_STATES.filter(
        (s) => s.name.toLowerCase().includes(term) || s.code.toLowerCase() === term
      ).map((s) => ({ id: s.code, name: s.name, type: 'states' as const, subtitle: s.code }));

      results.results.states = {
        count: stateItems.length,
        items: sortByRelevance(stateItems, query).slice(0, maxLimit),
      };
    }

    // Open jobs, matched as the jobs list matches them: every word typed is in
    // the job's title, company, career, shift or place. Newest first.
    const jobFilter = typeFilter.includes('jobs') ? jobTextFilter(query) : null;
    if (jobFilter) {
      const open = and(eq(jobs.status, 'open'), sql`${jobs.expiresAt} > now()`, factoryInScope(), jobFilter);
      const [jobRows, jobCount] = await Promise.all([
        db
          .select({ id: jobs.id, title: jobs.title, companyName: companies.name, city: factories.city, state: factories.state })
          .from(jobs)
          .innerJoin(companies, eq(companies.id, jobs.companyId))
          .innerJoin(factories, eq(factories.id, jobs.factoryId))
          .innerJoin(occupations, eq(occupations.id, jobs.occupationId))
          .where(open)
          .orderBy(sql`${jobs.postedAt} DESC`)
          .limit(maxLimit),
        db
          .select({ count: count() })
          .from(jobs)
          .innerJoin(companies, eq(companies.id, jobs.companyId))
          .innerJoin(factories, eq(factories.id, jobs.factoryId))
          .innerJoin(occupations, eq(occupations.id, jobs.occupationId))
          .where(open),
      ]);
      results.results.jobs = {
        count: jobCount[0]?.count ?? 0,
        items: jobRows.map((job) => ({
          id: job.id,
          name: job.title,
          type: 'jobs' as const,
          subtitle: [job.companyName, [job.city, job.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
        })),
      };
    }

    // Industries come from the fixed list of 21 (shared/industry.ts), matched
    // by name and by what they make. Like a state, an industry has no id of
    // its own: its slug stands in, and the client opens its page.
    if (typeFilter.includes('industries')) {
      const found = await searchIndustries(query, 21);
      results.results.industries = {
        count: found.length,
        items: found.slice(0, maxLimit).map((industry) => ({
          id: industry.slug,
          name: industry.name,
          type: 'industries' as const,
          subtitle: industry.summary ?? undefined,
        })),
      };
    }

    // Calculate total count
    results.totalCount =
      results.results.companies.count +
      results.results.factories.count +
      results.results.occupations.count +
      results.results.skills.count +
      results.results.states.count +
      results.results.jobs.count +
      results.results.industries.count;

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
