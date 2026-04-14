import { db } from '../db';
import {
  states,
  industries,
  skillCategories,
  companies,
  companyIndustries,
  factories,
  occupations,
  skills,
  factoryOccupations,
  occupationSkills,
} from '../db/schema';

// ============================================
// US STATES DATA (50 states + DC)
// ============================================

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

// ============================================
// INDUSTRIES (10 controlled vocabulary items)
// ============================================

const INDUSTRIES_DATA = [
  { name: 'Aerospace & Defense', description: 'Aircraft, spacecraft, missiles, and defense equipment manufacturing' },
  { name: 'Agriculture & Food', description: 'Food processing, agricultural equipment, and food packaging' },
  { name: 'Automotive', description: 'Vehicle manufacturing, parts, and automotive components' },
  { name: 'Construction', description: 'Building materials, construction equipment, and prefabrication' },
  { name: 'Electronics', description: 'Electronic components, semiconductors, and consumer electronics' },
  { name: 'Energy', description: 'Oil & gas equipment, renewable energy, and power generation' },
  { name: 'Industrial Machinery', description: 'Heavy machinery, industrial equipment, and automation systems' },
  { name: 'Medical & Pharmaceuticals', description: 'Medical devices, pharmaceuticals, and healthcare equipment' },
  { name: 'Metals & Fabrication', description: 'Steel production, metal fabrication, and foundries' },
  { name: 'Polymers & Composites', description: 'Plastics, rubber, composites, and polymer processing' },
];

// ============================================
// SKILL CATEGORIES (8 controlled vocabulary items)
// ============================================

const SKILL_CATEGORIES_DATA = [
  { name: 'Machining', description: 'CNC operation, manual machining, and precision cutting' },
  { name: 'Welding & Fabrication', description: 'Welding techniques, metal forming, and fabrication' },
  { name: 'Quality & Measurement', description: 'Quality control, inspection, metrology, and standards' },
  { name: 'Assembly & Electronics', description: 'Mechanical assembly, soldering, and circuit board work' },
  { name: 'Electrical Systems', description: 'Electrical wiring, motor controls, and troubleshooting' },
  { name: 'Software & Programming', description: 'CAD/CAM, PLC programming, and CNC programming' },
  { name: 'Material Handling', description: 'Forklift, crane operation, and equipment handling' },
  { name: 'Maintenance & Repair', description: 'Hydraulics, pneumatics, and equipment maintenance' },
];

// ============================================
// COMPANIES DATA (20 fictional companies with industry links)
// ============================================

const COMPANIES_DATA = [
  { name: 'Apex Manufacturing Corp', description: 'Leading manufacturer of precision industrial machinery', industries: ['Industrial Machinery'] },
  { name: 'Midwest Steel Industries', description: 'Integrated steel producer serving automotive and construction', industries: ['Metals & Fabrication', 'Automotive'] },
  { name: 'Pacific Aerospace Components', description: 'Precision aerospace components for commercial and defense', industries: ['Aerospace & Defense'] },
  { name: 'Great Lakes Automotive', description: 'Tier-1 automotive supplier specializing in powertrain', industries: ['Automotive'] },
  { name: 'Southern Plastics Inc', description: 'Custom injection molding and plastic fabrication', industries: ['Polymers & Composites'] },
  { name: 'Mountain West Fabrication', description: 'Heavy metal fabrication for mining and construction', industries: ['Metals & Fabrication', 'Construction'] },
  { name: 'Atlantic Precision Tools', description: 'Precision cutting tools and industrial dies', industries: ['Industrial Machinery', 'Metals & Fabrication'] },
  { name: 'Heartland Food Processing', description: 'Large-scale food processing and packaging', industries: ['Agriculture & Food'] },
  { name: 'Sunbelt Electronics Assembly', description: 'Contract electronics manufacturing and PCB assembly', industries: ['Electronics'] },
  { name: 'Northern Textiles Group', description: 'Technical textiles and industrial fabric manufacturing', industries: ['Polymers & Composites'] },
  { name: 'Coastal Chemical Works', description: 'Specialty chemicals and industrial compounds', industries: ['Energy'] },
  { name: 'Prairie Wind Energy Systems', description: 'Wind turbine components and renewable energy equipment', industries: ['Energy', 'Industrial Machinery'] },
  { name: 'Valley Medical Devices', description: 'FDA-regulated medical device manufacturing', industries: ['Medical & Pharmaceuticals'] },
  { name: 'Desert Sun Solar Manufacturing', description: 'Photovoltaic panel and solar equipment production', industries: ['Energy', 'Electronics'] },
  { name: 'Timber Ridge Wood Products', description: 'Engineered wood products and lumber processing', industries: ['Construction'] },
  { name: 'Liberty Defense Systems', description: 'Defense contractor specializing in tactical equipment', industries: ['Aerospace & Defense'] },
  { name: 'Riverfront Packaging Solutions', description: 'Sustainable packaging materials and containers', industries: ['Agriculture & Food', 'Polymers & Composites'] },
  { name: 'Summit Semiconductor', description: 'Semiconductor fabrication and chip packaging', industries: ['Electronics'] },
  { name: 'Bayshore Marine Manufacturing', description: 'Commercial and recreational marine vessels', industries: ['Metals & Fabrication', 'Polymers & Composites'] },
  { name: 'Central States Machinery', description: 'Agricultural and construction heavy equipment', industries: ['Industrial Machinery', 'Agriculture & Food'] },
];

// ============================================
// TOP 50 US MANUFACTURING COMPANIES (Real companies with HQ locations)
// ============================================

const TOP_50_MANUFACTURING_COMPANIES = [
  { name: 'Apple Inc.', industries: ['Electronics'], description: 'Consumer electronics, software, and online services company', lat: '37.3349', lng: '-122.0090' },
  { name: 'Ford Motor Company', industries: ['Automotive'], description: 'Multinational automaker manufacturing cars, trucks, and SUVs', lat: '42.3112', lng: '-83.2148' },
  { name: 'General Motors', industries: ['Automotive'], description: 'Global automotive manufacturer and mobility company', lat: '42.3314', lng: '-83.0458' },
  { name: 'Boeing', industries: ['Aerospace & Defense'], description: 'Aerospace company manufacturing commercial jetliners and defense systems', lat: '41.8846', lng: '-87.6366' },
  { name: 'Intel Corporation', industries: ['Electronics'], description: 'Semiconductor chip manufacturer and computing technology leader', lat: '37.3875', lng: '-121.9636' },
  { name: 'Caterpillar Inc.', industries: ['Industrial Machinery', 'Construction'], description: 'Construction and mining equipment manufacturer', lat: '40.6936', lng: '-89.5890' },
  { name: '3M Company', industries: ['Industrial Machinery', 'Medical & Pharmaceuticals'], description: 'Diversified technology company with industrial and consumer products', lat: '44.9493', lng: '-93.0235' },
  { name: 'Honeywell International', industries: ['Aerospace & Defense', 'Industrial Machinery'], description: 'Technology and manufacturing company for aerospace and building solutions', lat: '35.2114', lng: '-80.8308' },
  { name: 'Johnson & Johnson', industries: ['Medical & Pharmaceuticals'], description: 'Medical devices, pharmaceuticals, and consumer health products', lat: '40.4871', lng: '-74.4440' },
  { name: 'Procter & Gamble', industries: ['Agriculture & Food', 'Polymers & Composites'], description: 'Consumer goods corporation with household and personal care products', lat: '39.1000', lng: '-84.5074' },
  { name: 'PepsiCo', industries: ['Agriculture & Food'], description: 'Food, snack, and beverage corporation', lat: '41.0489', lng: '-73.7005' },
  { name: 'Coca-Cola Company', industries: ['Agriculture & Food'], description: 'Beverage manufacturer and distributor', lat: '33.7676', lng: '-84.3880' },
  { name: 'Lockheed Martin', industries: ['Aerospace & Defense'], description: 'Aerospace and defense technology corporation', lat: '38.9314', lng: '-77.2151' },
  { name: 'Raytheon Technologies', industries: ['Aerospace & Defense'], description: 'Aerospace and defense systems manufacturer', lat: '38.8779', lng: '-77.3327' },
  { name: 'Northrop Grumman', industries: ['Aerospace & Defense'], description: 'Global aerospace and defense technology company', lat: '38.9252', lng: '-77.2336' },
  { name: 'General Dynamics', industries: ['Aerospace & Defense'], description: 'Aerospace and defense corporation', lat: '38.8785', lng: '-77.1079' },
  { name: 'Deere & Company', industries: ['Industrial Machinery', 'Agriculture & Food'], description: 'Agricultural and construction machinery manufacturer', lat: '41.5209', lng: '-90.5724' },
  { name: 'Dow Inc.', industries: ['Polymers & Composites', 'Energy'], description: 'Materials science company producing plastics and chemicals', lat: '43.6253', lng: '-84.2462' },
  { name: 'DuPont', industries: ['Polymers & Composites'], description: 'Specialty products and materials company', lat: '39.7473', lng: '-75.5432' },
  { name: 'Micron Technology', industries: ['Electronics'], description: 'Computer memory and storage manufacturer', lat: '43.6150', lng: '-116.2023' },
  { name: 'Texas Instruments', industries: ['Electronics'], description: 'Semiconductor design and manufacturing company', lat: '32.9084', lng: '-96.7508' },
  { name: 'Applied Materials', industries: ['Electronics', 'Industrial Machinery'], description: 'Semiconductor and display manufacturing equipment', lat: '37.3851', lng: '-122.0088' },
  { name: 'Qualcomm', industries: ['Electronics'], description: 'Semiconductor and telecommunications equipment company', lat: '32.8998', lng: '-117.2014' },
  { name: 'NVIDIA', industries: ['Electronics'], description: 'GPU and AI computing technology manufacturer', lat: '37.3707', lng: '-122.0375' },
  { name: 'AMD', industries: ['Electronics'], description: 'Semiconductor company specializing in CPUs and GPUs', lat: '37.3791', lng: '-121.9650' },
  { name: 'Tesla Inc.', industries: ['Automotive', 'Energy'], description: 'Electric vehicle and clean energy company', lat: '30.2226', lng: '-97.6199' },
  { name: 'Rivian', industries: ['Automotive'], description: 'Electric vehicle manufacturer focused on trucks and SUVs', lat: '37.4167', lng: '-122.1472' },
  { name: 'General Electric', industries: ['Energy', 'Aerospace & Defense', 'Industrial Machinery'], description: 'Diversified industrial and technology conglomerate', lat: '42.1159', lng: '-72.7993' },
  { name: 'Emerson Electric', industries: ['Industrial Machinery', 'Electronics'], description: 'Technology and engineering solutions company', lat: '38.6543', lng: '-90.3997' },
  { name: 'Illinois Tool Works', industries: ['Industrial Machinery'], description: 'Diversified manufacturer of industrial equipment and components', lat: '42.0903', lng: '-87.9716' },
  { name: 'Parker Hannifin', industries: ['Industrial Machinery', 'Aerospace & Defense'], description: 'Motion and control technologies manufacturer', lat: '41.4840', lng: '-81.7599' },
  { name: 'Rockwell Automation', industries: ['Industrial Machinery', 'Electronics'], description: 'Industrial automation and digital transformation technology', lat: '43.0370', lng: '-87.9105' },
  { name: 'Cummins Inc.', industries: ['Automotive', 'Industrial Machinery'], description: 'Diesel and alternative fuel engines and generators', lat: '39.1978', lng: '-85.9214' },
  { name: 'PACCAR Inc.', industries: ['Automotive', 'Industrial Machinery'], description: 'Commercial truck manufacturer', lat: '47.4431', lng: '-122.2962' },
  { name: 'Oshkosh Corporation', industries: ['Automotive', 'Aerospace & Defense'], description: 'Specialty vehicles and truck bodies manufacturer', lat: '44.0183', lng: '-88.5616' },
  { name: 'Textron Inc.', industries: ['Aerospace & Defense', 'Industrial Machinery'], description: 'Multi-industry company with aircraft and defense products', lat: '41.8261', lng: '-71.4078' },
  { name: 'Spirit AeroSystems', industries: ['Aerospace & Defense'], description: 'Aerostructures manufacturer for commercial and defense markets', lat: '37.6922', lng: '-97.3301' },
  { name: 'Howmet Aerospace', industries: ['Aerospace & Defense', 'Metals & Fabrication'], description: 'Engineered metal products for aerospace and industrial', lat: '40.4485', lng: '-79.9508' },
  { name: 'Ball Corporation', industries: ['Metals & Fabrication', 'Aerospace & Defense'], description: 'Aluminum packaging and aerospace technology manufacturer', lat: '39.9986', lng: '-105.2611' },
  { name: 'Packaging Corp of America', industries: ['Agriculture & Food', 'Polymers & Composites'], description: 'Containerboard and corrugated packaging producer', lat: '41.6820', lng: '-88.3467' },
  { name: 'Whirlpool Corporation', industries: ['Electronics', 'Industrial Machinery'], description: 'Home appliances manufacturer', lat: '42.1120', lng: '-86.4547' },
  { name: 'Stanley Black & Decker', industries: ['Industrial Machinery', 'Construction'], description: 'Tools and industrial equipment manufacturer', lat: '41.3083', lng: '-72.9279' },
  { name: 'Snap-on Inc.', industries: ['Industrial Machinery', 'Automotive'], description: 'Professional tools and equipment manufacturer', lat: '42.6386', lng: '-87.8560' },
  { name: 'Lincoln Electric', industries: ['Industrial Machinery', 'Metals & Fabrication'], description: 'Welding and cutting products manufacturer', lat: '41.4839', lng: '-81.5322' },
  { name: 'Nucor Corporation', industries: ['Metals & Fabrication'], description: 'Steel and steel products manufacturer', lat: '35.2236', lng: '-80.8432' },
  { name: 'Steel Dynamics', industries: ['Metals & Fabrication'], description: 'Steel producer and metals recycler', lat: '40.7525', lng: '-85.1708' },
  { name: 'Freeport-McMoRan', industries: ['Metals & Fabrication', 'Energy'], description: 'Mining company producing copper, gold, and molybdenum', lat: '33.4511', lng: '-112.0682' },
  { name: 'Alcoa Corporation', industries: ['Metals & Fabrication'], description: 'Aluminum producer and fabricator', lat: '40.4481', lng: '-79.9436' },
  { name: 'Eastman Chemical', industries: ['Polymers & Composites', 'Energy'], description: 'Specialty materials and additives manufacturer', lat: '36.3152', lng: '-82.3727' },
  { name: 'PPG Industries', industries: ['Polymers & Composites', 'Construction'], description: 'Paints, coatings, and specialty materials manufacturer', lat: '40.4378', lng: '-79.9969' },
];

// ============================================
// OCCUPATIONS DATA (30 with O*NET codes)
// ============================================

const OCCUPATIONS_DATA = [
  { title: 'CNC Machine Operator', onetCode: '51-4011.00', description: 'Operate computer-controlled machine tools to fabricate parts' },
  { title: 'Machinist', onetCode: '51-4041.00', description: 'Set up and operate machine tools to produce precision metal parts' },
  { title: 'Welder', onetCode: '51-4121.00', description: 'Join metal parts using welding equipment' },
  { title: 'Quality Control Inspector', onetCode: '51-9061.00', description: 'Inspect products and materials for defects and compliance' },
  { title: 'Industrial Engineer', onetCode: '17-2112.00', description: 'Design efficient systems for manufacturing processes' },
  { title: 'Mechanical Engineer', onetCode: '17-2141.00', description: 'Design and develop mechanical devices and systems' },
  { title: 'Electrical Engineer', onetCode: '17-2071.00', description: 'Design electrical systems and components' },
  { title: 'Production Supervisor', onetCode: '51-1011.00', description: 'Supervise and coordinate activities of production workers' },
  { title: 'Maintenance Technician', onetCode: '49-9071.00', description: 'Maintain and repair industrial machinery and equipment' },
  { title: 'Tool and Die Maker', onetCode: '51-4111.00', description: 'Construct precision tools, dies, and special guiding devices' },
  { title: 'Assembly Line Worker', onetCode: '51-2092.00', description: 'Assemble products on manufacturing production lines' },
  { title: 'Forklift Operator', onetCode: '53-7051.00', description: 'Operate forklifts to move materials in warehouses and plants' },
  { title: 'Shipping and Receiving Clerk', onetCode: '43-5071.00', description: 'Verify and maintain records on incoming and outgoing shipments' },
  { title: 'Materials Handler', onetCode: '53-7062.00', description: 'Move materials within plants and warehouses' },
  { title: 'Process Engineer', onetCode: '17-2199.00', description: 'Develop and optimize manufacturing processes' },
  { title: 'Safety Manager', onetCode: '11-9199.00', description: 'Develop and implement workplace safety programs' },
  { title: 'Manufacturing Technician', onetCode: '17-3029.00', description: 'Support manufacturing operations with technical expertise' },
  { title: 'Plant Manager', onetCode: '11-3051.00', description: 'Direct and coordinate plant operations' },
  { title: 'Robotics Technician', onetCode: '17-3024.00', description: 'Install, program, and maintain robotic systems' },
  { title: 'Sheet Metal Worker', onetCode: '51-4121.06', description: 'Fabricate and install sheet metal products' },
  { title: 'Painter, Industrial', onetCode: '51-9124.00', description: 'Apply paint and coatings to manufactured products' },
  { title: 'Chemical Operator', onetCode: '51-8091.00', description: 'Operate chemical processing equipment' },
  { title: 'Packaging Machine Operator', onetCode: '51-9111.00', description: 'Operate machines that package products' },
  { title: 'Injection Molding Operator', onetCode: '51-4072.00', description: 'Operate injection molding machines for plastic parts' },
  { title: 'CNC Programmer', onetCode: '51-4012.00', description: 'Write programs for CNC machine tools' },
  { title: 'Laser Cutting Operator', onetCode: '51-4031.00', description: 'Operate laser cutting equipment for precision cuts' },
  { title: 'Electronics Assembler', onetCode: '51-2022.00', description: 'Assemble electronic components and circuit boards' },
  { title: 'Quality Assurance Manager', onetCode: '11-3051.01', description: 'Manage quality control systems and processes' },
  { title: 'Lean Manufacturing Specialist', onetCode: '17-2112.01', description: 'Implement lean manufacturing principles' },
  { title: 'Supply Chain Coordinator', onetCode: '13-1081.00', description: 'Coordinate supply chain logistics and procurement' },
];

// ============================================
// SKILLS DATA (40 hard technical skills with category links)
// ============================================

const SKILLS_DATA = [
  // Machining (5)
  { name: 'CNC Programming', category: 'Machining', description: 'Writing and editing G-code programs for CNC machine tools' },
  { name: 'Manual Lathe Operation', category: 'Machining', description: 'Operating manual lathes for turning operations' },
  { name: 'Manual Mill Operation', category: 'Machining', description: 'Operating manual milling machines' },
  { name: 'Precision Grinding', category: 'Machining', description: 'Surface and cylindrical grinding operations' },
  { name: 'EDM Operation', category: 'Machining', description: 'Electrical Discharge Machining operation' },

  // Welding & Fabrication (5)
  { name: 'MIG Welding', category: 'Welding & Fabrication', description: 'Metal Inert Gas welding technique' },
  { name: 'TIG Welding', category: 'Welding & Fabrication', description: 'Tungsten Inert Gas welding technique' },
  { name: 'Stick Welding', category: 'Welding & Fabrication', description: 'Shielded Metal Arc Welding (SMAW)' },
  { name: 'Blueprint Reading', category: 'Welding & Fabrication', description: 'Reading and interpreting engineering drawings' },
  { name: 'Sheet Metal Forming', category: 'Welding & Fabrication', description: 'Bending, rolling, and forming sheet metal' },

  // Quality & Measurement (5)
  { name: 'GD&T Interpretation', category: 'Quality & Measurement', description: 'Geometric Dimensioning and Tolerancing' },
  { name: 'CMM Operation', category: 'Quality & Measurement', description: 'Operating Coordinate Measuring Machines' },
  { name: 'Micrometer Reading', category: 'Quality & Measurement', description: 'Precision measurement with micrometers' },
  { name: 'Caliper Measurement', category: 'Quality & Measurement', description: 'Using dial and digital calipers' },
  { name: 'Surface Roughness Testing', category: 'Quality & Measurement', description: 'Measuring surface finish with profilometers' },

  // Assembly & Electronics (5)
  { name: 'Through-Hole Soldering', category: 'Assembly & Electronics', description: 'Soldering through-hole electronic components' },
  { name: 'SMT Soldering', category: 'Assembly & Electronics', description: 'Surface Mount Technology soldering and rework' },
  { name: 'Wire Harness Assembly', category: 'Assembly & Electronics', description: 'Building wire harnesses and cable assemblies' },
  { name: 'Torque Wrench Usage', category: 'Assembly & Electronics', description: 'Applying precise torque specifications' },
  { name: 'Crimping and Termination', category: 'Assembly & Electronics', description: 'Wire crimping and connector termination' },

  // Electrical Systems (5)
  { name: 'Electrical Schematic Reading', category: 'Electrical Systems', description: 'Interpreting electrical schematics and diagrams' },
  { name: 'Motor Wiring', category: 'Electrical Systems', description: 'Wiring three-phase motors and controls' },
  { name: 'VFD Programming', category: 'Electrical Systems', description: 'Programming Variable Frequency Drives' },
  { name: 'Conduit Bending', category: 'Electrical Systems', description: 'Bending EMT and rigid conduit' },
  { name: 'Multimeter Testing', category: 'Electrical Systems', description: 'Using digital multimeters for circuit testing' },

  // Software & Programming (5)
  { name: 'CAD Modeling', category: 'Software & Programming', description: '3D modeling in SolidWorks or similar CAD software' },
  { name: 'CAM Programming', category: 'Software & Programming', description: 'Creating toolpaths in CAM software' },
  { name: 'PLC Ladder Logic', category: 'Software & Programming', description: 'Programming PLCs using ladder logic' },
  { name: 'HMI Development', category: 'Software & Programming', description: 'Developing Human Machine Interfaces' },
  { name: 'Robot Programming', category: 'Software & Programming', description: 'Programming industrial robots (Fanuc, ABB, KUKA)' },

  // Material Handling (5)
  { name: 'Forklift Operation', category: 'Material Handling', description: 'Operating sit-down and stand-up forklifts' },
  { name: 'Overhead Crane Operation', category: 'Material Handling', description: 'Operating bridge and gantry cranes' },
  { name: 'Rigging and Slinging', category: 'Material Handling', description: 'Proper rigging techniques for load handling' },
  { name: 'Pallet Jack Operation', category: 'Material Handling', description: 'Using manual and electric pallet jacks' },
  { name: 'Lift Table Operation', category: 'Material Handling', description: 'Operating hydraulic lift tables and platforms' },

  // Maintenance & Repair (5)
  { name: 'Hydraulic System Repair', category: 'Maintenance & Repair', description: 'Repairing hydraulic cylinders and valves' },
  { name: 'Pneumatic System Repair', category: 'Maintenance & Repair', description: 'Troubleshooting air systems and actuators' },
  { name: 'Bearing Replacement', category: 'Maintenance & Repair', description: 'Removing and installing bearings properly' },
  { name: 'Shaft Alignment', category: 'Maintenance & Repair', description: 'Laser and dial indicator shaft alignment' },
  { name: 'Pump Maintenance', category: 'Maintenance & Repair', description: 'Servicing centrifugal and positive displacement pumps' },
];

// ============================================
// FACTORY LOCATIONS (50 factories across states)
// ============================================

const FACTORY_LOCATIONS = [
  { state: 'MI', city: 'Detroit', lat: 42.3314, lng: -83.0458, specialization: 'Automotive Assembly' },
  { state: 'MI', city: 'Grand Rapids', lat: 42.9634, lng: -85.6681, specialization: 'Metal Fabrication' },
  { state: 'OH', city: 'Cleveland', lat: 41.4993, lng: -81.6944, specialization: 'Steel Processing' },
  { state: 'OH', city: 'Toledo', lat: 41.6528, lng: -83.5379, specialization: 'Glass Manufacturing' },
  { state: 'OH', city: 'Cincinnati', lat: 39.1031, lng: -84.5120, specialization: 'Machine Tools' },
  { state: 'IN', city: 'Indianapolis', lat: 39.7684, lng: -86.1581, specialization: 'Pharmaceutical' },
  { state: 'IN', city: 'Fort Wayne', lat: 41.0793, lng: -85.1394, specialization: 'Electronics Assembly' },
  { state: 'IL', city: 'Chicago', lat: 41.8781, lng: -87.6298, specialization: 'Food Processing' },
  { state: 'IL', city: 'Rockford', lat: 42.2711, lng: -89.0940, specialization: 'Aerospace Components' },
  { state: 'WI', city: 'Milwaukee', lat: 43.0389, lng: -87.9065, specialization: 'Heavy Machinery' },
  { state: 'WI', city: 'Green Bay', lat: 44.5133, lng: -88.0133, specialization: 'Paper Products' },
  { state: 'TX', city: 'Houston', lat: 29.7604, lng: -95.3698, specialization: 'Petrochemical' },
  { state: 'TX', city: 'Dallas', lat: 32.7767, lng: -96.7970, specialization: 'Semiconductor' },
  { state: 'TX', city: 'San Antonio', lat: 29.4241, lng: -98.4936, specialization: 'Aerospace' },
  { state: 'TX', city: 'Austin', lat: 30.2672, lng: -97.7431, specialization: 'Electronics' },
  { state: 'CA', city: 'Los Angeles', lat: 34.0522, lng: -118.2437, specialization: 'Aerospace' },
  { state: 'CA', city: 'San Jose', lat: 37.3382, lng: -121.8863, specialization: 'Semiconductor' },
  { state: 'CA', city: 'Fresno', lat: 36.7378, lng: -119.7871, specialization: 'Food Processing' },
  { state: 'CA', city: 'San Diego', lat: 32.7157, lng: -117.1611, specialization: 'Defense' },
  { state: 'PA', city: 'Pittsburgh', lat: 40.4406, lng: -79.9959, specialization: 'Steel' },
  { state: 'PA', city: 'Philadelphia', lat: 39.9526, lng: -75.1652, specialization: 'Pharmaceutical' },
  { state: 'NY', city: 'Buffalo', lat: 42.8864, lng: -78.8784, specialization: 'Automotive Parts' },
  { state: 'NY', city: 'Rochester', lat: 43.1566, lng: -77.6088, specialization: 'Optics' },
  { state: 'NC', city: 'Charlotte', lat: 35.2271, lng: -80.8431, specialization: 'Energy Equipment' },
  { state: 'NC', city: 'Greensboro', lat: 36.0726, lng: -79.7920, specialization: 'Textiles' },
  { state: 'SC', city: 'Greenville', lat: 34.8526, lng: -82.3940, specialization: 'Automotive' },
  { state: 'SC', city: 'Charleston', lat: 32.7765, lng: -79.9311, specialization: 'Aerospace' },
  { state: 'GA', city: 'Atlanta', lat: 33.7490, lng: -84.3880, specialization: 'Logistics Equipment' },
  { state: 'GA', city: 'Savannah', lat: 32.0809, lng: -81.0912, specialization: 'Paper Products' },
  { state: 'AL', city: 'Birmingham', lat: 33.5186, lng: -86.8104, specialization: 'Steel' },
  { state: 'AL', city: 'Huntsville', lat: 34.7304, lng: -86.5861, specialization: 'Aerospace' },
  { state: 'TN', city: 'Nashville', lat: 36.1627, lng: -86.7816, specialization: 'Healthcare Products' },
  { state: 'TN', city: 'Memphis', lat: 35.1495, lng: -90.0490, specialization: 'Medical Devices' },
  { state: 'KY', city: 'Louisville', lat: 38.2527, lng: -85.7585, specialization: 'Automotive' },
  { state: 'MO', city: 'St. Louis', lat: 38.6270, lng: -90.1994, specialization: 'Aerospace' },
  { state: 'MO', city: 'Kansas City', lat: 39.0997, lng: -94.5786, specialization: 'Agricultural Equipment' },
  { state: 'KS', city: 'Wichita', lat: 37.6872, lng: -97.3301, specialization: 'Aircraft' },
  { state: 'NE', city: 'Omaha', lat: 41.2565, lng: -95.9345, specialization: 'Food Processing' },
  { state: 'IA', city: 'Des Moines', lat: 41.5868, lng: -93.6250, specialization: 'Agricultural Machinery' },
  { state: 'MN', city: 'Minneapolis', lat: 44.9778, lng: -93.2650, specialization: 'Medical Devices' },
  { state: 'WA', city: 'Seattle', lat: 47.6062, lng: -122.3321, specialization: 'Aerospace' },
  { state: 'WA', city: 'Spokane', lat: 47.6587, lng: -117.4260, specialization: 'Aluminum' },
  { state: 'OR', city: 'Portland', lat: 45.5152, lng: -122.6784, specialization: 'Electronics' },
  { state: 'AZ', city: 'Phoenix', lat: 33.4484, lng: -112.0740, specialization: 'Semiconductor' },
  { state: 'AZ', city: 'Tucson', lat: 32.2226, lng: -110.9747, specialization: 'Aerospace' },
  { state: 'CO', city: 'Denver', lat: 39.7392, lng: -104.9903, specialization: 'Aerospace' },
  { state: 'UT', city: 'Salt Lake City', lat: 40.7608, lng: -111.8910, specialization: 'Defense' },
  { state: 'NV', city: 'Las Vegas', lat: 36.1699, lng: -115.1398, specialization: 'Solar Panels' },
  { state: 'NV', city: 'Reno', lat: 39.5296, lng: -119.8138, specialization: 'Battery Manufacturing' },
  { state: 'MA', city: 'Boston', lat: 42.3601, lng: -71.0589, specialization: 'Biotech' },
];

// ============================================
// OCCUPATION-SKILL MAPPINGS (hard technical skills only)
// ============================================

const OCCUPATION_SKILL_MAPPINGS: Record<string, string[]> = {
  'CNC Machine Operator': ['CNC Programming', 'Blueprint Reading', 'Micrometer Reading', 'GD&T Interpretation', 'CAM Programming'],
  'Machinist': ['Manual Lathe Operation', 'Manual Mill Operation', 'Micrometer Reading', 'Blueprint Reading', 'Precision Grinding'],
  'Welder': ['MIG Welding', 'TIG Welding', 'Blueprint Reading', 'Sheet Metal Forming', 'Stick Welding'],
  'Quality Control Inspector': ['CMM Operation', 'GD&T Interpretation', 'Micrometer Reading', 'Caliper Measurement', 'Surface Roughness Testing'],
  'Industrial Engineer': ['CAD Modeling', 'CAM Programming', 'Blueprint Reading', 'GD&T Interpretation', 'PLC Ladder Logic'],
  'Mechanical Engineer': ['CAD Modeling', 'GD&T Interpretation', 'Hydraulic System Repair', 'Pneumatic System Repair', 'Blueprint Reading'],
  'Electrical Engineer': ['Electrical Schematic Reading', 'PLC Ladder Logic', 'VFD Programming', 'HMI Development', 'Motor Wiring'],
  'Production Supervisor': ['Blueprint Reading', 'CNC Programming', 'Micrometer Reading', 'CAD Modeling', 'PLC Ladder Logic'],
  'Maintenance Technician': ['Hydraulic System Repair', 'Pneumatic System Repair', 'Bearing Replacement', 'Shaft Alignment', 'Pump Maintenance'],
  'Tool and Die Maker': ['Precision Grinding', 'Manual Mill Operation', 'Blueprint Reading', 'GD&T Interpretation', 'EDM Operation'],
  'Assembly Line Worker': ['Torque Wrench Usage', 'Crimping and Termination', 'Blueprint Reading', 'Through-Hole Soldering', 'Wire Harness Assembly'],
  'Forklift Operator': ['Forklift Operation', 'Pallet Jack Operation', 'Overhead Crane Operation', 'Rigging and Slinging', 'Lift Table Operation'],
  'Shipping and Receiving Clerk': ['Forklift Operation', 'Pallet Jack Operation', 'Lift Table Operation', 'Rigging and Slinging', 'Overhead Crane Operation'],
  'Materials Handler': ['Forklift Operation', 'Overhead Crane Operation', 'Rigging and Slinging', 'Pallet Jack Operation', 'Lift Table Operation'],
  'Process Engineer': ['CAD Modeling', 'CAM Programming', 'GD&T Interpretation', 'PLC Ladder Logic', 'Blueprint Reading'],
  'Safety Manager': ['Electrical Schematic Reading', 'Hydraulic System Repair', 'Pneumatic System Repair', 'Multimeter Testing', 'Blueprint Reading'],
  'Manufacturing Technician': ['Blueprint Reading', 'Micrometer Reading', 'Torque Wrench Usage', 'Caliper Measurement', 'Manual Mill Operation'],
  'Plant Manager': ['CAD Modeling', 'Blueprint Reading', 'GD&T Interpretation', 'PLC Ladder Logic', 'CNC Programming'],
  'Robotics Technician': ['Robot Programming', 'PLC Ladder Logic', 'HMI Development', 'Electrical Schematic Reading', 'VFD Programming'],
  'Sheet Metal Worker': ['Sheet Metal Forming', 'MIG Welding', 'Blueprint Reading', 'Micrometer Reading', 'TIG Welding'],
  'Painter, Industrial': ['Blueprint Reading', 'Micrometer Reading', 'Surface Roughness Testing', 'Caliper Measurement', 'Torque Wrench Usage'],
  'Chemical Operator': ['Pump Maintenance', 'Hydraulic System Repair', 'Pneumatic System Repair', 'Multimeter Testing', 'Blueprint Reading'],
  'Packaging Machine Operator': ['Pneumatic System Repair', 'Electrical Schematic Reading', 'Multimeter Testing', 'Bearing Replacement', 'Torque Wrench Usage'],
  'Injection Molding Operator': ['Hydraulic System Repair', 'Blueprint Reading', 'Micrometer Reading', 'Caliper Measurement', 'Pneumatic System Repair'],
  'CNC Programmer': ['CNC Programming', 'CAM Programming', 'GD&T Interpretation', 'Blueprint Reading', 'CAD Modeling'],
  'Laser Cutting Operator': ['CNC Programming', 'Blueprint Reading', 'CAM Programming', 'Micrometer Reading', 'CAD Modeling'],
  'Electronics Assembler': ['Through-Hole Soldering', 'SMT Soldering', 'Wire Harness Assembly', 'Crimping and Termination', 'Multimeter Testing'],
  'Quality Assurance Manager': ['CMM Operation', 'GD&T Interpretation', 'Surface Roughness Testing', 'Micrometer Reading', 'Caliper Measurement'],
  'Lean Manufacturing Specialist': ['CAD Modeling', 'Blueprint Reading', 'GD&T Interpretation', 'CNC Programming', 'CAM Programming'],
  'Supply Chain Coordinator': ['Forklift Operation', 'Pallet Jack Operation', 'Overhead Crane Operation', 'Rigging and Slinging', 'Lift Table Operation'],
};

// ============================================
// SEED FUNCTION
// ============================================

async function seed() {
  console.log('Starting database seed...\n');

  try {
    // Clear existing data (in reverse order of dependencies)
    console.log('Clearing existing data...');
    await db.delete(occupationSkills);
    await db.delete(factoryOccupations);
    await db.delete(companyIndustries);
    await db.delete(factories);
    await db.delete(companies);
    await db.delete(occupations);
    await db.delete(skills);
    await db.delete(skillCategories);
    await db.delete(industries);
    await db.delete(states);
    console.log('Existing data cleared.\n');

    // Insert states
    console.log('Inserting states...');
    const insertedStates = await db.insert(states).values(
      US_STATES.map((s) => ({
        code: s.code,
        name: s.name,
      }))
    ).returning();
    console.log(`Inserted ${insertedStates.length} states.\n`);

    // Create state lookup map
    const stateMap = new Map(insertedStates.map((s) => [s.code, s.id]));

    // Insert industries
    console.log('Inserting industries...');
    const insertedIndustries = await db.insert(industries).values(
      INDUSTRIES_DATA.map((i) => ({
        name: i.name,
        description: i.description,
      }))
    ).returning();
    console.log(`Inserted ${insertedIndustries.length} industries.\n`);

    // Create industry lookup map
    const industryMap = new Map(insertedIndustries.map((i) => [i.name, i.id]));

    // Insert skill categories
    console.log('Inserting skill categories...');
    const insertedCategories = await db.insert(skillCategories).values(
      SKILL_CATEGORIES_DATA.map((c) => ({
        name: c.name,
        description: c.description,
      }))
    ).returning();
    console.log(`Inserted ${insertedCategories.length} skill categories.\n`);

    // Create category lookup map
    const categoryMap = new Map(insertedCategories.map((c) => [c.name, c.id]));

    // Combine all company data
    const allCompaniesData = [
      ...COMPANIES_DATA.map((c) => ({
        name: c.name,
        description: c.description,
        industries: c.industries,
        lat: null as string | null,
        lng: null as string | null,
      })),
      ...TOP_50_MANUFACTURING_COMPANIES.map((c) => ({
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
        industry: c.industries[0], // Legacy field - use primary industry
        headquartersLat: c.lat,
        headquartersLng: c.lng,
      }))
    ).returning();
    console.log(`Inserted ${insertedCompanies.length} companies.\n`);

    // Create company lookup map
    const companyMap = new Map(insertedCompanies.map((c, i) => [allCompaniesData[i].name, { id: c.id, industries: allCompaniesData[i].industries }]));

    // Insert company-industry relationships
    console.log('Creating company-industry relationships...');
    const companyIndustryValues: Array<{ companyId: string; industryId: string }> = [];
    for (const [_companyName, data] of companyMap) {
      for (const industryName of data.industries) {
        const industryId = industryMap.get(industryName);
        if (industryId) {
          companyIndustryValues.push({
            companyId: data.id,
            industryId,
          });
        }
      }
    }
    if (companyIndustryValues.length > 0) {
      await db.insert(companyIndustries).values(companyIndustryValues);
    }
    console.log(`Created ${companyIndustryValues.length} company-industry relationships.\n`);

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

    // Insert skills with category references
    console.log('Inserting skills...');
    const insertedSkills = await db.insert(skills).values(
      SKILLS_DATA.map((s) => ({
        name: s.name,
        category: s.category, // Legacy field
        categoryId: categoryMap.get(s.category),
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

    // Insert factories
    console.log('Inserting factories...');
    const companyList = Array.from(companyMap.entries());
    const factoryValues = FACTORY_LOCATIONS.map((loc, index) => {
      const [companyName, companyData] = companyList[index % companyList.length];
      const factoryNumber = Math.floor(index / companyList.length) + 1;

      return {
        companyId: companyData.id,
        name: `${companyName.split(' ')[0]} ${loc.city} Plant${factoryNumber > 1 ? ` #${factoryNumber}` : ''}`,
        specialization: loc.specialization,
        description: `${loc.specialization} facility located in ${loc.city}, ${loc.state}`,
        latitude: loc.lat.toString(),
        longitude: loc.lng.toString(),
        state: loc.state,
        stateId: stateMap.get(loc.state),
        workforceSize: Math.floor(Math.random() * 900) + 100,
        openPositions: Math.floor(Math.random() * 50) + 5,
      };
    });

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
    console.log(`States: ${insertedStates.length}`);
    console.log(`Industries: ${insertedIndustries.length}`);
    console.log(`Skill Categories: ${insertedCategories.length}`);
    console.log(`Companies: ${insertedCompanies.length}`);
    console.log(`Company-Industry Links: ${companyIndustryValues.length}`);
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
