import { isAddressStub } from '../shared/addressStubFilter.js';

// Must DROP
const shouldDrop = [
  '10 S Riverside Property Owner LLC',
  '101 Lynx Avenue LLC',
  '10218 Toluca LLC',
  '100 South LA Brea LLC',
  '10 Day Parts INC',
  '10/120 S Riverside Plaza LLC',
  '1116 Murphy LLC',
  '12 Innovation Owner LLC',
  '49 Dupont Realty',
  '71 S Wacker Dr Holdings LLC',
  '713, INC',
  '1859, INC',
  '119 N. York (Ves/Stripper)',
  'Boise Cascade Clarifier Solids Landfill',
  'Waste Management - Fairbanks Landfill',
  'Arkadelphia, City Of',
  'Beckemeyer, Village Of',
  'BFI Waste Systems of North America Inc',
];

// Must KEEP
const shouldKeep = [
  'Boeing',
  'BADIA SPICES',
  'Caterpillar INC',
  'Coca-Cola',
  '3M Company',
  'Atlas Roofing Corp',
  'Lucas Aerospace Power Transmission Corp',
  'Mercedes Benz Truck CO Inc',
  'Temple-Inland',
  'Convent Refinery',                       // "convent" = LA town name
  'Bryant Church Hardwoods, Inc',            // hardwood mfg
  'Wayne Farms LLC',                         // real agribusiness
  'Hospital Specialty Co',                   // medical supply mfg
  'Busse Hospital Disposables Inc',          // disposable mfg
  'All Pure Chemical Co City Of Industry',   // real co in City of Industry, CA
  'Air Products & Chemicals Inc - Convent Facility',
  '5 Day Business Forms Mfg Inc',            // real mfg
  '88 Acres Foods Inc',                       // real food mfg
  '4 Over International LLC',                 // real printer
  'Twin Cities Army Ammunition Plant',        // real mfg
  'Air Force Plant 4 (Lockheed Martin)',     // real mfg
  'Burgess Norton Mfg Co - Plant 1',          // real mfg w/ plant number
  'Wilsonart LLC Temple North',              // Temple TX
  'Sanderson Farms, Inc',                    // real food mfg
];

let fails = 0;
console.log('=== Must DROP ===');
for (const n of shouldDrop) {
  const ok = isAddressStub(n);
  console.log(`  ${ok ? 'DROP' : 'FAIL_KEEP'}: ${n}`);
  if (!ok) fails++;
}
console.log('\n=== Must KEEP ===');
for (const n of shouldKeep) {
  const ok = !isAddressStub(n);
  console.log(`  ${ok ? 'KEEP' : 'FAIL_DROP'}: ${n}`);
  if (!ok) fails++;
}
console.log(`\nFailures: ${fails}`);
process.exit(fails > 0 ? 1 : 0);
