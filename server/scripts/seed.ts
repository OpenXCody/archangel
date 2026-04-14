import 'dotenv/config';
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

  // Additional Major Manufacturing Companies
  { name: 'GlobalFoundries', industries: ['Electronics'], description: 'Semiconductor foundry specializing in specialty chips', lat: '42.9227', lng: '-73.8534' },
  { name: 'ON Semiconductor', industries: ['Electronics'], description: 'Semiconductor solutions for automotive and industrial', lat: '33.4484', lng: '-111.9400' },
  { name: 'Analog Devices', industries: ['Electronics'], description: 'High-performance analog, mixed-signal, and DSP integrated circuits', lat: '42.5037', lng: '-71.1956' },
  { name: 'Skyworks Solutions', industries: ['Electronics'], description: 'Semiconductor company for mobile communications', lat: '33.1581', lng: '-117.3506' },
  { name: 'Microchip Technology', industries: ['Electronics'], description: 'Microcontrollers, mixed-signal, analog and Flash-IP solutions', lat: '33.4255', lng: '-111.7400' },
  { name: 'Lam Research', industries: ['Electronics', 'Industrial Machinery'], description: 'Semiconductor processing equipment manufacturer', lat: '37.4133', lng: '-122.0946' },
  { name: 'KLA Corporation', industries: ['Electronics', 'Industrial Machinery'], description: 'Process control and yield management equipment', lat: '37.4038', lng: '-122.0465' },
  { name: 'ASML Holding', industries: ['Electronics', 'Industrial Machinery'], description: 'Photolithography systems for semiconductor industry', lat: '33.1581', lng: '-117.3506' },

  // Defense and Aerospace
  { name: 'L3Harris Technologies', industries: ['Aerospace & Defense', 'Electronics'], description: 'Defense contractor providing advanced technology solutions', lat: '28.3922', lng: '-80.7510' },
  { name: 'BAE Systems', industries: ['Aerospace & Defense'], description: 'Defense, aerospace, and security company', lat: '38.9517', lng: '-77.4467' },
  { name: 'Leidos', industries: ['Aerospace & Defense', 'Electronics'], description: 'Defense, aviation, and information technology company', lat: '38.8764', lng: '-77.1899' },
  { name: 'General Atomics', industries: ['Aerospace & Defense'], description: 'Defense contractor specializing in unmanned aircraft systems', lat: '32.8818', lng: '-117.1964' },
  { name: 'Huntington Ingalls Industries', industries: ['Aerospace & Defense', 'Metals & Fabrication'], description: 'Americas largest military shipbuilding company', lat: '37.0057', lng: '-76.4346' },
  { name: 'BWX Technologies', industries: ['Energy', 'Aerospace & Defense'], description: 'Nuclear components and fuel manufacturer', lat: '37.2710', lng: '-79.9414' },
  { name: 'Mercury Systems', industries: ['Aerospace & Defense', 'Electronics'], description: 'Secure mission-critical processing subsystems', lat: '42.4072', lng: '-71.3824' },
  { name: 'Curtiss-Wright', industries: ['Aerospace & Defense', 'Industrial Machinery'], description: 'Highly engineered products and services', lat: '40.2206', lng: '-74.7597' },

  // Medical Devices
  { name: 'Medtronic', industries: ['Medical & Pharmaceuticals'], description: 'Global leader in medical technology and therapies', lat: '44.9778', lng: '-93.2650' },
  { name: 'Abbott Laboratories', industries: ['Medical & Pharmaceuticals'], description: 'Healthcare company with diagnostics and devices', lat: '42.2830', lng: '-87.9530' },
  { name: 'Boston Scientific', industries: ['Medical & Pharmaceuticals'], description: 'Medical devices for interventional specialties', lat: '42.2750', lng: '-71.0950' },
  { name: 'Stryker Corporation', industries: ['Medical & Pharmaceuticals'], description: 'Medical devices and equipment manufacturer', lat: '42.2917', lng: '-85.5872' },
  { name: 'Edwards Lifesciences', industries: ['Medical & Pharmaceuticals'], description: 'Heart valves and hemodynamic monitoring', lat: '33.6846', lng: '-117.8265' },
  { name: 'Intuitive Surgical', industries: ['Medical & Pharmaceuticals', 'Industrial Machinery'], description: 'Robotic surgical systems manufacturer', lat: '37.4539', lng: '-122.1757' },
  { name: 'Dexcom', industries: ['Medical & Pharmaceuticals', 'Electronics'], description: 'Continuous glucose monitoring systems', lat: '32.8818', lng: '-117.1964' },
  { name: 'Zimmer Biomet', industries: ['Medical & Pharmaceuticals'], description: 'Musculoskeletal healthcare company', lat: '41.2619', lng: '-85.8108' },

  // Automotive Suppliers
  { name: 'BorgWarner', industries: ['Automotive'], description: 'Propulsion systems for combustion and electric vehicles', lat: '42.2808', lng: '-83.7430' },
  { name: 'Aptiv', industries: ['Automotive', 'Electronics'], description: 'Global technology company focused on safer vehicles', lat: '42.4775', lng: '-83.0277' },
  { name: 'Lear Corporation', industries: ['Automotive'], description: 'Automotive seating and electrical systems', lat: '42.4600', lng: '-83.3330' },
  { name: 'Magna International', industries: ['Automotive'], description: 'Global automotive supplier with manufacturing', lat: '43.3255', lng: '-79.7990' },
  { name: 'Dana Incorporated', industries: ['Automotive', 'Industrial Machinery'], description: 'Drivetrain and sealing products manufacturer', lat: '41.6528', lng: '-83.5379' },
  { name: 'American Axle', industries: ['Automotive'], description: 'Driveline and metal forming technologies', lat: '42.3314', lng: '-83.0458' },
  { name: 'Tenneco', industries: ['Automotive'], description: 'Clean air and ride performance products', lat: '41.8781', lng: '-87.6298' },
  { name: 'Linamar Corporation', industries: ['Automotive', 'Industrial Machinery'], description: 'Diversified manufacturing company', lat: '43.5448', lng: '-80.2482' },

  // Industrial Equipment
  { name: 'Ingersoll Rand', industries: ['Industrial Machinery'], description: 'Diversified industrial company', lat: '40.2206', lng: '-74.7597' },
  { name: 'Dover Corporation', industries: ['Industrial Machinery'], description: 'Diversified global manufacturer', lat: '42.1083', lng: '-87.8294' },
  { name: 'Flowserve', industries: ['Industrial Machinery'], description: 'Flow control products and services', lat: '32.9084', lng: '-96.7508' },
  { name: 'Graco Inc.', industries: ['Industrial Machinery'], description: 'Fluid handling equipment manufacturer', lat: '44.9778', lng: '-93.2650' },
  { name: 'IDEX Corporation', industries: ['Industrial Machinery'], description: 'Applied solutions and fluidics', lat: '42.2350', lng: '-88.3201' },
  { name: 'ITT Inc.', industries: ['Industrial Machinery', 'Aerospace & Defense'], description: 'Engineered critical components and technology', lat: '40.8568', lng: '-74.2262' },
  { name: 'Roper Technologies', industries: ['Industrial Machinery', 'Electronics'], description: 'Diversified technology company', lat: '27.7676', lng: '-82.6403' },

  // Steel and Metals
  { name: 'United States Steel', industries: ['Metals & Fabrication'], description: 'Integrated steel producer', lat: '40.4406', lng: '-79.9959' },
  { name: 'Cleveland-Cliffs', industries: ['Metals & Fabrication'], description: 'Flat-rolled steel producer', lat: '41.4993', lng: '-81.6944' },
  { name: 'Commercial Metals Company', industries: ['Metals & Fabrication'], description: 'Steel and metal products manufacturer', lat: '32.8140', lng: '-96.9489' },
  { name: 'Worthington Industries', industries: ['Metals & Fabrication'], description: 'Steel processing and manufactured metal products', lat: '39.9612', lng: '-82.9988' },
  { name: 'TimkenSteel', industries: ['Metals & Fabrication'], description: 'Specialty steel manufacturer', lat: '40.7989', lng: '-81.3784' },
  { name: 'Olympic Steel', industries: ['Metals & Fabrication'], description: 'Metals service center', lat: '41.4993', lng: '-81.6944' },

  // Energy Equipment
  { name: 'Baker Hughes', industries: ['Energy', 'Industrial Machinery'], description: 'Energy technology and services company', lat: '29.7604', lng: '-95.3698' },
  { name: 'Schlumberger', industries: ['Energy'], description: 'Oilfield services company', lat: '29.7604', lng: '-95.3698' },
  { name: 'Halliburton', industries: ['Energy'], description: 'Oilfield services company', lat: '29.7604', lng: '-95.3698' },
  { name: 'NOV Inc.', industries: ['Energy', 'Industrial Machinery'], description: 'Oil and gas drilling equipment manufacturer', lat: '29.7604', lng: '-95.3698' },
  { name: 'Chart Industries', industries: ['Energy', 'Industrial Machinery'], description: 'Cryogenic equipment manufacturer', lat: '41.2619', lng: '-81.8520' },
  { name: 'First Solar', industries: ['Energy', 'Electronics'], description: 'Solar panel manufacturer', lat: '33.3062', lng: '-111.8413' },
  { name: 'SunPower Corporation', industries: ['Energy', 'Electronics'], description: 'Solar energy solutions company', lat: '37.3861', lng: '-122.0839' },
  { name: 'Enphase Energy', industries: ['Energy', 'Electronics'], description: 'Solar microinverters and battery systems', lat: '37.4419', lng: '-122.1430' },

  // Food and Consumer
  { name: 'Tyson Foods', industries: ['Agriculture & Food'], description: 'Largest US meat processor', lat: '36.2919', lng: '-94.1319' },
  { name: 'General Mills', industries: ['Agriculture & Food'], description: 'Food company producing cereals and snacks', lat: '44.9778', lng: '-93.2650' },
  { name: 'Kellogg Company', industries: ['Agriculture & Food'], description: 'Multinational food manufacturing company', lat: '42.2917', lng: '-85.5872' },
  { name: 'Kraft Heinz', industries: ['Agriculture & Food'], description: 'Food and beverage company', lat: '41.8781', lng: '-87.6298' },
  { name: 'Conagra Brands', industries: ['Agriculture & Food'], description: 'Packaged foods company', lat: '41.2565', lng: '-95.9345' },
  { name: 'Hormel Foods', industries: ['Agriculture & Food'], description: 'Multinational food processing company', lat: '43.6706', lng: '-92.9746' },
];

// ============================================
// OCCUPATIONS DATA (80+ with O*NET codes)
// ============================================

const OCCUPATIONS_DATA = [
  // Engineering Roles
  { title: 'CNC Programmer', onetCode: '51-4012.00', description: 'Write and optimize G-code and M-code programs for CNC machine tools' },
  { title: 'NC Programmer', onetCode: '51-4012.01', description: 'Develop numerical control programs for automated manufacturing equipment' },
  { title: 'CAD Designer', onetCode: '17-3011.00', description: 'Create detailed technical drawings and 3D models using CAD software' },
  { title: 'CAM Programmer', onetCode: '17-3013.00', description: 'Develop toolpaths and machining strategies using CAM software' },
  { title: 'Mechanical Engineer', onetCode: '17-2141.00', description: 'Design and develop mechanical devices, tools, engines, and machines' },
  { title: 'Electrical Engineer', onetCode: '17-2071.00', description: 'Design, develop, and test electrical systems and components' },
  { title: 'Process Engineer', onetCode: '17-2199.00', description: 'Develop, implement, and optimize manufacturing processes' },
  { title: 'Industrial Engineer', onetCode: '17-2112.00', description: 'Design efficient systems integrating workers, machines, and materials' },
  { title: 'Manufacturing Engineer', onetCode: '17-2112.01', description: 'Plan and design manufacturing processes and production layouts' },
  { title: 'Quality Engineer', onetCode: '17-2111.00', description: 'Develop and implement quality control systems and procedures' },
  { title: 'Aerospace Engineer', onetCode: '17-2011.00', description: 'Design aircraft, spacecraft, satellites, and missile systems' },
  { title: 'Systems Engineer', onetCode: '17-2199.01', description: 'Design and integrate complex systems across multiple disciplines' },
  { title: 'Controls Engineer', onetCode: '17-2199.02', description: 'Design and implement industrial control systems and automation' },
  { title: 'Automation Engineer', onetCode: '17-2199.03', description: 'Design and deploy automated manufacturing systems and robotics' },
  { title: 'Test Engineer', onetCode: '17-2199.04', description: 'Develop test procedures and validate product performance' },
  { title: 'Reliability Engineer', onetCode: '17-2199.05', description: 'Analyze and improve product reliability and failure prevention' },
  { title: 'Design Engineer', onetCode: '17-2141.01', description: 'Create product designs from concept through production release' },
  { title: 'Tooling Engineer', onetCode: '17-2141.02', description: 'Design and develop tools, fixtures, and manufacturing aids' },
  { title: 'Materials Engineer', onetCode: '17-2131.00', description: 'Develop and test materials for manufacturing applications' },
  { title: 'Chemical Engineer', onetCode: '17-2041.00', description: 'Design chemical plant equipment and develop manufacturing processes' },

  // Drafting and Design
  { title: 'Drafting Technician', onetCode: '17-3011.01', description: 'Prepare technical drawings and plans using CAD systems' },
  { title: 'Mechanical Drafter', onetCode: '17-3013.00', description: 'Prepare detailed working diagrams of machinery and mechanical devices' },
  { title: 'Electrical Drafter', onetCode: '17-3012.00', description: 'Prepare wiring diagrams and layout drawings for electrical equipment' },
  { title: 'CAD Technician', onetCode: '17-3011.02', description: 'Create and modify technical drawings using computer-aided design' },
  { title: '3D Modeler', onetCode: '17-3011.03', description: 'Create three-dimensional digital models for manufacturing' },

  // Machining and Fabrication
  { title: 'CNC Machine Operator', onetCode: '51-4011.00', description: 'Operate computer-controlled machine tools to fabricate parts' },
  { title: 'CNC Lathe Operator', onetCode: '51-4011.01', description: 'Set up and operate CNC lathes for turning operations' },
  { title: 'CNC Mill Operator', onetCode: '51-4011.02', description: 'Set up and operate CNC milling machines for precision parts' },
  { title: 'Machinist', onetCode: '51-4041.00', description: 'Set up and operate machine tools to produce precision metal parts' },
  { title: 'Tool and Die Maker', onetCode: '51-4111.00', description: 'Construct precision tools, dies, and special guiding devices' },
  { title: 'Setup Technician', onetCode: '51-4011.03', description: 'Set up CNC machines and verify first article production' },
  { title: 'EDM Operator', onetCode: '51-4031.01', description: 'Operate electrical discharge machining equipment' },
  { title: 'Grinding Machine Operator', onetCode: '51-4033.00', description: 'Operate grinding machines to precision specifications' },
  { title: 'Swiss-Type Lathe Operator', onetCode: '51-4011.04', description: 'Operate Swiss-type CNC machines for small precision parts' },
  { title: 'Laser Cutting Operator', onetCode: '51-4031.00', description: 'Operate laser cutting equipment for precision cuts' },
  { title: 'Waterjet Operator', onetCode: '51-4031.02', description: 'Operate waterjet cutting machines for various materials' },
  { title: 'Plasma Cutter Operator', onetCode: '51-4031.03', description: 'Operate plasma cutting equipment for metal fabrication' },

  // Welding and Fabrication
  { title: 'Welder', onetCode: '51-4121.00', description: 'Join metal parts using various welding techniques' },
  { title: 'TIG Welder', onetCode: '51-4121.01', description: 'Perform precision TIG welding on various metals' },
  { title: 'MIG Welder', onetCode: '51-4121.02', description: 'Operate MIG welding equipment for production welding' },
  { title: 'Certified Welder', onetCode: '51-4121.03', description: 'Perform certified welding to aerospace or structural codes' },
  { title: 'Robotic Welder Operator', onetCode: '51-4121.04', description: 'Program and operate robotic welding systems' },
  { title: 'Sheet Metal Worker', onetCode: '51-4121.06', description: 'Fabricate and install sheet metal products' },
  { title: 'Metal Fabricator', onetCode: '51-2041.00', description: 'Cut, shape, and assemble metal structures' },

  // Quality and Inspection
  { title: 'Quality Control Inspector', onetCode: '51-9061.00', description: 'Inspect products and materials for defects and compliance' },
  { title: 'CMM Operator', onetCode: '51-9061.01', description: 'Operate coordinate measuring machines for precision inspection' },
  { title: 'Quality Assurance Manager', onetCode: '11-3051.01', description: 'Manage quality control systems and continuous improvement' },
  { title: 'NDT Technician', onetCode: '51-9061.02', description: 'Perform non-destructive testing using ultrasonic, radiographic methods' },
  { title: 'Metrology Technician', onetCode: '51-9061.03', description: 'Calibrate and maintain precision measuring equipment' },
  { title: 'First Article Inspector', onetCode: '51-9061.04', description: 'Inspect first production parts against specifications' },
  { title: 'Receiving Inspector', onetCode: '51-9061.05', description: 'Inspect incoming materials and components' },

  // Electronics and Semiconductor
  { title: 'Electronics Assembler', onetCode: '51-2022.00', description: 'Assemble electronic components and circuit boards' },
  { title: 'PCB Assembler', onetCode: '51-2022.01', description: 'Assemble printed circuit boards using SMT and through-hole' },
  { title: 'Electronics Technician', onetCode: '17-3023.00', description: 'Test and repair electronic equipment and systems' },
  { title: 'Semiconductor Process Technician', onetCode: '51-9141.00', description: 'Operate equipment in semiconductor wafer fabrication' },
  { title: 'Cleanroom Technician', onetCode: '51-9141.01', description: 'Work in cleanroom environments for semiconductor manufacturing' },
  { title: 'Wafer Fab Operator', onetCode: '51-9141.02', description: 'Operate photolithography and etching equipment' },
  { title: 'Test Technician', onetCode: '17-3023.01', description: 'Test electronic assemblies and diagnose failures' },

  // Assembly and Production
  { title: 'Assembly Line Worker', onetCode: '51-2092.00', description: 'Assemble products on manufacturing production lines' },
  { title: 'Production Assembler', onetCode: '51-2092.01', description: 'Assemble components into finished products' },
  { title: 'Aerospace Assembler', onetCode: '51-2011.00', description: 'Assemble aircraft structures and components' },
  { title: 'Composite Technician', onetCode: '51-2011.01', description: 'Lay up and cure composite materials for aerospace' },
  { title: 'Wire Harness Assembler', onetCode: '51-2022.02', description: 'Build wire harnesses and cable assemblies' },
  { title: 'Production Operator', onetCode: '51-9199.00', description: 'Operate production equipment and machinery' },

  // Maintenance and Facilities
  { title: 'Maintenance Technician', onetCode: '49-9071.00', description: 'Maintain and repair industrial machinery and equipment' },
  { title: 'Industrial Electrician', onetCode: '47-2111.00', description: 'Install and maintain electrical systems in industrial facilities' },
  { title: 'Millwright', onetCode: '49-9044.00', description: 'Install and maintain industrial machinery and equipment' },
  { title: 'PLC Technician', onetCode: '49-2094.00', description: 'Program and troubleshoot programmable logic controllers' },
  { title: 'Hydraulics Technician', onetCode: '49-9071.01', description: 'Repair and maintain hydraulic systems' },
  { title: 'Robotics Technician', onetCode: '17-3024.00', description: 'Install, program, and maintain robotic systems' },

  // Supervision and Management
  { title: 'Production Supervisor', onetCode: '51-1011.00', description: 'Supervise and coordinate activities of production workers' },
  { title: 'Manufacturing Supervisor', onetCode: '51-1011.01', description: 'Oversee manufacturing operations and personnel' },
  { title: 'Plant Manager', onetCode: '11-3051.00', description: 'Direct and coordinate plant operations' },
  { title: 'Operations Manager', onetCode: '11-1021.00', description: 'Plan and direct manufacturing operations' },
  { title: 'Lean Manufacturing Specialist', onetCode: '17-2112.02', description: 'Implement lean manufacturing and continuous improvement' },
  { title: 'Safety Manager', onetCode: '11-9199.00', description: 'Develop and implement workplace safety programs' },

  // Material Handling and Logistics
  { title: 'Forklift Operator', onetCode: '53-7051.00', description: 'Operate forklifts to move materials in warehouses and plants' },
  { title: 'Materials Handler', onetCode: '53-7062.00', description: 'Move materials within plants and warehouses' },
  { title: 'Shipping and Receiving Clerk', onetCode: '43-5071.00', description: 'Verify and maintain records on incoming and outgoing shipments' },
  { title: 'Supply Chain Coordinator', onetCode: '13-1081.00', description: 'Coordinate supply chain logistics and procurement' },
  { title: 'Inventory Control Specialist', onetCode: '43-5081.00', description: 'Manage inventory levels and material tracking' },

  // Specialized Operations
  { title: 'Injection Molding Operator', onetCode: '51-4072.00', description: 'Operate injection molding machines for plastic parts' },
  { title: 'Chemical Operator', onetCode: '51-8091.00', description: 'Operate chemical processing equipment' },
  { title: 'Packaging Machine Operator', onetCode: '51-9111.00', description: 'Operate machines that package products' },
  { title: 'Painter, Industrial', onetCode: '51-9124.00', description: 'Apply paint and coatings to manufactured products' },
  { title: 'Heat Treat Operator', onetCode: '51-4191.00', description: 'Operate heat treating equipment for metal hardening' },
  { title: 'Plating Operator', onetCode: '51-9121.00', description: 'Operate electroplating and surface finishing equipment' },
];

// ============================================
// SKILLS DATA (100+ hard technical skills with category links)
// ============================================

const SKILLS_DATA = [
  // ===== MACHINING (15) =====
  { name: 'CNC Programming', category: 'Machining', description: 'Writing G-code and M-code programs for CNC machine tools' },
  { name: 'G-Code Programming', category: 'Machining', description: 'Manual G-code programming for CNC machines' },
  { name: 'Manual Lathe Operation', category: 'Machining', description: 'Operating manual engine lathes for turning' },
  { name: 'Manual Mill Operation', category: 'Machining', description: 'Operating manual Bridgeport-style milling machines' },
  { name: 'Precision Grinding', category: 'Machining', description: 'Surface, cylindrical, and centerless grinding operations' },
  { name: 'EDM Operation', category: 'Machining', description: 'Wire and sinker Electrical Discharge Machining' },
  { name: '5-Axis Machining', category: 'Machining', description: 'Programming and operating 5-axis CNC machines' },
  { name: 'Swiss-Type Machining', category: 'Machining', description: 'Operating Swiss-type sliding headstock lathes' },
  { name: 'Multi-Axis Turning', category: 'Machining', description: 'Operating CNC turning centers with live tooling' },
  { name: 'Vertical Milling', category: 'Machining', description: 'Operating vertical machining centers (VMC)' },
  { name: 'Horizontal Milling', category: 'Machining', description: 'Operating horizontal machining centers (HMC)' },
  { name: 'Boring Mill Operation', category: 'Machining', description: 'Operating horizontal and vertical boring mills' },
  { name: 'Jig Grinding', category: 'Machining', description: 'Precision jig grinding for tool and die work' },
  { name: 'Honing and Lapping', category: 'Machining', description: 'Precision honing and lapping operations' },
  { name: 'Broaching', category: 'Machining', description: 'Operating broaching machines for keyways and splines' },

  // ===== WELDING & FABRICATION (12) =====
  { name: 'MIG Welding', category: 'Welding & Fabrication', description: 'GMAW Metal Inert Gas welding' },
  { name: 'TIG Welding', category: 'Welding & Fabrication', description: 'GTAW Tungsten Inert Gas welding for precision' },
  { name: 'Stick Welding', category: 'Welding & Fabrication', description: 'SMAW Shielded Metal Arc Welding' },
  { name: 'Flux Core Welding', category: 'Welding & Fabrication', description: 'FCAW Flux-Cored Arc Welding' },
  { name: 'Spot Welding', category: 'Welding & Fabrication', description: 'Resistance spot welding for sheet metal' },
  { name: 'Orbital Welding', category: 'Welding & Fabrication', description: 'Automated orbital TIG welding for tubing' },
  { name: 'Blueprint Reading', category: 'Welding & Fabrication', description: 'Reading and interpreting engineering drawings' },
  { name: 'Sheet Metal Forming', category: 'Welding & Fabrication', description: 'Bending, rolling, and forming sheet metal' },
  { name: 'Press Brake Operation', category: 'Welding & Fabrication', description: 'Operating CNC press brakes for precision bending' },
  { name: 'Plate Rolling', category: 'Welding & Fabrication', description: 'Rolling plate and sheet metal into cylinders' },
  { name: 'Tube Bending', category: 'Welding & Fabrication', description: 'CNC and manual tube bending operations' },
  { name: 'Structural Steel Fabrication', category: 'Welding & Fabrication', description: 'Fabricating structural steel assemblies' },

  // ===== QUALITY & MEASUREMENT (15) =====
  { name: 'GD&T Interpretation', category: 'Quality & Measurement', description: 'Geometric Dimensioning and Tolerancing per ASME Y14.5' },
  { name: 'CMM Operation', category: 'Quality & Measurement', description: 'Operating Coordinate Measuring Machines' },
  { name: 'CMM Programming', category: 'Quality & Measurement', description: 'Programming CMMs using PC-DMIS or similar' },
  { name: 'Micrometer Reading', category: 'Quality & Measurement', description: 'Precision measurement with micrometers' },
  { name: 'Caliper Measurement', category: 'Quality & Measurement', description: 'Using dial and digital calipers accurately' },
  { name: 'Surface Roughness Testing', category: 'Quality & Measurement', description: 'Measuring surface finish with profilometers' },
  { name: 'Optical Comparator', category: 'Quality & Measurement', description: 'Using optical comparators for profile inspection' },
  { name: 'Height Gauge Usage', category: 'Quality & Measurement', description: 'Precision measurement with height gauges' },
  { name: 'Bore Gauge Usage', category: 'Quality & Measurement', description: 'Measuring internal diameters with bore gauges' },
  { name: 'Thread Measurement', category: 'Quality & Measurement', description: 'Measuring threads with gauges and micrometers' },
  { name: 'Statistical Process Control', category: 'Quality & Measurement', description: 'Implementing SPC charts and process capability' },
  { name: 'First Article Inspection', category: 'Quality & Measurement', description: 'Conducting AS9102 first article inspections' },
  { name: 'ISO 9001 Compliance', category: 'Quality & Measurement', description: 'Quality management system implementation' },
  { name: 'AS9100 Compliance', category: 'Quality & Measurement', description: 'Aerospace quality management system' },
  { name: 'IATF 16949 Compliance', category: 'Quality & Measurement', description: 'Automotive quality management system' },

  // ===== ASSEMBLY & ELECTRONICS (12) =====
  { name: 'Through-Hole Soldering', category: 'Assembly & Electronics', description: 'Soldering through-hole electronic components' },
  { name: 'SMT Soldering', category: 'Assembly & Electronics', description: 'Surface Mount Technology soldering and rework' },
  { name: 'BGA Rework', category: 'Assembly & Electronics', description: 'Ball Grid Array component rework and replacement' },
  { name: 'Wire Harness Assembly', category: 'Assembly & Electronics', description: 'Building wire harnesses per IPC/WHMA-A-620' },
  { name: 'Torque Wrench Usage', category: 'Assembly & Electronics', description: 'Applying precise torque specifications' },
  { name: 'Crimping and Termination', category: 'Assembly & Electronics', description: 'Wire crimping and connector termination' },
  { name: 'IPC-A-610 Soldering', category: 'Assembly & Electronics', description: 'Soldering to IPC-A-610 acceptability standards' },
  { name: 'Conformal Coating', category: 'Assembly & Electronics', description: 'Applying protective conformal coatings to PCBs' },
  { name: 'Potting and Encapsulation', category: 'Assembly & Electronics', description: 'Encapsulating electronics for protection' },
  { name: 'Fiber Optic Termination', category: 'Assembly & Electronics', description: 'Terminating fiber optic cables and connectors' },
  { name: 'RF Cable Assembly', category: 'Assembly & Electronics', description: 'Building RF and coaxial cable assemblies' },
  { name: 'Aerospace Riveting', category: 'Assembly & Electronics', description: 'Installing aircraft rivets per specifications' },

  // ===== ELECTRICAL SYSTEMS (10) =====
  { name: 'Electrical Schematic Reading', category: 'Electrical Systems', description: 'Interpreting electrical schematics and diagrams' },
  { name: 'Motor Wiring', category: 'Electrical Systems', description: 'Wiring three-phase motors and starters' },
  { name: 'VFD Programming', category: 'Electrical Systems', description: 'Programming Variable Frequency Drives' },
  { name: 'Servo Drive Configuration', category: 'Electrical Systems', description: 'Configuring servo motors and drives' },
  { name: 'Conduit Bending', category: 'Electrical Systems', description: 'Bending EMT and rigid conduit' },
  { name: 'Multimeter Testing', category: 'Electrical Systems', description: 'Using digital multimeters for circuit testing' },
  { name: 'Oscilloscope Usage', category: 'Electrical Systems', description: 'Using oscilloscopes for signal analysis' },
  { name: 'Motor Control Troubleshooting', category: 'Electrical Systems', description: 'Diagnosing motor control circuit problems' },
  { name: '480V Power Systems', category: 'Electrical Systems', description: 'Working with industrial 480V power systems' },
  { name: 'Instrumentation Calibration', category: 'Electrical Systems', description: 'Calibrating process instrumentation' },

  // ===== SOFTWARE & CAD/CAM (20) =====
  { name: 'SolidWorks', category: 'Software & Programming', description: '3D CAD modeling and drawing creation in SolidWorks' },
  { name: 'AutoCAD', category: 'Software & Programming', description: '2D drafting and design using AutoCAD' },
  { name: 'CATIA', category: 'Software & Programming', description: 'Advanced surface modeling in CATIA for aerospace' },
  { name: 'NX (Unigraphics)', category: 'Software & Programming', description: 'CAD/CAM/CAE using Siemens NX' },
  { name: 'Creo (Pro/ENGINEER)', category: 'Software & Programming', description: 'Parametric modeling using PTC Creo' },
  { name: 'Inventor', category: 'Software & Programming', description: '3D mechanical design using Autodesk Inventor' },
  { name: 'Fusion 360', category: 'Software & Programming', description: 'Cloud-based CAD/CAM using Fusion 360' },
  { name: 'Mastercam', category: 'Software & Programming', description: 'CAM programming using Mastercam' },
  { name: 'GibbsCAM', category: 'Software & Programming', description: 'CAM programming using GibbsCAM' },
  { name: 'PowerMill', category: 'Software & Programming', description: 'Advanced 5-axis CAM using PowerMill' },
  { name: 'Esprit CAM', category: 'Software & Programming', description: 'Multi-axis CAM programming using Esprit' },
  { name: 'Vericut Simulation', category: 'Software & Programming', description: 'CNC toolpath verification using Vericut' },
  { name: 'PLC Ladder Logic', category: 'Software & Programming', description: 'Programming PLCs using ladder logic' },
  { name: 'Structured Text Programming', category: 'Software & Programming', description: 'PLC programming using Structured Text' },
  { name: 'HMI Development', category: 'Software & Programming', description: 'Developing Human Machine Interfaces' },
  { name: 'FANUC Robot Programming', category: 'Software & Programming', description: 'Programming FANUC industrial robots' },
  { name: 'ABB Robot Programming', category: 'Software & Programming', description: 'Programming ABB industrial robots' },
  { name: 'KUKA Robot Programming', category: 'Software & Programming', description: 'Programming KUKA industrial robots' },
  { name: 'Allen-Bradley PLC', category: 'Software & Programming', description: 'Programming Rockwell Allen-Bradley PLCs' },
  { name: 'Siemens PLC', category: 'Software & Programming', description: 'Programming Siemens S7 PLCs using TIA Portal' },

  // ===== MATERIAL HANDLING (8) =====
  { name: 'Forklift Operation', category: 'Material Handling', description: 'Operating sit-down and stand-up forklifts' },
  { name: 'Overhead Crane Operation', category: 'Material Handling', description: 'Operating bridge and gantry cranes' },
  { name: 'Rigging and Slinging', category: 'Material Handling', description: 'Proper rigging techniques for load handling' },
  { name: 'Pallet Jack Operation', category: 'Material Handling', description: 'Using manual and electric pallet jacks' },
  { name: 'Lift Table Operation', category: 'Material Handling', description: 'Operating hydraulic lift tables' },
  { name: 'Reach Truck Operation', category: 'Material Handling', description: 'Operating reach trucks in warehouses' },
  { name: 'Order Picker Operation', category: 'Material Handling', description: 'Operating order picker lifts' },
  { name: 'AGV Operation', category: 'Material Handling', description: 'Operating Automated Guided Vehicles' },

  // ===== MAINTENANCE & REPAIR (10) =====
  { name: 'Hydraulic System Repair', category: 'Maintenance & Repair', description: 'Repairing hydraulic cylinders and valves' },
  { name: 'Pneumatic System Repair', category: 'Maintenance & Repair', description: 'Troubleshooting air systems and actuators' },
  { name: 'Bearing Installation', category: 'Maintenance & Repair', description: 'Proper bearing removal and installation' },
  { name: 'Shaft Alignment', category: 'Maintenance & Repair', description: 'Laser and dial indicator shaft alignment' },
  { name: 'Pump Maintenance', category: 'Maintenance & Repair', description: 'Servicing centrifugal and positive displacement pumps' },
  { name: 'Gearbox Repair', category: 'Maintenance & Repair', description: 'Repairing industrial gearboxes and speed reducers' },
  { name: 'Conveyor Maintenance', category: 'Maintenance & Repair', description: 'Maintaining conveyor systems and belts' },
  { name: 'Preventive Maintenance', category: 'Maintenance & Repair', description: 'Implementing PM schedules and procedures' },
  { name: 'Vibration Analysis', category: 'Maintenance & Repair', description: 'Using vibration analysis for predictive maintenance' },
  { name: 'Thermal Imaging', category: 'Maintenance & Repair', description: 'Using infrared cameras for equipment inspection' },

  // ===== SEMICONDUCTOR & CLEANROOM (10) =====
  { name: 'Cleanroom Protocols', category: 'Quality & Measurement', description: 'Working in ISO Class cleanroom environments' },
  { name: 'Wafer Handling', category: 'Assembly & Electronics', description: 'Proper handling of semiconductor wafers' },
  { name: 'Photolithography', category: 'Assembly & Electronics', description: 'Operating photolithography equipment' },
  { name: 'Plasma Etching', category: 'Assembly & Electronics', description: 'Operating plasma etch equipment' },
  { name: 'Chemical Vapor Deposition', category: 'Assembly & Electronics', description: 'Operating CVD equipment for thin films' },
  { name: 'Physical Vapor Deposition', category: 'Assembly & Electronics', description: 'Operating PVD/sputtering equipment' },
  { name: 'Ion Implantation', category: 'Assembly & Electronics', description: 'Operating ion implant equipment' },
  { name: 'Die Bonding', category: 'Assembly & Electronics', description: 'Semiconductor die attach operations' },
  { name: 'Wire Bonding', category: 'Assembly & Electronics', description: 'Gold and aluminum wire bonding' },
  { name: 'Semiconductor Testing', category: 'Assembly & Electronics', description: 'Final test of semiconductor devices' },

  // ===== AEROSPACE SPECIFIC (8) =====
  { name: 'Composite Layup', category: 'Assembly & Electronics', description: 'Hand layup of carbon fiber and fiberglass' },
  { name: 'Autoclave Operation', category: 'Assembly & Electronics', description: 'Curing composites in autoclaves' },
  { name: 'NDT - Ultrasonic Testing', category: 'Quality & Measurement', description: 'Non-destructive ultrasonic inspection' },
  { name: 'NDT - X-Ray Inspection', category: 'Quality & Measurement', description: 'Radiographic inspection of components' },
  { name: 'NDT - Dye Penetrant', category: 'Quality & Measurement', description: 'Liquid penetrant inspection for cracks' },
  { name: 'NDT - Magnetic Particle', category: 'Quality & Measurement', description: 'Magnetic particle inspection' },
  { name: 'Aircraft Structural Repair', category: 'Maintenance & Repair', description: 'Repairing aircraft structures per specifications' },
  { name: 'Sealant Application', category: 'Assembly & Electronics', description: 'Applying aerospace sealants and adhesives' },
];

// ============================================
// FACTORY LOCATIONS (150+ factories across US manufacturing hubs)
// ============================================

const FACTORY_LOCATIONS = [
  // Michigan - Automotive Hub
  { state: 'MI', city: 'Detroit', lat: 42.3314, lng: -83.0458, specialization: 'Automotive Assembly' },
  { state: 'MI', city: 'Dearborn', lat: 42.3223, lng: -83.1763, specialization: 'Automotive Assembly' },
  { state: 'MI', city: 'Grand Rapids', lat: 42.9634, lng: -85.6681, specialization: 'Metal Fabrication' },
  { state: 'MI', city: 'Warren', lat: 42.4775, lng: -83.0277, specialization: 'Automotive Powertrain' },
  { state: 'MI', city: 'Flint', lat: 43.0125, lng: -83.6875, specialization: 'Automotive Parts' },
  { state: 'MI', city: 'Lansing', lat: 42.7325, lng: -84.5555, specialization: 'Automotive Assembly' },
  { state: 'MI', city: 'Ann Arbor', lat: 42.2808, lng: -83.7430, specialization: 'R&D and Prototyping' },

  // Ohio - Steel and Manufacturing Belt
  { state: 'OH', city: 'Cleveland', lat: 41.4993, lng: -81.6944, specialization: 'Steel Processing' },
  { state: 'OH', city: 'Toledo', lat: 41.6528, lng: -83.5379, specialization: 'Glass Manufacturing' },
  { state: 'OH', city: 'Cincinnati', lat: 39.1031, lng: -84.5120, specialization: 'Machine Tools' },
  { state: 'OH', city: 'Columbus', lat: 39.9612, lng: -82.9988, specialization: 'Logistics Equipment' },
  { state: 'OH', city: 'Dayton', lat: 39.7589, lng: -84.1916, specialization: 'Aerospace Components' },
  { state: 'OH', city: 'Akron', lat: 41.0814, lng: -81.5190, specialization: 'Polymers and Rubber' },
  { state: 'OH', city: 'Youngstown', lat: 41.0998, lng: -80.6495, specialization: 'Steel Fabrication' },
  { state: 'OH', city: 'Canton', lat: 40.7989, lng: -81.3784, specialization: 'Industrial Machinery' },

  // Indiana - Heavy Manufacturing
  { state: 'IN', city: 'Indianapolis', lat: 39.7684, lng: -86.1581, specialization: 'Pharmaceutical' },
  { state: 'IN', city: 'Fort Wayne', lat: 41.0793, lng: -85.1394, specialization: 'Electronics Assembly' },
  { state: 'IN', city: 'Gary', lat: 41.5934, lng: -87.3465, specialization: 'Steel Production' },
  { state: 'IN', city: 'Elkhart', lat: 41.6820, lng: -85.9767, specialization: 'RV Manufacturing' },
  { state: 'IN', city: 'Columbus', lat: 39.2014, lng: -85.9214, specialization: 'Diesel Engines' },
  { state: 'IN', city: 'Lafayette', lat: 40.4167, lng: -86.8753, specialization: 'Automotive Assembly' },

  // Illinois - Diverse Manufacturing
  { state: 'IL', city: 'Chicago', lat: 41.8781, lng: -87.6298, specialization: 'Food Processing' },
  { state: 'IL', city: 'Rockford', lat: 42.2711, lng: -89.0940, specialization: 'Aerospace Fasteners' },
  { state: 'IL', city: 'Peoria', lat: 40.6936, lng: -89.5890, specialization: 'Construction Equipment' },
  { state: 'IL', city: 'Aurora', lat: 41.7606, lng: -88.3201, specialization: 'Industrial Equipment' },
  { state: 'IL', city: 'Moline', lat: 41.5067, lng: -90.5151, specialization: 'Agricultural Equipment' },

  // Wisconsin - Heavy Machinery
  { state: 'WI', city: 'Milwaukee', lat: 43.0389, lng: -87.9065, specialization: 'Heavy Machinery' },
  { state: 'WI', city: 'Oshkosh', lat: 44.0247, lng: -88.5426, specialization: 'Specialty Vehicles' },
  { state: 'WI', city: 'Green Bay', lat: 44.5133, lng: -88.0133, specialization: 'Paper Products' },
  { state: 'WI', city: 'Racine', lat: 42.7261, lng: -87.7828, specialization: 'Industrial Controls' },
  { state: 'WI', city: 'Appleton', lat: 44.2619, lng: -88.4154, specialization: 'Paper Manufacturing' },

  // Texas - Energy, Semiconductor, and Aerospace
  { state: 'TX', city: 'Houston', lat: 29.7604, lng: -95.3698, specialization: 'Petrochemical Equipment' },
  { state: 'TX', city: 'Dallas', lat: 32.7767, lng: -96.7970, specialization: 'Semiconductor' },
  { state: 'TX', city: 'San Antonio', lat: 29.4241, lng: -98.4936, specialization: 'Aerospace' },
  { state: 'TX', city: 'Austin', lat: 30.2672, lng: -97.7431, specialization: 'Semiconductor Fab' },
  { state: 'TX', city: 'Fort Worth', lat: 32.7555, lng: -97.3308, specialization: 'Defense Aircraft' },
  { state: 'TX', city: 'El Paso', lat: 31.7619, lng: -106.4850, specialization: 'Electronics Assembly' },
  { state: 'TX', city: 'Plano', lat: 33.0198, lng: -96.6989, specialization: 'Telecom Equipment' },
  { state: 'TX', city: 'Irving', lat: 32.8140, lng: -96.9489, specialization: 'Semiconductor' },
  { state: 'TX', city: 'Arlington', lat: 32.7357, lng: -97.1081, specialization: 'Automotive Assembly' },
  { state: 'TX', city: 'Corpus Christi', lat: 27.8006, lng: -97.3964, specialization: 'Petrochemical' },

  // California - Tech and Aerospace
  { state: 'CA', city: 'Los Angeles', lat: 34.0522, lng: -118.2437, specialization: 'Aerospace Assembly' },
  { state: 'CA', city: 'San Jose', lat: 37.3382, lng: -121.8863, specialization: 'Semiconductor' },
  { state: 'CA', city: 'Fresno', lat: 36.7378, lng: -119.7871, specialization: 'Food Processing' },
  { state: 'CA', city: 'San Diego', lat: 32.7157, lng: -117.1611, specialization: 'Defense Electronics' },
  { state: 'CA', city: 'Long Beach', lat: 33.7701, lng: -118.1937, specialization: 'Aerospace' },
  { state: 'CA', city: 'Fremont', lat: 37.5483, lng: -121.9886, specialization: 'Electric Vehicles' },
  { state: 'CA', city: 'Milpitas', lat: 37.4283, lng: -121.9067, specialization: 'Semiconductor' },
  { state: 'CA', city: 'Santa Clara', lat: 37.3541, lng: -121.9552, specialization: 'Semiconductor' },
  { state: 'CA', city: 'Palmdale', lat: 34.5794, lng: -118.1165, specialization: 'Defense Aircraft' },
  { state: 'CA', city: 'El Segundo', lat: 33.9192, lng: -118.4165, specialization: 'Aerospace' },

  // Arizona - Semiconductor Hub
  { state: 'AZ', city: 'Phoenix', lat: 33.4484, lng: -112.0740, specialization: 'Semiconductor Fab' },
  { state: 'AZ', city: 'Chandler', lat: 33.3062, lng: -111.8413, specialization: 'Semiconductor Fab' },
  { state: 'AZ', city: 'Mesa', lat: 33.4152, lng: -111.8315, specialization: 'Aerospace' },
  { state: 'AZ', city: 'Tucson', lat: 32.2226, lng: -110.9747, specialization: 'Aerospace Missiles' },
  { state: 'AZ', city: 'Tempe', lat: 33.4255, lng: -111.9400, specialization: 'Electronics' },

  // Pacific Northwest - Aerospace and Tech
  { state: 'WA', city: 'Seattle', lat: 47.6062, lng: -122.3321, specialization: 'Commercial Aircraft' },
  { state: 'WA', city: 'Renton', lat: 47.4829, lng: -122.2171, specialization: 'Aircraft Assembly' },
  { state: 'WA', city: 'Everett', lat: 47.9790, lng: -122.2021, specialization: 'Wide-Body Aircraft' },
  { state: 'WA', city: 'Spokane', lat: 47.6587, lng: -117.4260, specialization: 'Aluminum Processing' },
  { state: 'WA', city: 'Tacoma', lat: 47.2529, lng: -122.4443, specialization: 'Heavy Fabrication' },
  { state: 'OR', city: 'Portland', lat: 45.5152, lng: -122.6784, specialization: 'Electronics' },
  { state: 'OR', city: 'Hillsboro', lat: 45.5229, lng: -122.9898, specialization: 'Semiconductor' },
  { state: 'OR', city: 'Beaverton', lat: 45.4871, lng: -122.8037, specialization: 'Electronics' },

  // Northeast - Precision and Specialty
  { state: 'PA', city: 'Pittsburgh', lat: 40.4406, lng: -79.9959, specialization: 'Specialty Steel' },
  { state: 'PA', city: 'Philadelphia', lat: 39.9526, lng: -75.1652, specialization: 'Pharmaceutical' },
  { state: 'PA', city: 'Allentown', lat: 40.6023, lng: -75.4714, specialization: 'Industrial Equipment' },
  { state: 'PA', city: 'Erie', lat: 42.1292, lng: -80.0851, specialization: 'Locomotive Manufacturing' },
  { state: 'PA', city: 'York', lat: 39.9626, lng: -76.7277, specialization: 'HVAC Equipment' },
  { state: 'NY', city: 'Buffalo', lat: 42.8864, lng: -78.8784, specialization: 'Automotive Parts' },
  { state: 'NY', city: 'Rochester', lat: 43.1566, lng: -77.6088, specialization: 'Optics and Imaging' },
  { state: 'NY', city: 'Syracuse', lat: 43.0481, lng: -76.1474, specialization: 'Electronics' },
  { state: 'NY', city: 'Albany', lat: 42.6526, lng: -73.7562, specialization: 'Semiconductor' },
  { state: 'MA', city: 'Boston', lat: 42.3601, lng: -71.0589, specialization: 'Medical Devices' },
  { state: 'MA', city: 'Worcester', lat: 42.2626, lng: -71.8023, specialization: 'Biotech' },
  { state: 'MA', city: 'Springfield', lat: 42.1015, lng: -72.5898, specialization: 'Precision Tools' },
  { state: 'CT', city: 'Hartford', lat: 41.7658, lng: -72.6734, specialization: 'Aerospace Engines' },
  { state: 'CT', city: 'New Haven', lat: 41.3083, lng: -72.9279, specialization: 'Medical Devices' },

  // Southeast - Automotive and Aerospace
  { state: 'NC', city: 'Charlotte', lat: 35.2271, lng: -80.8431, specialization: 'Energy Equipment' },
  { state: 'NC', city: 'Greensboro', lat: 36.0726, lng: -79.7920, specialization: 'Textiles' },
  { state: 'NC', city: 'Raleigh', lat: 35.7796, lng: -78.6382, specialization: 'Pharmaceutical' },
  { state: 'NC', city: 'Durham', lat: 35.9940, lng: -78.8986, specialization: 'Biotech' },
  { state: 'SC', city: 'Greenville', lat: 34.8526, lng: -82.3940, specialization: 'Automotive' },
  { state: 'SC', city: 'Spartanburg', lat: 34.9496, lng: -81.9320, specialization: 'Automotive Assembly' },
  { state: 'SC', city: 'Charleston', lat: 32.7765, lng: -79.9311, specialization: 'Aircraft Assembly' },
  { state: 'GA', city: 'Atlanta', lat: 33.7490, lng: -84.3880, specialization: 'Logistics Equipment' },
  { state: 'GA', city: 'Savannah', lat: 32.0809, lng: -81.0912, specialization: 'Paper Products' },
  { state: 'GA', city: 'Augusta', lat: 33.4735, lng: -82.0105, specialization: 'Nuclear Components' },
  { state: 'AL', city: 'Birmingham', lat: 33.5186, lng: -86.8104, specialization: 'Steel Processing' },
  { state: 'AL', city: 'Huntsville', lat: 34.7304, lng: -86.5861, specialization: 'Space Systems' },
  { state: 'AL', city: 'Montgomery', lat: 32.3792, lng: -86.3077, specialization: 'Automotive Assembly' },
  { state: 'AL', city: 'Mobile', lat: 30.6954, lng: -88.0399, specialization: 'Shipbuilding' },
  { state: 'TN', city: 'Nashville', lat: 36.1627, lng: -86.7816, specialization: 'Healthcare Products' },
  { state: 'TN', city: 'Memphis', lat: 35.1495, lng: -90.0490, specialization: 'Medical Devices' },
  { state: 'TN', city: 'Chattanooga', lat: 35.0456, lng: -85.3097, specialization: 'Automotive Assembly' },
  { state: 'TN', city: 'Smyrna', lat: 35.9828, lng: -86.5186, specialization: 'Automotive Assembly' },
  { state: 'KY', city: 'Louisville', lat: 38.2527, lng: -85.7585, specialization: 'Automotive Assembly' },
  { state: 'KY', city: 'Lexington', lat: 38.0406, lng: -84.5037, specialization: 'Automotive Parts' },
  { state: 'KY', city: 'Bowling Green', lat: 36.9685, lng: -86.4808, specialization: 'Sports Cars' },
  { state: 'MS', city: 'Canton', lat: 32.6126, lng: -90.0368, specialization: 'Automotive Assembly' },
  { state: 'MS', city: 'Tupelo', lat: 34.2576, lng: -88.7034, specialization: 'Furniture Manufacturing' },

  // Central US - Agriculture and Heavy Equipment
  { state: 'MO', city: 'St. Louis', lat: 38.6270, lng: -90.1994, specialization: 'Aerospace' },
  { state: 'MO', city: 'Kansas City', lat: 39.0997, lng: -94.5786, specialization: 'Agricultural Equipment' },
  { state: 'MO', city: 'Springfield', lat: 37.2090, lng: -93.2923, specialization: 'Defense Vehicles' },
  { state: 'KS', city: 'Wichita', lat: 37.6872, lng: -97.3301, specialization: 'General Aviation' },
  { state: 'KS', city: 'Kansas City', lat: 39.1155, lng: -94.6268, specialization: 'Automotive Assembly' },
  { state: 'NE', city: 'Omaha', lat: 41.2565, lng: -95.9345, specialization: 'Food Processing' },
  { state: 'NE', city: 'Lincoln', lat: 40.8258, lng: -96.6852, specialization: 'Agricultural Equipment' },
  { state: 'IA', city: 'Des Moines', lat: 41.5868, lng: -93.6250, specialization: 'Agricultural Machinery' },
  { state: 'IA', city: 'Cedar Rapids', lat: 41.9779, lng: -91.6656, specialization: 'Aerospace' },
  { state: 'IA', city: 'Davenport', lat: 41.5236, lng: -90.5776, specialization: 'Agricultural Equipment' },
  { state: 'MN', city: 'Minneapolis', lat: 44.9778, lng: -93.2650, specialization: 'Medical Devices' },
  { state: 'MN', city: 'St. Paul', lat: 44.9537, lng: -93.0900, specialization: 'Industrial Adhesives' },
  { state: 'MN', city: 'Rochester', lat: 44.0121, lng: -92.4802, specialization: 'Medical Equipment' },
  { state: 'ND', city: 'Fargo', lat: 46.8772, lng: -96.7898, specialization: 'Agricultural Equipment' },
  { state: 'SD', city: 'Sioux Falls', lat: 43.5460, lng: -96.7313, specialization: 'Food Processing' },

  // Mountain West
  { state: 'CO', city: 'Denver', lat: 39.7392, lng: -104.9903, specialization: 'Aerospace' },
  { state: 'CO', city: 'Colorado Springs', lat: 38.8339, lng: -104.8214, specialization: 'Defense Electronics' },
  { state: 'CO', city: 'Boulder', lat: 40.0150, lng: -105.2705, specialization: 'Aerospace Instruments' },
  { state: 'UT', city: 'Salt Lake City', lat: 40.7608, lng: -111.8910, specialization: 'Defense Systems' },
  { state: 'UT', city: 'Ogden', lat: 41.2230, lng: -111.9738, specialization: 'Aerospace' },
  { state: 'UT', city: 'Provo', lat: 40.2338, lng: -111.6585, specialization: 'Software/Hardware' },
  { state: 'NV', city: 'Las Vegas', lat: 36.1699, lng: -115.1398, specialization: 'Solar Panels' },
  { state: 'NV', city: 'Reno', lat: 39.5296, lng: -119.8138, specialization: 'Battery Manufacturing' },
  { state: 'NV', city: 'Sparks', lat: 39.5349, lng: -119.7527, specialization: 'EV Battery Packs' },
  { state: 'NM', city: 'Albuquerque', lat: 35.0844, lng: -106.6504, specialization: 'Microelectronics' },

  // Gulf Coast
  { state: 'LA', city: 'New Orleans', lat: 29.9511, lng: -90.0715, specialization: 'Shipbuilding' },
  { state: 'LA', city: 'Baton Rouge', lat: 30.4583, lng: -91.1403, specialization: 'Petrochemical' },
  { state: 'FL', city: 'Jacksonville', lat: 30.3322, lng: -81.6557, specialization: 'Paper Products' },
  { state: 'FL', city: 'Tampa', lat: 27.9506, lng: -82.4572, specialization: 'Medical Devices' },
  { state: 'FL', city: 'Orlando', lat: 28.5383, lng: -81.3792, specialization: 'Defense Simulation' },
  { state: 'FL', city: 'Melbourne', lat: 28.0836, lng: -80.6081, specialization: 'Space Systems' },
  { state: 'FL', city: 'Cape Canaveral', lat: 28.3922, lng: -80.6077, specialization: 'Launch Systems' },

  // New England
  { state: 'NH', city: 'Nashua', lat: 42.7654, lng: -71.4676, specialization: 'Defense Electronics' },
  { state: 'VT', city: 'Burlington', lat: 44.4759, lng: -73.2121, specialization: 'Semiconductor' },
  { state: 'ME', city: 'Portland', lat: 43.6591, lng: -70.2568, specialization: 'Precision Components' },
  { state: 'RI', city: 'Providence', lat: 41.8240, lng: -71.4128, specialization: 'Jewelry and Metals' },

  // Additional Locations
  { state: 'VA', city: 'Richmond', lat: 37.5407, lng: -77.4360, specialization: 'Tobacco Machinery' },
  { state: 'VA', city: 'Newport News', lat: 37.0871, lng: -76.4730, specialization: 'Shipbuilding' },
  { state: 'VA', city: 'Norfolk', lat: 36.8508, lng: -76.2859, specialization: 'Naval Systems' },
  { state: 'WV', city: 'Charleston', lat: 38.3498, lng: -81.6326, specialization: 'Chemical Processing' },
  { state: 'MD', city: 'Baltimore', lat: 39.2904, lng: -76.6122, specialization: 'Steel Processing' },
  { state: 'NJ', city: 'Newark', lat: 40.7357, lng: -74.1724, specialization: 'Pharmaceutical' },
  { state: 'NJ', city: 'Trenton', lat: 40.2206, lng: -74.7597, specialization: 'Ceramics' },
  { state: 'DE', city: 'Wilmington', lat: 39.7391, lng: -75.5398, specialization: 'Chemical Manufacturing' },
];

// ============================================
// OCCUPATION-SKILL MAPPINGS (comprehensive mappings)
// ============================================

const OCCUPATION_SKILL_MAPPINGS: Record<string, string[]> = {
  // Engineering Roles
  'CNC Programmer': ['CNC Programming', 'G-Code Programming', 'Mastercam', 'GD&T Interpretation', 'Blueprint Reading', 'Vericut Simulation'],
  'NC Programmer': ['CNC Programming', 'G-Code Programming', 'CAM Programming', 'GD&T Interpretation', 'Blueprint Reading'],
  'CAD Designer': ['SolidWorks', 'AutoCAD', 'GD&T Interpretation', 'Blueprint Reading', 'Inventor'],
  'CAM Programmer': ['Mastercam', 'GibbsCAM', 'PowerMill', 'CNC Programming', 'GD&T Interpretation', 'Vericut Simulation'],
  'Mechanical Engineer': ['SolidWorks', 'CATIA', 'GD&T Interpretation', 'Blueprint Reading', 'Creo (Pro/ENGINEER)'],
  'Electrical Engineer': ['Electrical Schematic Reading', 'Allen-Bradley PLC', 'VFD Programming', 'Servo Drive Configuration', 'HMI Development'],
  'Process Engineer': ['SolidWorks', 'Statistical Process Control', 'GD&T Interpretation', 'Allen-Bradley PLC', 'Mastercam'],
  'Industrial Engineer': ['SolidWorks', 'Statistical Process Control', 'GD&T Interpretation', 'Blueprint Reading', 'AutoCAD'],
  'Manufacturing Engineer': ['SolidWorks', 'Mastercam', 'GD&T Interpretation', 'Statistical Process Control', 'Allen-Bradley PLC'],
  'Quality Engineer': ['CMM Programming', 'GD&T Interpretation', 'Statistical Process Control', 'ISO 9001 Compliance', 'First Article Inspection'],
  'Aerospace Engineer': ['CATIA', 'NX (Unigraphics)', 'GD&T Interpretation', 'Composite Layup', 'AS9100 Compliance'],
  'Systems Engineer': ['SolidWorks', 'CATIA', 'Electrical Schematic Reading', 'Allen-Bradley PLC', 'HMI Development'],
  'Controls Engineer': ['Allen-Bradley PLC', 'Siemens PLC', 'VFD Programming', 'HMI Development', 'Servo Drive Configuration'],
  'Automation Engineer': ['FANUC Robot Programming', 'ABB Robot Programming', 'Allen-Bradley PLC', 'HMI Development', 'VFD Programming'],
  'Test Engineer': ['Oscilloscope Usage', 'Multimeter Testing', 'Statistical Process Control', 'LabVIEW', 'Electrical Schematic Reading'],
  'Reliability Engineer': ['Vibration Analysis', 'Thermal Imaging', 'Statistical Process Control', 'NDT - Ultrasonic Testing', 'GD&T Interpretation'],
  'Design Engineer': ['SolidWorks', 'CATIA', 'GD&T Interpretation', 'Creo (Pro/ENGINEER)', 'Fusion 360'],
  'Tooling Engineer': ['SolidWorks', 'Mastercam', 'GD&T Interpretation', 'EDM Operation', 'Precision Grinding'],
  'Materials Engineer': ['SolidWorks', 'GD&T Interpretation', 'Heat Treat Process', 'NDT - Ultrasonic Testing', 'CMM Programming'],
  'Chemical Engineer': ['Process Control', 'Instrumentation Calibration', 'Statistical Process Control', 'Pump Maintenance', 'Blueprint Reading'],

  // Drafting and Design
  'Drafting Technician': ['AutoCAD', 'SolidWorks', 'GD&T Interpretation', 'Blueprint Reading', 'Inventor'],
  'Mechanical Drafter': ['AutoCAD', 'SolidWorks', 'GD&T Interpretation', 'Blueprint Reading', 'Creo (Pro/ENGINEER)'],
  'Electrical Drafter': ['AutoCAD', 'Electrical Schematic Reading', 'Blueprint Reading', 'SolidWorks', 'Inventor'],
  'CAD Technician': ['SolidWorks', 'AutoCAD', 'GD&T Interpretation', 'Blueprint Reading', 'Inventor', 'Creo (Pro/ENGINEER)'],
  '3D Modeler': ['SolidWorks', 'CATIA', 'NX (Unigraphics)', 'Fusion 360', 'GD&T Interpretation'],

  // Machining and Fabrication
  'CNC Machine Operator': ['CNC Programming', 'Blueprint Reading', 'Micrometer Reading', 'GD&T Interpretation', 'Caliper Measurement'],
  'CNC Lathe Operator': ['CNC Programming', 'Manual Lathe Operation', 'Micrometer Reading', 'Blueprint Reading', 'GD&T Interpretation'],
  'CNC Mill Operator': ['CNC Programming', 'Vertical Milling', 'Micrometer Reading', 'Blueprint Reading', 'GD&T Interpretation'],
  'Machinist': ['Manual Lathe Operation', 'Manual Mill Operation', 'Micrometer Reading', 'Blueprint Reading', 'Precision Grinding'],
  'Tool and Die Maker': ['Precision Grinding', 'EDM Operation', 'Manual Mill Operation', 'GD&T Interpretation', 'Jig Grinding'],
  'Setup Technician': ['CNC Programming', 'GD&T Interpretation', 'Micrometer Reading', 'Blueprint Reading', 'First Article Inspection'],
  'EDM Operator': ['EDM Operation', 'Blueprint Reading', 'Micrometer Reading', 'GD&T Interpretation', 'Caliper Measurement'],
  'Grinding Machine Operator': ['Precision Grinding', 'Surface Roughness Testing', 'Micrometer Reading', 'Blueprint Reading', 'GD&T Interpretation'],
  'Swiss-Type Lathe Operator': ['Swiss-Type Machining', 'CNC Programming', 'Micrometer Reading', 'Blueprint Reading', 'GD&T Interpretation'],
  'Laser Cutting Operator': ['CNC Programming', 'Blueprint Reading', 'Caliper Measurement', 'CAM Programming', 'Micrometer Reading'],
  'Waterjet Operator': ['CNC Programming', 'Blueprint Reading', 'Caliper Measurement', 'CAM Programming', 'Micrometer Reading'],
  'Plasma Cutter Operator': ['Blueprint Reading', 'Caliper Measurement', 'CNC Programming', 'MIG Welding', 'Micrometer Reading'],

  // Welding and Fabrication
  'Welder': ['MIG Welding', 'TIG Welding', 'Stick Welding', 'Blueprint Reading', 'Flux Core Welding'],
  'TIG Welder': ['TIG Welding', 'Blueprint Reading', 'Micrometer Reading', 'Orbital Welding', 'Stainless Steel Welding'],
  'MIG Welder': ['MIG Welding', 'Blueprint Reading', 'Flux Core Welding', 'Spot Welding', 'Micrometer Reading'],
  'Certified Welder': ['TIG Welding', 'MIG Welding', 'Blueprint Reading', 'NDT - Dye Penetrant', 'Orbital Welding'],
  'Robotic Welder Operator': ['FANUC Robot Programming', 'MIG Welding', 'TIG Welding', 'Blueprint Reading', 'Spot Welding'],
  'Sheet Metal Worker': ['Sheet Metal Forming', 'Press Brake Operation', 'MIG Welding', 'Blueprint Reading', 'TIG Welding'],
  'Metal Fabricator': ['MIG Welding', 'Sheet Metal Forming', 'Blueprint Reading', 'Press Brake Operation', 'Structural Steel Fabrication'],

  // Quality and Inspection
  'Quality Control Inspector': ['CMM Operation', 'GD&T Interpretation', 'Micrometer Reading', 'Caliper Measurement', 'Surface Roughness Testing'],
  'CMM Operator': ['CMM Operation', 'CMM Programming', 'GD&T Interpretation', 'Micrometer Reading', 'First Article Inspection'],
  'Quality Assurance Manager': ['ISO 9001 Compliance', 'AS9100 Compliance', 'Statistical Process Control', 'GD&T Interpretation', 'First Article Inspection'],
  'NDT Technician': ['NDT - Ultrasonic Testing', 'NDT - X-Ray Inspection', 'NDT - Dye Penetrant', 'NDT - Magnetic Particle', 'Blueprint Reading'],
  'Metrology Technician': ['CMM Operation', 'CMM Programming', 'Optical Comparator', 'GD&T Interpretation', 'Instrumentation Calibration'],
  'First Article Inspector': ['First Article Inspection', 'CMM Operation', 'GD&T Interpretation', 'AS9100 Compliance', 'Micrometer Reading'],
  'Receiving Inspector': ['Caliper Measurement', 'Micrometer Reading', 'GD&T Interpretation', 'Blueprint Reading', 'Height Gauge Usage'],

  // Electronics and Semiconductor
  'Electronics Assembler': ['Through-Hole Soldering', 'SMT Soldering', 'Wire Harness Assembly', 'Crimping and Termination', 'IPC-A-610 Soldering'],
  'PCB Assembler': ['SMT Soldering', 'Through-Hole Soldering', 'BGA Rework', 'IPC-A-610 Soldering', 'Conformal Coating'],
  'Electronics Technician': ['Oscilloscope Usage', 'Multimeter Testing', 'Through-Hole Soldering', 'SMT Soldering', 'Electrical Schematic Reading'],
  'Semiconductor Process Technician': ['Cleanroom Protocols', 'Wafer Handling', 'Photolithography', 'Plasma Etching', 'Chemical Vapor Deposition'],
  'Cleanroom Technician': ['Cleanroom Protocols', 'Wafer Handling', 'Photolithography', 'Physical Vapor Deposition', 'Ion Implantation'],
  'Wafer Fab Operator': ['Photolithography', 'Plasma Etching', 'Chemical Vapor Deposition', 'Cleanroom Protocols', 'Wafer Handling'],
  'Test Technician': ['Oscilloscope Usage', 'Multimeter Testing', 'Semiconductor Testing', 'Electrical Schematic Reading', 'Statistical Process Control'],

  // Assembly and Production
  'Assembly Line Worker': ['Torque Wrench Usage', 'Crimping and Termination', 'Blueprint Reading', 'Caliper Measurement', 'Micrometer Reading'],
  'Production Assembler': ['Torque Wrench Usage', 'Blueprint Reading', 'Caliper Measurement', 'Through-Hole Soldering', 'Crimping and Termination'],
  'Aerospace Assembler': ['Aerospace Riveting', 'Sealant Application', 'Blueprint Reading', 'Torque Wrench Usage', 'Composite Layup'],
  'Composite Technician': ['Composite Layup', 'Autoclave Operation', 'Blueprint Reading', 'Sealant Application', 'NDT - Ultrasonic Testing'],
  'Wire Harness Assembler': ['Wire Harness Assembly', 'Crimping and Termination', 'Blueprint Reading', 'Through-Hole Soldering', 'Electrical Schematic Reading'],
  'Production Operator': ['Blueprint Reading', 'Caliper Measurement', 'Torque Wrench Usage', 'Micrometer Reading', 'Statistical Process Control'],

  // Maintenance and Facilities
  'Maintenance Technician': ['Hydraulic System Repair', 'Pneumatic System Repair', 'Bearing Installation', 'Shaft Alignment', 'Pump Maintenance'],
  'Industrial Electrician': ['Electrical Schematic Reading', 'Motor Wiring', 'VFD Programming', '480V Power Systems', 'Conduit Bending'],
  'Millwright': ['Shaft Alignment', 'Bearing Installation', 'Rigging and Slinging', 'Hydraulic System Repair', 'Pump Maintenance'],
  'PLC Technician': ['Allen-Bradley PLC', 'Siemens PLC', 'HMI Development', 'Electrical Schematic Reading', 'VFD Programming'],
  'Hydraulics Technician': ['Hydraulic System Repair', 'Blueprint Reading', 'Pump Maintenance', 'Pneumatic System Repair', 'Micrometer Reading'],
  'Robotics Technician': ['FANUC Robot Programming', 'ABB Robot Programming', 'KUKA Robot Programming', 'Allen-Bradley PLC', 'HMI Development'],

  // Supervision and Management
  'Production Supervisor': ['Blueprint Reading', 'Statistical Process Control', 'GD&T Interpretation', 'ISO 9001 Compliance', 'Lean Manufacturing'],
  'Manufacturing Supervisor': ['Blueprint Reading', 'Statistical Process Control', 'GD&T Interpretation', 'CNC Programming', 'ISO 9001 Compliance'],
  'Plant Manager': ['Statistical Process Control', 'ISO 9001 Compliance', 'Lean Manufacturing', 'Blueprint Reading', 'GD&T Interpretation'],
  'Operations Manager': ['Statistical Process Control', 'ISO 9001 Compliance', 'Lean Manufacturing', 'Blueprint Reading', 'ERP Systems'],
  'Lean Manufacturing Specialist': ['Statistical Process Control', 'Lean Manufacturing', 'GD&T Interpretation', 'Blueprint Reading', 'ISO 9001 Compliance'],
  'Safety Manager': ['OSHA Compliance', 'Blueprint Reading', 'Electrical Schematic Reading', 'Lockout Tagout', 'Hydraulic System Repair'],

  // Material Handling and Logistics
  'Forklift Operator': ['Forklift Operation', 'Pallet Jack Operation', 'Overhead Crane Operation', 'Rigging and Slinging', 'Reach Truck Operation'],
  'Materials Handler': ['Forklift Operation', 'Overhead Crane Operation', 'Rigging and Slinging', 'Pallet Jack Operation', 'AGV Operation'],
  'Shipping and Receiving Clerk': ['Forklift Operation', 'Pallet Jack Operation', 'ERP Systems', 'Inventory Control', 'Barcode Scanning'],
  'Supply Chain Coordinator': ['ERP Systems', 'Inventory Control', 'Forklift Operation', 'Pallet Jack Operation', 'Statistical Process Control'],
  'Inventory Control Specialist': ['ERP Systems', 'Inventory Control', 'Barcode Scanning', 'Forklift Operation', 'Statistical Process Control'],

  // Specialized Operations
  'Injection Molding Operator': ['Hydraulic System Repair', 'Blueprint Reading', 'Micrometer Reading', 'Caliper Measurement', 'Statistical Process Control'],
  'Chemical Operator': ['Pump Maintenance', 'Instrumentation Calibration', 'Blueprint Reading', 'Statistical Process Control', 'Multimeter Testing'],
  'Packaging Machine Operator': ['Pneumatic System Repair', 'Electrical Schematic Reading', 'Bearing Installation', 'Conveyor Maintenance', 'Multimeter Testing'],
  'Painter, Industrial': ['Blueprint Reading', 'Surface Roughness Testing', 'Spray Equipment Operation', 'Caliper Measurement', 'Thickness Testing'],
  'Heat Treat Operator': ['Blueprint Reading', 'Micrometer Reading', 'Hardness Testing', 'Pyrometry', 'Statistical Process Control'],
  'Plating Operator': ['Blueprint Reading', 'Micrometer Reading', 'Chemical Handling', 'Surface Roughness Testing', 'Thickness Testing'],
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
