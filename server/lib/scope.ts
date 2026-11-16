import { sql, type SQL } from 'drizzle-orm';
import { SCOPE } from '../../shared/scope.js';

/**
 * Region scope for public reads.
 *
 * SCOPE.stateCode is currently null: the public API covers every state, and
 * each helper below is then a no-op (TRUE). Set a state code in
 * shared/scope.ts and every public read narrows to it. Focus areas (the
 * regions being filled out in depth) are separate; see `areaBox`.
 *
 * Every public GET limits what it returns to SCOPE (shared/scope.ts). Rows
 * outside it stay in the database and stay reachable through the admin-only
 * routers (import, review) and the write handlers, which are deliberately
 * unscoped so other states can still be loaded and corrected.
 *
 * Routes must build their conditions from these helpers and never compare
 * against a state code themselves; that keeps widening the region a change to
 * shared/scope.ts alone.
 *
 * Each helper takes the name the table goes by in the query, so the same
 * predicate works for Drizzle builders (`factoryInScope()`), for hand-written
 * SQL with aliases (`factoryInScope('f')`), and inside correlated subqueries.
 */

const column = (table: string, name: string): SQL => sql`${sql.identifier(table)}.${sql.identifier(name)}`;

/** True when a two-letter state code is the region the app covers. */
export function isStateInScope(code: string | null | undefined): boolean {
  if (SCOPE.stateCode === null) return true;
  return typeof code === 'string' && code.toUpperCase() === SCOPE.stateCode;
}

/** The factory sits in the covered region. */
export function factoryInScope(factoryTable = 'factories'): SQL {
  if (SCOPE.stateCode === null) return sql`TRUE`;
  return sql`${column(factoryTable, 'state')} = ${SCOPE.stateCode}`;
}

/** The company has at least one factory in the covered region. */
export function companyInScope(companyTable = 'companies'): SQL {
  if (SCOPE.stateCode === null) return sql`TRUE`;
  return sql`EXISTS (
    SELECT 1 FROM factories scope_f
    WHERE scope_f.company_id = ${column(companyTable, 'id')} AND ${factoryInScope('scope_f')}
  )`;
}

/** The school sits in the covered region. */
export function schoolInScope(schoolTable = 'schools'): SQL {
  if (SCOPE.stateCode === null) return sql`TRUE`;
  return sql`${column(schoolTable, 'state')} = ${SCOPE.stateCode}`;
}

/**
 * Programs carry no location of their own; they take their school's. A program
 * with no school (an online or open curriculum) has no location to judge, so
 * it stays visible.
 */
export function programInScope(programTable = 'programs'): SQL {
  if (SCOPE.stateCode === null) return sql`TRUE`;
  return sql`(
    ${column(programTable, 'school_id')} IS NULL
    OR EXISTS (
      SELECT 1 FROM schools scope_s
      WHERE scope_s.id = ${column(programTable, 'school_id')} AND ${schoolInScope('scope_s')}
    )
  )`;
}

/**
 * The factory lies inside a focus area's bounding box. Coordinates are stored
 * as text, so they are cast; rows with unusable coordinates never match.
 */
export function factoryInBox(bounds: [[number, number], [number, number]], factoryTable = 'factories'): SQL {
  const [[west, south], [east, north]] = bounds;
  const lat = column(factoryTable, 'latitude');
  const lng = column(factoryTable, 'longitude');
  return sql`(
    ${lat} ~ '^-?[0-9]+(\.[0-9]+)?$' AND ${lng} ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND ${lat}::float8 BETWEEN ${south} AND ${north}
    AND ${lng}::float8 BETWEEN ${west} AND ${east}
  )`;
}
