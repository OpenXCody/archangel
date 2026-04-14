// Vercel Serverless API - Inline handlers (no external imports from server/)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, gt, ilike, or, sql, count } from 'drizzle-orm';
import {
  pgTable, uuid, text, integer, timestamp, pgEnum, index, uniqueIndex, primaryKey, varchar,
} from 'drizzle-orm/pg-core';

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

// Health check
app.get('/api/health', async (req, res) => {
  res.json({
    status: db ? 'ok' : 'no-db',
    timestamp: new Date().toISOString(),
    hasDbUrl: !!connectionString,
  });
});

// Stats counts
app.get('/api/stats/counts', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const [companyCount, factoryCount, occupationCount, skillCount] = await Promise.all([
      db.select({ count: count() }).from(companies),
      db.select({ count: count() }).from(factories),
      db.select({ count: count() }).from(occupations),
      db.select({ count: count() }).from(skills),
    ]);

    res.json({
      companies: companyCount[0]?.count ?? 0,
      factories: factoryCount[0]?.count ?? 0,
      occupations: occupationCount[0]?.count ?? 0,
      skills: skillCount[0]?.count ?? 0,
      total: (companyCount[0]?.count ?? 0) + (factoryCount[0]?.count ?? 0) +
             (occupationCount[0]?.count ?? 0) + (skillCount[0]?.count ?? 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Companies list
app.get('/api/companies', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { cursor, limit = '20', search } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);

    const conditions: any[] = [];
    if (cursor) conditions.push(gt(companies.id, cursor as string));
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(or(ilike(companies.name, searchTerm), ilike(companies.industry, searchTerm)));
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
      .orderBy(sql`(SELECT COUNT(*) FROM factories WHERE factories.company_id = companies.id) DESC`, companies.name)
      .limit(limitNum + 1);

    const hasMore = result.length > limitNum;
    const data = hasMore ? result.slice(0, limitNum) : result;

    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Factories list
app.get('/api/factories', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { cursor, limit = '20' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);

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
      .where(cursor ? gt(factories.id, cursor as string) : undefined)
      .orderBy(factories.name)
      .limit(limitNum + 1);

    const hasMore = result.length > limitNum;
    const data = hasMore ? result.slice(0, limitNum) : result;

    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Factories GeoJSON
app.get('/api/factories/geojson', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const result = await db
      .select({
        id: factories.id,
        name: factories.name,
        latitude: factories.latitude,
        longitude: factories.longitude,
        state: factories.state,
        workforceSize: factories.workforceSize,
        companyId: factories.companyId,
      })
      .from(factories)
      .where(sql`${factories.latitude} IS NOT NULL AND ${factories.longitude} IS NOT NULL`);

    const features = result.map((f) => ({
      type: 'Feature' as const,
      id: f.id,
      properties: {
        id: f.id,
        name: f.name,
        state: f.state,
        workforceSize: f.workforceSize,
        companyId: f.companyId,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [parseFloat(f.longitude!), parseFloat(f.latitude!)],
      },
    }));

    res.json({ type: 'FeatureCollection', features });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Occupations list
app.get('/api/occupations', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { cursor, limit = '20' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);

    const result = await db
      .select()
      .from(occupations)
      .where(cursor ? gt(occupations.id, cursor as string) : undefined)
      .orderBy(occupations.title)
      .limit(limitNum + 1);

    const hasMore = result.length > limitNum;
    const data = hasMore ? result.slice(0, limitNum) : result;

    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Skills list
app.get('/api/skills', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { cursor, limit = '20' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);

    const result = await db
      .select()
      .from(skills)
      .where(cursor ? gt(skills.id, cursor as string) : undefined)
      .orderBy(skills.name)
      .limit(limitNum + 1);

    const hasMore = result.length > limitNum;
    const data = hasMore ? result.slice(0, limitNum) : result;

    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Factory detail
app.get('/api/factories/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { id } = req.params;
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

    res.json({ ...factory, company });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Company detail
app.get('/api/companies/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { id } = req.params;
    const result = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = result[0];

    // Get factories for this company
    const factoryList = await db
      .select({
        id: factories.id,
        name: factories.name,
        state: factories.state,
        specialization: factories.specialization,
        workforceSize: factories.workforceSize,
      })
      .from(factories)
      .where(eq(factories.companyId, id))
      .orderBy(factories.name);

    res.json({ ...company, factories: factoryList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Occupation detail
app.get('/api/occupations/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { id } = req.params;
    const result = await db
      .select()
      .from(occupations)
      .where(eq(occupations.id, id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Occupation not found' });
    }

    res.json(result[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Skill detail
app.get('/api/skills/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not connected' });

  try {
    const { id } = req.params;
    const result = await db
      .select()
      .from(skills)
      .where(eq(skills.id, id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    res.json(result[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not found', path: req.path });
});

// ========== VERCEL HANDLER ==========
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
