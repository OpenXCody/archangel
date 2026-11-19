import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { companies, factories, jobs, occupations, skills } from '../db/schema.js';
import { ilike, or, and, count, eq, sql, type AnyColumn } from 'drizzle-orm';
import { jobTextFilter } from '../lib/jobSearch.js';
import { browsableCompanyFilter } from '../lib/companyFilters.js';
import { companyInScope, factoryInScope } from '../lib/scope.js';
import { jobIsOpen } from '../lib/openJobs.js';
import { US_STATES } from '../../shared/states.js';
import { pageLimit } from '../lib/paging.js';
import { likeLiteral } from '../lib/like.js';
import { companyIndustry, searchIndustries } from '../lib/industries.js';
import { shownIndustry } from '../../shared/industry.js';
import { formatCompanyName, formatFactoryName } from '../../shared/displayName.js';

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
    const literal = likeLiteral(query);
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
            // The industry most of its plants are in; the free text on the row is not shown.
            industry: companyIndustry(sql`${companies.id}`),
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
        // One of the 21 by its short name, or no line at all.
        subtitle: shownIndustry(c.industry) ?? undefined,
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
            city: factories.city,
            state: factories.state,
            companyName: companies.name,
          })
          .from(factories)
          .leftJoin(companies, eq(companies.id, factories.companyId))
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

      // A plant's line is whose it is and where: "Tesla · Austin, TX". The
      // company is left out when the plant's own name already starts with it.
      const factoryItems = factoryResults.map((f) => {
        const company = f.companyName ? formatCompanyName(f.companyName) : null;
        const repeats = company !== null && formatFactoryName(f.name).toLowerCase().startsWith(company.toLowerCase());
        // Cities arrive in capitals ("ROUND ROCK").
        const place = [f.city ? formatCompanyName(f.city) : null, f.state].filter(Boolean).join(', ');
        return {
          id: f.id,
          name: f.name,
          type: 'factories' as const,
          subtitle: [repeats ? null : company, place].filter(Boolean).join(' · ') || undefined,
        };
      });

      results.results.factories = {
        count: factoryCount[0]?.count ?? 0,
        items: sortByRelevance(factoryItems, query),
      };
    }

    // Search careers: by title, by another name a career is known by (a title
    // folded into it, or an everyday name, in occupation_aliases), or by what
    // its description says. A career found by another name says which.
    if (typeFilter.includes('occupations')) {
      // Another name matches from the start of a word: "weld" finds "weld tech", not "seam welder".
      const nameStarts = sql`(a.alias_text ILIKE ${`${literal}%`} OR a.alias_text ILIKE ${`% ${literal}%`})`;
      const otherName = sql<string | null>`(
        SELECT a.alias_text FROM occupation_aliases a
        WHERE a.canonical_occupation_id = occupations.id AND ${nameStarts}
        ORDER BY (lower(a.alias_text) = ${query.toLowerCase()}) DESC, length(a.alias_text), a.alias_text LIMIT 1)`;
      const careerMatches = or(
        ilike(occupations.title, searchPattern),
        sql`EXISTS (SELECT 1 FROM occupation_aliases a WHERE a.canonical_occupation_id = occupations.id AND ${nameStarts})`,
        ilike(occupations.description, searchPattern)
      );
      const [occupationResults, occupationCount] = await Promise.all([
        db
          .select({
            id: occupations.id,
            title: occupations.title,
            description: occupations.description,
            otherName,
          })
          .from(occupations)
          .where(careerMatches)
          // A title that matches comes before a career found by another name (the name itself first, then one
          // that starts with the term), and that before one whose description mentions the term.
          .orderBy(
            sql`CASE WHEN ${occupations.title} ILIKE ${searchPattern} THEN 0 WHEN lower(${otherName}) = ${query.toLowerCase()} THEN 1 WHEN ${otherName} IS NOT NULL THEN 2 ELSE 3 END`,
            byRelevance(occupations.title)
          )
          .limit(maxLimit),
        db.select({ count: count() }).from(occupations).where(careerMatches),
      ]);

      const titled = (title: string) => title.toLowerCase().includes(query.toLowerCase());
      const occupationItems = occupationResults.map((o) => ({
        id: o.id,
        name: o.title,
        type: 'occupations' as const,
        // Found by another name: say which, so the result explains itself.
        subtitle: !titled(o.title) && o.otherName ? `Also called ${o.otherName}` : o.description || undefined,
        found: titled(o.title) ? 0 : o.otherName ? (o.otherName.toLowerCase() === query.toLowerCase() ? 1 : 2) : 3,
      }));

      results.results.occupations = {
        count: occupationCount[0]?.count ?? 0,
        items: sortByRelevance(occupationItems.filter((item) => item.found === 0), query)
          .concat(occupationItems.filter((item) => item.found !== 0).sort((x, y) => x.found - y.found))
          .map(({ found: _found, ...item }) => item),
      };
    }

    // Search skills: by name, by another name a skill is known by (a merged
    // or everyday name in skill_aliases), by what it is done with, or by the
    // name of its group or domain. A result's grey line is its group.
    // The subqueries name the table outright: in a select list a column
    // reference is written bare, and "id" would then mean the alias's own.
    if (typeFilter.includes('skills')) {
      // Another name or a tool matches from the start of a word: "tig" finds
      // "Orbital TIG Welding", not "Deviation Investigation".
      const wordStart = (column: string) => sql`(${sql.raw(column)} ILIKE ${`${literal}%`} OR ${sql.raw(column)} ILIKE ${`% ${literal}%`})`;
      const otherName = sql<string | null>`(
        SELECT a.alias_text FROM skill_aliases a
        WHERE a.canonical_skill_id = skills.id AND ${wordStart('a.alias_text')}
        ORDER BY length(a.alias_text), a.alias_text LIMIT 1)`;
      const skillMatches = or(
        ilike(skills.name, searchPattern),
        sql`EXISTS (SELECT 1 FROM skill_aliases a WHERE a.canonical_skill_id = skills.id AND ${wordStart('a.alias_text')})`,
        sql`EXISTS (SELECT 1 FROM unnest(skills.tools) AS tool WHERE ${wordStart('tool')})`,
        sql`EXISTS (SELECT 1 FROM skill_groups sg INNER JOIN skill_domains sd ON sd.slug = sg.domain_slug
          WHERE sg.slug = skills.group_slug AND (sg.name ILIKE ${searchPattern} OR sd.name ILIKE ${searchPattern}))`
      );
      const [skillResults, skillCount] = await Promise.all([
        db
          .select({
            id: skills.id,
            name: skills.name,
            groupName: sql<string | null>`(SELECT sg.name FROM skill_groups sg WHERE sg.slug = skills.group_slug)`,
            otherName,
          })
          .from(skills)
          .where(skillMatches)
          // A name that matches comes before one found by its other name, its tools, its group or its domain.
          .orderBy(sql`CASE WHEN ${skills.name} ILIKE ${searchPattern} THEN 0 WHEN ${otherName} IS NOT NULL THEN 1 ELSE 2 END`, byRelevance(skills.name))
          .limit(maxLimit),
        db.select({ count: count() }).from(skills).where(skillMatches),
      ]);

      const named = (name: string) => name.toLowerCase().includes(query.toLowerCase());
      const skillItems = skillResults.map((s) => ({
        id: s.id,
        name: s.name,
        type: 'skills' as const,
        // Found by another name: say which, so the result explains itself.
        subtitle: !named(s.name) && s.otherName ? `Also called ${s.otherName}` : s.groupName || undefined,
        found: named(s.name) ? 0 : s.otherName ? 1 : 2,
      }));

      results.results.skills = {
        count: skillCount[0]?.count ?? 0,
        items: sortByRelevance(skillItems.filter((item) => item.found === 0), query)
          .concat(skillItems.filter((item) => item.found !== 0).sort((a, b) => a.found - b.found))
          .map(({ found: _found, ...item }) => item),
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
      const open = and(jobIsOpen(), factoryInScope(), jobFilter);
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
