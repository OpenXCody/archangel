import { Router, Request, Response } from 'express';
import { eq, sql, isNull, and, desc } from 'drizzle-orm';
import { db, factories, companies, factoryReview, factoriesQuarantine, externalReferences, entityLinks, factoryOccupations } from '../db/index.js';
import { uuidParam } from '../middleware/validateUuid.js';

/**
 * Manual review queue for factories the NAICS enrichment couldn't verify
 * (no NAICS at EPA, or only a non-manufacturing one). Admin-only; mounted
 * behind requireAdmin in server/app.ts.
 */
const router = Router();
router.param('id', uuidParam);

// GET /api/review/summary — counts by reason, pending vs resolved
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        reason: factoryReview.reason,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${factoryReview.resolvedAt} IS NULL)::int`,
        resolved: sql<number>`COUNT(*) FILTER (WHERE ${factoryReview.resolvedAt} IS NOT NULL)::int`,
      })
      .from(factoryReview)
      .groupBy(factoryReview.reason);
    const [q] = await db.select({ quarantined: sql<number>`COUNT(*)::int` }).from(factoriesQuarantine);
    res.json({ byReason: rows, quarantined: q?.quarantined ?? 0 });
  } catch (error) {
    console.error('Error fetching review summary:', error);
    res.status(500).json({ error: 'Failed to fetch review summary' });
  }
});

// GET /api/review?status=pending|resolved&reason=…&limit=&offset=
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status = 'pending', reason, limit = '50', offset = '0' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);
    const conditions = [status === 'resolved' ? sql`${factoryReview.resolvedAt} IS NOT NULL` : isNull(factoryReview.resolvedAt)];
    if (typeof reason === 'string' && reason) conditions.push(eq(factoryReview.reason, reason));
    const where = and(...conditions);

    const [count] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(factoryReview).where(where);
    const items = await db
      .select({
        factoryId: factoryReview.factoryId,
        reason: factoryReview.reason,
        naics: factoryReview.naics,
        naicsAll: factoryReview.naicsAll,
        sicAll: factoryReview.sicAll,
        createdAt: factoryReview.createdAt,
        resolvedAt: factoryReview.resolvedAt,
        resolution: factoryReview.resolution,
        name: factories.name,
        state: factories.state,
        city: factories.city,
        naicsDescription: factories.primaryNaicsDescription,
        companyId: factories.companyId,
        companyName: companies.name,
        registryId: sql<string | null>`(SELECT external_id FROM external_references er WHERE er.entity_type = 'factories' AND er.entity_id = ${factories.id} AND er.source = 'EPA_ECHO' LIMIT 1)`,
      })
      .from(factoryReview)
      .innerJoin(factories, eq(factoryReview.factoryId, factories.id))
      .leftJoin(companies, eq(factories.companyId, companies.id))
      .where(where)
      .orderBy(desc(factoryReview.createdAt), factories.name)
      .limit(limitNum)
      .offset(offsetNum);

    res.json({ data: items, total: count?.total ?? 0, offset: offsetNum, limit: limitNum, hasMore: offsetNum + items.length < (count?.total ?? 0) });
  } catch (error) {
    console.error('Error fetching review queue:', error);
    res.status(500).json({ error: 'Failed to fetch review queue' });
  }
});

// POST /api/review/:id  { resolution: 'keep' | 'quarantine' }
router.post('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const resolution = req.body?.resolution as string | undefined;
  if (resolution !== 'keep' && resolution !== 'quarantine') {
    res.status(400).json({ error: "resolution must be 'keep' or 'quarantine'" });
    return;
  }
  try {
    const [item] = await db.select().from(factoryReview).where(eq(factoryReview.factoryId, id)).limit(1);
    if (!item) { res.status(404).json({ error: 'Not in the review queue' }); return; }

    await db.transaction(async (tx) => {
      if (resolution === 'quarantine') {
        const [row] = await tx.select().from(factories).where(eq(factories.id, id)).limit(1);
        if (row) {
          const refs = await tx.select().from(externalReferences).where(and(eq(externalReferences.entityType, 'factories'), eq(externalReferences.entityId, id)));
          const occ = await tx.select().from(factoryOccupations).where(eq(factoryOccupations.factoryId, id));
          await tx.insert(factoriesQuarantine)
            .values({ id, reason: `review: ${item.reason} (${item.naics ?? 'no NAICS'})`, row, externalRefs: refs, occupationLinks: occ })
            .onConflictDoNothing();
          await tx.delete(externalReferences).where(and(eq(externalReferences.entityType, 'factories'), eq(externalReferences.entityId, id)));
          await tx.delete(entityLinks).where(and(eq(entityLinks.entityType, 'factories'), eq(entityLinks.entityId, id)));
          // factory_review row cascades away with the factory; record the decision first
          await tx.update(factoryReview).set({ resolvedAt: new Date(), resolution }).where(eq(factoryReview.factoryId, id));
          await tx.delete(factories).where(eq(factories.id, id));
        }
      } else {
        await tx.update(factoryReview).set({ resolvedAt: new Date(), resolution }).where(eq(factoryReview.factoryId, id));
      }
    });
    res.json({ ok: true, factoryId: id, resolution });
  } catch (error) {
    console.error('Error resolving review item:', error);
    res.status(500).json({ error: 'Failed to resolve review item' });
  }
});

export default router;
