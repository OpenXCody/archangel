import { sql } from 'drizzle-orm';
import { db, companies, factories } from '../db/index.js';
import { recordAudit, type Actor } from './audit.js';
import { adminSetFacts, type PlantFact } from './provenance.js';
import { RecordRefusal, cleanDomain, refuse } from './records.js';
import { coordinate, optionalText, requiredText, stateCode } from './writes.js';

/**
 * Adding a company by hand, with or without its first factory, as one write:
 * `POST /api/companies { name, domain?, description?, factory? }`. Either the
 * company and the factory are both there afterwards, each with its line in
 * the audit log, or neither is. A refusal names the field it is about; a
 * field of the factory is named `factory.<field>`.
 */

type Body = Record<string, unknown>;

const ZIP = /^\d{5}(-\d{4})?$/;

export interface AddedCompany {
  company: typeof companies.$inferSelect;
  /** The first factory, when one was given. */
  factory: typeof factories.$inferSelect | null;
}

export async function addCompany(body: Body, actor: Actor): Promise<AddedCompany> {
  const name = requiredText(body.name);
  if (!name) refuse('name', 'A company needs a name of up to 200 characters.');
  const industry = optionalText(body.industry, 80);
  if (industry === false) refuse('industry', 'Industry is text of up to 80 characters.');
  const description = optionalText(body.description, 600);
  if (description === false) refuse('description', 'A description is text of up to 600 characters.');
  const domain = body.domain === undefined ? null : cleanDomain(body.domain);
  if (domain === false) refuse('domain', 'Enter a website such as tesla.com.');

  // The first factory: where it is, as people write an address, and the point the address was found at.
  const given = body.factory;
  if (given !== undefined && given !== null && (typeof given !== 'object' || Array.isArray(given))) refuse('factory', 'A factory is an address with its coordinates.');
  const first = (given ?? null) as Body | null;
  const plant = first
    ? (() => {
        const state = stateCode(first.state);
        if (!state) refuse('factory.state', 'Choose a state.');
        const city = optionalText(first.city, 120);
        if (city === false) refuse('factory.city', 'A city is text of up to 120 characters.');
        const address = optionalText(first.address, 300);
        if (address === false) refuse('factory.address', 'An address is text of up to 300 characters.');
        const zip = optionalText(first.zip, 10);
        if (zip === false || (zip && !ZIP.test(zip))) refuse('factory.zip', 'A ZIP code is five digits.');
        const latitude = coordinate(first.latitude, 'latitude');
        const longitude = coordinate(first.longitude, 'longitude');
        if (latitude === null) refuse('factory.latitude', 'A latitude is a number from -90 to 90.');
        if (longitude === null) refuse('factory.longitude', 'A longitude is a number from -180 to 180.');
        // Left empty, the factory is named for the company and its town: "Acme Austin".
        const named = first.name === undefined || first.name === null || first.name === '' ? `${name} ${city ?? state}`.slice(0, 300) : requiredText(first.name, 300);
        if (!named) refuse('factory.name', 'A factory’s name is text of up to 300 characters.');
        return { name: named, state, city: city ?? null, address: address ?? null, zipCode: zip ?? null, latitude, longitude };
      })()
    : null;

  return db.transaction(async (tx) => {
    // The same name in any letter case is the same company (compared as text, not as a pattern).
    const [existing] = await tx
      .select({ id: companies.id, name: companies.name, slug: companies.slug })
      .from(companies)
      .where(sql`lower(${companies.name}) = lower(${name})`)
      .limit(1);
    if (existing) throw new RecordRefusal(409, 'A company with that name already exists.', { existing });

    const [company] = await tx
      .insert(companies)
      .values({ name, industry: industry ?? null, description: description ?? null, domain })
      .returning();
    await recordAudit(tx, { actor, kind: 'company', recordId: company.id, recordName: company.name, action: 'added' });
    if (!plant) return { company, factory: null };

    const [factory] = await tx.insert(factories).values({ companyId: company.id, ...plant }).returning();
    await recordAudit(tx, { actor, kind: 'factory', recordId: factory.id, recordName: factory.name, action: 'added' });
    // What an admin typed is the admin's: no source replaces it (server/lib/provenance.ts).
    const facts: PlantFact[] = ['coordinates'];
    if (plant.city) facts.push('city');
    if (plant.address) facts.push('address');
    if (plant.zipCode) facts.push('zip');
    await adminSetFacts(tx, factory.id, facts, actor.id);
    return { company, factory };
  });
}
