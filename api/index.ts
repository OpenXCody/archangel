// Vercel Serverless API - Inline handlers (no external imports from server/)
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, ilike, or, sql, count, and, ne } from 'drizzle-orm';
import { pgTable, uuid, text, integer, timestamp, varchar } from 'drizzle-orm/pg-core';

// ========== SCHEMA (inline) ==========
const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  aliases: text('aliases').array(),
  industry: text('industry'),
  description: text('description'),
  headquartersLat: text('headquarters_lat'),
  headquartersLng: text('headquarters_lng'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

const factories = pgTable('factories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  companyId: uuid('company_id'),
  specialization: text('specialization'),
  description: text('description'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  state: text('state'),
  workforceSize: integer('workforce_size'),
  openPositions: integer('open_positions'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const occupations = pgTable('occupations', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  onetCode: text('onet_code'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  category: text('category'),
  description: text('description'),
  categoryId: uuid('category_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const states = pgTable('states', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 2 }).notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const industries = pgTable('industries', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const companyIndustries = pgTable('company_industries', {
  companyId: uuid('company_id').notNull(),
  industryId: uuid('industry_id').notNull(),
});

const factoryOccupations = pgTable('factory_occupations', {
  factoryId: uuid('factory_id').notNull(),
  occupationId: uuid('occupation_id').notNull(),
  headcount: integer('headcount'),
  avgSalaryMin: integer('avg_salary_min'),
  avgSalaryMax: integer('avg_salary_max'),
});

const occupationSkills = pgTable('occupation_skills', {
  occupationId: uuid('occupation_id').notNull(),
  skillId: uuid('skill_id').notNull(),
  importance: text('importance'),
});

// New entities: refs (elements library), schools, programs, persons
const refs = pgTable('refs', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  manufacturer: text('manufacturer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const skillRefs = pgTable('skill_refs', {
  skillId: uuid('skill_id').notNull(),
  refId: uuid('ref_id').notNull(),
});

const schools = pgTable('schools', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  state: text('state'),
  stateId: uuid('state_id'),
  schoolType: text('school_type'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const programs = pgTable('programs', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id'),
  title: text('title').notNull(),
  description: text('description'),
  cipCode: text('cip_code'),
  credentialType: text('credential_type'),
  durationHours: integer('duration_hours'),
  isOpenSource: integer('is_open_source'),
  curriculumUrl: text('curriculum_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const programSkills = pgTable('program_skills', {
  programId: uuid('program_id').notNull(),
  skillId: uuid('skill_id').notNull(),
  importance: text('importance'),
});

const persons = pgTable('persons', {
  id: uuid('id').defaultRandom().primaryKey(),
  fullName: text('full_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== DATABASE ==========
const connectionString = process.env.DATABASE_URL || '';
const client = connectionString ? postgres(connectionString, { max: 1 }) : null;
const db = client ? drizzle(client) : null;

// ========== EXPRESS APP ==========
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// UUID validation helper (accepts any valid UUID format, not just v4)
const isValidUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Health check
app.get('/api/health', async (req, res) => {
  res.json({
    status: db ? 'ok' : 'no-db',
    timestamp: new Date().toISOString(),
    hasDbUrl: !!connectionString,
  });
});

// State overview — driven by click on a state fill. Returns the stats
// shown in the sidebar: totals, top cities, top companies, top industries.
app.get('/api/map/states/:code/overview', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });
  const code = String(req.params.code).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return res.status(400).json({ error: 'Invalid state code' });
  try {
    const [totalsRow] = await db
      .select({
        totalFactories: count(),
        totalWorkforce: sql<number>`COALESCE(SUM(${factories.workforceSize}), 0)::int`,
        totalCompanies: sql<number>`COUNT(DISTINCT ${factories.companyId})::int`,
      })
      .from(factories)
      .where(eq(factories.state, code));

    const topCompanies: any = await db.execute(sql`
      SELECT c.id, c.name, COUNT(*)::int AS count
      FROM factories f
      INNER JOIN companies c ON c.id = f.company_id
      WHERE f.state = ${code}
        AND c.name ~ '[A-Za-z]{2,}'
        AND c.name NOT LIKE '#%'
        AND c.name NOT LIKE '(%'
      GROUP BY c.id, c.name
      ORDER BY count DESC, c.name ASC
      LIMIT 10
    `);

    // primary_naics may or may not be populated — fall back to grouping by the
    // full code when no NAICS description is stored.
    const topIndustries: any = await db.execute(sql`
      SELECT
        COALESCE(primary_naics_description, primary_naics, 'Unclassified') AS label,
        COUNT(*)::int AS count
      FROM factories
      WHERE state = ${code} AND primary_naics IS NOT NULL
      GROUP BY label
      ORDER BY count DESC
      LIMIT 8
    `);

    res.json({
      code,
      totalFactories: totalsRow?.totalFactories ?? 0,
      totalCompanies: totalsRow?.totalCompanies ?? 0,
      totalWorkforce: totalsRow?.totalWorkforce ?? 0,
      topCompanies: Array.from(topCompanies).map((r: any) => ({ id: r.id, name: r.name, count: r.count })),
      topIndustries: Array.from(topIndustries).map((r: any) => ({ label: r.label, count: r.count })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// State factory counts — for the continental-zoom choropleth
app.get('/api/map/state-counts', async (_req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });
  try {
    const rows = await db
      .select({ state: factories.state, count: count() })
      .from(factories)
      .where(sql`${factories.state} IS NOT NULL`)
      .groupBy(factories.state);
    const out: Record<string, number> = {};
    for (const r of rows) if (r.state) out[r.state] = r.count;
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stats counts
app.get('/api/stats/counts', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    // Same junk-name filter as the Companies list — the headline count
    // should reflect what the user can actually browse, not the inflated
    // bulk-import total.
    const companyNameFilter = and(
      sql`${companies.name} ~ '[A-Za-z]{2,}'`,
      sql`${companies.name} NOT LIKE '#%'`,
      sql`${companies.name} NOT LIKE '(%'`,
    );
    const [companyCount, factoryCount, occupationCount, skillCount, refCount, schoolCount, programCount, personCount] = await Promise.all([
      db.select({ count: count() }).from(companies).where(companyNameFilter),
      db.select({ count: count() }).from(factories),
      db.select({ count: count() }).from(occupations),
      db.select({ count: count() }).from(skills),
      db.select({ count: count() }).from(refs),
      db.select({ count: count() }).from(schools),
      db.select({ count: count() }).from(programs),
      db.select({ count: count() }).from(persons),
    ]);

    const c = companyCount[0]?.count ?? 0;
    const f = factoryCount[0]?.count ?? 0;
    const o = occupationCount[0]?.count ?? 0;
    const s = skillCount[0]?.count ?? 0;
    const r = refCount[0]?.count ?? 0;
    const sch = schoolCount[0]?.count ?? 0;
    const p = programCount[0]?.count ?? 0;
    const pr = personCount[0]?.count ?? 0;
    res.json({
      companies: c,
      factories: f,
      occupations: o,
      skills: s,
      refs: r,
      schools: sch,
      programs: p,
      persons: pr,
      total: c + f + o + s + r + sch + p,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Companies list (offset-based pagination with filters and sorting)
app.get('/api/companies', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { offset = '0', limit = '20', search, industry, sort = 'name', order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    const conditions: any[] = [];
    // Exclude obvious junk names that got imported as companies — pure
    // numeric facility codes (0145000399), hash-prefixed IDs (#1110),
    // lone paren leaders ((former Woods...), or names with no letters.
    // These are artifacts of the bulk Pillar import where some facilities
    // had addresses or numeric codes in the company_name column.
    conditions.push(sql`${companies.name} ~ '[A-Za-z]{2,}'`);
    conditions.push(sql`${companies.name} NOT LIKE '#%'`);
    conditions.push(sql`${companies.name} NOT LIKE '(%'`);
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(or(ilike(companies.name, searchTerm), ilike(companies.industry, searchTerm)));
    }
    if (industry) {
      conditions.push(eq(companies.industry, industry as string));
    }

    // Get total count for pagination info
    const [countResult] = await db
      .select({ total: count() })
      .from(companies)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined);

    const total = countResult?.total ?? 0;

    // Build order by clause
    let orderByClause;
    if (sort === 'factoryCount') {
      orderByClause = order === 'desc'
        ? sql`(SELECT COUNT(*) FROM factories WHERE factories.company_id = companies.id) DESC, ${companies.name} ASC`
        : sql`(SELECT COUNT(*) FROM factories WHERE factories.company_id = companies.id) ASC, ${companies.name} ASC`;
    } else {
      orderByClause = order === 'desc'
        ? sql`${companies.name} DESC`
        : sql`${companies.name} ASC`;
    }

    const result = await db
      .select({
        id: companies.id,
        name: companies.name,
        industry: companies.industry,
        description: companies.description,
        createdAt: companies.createdAt,
        factoryCount: sql<number>`(SELECT COUNT(*)::int FROM factories WHERE factories.company_id = companies.id)`,
      })
      .from(companies)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined)
      .orderBy(orderByClause)
      .limit(limitNum)
      .offset(offsetNum);

    const hasMore = offsetNum + result.length < total;

    res.json({
      data: result,
      total,
      offset: offsetNum,
      limit: limitNum,
      hasMore,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Factories list (offset-based pagination with filters and sorting)
app.get('/api/factories', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { offset = '0', limit = '20', search, state, company, industry, sort = 'name', order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    const conditions: any[] = [];
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(or(
        ilike(factories.name, searchTerm),
        ilike(factories.specialization, searchTerm),
        ilike(factories.state, searchTerm)
      ));
    }
    if (state) {
      conditions.push(eq(factories.state, state as string));
    }
    if (company) {
      conditions.push(eq(factories.companyId, company as string));
    }
    if (industry) {
      // industry maps to specialization in factories
      conditions.push(eq(factories.specialization, industry as string));
    }

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(factories)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined);

    const total = countResult?.total ?? 0;

    // Build order by clause
    let orderByClause;
    if (sort === 'workforceSize') {
      orderByClause = order === 'desc'
        ? sql`${factories.workforceSize} DESC NULLS LAST, ${factories.name} ASC`
        : sql`${factories.workforceSize} ASC NULLS LAST, ${factories.name} ASC`;
    } else {
      orderByClause = order === 'desc'
        ? sql`${factories.name} DESC`
        : sql`${factories.name} ASC`;
    }

    const result = await db
      .select({
        id: factories.id,
        name: factories.name,
        companyId: factories.companyId,
        specialization: factories.specialization,
        state: factories.state,
        workforceSize: factories.workforceSize,
        openPositions: factories.openPositions,
        latitude: factories.latitude,
        longitude: factories.longitude,
        createdAt: factories.createdAt,
      })
      .from(factories)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined)
      .orderBy(orderByClause)
      .limit(limitNum)
      .offset(offsetNum);

    const hasMore = offsetNum + result.length < total;

    res.json({
      data: result,
      total,
      offset: offsetNum,
      limit: limitNum,
      hasMore,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Factories GeoJSON (with optional filters)
app.get('/api/factories/geojson', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { company, states, industry, bounds } = req.query;

    // Build filter conditions
    const conditions: any[] = [
      sql`${factories.latitude} IS NOT NULL AND ${factories.longitude} IS NOT NULL`
    ];

    if (company) {
      conditions.push(eq(factories.companyId, company as string));
    }

    if (states) {
      // States can be comma-separated list
      const stateList = (states as string).split(',').map(s => s.trim()).filter(Boolean);
      if (stateList.length > 0) {
        conditions.push(sql`${factories.state} IN (${sql.join(stateList.map(s => sql`${s}`), sql`, `)})`);
      }
    }

    if (industry) {
      conditions.push(eq(factories.specialization, industry as string));
    }

    // Viewport bounds filter: "minLng,minLat,maxLng,maxLat"
    if (bounds) {
      const [minLng, minLat, maxLng, maxLat] = (bounds as string).split(',').map(Number);
      if (!isNaN(minLng) && !isNaN(minLat) && !isNaN(maxLng) && !isNaN(maxLat)) {
        conditions.push(sql`CAST(${factories.longitude} AS DECIMAL) >= ${minLng}`);
        conditions.push(sql`CAST(${factories.longitude} AS DECIMAL) <= ${maxLng}`);
        conditions.push(sql`CAST(${factories.latitude} AS DECIMAL) >= ${minLat}`);
        conditions.push(sql`CAST(${factories.latitude} AS DECIMAL) <= ${maxLat}`);
      }
    }

    // Minimal select — the map only needs id + coords. Richer attributes
    // (name, workforce, company) load via /api/factories/:id on click.
    const result = await db
      .select({
        id: factories.id,
        latitude: factories.latitude,
        longitude: factories.longitude,
      })
      .from(factories)
      .where(sql`${sql.join(conditions, sql` AND `)}`);

    // Minimal shape: round coords to 4 decimals (~11m) and keep id only in
    // properties. The client source uses `promoteId: 'id'` to lift it for
    // feature-state lookups — MapLibre ignores string ids at the top level,
    // so property-based id is the smallest valid shape.
    const features = result.map((f) => ({
      type: 'Feature' as const,
      properties: { id: f.id },
      geometry: {
        type: 'Point' as const,
        coordinates: [
          Math.round(parseFloat(f.longitude!) * 10000) / 10000,
          Math.round(parseFloat(f.latitude!) * 10000) / 10000,
        ],
      },
    }));

    res.json({ type: 'FeatureCollection', features });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Occupations list (offset-based pagination)
app.get('/api/occupations', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { offset = '0', limit = '20', search } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    const conditions: any[] = [];
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(ilike(occupations.title, searchTerm));
    }

    const [countResult] = await db
      .select({ total: count() })
      .from(occupations)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined);

    const total = countResult?.total ?? 0;

    const result = await db
      .select()
      .from(occupations)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined)
      .orderBy(occupations.title)
      .limit(limitNum)
      .offset(offsetNum);

    const hasMore = offsetNum + result.length < total;

    res.json({ data: result, total, offset: offsetNum, limit: limitNum, hasMore });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Skills list (offset-based pagination)
app.get('/api/skills', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { offset = '0', limit = '20', search, category } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    const conditions: any[] = [];
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(or(ilike(skills.name, searchTerm), ilike(skills.category, searchTerm)));
    }
    if (category) {
      conditions.push(eq(skills.category, category as string));
    }

    const [countResult] = await db
      .select({ total: count() })
      .from(skills)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined);

    const total = countResult?.total ?? 0;

    const result = await db
      .select()
      .from(skills)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined)
      .orderBy(skills.name)
      .limit(limitNum)
      .offset(offsetNum);

    const hasMore = offsetNum + result.length < total;

    res.json({ data: result, total, offset: offsetNum, limit: limitNum, hasMore });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Factory detail
app.get('/api/factories/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid factory ID format' });
  }

  try {
    const result = await db
      .select({
        id: factories.id,
        name: factories.name,
        companyId: factories.companyId,
        specialization: factories.specialization,
        description: factories.description,
        latitude: factories.latitude,
        longitude: factories.longitude,
        state: factories.state,
        workforceSize: factories.workforceSize,
        openPositions: factories.openPositions,
        createdAt: factories.createdAt,
      })
      .from(factories)
      .where(eq(factories.id, id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Factory not found' });
    }

    const factory = result[0];

    // Get company if linked
    let company = null;
    if (factory.companyId) {
      const companyResult = await db
        .select({ id: companies.id, name: companies.name, industry: companies.industry })
        .from(companies)
        .where(eq(companies.id, factory.companyId))
        .limit(1);
      company = companyResult[0] || null;
    }

    // Get occupations at this factory via junction table
    const factoryOccupationsList = await db
      .select({
        id: occupations.id,
        title: occupations.title,
        onetCode: occupations.onetCode,
        headcount: factoryOccupations.headcount,
        avgSalaryMin: factoryOccupations.avgSalaryMin,
        avgSalaryMax: factoryOccupations.avgSalaryMax,
      })
      .from(factoryOccupations)
      .innerJoin(occupations, eq(factoryOccupations.occupationId, occupations.id))
      .where(eq(factoryOccupations.factoryId, id));

    res.json({
      ...factory,
      company,
      occupations: factoryOccupationsList,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Company detail
app.get('/api/companies/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid company ID format' });
  }

  try {
    const result = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = result[0];

    // Get factories for this company (include coordinates for map fly-to)
    const factoryList = await db
      .select({
        id: factories.id,
        name: factories.name,
        state: factories.state,
        specialization: factories.specialization,
        workforceSize: factories.workforceSize,
        openPositions: factories.openPositions,
        latitude: factories.latitude,
        longitude: factories.longitude,
      })
      .from(factories)
      .where(eq(factories.companyId, id))
      .orderBy(factories.name);

    // Get industries for this company via junction table
    const companyIndustriesList = await db
      .select({
        id: industries.id,
        name: industries.name,
      })
      .from(companyIndustries)
      .innerJoin(industries, eq(companyIndustries.industryId, industries.id))
      .where(eq(companyIndustries.companyId, id));

    res.json({
      ...company,
      factories: factoryList,
      industries: companyIndustriesList,
      factoryCount: factoryList.length,
      totalWorkforce: factoryList.reduce((sum, f) => sum + (f.workforceSize || 0), 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Occupation detail
app.get('/api/occupations/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid occupation ID format' });
  }

  try {
    const result = await db
      .select()
      .from(occupations)
      .where(eq(occupations.id, id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Occupation not found' });
    }

    const occupation = result[0];

    // Get skills required for this occupation via junction table
    const occupationSkillsList = await db
      .select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        importance: occupationSkills.importance,
      })
      .from(occupationSkills)
      .innerJoin(skills, eq(occupationSkills.skillId, skills.id))
      .where(eq(occupationSkills.occupationId, id));

    // Get factories hiring this occupation via junction table (include coordinates for map fly-to)
    const occupationFactoriesList = await db
      .select({
        id: factories.id,
        name: factories.name,
        state: factories.state,
        companyId: factories.companyId,
        companyName: sql<string>`(SELECT name FROM companies WHERE companies.id = ${factories.companyId})`,
        headcount: factoryOccupations.headcount,
        avgSalaryMin: factoryOccupations.avgSalaryMin,
        avgSalaryMax: factoryOccupations.avgSalaryMax,
        latitude: factories.latitude,
        longitude: factories.longitude,
      })
      .from(factoryOccupations)
      .innerJoin(factories, eq(factoryOccupations.factoryId, factories.id))
      .where(eq(factoryOccupations.occupationId, id));

    res.json({
      ...occupation,
      skills: occupationSkillsList,
      factories: occupationFactoriesList,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Skill detail
app.get('/api/skills/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid skill ID format' });
  }

  try {
    const result = await db
      .select()
      .from(skills)
      .where(eq(skills.id, id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    const skill = result[0];

    // Get occupations that require this skill via junction table
    const skillOccupationsList = await db
      .select({
        id: occupations.id,
        title: occupations.title,
        onetCode: occupations.onetCode,
        importance: occupationSkills.importance,
      })
      .from(occupationSkills)
      .innerJoin(occupations, eq(occupationSkills.occupationId, occupations.id))
      .where(eq(occupationSkills.skillId, id));

    // Get related skills (same category)
    let relatedSkills: any[] = [];
    if (skill.category) {
      relatedSkills = await db
        .select({ id: skills.id, name: skills.name, category: skills.category })
        .from(skills)
        .where(and(eq(skills.category, skill.category), ne(skills.id, id)))
        .orderBy(skills.name)
        .limit(10);
    }

    res.json({
      ...skill,
      occupations: skillOccupationsList,
      relatedSkills,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Global search
app.get('/api/search', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { q, types, limit = '5' } = req.query;
    const query = (q as string || '').trim();

    if (!query) {
      return res.json({
        query: '',
        results: {
          companies: { count: 0, items: [] },
          factories: { count: 0, items: [] },
          occupations: { count: 0, items: [] },
          skills: { count: 0, items: [] },
          states: { count: 0, items: [] },
        },
        totalCount: 0,
      });
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 5, 20);
    const searchTerm = `%${query}%`;
    const typeFilter = types ? (types as string).split(',') : null;

    const shouldSearch = (type: string) => !typeFilter || typeFilter.includes(type);

    // Search companies — same junk-name filter as the list endpoint
    let companyResults: any[] = [];
    let companyCount = 0;
    if (shouldSearch('companies')) {
      const nameFilter = and(
        sql`${companies.name} ~ '[A-Za-z]{2,}'`,
        sql`${companies.name} NOT LIKE '#%'`,
        sql`${companies.name} NOT LIKE '(%'`,
      );
      const searchFilter = or(ilike(companies.name, searchTerm), ilike(companies.industry, searchTerm));
      const [countRes, dataRes] = await Promise.all([
        db.select({ count: count() }).from(companies)
          .where(and(nameFilter, searchFilter)),
        db.select({ id: companies.id, name: companies.name, industry: companies.industry })
          .from(companies)
          .where(and(nameFilter, searchFilter))
          .orderBy(companies.name)
          .limit(limitNum),
      ]);
      companyCount = countRes[0]?.count ?? 0;
      companyResults = dataRes.map(c => ({
        id: c.id,
        name: c.name,
        type: 'companies' as const,
        subtitle: c.industry,
      }));
    }

    // Search factories
    let factoryResults: any[] = [];
    let factoryCount = 0;
    if (shouldSearch('factories')) {
      const [countRes, dataRes] = await Promise.all([
        db.select({ count: count() }).from(factories)
          .where(or(ilike(factories.name, searchTerm), ilike(factories.specialization, searchTerm), ilike(factories.state, searchTerm))),
        db.select({ id: factories.id, name: factories.name, state: factories.state, specialization: factories.specialization })
          .from(factories)
          .where(or(ilike(factories.name, searchTerm), ilike(factories.specialization, searchTerm), ilike(factories.state, searchTerm)))
          .orderBy(factories.name)
          .limit(limitNum),
      ]);
      factoryCount = countRes[0]?.count ?? 0;
      factoryResults = dataRes.map(f => ({
        id: f.id,
        name: f.name,
        type: 'factories' as const,
        subtitle: f.specialization,
        meta: f.state,
      }));
    }

    // Search occupations
    let occupationResults: any[] = [];
    let occupationCount = 0;
    if (shouldSearch('occupations')) {
      const [countRes, dataRes] = await Promise.all([
        db.select({ count: count() }).from(occupations)
          .where(ilike(occupations.title, searchTerm)),
        db.select({ id: occupations.id, title: occupations.title })
          .from(occupations)
          .where(ilike(occupations.title, searchTerm))
          .orderBy(occupations.title)
          .limit(limitNum),
      ]);
      occupationCount = countRes[0]?.count ?? 0;
      // O*NET code intentionally omitted from search `meta` — it's a
      // reference taxonomy, not a user-facing identifier. Shows only on
      // occupation detail pages as a small tag.
      occupationResults = dataRes.map(o => ({
        id: o.id,
        name: o.title,
        type: 'occupations' as const,
      }));
    }

    // Search skills
    let skillResults: any[] = [];
    let skillCount = 0;
    if (shouldSearch('skills')) {
      const [countRes, dataRes] = await Promise.all([
        db.select({ count: count() }).from(skills)
          .where(or(ilike(skills.name, searchTerm), ilike(skills.category, searchTerm))),
        db.select({ id: skills.id, name: skills.name, category: skills.category })
          .from(skills)
          .where(or(ilike(skills.name, searchTerm), ilike(skills.category, searchTerm)))
          .orderBy(skills.name)
          .limit(limitNum),
      ]);
      skillCount = countRes[0]?.count ?? 0;
      skillResults = dataRes.map(s => ({
        id: s.id,
        name: s.name,
        type: 'skills' as const,
        subtitle: s.category,
      }));
    }

    // Search states
    let stateResults: any[] = [];
    let stateCount = 0;
    if (shouldSearch('states')) {
      const [countRes, dataRes] = await Promise.all([
        db.select({ count: count() }).from(states)
          .where(or(ilike(states.name, searchTerm), ilike(states.code, searchTerm))),
        db.select({ id: states.id, name: states.name, code: states.code })
          .from(states)
          .where(or(ilike(states.name, searchTerm), ilike(states.code, searchTerm)))
          .orderBy(states.name)
          .limit(limitNum),
      ]);
      stateCount = countRes[0]?.count ?? 0;
      stateResults = dataRes.map(s => ({
        id: s.code,
        name: s.name,
        type: 'states' as const,
        meta: s.code,
      }));
    }

    res.json({
      query,
      results: {
        companies: { count: companyCount, items: companyResults },
        factories: { count: factoryCount, items: factoryResults },
        occupations: { count: occupationCount, items: occupationResults },
        skills: { count: skillCount, items: skillResults },
        states: { count: stateCount, items: stateResults },
      },
      totalCount: companyCount + factoryCount + occupationCount + skillCount + stateCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Refs list (filter by type, search)
app.get('/api/refs', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { offset = '0', limit = '20', search, type } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);
    const conditions: any[] = [];
    if (search) conditions.push(or(ilike(refs.name, `%${search}%`), ilike(refs.description, `%${search}%`)));
    if (type) conditions.push(eq(refs.type, type as string));
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const [countRes] = await db.select({ total: count() }).from(refs).where(whereClause);
    const total = countRes?.total ?? 0;
    const result = await db.select().from(refs).where(whereClause).orderBy(refs.name).limit(limitNum).offset(offsetNum);
    res.json({ data: result, total, offset: offsetNum, limit: limitNum, hasMore: offsetNum + result.length < total });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Ref detail
app.get('/api/refs/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid ref ID' });
  try {
    const [r] = await db.select().from(refs).where(eq(refs.id, id)).limit(1);
    if (!r) return res.status(404).json({ error: 'Ref not found' });
    const linkedSkills = await db.select({ id: skills.id, name: skills.name, category: skills.category })
      .from(skillRefs).innerJoin(skills, eq(skillRefs.skillId, skills.id))
      .where(eq(skillRefs.refId, id));
    res.json({ ...r, skills: linkedSkills });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Schools list
app.get('/api/schools', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { offset = '0', limit = '20', search, state } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);
    const conditions: any[] = [];
    if (search) conditions.push(or(ilike(schools.name, `%${search}%`), ilike(schools.description, `%${search}%`)));
    if (state) conditions.push(eq(schools.state, state as string));
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const [countRes] = await db.select({ total: count() }).from(schools).where(whereClause);
    const total = countRes?.total ?? 0;
    const result = await db
      .select({
        id: schools.id, name: schools.name, description: schools.description,
        state: schools.state, schoolType: schools.schoolType, createdAt: schools.createdAt,
        programCount: sql<number>`(SELECT COUNT(*)::int FROM programs WHERE programs.school_id = schools.id)`,
      })
      .from(schools).where(whereClause).orderBy(schools.name).limit(limitNum).offset(offsetNum);
    res.json({ data: result, total, offset: offsetNum, limit: limitNum, hasMore: offsetNum + result.length < total });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// School detail
app.get('/api/schools/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid school ID' });
  try {
    const [s] = await db.select().from(schools).where(eq(schools.id, id)).limit(1);
    if (!s) return res.status(404).json({ error: 'School not found' });
    const schoolPrograms = await db
      .select({ id: programs.id, title: programs.title, credentialType: programs.credentialType, cipCode: programs.cipCode })
      .from(programs).where(eq(programs.schoolId, id)).orderBy(programs.title);
    res.json({ ...s, programs: schoolPrograms });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Programs list
app.get('/api/programs', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { offset = '0', limit = '20', search, schoolId } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);
    const conditions: any[] = [];
    if (search) conditions.push(or(ilike(programs.title, `%${search}%`), ilike(programs.description, `%${search}%`)));
    if (schoolId) conditions.push(eq(programs.schoolId, schoolId as string));
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const [countRes] = await db.select({ total: count() }).from(programs).where(whereClause);
    const total = countRes?.total ?? 0;
    const result = await db
      .select({
        id: programs.id, title: programs.title, description: programs.description,
        credentialType: programs.credentialType, durationHours: programs.durationHours,
        schoolId: programs.schoolId,
        schoolName: sql<string>`(SELECT name FROM schools WHERE schools.id = programs.school_id)`,
        skillCount: sql<number>`(SELECT COUNT(*)::int FROM program_skills WHERE program_skills.program_id = programs.id)`,
      })
      .from(programs).where(whereClause).orderBy(programs.title).limit(limitNum).offset(offsetNum);
    res.json({ data: result, total, offset: offsetNum, limit: limitNum, hasMore: offsetNum + result.length < total });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Program detail
app.get('/api/programs/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid program ID' });
  try {
    const [p] = await db.select().from(programs).where(eq(programs.id, id)).limit(1);
    if (!p) return res.status(404).json({ error: 'Program not found' });
    let school = null;
    if (p.schoolId) {
      const [s] = await db.select({ id: schools.id, name: schools.name, state: schools.state }).from(schools).where(eq(schools.id, p.schoolId)).limit(1);
      school = s || null;
    }
    const programSkillList = await db
      .select({ id: skills.id, name: skills.name, category: skills.category, importance: programSkills.importance })
      .from(programSkills).innerJoin(skills, eq(programSkills.skillId, skills.id))
      .where(eq(programSkills.programId, id));
    res.json({ ...p, school, skills: programSkillList });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not found', path: req.path });
});

// ========== VERCEL HANDLER ==========
export default async function handler(req: any, res: any) {
  // Extract the actual path from query param (set by rewrite)
  const pathParam = req.query.path;
  const subPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');

  // Reconstruct the URL for Express
  const queryString = req.url?.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  req.url = `/api/${subPath}${queryString}`;

  // Remove the path param
  delete req.query.path;

  return app(req, res);
}
