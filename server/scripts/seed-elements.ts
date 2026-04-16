import 'dotenv/config';
import { db } from '../db';
import {
  skills,
  refs,
  schools,
  programs,
  programSkills,
  skillRefs,
} from '../db/schema';
import { eq } from 'drizzle-orm';

// ============================================
// REFS DATA - Elements Library
// ============================================

// Materials (metals, composites, polymers, etc.)
const MATERIALS: Array<{
  name: string;
  description: string;
  manufacturer?: string;
  tags?: string[];
  properties?: Record<string, unknown>;
}> = [
  // Metals
  { name: 'Aluminum 6061-T6', description: 'General purpose aluminum alloy with good machinability and weldability', tags: ['aluminum', 'alloy', 'aerospace'], properties: { tensileStrength: '45000 psi', density: '2.70 g/cm³', hardness: '95 HB' } },
  { name: 'Aluminum 7075-T6', description: 'High-strength aluminum alloy used in aerospace applications', tags: ['aluminum', 'alloy', 'aerospace', 'high-strength'], properties: { tensileStrength: '83000 psi', density: '2.81 g/cm³', hardness: '150 HB' } },
  { name: 'Stainless Steel 304', description: 'Austenitic stainless steel with excellent corrosion resistance', tags: ['stainless', 'steel', 'corrosion-resistant'], properties: { tensileStrength: '73200 psi', density: '8.00 g/cm³' } },
  { name: 'Stainless Steel 316L', description: 'Marine-grade stainless steel with superior corrosion resistance', tags: ['stainless', 'steel', 'marine', 'medical'], properties: { tensileStrength: '75000 psi', density: '8.00 g/cm³' } },
  { name: 'Titanium Ti-6Al-4V', description: 'Alpha-beta titanium alloy, workhorse of aerospace industry', tags: ['titanium', 'alloy', 'aerospace', 'medical'], properties: { tensileStrength: '130000 psi', density: '4.43 g/cm³' } },
  { name: 'Inconel 718', description: 'Nickel-based superalloy for high-temperature applications', tags: ['inconel', 'superalloy', 'high-temperature', 'aerospace'], properties: { tensileStrength: '180000 psi', maxTemp: '1300°F' } },
  { name: '4140 Steel', description: 'Chromium-molybdenum alloy steel for high-stress applications', tags: ['steel', 'alloy', 'high-strength'], properties: { tensileStrength: '95000 psi', hardness: '197 HB' } },
  { name: 'Tool Steel A2', description: 'Air-hardening tool steel for dies and punches', tags: ['tool steel', 'dies', 'hardened'], properties: { hardness: '60-62 HRC' } },
  { name: 'Copper C110', description: 'Oxygen-free high-conductivity copper', tags: ['copper', 'electrical', 'conductivity'], properties: { conductivity: '101% IACS' } },
  { name: 'Brass 360', description: 'Free-machining brass with excellent machinability', tags: ['brass', 'free-machining'], properties: { machinabilityRating: '100%' } },
  // Composites
  { name: 'Carbon Fiber T700', description: 'Standard modulus carbon fiber for structural applications', manufacturer: 'Toray', tags: ['carbon fiber', 'composite', 'aerospace'], properties: { tensileModulus: '33.4 Msi', tensileStrength: '711 ksi' } },
  { name: 'Carbon Fiber T800', description: 'Intermediate modulus carbon fiber for high-performance applications', manufacturer: 'Toray', tags: ['carbon fiber', 'composite', 'aerospace'], properties: { tensileModulus: '42.6 Msi', tensileStrength: '783 ksi' } },
  { name: 'Kevlar 49', description: 'High-modulus aramid fiber for impact resistance', manufacturer: 'DuPont', tags: ['aramid', 'kevlar', 'ballistic'], properties: { tensileModulus: '18.6 Msi' } },
  { name: 'Fiberglass E-Glass', description: 'Electrical-grade glass fiber for general composite applications', tags: ['fiberglass', 'composite', 'general-purpose'] },
  { name: 'Epoxy 3501-6', description: 'Aerospace-grade toughened epoxy resin system', manufacturer: 'Hexcel', tags: ['epoxy', 'resin', 'aerospace', 'prepreg'] },
  // Polymers
  { name: 'PEEK', description: 'High-performance thermoplastic for demanding applications', tags: ['thermoplastic', 'high-temperature', 'chemical-resistant'], properties: { maxServiceTemp: '480°F', tensileStrength: '14500 psi' } },
  { name: 'Ultem 1000', description: 'Polyetherimide for high-temp electrical/electronic applications', manufacturer: 'SABIC', tags: ['pei', 'thermoplastic', 'high-temperature', 'electrical'] },
  { name: 'Delrin 150', description: 'Acetal homopolymer with excellent dimensional stability', manufacturer: 'DuPont', tags: ['acetal', 'delrin', 'precision', 'bearings'] },
  { name: 'Nylon 6/6', description: 'Polyamide with good strength and wear resistance', tags: ['nylon', 'polyamide', 'wear-resistant'] },
  { name: 'PTFE', description: 'Polytetrafluoroethylene with extreme chemical resistance', tags: ['teflon', 'ptfe', 'chemical-resistant', 'low-friction'] },
];

// Machines (CNC machines, welding equipment, etc.)
const MACHINES: Array<{
  name: string;
  description: string;
  manufacturer: string;
  tags?: string[];
  properties?: Record<string, unknown>;
}> = [
  // CNC Machining Centers
  { name: 'DMG MORI DMU 50', manufacturer: 'DMG MORI', description: '5-axis universal milling machine with 630mm x 530mm x 475mm work envelope', tags: ['cnc', '5-axis', 'milling', 'vertical'], properties: { axes: 5, spindleSpeed: '20000 rpm', tableSize: '630x530mm' } },
  { name: 'Mazak Integrex i-200', manufacturer: 'Mazak', description: 'Multi-tasking turning center with milling capability', tags: ['cnc', 'turning', 'mill-turn', 'multi-axis'], properties: { axes: 5, maxTurningDia: '660mm', spindleSpeed: '5000 rpm' } },
  { name: 'Haas VF-4', manufacturer: 'Haas', description: 'Vertical machining center, 50x20x25 inch travels', tags: ['cnc', 'vertical', 'milling', '3-axis'], properties: { axes: 3, tableSize: '52x20 in', spindleSpeed: '8100 rpm' } },
  { name: 'Haas ST-30', manufacturer: 'Haas', description: 'CNC turning center with 3-inch bar capacity', tags: ['cnc', 'turning', 'lathe', '2-axis'], properties: { maxTurningDia: '21 in', barCapacity: '3 in' } },
  { name: 'Okuma LB3000 EX II', manufacturer: 'Okuma', description: 'High-precision CNC lathe with sub-spindle', tags: ['cnc', 'turning', 'lathe', 'sub-spindle'], properties: { maxTurningDia: '310mm', spindleSpeed: '5000 rpm' } },
  { name: 'Makino a51nx', manufacturer: 'Makino', description: 'Horizontal machining center for high-volume production', tags: ['cnc', 'horizontal', 'milling', 'production'], properties: { palletSize: '400mm', spindleSpeed: '14000 rpm' } },
  // Welding Equipment
  { name: 'Lincoln PowerWave S500', manufacturer: 'Lincoln Electric', description: 'Advanced multi-process welder for MIG/TIG/Stick', tags: ['welding', 'mig', 'tig', 'stick', 'multi-process'], properties: { amperage: '5-500A', dutyCycle: '100% at 300A' } },
  { name: 'Miller Dynasty 400', manufacturer: 'Miller Electric', description: 'AC/DC TIG welder with advanced waveform control', tags: ['welding', 'tig', 'gtaw', 'precision'], properties: { amperage: '3-400A', acFrequency: '20-400 Hz' } },
  { name: 'Fronius TransSteel 5000', manufacturer: 'Fronius', description: 'Synergic MIG/MAG system for steel welding', tags: ['welding', 'mig', 'gmaw', 'synergic'], properties: { amperage: '30-500A', wireSpeed: '1-25 m/min' } },
  { name: 'FANUC ArcMate 120iC', manufacturer: 'FANUC', description: '6-axis arc welding robot', tags: ['welding', 'robot', 'automation', 'arc'], properties: { axes: 6, payload: '20kg', reach: '1811mm' } },
  // Additive Manufacturing
  { name: 'EOS M290', manufacturer: 'EOS', description: 'Metal powder bed fusion 3D printer', tags: ['additive', '3d-printing', 'metal', 'dmls'], properties: { buildVolume: '250x250x325mm', laserPower: '400W' } },
  { name: 'Stratasys F370', manufacturer: 'Stratasys', description: 'FDM 3D printer for engineering-grade thermoplastics', tags: ['additive', '3d-printing', 'polymer', 'fdm'], properties: { buildVolume: '355x254x355mm' } },
  { name: 'Markforged X7', manufacturer: 'Markforged', description: 'Industrial composite 3D printer with continuous fiber reinforcement', tags: ['additive', '3d-printing', 'composite', 'carbon-fiber'], properties: { buildVolume: '330x270x200mm' } },
  // Metrology
  { name: 'Zeiss Contura', manufacturer: 'Zeiss', description: 'Bridge-type coordinate measuring machine', tags: ['metrology', 'cmm', 'inspection', 'coordinate'], properties: { measurementVolume: '700x1000x600mm', accuracy: '1.8 + L/350 μm' } },
  { name: 'Keyence IM-8000', manufacturer: 'Keyence', description: 'Instant measurement system with image dimension measurement', tags: ['metrology', 'optical', 'inspection', 'instant'], properties: { accuracy: '±5 μm' } },
  { name: 'FARO Edge', manufacturer: 'FARO', description: 'Portable 7-axis CMM arm for shop floor inspection', tags: ['metrology', 'cmm', 'portable', 'arm'], properties: { accuracy: '±25 μm', reach: '1.8-2.7m' } },
  // EDM
  { name: 'Sodick AG60L', manufacturer: 'Sodick', description: 'Wire EDM with linear motor technology', tags: ['edm', 'wire-edm', 'precision'], properties: { maxWorkpiece: '770x590x215mm', wireRange: '0.05-0.30mm' } },
  { name: 'Makino EDAF3', manufacturer: 'Makino', description: 'Sinker EDM for precision die work', tags: ['edm', 'sinker-edm', 'die-making'], properties: { tableSize: '500x350mm' } },
];

// Standards (ISO, AS, MIL, etc.)
const STANDARDS: Array<{
  name: string;
  description: string;
  tags?: string[];
}> = [
  // Quality Management
  { name: 'ISO 9001:2015', description: 'Quality management systems - Requirements', tags: ['quality', 'management', 'iso'] },
  { name: 'AS9100D', description: 'Quality management systems for aviation, space, and defense', tags: ['quality', 'aerospace', 'as'] },
  { name: 'IATF 16949:2016', description: 'Quality management system for automotive industry', tags: ['quality', 'automotive', 'iatf'] },
  { name: 'ISO 13485:2016', description: 'Quality management for medical devices', tags: ['quality', 'medical', 'iso'] },
  // Welding
  { name: 'AWS D1.1', description: 'Structural Welding Code - Steel', tags: ['welding', 'structural', 'steel', 'aws'] },
  { name: 'AWS D1.2', description: 'Structural Welding Code - Aluminum', tags: ['welding', 'structural', 'aluminum', 'aws'] },
  { name: 'AWS D17.1', description: 'Fusion Welding for Aerospace Applications', tags: ['welding', 'aerospace', 'aws'] },
  { name: 'ASME Section IX', description: 'Welding, Brazing, and Fusing Qualifications', tags: ['welding', 'qualification', 'asme'] },
  // NDT
  { name: 'ASNT SNT-TC-1A', description: 'NDT personnel qualification and certification', tags: ['ndt', 'qualification', 'asnt'] },
  { name: 'NAS 410', description: 'NDT Personnel Qualification and Certification', tags: ['ndt', 'aerospace', 'nas'] },
  // Material & Process
  { name: 'AMS 2750', description: 'Pyrometry - Temperature measurement in heat treatment', tags: ['heat-treatment', 'pyrometry', 'ams'] },
  { name: 'ASTM E8', description: 'Standard Test Methods for Tension Testing of Metallic Materials', tags: ['testing', 'tensile', 'astm'] },
  { name: 'ASTM E18', description: 'Standard Test Methods for Rockwell Hardness of Metallic Materials', tags: ['testing', 'hardness', 'astm'] },
  // GD&T
  { name: 'ASME Y14.5-2018', description: 'Dimensioning and Tolerancing - GD&T standard', tags: ['gdt', 'dimensioning', 'asme'] },
  { name: 'ISO 1101:2017', description: 'Geometrical product specifications - Tolerances', tags: ['gps', 'tolerance', 'iso'] },
  // Aerospace Specific
  { name: 'NADCAP AC7004', description: 'Chemical Processing Audit Criteria', tags: ['nadcap', 'chemical', 'aerospace'] },
  { name: 'NADCAP AC7110', description: 'Welding Audit Criteria', tags: ['nadcap', 'welding', 'aerospace'] },
  { name: 'NADCAP AC7114', description: 'Non-Destructive Testing Audit Criteria', tags: ['nadcap', 'ndt', 'aerospace'] },
];

// Processes (heat treatment, surface finishing, etc.)
const PROCESSES: Array<{
  name: string;
  description: string;
  tags?: string[];
}> = [
  // Heat Treatment
  { name: 'Annealing', description: 'Thermal process to relieve stress and increase ductility', tags: ['heat-treatment', 'thermal'] },
  { name: 'Normalizing', description: 'Heating to austenitic range and air cooling', tags: ['heat-treatment', 'thermal'] },
  { name: 'Hardening', description: 'Heating and rapid quenching to increase hardness', tags: ['heat-treatment', 'hardening'] },
  { name: 'Tempering', description: 'Secondary heating to reduce brittleness after hardening', tags: ['heat-treatment', 'hardening'] },
  { name: 'Solution Heat Treatment', description: 'Single-phase heating for precipitation-hardenable alloys', tags: ['heat-treatment', 'aluminum', 'aerospace'] },
  { name: 'Age Hardening', description: 'Precipitation hardening at elevated temperature', tags: ['heat-treatment', 'precipitation', 'aging'] },
  { name: 'Case Hardening', description: 'Surface hardening through carbon or nitrogen diffusion', tags: ['heat-treatment', 'surface', 'carburizing'] },
  { name: 'Vacuum Heat Treatment', description: 'Heat treating in controlled vacuum atmosphere', tags: ['heat-treatment', 'vacuum', 'aerospace'] },
  // Surface Treatment
  { name: 'Anodizing Type II', description: 'Sulfuric acid anodizing for corrosion protection', tags: ['surface', 'anodizing', 'aluminum'] },
  { name: 'Anodizing Type III', description: 'Hard anodizing for wear resistance', tags: ['surface', 'anodizing', 'hard-coat'] },
  { name: 'Chromate Conversion', description: 'Chemical conversion coating for corrosion protection', tags: ['surface', 'chemical', 'chromate'] },
  { name: 'Passivation', description: 'Chemical treatment for stainless steel corrosion resistance', tags: ['surface', 'chemical', 'stainless'] },
  { name: 'Electroless Nickel Plating', description: 'Chemical deposition of nickel-phosphorus coating', tags: ['surface', 'plating', 'nickel'] },
  { name: 'Cadmium Plating', description: 'Electroplated cadmium for corrosion protection', tags: ['surface', 'plating', 'cadmium', 'aerospace'] },
  { name: 'HVOF Coating', description: 'High velocity oxygen fuel thermal spray coating', tags: ['surface', 'thermal-spray', 'wear-resistant'] },
  { name: 'Shot Peening', description: 'Cold working process for fatigue life improvement', tags: ['surface', 'mechanical', 'fatigue'] },
];

// Certifications
const CERTIFICATIONS: Array<{
  name: string;
  description: string;
  tags?: string[];
}> = [
  // Welding Certifications
  { name: 'AWS CWI', description: 'Certified Welding Inspector', tags: ['welding', 'inspection', 'aws'] },
  { name: 'AWS CRAW', description: 'Certified Robotic Arc Welder', tags: ['welding', 'robotic', 'aws'] },
  { name: 'AWS D1.1 3G/4G', description: 'Structural steel welder certification - All positions', tags: ['welding', 'structural', 'welder'] },
  // NDT Certifications
  { name: 'ASNT Level II UT', description: 'Ultrasonic Testing Level II certification', tags: ['ndt', 'ultrasonic', 'asnt'] },
  { name: 'ASNT Level II RT', description: 'Radiographic Testing Level II certification', tags: ['ndt', 'radiographic', 'asnt'] },
  { name: 'ASNT Level II PT', description: 'Penetrant Testing Level II certification', tags: ['ndt', 'penetrant', 'asnt'] },
  { name: 'ASNT Level II MT', description: 'Magnetic Particle Testing Level II certification', tags: ['ndt', 'magnetic', 'asnt'] },
  { name: 'ASNT Level III', description: 'NDT Method Level III certification', tags: ['ndt', 'level3', 'asnt'] },
  // Machining Certifications
  { name: 'NIMS Machining Level I', description: 'National Institute for Metalworking Skills - Entry machining', tags: ['machining', 'nims', 'entry'] },
  { name: 'NIMS Machining Level II', description: 'National Institute for Metalworking Skills - Journey machining', tags: ['machining', 'nims', 'journey'] },
  { name: 'Mastercam Associate', description: 'CAM software proficiency certification', tags: ['cam', 'programming', 'mastercam'] },
  // Quality Certifications
  { name: 'ASQ CQE', description: 'Certified Quality Engineer', tags: ['quality', 'engineering', 'asq'] },
  { name: 'ASQ CQI', description: 'Certified Quality Inspector', tags: ['quality', 'inspection', 'asq'] },
  { name: 'ASQ Six Sigma Black Belt', description: 'Six Sigma Black Belt certification', tags: ['quality', 'six-sigma', 'asq'] },
  // Aerospace Certifications
  { name: 'FAA A&P License', description: 'FAA Airframe and Powerplant Mechanic certificate', tags: ['aerospace', 'faa', 'mechanic'] },
  { name: 'FAA IA Authorization', description: 'Inspection Authorization for A&P mechanics', tags: ['aerospace', 'faa', 'inspection'] },
];

// ============================================
// SCHOOLS DATA - Training Institutions
// ============================================

const SCHOOLS_DATA: Array<{
  name: string;
  description: string;
  state: string;
  schoolType: string;
  headquartersLat: string;
  headquartersLng: string;
}> = [
  // Technical Colleges
  { name: 'Lincoln Tech', description: 'Career training in skilled trades and healthcare', state: 'NJ', schoolType: 'technical', headquartersLat: '40.8568', headquartersLng: '-74.2262' },
  { name: 'Universal Technical Institute', description: 'Technical education for automotive, diesel, and CNC', state: 'AZ', schoolType: 'technical', headquartersLat: '33.4484', headquartersLng: '-112.0740' },
  { name: 'Tulsa Welding School', description: 'Welding and pipefitting career training', state: 'OK', schoolType: 'technical', headquartersLat: '36.1540', headquartersLng: '-95.9928' },
  { name: 'Pennsylvania College of Technology', description: 'Applied technology programs with hands-on training', state: 'PA', schoolType: 'technical', headquartersLat: '41.2412', headquartersLng: '-77.0018' },
  // Community Colleges
  { name: 'Sinclair Community College', description: 'Comprehensive community college with advanced manufacturing programs', state: 'OH', schoolType: 'community_college', headquartersLat: '39.7597', headquartersLng: '-84.1916' },
  { name: 'Central Piedmont Community College', description: 'Manufacturing and machining technology programs', state: 'NC', schoolType: 'community_college', headquartersLat: '35.2271', headquartersLng: '-80.8431' },
  { name: 'Ivy Tech Community College', description: 'Indiana statewide community college system', state: 'IN', schoolType: 'community_college', headquartersLat: '39.7684', headquartersLng: '-86.1581' },
  { name: 'Lorain County Community College', description: 'Manufacturing and engineering technology programs', state: 'OH', schoolType: 'community_college', headquartersLat: '41.4660', headquartersLng: '-82.1740' },
  // Universities with Manufacturing Programs
  { name: 'Purdue University', description: 'School of Engineering Technology with manufacturing focus', state: 'IN', schoolType: 'university', headquartersLat: '40.4237', headquartersLng: '-86.9212' },
  { name: 'Georgia Institute of Technology', description: 'Advanced manufacturing and materials engineering', state: 'GA', schoolType: 'university', headquartersLat: '33.7756', headquartersLng: '-84.3963' },
  { name: 'MIT', description: 'Leading research in advanced manufacturing and materials', state: 'MA', schoolType: 'university', headquartersLat: '42.3601', headquartersLng: '-71.0942' },
  // Apprenticeship Programs
  { name: 'AJAC Aerospace Joint Apprenticeship Committee', description: 'Washington State aerospace apprenticeship program', state: 'WA', schoolType: 'apprenticeship', headquartersLat: '47.4502', headquartersLng: '-122.3088' },
  { name: 'UAW-Ford Joint Apprenticeship', description: 'Automotive manufacturing skilled trades program', state: 'MI', schoolType: 'apprenticeship', headquartersLat: '42.3314', headquartersLng: '-83.0458' },
  // Online/Hybrid
  { name: 'Tooling U-SME', description: 'Online manufacturing training platform', state: 'OH', schoolType: 'online', headquartersLat: '41.4993', headquartersLng: '-81.6944' },
  { name: 'SANS Manufacturing Academy', description: 'Smart manufacturing and Industry 4.0 training', state: 'TX', schoolType: 'online', headquartersLat: '32.7767', headquartersLng: '-96.7970' },
];

// ============================================
// PROGRAMS DATA - Training Programs
// ============================================

const PROGRAMS_DATA: Array<{
  schoolName: string;
  title: string;
  description: string;
  cipCode?: string;
  credentialType: string;
  durationHours?: number;
  skillNames: string[]; // Skills taught by this program
}> = [
  // CNC Machining Programs
  { schoolName: 'Lincoln Tech', title: 'CNC Machining Technology', description: 'Comprehensive CNC machining training covering setup, operation, and programming', cipCode: '48.0503', credentialType: 'certificate', durationHours: 900, skillNames: ['CNC Operation', 'Blueprint Reading', 'GD&T Interpretation', 'Micrometer Reading', 'Caliper Measurement'] },
  { schoolName: 'Sinclair Community College', title: 'Computer Integrated Machining AAS', description: 'Two-year degree in precision machining and manufacturing', cipCode: '48.0503', credentialType: 'degree', durationHours: 2000, skillNames: ['CNC Operation', 'CNC Programming', 'CAM Software', 'Blueprint Reading', 'GD&T Interpretation'] },
  { schoolName: 'Universal Technical Institute', title: 'CNC Machining Specialist', description: 'Hands-on CNC training for entry-level machinist positions', cipCode: '48.0503', credentialType: 'certificate', durationHours: 720, skillNames: ['CNC Operation', 'Manual Machining', 'Blueprint Reading', 'Caliper Measurement'] },
  // Welding Programs
  { schoolName: 'Tulsa Welding School', title: 'Welding Specialist', description: 'Comprehensive welding training covering SMAW, GMAW, GTAW', cipCode: '48.0508', credentialType: 'certificate', durationHours: 900, skillNames: ['GMAW Welding', 'GTAW Welding', 'SMAW Welding', 'Blueprint Reading', 'Welding Inspection'] },
  { schoolName: 'Tulsa Welding School', title: 'Pipefitting and Welding', description: 'Combined pipefitting and welding for industrial applications', cipCode: '48.0508', credentialType: 'certificate', durationHours: 1200, skillNames: ['GTAW Welding', 'Pipe Fitting', 'Blueprint Reading', 'SMAW Welding'] },
  { schoolName: 'Lincoln Tech', title: 'Welding Technology', description: 'AWS-aligned welding program with multiple process training', cipCode: '48.0508', credentialType: 'certificate', durationHours: 800, skillNames: ['GMAW Welding', 'GTAW Welding', 'Blueprint Reading', 'Welding Inspection'] },
  // Composites Programs
  { schoolName: 'AJAC Aerospace Joint Apprenticeship Committee', title: 'Composite Technician Apprenticeship', description: 'Four-year apprenticeship in aerospace composite fabrication', cipCode: '15.0613', credentialType: 'apprenticeship', durationHours: 8000, skillNames: ['Composite Layup', 'Autoclave Operation', 'Vacuum Bagging', 'Blueprint Reading', 'NDT - Visual Inspection'] },
  { schoolName: 'Pennsylvania College of Technology', title: 'Composite Manufacturing', description: 'Associate degree in composite materials and processes', cipCode: '15.0613', credentialType: 'degree', durationHours: 2000, skillNames: ['Composite Layup', 'Resin Infusion', 'Autoclave Operation', 'Blueprint Reading'] },
  // Quality/Inspection Programs
  { schoolName: 'Sinclair Community College', title: 'Quality Assurance Technology', description: 'Associate degree in quality control and inspection methods', cipCode: '15.0702', credentialType: 'degree', durationHours: 2000, skillNames: ['CMM Operation', 'GD&T Interpretation', 'Statistical Process Control', 'Blueprint Reading', 'Caliper Measurement'] },
  { schoolName: 'Tooling U-SME', title: 'Blueprint Reading Fundamentals', description: 'Online course in engineering drawing interpretation', credentialType: 'course', durationHours: 40, skillNames: ['Blueprint Reading', 'GD&T Interpretation'] },
  { schoolName: 'Tooling U-SME', title: 'GD&T Applications', description: 'Advanced geometric dimensioning and tolerancing', credentialType: 'course', durationHours: 60, skillNames: ['GD&T Interpretation', 'CMM Operation'] },
  // Automation/Robotics Programs
  { schoolName: 'Ivy Tech Community College', title: 'Industrial Automation Technology', description: 'Training in PLCs, robotics, and industrial controls', cipCode: '15.0406', credentialType: 'certificate', durationHours: 1000, skillNames: ['PLC Programming', 'Robot Programming', 'Electrical Troubleshooting', 'Blueprint Reading'] },
  { schoolName: 'Georgia Institute of Technology', title: 'Advanced Manufacturing Certificate', description: 'Graduate-level certificate in smart manufacturing', credentialType: 'certificate', durationHours: 400, skillNames: ['PLC Programming', 'Statistical Process Control', 'CAM Software'] },
  // Maintenance Programs
  { schoolName: 'UAW-Ford Joint Apprenticeship', title: 'Industrial Maintenance Technician', description: 'Four-year apprenticeship in manufacturing maintenance', cipCode: '47.0303', credentialType: 'apprenticeship', durationHours: 8000, skillNames: ['PLC Programming', 'Electrical Troubleshooting', 'Hydraulic Systems', 'Pneumatic Systems'] },
  // NDT Programs
  { schoolName: 'Pennsylvania College of Technology', title: 'Nondestructive Testing Technology', description: 'Associate degree in NDT methods and applications', cipCode: '41.0204', credentialType: 'degree', durationHours: 2000, skillNames: ['NDT - Ultrasonic Testing', 'NDT - Dye Penetrant', 'NDT - Magnetic Particle', 'NDT - Visual Inspection', 'Blueprint Reading'] },
];

// ============================================
// SKILL TREE STRUCTURE
// ============================================

// Define parent-child skill relationships
// Format: { parentName: [childSkillName1, childSkillName2, ...] }
const SKILL_TREE: Record<string, string[]> = {
  // Manufacturing (root category - depth 1)
  'Manufacturing': [
    'Machining',
    'Welding & Fabrication',
    'Composites',
    'Quality & Inspection',
    'Assembly',
  ],
  // Machining (depth 2)
  'Machining': [
    'CNC Machining',
    'Manual Machining',
    'EDM',
  ],
  // CNC Machining (depth 3)
  'CNC Machining': [
    'CNC Operation',
    'CNC Programming',
    'Multi-Axis Machining',
  ],
  // Welding (depth 2)
  'Welding & Fabrication': [
    'Arc Welding',
    'Resistance Welding',
    'Brazing & Soldering',
  ],
  // Arc Welding (depth 3)
  'Arc Welding': [
    'GMAW Welding',
    'GTAW Welding',
    'SMAW Welding',
    'FCAW Welding',
  ],
  // Quality & Inspection (depth 2)
  'Quality & Inspection': [
    'Dimensional Inspection',
    'NDT Methods',
    'Quality Systems',
  ],
  // Dimensional Inspection (depth 3)
  'Dimensional Inspection': [
    'CMM Operation',
    'GD&T Interpretation',
    'Caliper Measurement',
    'Micrometer Reading',
  ],
  // NDT Methods (depth 3)
  'NDT Methods': [
    'NDT - Ultrasonic Testing',
    'NDT - Dye Penetrant',
    'NDT - Magnetic Particle',
    'NDT - X-Ray Inspection',
    'NDT - Visual Inspection',
  ],
};

// Skills that should be linked to specific refs (skill name -> ref names)
const SKILL_REF_LINKS: Record<string, string[]> = {
  'CNC Operation': ['Haas VF-4', 'DMG MORI DMU 50', 'Mazak Integrex i-200'],
  'CNC Programming': ['Mastercam Associate'],
  'CMM Operation': ['Zeiss Contura', 'FARO Edge'],
  'GMAW Welding': ['Lincoln PowerWave S500', 'Fronius TransSteel 5000', 'AWS D1.1'],
  'GTAW Welding': ['Miller Dynasty 400', 'AWS D17.1'],
  'GD&T Interpretation': ['ASME Y14.5-2018', 'ISO 1101:2017'],
  'NDT - Ultrasonic Testing': ['ASNT Level II UT', 'NAS 410'],
  'Composite Layup': ['Carbon Fiber T700', 'Epoxy 3501-6', 'Kevlar 49'],
  'Heat Treatment': ['Annealing', 'Hardening', 'Tempering', 'AMS 2750'],
  'Anodizing': ['Anodizing Type II', 'Anodizing Type III'],
};

// ============================================
// SEED FUNCTION
// ============================================

async function seedElements() {
  try {
    console.log('='.repeat(50));
    console.log('SEEDING ELEMENTS (Refs, Schools, Programs)');
    console.log('='.repeat(50));
    console.log();

    // ========================================
    // SEED REFS
    // ========================================
    console.log('Seeding refs (elements library)...');

    // Combine all refs with type annotation
    const allRefs = [
      ...MATERIALS.map(m => ({ ...m, type: 'material' as const })),
      ...MACHINES.map(m => ({ ...m, type: 'machine' as const })),
      ...STANDARDS.map(s => ({ ...s, type: 'standard' as const })),
      ...PROCESSES.map(p => ({ ...p, type: 'process' as const })),
      ...CERTIFICATIONS.map(c => ({ ...c, type: 'certification' as const })),
    ];

    const refValues = allRefs.map(ref => ({
      type: ref.type,
      name: ref.name,
      description: ref.description,
      manufacturer: 'manufacturer' in ref ? ref.manufacturer : null,
      tags: 'tags' in ref ? ref.tags : null,
      properties: 'properties' in ref ? ref.properties : null,
    }));

    // Insert refs (upsert - skip if name+type already exists)
    const insertedRefs: Array<{ id: string; name: string; type: string }> = [];
    for (const refValue of refValues) {
      try {
        const [inserted] = await db.insert(refs).values(refValue).returning();
        insertedRefs.push(inserted);
      } catch {
        // Skip duplicates
      }
    }
    console.log(`Inserted ${insertedRefs.length} refs.\n`);

    // Create ref name -> id map
    const refMap = new Map<string, string>();
    insertedRefs.forEach(ref => refMap.set(ref.name, ref.id));

    // ========================================
    // SEED SCHOOLS
    // ========================================
    console.log('Seeding schools...');

    const schoolValues = SCHOOLS_DATA.map(school => ({
      name: school.name,
      description: school.description,
      state: school.state,
      schoolType: school.schoolType,
      headquartersLat: school.headquartersLat,
      headquartersLng: school.headquartersLng,
    }));

    const insertedSchools: Array<{ id: string; name: string }> = [];
    for (const schoolValue of schoolValues) {
      try {
        const [inserted] = await db.insert(schools).values(schoolValue).returning();
        insertedSchools.push(inserted);
      } catch {
        // Skip duplicates
      }
    }
    console.log(`Inserted ${insertedSchools.length} schools.\n`);

    // Create school name -> id map
    const schoolMap = new Map<string, string>();
    insertedSchools.forEach(school => schoolMap.set(school.name, school.id));

    // ========================================
    // SEED PROGRAMS
    // ========================================
    console.log('Seeding programs...');

    // First get all skills from database for linking
    const existingSkills = await db.select({ id: skills.id, name: skills.name }).from(skills);
    const skillMap = new Map<string, string>();
    existingSkills.forEach(skill => skillMap.set(skill.name, skill.id));

    const insertedPrograms: Array<{ id: string; title: string; skillNames: string[] }> = [];
    for (const program of PROGRAMS_DATA) {
      const schoolId = schoolMap.get(program.schoolName);
      if (!schoolId) continue;

      try {
        const [inserted] = await db.insert(programs).values({
          schoolId,
          title: program.title,
          description: program.description,
          cipCode: program.cipCode || null,
          credentialType: program.credentialType,
          durationHours: program.durationHours || null,
        }).returning();
        insertedPrograms.push({ ...inserted, skillNames: program.skillNames });
      } catch {
        // Skip duplicates
      }
    }
    console.log(`Inserted ${insertedPrograms.length} programs.\n`);

    // ========================================
    // SEED PROGRAM_SKILLS JUNCTION
    // ========================================
    console.log('Creating program-skill relationships...');

    const programSkillValues: Array<{ programId: string; skillId: string }> = [];
    for (const program of insertedPrograms) {
      for (const skillName of program.skillNames) {
        const skillId = skillMap.get(skillName);
        if (skillId) {
          programSkillValues.push({ programId: program.id, skillId });
        }
      }
    }

    if (programSkillValues.length > 0) {
      for (const psValue of programSkillValues) {
        try {
          await db.insert(programSkills).values(psValue);
        } catch {
          // Skip duplicates
        }
      }
    }
    console.log(`Created ${programSkillValues.length} program-skill relationships.\n`);

    // ========================================
    // SEED SKILL_REFS JUNCTION
    // ========================================
    console.log('Creating skill-ref relationships...');

    const skillRefValues: Array<{ skillId: string; refId: string }> = [];
    for (const [skillName, refNames] of Object.entries(SKILL_REF_LINKS)) {
      const skillId = skillMap.get(skillName);
      if (!skillId) continue;

      for (const refName of refNames) {
        const refId = refMap.get(refName);
        if (refId) {
          skillRefValues.push({ skillId, refId });
        }
      }
    }

    if (skillRefValues.length > 0) {
      for (const srValue of skillRefValues) {
        try {
          await db.insert(skillRefs).values(srValue);
        } catch {
          // Skip duplicates
        }
      }
    }
    console.log(`Created ${skillRefValues.length} skill-ref relationships.\n`);

    // ========================================
    // UPDATE SKILL TREE (parent_skill_id)
    // ========================================
    console.log('Building skill tree (parent-child relationships)...');

    // First, ensure root skill exists
    let rootSkillId: string | undefined;
    const existingRoot = await db.select().from(skills).where(eq(skills.name, 'Manufacturing'));
    if (existingRoot.length === 0) {
      const [rootSkill] = await db.insert(skills).values({
        name: 'Manufacturing',
        description: 'Root category for all manufacturing skills',
        category: 'Root',
      }).returning();
      rootSkillId = rootSkill.id;
      skillMap.set('Manufacturing', rootSkillId);
    } else {
      rootSkillId = existingRoot[0].id;
      skillMap.set('Manufacturing', rootSkillId);
    }

    // Also ensure intermediate category skills exist
    const categorySkills = [
      { name: 'Machining', description: 'Machining skills and processes', category: 'Category' },
      { name: 'Welding & Fabrication', description: 'Welding and metal fabrication skills', category: 'Category' },
      { name: 'Composites', description: 'Composite material skills', category: 'Category' },
      { name: 'Quality & Inspection', description: 'Quality control and inspection skills', category: 'Category' },
      { name: 'Assembly', description: 'Assembly and integration skills', category: 'Category' },
      { name: 'CNC Machining', description: 'CNC-specific machining skills', category: 'Subcategory' },
      { name: 'Manual Machining', description: 'Manual machining skills', category: 'Subcategory' },
      { name: 'EDM', description: 'Electrical discharge machining', category: 'Subcategory' },
      { name: 'Arc Welding', description: 'Arc welding processes', category: 'Subcategory' },
      { name: 'Resistance Welding', description: 'Resistance welding processes', category: 'Subcategory' },
      { name: 'Brazing & Soldering', description: 'Brazing and soldering processes', category: 'Subcategory' },
      { name: 'Dimensional Inspection', description: 'Dimensional measurement and inspection', category: 'Subcategory' },
      { name: 'NDT Methods', description: 'Non-destructive testing methods', category: 'Subcategory' },
      { name: 'Quality Systems', description: 'Quality management systems', category: 'Subcategory' },
      { name: 'Multi-Axis Machining', description: '4-axis and 5-axis CNC machining', category: 'Skill' },
    ];

    for (const catSkill of categorySkills) {
      const existing = await db.select().from(skills).where(eq(skills.name, catSkill.name));
      if (existing.length === 0) {
        const [inserted] = await db.insert(skills).values(catSkill).returning();
        skillMap.set(catSkill.name, inserted.id);
      } else {
        skillMap.set(catSkill.name, existing[0].id);
      }
    }

    // Now set parent-child relationships
    let treeLinksCreated = 0;
    for (const [parentName, childNames] of Object.entries(SKILL_TREE)) {
      const parentId = skillMap.get(parentName);
      if (!parentId) continue;

      for (const childName of childNames) {
        const childId = skillMap.get(childName);
        if (!childId) continue;

        // Update child's parent_skill_id
        await db.update(skills)
          .set({ parentSkillId: parentId })
          .where(eq(skills.id, childId));
        treeLinksCreated++;
      }
    }
    console.log(`Created ${treeLinksCreated} skill tree relationships.\n`);

    // ========================================
    // SUMMARY
    // ========================================
    console.log('='.repeat(50));
    console.log('SEED ELEMENTS COMPLETE');
    console.log('='.repeat(50));
    console.log(`Refs: ${insertedRefs.length}`);
    console.log(`  - Materials: ${MATERIALS.length}`);
    console.log(`  - Machines: ${MACHINES.length}`);
    console.log(`  - Standards: ${STANDARDS.length}`);
    console.log(`  - Processes: ${PROCESSES.length}`);
    console.log(`  - Certifications: ${CERTIFICATIONS.length}`);
    console.log(`Schools: ${insertedSchools.length}`);
    console.log(`Programs: ${insertedPrograms.length}`);
    console.log(`Program-Skill Links: ${programSkillValues.length}`);
    console.log(`Skill-Ref Links: ${skillRefValues.length}`);
    console.log(`Skill Tree Links: ${treeLinksCreated}`);
    console.log('='.repeat(50));

    process.exit(0);
  } catch (error) {
    console.error('Seed elements failed:', error);
    process.exit(1);
  }
}

seedElements();
