import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { parseFile, suggestColumnMappings, ParsedFile } from '../lib/parsers';
import {
  validateRows,
  mapRowsToFields,
  prepareForInsert,
  EntityType,
} from '../lib/validators';
import { db, companies, factories, occupations, skills, importBatches, errorQueue, states, externalReferences, importUploads } from '../db';
import { eq, desc, ilike, and, lt } from 'drizzle-orm';

const router = Router();

// Uploads land in the OS temp dir (the only writable location on Vercel)
// and are deleted as soon as they've been parsed.
const uploadDir = path.join(os.tmpdir(), 'archangel-uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(uploadDir, { recursive: true }, (err) => cb(err, uploadDir));
  },
  filename: (_req, file, cb) => {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`));
    }
  },
});

// Parsed uploads live in Postgres between the parse → map → validate →
// execute steps, so the flow works across serverless instances. Rows older
// than this are swept on the next upload.
const UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

async function saveParsed(parsed: ParsedFile): Promise<void> {
  await db.insert(importUploads).values({
    id: parsed.fileId,
    fileName: parsed.fileName,
    rowCount: parsed.rowCount,
    payload: parsed,
  });
}

async function loadParsed(fileId: string): Promise<ParsedFile | null> {
  if (typeof fileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const [row] = await db.select({ payload: importUploads.payload })
    .from(importUploads)
    .where(eq(importUploads.id, fileId))
    .limit(1);
  return row ? (row.payload as ParsedFile) : null;
}

async function deleteParsed(fileId: string): Promise<void> {
  await db.delete(importUploads).where(eq(importUploads.id, fileId));
}

async function sweepExpiredUploads(): Promise<void> {
  const cutoff = new Date(Date.now() - UPLOAD_TTL_MS);
  await db.delete(importUploads).where(lt(importUploads.createdAt, cutoff));
}

// POST /api/import/parse - Upload and parse file
router.post('/parse', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const fileId = crypto.randomUUID();
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const sheetName = req.body.sheetName;

    let parsed: ParsedFile;
    try {
      parsed = parseFile(filePath, fileName, fileId, { sheetName });
    } finally {
      // The parsed rows are what we keep; the file itself is done.
      fs.promises.unlink(filePath).catch(() => undefined);
    }

    await sweepExpiredUploads().catch((err) => console.warn('Upload sweep failed:', err));
    await saveParsed(parsed);

    // Return preview (without full data)
    res.json({
      fileId: parsed.fileId,
      fileName: parsed.fileName,
      rowCount: parsed.rowCount,
      columns: parsed.columns,
      sampleRows: parsed.sampleRows,
      sheets: parsed.sheets,
    });
  } catch (error) {
    console.error('Parse error:', error);
    const message = error instanceof Error ? error.message : 'Failed to parse file';
    res.status(400).json({ error: message });
  }
});

// POST /api/import/map - Get column mapping suggestions
router.post('/map', async (req: Request, res: Response) => {
  try {
    const { fileId, entityType } = req.body;

    if (!fileId || !entityType) {
      res.status(400).json({ error: 'fileId and entityType are required' });
      return;
    }

    const validEntityTypes = ['companies', 'factories', 'occupations', 'skills'];
    if (!validEntityTypes.includes(entityType)) {
      res.status(400).json({ error: `Invalid entity type. Must be one of: ${validEntityTypes.join(', ')}` });
      return;
    }

    const parsed = await loadParsed(fileId);
    if (!parsed) {
      res.status(404).json({ error: 'File not found. Please upload the file again.' });
      return;
    }

    const suggestions = suggestColumnMappings(parsed.columns, entityType);

    res.json({
      suggestedMappings: suggestions.mappings,
      unmappedColumns: suggestions.unmappedColumns,
      missingRequired: suggestions.missingRequired,
    });
  } catch (error) {
    console.error('Mapping error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate mappings';
    res.status(500).json({ error: message });
  }
});

// POST /api/import/validate - Validate mapped data
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { fileId, entityType, mappings, skipRows = [], transformedData = [] } = req.body;

    if (!fileId || !entityType || !mappings) {
      res.status(400).json({ error: 'fileId, entityType, and mappings are required' });
      return;
    }

    const parsed = await loadParsed(fileId);
    if (!parsed) {
      res.status(404).json({ error: 'File not found. Please upload the file again.' });
      return;
    }

    // Build skip set from transformation step
    const skipRowsSet = new Set<number>(skipRows);

    // Build transformation lookup from transformed data
    const transformLookup = new Map<number, { companyName?: string; factoryName?: string }>();
    for (const t of transformedData) {
      transformLookup.set(t.originalIndex, { companyName: t.companyName, factoryName: t.factoryName });
    }

    // Map source data to target fields, excluding skipped rows and applying transformations
    const rowsToMap = parsed.allRows.filter((_, index) => !skipRowsSet.has(index));
    const mappedRows = mapRowsToFields(rowsToMap, mappings);

    // Apply transformations to mapped rows if entity is factories
    if (entityType === 'factories' && transformLookup.size > 0) {
      for (const row of mappedRows) {
        const transform = transformLookup.get(row.rowNumber);
        if (transform) {
          // If we have a transformed company name, we'll use it during execute
          // For now, just update the name field with the factory name
          if (transform.factoryName) {
            row.data.name = transform.factoryName;
          }
        }
      }
    }

    // Validate all rows
    const validationResult = await validateRows(mappedRows, entityType as EntityType);

    res.json({
      totalRows: validationResult.totalRows,
      validCount: validationResult.validCount,
      warningCount: validationResult.warningCount,
      errorCount: validationResult.errorCount,
      errors: validationResult.errors.slice(0, 100), // Limit errors returned
      potentialDuplicates: validationResult.potentialDuplicates.slice(0, 50),
    });
  } catch (error) {
    console.error('Validation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to validate data';
    res.status(500).json({ error: message });
  }
});

// POST /api/import/execute - Execute import
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { fileId, entityType, mappings, skipRows = [], duplicateResolutions = [], transformedData = [] } = req.body;

    if (!fileId || !entityType || !mappings) {
      res.status(400).json({ error: 'fileId, entityType, and mappings are required' });
      return;
    }

    const parsed = await loadParsed(fileId);
    if (!parsed) {
      res.status(404).json({ error: 'File not found. Please upload the file again.' });
      return;
    }

    const startTime = Date.now();

    // Build transformation lookup from transformed data
    // Now includes companyId for pre-linked companies
    const transformLookup = new Map<number, { companyName?: string; companyId?: string; factoryName?: string }>();
    for (const t of transformedData) {
      transformLookup.set(t.originalIndex, {
        companyName: t.companyName,
        companyId: t.companyId, // Pre-linked company ID from CompanyLinker
        factoryName: t.factoryName,
      });
    }

    // Create or find companies for factories if we have transformation data
    const companyIdLookup = new Map<string, string>();
    if (entityType === 'factories' && transformLookup.size > 0) {
      // Get unique company names that need to be created or looked up
      // Skip those that already have a companyId (already linked)
      const companiesNeedingLookup = new Map<string, string | undefined>();
      for (const t of transformedData) {
        if (t.companyName) {
          // If already linked to an existing company, use that ID
          if (t.companyId) {
            companyIdLookup.set(t.companyName, t.companyId);
          } else {
            // Needs lookup or creation
            companiesNeedingLookup.set(t.companyName, undefined);
          }
        }
      }

      // Find or create companies that weren't pre-linked
      for (const companyName of companiesNeedingLookup.keys()) {
        // Skip if already in lookup (was pre-linked)
        if (companyIdLookup.has(companyName)) continue;

        // Check if company exists
        const existing = await db.select({ id: companies.id })
          .from(companies)
          .where(ilike(companies.name, companyName))
          .limit(1);

        if (existing.length > 0) {
          companyIdLookup.set(companyName, existing[0].id);
        } else {
          // Create new company
          const [newCompany] = await db.insert(companies).values({
            name: companyName,
            industry: 'Manufacturing', // Default industry
          }).returning({ id: companies.id });
          companyIdLookup.set(companyName, newCompany.id);
        }
      }
    }

    // Create import batch record
    const [batch] = await db.insert(importBatches).values({
      fileName: parsed.fileName,
      entityType: entityType as 'companies' | 'factories' | 'occupations' | 'skills',
      totalRows: parsed.rowCount,
      status: 'processing',
    }).returning();

    // Map source data to target fields
    const mappedRows = mapRowsToFields(parsed.allRows, mappings);

    // Validate to get valid/error rows
    const validationResult = await validateRows(mappedRows, entityType as EntityType);

    const skipRowsSet = new Set(skipRows);
    const duplicateRowsToSkip = new Set(
      duplicateResolutions
        .filter((r: { action: string }) => r.action === 'skip')
        .map((r: { incomingRow: number }) => r.incomingRow)
    );

    let created = 0;
    const updated = 0;
    let skipped = 0;
    let errorsQueued = 0;
    const companiesCreated = companyIdLookup.size;

    // Pre-load state code → id for FK resolution (only relevant for factories)
    const stateIdByCode = new Map<string, string>();
    if (entityType === 'factories') {
      const allStates = await db.select({ id: states.id, code: states.code }).from(states);
      for (const s of allStates) {
        stateIdByCode.set(s.code.toUpperCase(), s.id);
      }
    }

    // Pre-load existing EPA registry IDs to dedupe re-imports
    const existingEpaRegistry = new Set<string>();
    if (entityType === 'factories') {
      const existing = await db.select({ externalId: externalReferences.externalId })
        .from(externalReferences)
        .where(and(
          eq(externalReferences.entityType, 'factories'),
          eq(externalReferences.source, 'EPA_ECHO')
        ));
      for (const e of existing) existingEpaRegistry.add(e.externalId);
    }

    // Process valid rows
    for (const { rowNumber, data } of mappedRows) {
      // Skip if user requested or validation failed
      if (skipRowsSet.has(rowNumber) || validationResult.errorRows.includes(rowNumber)) {
        skipped++;
        continue;
      }

      // Skip if duplicate resolution says skip
      if (duplicateRowsToSkip.has(rowNumber)) {
        skipped++;
        continue;
      }

      try {
        // Apply transformations for factories
        if (entityType === 'factories') {
          const transform = transformLookup.get(rowNumber);
          if (transform) {
            // Set the factory name from transformation
            if (transform.factoryName) {
              data.name = transform.factoryName;
            }
            // Link to the company
            if (transform.companyName) {
              const companyId = companyIdLookup.get(transform.companyName);
              if (companyId) {
                data.companyId = companyId;
              }
            }
          }

          // Dedup on EPA registry ID — skip if we already imported this factory
          const epaRegistryId = typeof data.epaRegistryId === 'string' ? data.epaRegistryId.trim() : '';
          if (epaRegistryId && existingEpaRegistry.has(epaRegistryId)) {
            skipped++;
            continue;
          }
        }

        const cleanedData = prepareForInsert(data, entityType as EntityType);

        // Resolve stateId FK from 2-letter state code for factories
        if (entityType === 'factories' && typeof cleanedData.state === 'string' && cleanedData.state.length === 2) {
          const sid = stateIdByCode.get(cleanedData.state);
          if (sid) cleanedData.stateId = sid;
        }

        // Insert based on entity type
        switch (entityType) {
          case 'companies':
            await db.insert(companies).values(cleanedData as typeof companies.$inferInsert);
            created++;
            break;
          case 'factories': {
            const [inserted] = await db.insert(factories)
              .values(cleanedData as typeof factories.$inferInsert)
              .returning({ id: factories.id });
            created++;

            // Write EPA registry ID to external_references (provenance, not a factory column)
            const epaRegistryId = typeof data.epaRegistryId === 'string' ? data.epaRegistryId.trim() : '';
            if (inserted && epaRegistryId) {
              await db.insert(externalReferences).values({
                entityType: 'factories',
                entityId: inserted.id,
                source: 'EPA_ECHO',
                externalId: epaRegistryId,
              });
              existingEpaRegistry.add(epaRegistryId);
            }
            break;
          }
          case 'occupations':
            await db.insert(occupations).values(cleanedData as typeof occupations.$inferInsert);
            created++;
            break;
          case 'skills':
            await db.insert(skills).values(cleanedData as typeof skills.$inferInsert);
            created++;
            break;
        }
      } catch (insertError) {
        // Log error to queue
        await db.insert(errorQueue).values({
          importBatchId: batch.id,
          entityType: entityType as 'companies' | 'factories' | 'occupations' | 'skills',
          sourceRowNumber: rowNumber,
          sourceRowData: JSON.stringify(data),
          errorType: 'invalid_format',
          originalValue: JSON.stringify(data),
          status: 'pending',
        });
        errorsQueued++;
        skipped++;
      }
    }

    // Queue validation errors
    for (const error of validationResult.errors) {
      if (error.errorType === 'missing_required' || error.errorType === 'invalid_format') {
        const row = mappedRows.find((r) => r.rowNumber === error.row);
        await db.insert(errorQueue).values({
          importBatchId: batch.id,
          entityType: entityType as 'companies' | 'factories' | 'occupations' | 'skills',
          sourceRowNumber: error.row,
          sourceRowData: row ? JSON.stringify(row.data) : null,
          errorType: error.errorType,
          fieldName: error.field,
          originalValue: error.value ? String(error.value) : null,
          suggestedValue: error.suggestion,
          status: 'pending',
        });
        errorsQueued++;
      }
    }

    const durationMs = Date.now() - startTime;

    // Update batch status
    await db.update(importBatches)
      .set({
        createdCount: created,
        updatedCount: updated,
        skippedCount: skipped,
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(importBatches.id, batch.id));

    // The upload has served its purpose.
    await deleteParsed(fileId);

    res.json({
      batchId: batch.id,
      created,
      updated,
      skipped,
      errorsQueued,
      companiesCreated,
      durationMs,
    });
  } catch (error) {
    console.error('Execute error:', error);
    const message = error instanceof Error ? error.message : 'Failed to execute import';
    res.status(500).json({ error: message });
  }
});

// GET /api/import/batches - Get recent import batches
router.get('/batches', async (req: Request, res: Response) => {
  try {
    const { limit = '10' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 10, 50);

    const batches = await db
      .select()
      .from(importBatches)
      .orderBy(desc(importBatches.createdAt))
      .limit(limitNum);

    res.json({
      data: batches,
    });
  } catch (error) {
    console.error('Error fetching import batches:', error);
    res.status(500).json({ error: 'Failed to fetch import batches' });
  }
});

export default router;
