import '../loadEnv.js';
import { assertSafeToWipe } from '../lib/wipeGuard.js';
import { db } from '../db/index.js';
import {
  companies,
  factories,
  occupations,
  skills,
  factoryOccupations,
  occupationSkills,
} from '../db/schema.js';
import { FICTIONAL_COMPANIES, REAL_COMPANIES, MAJOR_COMPANIES, MID_TIER_COMPANIES } from './seed-data/companies.js';
import { OCCUPATIONS_DATA } from './seed-data/occupations.js';
import { SKILLS_DATA } from './seed-data/skills.js';
import { FACTORY_LOCATIONS, SPECIALIZATION_INDUSTRIES } from './seed-data/factories.js';
import { OCCUPATION_SKILL_MAPPINGS } from './seed-data/occupationSkills.js';

/**
 * The NAICS subsector a sample plant belongs to, from its specialization, so
 * the sample has an industry on every plant as production's data does.
 */
function subsectorFor(specialization: string): string {
  const text = specialization.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/semiconductor|electronic|computer|chip|sensor|avionic|telecom|instrument/, 'Computer and Electronic Product Manufacturing'],
    [/batter|electrical|motor|transformer|solar|wind|lighting|appliance/, 'Electrical Equipment, Appliance, and Component Manufacturing'],
    [/auto|aero|aircraft|vehicle|truck|rail|ship|engine|rv |powertrain|transmission|space|defense|missile/, 'Transportation Equipment Manufacturing'],
    [/pharma|chemical|polymer|petrochem|coating|paint|plastic resin|fertil|biotech/, 'Chemical Manufacturing'],
    [/refin|petroleum|lubric/, 'Petroleum and Coal Products Manufacturing'],
    [/plastic|rubber|tire/, 'Plastics and Rubber Products Manufacturing'],
    [/food|bever|dairy|meat|agricultur|brew|bak/, 'Food Manufacturing'],
    [/steel prod|steel proc|alumin|foundr|casting|smelt|primary metal/, 'Primary Metal Manufacturing'],
    [/machine|equipment|turbine|robot|tool|hvac|pump|oilfield/, 'Machinery Manufacturing'],
    [/glass|cement|ceramic|brick/, 'Nonmetallic Mineral Product Manufacturing'],
    [/paper|packag|pulp/, 'Paper Manufacturing'],
    [/wood|lumber|timber/, 'Wood Product Manufacturing'],
    [/furniture/, 'Furniture and Related Product Manufacturing'],
    [/textile|apparel|fabric/, 'Textile Mills'],
    [/medical|device|prototyp|r&d|research/, 'Miscellaneous Manufacturing'],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? 'Fabricated Metal Product Manufacturing';
}

// ============================================
// SEED FUNCTION
// ============================================

async function seed() {
  assertSafeToWipe('db:seed');
  console.log('Starting database seed...\n');

  try {
    // Clear existing data (in reverse order of dependencies)
    console.log('Clearing existing data...');
    await db.delete(occupationSkills);
    await db.delete(factoryOccupations);
    await db.delete(factories);
    // Careers before companies: a military career belongs to a service, which is a company
    // (occupations.service_company_id, migration 0061), and a service with careers cannot be deleted.
    await db.delete(occupations);
    await db.delete(companies);
    await db.delete(skills);
    console.log('Existing data cleared.\n');

    // Combine all company data
    const allCompaniesData = [
      ...FICTIONAL_COMPANIES.map((c) => ({
        name: c.name,
        description: c.description,
        industries: c.industries,
        lat: null as string | null,
        lng: null as string | null,
      })),
      ...REAL_COMPANIES.map((c) => ({
        name: c.name,
        description: c.description,
        industries: c.industries,
        lat: c.lat,
        lng: c.lng,
      })),
    ];

    // Insert companies
    console.log('Inserting companies...');
    const insertedCompanies = await db.insert(companies).values(
      allCompaniesData.map((c) => ({
        name: c.name,
        description: c.description,
        industry: c.industries[0],
        headquartersLat: c.lat,
        headquartersLng: c.lng,
      }))
    ).returning();
    console.log(`Inserted ${insertedCompanies.length} companies.\n`);

    // Create company lookup map
    const companyMap = new Map(insertedCompanies.map((c, i) => [allCompaniesData[i].name, { id: c.id, industries: allCompaniesData[i].industries }]));

    // Insert occupations
    console.log('Inserting occupations...');
    const insertedOccupations = await db.insert(occupations).values(
      OCCUPATIONS_DATA.map((o) => ({
        title: o.title,
        onetCode: o.onetCode,
        description: o.description,
      }))
    ).returning();
    console.log(`Inserted ${insertedOccupations.length} occupations.\n`);

    // Insert skills
    console.log('Inserting skills...');
    const insertedSkills = await db.insert(skills).values(
      SKILLS_DATA.map((s) => ({
        name: s.name,
        category: s.category,
        description: s.description,
      }))
    ).returning();
    console.log(`Inserted ${insertedSkills.length} skills.\n`);

    // Create skill and occupation lookup maps
    const skillMap = new Map(insertedSkills.map((s) => [s.name, s.id]));
    const occupationMap = new Map(insertedOccupations.map((o) => [o.title, o.id]));

    // Insert occupation-skill relationships
    console.log('Creating occupation-skill relationships...');
    const occupationSkillValues: Array<{
      occupationId: string;
      skillId: string;
      importance: 'required' | 'preferred' | 'nice_to_have';
    }> = [];

    for (const [occupationTitle, skillNames] of Object.entries(OCCUPATION_SKILL_MAPPINGS)) {
      const occupationId = occupationMap.get(occupationTitle);
      if (!occupationId) continue;

      skillNames.forEach((skillName, index) => {
        const skillId = skillMap.get(skillName);
        if (!skillId) return;

        // First 2 skills are required, next 2 preferred, rest nice to have
        let importance: 'required' | 'preferred' | 'nice_to_have' = 'nice_to_have';
        if (index < 2) importance = 'required';
        else if (index < 4) importance = 'preferred';

        occupationSkillValues.push({
          occupationId,
          skillId,
          importance,
        });
      });
    }

    if (occupationSkillValues.length > 0) {
      await db.insert(occupationSkills).values(occupationSkillValues);
    }
    console.log(`Created ${occupationSkillValues.length} occupation-skill relationships.\n`);

    // Insert factories with intelligent assignment
    console.log('Inserting factories...');

    // Shuffle factory locations to randomize distribution
    const shuffledLocations = [...FACTORY_LOCATIONS].sort(() => Math.random() - 0.5);
    let locationIndex = 0;

    const factoryValues: Array<{
      companyId: string;
      name: string;
      specialization: string;
      description: string;
      latitude: string;
      longitude: string;
      city: string;
      state: string;
      primaryNaicsDescription: string;
      workforceSize: number;
      openPositions: number;
    }> = [];

    // Assign factories to companies based on tier
    for (const [companyName, companyData] of companyMap.entries()) {
      let factoryCount: number;

      if (MAJOR_COMPANIES.has(companyName)) {
        factoryCount = Math.floor(Math.random() * 5) + 4; // 4-8 factories
      } else if (MID_TIER_COMPANIES.has(companyName)) {
        factoryCount = Math.floor(Math.random() * 3) + 2; // 2-4 factories
      } else {
        factoryCount = Math.floor(Math.random() * 2) + 1; // 1-2 factories
      }

      // Get company industries for matching
      const companyIndustryList = companyData.industries || [];

      // Try to find matching locations first, then fall back to any
      const assignedLocations: typeof FACTORY_LOCATIONS = [];

      for (let i = 0; i < factoryCount && locationIndex < shuffledLocations.length; i++) {
        // Try to find a location matching company industry
        let matchingLoc = null;
        for (let j = locationIndex; j < shuffledLocations.length; j++) {
          const loc = shuffledLocations[j];
          const locIndustries = SPECIALIZATION_INDUSTRIES[loc.specialization] || [];
          const hasMatch = companyIndustryList.some(ind => locIndustries.includes(ind));
          if (hasMatch) {
            matchingLoc = loc;
            // Swap to current position
            shuffledLocations[j] = shuffledLocations[locationIndex];
            shuffledLocations[locationIndex] = matchingLoc;
            break;
          }
        }

        // Use current location (either matched or next in queue)
        const loc = shuffledLocations[locationIndex];
        locationIndex++;
        assignedLocations.push(loc);
      }

      // Create factory records
      assignedLocations.forEach((loc, idx) => {
        const shortName = companyName.split(' ')[0].replace(/[,.]/, '');
        const factoryNum = assignedLocations.length > 1 ? ` #${idx + 1}` : '';

        factoryValues.push({
          companyId: companyData.id,
          name: `${shortName} ${loc.city} Plant${factoryNum}`,
          specialization: loc.specialization,
          description: `${loc.specialization} facility located in ${loc.city}, ${loc.state}`,
          primaryNaicsDescription: subsectorFor(loc.specialization),
          latitude: loc.lat.toString(),
          longitude: loc.lng.toString(),
          city: loc.city,
          state: loc.state,
          workforceSize: Math.floor(Math.random() * 1500) + 200,
          openPositions: Math.floor(Math.random() * 100) + 10,
        });
      });
    }

    const insertedFactories = await db.insert(factories).values(factoryValues).returning();
    console.log(`Inserted ${insertedFactories.length} factories.\n`);

    // Create factory-occupation relationships
    console.log('Creating factory-occupation relationships...');
    const factoryOccupationValues: Array<{
      factoryId: string;
      occupationId: string;
      headcount: number;
      avgSalaryMin: number;
      avgSalaryMax: number;
    }> = [];

    for (const factory of insertedFactories) {
      // Each factory gets 5-12 random occupations
      const numOccupations = Math.floor(Math.random() * 8) + 5;
      const shuffledOccupations = [...insertedOccupations].sort(() => Math.random() - 0.5);
      const selectedOccupations = shuffledOccupations.slice(0, numOccupations);

      for (const occupation of selectedOccupations) {
        factoryOccupationValues.push({
          factoryId: factory.id,
          occupationId: occupation.id,
          headcount: Math.floor(Math.random() * 50) + 5,
          avgSalaryMin: Math.floor(Math.random() * 20000) + 35000,
          avgSalaryMax: Math.floor(Math.random() * 30000) + 55000,
        });
      }
    }

    if (factoryOccupationValues.length > 0) {
      await db.insert(factoryOccupations).values(factoryOccupationValues);
    }
    console.log(`Created ${factoryOccupationValues.length} factory-occupation relationships.\n`);

    // Summary
    console.log('='.repeat(50));
    console.log('SEED COMPLETE');
    console.log('='.repeat(50));
    console.log(`Companies: ${insertedCompanies.length}`);
    console.log(`Factories: ${insertedFactories.length}`);
    console.log(`Occupations: ${insertedOccupations.length}`);
    console.log(`Skills: ${insertedSkills.length}`);
    console.log(`Occupation-Skill Links: ${occupationSkillValues.length}`);
    console.log(`Factory-Occupation Links: ${factoryOccupationValues.length}`);
    console.log('='.repeat(50));

    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seed();
