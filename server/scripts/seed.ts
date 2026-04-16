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
  { name: 'TSMC', industries: ['Electronics'], description: 'Taiwan Semiconductor Manufacturing Company - worlds largest contract chipmaker', lat: '37.3875', lng: '-121.9636' },
  { name: 'Dell Technologies', industries: ['Electronics'], description: 'Computer technology company providing PCs, servers, and IT infrastructure', lat: '30.3944', lng: '-97.7256' },
  { name: 'Lenovo', industries: ['Electronics'], description: 'Multinational technology company manufacturing PCs, tablets, and servers', lat: '27.9506', lng: '-82.4572' },
  { name: 'Hewlett-Packard', industries: ['Electronics'], description: 'Information technology company providing hardware, software, and services', lat: '37.4135', lng: '-122.1312' },
  { name: 'Siemens', industries: ['Electronics', 'Industrial Machinery', 'Energy'], description: 'Industrial manufacturing and technology conglomerate', lat: '33.7871', lng: '-84.3933' },
  { name: 'Autodesk', industries: ['Electronics'], description: 'Software company for architecture, engineering, and entertainment industries', lat: '37.7941', lng: '-122.2647' },
  { name: 'DMG Mori', industries: ['Industrial Machinery'], description: 'Global machine tool manufacturer for turning and milling', lat: '32.7934', lng: '-96.7686' },

  // Defense and Aerospace
  { name: 'SpaceX', industries: ['Aerospace & Defense'], description: 'Space transportation and satellite communications company', lat: '33.9207', lng: '-118.3280' },
  { name: 'NASA', industries: ['Aerospace & Defense'], description: 'National Aeronautics and Space Administration', lat: '28.5729', lng: '-80.6490' },
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

  // Major Automotive OEMs
  { name: 'Toyota Motor', industries: ['Automotive'], description: 'Japanese multinational automotive manufacturer', lat: '33.0851', lng: '-96.8418' },
  { name: 'Nissan Motor', industries: ['Automotive'], description: 'Japanese multinational automobile manufacturer', lat: '33.1092', lng: '-96.8280' },

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
  { name: 'Nestle', industries: ['Agriculture & Food'], description: 'Swiss multinational food and drink processing corporation', lat: '40.0583', lng: '-74.4057' },
  { name: 'Cardinal Health', industries: ['Medical & Pharmaceuticals'], description: 'Healthcare services and pharmaceutical distribution company', lat: '40.0992', lng: '-82.9654' },
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

  // Semiconductor Engineering
  { title: 'Process Integration Engineer', onetCode: '17-2199.10', description: 'Integrate and optimize semiconductor fabrication process modules' },
  { title: 'Lithography Engineer', onetCode: '17-2199.11', description: 'Develop and optimize photolithography processes for chip manufacturing' },
  { title: 'Etch Engineer', onetCode: '17-2199.12', description: 'Develop plasma etch processes for semiconductor patterning' },
  { title: 'Thin Film Engineer', onetCode: '17-2199.13', description: 'Develop CVD and PVD processes for thin film deposition' },
  { title: 'Failure Analysis Engineer', onetCode: '17-2199.14', description: 'Investigate semiconductor device failures and reliability issues' },
  { title: 'Device Engineer', onetCode: '17-2199.15', description: 'Design and characterize semiconductor devices and transistors' },
  { title: 'Yield Engineer', onetCode: '17-2199.16', description: 'Analyze and improve semiconductor manufacturing yield' },
  { title: 'Metrology Engineer', onetCode: '17-2199.17', description: 'Develop inline measurement techniques for semiconductor fabs' },

  // Aerospace Engineering
  { title: 'Propulsion Engineer', onetCode: '17-2011.01', description: 'Design and develop aircraft and rocket propulsion systems' },
  { title: 'Avionics Technician', onetCode: '49-2091.00', description: 'Install and maintain aircraft electronic systems' },
  { title: 'Flight Test Engineer', onetCode: '17-2011.02', description: 'Plan and conduct aircraft flight test programs' },
  { title: 'Structures Engineer', onetCode: '17-2011.03', description: 'Design and analyze aircraft structural components' },
  { title: 'Aerostructures Mechanic', onetCode: '51-2011.02', description: 'Assemble and repair aircraft structural components' },
  { title: 'Aircraft Mechanic', onetCode: '49-3011.00', description: 'Inspect, repair, and maintain aircraft engines and systems' },
  { title: 'Space Systems Engineer', onetCode: '17-2011.04', description: 'Design and integrate spacecraft and satellite systems' },

  // Automotive Engineering
  { title: 'Battery Engineer', onetCode: '17-2199.20', description: 'Design and develop battery systems for electric vehicles' },
  { title: 'EV Systems Engineer', onetCode: '17-2199.21', description: 'Integrate electric vehicle powertrains and systems' },
  { title: 'Powertrain Engineer', onetCode: '17-2199.22', description: 'Design and develop vehicle powertrain components' },
  { title: 'ADAS Engineer', onetCode: '17-2199.23', description: 'Develop advanced driver assistance and autonomous systems' },
  { title: 'Chassis Engineer', onetCode: '17-2199.24', description: 'Design vehicle chassis, suspension, and steering systems' },
  { title: 'NVH Engineer', onetCode: '17-2199.25', description: 'Analyze and reduce noise, vibration, and harshness' },
  { title: 'Vehicle Integration Engineer', onetCode: '17-2199.26', description: 'Integrate automotive systems and resolve conflicts' },
  { title: 'Automotive Body Engineer', onetCode: '17-2199.27', description: 'Design vehicle body structures and panels' },

  // Robotics and Automation
  { title: 'Robot Programmer', onetCode: '17-3024.01', description: 'Program industrial robots for manufacturing operations' },
  { title: 'Vision Systems Engineer', onetCode: '17-2199.30', description: 'Design and implement machine vision inspection systems' },
  { title: 'Cobot Technician', onetCode: '17-3024.02', description: 'Deploy and maintain collaborative robots in manufacturing' },
  { title: 'Motion Control Engineer', onetCode: '17-2199.31', description: 'Design servo systems and motion control solutions' },
  { title: 'Automation Technician', onetCode: '17-3024.03', description: 'Install and troubleshoot automated manufacturing systems' },

  // Advanced Manufacturing
  { title: 'Additive Manufacturing Engineer', onetCode: '17-2199.35', description: 'Develop 3D printing and additive manufacturing processes' },
  { title: 'Additive Manufacturing Technician', onetCode: '51-9199.01', description: 'Operate metal and polymer 3D printing systems' },
  { title: 'Laser Technician', onetCode: '17-3029.01', description: 'Operate and maintain industrial laser systems' },
  { title: 'Precision Assembly Technician', onetCode: '51-2092.02', description: 'Perform high-precision mechanical assembly operations' },

  // Defense and Military
  { title: 'Ordnance Technician', onetCode: '51-9199.02', description: 'Assemble and test military ordnance and munitions' },
  { title: 'Radar Technician', onetCode: '17-3023.02', description: 'Install and maintain radar and detection systems' },
  { title: 'Missile Technician', onetCode: '17-3023.03', description: 'Assemble and test missile guidance and propulsion systems' },
  { title: 'Electronic Warfare Technician', onetCode: '17-3023.04', description: 'Test and maintain electronic countermeasure systems' },

  // Medical Device Manufacturing
  { title: 'Medical Device Assembler', onetCode: '51-2092.03', description: 'Assemble medical devices in FDA-regulated cleanrooms' },
  { title: 'Sterilization Technician', onetCode: '51-9199.03', description: 'Operate medical device sterilization equipment' },
  { title: 'Biomedical Engineer', onetCode: '17-2031.00', description: 'Design medical devices and healthcare equipment' },

  // ============================================
  // AEROSPACE & DEFENSE COMPREHENSIVE OCCUPATIONS
  // ============================================

  // NDT/NDI Inspection Specialists (25 occupations)
  { title: 'UT Level I Inspector', onetCode: '51-9061.10', description: 'Perform ultrasonic testing under Level II/III supervision per NAS 410' },
  { title: 'UT Level II Inspector', onetCode: '51-9061.11', description: 'Conduct and interpret ultrasonic inspections per ASNT SNT-TC-1A' },
  { title: 'UT Level III Inspector', onetCode: '51-9061.12', description: 'Develop UT procedures and train/certify UT personnel' },
  { title: 'Phased Array UT Technician', onetCode: '51-9061.13', description: 'Operate phased array ultrasonic inspection equipment' },
  { title: 'TOFD Ultrasonic Technician', onetCode: '51-9061.14', description: 'Perform Time-of-Flight Diffraction ultrasonic inspections' },
  { title: 'RT Level II Inspector', onetCode: '51-9061.15', description: 'Conduct radiographic testing and film interpretation' },
  { title: 'Digital Radiography Technician', onetCode: '51-9061.16', description: 'Operate computed and digital radiography systems' },
  { title: 'Industrial CT Scanner Operator', onetCode: '51-9061.17', description: 'Perform computed tomography inspections on aerospace parts' },
  { title: 'ET Level II Inspector', onetCode: '51-9061.18', description: 'Conduct eddy current testing for surface and subsurface flaws' },
  { title: 'Bolt Hole Eddy Current Inspector', onetCode: '51-9061.19', description: 'Inspect fastener holes using rotating probe eddy current' },
  { title: 'MT Level II Inspector', onetCode: '51-9061.20', description: 'Perform magnetic particle inspections on ferromagnetic materials' },
  { title: 'PT Level II Inspector', onetCode: '51-9061.21', description: 'Conduct fluorescent and visible dye penetrant inspections' },
  { title: 'VT Level II Inspector', onetCode: '51-9061.22', description: 'Perform visual testing per ASNT requirements' },
  { title: 'Shearography Inspector', onetCode: '51-9061.23', description: 'Detect disbonds in composite structures using laser shearography' },
  { title: 'Thermography Inspector', onetCode: '51-9061.24', description: 'Perform infrared thermographic inspections for defects' },
  { title: 'Acoustic Emission Technician', onetCode: '51-9061.25', description: 'Monitor structures for crack growth using acoustic emission' },
  { title: 'Bond Test Inspector', onetCode: '51-9061.26', description: 'Test adhesive bond integrity using resonance and impedance methods' },
  { title: 'Leak Test Technician', onetCode: '51-9061.27', description: 'Perform helium leak testing and pressure decay testing' },
  { title: 'Guided Wave UT Technician', onetCode: '51-9061.28', description: 'Inspect piping and structures using guided wave ultrasonics' },
  { title: 'Immersion UT Technician', onetCode: '51-9061.29', description: 'Conduct immersion ultrasonic C-scan inspections' },
  { title: 'Portable Hardness Tester', onetCode: '51-9061.30', description: 'Perform portable hardness testing per ASTM E110' },
  { title: 'Replica Metallography Technician', onetCode: '51-9061.31', description: 'Conduct in-situ metallographic examinations' },
  { title: 'Positive Material Identification Tech', onetCode: '51-9061.32', description: 'Verify material composition using XRF and OES' },
  { title: 'NDT Data Analyst', onetCode: '51-9061.33', description: 'Analyze and interpret NDT data for engineering disposition' },
  { title: 'Multi-Method NDT Inspector', onetCode: '51-9061.34', description: 'Certified in multiple NDT methods for complex inspections' },

  // Aircraft Structural Mechanics (20 occupations)
  { title: 'Fuselage Structural Mechanic', onetCode: '51-2011.10', description: 'Assemble and repair aircraft fuselage structures' },
  { title: 'Wing Box Mechanic', onetCode: '51-2011.11', description: 'Build and install aircraft wing box assemblies' },
  { title: 'Wing Leading Edge Mechanic', onetCode: '51-2011.12', description: 'Install slats, de-ice boots, and leading edge structures' },
  { title: 'Wing Trailing Edge Mechanic', onetCode: '51-2011.13', description: 'Install flaps, ailerons, and trailing edge components' },
  { title: 'Empennage Mechanic', onetCode: '51-2011.14', description: 'Assemble horizontal and vertical stabilizers' },
  { title: 'Flight Control Surface Mechanic', onetCode: '51-2011.15', description: 'Install elevators, rudders, ailerons, and spoilers' },
  { title: 'Landing Gear Mechanic', onetCode: '51-2011.16', description: 'Install and maintain aircraft landing gear systems' },
  { title: 'Nose Section Mechanic', onetCode: '51-2011.17', description: 'Assemble radome, nose cone, and forward fuselage' },
  { title: 'Tail Section Mechanic', onetCode: '51-2011.18', description: 'Build aft fuselage and tail cone assemblies' },
  { title: 'Door and Hatch Mechanic', onetCode: '51-2011.19', description: 'Install passenger doors, cargo doors, and access panels' },
  { title: 'Nacelle Mechanic', onetCode: '51-2011.20', description: 'Install engine nacelles and thrust reversers' },
  { title: 'Pylon Mechanic', onetCode: '51-2011.21', description: 'Install engine pylons and struts' },
  { title: 'Fairing Mechanic', onetCode: '51-2011.22', description: 'Install aerodynamic fairings and fillets' },
  { title: 'Floor Panel Installer', onetCode: '51-2011.23', description: 'Install aircraft floor panels and cargo liner' },
  { title: 'Pressure Bulkhead Mechanic', onetCode: '51-2011.24', description: 'Install forward and aft pressure bulkheads' },
  { title: 'Winglet Installer', onetCode: '51-2011.25', description: 'Install winglets and wing tip devices' },
  { title: 'Structural Repair Mechanic', onetCode: '51-2011.26', description: 'Perform structural repairs per SRM procedures' },
  { title: 'Bonded Structure Mechanic', onetCode: '51-2011.27', description: 'Assemble adhesively bonded structural assemblies' },
  { title: 'Major Assembly Mechanic', onetCode: '51-2011.28', description: 'Join major aircraft sections during final assembly' },
  { title: 'Shimming Specialist', onetCode: '51-2011.29', description: 'Perform precision shimming for structural fit-up' },

  // Aircraft Systems Mechanics (22 occupations)
  { title: 'Hydraulic Systems Mechanic', onetCode: '49-3011.10', description: 'Install and maintain aircraft hydraulic systems' },
  { title: 'Pneumatic Systems Mechanic', onetCode: '49-3011.11', description: 'Service bleed air and pneumatic systems' },
  { title: 'Fuel Systems Mechanic', onetCode: '49-3011.12', description: 'Install fuel tanks, lines, and fuel system components' },
  { title: 'Environmental Control Mechanic', onetCode: '49-3011.13', description: 'Service air conditioning and pressurization systems' },
  { title: 'Oxygen Systems Mechanic', onetCode: '49-3011.14', description: 'Install and service aircraft oxygen systems' },
  { title: 'Fire Protection Mechanic', onetCode: '49-3011.15', description: 'Install fire detection and suppression systems' },
  { title: 'De-Ice Systems Mechanic', onetCode: '49-3011.16', description: 'Install pneumatic boots and electro-thermal de-ice' },
  { title: 'Anti-Ice Systems Mechanic', onetCode: '49-3011.17', description: 'Service bleed air anti-ice systems' },
  { title: 'APU Mechanic', onetCode: '49-3011.18', description: 'Install and maintain Auxiliary Power Units' },
  { title: 'Flight Controls Rigging Mechanic', onetCode: '49-3011.19', description: 'Rig primary and secondary flight control systems' },
  { title: 'Thrust Reverser Mechanic', onetCode: '49-3011.20', description: 'Install and maintain thrust reverser systems' },
  { title: 'Brake Systems Mechanic', onetCode: '49-3011.21', description: 'Service aircraft brakes and anti-skid systems' },
  { title: 'Steering Systems Mechanic', onetCode: '49-3011.22', description: 'Maintain nose wheel steering systems' },
  { title: 'Water and Waste Systems Mechanic', onetCode: '49-3011.23', description: 'Install potable water and lavatory systems' },
  { title: 'Cargo Systems Mechanic', onetCode: '49-3011.24', description: 'Install cargo handling and restraint systems' },
  { title: 'Door Actuation Mechanic', onetCode: '49-3011.25', description: 'Service door operating mechanisms' },
  { title: 'Ram Air Turbine Mechanic', onetCode: '49-3011.26', description: 'Service RAT emergency power systems' },
  { title: 'Probe and Sensor Installer', onetCode: '49-3011.27', description: 'Install pitot tubes, static ports, and AOA vanes' },
  { title: 'Bleed Air Ducting Mechanic', onetCode: '49-3011.28', description: 'Install engine bleed air ducting systems' },
  { title: 'Hydraulic Component Overhaul Tech', onetCode: '49-3011.29', description: 'Overhaul hydraulic pumps, actuators, and valves' },
  { title: 'Flight Control Actuator Tech', onetCode: '49-3011.30', description: 'Overhaul flight control servo actuators' },
  { title: 'Landing Gear Overhaul Technician', onetCode: '49-3011.31', description: 'Perform landing gear overhaul and NDT' },

  // Avionics and Electronics Specialists (25 occupations)
  { title: 'Navigation Systems Technician', onetCode: '49-2091.10', description: 'Install and test IRS, GPS, and VOR/ILS systems' },
  { title: 'Communication Systems Technician', onetCode: '49-2091.11', description: 'Install VHF, HF, and SATCOM systems' },
  { title: 'Weather Radar Technician', onetCode: '49-2091.12', description: 'Install and calibrate weather radar systems' },
  { title: 'Flight Management System Tech', onetCode: '49-2091.13', description: 'Install and program FMS and CDU systems' },
  { title: 'Autopilot Systems Technician', onetCode: '49-2091.14', description: 'Install and rig autopilot and autothrottle systems' },
  { title: 'Display Systems Technician', onetCode: '49-2091.15', description: 'Install PFD, MFD, and EICAS display systems' },
  { title: 'TCAS/ACAS Technician', onetCode: '49-2091.16', description: 'Install and test traffic collision avoidance systems' },
  { title: 'Transponder Systems Technician', onetCode: '49-2091.17', description: 'Install Mode S and ADS-B transponder systems' },
  { title: 'Radio Altimeter Technician', onetCode: '49-2091.18', description: 'Install and calibrate radio altimeter systems' },
  { title: 'Flight Data Recorder Technician', onetCode: '49-2091.19', description: 'Install FDR and CVR systems' },
  { title: 'EGPWS Technician', onetCode: '49-2091.20', description: 'Install Enhanced Ground Proximity Warning Systems' },
  { title: 'Data Link Systems Technician', onetCode: '49-2091.21', description: 'Install ACARS, CPDLC, and ADS-C systems' },
  { title: 'HUD Systems Technician', onetCode: '49-2091.22', description: 'Install Head-Up Display systems and components' },
  { title: 'EVS/SVS Technician', onetCode: '49-2091.23', description: 'Install Enhanced and Synthetic Vision Systems' },
  { title: 'FLIR Systems Technician', onetCode: '49-2091.24', description: 'Install Forward Looking Infrared systems' },
  { title: 'ELT Systems Technician', onetCode: '49-2091.25', description: 'Install Emergency Locator Transmitter systems' },
  { title: 'IFE Systems Technician', onetCode: '49-2091.26', description: 'Install In-Flight Entertainment systems' },
  { title: 'Cabin Management Systems Tech', onetCode: '49-2091.27', description: 'Install cabin lighting and environmental controls' },
  { title: 'ARINC 429 Systems Specialist', onetCode: '49-2091.28', description: 'Troubleshoot ARINC 429 data bus systems' },
  { title: 'MIL-STD-1553 Specialist', onetCode: '49-2091.29', description: 'Install and test 1553 multiplex data bus systems' },
  { title: 'AFDX Network Technician', onetCode: '49-2091.30', description: 'Install ARINC 664 Avionics Full Duplex networks' },
  { title: 'Fiber Optic Avionics Technician', onetCode: '49-2091.31', description: 'Install fiber optic avionics interconnects' },
  { title: 'EW Systems Technician', onetCode: '49-2091.32', description: 'Install electronic warfare and countermeasure systems' },
  { title: 'Mission Systems Technician', onetCode: '49-2091.33', description: 'Install mission computers and tactical systems' },
  { title: 'Avionics Ground Support Tech', onetCode: '49-2091.34', description: 'Operate avionics test equipment and ATE' },

  // Engine and Propulsion Specialists (20 occupations)
  { title: 'Turbofan Engine Mechanic', onetCode: '49-3011.40', description: 'Service high-bypass turbofan engines' },
  { title: 'Turboprop Engine Mechanic', onetCode: '49-3011.41', description: 'Maintain turboprop engines and propeller systems' },
  { title: 'Turboshaft Engine Mechanic', onetCode: '49-3011.42', description: 'Service helicopter turboshaft engines' },
  { title: 'Engine Accessories Mechanic', onetCode: '49-3011.43', description: 'Service fuel pumps, oil pumps, and generators' },
  { title: 'Engine Controls Technician', onetCode: '49-3011.44', description: 'Rig engine controls and throttle systems' },
  { title: 'FADEC Technician', onetCode: '49-3011.45', description: 'Service Full Authority Digital Engine Controls' },
  { title: 'Engine Test Cell Operator', onetCode: '49-3011.46', description: 'Operate engine test cells for ground runs' },
  { title: 'Engine Overhaul Technician', onetCode: '49-3011.47', description: 'Perform engine disassembly and reassembly' },
  { title: 'Hot Section Inspector', onetCode: '49-3011.48', description: 'Inspect combustion and turbine sections' },
  { title: 'Cold Section Inspector', onetCode: '49-3011.49', description: 'Inspect fan and compressor sections' },
  { title: 'Combustion Section Technician', onetCode: '49-3011.50', description: 'Service combustion chambers and fuel nozzles' },
  { title: 'Turbine Section Technician', onetCode: '49-3011.51', description: 'Service turbine blades, vanes, and disks' },
  { title: 'Fan Module Technician', onetCode: '49-3011.52', description: 'Service fan blades and cases' },
  { title: 'Compressor Module Technician', onetCode: '49-3011.53', description: 'Service compressor blades and stators' },
  { title: 'Engine Blade Repair Technician', onetCode: '49-3011.54', description: 'Perform blend repairs on fan and compressor blades' },
  { title: 'Engine Balancing Technician', onetCode: '49-3011.55', description: 'Balance rotating engine components' },
  { title: 'Rocket Engine Technician', onetCode: '49-3011.56', description: 'Assemble and test liquid and solid rocket engines' },
  { title: 'Propeller Mechanic', onetCode: '49-3011.57', description: 'Service constant speed and reversing propellers' },
  { title: 'Gearbox Overhaul Technician', onetCode: '49-3011.58', description: 'Overhaul accessory gearboxes' },
  { title: 'Engine Performance Engineer', onetCode: '17-2011.50', description: 'Analyze engine performance and troubleshoot' },

  // Composites Specialists (15 occupations)
  { title: 'Prepreg Layup Technician', onetCode: '51-2011.40', description: 'Perform hand layup of prepreg composite materials' },
  { title: 'Automated Fiber Placement Operator', onetCode: '51-2011.41', description: 'Operate AFP machines for composite layup' },
  { title: 'Automated Tape Laying Operator', onetCode: '51-2011.42', description: 'Operate ATL machines for composite part fabrication' },
  { title: 'Wet Layup Technician', onetCode: '51-2011.43', description: 'Perform wet layup with liquid resin systems' },
  { title: 'Vacuum Bagging Technician', onetCode: '51-2011.44', description: 'Prepare vacuum bag assemblies for composite cure' },
  { title: 'Autoclave Cure Operator', onetCode: '51-2011.45', description: 'Operate autoclaves for composite part curing' },
  { title: 'Oven Cure Technician', onetCode: '51-2011.46', description: 'Cure composites in industrial ovens' },
  { title: 'Composite Bonding Technician', onetCode: '51-2011.47', description: 'Perform secondary bonding of composite structures' },
  { title: 'Honeycomb Core Technician', onetCode: '51-2011.48', description: 'Fabricate and install honeycomb sandwich panels' },
  { title: 'Composite Repair Technician', onetCode: '51-2011.49', description: 'Perform composite structural repairs per SRM' },
  { title: 'Composite Trim and Drill Operator', onetCode: '51-2011.50', description: 'Machine composite parts to final dimensions' },
  { title: 'Composite Paint Prep Technician', onetCode: '51-2011.51', description: 'Prepare composite surfaces for painting' },
  { title: 'NDI Composite Inspector', onetCode: '51-2011.52', description: 'Inspect composite structures for defects' },
  { title: 'Resin Transfer Molding Operator', onetCode: '51-2011.53', description: 'Operate RTM and VARTM processes' },
  { title: 'Composite Tool Fabricator', onetCode: '51-2011.54', description: 'Build composite layup tools and molds' },

  // Aircraft Electrical Installation (12 occupations)
  { title: 'Aircraft Electrician', onetCode: '49-2091.40', description: 'Install and troubleshoot aircraft electrical systems' },
  { title: 'Wire Harness Fabricator', onetCode: '51-2022.10', description: 'Build aircraft wire harnesses per IPC/WHMA-A-620' },
  { title: 'Aircraft Wire Installer', onetCode: '51-2022.11', description: 'Route and install aircraft wiring' },
  { title: 'Connector Assembly Technician', onetCode: '51-2022.12', description: 'Assemble and pin aircraft electrical connectors' },
  { title: 'Coaxial Cable Technician', onetCode: '51-2022.13', description: 'Install and terminate RF coaxial cables' },
  { title: 'Aircraft Fiber Optic Installer', onetCode: '51-2022.14', description: 'Install and terminate fiber optic cables' },
  { title: 'Circuit Breaker Panel Tech', onetCode: '51-2022.15', description: 'Install and wire circuit breaker panels' },
  { title: 'Generator Control Unit Tech', onetCode: '51-2022.16', description: 'Install and test GCU systems' },
  { title: 'Power Distribution Tech', onetCode: '51-2022.17', description: 'Install primary and secondary power distribution' },
  { title: 'Ground Power Equipment Tech', onetCode: '51-2022.18', description: 'Service GPU and external power systems' },
  { title: 'Aircraft Battery Technician', onetCode: '51-2022.19', description: 'Service lead-acid and NiCd aircraft batteries' },
  { title: 'Lightning Protection Installer', onetCode: '51-2022.20', description: 'Install static wicks and lightning protection' },

  // Tooling and Manufacturing Engineering (10 occupations)
  { title: 'Jig and Fixture Builder', onetCode: '51-4111.10', description: 'Build assembly jigs and holding fixtures' },
  { title: 'Drill Jig Maker', onetCode: '51-4111.11', description: 'Fabricate drill templates and drill jigs' },
  { title: 'Assembly Tool Maker', onetCode: '51-4111.12', description: 'Build specialized assembly tools' },
  { title: 'Gage Maker', onetCode: '51-4111.13', description: 'Build inspection gages and checking fixtures' },
  { title: 'Master Model Maker', onetCode: '51-4111.14', description: 'Build master models for tooling fabrication' },
  { title: 'Template Maker', onetCode: '51-4111.15', description: 'Fabricate routing and trimming templates' },
  { title: 'NC Fixture Programmer', onetCode: '17-3013.10', description: 'Program CNC fixtures and tooling' },
  { title: 'Tooling Inspector', onetCode: '51-9061.40', description: 'Inspect and certify tooling accuracy' },
  { title: 'Tool Crib Attendant', onetCode: '43-5111.10', description: 'Issue and track tooling and consumables' },
  { title: 'Tooling Maintenance Tech', onetCode: '49-9071.10', description: 'Maintain and repair production tooling' },

  // Surface Treatment and Finishing (12 occupations)
  { title: 'Aircraft Painter', onetCode: '51-9124.10', description: 'Apply aircraft paint systems per specifications' },
  { title: 'Paint Prep Technician', onetCode: '51-9124.11', description: 'Prepare aircraft surfaces for painting' },
  { title: 'Primer Application Technician', onetCode: '51-9124.12', description: 'Apply corrosion-inhibiting primer systems' },
  { title: 'Topcoat Application Technician', onetCode: '51-9124.13', description: 'Apply polyurethane and other topcoats' },
  { title: 'Chemical Processing Operator', onetCode: '51-9121.10', description: 'Operate chemical processing lines' },
  { title: 'Anodizing Technician', onetCode: '51-9121.11', description: 'Perform chromic and sulfuric anodizing' },
  { title: 'Chromate Conversion Technician', onetCode: '51-9121.12', description: 'Apply Alodine and chromate conversion coatings' },
  { title: 'Cadmium Plating Technician', onetCode: '51-9121.13', description: 'Perform cadmium plating operations' },
  { title: 'Shot Peening Operator', onetCode: '51-9121.14', description: 'Perform shot peening for fatigue enhancement' },
  { title: 'Dry Film Lubricant Technician', onetCode: '51-9121.15', description: 'Apply solid film lubricant coatings' },
  { title: 'Thermal Spray Operator', onetCode: '51-9121.16', description: 'Apply thermal spray coatings' },
  { title: 'Passivation Technician', onetCode: '51-9121.17', description: 'Perform passivation of stainless steel' },

  // Space Systems Specialists (10 occupations)
  { title: 'Spacecraft Integration Technician', onetCode: '51-2011.60', description: 'Integrate spacecraft subsystems and payloads' },
  { title: 'Satellite Assembly Technician', onetCode: '51-2011.61', description: 'Assemble communications and observation satellites' },
  { title: 'Solar Array Technician', onetCode: '51-2011.62', description: 'Assemble and test solar array systems' },
  { title: 'Thermal Control Technician', onetCode: '51-2011.63', description: 'Install MLI blankets and thermal control systems' },
  { title: 'Spacecraft Propulsion Technician', onetCode: '51-2011.64', description: 'Install reaction control and main propulsion' },
  { title: 'Antenna Systems Technician', onetCode: '51-2011.65', description: 'Install spacecraft antenna systems' },
  { title: 'Spacecraft Test Conductor', onetCode: '17-3029.10', description: 'Conduct spacecraft functional and environmental testing' },
  { title: 'Clean Room Assembly Lead', onetCode: '51-1011.10', description: 'Lead spacecraft assembly in Class 100K cleanrooms' },
  { title: 'Launch Vehicle Integration Tech', onetCode: '51-2011.66', description: 'Integrate payloads with launch vehicles' },
  { title: 'Payload Fairing Technician', onetCode: '51-2011.67', description: 'Install payload fairings and acoustic blankets' },

  // Weapons and Defense Systems (10 occupations)
  { title: 'Weapons Systems Mechanic', onetCode: '51-2011.70', description: 'Install and maintain aircraft weapons systems' },
  { title: 'Ejection Seat Mechanic', onetCode: '51-2011.71', description: 'Install and service ejection seat systems' },
  { title: 'Gun Systems Technician', onetCode: '51-2011.72', description: 'Service aircraft gun systems and ammunition feeds' },
  { title: 'Pylon and Rack Installer', onetCode: '51-2011.73', description: 'Install weapons pylons and bomb racks' },
  { title: 'Missile Loading Technician', onetCode: '51-2011.74', description: 'Load and arm aircraft missile systems' },
  { title: 'Targeting Systems Technician', onetCode: '49-2091.50', description: 'Install targeting pods and laser designators' },
  { title: 'Countermeasures Installer', onetCode: '49-2091.51', description: 'Install chaff, flare, and ECM systems' },
  { title: 'Nuclear Weapons Technician', onetCode: '51-2011.75', description: 'Handle nuclear weapons and certified systems' },
  { title: 'Explosive Ordnance Technician', onetCode: '51-2011.76', description: 'Handle and install explosive devices' },
  { title: 'Armament Test Equipment Tech', onetCode: '17-3029.15', description: 'Operate weapons system test equipment' },

  // Quality and Inspection Roles (10 occupations)
  { title: 'Receiving Inspection Technician', onetCode: '51-9061.50', description: 'Inspect incoming materials and components' },
  { title: 'In-Process Inspector', onetCode: '51-9061.51', description: 'Perform in-process quality inspections' },
  { title: 'Final Assembly Inspector', onetCode: '51-9061.52', description: 'Inspect completed aircraft assemblies' },
  { title: 'Functional Test Inspector', onetCode: '51-9061.53', description: 'Witness and verify functional tests' },
  { title: 'Source Inspector', onetCode: '51-9061.54', description: 'Inspect at supplier facilities' },
  { title: 'AS9100 Lead Auditor', onetCode: '13-1041.10', description: 'Conduct AS9100 quality system audits' },
  { title: 'Nadcap Auditor', onetCode: '13-1041.11', description: 'Perform Nadcap special process audits' },
  { title: 'Designated Engineering Representative', onetCode: '17-2011.70', description: 'FAA-authorized engineering approval authority' },
  { title: 'Airworthiness Inspector', onetCode: '53-6051.10', description: 'Inspect aircraft for airworthiness compliance' },
  { title: 'Production Test Pilot', onetCode: '53-2011.10', description: 'Conduct production flight tests' },

  // ============================================
  // SPACEX OCCUPATIONS (75+ roles)
  // ============================================

  // Falcon 9/Heavy Manufacturing
  { title: 'Falcon Stage Technician', onetCode: '51-2011.20', description: 'Assemble Falcon 9 first and second stage structures' },
  { title: 'Falcon Interstage Technician', onetCode: '51-2011.21', description: 'Build and integrate Falcon interstage assemblies' },
  { title: 'Falcon Fairing Technician', onetCode: '51-2011.22', description: 'Manufacture and assemble payload fairing halves' },
  { title: 'Grid Fin Technician', onetCode: '51-2011.23', description: 'Fabricate and install grid fin assemblies' },
  { title: 'Landing Leg Technician', onetCode: '51-2011.24', description: 'Build and install deployable landing legs' },
  { title: 'Falcon Propulsion Technician', onetCode: '51-2011.25', description: 'Install Merlin engines and propulsion systems' },
  { title: 'LOX Tank Welder', onetCode: '51-4121.20', description: 'TIG weld liquid oxygen tank assemblies' },
  { title: 'RP-1 Tank Welder', onetCode: '51-4121.21', description: 'Weld RP-1 kerosene fuel tank assemblies' },
  { title: 'Helium Pressurant Technician', onetCode: '51-2011.26', description: 'Install COPV helium pressurant systems' },
  { title: 'Stage Separation Technician', onetCode: '51-2011.27', description: 'Install pneumatic pushers and separation systems' },

  // Starship/Super Heavy Manufacturing
  { title: 'Starship Barrel Welder', onetCode: '51-4121.22', description: 'Weld stainless steel Starship barrel sections' },
  { title: 'Starship Dome Technician', onetCode: '51-2011.28', description: 'Form and weld Starship propellant tank domes' },
  { title: 'Super Heavy Booster Technician', onetCode: '51-2011.29', description: 'Assemble Super Heavy booster structures' },
  { title: 'Heat Shield Tile Technician', onetCode: '51-2011.30', description: 'Install thermal protection tiles on Starship' },
  { title: 'Starship Flap Technician', onetCode: '51-2011.31', description: 'Build and install Starship control flaps' },
  { title: 'Header Tank Technician', onetCode: '51-2011.32', description: 'Fabricate and install landing header tanks' },
  { title: 'Hot Gas Thruster Technician', onetCode: '51-2011.33', description: 'Install hot gas RCS thrusters' },
  { title: 'Starship Avionics Technician', onetCode: '49-2091.20', description: 'Install Starship flight computers and sensors' },
  { title: 'Starship TPS Inspector', onetCode: '51-9061.60', description: 'Inspect thermal protection system installation' },
  { title: 'Raptor Integration Technician', onetCode: '51-2011.34', description: 'Install and connect Raptor engines to Starship' },

  // Raptor Engine Manufacturing
  { title: 'Raptor Engine Assembler', onetCode: '51-2011.35', description: 'Assemble full-flow staged combustion Raptor engines' },
  { title: 'Raptor Turbopump Technician', onetCode: '51-2011.36', description: 'Build oxygen and methane turbopump assemblies' },
  { title: 'Raptor Combustion Chamber Tech', onetCode: '51-2011.37', description: 'Manufacture regeneratively cooled combustion chambers' },
  { title: 'Raptor Injector Technician', onetCode: '51-2011.38', description: 'Fabricate coaxial swirl injector assemblies' },
  { title: 'Raptor Preburner Technician', onetCode: '51-2011.39', description: 'Build oxygen-rich and fuel-rich preburners' },
  { title: 'Raptor Nozzle Technician', onetCode: '51-2011.40', description: 'Manufacture and install Raptor nozzle assemblies' },
  { title: 'Raptor TVC Technician', onetCode: '51-2011.41', description: 'Install thrust vector control actuators' },
  { title: 'Raptor Test Engineer', onetCode: '17-2011.80', description: 'Conduct Raptor engine hot fire tests' },
  { title: 'Engine Hot Fire Operator', onetCode: '51-8099.20', description: 'Operate engine test stand systems' },
  { title: 'Raptor Turbine Blade Inspector', onetCode: '51-9061.61', description: 'Inspect turbine blades and disks' },

  // Dragon Capsule
  { title: 'Dragon Pressure Vessel Tech', onetCode: '51-2011.42', description: 'Build Dragon crew and cargo pressure vessels' },
  { title: 'Dragon Trunk Technician', onetCode: '51-2011.43', description: 'Assemble Dragon trunk and solar arrays' },
  { title: 'Dragon ECLSS Technician', onetCode: '51-2011.44', description: 'Install environmental control and life support' },
  { title: 'SuperDraco Technician', onetCode: '51-2011.45', description: 'Install SuperDraco launch abort engines' },
  { title: 'Dragon Hatch Technician', onetCode: '51-2011.46', description: 'Install and seal Dragon docking hatches' },
  { title: 'Dragon Thermal Control Tech', onetCode: '51-2011.47', description: 'Install thermal control system components' },
  { title: 'Draco Thruster Technician', onetCode: '51-2011.48', description: 'Install Draco RCS thrusters' },
  { title: 'Dragon Parachute Technician', onetCode: '51-2011.49', description: 'Pack and install parachute recovery systems' },
  { title: 'Dragon Avionics Integrator', onetCode: '49-2091.21', description: 'Integrate Dragon flight computers and displays' },
  { title: 'Dragon Final Integration Tech', onetCode: '51-2011.50', description: 'Perform Dragon final assembly and closeout' },

  // Starlink Satellite Manufacturing
  { title: 'Starlink Assembly Technician', onetCode: '51-2011.51', description: 'Build Starlink satellite bus assemblies' },
  { title: 'Starlink Solar Array Tech', onetCode: '51-2011.52', description: 'Install Starlink solar array assemblies' },
  { title: 'Starlink Antenna Technician', onetCode: '51-2011.53', description: 'Install phased array antenna systems' },
  { title: 'Starlink Propulsion Tech', onetCode: '51-2011.54', description: 'Install krypton Hall-effect thrusters' },
  { title: 'Starlink Laser Link Tech', onetCode: '51-2011.55', description: 'Install inter-satellite laser links' },
  { title: 'Starlink Test Technician', onetCode: '51-9061.62', description: 'Conduct Starlink functional testing' },
  { title: 'Starlink Dispenser Technician', onetCode: '51-2011.56', description: 'Load satellites into deployment dispenser' },
  { title: 'Starlink RF Test Engineer', onetCode: '17-2061.20', description: 'Test satellite RF performance' },

  // Launch Operations
  { title: 'Launch Pad Technician', onetCode: '51-8099.21', description: 'Maintain and operate launch pad systems' },
  { title: 'Propellant Systems Operator', onetCode: '51-8099.22', description: 'Operate LOX, methane, and RP-1 systems' },
  { title: 'Launch Controller', onetCode: '51-8099.23', description: 'Monitor launch countdown and vehicle status' },
  { title: 'Range Safety Operator', onetCode: '51-8099.24', description: 'Monitor flight safety and termination systems' },
  { title: 'Pad Umbilical Technician', onetCode: '51-2011.57', description: 'Maintain ground umbilical connections' },
  { title: 'TEL Operator', onetCode: '51-8099.25', description: 'Operate Transporter Erector Launcher' },
  { title: 'Strongback Technician', onetCode: '51-2011.58', description: 'Maintain launch tower strongback systems' },
  { title: 'Launch Weather Specialist', onetCode: '19-2021.10', description: 'Analyze launch weather conditions' },
  { title: 'Countdown Sequencer', onetCode: '51-8099.26', description: 'Execute automated countdown sequences' },
  { title: 'Pad Safety Coordinator', onetCode: '29-9011.10', description: 'Coordinate launch pad safety operations' },

  // Recovery Operations
  { title: 'Drone Ship Technician', onetCode: '51-8099.27', description: 'Maintain ASDS autonomous drone ship systems' },
  { title: 'Fairing Recovery Specialist', onetCode: '51-8099.28', description: 'Recover payload fairing halves from ocean' },
  { title: 'Booster Recovery Technician', onetCode: '51-8099.29', description: 'Process recovered first stage boosters' },
  { title: 'Dragon Recovery Specialist', onetCode: '51-8099.30', description: 'Recover Dragon capsules from ocean' },
  { title: 'Marine Operations Coordinator', onetCode: '53-5021.10', description: 'Coordinate recovery vessel operations' },
  { title: 'Booster Refurbishment Tech', onetCode: '51-2011.59', description: 'Refurbish recovered Falcon boosters' },

  // Mission Operations
  { title: 'Mission Control Operator', onetCode: '51-8099.31', description: 'Monitor spacecraft systems during flight' },
  { title: 'Flight Director', onetCode: '11-3051.10', description: 'Lead mission control operations' },
  { title: 'GNC Engineer', onetCode: '17-2011.81', description: 'Monitor guidance, navigation, and control' },
  { title: 'Propulsion Console Operator', onetCode: '51-8099.32', description: 'Monitor propulsion system telemetry' },
  { title: 'Communications Console Op', onetCode: '51-8099.33', description: 'Manage ground station communications' },
  { title: 'Dragon Mission Specialist', onetCode: '51-8099.34', description: 'Support Dragon missions to ISS' },
  { title: 'Orbital Analyst', onetCode: '17-2011.82', description: 'Calculate orbital maneuvers and trajectories' },
  { title: 'Starlink Network Engineer', onetCode: '17-2061.21', description: 'Monitor Starlink constellation operations' },

  // ============================================
  // TESLA MANUFACTURING/ENGINEERING (75+ roles)
  // ============================================

  // Battery Cell Manufacturing (4680)
  { title: 'Electrode Coating Technician', onetCode: '51-9199.20', description: 'Operate electrode coating and calendering lines' },
  { title: 'Cell Assembly Technician', onetCode: '51-2099.20', description: 'Assemble cylindrical battery cells' },
  { title: 'Dry Electrode Technician', onetCode: '51-9199.21', description: 'Operate dry electrode coating process' },
  { title: 'Cell Tabbing Technician', onetCode: '51-2099.21', description: 'Weld cell tabs and interconnects' },
  { title: 'Electrolyte Fill Technician', onetCode: '51-9199.22', description: 'Fill cells with electrolyte solution' },
  { title: 'Cell Formation Technician', onetCode: '51-9199.23', description: 'Operate cell formation cycling equipment' },
  { title: 'Cell Grading Technician', onetCode: '51-9061.70', description: 'Grade and sort cells by capacity' },
  { title: 'Cell Aging Technician', onetCode: '51-9199.24', description: 'Monitor cell aging and quality' },
  { title: 'Separator Coating Operator', onetCode: '51-9199.25', description: 'Operate separator coating processes' },
  { title: 'Mixing Room Operator', onetCode: '51-9199.26', description: 'Mix cathode and anode slurries' },
  { title: 'Dry Room Technician', onetCode: '51-9199.27', description: 'Work in ultra-low humidity dry rooms' },
  { title: 'Battery Cell Inspector', onetCode: '51-9061.71', description: 'Inspect cells for defects and quality' },

  // Battery Pack Assembly
  { title: 'Battery Module Assembler', onetCode: '51-2099.22', description: 'Assemble battery modules from cells' },
  { title: 'Pack Assembly Technician', onetCode: '51-2099.23', description: 'Build complete battery pack assemblies' },
  { title: 'BMS Wire Harness Tech', onetCode: '51-2022.20', description: 'Install battery management system wiring' },
  { title: 'Busbar Welding Technician', onetCode: '51-4121.30', description: 'Laser weld battery busbars' },
  { title: 'Thermal Interface Technician', onetCode: '51-2099.24', description: 'Apply thermal interface materials' },
  { title: 'Pack Leak Test Technician', onetCode: '51-9061.72', description: 'Conduct battery pack leak testing' },
  { title: 'Pack EOL Tester', onetCode: '51-9061.73', description: 'Perform end-of-line pack testing' },
  { title: 'HV Connector Technician', onetCode: '51-2022.21', description: 'Install high voltage connectors' },
  { title: 'Pack Enclosure Technician', onetCode: '51-2099.25', description: 'Seal battery pack enclosures' },
  { title: 'Coolant System Technician', onetCode: '51-2099.26', description: 'Install pack cooling systems' },

  // Electric Motor Manufacturing
  { title: 'Motor Stator Winder', onetCode: '51-2023.10', description: 'Wind permanent magnet motor stators' },
  { title: 'Motor Rotor Assembler', onetCode: '51-2023.11', description: 'Assemble motor rotors and shafts' },
  { title: 'Motor Magnet Inserter', onetCode: '51-2023.12', description: 'Insert and bond permanent magnets' },
  { title: 'Hairpin Stator Technician', onetCode: '51-2023.13', description: 'Assemble hairpin wound stators' },
  { title: 'Motor Housing Technician', onetCode: '51-2023.14', description: 'Assemble motor housings and end bells' },
  { title: 'Motor Balancing Technician', onetCode: '51-2023.15', description: 'Balance motor rotors dynamically' },
  { title: 'Motor EOL Test Technician', onetCode: '51-9061.74', description: 'Perform motor end-of-line testing' },
  { title: 'Motor Potting Technician', onetCode: '51-2023.16', description: 'Encapsulate motor windings' },

  // Power Electronics
  { title: 'Inverter Assembly Technician', onetCode: '51-2022.22', description: 'Assemble drive inverter units' },
  { title: 'Power Module Technician', onetCode: '51-2022.23', description: 'Build SiC power module assemblies' },
  { title: 'DC-DC Converter Technician', onetCode: '51-2022.24', description: 'Assemble DC-DC converter units' },
  { title: 'Onboard Charger Technician', onetCode: '51-2022.25', description: 'Build onboard charger assemblies' },
  { title: 'PE Thermal Technician', onetCode: '51-2022.26', description: 'Install power electronics cooling' },
  { title: 'PE PCB Assembler', onetCode: '51-2022.27', description: 'Assemble power electronics PCBs' },
  { title: 'PE Test Technician', onetCode: '51-9061.75', description: 'Test power electronics assemblies' },
  { title: 'Capacitor Bank Technician', onetCode: '51-2022.28', description: 'Assemble capacitor banks' },

  // Giga Press / Die Casting
  { title: 'Giga Press Operator', onetCode: '51-4072.20', description: 'Operate 6000+ ton Giga Press machines' },
  { title: 'Die Cast Setup Technician', onetCode: '51-4072.21', description: 'Set up and change Giga Press dies' },
  { title: 'Die Maintenance Technician', onetCode: '51-4072.22', description: 'Maintain and repair casting dies' },
  { title: 'Casting Trim Operator', onetCode: '51-4072.23', description: 'Trim and deburr mega castings' },
  { title: 'Casting X-Ray Inspector', onetCode: '51-9061.76', description: 'X-ray inspect structural castings' },
  { title: 'Casting Heat Treat Tech', onetCode: '51-4191.20', description: 'Heat treat aluminum castings' },
  { title: 'Casting CNC Machinist', onetCode: '51-4041.20', description: 'Machine mega casting mounting surfaces' },
  { title: 'Alloy Preparation Tech', onetCode: '51-4072.24', description: 'Prepare aluminum alloys for casting' },
  { title: 'Casting Quality Engineer', onetCode: '17-2112.10', description: 'Optimize casting quality processes' },
  { title: 'Die Design Engineer', onetCode: '17-2141.10', description: 'Design Giga Press die tooling' },

  // Body Assembly
  { title: 'Body Framing Technician', onetCode: '51-2011.70', description: 'Load and operate body framing stations' },
  { title: 'Spot Weld Technician', onetCode: '51-4121.40', description: 'Operate robotic spot welding cells' },
  { title: 'Laser Welding Technician', onetCode: '51-4121.41', description: 'Operate laser welding systems' },
  { title: 'Adhesive Bonding Technician', onetCode: '51-2011.71', description: 'Apply structural adhesives' },
  { title: 'Body Panel Technician', onetCode: '51-2011.72', description: 'Fit and align body panels' },
  { title: 'Closure Technician', onetCode: '51-2011.73', description: 'Install doors, hoods, and trunks' },
  { title: 'Body Dimensional Inspector', onetCode: '51-9061.77', description: 'Measure body dimensional accuracy' },
  { title: 'Sealer Application Tech', onetCode: '51-2011.74', description: 'Apply body seam sealers' },
  { title: 'Underbody Assembly Tech', onetCode: '51-2011.75', description: 'Assemble underbody components' },

  // Paint Shop
  { title: 'Pretreatment Operator', onetCode: '51-9121.10', description: 'Operate phosphate pretreatment line' },
  { title: 'E-Coat Operator', onetCode: '51-9121.11', description: 'Operate electrocoat deposition tanks' },
  { title: 'Sealer Booth Technician', onetCode: '51-9121.12', description: 'Apply underbody and seam sealers' },
  { title: 'Prime Coat Technician', onetCode: '51-9121.13', description: 'Operate primer paint booth' },
  { title: 'Base Coat Technician', onetCode: '51-9121.14', description: 'Apply base coat paint' },
  { title: 'Clear Coat Technician', onetCode: '51-9121.15', description: 'Apply clear coat finish' },
  { title: 'Paint Repair Technician', onetCode: '51-9121.16', description: 'Sand and repair paint defects' },
  { title: 'Color Match Technician', onetCode: '51-9121.17', description: 'Match and verify paint colors' },
  { title: 'Paint Robot Programmer', onetCode: '17-3024.10', description: 'Program paint robot paths' },
  { title: 'Paint Quality Inspector', onetCode: '51-9061.78', description: 'Inspect paint finish quality' },

  // General Assembly
  { title: 'Trim Assembly Technician', onetCode: '51-2022.30', description: 'Install interior trim components' },
  { title: 'Cockpit Installation Tech', onetCode: '51-2022.31', description: 'Install complete cockpit modules' },
  { title: 'Glass Installation Tech', onetCode: '51-2022.32', description: 'Install windshield and windows' },
  { title: 'Seat Installation Tech', onetCode: '51-2022.33', description: 'Install seats and seat belts' },
  { title: 'Headliner Installation Tech', onetCode: '51-2022.34', description: 'Install headliner assemblies' },
  { title: 'HVAC Installation Tech', onetCode: '51-2022.35', description: 'Install climate control systems' },
  { title: 'Wheel and Tire Tech', onetCode: '51-2022.36', description: 'Install wheels and tires' },
  { title: 'Fluid Fill Technician', onetCode: '51-2022.37', description: 'Fill all vehicle fluids' },
  { title: 'Vehicle Alignment Tech', onetCode: '51-2022.38', description: 'Perform wheel alignment' },
  { title: 'Vehicle Final Inspector', onetCode: '51-9061.79', description: 'Inspect completed vehicles' },

  // Drive Unit Assembly
  { title: 'Drive Unit Assembler', onetCode: '51-2023.20', description: 'Assemble complete drive units' },
  { title: 'Gearbox Assembly Tech', onetCode: '51-2023.21', description: 'Assemble reduction gearboxes' },
  { title: 'Drive Unit Test Technician', onetCode: '51-9061.80', description: 'Test drive unit performance' },
  { title: 'Drive Unit Integration Tech', onetCode: '51-2023.22', description: 'Install drive units in vehicles' },

  // Automation and Robotics
  { title: 'Tesla Robot Technician', onetCode: '49-9041.10', description: 'Maintain KUKA and Fanuc robots' },
  { title: 'Vision System Technician', onetCode: '49-9041.11', description: 'Maintain machine vision systems' },
  { title: 'Conveyor System Tech', onetCode: '49-9041.12', description: 'Maintain conveyor and AGV systems' },
  { title: 'PLC Programmer', onetCode: '17-3024.11', description: 'Program Allen-Bradley and Siemens PLCs' },
  { title: 'Tesla Robot Programmer', onetCode: '17-3024.12', description: 'Program industrial robot paths' },
  { title: 'Controls Technician', onetCode: '49-9041.13', description: 'Troubleshoot automation controls' },
  { title: 'Automation Integration Engineer', onetCode: '17-2112.11', description: 'Integrate new automation systems' },
  { title: 'Manufacturing Data Analyst', onetCode: '15-2041.10', description: 'Analyze manufacturing data and OEE' },

  // Tesla Engineering Roles
  { title: 'Battery Cell Engineer', onetCode: '17-2112.20', description: 'Develop battery cell chemistry and design' },
  { title: 'Pack Design Engineer', onetCode: '17-2112.21', description: 'Design battery pack systems' },
  { title: 'Motor Design Engineer', onetCode: '17-2071.10', description: 'Design electric motor systems' },
  { title: 'Power Electronics Engineer', onetCode: '17-2071.11', description: 'Design inverters and power electronics' },
  { title: 'Casting Process Engineer', onetCode: '17-2112.22', description: 'Optimize die casting processes' },
  { title: 'Body Process Engineer', onetCode: '17-2112.23', description: 'Optimize body assembly processes' },
  { title: 'Paint Process Engineer', onetCode: '17-2112.24', description: 'Optimize paint shop processes' },
  { title: 'Assembly Process Engineer', onetCode: '17-2112.25', description: 'Optimize general assembly processes' },
  { title: 'NPI Launch Engineer', onetCode: '17-2112.26', description: 'Launch new products into production' },
  { title: 'Manufacturing Test Engineer', onetCode: '17-2112.27', description: 'Develop production test systems' },
  { title: 'Quality Systems Engineer', onetCode: '17-2112.28', description: 'Maintain quality management systems' },
  { title: 'Supplier Quality Engineer', onetCode: '17-2112.29', description: 'Manage supplier quality programs' },

  // ============================================
  // SEMICONDUCTOR MANUFACTURING (TSMC/ASML/Intel) - 200+ occupations
  // ============================================

  // Wafer Fabrication
  { title: 'Wafer Fab Process Operator', onetCode: '51-9141.01', description: 'Operate semiconductor wafer fabrication equipment' },
  { title: 'Diffusion Furnace Operator', onetCode: '51-9141.02', description: 'Operate thermal diffusion furnaces' },
  { title: 'Ion Implant Operator', onetCode: '51-9141.03', description: 'Operate ion implantation equipment' },
  { title: 'CVD Process Technician', onetCode: '51-9141.04', description: 'Operate chemical vapor deposition systems' },
  { title: 'PVD Sputter Technician', onetCode: '51-9141.05', description: 'Operate physical vapor deposition sputtering systems' },
  { title: 'ALD Process Technician', onetCode: '51-9141.06', description: 'Operate atomic layer deposition equipment' },
  { title: 'Epitaxy Technician', onetCode: '51-9141.07', description: 'Operate epitaxial growth equipment' },
  { title: 'CMP Operator', onetCode: '51-9141.08', description: 'Operate chemical mechanical planarization tools' },
  { title: 'Wet Etch Technician', onetCode: '51-9141.09', description: 'Operate wet chemical etch stations' },
  { title: 'Dry Etch Technician', onetCode: '51-9141.10', description: 'Operate plasma dry etch equipment' },
  { title: 'RIE Etch Operator', onetCode: '51-9141.11', description: 'Operate reactive ion etch systems' },
  { title: 'Ash Strip Technician', onetCode: '51-9141.12', description: 'Operate photoresist ash and strip tools' },
  { title: 'Clean Room Operator', onetCode: '51-9141.13', description: 'Maintain cleanroom standards and protocols' },
  { title: 'Wafer Clean Technician', onetCode: '51-9141.14', description: 'Operate wafer cleaning equipment' },
  { title: 'Oxide Growth Technician', onetCode: '51-9141.15', description: 'Grow thermal oxide layers' },
  { title: 'Nitride Deposition Tech', onetCode: '51-9141.16', description: 'Deposit silicon nitride films' },
  { title: 'Metal Deposition Tech', onetCode: '51-9141.17', description: 'Deposit metal interconnect layers' },
  { title: 'Barrier Layer Technician', onetCode: '51-9141.18', description: 'Deposit diffusion barrier layers' },
  { title: 'Copper Plating Technician', onetCode: '51-9141.19', description: 'Operate copper electroplating systems' },
  { title: 'Tungsten Fill Technician', onetCode: '51-9141.20', description: 'Deposit tungsten contact fills' },

  // Photolithography
  { title: 'Photo Operator', onetCode: '51-9141.21', description: 'Operate photolithography track and scanner' },
  { title: 'Stepper Operator', onetCode: '51-9141.22', description: 'Operate i-line and DUV steppers' },
  { title: 'Scanner Operator', onetCode: '51-9141.23', description: 'Operate immersion lithography scanners' },
  { title: 'EUV Scanner Operator', onetCode: '51-9141.24', description: 'Operate extreme ultraviolet lithography systems' },
  { title: 'Track Technician', onetCode: '51-9141.25', description: 'Operate resist coat and develop tracks' },
  { title: 'Resist Coat Operator', onetCode: '51-9141.26', description: 'Apply photoresist coatings' },
  { title: 'Develop Process Tech', onetCode: '51-9141.27', description: 'Operate resist develop processes' },
  { title: 'Mask Handler', onetCode: '51-9141.28', description: 'Handle and maintain photomasks' },
  { title: 'Reticle Inspector', onetCode: '51-9141.29', description: 'Inspect photomasks for defects' },
  { title: 'Overlay Metrology Tech', onetCode: '51-9141.30', description: 'Measure lithography overlay accuracy' },
  { title: 'CD Metrology Technician', onetCode: '51-9141.31', description: 'Measure critical dimensions with SEM' },
  { title: 'OPC Engineer', onetCode: '17-2199.20', description: 'Develop optical proximity correction' },
  { title: 'Computational Litho Engineer', onetCode: '17-2199.21', description: 'Develop computational lithography models' },
  { title: 'Mask Data Prep Engineer', onetCode: '17-2199.22', description: 'Prepare mask data for manufacturing' },
  { title: 'Litho Process Engineer', onetCode: '17-2199.23', description: 'Develop and optimize lithography processes' },

  // Metrology and Inspection
  { title: 'Fab Metrology Technician', onetCode: '51-9061.90', description: 'Perform inline metrology measurements' },
  { title: 'SEM Operator', onetCode: '51-9061.91', description: 'Operate scanning electron microscopes' },
  { title: 'TEM Operator', onetCode: '51-9061.92', description: 'Operate transmission electron microscopes' },
  { title: 'AFM Technician', onetCode: '51-9061.93', description: 'Operate atomic force microscopes' },
  { title: 'Ellipsometry Technician', onetCode: '51-9061.94', description: 'Measure thin film thickness with ellipsometer' },
  { title: 'XRF Analyst', onetCode: '51-9061.95', description: 'Perform X-ray fluorescence analysis' },
  { title: 'XRD Analyst', onetCode: '51-9061.96', description: 'Perform X-ray diffraction analysis' },
  { title: 'SIMS Analyst', onetCode: '51-9061.97', description: 'Perform secondary ion mass spectrometry' },
  { title: 'Defect Review Technician', onetCode: '51-9061.98', description: 'Review and classify wafer defects' },
  { title: 'Wafer Inspection Operator', onetCode: '51-9061.99', description: 'Operate automated wafer inspection tools' },
  { title: 'E-Beam Inspection Tech', onetCode: '51-9062.01', description: 'Operate electron beam inspection systems' },
  { title: 'Brightfield Inspector', onetCode: '51-9062.02', description: 'Operate brightfield inspection tools' },
  { title: 'Darkfield Inspector', onetCode: '51-9062.03', description: 'Operate darkfield inspection systems' },

  // Process Engineering
  { title: 'Diffusion Process Engineer', onetCode: '17-2199.24', description: 'Develop thermal diffusion processes' },
  { title: 'Implant Process Engineer', onetCode: '17-2199.25', description: 'Develop ion implantation processes' },
  { title: 'CVD Process Engineer', onetCode: '17-2199.26', description: 'Develop CVD thin film processes' },
  { title: 'PVD Process Engineer', onetCode: '17-2199.27', description: 'Develop sputtering and PVD processes' },
  { title: 'Etch Process Engineer', onetCode: '17-2199.28', description: 'Develop plasma etch processes' },
  { title: 'CMP Process Engineer', onetCode: '17-2199.29', description: 'Develop CMP polish processes' },
  { title: 'Wet Process Engineer', onetCode: '17-2199.30', description: 'Develop wet chemical processes' },
  { title: 'Metallization Engineer', onetCode: '17-2199.31', description: 'Develop metal interconnect processes' },
  { title: 'Integration Engineer', onetCode: '17-2199.32', description: 'Integrate multiple process modules' },
  { title: 'Fab Yield Engineer', onetCode: '17-2199.33', description: 'Improve manufacturing yield' },
  { title: 'Device Physics Engineer', onetCode: '17-2199.34', description: 'Develop transistor device structures' },
  { title: 'TCAD Engineer', onetCode: '17-2199.35', description: 'Perform technology CAD simulations' },

  // Equipment Engineering
  { title: 'Fab Equipment Engineer', onetCode: '17-2199.36', description: 'Maintain and improve fab equipment' },
  { title: 'CVD Equipment Engineer', onetCode: '17-2199.37', description: 'Support CVD tool performance' },
  { title: 'Etch Equipment Engineer', onetCode: '17-2199.38', description: 'Support plasma etch equipment' },
  { title: 'Litho Equipment Engineer', onetCode: '17-2199.39', description: 'Support lithography equipment' },
  { title: 'Implant Equipment Engineer', onetCode: '17-2199.40', description: 'Support ion implant equipment' },
  { title: 'CMP Equipment Engineer', onetCode: '17-2199.41', description: 'Support CMP tool performance' },
  { title: 'Metrology Equipment Engineer', onetCode: '17-2199.42', description: 'Support metrology tools' },
  { title: 'Facilities Engineer', onetCode: '17-2199.43', description: 'Support fab facilities systems' },
  { title: 'Vacuum Systems Engineer', onetCode: '17-2199.44', description: 'Support vacuum and pump systems' },
  { title: 'Gas Delivery Engineer', onetCode: '17-2199.45', description: 'Support specialty gas systems' },
  { title: 'Chemical Delivery Engineer', onetCode: '17-2199.46', description: 'Support chemical delivery systems' },
  { title: 'Ultrapure Water Engineer', onetCode: '17-2199.47', description: 'Support UPW systems' },

  // Backend / Assembly and Test
  { title: 'Wafer Sort Operator', onetCode: '51-9141.40', description: 'Operate wafer probe and sort equipment' },
  { title: 'Wafer Probe Technician', onetCode: '51-9141.41', description: 'Perform wafer-level electrical testing' },
  { title: 'Die Attach Operator', onetCode: '51-9141.42', description: 'Attach die to substrates and leadframes' },
  { title: 'Wire Bond Operator', onetCode: '51-9141.43', description: 'Operate wire bonding equipment' },
  { title: 'Flip Chip Bonder', onetCode: '51-9141.44', description: 'Operate flip chip bonding equipment' },
  { title: 'Molding Operator', onetCode: '51-9141.45', description: 'Operate transfer molding equipment' },
  { title: 'Singulation Operator', onetCode: '51-9141.46', description: 'Operate dicing and singulation equipment' },
  { title: 'Mark and Pack Operator', onetCode: '51-9141.47', description: 'Laser mark and package ICs' },
  { title: 'Final Test Operator', onetCode: '51-9141.48', description: 'Operate final test equipment' },
  { title: 'Burn-In Operator', onetCode: '51-9141.49', description: 'Operate burn-in reliability testing' },
  { title: 'Trim and Form Operator', onetCode: '51-9141.50', description: 'Operate lead trim and form equipment' },
  { title: 'Package Engineer', onetCode: '17-2199.48', description: 'Develop IC packaging solutions' },
  { title: 'Test Engineer Semiconductor', onetCode: '17-2199.49', description: 'Develop semiconductor test programs' },
  { title: 'Product Engineer', onetCode: '17-2199.50', description: 'Support product yield and quality' },
  { title: 'Semiconductor FA Engineer', onetCode: '17-2199.51', description: 'Analyze semiconductor failures' },
  { title: 'Reliability Engineer Semi', onetCode: '17-2199.52', description: 'Ensure product reliability' },

  // ASML-Specific Lithography Equipment
  { title: 'ASML Field Service Engineer', onetCode: '17-3023.10', description: 'Install and service ASML lithography systems' },
  { title: 'EUV System Engineer', onetCode: '17-3023.11', description: 'Support EUV scanner systems' },
  { title: 'Source Engineer', onetCode: '17-3023.12', description: 'Support EUV light source systems' },
  { title: 'Optics Engineer', onetCode: '17-3023.13', description: 'Support lithography optical systems' },
  { title: 'Stage Engineer', onetCode: '17-3023.14', description: 'Support wafer and reticle stages' },
  { title: 'Mechatronics Engineer', onetCode: '17-3023.15', description: 'Support precision mechatronic systems' },
  { title: 'Scanner Software Engineer', onetCode: '15-1252.10', description: 'Develop scanner control software' },
  { title: 'Litho Application Engineer', onetCode: '17-3023.16', description: 'Support customer lithography applications' },

  // ============================================
  // COMPUTER/ELECTRONICS MANUFACTURING (Dell/Apple/Lenovo/HP) - 200+ occupations
  // ============================================

  // PCB Assembly
  { title: 'SMT Line Operator', onetCode: '51-2022.50', description: 'Operate surface mount technology lines' },
  { title: 'Pick and Place Operator', onetCode: '51-2022.51', description: 'Operate component placement machines' },
  { title: 'Reflow Oven Operator', onetCode: '51-2022.52', description: 'Operate reflow soldering ovens' },
  { title: 'Wave Solder Operator', onetCode: '51-2022.53', description: 'Operate wave soldering equipment' },
  { title: 'Selective Solder Operator', onetCode: '51-2022.54', description: 'Operate selective soldering machines' },
  { title: 'Paste Printer Operator', onetCode: '51-2022.55', description: 'Operate solder paste printers' },
  { title: 'AOI Operator', onetCode: '51-2022.56', description: 'Operate automated optical inspection' },
  { title: 'SPI Operator', onetCode: '51-2022.57', description: 'Operate solder paste inspection systems' },
  { title: 'X-Ray Inspection Tech', onetCode: '51-2022.58', description: 'Operate X-ray inspection for BGAs' },
  { title: 'BGA Rework Technician', onetCode: '51-2022.59', description: 'Rework ball grid array components' },
  { title: 'PTH Assembly Tech', onetCode: '51-2022.60', description: 'Assemble through-hole components' },
  { title: 'Conformal Coat Operator', onetCode: '51-2022.61', description: 'Apply conformal coating to PCBs' },
  { title: 'PCB Repair Technician', onetCode: '51-2022.62', description: 'Repair defective circuit boards' },
  { title: 'ICT Operator', onetCode: '51-2022.63', description: 'Operate in-circuit test equipment' },
  { title: 'Flying Probe Test Op', onetCode: '51-2022.64', description: 'Operate flying probe test systems' },
  { title: 'Functional Test Tech', onetCode: '51-2022.65', description: 'Perform board functional testing' },

  // System Assembly
  { title: 'Server Assembly Tech', onetCode: '51-2099.30', description: 'Assemble enterprise server systems' },
  { title: 'Desktop Assembly Tech', onetCode: '51-2099.31', description: 'Assemble desktop computer systems' },
  { title: 'Laptop Assembly Tech', onetCode: '51-2099.32', description: 'Assemble laptop computers' },
  { title: 'Tablet Assembly Tech', onetCode: '51-2099.33', description: 'Assemble tablet devices' },
  { title: 'Workstation Assembly Tech', onetCode: '51-2099.34', description: 'Assemble high-performance workstations' },
  { title: 'Storage System Assembly', onetCode: '51-2099.35', description: 'Assemble storage array systems' },
  { title: 'Network Switch Assembly', onetCode: '51-2099.36', description: 'Assemble network switching equipment' },
  { title: 'Power Supply Assembly', onetCode: '51-2099.37', description: 'Assemble power supply units' },
  { title: 'Chassis Assembly Tech', onetCode: '51-2099.38', description: 'Assemble computer chassis' },
  { title: 'Cable Assembly Tech', onetCode: '51-2099.39', description: 'Build custom cable assemblies' },
  { title: 'Thermal Module Tech', onetCode: '51-2099.40', description: 'Install thermal cooling solutions' },
  { title: 'Memory Install Tech', onetCode: '51-2099.41', description: 'Install and test memory modules' },
  { title: 'Storage Install Tech', onetCode: '51-2099.42', description: 'Install HDDs and SSDs' },
  { title: 'GPU Install Technician', onetCode: '51-2099.43', description: 'Install graphics processing units' },
  { title: 'BIOS Flash Technician', onetCode: '51-2099.44', description: 'Flash and verify BIOS firmware' },
  { title: 'System Burn-In Tech', onetCode: '51-2099.45', description: 'Perform system burn-in testing' },
  { title: 'OS Load Technician', onetCode: '51-2099.46', description: 'Install operating systems' },
  { title: 'System Config Tech', onetCode: '51-2099.47', description: 'Configure system settings' },
  { title: 'Final QC Inspector', onetCode: '51-9061.85', description: 'Perform final quality inspection' },
  { title: 'Pack and Ship Tech', onetCode: '51-9198.01', description: 'Package systems for shipping' },

  // Apple-Specific Manufacturing
  { title: 'iPhone Assembly Tech', onetCode: '51-2099.50', description: 'Assemble iPhone devices' },
  { title: 'Mac Assembly Tech', onetCode: '51-2099.51', description: 'Assemble Mac computers' },
  { title: 'iPad Assembly Tech', onetCode: '51-2099.52', description: 'Assemble iPad tablets' },
  { title: 'Watch Assembly Tech', onetCode: '51-2099.53', description: 'Assemble Apple Watch devices' },
  { title: 'AirPods Assembly Tech', onetCode: '51-2099.54', description: 'Assemble AirPods earbuds' },
  { title: 'Display Assembly Tech', onetCode: '51-2099.55', description: 'Assemble display modules' },
  { title: 'Camera Module Tech', onetCode: '51-2099.56', description: 'Assemble camera modules' },
  { title: 'Battery Install Tech', onetCode: '51-2099.57', description: 'Install device batteries' },
  { title: 'Enclosure Assembly Tech', onetCode: '51-2099.58', description: 'Assemble aluminum enclosures' },
  { title: 'Antenna Assembly Tech', onetCode: '51-2099.59', description: 'Install antenna components' },
  { title: 'Haptic Assembly Tech', onetCode: '51-2099.60', description: 'Install haptic feedback systems' },
  { title: 'Face ID Module Tech', onetCode: '51-2099.61', description: 'Assemble Face ID sensor modules' },
  { title: 'Touch ID Module Tech', onetCode: '51-2099.62', description: 'Assemble Touch ID modules' },
  { title: 'Speaker Assembly Tech', onetCode: '51-2099.63', description: 'Install speaker assemblies' },
  { title: 'Microphone Assembly Tech', onetCode: '51-2099.64', description: 'Install microphone arrays' },

  // Engineering Roles
  { title: 'Hardware Design Engineer', onetCode: '17-2072.10', description: 'Design computer hardware systems' },
  { title: 'PCB Layout Engineer', onetCode: '17-2072.11', description: 'Design printed circuit board layouts' },
  { title: 'Signal Integrity Engineer', onetCode: '17-2072.12', description: 'Analyze high-speed signal integrity' },
  { title: 'Power Integrity Engineer', onetCode: '17-2072.13', description: 'Design power delivery networks' },
  { title: 'Thermal Design Engineer', onetCode: '17-2072.14', description: 'Design thermal management solutions' },
  { title: 'EMC Engineer', onetCode: '17-2072.15', description: 'Ensure electromagnetic compatibility' },
  { title: 'Mechanical Design Engineer', onetCode: '17-2072.16', description: 'Design mechanical enclosures' },
  { title: 'Display Engineer', onetCode: '17-2072.17', description: 'Develop display technology' },
  { title: 'Audio Engineer Hardware', onetCode: '17-2072.18', description: 'Design audio hardware systems' },
  { title: 'Sensor Engineer', onetCode: '17-2072.19', description: 'Develop sensor systems' },
  { title: 'Firmware Engineer', onetCode: '15-1252.11', description: 'Develop embedded firmware' },
  { title: 'BIOS Engineer', onetCode: '15-1252.12', description: 'Develop BIOS and UEFI firmware' },
  { title: 'Driver Developer', onetCode: '15-1252.13', description: 'Develop hardware device drivers' },
  { title: 'Validation Engineer', onetCode: '17-2072.20', description: 'Validate hardware designs' },
  { title: 'DVT Engineer', onetCode: '17-2072.21', description: 'Perform design verification testing' },
  { title: 'Compliance Engineer', onetCode: '17-2072.22', description: 'Ensure regulatory compliance' },
  { title: 'Sustaining Engineer', onetCode: '17-2072.23', description: 'Support production hardware' },
  { title: 'New Product Introduction Eng', onetCode: '17-2072.24', description: 'Launch new products to manufacturing' },

  // ============================================
  // AEROSPACE & DEFENSE (Boeing/Lockheed/Northrop/RTX/NASA) - 200+ occupations
  // ============================================

  // Aircraft Assembly - Large Commercial
  { title: 'Fuselage Join Mechanic', onetCode: '51-2011.80', description: 'Join fuselage barrel sections' },
  { title: 'Wing-Body Join Mechanic', onetCode: '51-2011.81', description: 'Join wing to fuselage structure' },
  { title: 'Final Body Join Mechanic', onetCode: '51-2011.82', description: 'Complete final fuselage join' },
  { title: 'Flight Deck Assembly', onetCode: '51-2011.83', description: 'Assemble cockpit and flight deck' },
  { title: 'Passenger Door Mechanic', onetCode: '51-2011.84', description: 'Install passenger entry doors' },
  { title: 'Cargo Door Mechanic', onetCode: '51-2011.85', description: 'Install cargo door assemblies' },
  { title: 'Emergency Exit Mechanic', onetCode: '51-2011.86', description: 'Install emergency exit doors' },
  { title: 'Floor Beam Installer', onetCode: '51-2011.87', description: 'Install cabin floor structure' },
  { title: 'Stringer Installer', onetCode: '51-2011.88', description: 'Install fuselage stringers' },
  { title: 'Frame Installer', onetCode: '51-2011.89', description: 'Install fuselage frames' },
  { title: 'Keel Beam Mechanic', onetCode: '51-2011.90', description: 'Install center keel beam' },
  { title: 'Wing Spar Mechanic', onetCode: '51-2011.91', description: 'Install wing spar assemblies' },
  { title: 'Wing Rib Installer', onetCode: '51-2011.92', description: 'Install wing rib structures' },
  { title: 'Wing Tip Installer', onetCode: '51-2011.93', description: 'Install winglet assemblies' },
  { title: 'Pylon Installer', onetCode: '51-2011.94', description: 'Install engine pylon structures' },
  { title: 'Nacelle Installer', onetCode: '51-2011.95', description: 'Install engine nacelle assemblies' },

  // Defense Aircraft
  { title: 'Fighter Assembly Mechanic', onetCode: '51-2011.96', description: 'Assemble fighter aircraft' },
  { title: 'Stealth Coatings Tech', onetCode: '51-2011.97', description: 'Apply radar-absorbing materials' },
  { title: 'Weapons Bay Mechanic', onetCode: '51-2011.98', description: 'Install internal weapons bays' },
  { title: 'Ejection Seat Installer', onetCode: '51-2011.99', description: 'Install ejection seat systems' },
  { title: 'Canopy Installer', onetCode: '51-2012.01', description: 'Install fighter canopy systems' },
  { title: 'IRST Installer', onetCode: '51-2012.02', description: 'Install infrared search and track' },
  { title: 'Radar Bay Mechanic', onetCode: '51-2012.03', description: 'Install radar antenna systems' },
  { title: 'Conformal Tank Installer', onetCode: '51-2012.04', description: 'Install conformal fuel tanks' },
  { title: 'Tanker Boom Operator', onetCode: '51-2012.05', description: 'Install aerial refueling booms' },
  { title: 'AWACS Rotodome Tech', onetCode: '51-2012.06', description: 'Install airborne radar systems' },
  { title: 'Bomber Assembly Mechanic', onetCode: '51-2012.07', description: 'Assemble strategic bomber aircraft' },
  { title: 'Tanker Assembly Mechanic', onetCode: '51-2012.08', description: 'Assemble aerial refueling aircraft' },
  { title: 'Transport Assembly Mech', onetCode: '51-2012.09', description: 'Assemble military transport aircraft' },

  // Missile and Space Systems
  { title: 'Missile Assembly Tech', onetCode: '51-2012.10', description: 'Assemble missile airframes' },
  { title: 'Warhead Integration Tech', onetCode: '51-2012.11', description: 'Integrate warhead systems' },
  { title: 'Guidance System Tech', onetCode: '51-2012.12', description: 'Install missile guidance systems' },
  { title: 'Propulsion Integration', onetCode: '51-2012.13', description: 'Install missile propulsion' },
  { title: 'Seeker Assembly Tech', onetCode: '51-2012.14', description: 'Assemble missile seeker heads' },
  { title: 'Satellite Bus Tech', onetCode: '51-2012.15', description: 'Assemble satellite bus structures' },
  { title: 'Solar Panel Tech', onetCode: '51-2012.16', description: 'Install satellite solar arrays' },
  { title: 'Antenna Deployment Tech', onetCode: '51-2012.17', description: 'Install deployable antennas' },
  { title: 'Reaction Wheel Tech', onetCode: '51-2012.18', description: 'Install attitude control wheels' },
  { title: 'Star Tracker Installer', onetCode: '51-2012.19', description: 'Install star tracker sensors' },
  { title: 'Thermal Blanket Tech', onetCode: '51-2012.20', description: 'Install MLI thermal blankets' },
  { title: 'Harness Integration Tech', onetCode: '51-2012.21', description: 'Route satellite wire harnesses' },

  // NASA-Specific
  { title: 'NASA Flight Hardware Tech', onetCode: '51-2012.22', description: 'Build flight-qualified hardware' },
  { title: 'Crew Module Tech', onetCode: '51-2012.23', description: 'Assemble crew capsule modules' },
  { title: 'Service Module Tech', onetCode: '51-2012.24', description: 'Assemble spacecraft service modules' },
  { title: 'Launch Adapter Tech', onetCode: '51-2012.25', description: 'Install launch vehicle adapters' },
  { title: 'Heat Shield Tech NASA', onetCode: '51-2012.26', description: 'Install ablative heat shields' },
  { title: 'ISS Hardware Tech', onetCode: '51-2012.27', description: 'Build ISS replacement hardware' },
  { title: 'Payload Integration Tech', onetCode: '51-2012.28', description: 'Integrate science payloads' },
  { title: 'EVA Hardware Tech', onetCode: '51-2012.29', description: 'Build spacewalk hardware' },
  { title: 'Life Support Tech NASA', onetCode: '51-2012.30', description: 'Build life support equipment' },
  { title: 'Sample Return Tech', onetCode: '51-2012.31', description: 'Build sample return containers' },
  { title: 'Planetary Rover Tech', onetCode: '51-2012.32', description: 'Assemble planetary rovers' },
  { title: 'Clean Room Assembler NASA', onetCode: '51-2012.33', description: 'Perform Class 100 assembly' },

  // RTX/Raytheon-Specific
  { title: 'Radar Assembly Tech', onetCode: '51-2012.34', description: 'Assemble radar systems' },
  { title: 'Phased Array Tech', onetCode: '51-2012.35', description: 'Build phased array antennas' },
  { title: 'TR Module Tech', onetCode: '51-2012.36', description: 'Assemble transmit/receive modules' },
  { title: 'EW Pod Assembly', onetCode: '51-2012.37', description: 'Assemble electronic warfare pods' },
  { title: 'Jammer Assembly Tech', onetCode: '51-2012.38', description: 'Build jamming equipment' },
  { title: 'Sensor Fusion Tech', onetCode: '51-2012.39', description: 'Integrate multi-sensor systems' },
  { title: 'Patriot System Tech', onetCode: '51-2012.40', description: 'Assemble Patriot missile components' },
  { title: 'SM-6 Assembly Tech', onetCode: '51-2012.41', description: 'Assemble Standard Missile 6' },
  { title: 'AMRAAM Assembly Tech', onetCode: '51-2012.42', description: 'Assemble air-to-air missiles' },
  { title: 'Tomahawk Assembly Tech', onetCode: '51-2012.43', description: 'Assemble cruise missiles' },
  { title: 'Sidewinder Assembly Tech', onetCode: '51-2012.44', description: 'Assemble infrared missiles' },
  { title: 'Stinger Assembly Tech', onetCode: '51-2012.45', description: 'Assemble MANPADS missiles' },

  // ============================================
  // AUTOMOTIVE MANUFACTURING (Ford/GM/Toyota/Nissan) - 200+ occupations
  // ============================================

  // Stamping Operations
  { title: 'Stamping Press Operator', onetCode: '51-4031.10', description: 'Operate large stamping presses' },
  { title: 'Die Setter', onetCode: '51-4031.11', description: 'Set up stamping dies' },
  { title: 'Blank Feeder Operator', onetCode: '51-4031.12', description: 'Feed blanks into press lines' },
  { title: 'Transfer Press Operator', onetCode: '51-4031.13', description: 'Operate transfer stamping systems' },
  { title: 'Progressive Die Operator', onetCode: '51-4031.14', description: 'Operate progressive die presses' },
  { title: 'Panel Inspection Tech', onetCode: '51-4031.15', description: 'Inspect stamped body panels' },
  { title: 'Die Try-Out Specialist', onetCode: '51-4031.16', description: 'Validate new stamping dies' },
  { title: 'Die Repair Technician', onetCode: '51-4031.17', description: 'Repair and maintain dies' },
  { title: 'Coil Handler', onetCode: '51-4031.18', description: 'Handle steel coil material' },
  { title: 'Blank Stacker Operator', onetCode: '51-4031.19', description: 'Stack stamped blanks' },

  // Body Shop
  { title: 'Body Weld Technician', onetCode: '51-4121.50', description: 'Perform body welding operations' },
  { title: 'Spot Weld Operator Auto', onetCode: '51-4121.51', description: 'Operate spot welding equipment' },
  { title: 'MIG Weld Operator Auto', onetCode: '51-4121.52', description: 'Perform MIG welding on bodies' },
  { title: 'Laser Weld Operator Auto', onetCode: '51-4121.53', description: 'Operate laser welding systems' },
  { title: 'Hem Flange Operator', onetCode: '51-4121.54', description: 'Perform hem flanging operations' },
  { title: 'Clinch Joint Operator', onetCode: '51-4121.55', description: 'Operate clinching equipment' },
  { title: 'Adhesive Bond Operator', onetCode: '51-4121.56', description: 'Apply structural adhesives' },
  { title: 'Body Framer Operator', onetCode: '51-4121.57', description: 'Operate body framing stations' },
  { title: 'Roof Installation Tech', onetCode: '51-4121.58', description: 'Install body roof panels' },
  { title: 'Quarter Panel Installer', onetCode: '51-4121.59', description: 'Install quarter panels' },
  { title: 'Fender Installation Tech', onetCode: '51-4121.60', description: 'Install fender assemblies' },
  { title: 'Hood Deck Installer', onetCode: '51-4121.61', description: 'Install hoods and deck lids' },
  { title: 'Door Hang Technician', onetCode: '51-4121.62', description: 'Hang and align doors' },
  { title: 'Body Repair Specialist', onetCode: '51-4121.63', description: 'Repair body defects' },
  { title: 'Body Dimensional Check', onetCode: '51-4121.64', description: 'Perform body measurements' },

  // Paint Operations
  { title: 'Phosphate Operator', onetCode: '51-9121.20', description: 'Operate phosphate pretreatment' },
  { title: 'E-Coat Operator Auto', onetCode: '51-9121.21', description: 'Operate electrocoat systems' },
  { title: 'Sealer Applicator Auto', onetCode: '51-9121.22', description: 'Apply body sealers' },
  { title: 'PVC Applicator', onetCode: '51-9121.23', description: 'Apply PVC underbody coating' },
  { title: 'Primer Spray Operator', onetCode: '51-9121.24', description: 'Apply primer coatings' },
  { title: 'Base Coat Spray Op', onetCode: '51-9121.25', description: 'Apply base coat paint' },
  { title: 'Clear Coat Spray Op', onetCode: '51-9121.26', description: 'Apply clear coat finish' },
  { title: 'Paint Robot Operator', onetCode: '51-9121.27', description: 'Monitor paint robots' },
  { title: 'Paint Booth Technician', onetCode: '51-9121.28', description: 'Maintain paint booths' },
  { title: 'Spot Repair Painter', onetCode: '51-9121.29', description: 'Repair paint defects' },
  { title: 'Color Auditor', onetCode: '51-9121.30', description: 'Verify paint color quality' },
  { title: 'Paint Mix Technician', onetCode: '51-9121.31', description: 'Mix paint batches' },
  { title: 'Oven Operator', onetCode: '51-9121.32', description: 'Operate paint cure ovens' },
  { title: 'Sanding Operator', onetCode: '51-9121.33', description: 'Sand paint surfaces' },
  { title: 'Polishing Operator', onetCode: '51-9121.34', description: 'Polish paint finish' },

  // Chassis Assembly
  { title: 'Chassis Line Operator', onetCode: '51-2092.20', description: 'Assemble chassis components' },
  { title: 'Suspension Installer', onetCode: '51-2092.21', description: 'Install suspension systems' },
  { title: 'Front Suspension Tech', onetCode: '51-2092.22', description: 'Install front suspension' },
  { title: 'Rear Suspension Tech', onetCode: '51-2092.23', description: 'Install rear suspension' },
  { title: 'Steering Install Tech', onetCode: '51-2092.24', description: 'Install steering systems' },
  { title: 'Brake System Installer', onetCode: '51-2092.25', description: 'Install brake systems' },
  { title: 'Fuel Tank Installer', onetCode: '51-2092.26', description: 'Install fuel tank assemblies' },
  { title: 'Exhaust System Install', onetCode: '51-2092.27', description: 'Install exhaust systems' },
  { title: 'Driveline Installer', onetCode: '51-2092.28', description: 'Install driveshaft assemblies' },
  { title: 'Axle Installer', onetCode: '51-2092.29', description: 'Install axle assemblies' },

  // Trim and Final
  { title: 'Trim Line Operator', onetCode: '51-2092.30', description: 'Install trim components' },
  { title: 'Interior Trim Installer', onetCode: '51-2092.31', description: 'Install interior panels' },
  { title: 'Instrument Panel Install', onetCode: '51-2092.32', description: 'Install instrument panels' },
  { title: 'Console Installer', onetCode: '51-2092.33', description: 'Install center consoles' },
  { title: 'Carpet Installer Auto', onetCode: '51-2092.34', description: 'Install floor carpet' },
  { title: 'Headliner Installer Auto', onetCode: '51-2092.35', description: 'Install headliner assemblies' },
  { title: 'Door Trim Installer', onetCode: '51-2092.36', description: 'Install door trim panels' },
  { title: 'Wiring Harness Install', onetCode: '51-2092.37', description: 'Install vehicle harnesses' },
  { title: 'HVAC System Installer', onetCode: '51-2092.38', description: 'Install HVAC systems' },
  { title: 'Seat Installer Auto', onetCode: '51-2092.39', description: 'Install vehicle seats' },
  { title: 'Glass Installer Auto', onetCode: '51-2092.40', description: 'Install vehicle glass' },
  { title: 'Wheel Installer Auto', onetCode: '51-2092.41', description: 'Install wheels and tires' },
  { title: 'Fluid Fill Operator Auto', onetCode: '51-2092.42', description: 'Fill vehicle fluids' },
  { title: 'Battery Installer Auto', onetCode: '51-2092.43', description: 'Install vehicle batteries' },
  { title: 'Final Line Inspector', onetCode: '51-2092.44', description: 'Perform final inspection' },

  // Powertrain
  { title: 'Engine Assembly Tech Auto', onetCode: '51-2092.50', description: 'Assemble automotive engines' },
  { title: 'Cylinder Head Assembler', onetCode: '51-2092.51', description: 'Assemble cylinder heads' },
  { title: 'Block Assembly Tech', onetCode: '51-2092.52', description: 'Assemble engine blocks' },
  { title: 'Crankshaft Installer', onetCode: '51-2092.53', description: 'Install crankshafts' },
  { title: 'Piston Assembly Tech', onetCode: '51-2092.54', description: 'Assemble piston assemblies' },
  { title: 'Camshaft Installer', onetCode: '51-2092.55', description: 'Install camshafts' },
  { title: 'Valve Train Assembler', onetCode: '51-2092.56', description: 'Assemble valve train' },
  { title: 'Oil Pan Installer', onetCode: '51-2092.57', description: 'Install oil pan assemblies' },
  { title: 'Engine Dress Tech', onetCode: '51-2092.58', description: 'Install engine accessories' },
  { title: 'Transmission Assembly', onetCode: '51-2092.59', description: 'Assemble transmissions' },
  { title: 'Clutch Assembly Tech', onetCode: '51-2092.60', description: 'Assemble clutch systems' },
  { title: 'Torque Converter Install', onetCode: '51-2092.61', description: 'Install torque converters' },
  { title: 'Engine Test Operator', onetCode: '51-2092.62', description: 'Test assembled engines' },
  { title: 'Transmission Test Op', onetCode: '51-2092.63', description: 'Test assembled transmissions' },

  // ============================================
  // INDUSTRIAL MACHINERY (DMG Mori/Siemens) - 100+ occupations
  // ============================================

  // Machine Tool Manufacturing
  { title: 'Machine Tool Assembler', onetCode: '51-2041.10', description: 'Assemble CNC machine tools' },
  { title: 'Spindle Assembler', onetCode: '51-2041.11', description: 'Assemble machine spindles' },
  { title: 'Ballscrew Installer', onetCode: '51-2041.12', description: 'Install precision ballscrews' },
  { title: 'Linear Guide Installer', onetCode: '51-2041.13', description: 'Install linear motion guides' },
  { title: 'Way System Scraper', onetCode: '51-2041.14', description: 'Hand scrape machine ways' },
  { title: 'Turret Assembler', onetCode: '51-2041.15', description: 'Assemble tool turrets' },
  { title: 'Tool Changer Assembler', onetCode: '51-2041.16', description: 'Assemble automatic tool changers' },
  { title: 'Coolant System Tech', onetCode: '51-2041.17', description: 'Install coolant systems' },
  { title: 'Chip Conveyor Install', onetCode: '51-2041.18', description: 'Install chip removal systems' },
  { title: 'Machine Bed Assembler', onetCode: '51-2041.19', description: 'Assemble machine bed castings' },
  { title: 'Column Assembler', onetCode: '51-2041.20', description: 'Assemble machine columns' },
  { title: 'Table Assembler', onetCode: '51-2041.21', description: 'Assemble machine tables' },
  { title: 'Enclosure Installer', onetCode: '51-2041.22', description: 'Install safety enclosures' },
  { title: 'Machine Electrician', onetCode: '51-2041.23', description: 'Wire machine electrical systems' },
  { title: 'Servo Drive Installer', onetCode: '51-2041.24', description: 'Install servo drive systems' },
  { title: 'CNC Installer', onetCode: '51-2041.25', description: 'Install CNC control systems' },
  { title: 'Machine Hydraulics Tech', onetCode: '51-2041.26', description: 'Install hydraulic systems' },
  { title: 'Machine Pneumatics Tech', onetCode: '51-2041.27', description: 'Install pneumatic systems' },
  { title: 'Geometric Alignment Tech', onetCode: '51-2041.28', description: 'Align machine geometry' },
  { title: 'Laser Alignment Tech', onetCode: '51-2041.29', description: 'Perform laser alignment' },
  { title: 'Machine Runoff Tech', onetCode: '51-2041.30', description: 'Perform machine acceptance' },

  // Siemens-Specific Industrial
  { title: 'PLC Assembly Technician', onetCode: '51-2041.40', description: 'Assemble PLC systems' },
  { title: 'Drive System Assembler', onetCode: '51-2041.41', description: 'Assemble variable frequency drives' },
  { title: 'Motor Assembly Tech', onetCode: '51-2041.42', description: 'Assemble industrial motors' },
  { title: 'Servo Motor Assembler', onetCode: '51-2041.43', description: 'Assemble servo motors' },
  { title: 'Encoder Installer', onetCode: '51-2041.44', description: 'Install position encoders' },
  { title: 'HMI Panel Assembler', onetCode: '51-2041.45', description: 'Assemble HMI panels' },
  { title: 'Industrial PC Builder', onetCode: '51-2041.46', description: 'Build industrial computers' },
  { title: 'Network Switch Assembler', onetCode: '51-2041.47', description: 'Assemble industrial switches' },
  { title: 'Safety Controller Tech', onetCode: '51-2041.48', description: 'Assemble safety controllers' },
  { title: 'I/O Module Assembler', onetCode: '51-2041.49', description: 'Assemble I/O modules' },
  { title: 'Power Supply Assembler', onetCode: '51-2041.50', description: 'Assemble industrial power supplies' },
  { title: 'Transformer Assembler', onetCode: '51-2041.51', description: 'Assemble power transformers' },
  { title: 'Switchgear Assembler', onetCode: '51-2041.52', description: 'Assemble switchgear panels' },
  { title: 'MCC Assembler', onetCode: '51-2041.53', description: 'Assemble motor control centers' },
  { title: 'Generator Assembler', onetCode: '51-2041.54', description: 'Assemble industrial generators' },
  { title: 'Turbine Assembly Tech', onetCode: '51-2041.55', description: 'Assemble gas and steam turbines' },

  // ============================================
  // PHARMA/MEDICAL (J&J/Cardinal Health) - 100+ occupations
  // ============================================

  // Pharmaceutical Manufacturing
  { title: 'Pharma Blending Operator', onetCode: '51-9011.10', description: 'Operate pharmaceutical blenders' },
  { title: 'Granulation Operator', onetCode: '51-9011.11', description: 'Operate granulation equipment' },
  { title: 'Tablet Press Operator', onetCode: '51-9011.12', description: 'Operate tablet compression' },
  { title: 'Coating Pan Operator', onetCode: '51-9011.13', description: 'Operate tablet coating systems' },
  { title: 'Encapsulation Operator', onetCode: '51-9011.14', description: 'Operate capsule filling machines' },
  { title: 'Liquid Fill Operator', onetCode: '51-9011.15', description: 'Operate liquid filling lines' },
  { title: 'Vial Fill Operator', onetCode: '51-9011.16', description: 'Operate sterile vial filling' },
  { title: 'Syringe Fill Operator', onetCode: '51-9011.17', description: 'Operate pre-filled syringe lines' },
  { title: 'Lyophilization Operator', onetCode: '51-9011.18', description: 'Operate freeze dryers' },
  { title: 'Sterilizer Operator', onetCode: '51-9011.19', description: 'Operate sterilization equipment' },
  { title: 'Autoclave Operator', onetCode: '51-9011.20', description: 'Operate autoclaves' },
  { title: 'Depyrogenation Tech', onetCode: '51-9011.21', description: 'Operate depyrogenation ovens' },
  { title: 'Isolator Operator', onetCode: '51-9011.22', description: 'Operate containment isolators' },
  { title: 'Aseptic Fill Operator', onetCode: '51-9011.23', description: 'Perform aseptic filling' },
  { title: 'Packaging Operator Pharma', onetCode: '51-9011.24', description: 'Operate pharma packaging' },
  { title: 'Blister Pack Operator', onetCode: '51-9011.25', description: 'Operate blister packaging' },
  { title: 'Cartoner Operator', onetCode: '51-9011.26', description: 'Operate cartoning machines' },
  { title: 'Serialization Operator', onetCode: '51-9011.27', description: 'Operate serialization systems' },
  { title: 'Labeling Operator Pharma', onetCode: '51-9011.28', description: 'Operate labeling equipment' },

  // Quality Control Pharma
  { title: 'QC Analyst Pharma', onetCode: '19-4031.10', description: 'Perform pharmaceutical QC testing' },
  { title: 'HPLC Analyst', onetCode: '19-4031.11', description: 'Perform HPLC analysis' },
  { title: 'GC Analyst', onetCode: '19-4031.12', description: 'Perform gas chromatography' },
  { title: 'Mass Spec Analyst', onetCode: '19-4031.13', description: 'Perform mass spectrometry' },
  { title: 'Dissolution Analyst', onetCode: '19-4031.14', description: 'Perform dissolution testing' },
  { title: 'Stability Analyst', onetCode: '19-4031.15', description: 'Perform stability testing' },
  { title: 'Microbiology Analyst', onetCode: '19-4031.16', description: 'Perform micro testing' },
  { title: 'Endotoxin Analyst', onetCode: '19-4031.17', description: 'Perform LAL testing' },
  { title: 'Sterility Test Analyst', onetCode: '19-4031.18', description: 'Perform sterility testing' },
  { title: 'Environmental Monitor', onetCode: '19-4031.19', description: 'Perform EM sampling' },
  { title: 'Water System Analyst', onetCode: '19-4031.20', description: 'Test pharmaceutical water' },
  { title: 'Raw Material Analyst', onetCode: '19-4031.21', description: 'Test incoming materials' },
  { title: 'In-Process Analyst', onetCode: '19-4031.22', description: 'Perform in-process testing' },
  { title: 'Release Analyst', onetCode: '19-4031.23', description: 'Perform release testing' },

  // Medical Device Manufacturing
  { title: 'Surgical Instrument Assembler', onetCode: '51-9082.10', description: 'Assemble surgical instruments' },
  { title: 'Implant Assembler', onetCode: '51-9082.11', description: 'Assemble orthopedic implants' },
  { title: 'Catheter Assembler', onetCode: '51-9082.12', description: 'Assemble catheter devices' },
  { title: 'Stent Assembler', onetCode: '51-9082.13', description: 'Assemble cardiovascular stents' },
  { title: 'Pacemaker Assembler', onetCode: '51-9082.14', description: 'Assemble pacemaker devices' },
  { title: 'ICD Assembler', onetCode: '51-9082.15', description: 'Assemble defibrillator devices' },
  { title: 'Hearing Aid Assembler', onetCode: '51-9082.16', description: 'Assemble hearing aids' },
  { title: 'Contact Lens Technician', onetCode: '51-9082.17', description: 'Manufacture contact lenses' },
  { title: 'Dental Device Tech', onetCode: '51-9082.18', description: 'Manufacture dental devices' },
  { title: 'Diagnostic Kit Assembler', onetCode: '51-9082.19', description: 'Assemble diagnostic kits' },
  { title: 'Suture Technician', onetCode: '51-9082.20', description: 'Manufacture sutures' },
  { title: 'Needle Assembler', onetCode: '51-9082.21', description: 'Assemble hypodermic needles' },
  { title: 'Tubing Assembler', onetCode: '51-9082.22', description: 'Assemble medical tubing' },
  { title: 'Filter Assembler', onetCode: '51-9082.23', description: 'Assemble medical filters' },
  { title: 'Pump Assembler Med', onetCode: '51-9082.24', description: 'Assemble infusion pumps' },

  // ============================================
  // FOOD/CONSUMER GOODS (Nestle/PepsiCo/P&G) - 100+ occupations
  // ============================================

  // Food Processing
  { title: 'Food Blending Operator', onetCode: '51-3092.10', description: 'Operate food blending equipment' },
  { title: 'Mixer Operator Food', onetCode: '51-3092.11', description: 'Operate food mixers' },
  { title: 'Batch Operator Food', onetCode: '51-3092.12', description: 'Prepare food batches' },
  { title: 'Cooker Operator', onetCode: '51-3092.13', description: 'Operate food cooking systems' },
  { title: 'Retort Operator', onetCode: '51-3092.14', description: 'Operate retort sterilizers' },
  { title: 'Pasteurizer Operator', onetCode: '51-3092.15', description: 'Operate pasteurization equipment' },
  { title: 'UHT Operator', onetCode: '51-3092.16', description: 'Operate UHT processing' },
  { title: 'Spray Dryer Operator', onetCode: '51-3092.17', description: 'Operate spray drying systems' },
  { title: 'Freeze Dryer Operator Food', onetCode: '51-3092.18', description: 'Operate food freeze dryers' },
  { title: 'Extrusion Operator Food', onetCode: '51-3092.19', description: 'Operate food extruders' },
  { title: 'Forming Machine Operator', onetCode: '51-3092.20', description: 'Operate forming equipment' },
  { title: 'Fryer Operator', onetCode: '51-3092.21', description: 'Operate frying equipment' },
  { title: 'Oven Operator Food', onetCode: '51-3092.22', description: 'Operate baking ovens' },
  { title: 'Cooling Tunnel Operator', onetCode: '51-3092.23', description: 'Operate cooling systems' },
  { title: 'Enrobing Operator', onetCode: '51-3092.24', description: 'Operate chocolate enrobers' },
  { title: 'Depositor Operator', onetCode: '51-3092.25', description: 'Operate depositing equipment' },
  { title: 'Coating Drum Operator', onetCode: '51-3092.26', description: 'Operate coating drums' },
  { title: 'Seasoning Operator', onetCode: '51-3092.27', description: 'Apply food seasonings' },

  // Beverage Manufacturing
  { title: 'Syrup Room Operator', onetCode: '51-3092.30', description: 'Prepare beverage syrups' },
  { title: 'Carbonation Operator', onetCode: '51-3092.31', description: 'Operate carbonation systems' },
  { title: 'Filler Operator Beverage', onetCode: '51-3092.32', description: 'Operate beverage filling' },
  { title: 'Capper Operator', onetCode: '51-3092.33', description: 'Operate capping equipment' },
  { title: 'Labeler Operator Beverage', onetCode: '51-3092.34', description: 'Operate labeling equipment' },
  { title: 'Packer Operator Beverage', onetCode: '51-3092.35', description: 'Operate packing equipment' },
  { title: 'Palletizer Operator', onetCode: '51-3092.36', description: 'Operate palletizing systems' },
  { title: 'CIP Operator', onetCode: '51-3092.37', description: 'Operate clean-in-place systems' },
  { title: 'Bottle Blow Molder', onetCode: '51-3092.38', description: 'Operate bottle blow molding' },
  { title: 'Can Line Operator', onetCode: '51-3092.39', description: 'Operate can filling lines' },
  { title: 'Water Treatment Op Food', onetCode: '51-3092.40', description: 'Operate water treatment' },

  // Consumer Products (P&G)
  { title: 'Soap Making Operator', onetCode: '51-9199.30', description: 'Operate soap manufacturing' },
  { title: 'Detergent Blending Op', onetCode: '51-9199.31', description: 'Blend detergent formulations' },
  { title: 'Detergent Packing Op', onetCode: '51-9199.32', description: 'Pack detergent products' },
  { title: 'Shampoo Mixing Operator', onetCode: '51-9199.33', description: 'Mix personal care products' },
  { title: 'Cosmetics Fill Operator', onetCode: '51-9199.34', description: 'Fill cosmetics products' },
  { title: 'Lotion Mixing Operator', onetCode: '51-9199.35', description: 'Mix lotion formulations' },
  { title: 'Toothpaste Line Operator', onetCode: '51-9199.36', description: 'Operate toothpaste lines' },
  { title: 'Razor Assembly Operator', onetCode: '51-9199.37', description: 'Assemble razor products' },
  { title: 'Blade Manufacturing Op', onetCode: '51-9199.38', description: 'Manufacture razor blades' },
  { title: 'Diaper Line Operator', onetCode: '51-9199.39', description: 'Operate diaper production' },
  { title: 'Tissue Converting Op', onetCode: '51-9199.40', description: 'Operate tissue converting' },
  { title: 'Paper Towel Line Op', onetCode: '51-9199.41', description: 'Operate paper towel lines' },
  { title: 'Feminine Care Line Op', onetCode: '51-9199.42', description: 'Operate feminine care lines' },
  { title: 'Air Care Fill Operator', onetCode: '51-9199.43', description: 'Fill air freshener products' },
  { title: 'Fabric Care Packing Op', onetCode: '51-9199.44', description: 'Pack fabric care products' },

  // ============================================
  // SOFTWARE/CAD (Autodesk) - Engineering roles
  // ============================================
  { title: 'CAD Software Developer', onetCode: '15-1252.20', description: 'Develop CAD software applications' },
  { title: 'Graphics Engine Developer', onetCode: '15-1252.21', description: 'Develop 3D graphics engines' },
  { title: 'Geometry Kernel Developer', onetCode: '15-1252.22', description: 'Develop geometric modeling kernels' },
  { title: 'Constraint Solver Developer', onetCode: '15-1252.23', description: 'Develop parametric solvers' },
  { title: 'File Format Developer', onetCode: '15-1252.24', description: 'Develop CAD file translators' },
  { title: 'Simulation Developer', onetCode: '15-1252.25', description: 'Develop simulation software' },
  { title: 'Rendering Developer', onetCode: '15-1252.26', description: 'Develop rendering engines' },
  { title: 'Cloud Platform Developer', onetCode: '15-1252.27', description: 'Develop cloud CAD platforms' },
  { title: 'API Developer CAD', onetCode: '15-1252.28', description: 'Develop CAD APIs' },
  { title: 'Plugin Developer', onetCode: '15-1252.29', description: 'Develop CAD plugins' },
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

  // ===== BATTERY & EV TECHNOLOGY (8) =====
  { name: 'Battery Pack Assembly', category: 'Assembly & Electronics', description: 'Assembling lithium-ion battery packs for EVs' },
  { name: 'Battery Cell Formation', category: 'Assembly & Electronics', description: 'Charging and cycling new battery cells' },
  { name: 'Battery Management Systems', category: 'Electrical Systems', description: 'Programming and testing BMS controllers' },
  { name: 'High Voltage Safety', category: 'Electrical Systems', description: 'Working safely with high voltage EV systems' },
  { name: 'Thermal Management Systems', category: 'Assembly & Electronics', description: 'Installing EV battery cooling systems' },
  { name: 'EV Charging Systems', category: 'Electrical Systems', description: 'Installing and testing EV charging equipment' },
  { name: 'Electric Motor Assembly', category: 'Assembly & Electronics', description: 'Assembling electric traction motors' },
  { name: 'Inverter Testing', category: 'Electrical Systems', description: 'Testing power inverters and converters' },

  // ===== ADVANCED ROBOTICS (6) =====
  { name: 'Universal Robots Programming', category: 'Software & Programming', description: 'Programming UR collaborative robots' },
  { name: 'Cobot Safety Integration', category: 'Software & Programming', description: 'Integrating safety systems for collaborative robots' },
  { name: 'Machine Vision Programming', category: 'Software & Programming', description: 'Programming Cognex and Keyence vision systems' },
  { name: 'Robot Cell Design', category: 'Software & Programming', description: 'Designing automated robotic work cells' },
  { name: 'Path Planning and Simulation', category: 'Software & Programming', description: 'Offline robot programming and simulation' },
  { name: 'End Effector Design', category: 'Software & Programming', description: 'Designing robot grippers and tooling' },

  // ===== ADDITIVE MANUFACTURING (6) =====
  { name: 'Metal 3D Printing', category: 'Machining', description: 'Operating DMLS and SLM metal 3D printers' },
  { name: 'Polymer 3D Printing', category: 'Machining', description: 'Operating FDM, SLA, and SLS 3D printers' },
  { name: 'Post-Processing AM Parts', category: 'Machining', description: 'Heat treating and finishing 3D printed parts' },
  { name: 'DfAM - Design for AM', category: 'Software & Programming', description: 'Design optimization for additive manufacturing' },
  { name: 'Build Preparation Software', category: 'Software & Programming', description: 'Using Materialise Magics and similar tools' },
  { name: 'Powder Handling', category: 'Quality & Measurement', description: 'Safe handling of metal and polymer powders' },

  // ===== ADVANCED SEMICONDUCTOR (6) =====
  { name: 'Atomic Layer Deposition', category: 'Assembly & Electronics', description: 'Operating ALD equipment for thin films' },
  { name: 'CMP - Chemical Mechanical Polish', category: 'Assembly & Electronics', description: 'Chemical mechanical planarization processes' },
  { name: 'Wet Bench Processing', category: 'Assembly & Electronics', description: 'Operating wet chemical processing equipment' },
  { name: 'Defect Inspection', category: 'Quality & Measurement', description: 'Operating KLA and other defect inspection tools' },
  { name: 'E-Beam Lithography', category: 'Assembly & Electronics', description: 'Electron beam lithography for masks and prototypes' },
  { name: 'Wafer Bonding', category: 'Assembly & Electronics', description: 'Silicon wafer bonding techniques' },

  // ===== DEFENSE & MILITARY (6) =====
  { name: 'ITAR Compliance', category: 'Quality & Measurement', description: 'International Traffic in Arms Regulations compliance' },
  { name: 'Cryptographic Systems', category: 'Assembly & Electronics', description: 'Assembling and testing cryptographic hardware' },
  { name: 'Missile Assembly', category: 'Assembly & Electronics', description: 'Assembling guided missile components' },
  { name: 'Radar System Testing', category: 'Electrical Systems', description: 'Testing radar and antenna systems' },
  { name: 'Flight Control Systems', category: 'Assembly & Electronics', description: 'Assembling aircraft flight control systems' },
  { name: 'Ordnance Handling', category: 'Assembly & Electronics', description: 'Safe handling of explosives and munitions' },

  // ===== ADVANCED MEASUREMENT (4) =====
  { name: 'CT Scanning Inspection', category: 'Quality & Measurement', description: 'Industrial CT scanning for internal inspection' },
  { name: 'Laser Scanning', category: 'Quality & Measurement', description: '3D laser scanning for reverse engineering' },
  { name: 'White Light Scanning', category: 'Quality & Measurement', description: 'Structured light 3D scanning systems' },
  { name: 'Coordinate Metrology', category: 'Quality & Measurement', description: 'Advanced coordinate measurement techniques' },

  // ============================================
  // AEROSPACE & DEFENSE COMPREHENSIVE SKILLS
  // ============================================

  // ===== NDT/NDE ULTRASONIC TESTING (30) =====
  { name: 'Conventional UT - Contact Method', category: 'Quality & Measurement', description: 'Contact ultrasonic testing using single element probes' },
  { name: 'Conventional UT - Immersion Method', category: 'Quality & Measurement', description: 'Immersion ultrasonic testing in water tanks' },
  { name: 'Phased Array UT - Linear Scan', category: 'Quality & Measurement', description: 'Phased array linear scanning techniques' },
  { name: 'Phased Array UT - Sectorial Scan', category: 'Quality & Measurement', description: 'Phased array S-scan/sectorial scanning' },
  { name: 'TOFD Inspection', category: 'Quality & Measurement', description: 'Time-of-Flight Diffraction weld inspection' },
  { name: 'Guided Wave UT', category: 'Quality & Measurement', description: 'Long-range guided wave ultrasonic inspection' },
  { name: 'UT Thickness Measurement', category: 'Quality & Measurement', description: 'Ultrasonic thickness gauging for corrosion' },
  { name: 'UT Flaw Sizing - DGS Method', category: 'Quality & Measurement', description: 'Flaw sizing using Distance Gain Size curves' },
  { name: 'UT Flaw Sizing - DAC Method', category: 'Quality & Measurement', description: 'Flaw evaluation using Distance Amplitude Correction' },
  { name: 'UT C-Scan Interpretation', category: 'Quality & Measurement', description: 'Interpreting C-scan images for laminar defects' },
  { name: 'UT Calibration Blocks', category: 'Quality & Measurement', description: 'Using IIW, AWS, and reference calibration blocks' },
  { name: 'UT Probe Selection', category: 'Quality & Measurement', description: 'Selecting appropriate UT probes for applications' },
  { name: 'Angle Beam UT - Shear Wave', category: 'Quality & Measurement', description: 'Angle beam shear wave weld inspection' },
  { name: 'Straight Beam UT - Longitudinal', category: 'Quality & Measurement', description: 'Straight beam longitudinal wave inspection' },
  { name: 'UT Couplant Selection', category: 'Quality & Measurement', description: 'Selecting ultrasonic couplants for applications' },
  { name: 'Through Transmission UT', category: 'Quality & Measurement', description: 'Through-transmission ultrasonic testing' },
  { name: 'Pulse Echo UT', category: 'Quality & Measurement', description: 'Pulse-echo ultrasonic testing techniques' },
  { name: 'UT of Composites', category: 'Quality & Measurement', description: 'Ultrasonic inspection of composite structures' },
  { name: 'UT of Adhesive Bonds', category: 'Quality & Measurement', description: 'Ultrasonic bond testing methods' },
  { name: 'UT of Forgings', category: 'Quality & Measurement', description: 'Ultrasonic inspection of forged components' },
  { name: 'UT of Castings', category: 'Quality & Measurement', description: 'Ultrasonic inspection of cast components' },
  { name: 'UT of Welds - Butt Joints', category: 'Quality & Measurement', description: 'UT inspection of butt weld joints' },
  { name: 'UT of Welds - Fillet Welds', category: 'Quality & Measurement', description: 'UT inspection of fillet weld joints' },
  { name: 'Automated UT Systems', category: 'Quality & Measurement', description: 'Operating automated UT scanning systems' },
  { name: 'UT Data Recording', category: 'Quality & Measurement', description: 'Digital recording of UT inspection data' },
  { name: 'UT Report Writing', category: 'Quality & Measurement', description: 'Documenting UT inspection results' },
  { name: 'UT Procedure Development', category: 'Quality & Measurement', description: 'Writing UT inspection procedures' },
  { name: 'Full Matrix Capture UT', category: 'Quality & Measurement', description: 'FMC/TFM advanced phased array techniques' },
  { name: 'Dual Linear Array UT', category: 'Quality & Measurement', description: 'DLA techniques for corrosion mapping' },
  { name: 'UT Simulator Training', category: 'Quality & Measurement', description: 'Using UT simulators for training' },

  // ===== NDT/NDE RADIOGRAPHIC TESTING (20) =====
  { name: 'Film Radiography - X-Ray', category: 'Quality & Measurement', description: 'Conventional X-ray film radiography' },
  { name: 'Film Radiography - Gamma Ray', category: 'Quality & Measurement', description: 'Gamma ray radiography using Ir-192, Co-60' },
  { name: 'Computed Radiography CR', category: 'Quality & Measurement', description: 'Computed radiography with imaging plates' },
  { name: 'Digital Detector Array DR', category: 'Quality & Measurement', description: 'Digital radiography with flat panel detectors' },
  { name: 'Industrial CT Scanning', category: 'Quality & Measurement', description: 'Industrial computed tomography inspection' },
  { name: 'Radiographic Film Interpretation', category: 'Quality & Measurement', description: 'Interpreting radiographic film images' },
  { name: 'IQI Selection and Placement', category: 'Quality & Measurement', description: 'Using Image Quality Indicators per ASTM E1025' },
  { name: 'Geometric Unsharpness Calculation', category: 'Quality & Measurement', description: 'Calculating RT geometric parameters' },
  { name: 'Radiation Safety - ALARA', category: 'Quality & Measurement', description: 'Radiation protection and ALARA principles' },
  { name: 'RT Source Handling', category: 'Quality & Measurement', description: 'Safe handling of radioactive sources' },
  { name: 'RT Exposure Calculation', category: 'Quality & Measurement', description: 'Calculating radiographic exposure parameters' },
  { name: 'Fluoroscopy - Real Time RT', category: 'Quality & Measurement', description: 'Real-time radiographic inspection' },
  { name: 'RT of Welds', category: 'Quality & Measurement', description: 'Radiographic inspection of weld joints' },
  { name: 'RT of Castings', category: 'Quality & Measurement', description: 'Radiographic inspection of castings per ASTM E446' },
  { name: 'Panoramic RT Techniques', category: 'Quality & Measurement', description: 'Panoramic radiography of pipes and vessels' },
  { name: 'Double Wall RT Techniques', category: 'Quality & Measurement', description: 'Double wall single/double image RT' },
  { name: 'RT Darkroom Procedures', category: 'Quality & Measurement', description: 'Film processing and darkroom operations' },
  { name: 'Densitometer Operation', category: 'Quality & Measurement', description: 'Measuring film density with densitometers' },
  { name: 'RT Procedure Development', category: 'Quality & Measurement', description: 'Writing RT inspection procedures' },
  { name: 'Backscatter RT Techniques', category: 'Quality & Measurement', description: 'Backscatter radiographic inspection' },

  // ===== NDT/NDE EDDY CURRENT TESTING (15) =====
  { name: 'Surface ET Inspection', category: 'Quality & Measurement', description: 'Surface eddy current crack detection' },
  { name: 'Bolt Hole ET Inspection', category: 'Quality & Measurement', description: 'Rotating probe bolt hole inspection' },
  { name: 'Tube ET Inspection', category: 'Quality & Measurement', description: 'Bobbin and rotating probe tube inspection' },
  { name: 'ET Conductivity Measurement', category: 'Quality & Measurement', description: 'Electrical conductivity testing' },
  { name: 'ET Coating Thickness', category: 'Quality & Measurement', description: 'Non-conductive coating thickness measurement' },
  { name: 'ET Array Inspection', category: 'Quality & Measurement', description: 'Eddy current array surface inspection' },
  { name: 'Remote Field ET', category: 'Quality & Measurement', description: 'Remote field eddy current testing' },
  { name: 'Pulsed ET', category: 'Quality & Measurement', description: 'Pulsed eddy current for corrosion under insulation' },
  { name: 'ET Impedance Plane Analysis', category: 'Quality & Measurement', description: 'Interpreting ET impedance plane displays' },
  { name: 'ET Probe Selection', category: 'Quality & Measurement', description: 'Selecting ET probes for applications' },
  { name: 'ET Reference Standard Fabrication', category: 'Quality & Measurement', description: 'Making ET calibration standards' },
  { name: 'ET of Aerospace Structures', category: 'Quality & Measurement', description: 'ET inspection of aircraft structures' },
  { name: 'ET of Engine Components', category: 'Quality & Measurement', description: 'ET inspection of turbine engine parts' },
  { name: 'Low Frequency ET', category: 'Quality & Measurement', description: 'Low frequency ET for subsurface detection' },
  { name: 'ET Procedure Development', category: 'Quality & Measurement', description: 'Writing ET inspection procedures' },

  // ===== NDT/NDE MAGNETIC PARTICLE & PENETRANT (15) =====
  { name: 'Wet Fluorescent MT', category: 'Quality & Measurement', description: 'Wet fluorescent magnetic particle inspection' },
  { name: 'Dry Powder MT', category: 'Quality & Measurement', description: 'Dry powder magnetic particle inspection' },
  { name: 'MT Yoke Technique', category: 'Quality & Measurement', description: 'Electromagnetic yoke MT inspection' },
  { name: 'MT Prod Technique', category: 'Quality & Measurement', description: 'Direct magnetization with prods' },
  { name: 'MT Coil Technique', category: 'Quality & Measurement', description: 'Coil magnetization for circular parts' },
  { name: 'MT Head Shot Technique', category: 'Quality & Measurement', description: 'Head shot magnetization on MT bench' },
  { name: 'Central Conductor MT', category: 'Quality & Measurement', description: 'Central conductor magnetization' },
  { name: 'MT Demagnetization', category: 'Quality & Measurement', description: 'Demagnetizing parts after MT inspection' },
  { name: 'Fluorescent Penetrant Type I', category: 'Quality & Measurement', description: 'Type I fluorescent dye penetrant inspection' },
  { name: 'Visible Penetrant Type II', category: 'Quality & Measurement', description: 'Type II visible dye penetrant inspection' },
  { name: 'Water Washable Penetrant Method A', category: 'Quality & Measurement', description: 'Water washable PT process' },
  { name: 'Post-Emulsifiable Penetrant Method B', category: 'Quality & Measurement', description: 'Lipophilic post-emulsifiable PT' },
  { name: 'Solvent Removable Penetrant Method C', category: 'Quality & Measurement', description: 'Solvent removable PT process' },
  { name: 'PT Sensitivity Levels', category: 'Quality & Measurement', description: 'Understanding PT sensitivity levels 1-4' },
  { name: 'PT/MT UV Light Intensity', category: 'Quality & Measurement', description: 'Measuring black light intensity' },

  // ===== NDT/NDE SPECIALTY METHODS (15) =====
  { name: 'Laser Shearography', category: 'Quality & Measurement', description: 'Laser shearography for composite disbonds' },
  { name: 'Active Thermography', category: 'Quality & Measurement', description: 'Flash and lock-in thermography inspection' },
  { name: 'Passive Thermography', category: 'Quality & Measurement', description: 'Passive IR thermography for hot spots' },
  { name: 'Acoustic Emission Testing', category: 'Quality & Measurement', description: 'AE monitoring for crack growth detection' },
  { name: 'Tap Testing', category: 'Quality & Measurement', description: 'Tap test for composite delaminations' },
  { name: 'Resonance Bond Testing', category: 'Quality & Measurement', description: 'Mechanical impedance bond testing' },
  { name: 'Holographic Interferometry', category: 'Quality & Measurement', description: 'Holographic NDT techniques' },
  { name: 'Neutron Radiography', category: 'Quality & Measurement', description: 'Neutron radiography for hydrogen detection' },
  { name: 'Terahertz Imaging', category: 'Quality & Measurement', description: 'THz imaging for composite inspection' },
  { name: 'Microwave NDT', category: 'Quality & Measurement', description: 'Microwave inspection techniques' },
  { name: 'Laser UT - LSAFT', category: 'Quality & Measurement', description: 'Laser-generated ultrasound inspection' },
  { name: 'EMAT Inspection', category: 'Quality & Measurement', description: 'Electromagnetic acoustic transducer testing' },
  { name: 'Ground Penetrating Radar', category: 'Quality & Measurement', description: 'GPR for composite and concrete' },
  { name: 'Digital Image Correlation', category: 'Quality & Measurement', description: 'DIC strain measurement' },
  { name: 'Barkhausen Noise Analysis', category: 'Quality & Measurement', description: 'Magnetic Barkhausen noise testing' },

  // ===== AIRCRAFT HYDRAULIC SYSTEMS (20) =====
  { name: 'Hydraulic System Theory', category: 'Electrical Systems', description: 'Aircraft hydraulic system principles' },
  { name: 'Hydraulic Pump Servicing', category: 'Maintenance & Repair', description: 'Servicing variable displacement pumps' },
  { name: 'Hydraulic Actuator Repair', category: 'Maintenance & Repair', description: 'Overhauling hydraulic actuators' },
  { name: 'Hydraulic Servo Valve Repair', category: 'Maintenance & Repair', description: 'Servicing electrohydraulic servo valves' },
  { name: 'Hydraulic Reservoir Service', category: 'Maintenance & Repair', description: 'Servicing and pressurizing reservoirs' },
  { name: 'Hydraulic Filter Service', category: 'Maintenance & Repair', description: 'Changing and testing hydraulic filters' },
  { name: 'Hydraulic Fluid Analysis', category: 'Quality & Measurement', description: 'Contamination and fluid analysis' },
  { name: 'Hydraulic System Bleeding', category: 'Maintenance & Repair', description: 'Bleeding hydraulic systems' },
  { name: 'Hydraulic Accumulator Service', category: 'Maintenance & Repair', description: 'Servicing and precharging accumulators' },
  { name: 'Hydraulic Line Installation', category: 'Assembly & Electronics', description: 'Installing rigid and flexible hydraulic lines' },
  { name: 'Hydraulic Fitting Torque', category: 'Assembly & Electronics', description: 'Proper torque of hydraulic fittings' },
  { name: 'Hydraulic Pressure Testing', category: 'Quality & Measurement', description: 'Hydraulic pressure and flow testing' },
  { name: 'MIL-PRF-5606 Fluid', category: 'Maintenance & Repair', description: 'Working with MIL-PRF-5606 hydraulic fluid' },
  { name: 'MIL-PRF-83282 Fluid', category: 'Maintenance & Repair', description: 'Working with fire-resistant MIL-PRF-83282' },
  { name: 'Skydrol Fluid Handling', category: 'Maintenance & Repair', description: 'Handling phosphate ester hydraulic fluids' },
  { name: 'Hydraulic Ground Support Equipment', category: 'Maintenance & Repair', description: 'Operating hydraulic mules and test stands' },
  { name: 'Hydraulic System Troubleshooting', category: 'Maintenance & Repair', description: 'Troubleshooting hydraulic malfunctions' },
  { name: 'Hydraulic Component Identification', category: 'Assembly & Electronics', description: 'Identifying hydraulic system components' },
  { name: 'Hydraulic Schematic Reading', category: 'Assembly & Electronics', description: 'Reading hydraulic system schematics' },
  { name: 'Power Transfer Unit Service', category: 'Maintenance & Repair', description: 'Servicing PTUs for system backup' },

  // ===== AIRCRAFT FUEL SYSTEMS (15) =====
  { name: 'Fuel System Theory', category: 'Electrical Systems', description: 'Aircraft fuel system principles' },
  { name: 'Integral Fuel Tank Sealing', category: 'Assembly & Electronics', description: 'Sealing integral wing fuel tanks' },
  { name: 'Bladder Tank Installation', category: 'Assembly & Electronics', description: 'Installing flexible fuel bladders' },
  { name: 'Fuel Pump Testing', category: 'Maintenance & Repair', description: 'Testing boost and transfer pumps' },
  { name: 'Fuel Quantity Indication', category: 'Electrical Systems', description: 'Calibrating fuel quantity systems' },
  { name: 'Fuel Valve Service', category: 'Maintenance & Repair', description: 'Servicing fuel shutoff and transfer valves' },
  { name: 'Fuel Filter Service', category: 'Maintenance & Repair', description: 'Replacing fuel filters and elements' },
  { name: 'Fuel Vent System', category: 'Assembly & Electronics', description: 'Installing fuel vent and surge tanks' },
  { name: 'Refuel/Defuel Procedures', category: 'Maintenance & Repair', description: 'Aircraft refueling and defueling' },
  { name: 'Fuel Leak Detection', category: 'Quality & Measurement', description: 'Detecting and repairing fuel leaks' },
  { name: 'Fuel System Purging', category: 'Maintenance & Repair', description: 'Purging fuel systems with nitrogen' },
  { name: 'Fuel Heater Service', category: 'Maintenance & Repair', description: 'Servicing fuel/oil heat exchangers' },
  { name: 'Single Point Refueling', category: 'Maintenance & Repair', description: 'Single point pressure refueling systems' },
  { name: 'Center of Gravity Fuel System', category: 'Electrical Systems', description: 'CG fuel transfer and trim systems' },
  { name: 'Fuel Jettison System', category: 'Maintenance & Repair', description: 'Fuel dump system operation and test' },

  // ===== AIRCRAFT ELECTRICAL SYSTEMS (25) =====
  { name: 'Aircraft Electrical Theory', category: 'Electrical Systems', description: 'DC and AC aircraft electrical principles' },
  { name: 'Generator Control Unit Testing', category: 'Electrical Systems', description: 'Testing GCU voltage regulation' },
  { name: 'Integrated Drive Generator Service', category: 'Maintenance & Repair', description: 'Servicing constant speed drive units' },
  { name: 'Transformer Rectifier Unit', category: 'Electrical Systems', description: 'Testing TRUs for DC power conversion' },
  { name: 'Aircraft Inverter Testing', category: 'Electrical Systems', description: 'Testing aircraft static inverters' },
  { name: 'External Power Connection', category: 'Electrical Systems', description: 'Connecting ground power units' },
  { name: 'Bus Tie Control', category: 'Electrical Systems', description: 'Testing bus tie and isolation systems' },
  { name: 'Circuit Breaker Testing', category: 'Electrical Systems', description: 'Testing thermal and electronic CBs' },
  { name: 'Aircraft Battery Service', category: 'Maintenance & Repair', description: 'Servicing NiCd and lead acid batteries' },
  { name: 'Emergency Power Systems', category: 'Electrical Systems', description: 'Testing RAT and backup power' },
  { name: 'Wire Harness Fabrication', category: 'Assembly & Electronics', description: 'Building aircraft wire harnesses' },
  { name: 'Wire Crimping and Termination', category: 'Assembly & Electronics', description: 'Crimping terminals per MIL-T-7928' },
  { name: 'MIL-DTL-38999 Connectors', category: 'Assembly & Electronics', description: 'Assembling MIL-38999 connectors' },
  { name: 'D-Sub Connector Assembly', category: 'Assembly & Electronics', description: 'Assembling D-subminiature connectors' },
  { name: 'Coaxial Cable Termination', category: 'Assembly & Electronics', description: 'Terminating RF coaxial connectors' },
  { name: 'Wire Bundle Lacing', category: 'Assembly & Electronics', description: 'Lacing wire bundles per NASM 21024' },
  { name: 'Wire Bundle Clamping', category: 'Assembly & Electronics', description: 'Installing MS clamps and P-clips' },
  { name: 'Conduit Installation', category: 'Assembly & Electronics', description: 'Installing conduit and sleeving' },
  { name: 'EMI/RFI Shielding', category: 'Assembly & Electronics', description: 'Installing EMI shielding and bonding' },
  { name: 'Static Dissipative Bonding', category: 'Assembly & Electronics', description: 'Installing bonding straps and jumpers' },
  { name: 'Wire Continuity Testing', category: 'Quality & Measurement', description: 'Continuity and resistance testing' },
  { name: 'Megger Insulation Testing', category: 'Quality & Measurement', description: 'Megohmmeter insulation resistance' },
  { name: 'Hi-Pot Testing', category: 'Quality & Measurement', description: 'High potential dielectric testing' },
  { name: 'Time Domain Reflectometry', category: 'Quality & Measurement', description: 'TDR cable fault location' },
  { name: 'EWIS Compliance', category: 'Quality & Measurement', description: 'Electrical wiring interconnect systems inspection' },

  // ===== AVIONICS DATA BUSES (15) =====
  { name: 'ARINC 429 Protocol', category: 'Electrical Systems', description: 'ARINC 429 data bus operation' },
  { name: 'ARINC 429 Testing', category: 'Quality & Measurement', description: 'Testing ARINC 429 transmit and receive' },
  { name: 'MIL-STD-1553B Protocol', category: 'Electrical Systems', description: '1553B multiplex data bus operation' },
  { name: 'MIL-STD-1553B Testing', category: 'Quality & Measurement', description: 'Testing 1553 bus controllers and RTs' },
  { name: 'ARINC 664 AFDX', category: 'Electrical Systems', description: 'AFDX switched Ethernet operation' },
  { name: 'CAN Bus Systems', category: 'Electrical Systems', description: 'Controller Area Network systems' },
  { name: 'RS-232/422/485 Interfaces', category: 'Electrical Systems', description: 'Serial data interface testing' },
  { name: 'Ethernet Testing', category: 'Quality & Measurement', description: 'Ethernet connectivity testing' },
  { name: 'Fiber Channel Systems', category: 'Electrical Systems', description: 'Fiber channel data systems' },
  { name: 'ARINC 629 Protocol', category: 'Electrical Systems', description: 'ARINC 629 data bus (B777)' },
  { name: 'ARINC 825 CAN', category: 'Electrical Systems', description: 'ARINC 825 CAN aerospace protocol' },
  { name: 'ARINC 653 RTOS', category: 'Software & Programming', description: 'ARINC 653 real-time operating systems' },
  { name: 'DO-178C Software', category: 'Software & Programming', description: 'DO-178C software development process' },
  { name: 'DO-254 Hardware', category: 'Software & Programming', description: 'DO-254 complex hardware development' },
  { name: 'Data Bus Analyzers', category: 'Quality & Measurement', description: 'Operating bus analyzers and scopes' },

  // ===== COMPOSITE MATERIALS (25) =====
  { name: 'Carbon Fiber Prepreg Layup', category: 'Assembly & Electronics', description: 'Hand layup of carbon/epoxy prepreg' },
  { name: 'Fiberglass Prepreg Layup', category: 'Assembly & Electronics', description: 'Hand layup of glass/epoxy prepreg' },
  { name: 'Kevlar Layup', category: 'Assembly & Electronics', description: 'Aramid fiber composite layup' },
  { name: 'Unidirectional Tape Layup', category: 'Assembly & Electronics', description: 'Unidirectional prepreg tape application' },
  { name: 'Woven Fabric Layup', category: 'Assembly & Electronics', description: 'Woven fabric prepreg layup' },
  { name: 'Ply Cutting - Manual', category: 'Assembly & Electronics', description: 'Manual ply cutting with templates' },
  { name: 'Ply Cutting - Automated', category: 'Assembly & Electronics', description: 'Operating automated ply cutters' },
  { name: 'Ply Compaction', category: 'Assembly & Electronics', description: 'Debulking and compaction techniques' },
  { name: 'Core Material Installation', category: 'Assembly & Electronics', description: 'Installing honeycomb and foam cores' },
  { name: 'Core Splicing', category: 'Assembly & Electronics', description: 'Splicing honeycomb core materials' },
  { name: 'Core Potting', category: 'Assembly & Electronics', description: 'Potting core for edge closeouts' },
  { name: 'Vacuum Bag Fabrication', category: 'Assembly & Electronics', description: 'Building vacuum bag assemblies' },
  { name: 'Breather and Bleeder Materials', category: 'Assembly & Electronics', description: 'Applying release and breather films' },
  { name: 'Autoclave Cure Cycle', category: 'Assembly & Electronics', description: 'Programming autoclave cure cycles' },
  { name: 'Out of Autoclave Curing', category: 'Assembly & Electronics', description: 'OOA prepreg and infusion curing' },
  { name: 'Resin Infusion Processing', category: 'Assembly & Electronics', description: 'VARTM and RTM processing' },
  { name: 'Composite Bonding - Secondary', category: 'Assembly & Electronics', description: 'Secondary adhesive bonding' },
  { name: 'Composite Bonding - Co-Cure', category: 'Assembly & Electronics', description: 'Co-cured bonding techniques' },
  { name: 'Composite Bonding - Co-Bond', category: 'Assembly & Electronics', description: 'Co-bonded assembly methods' },
  { name: 'Scarf Repair', category: 'Maintenance & Repair', description: 'Scarfed composite structural repair' },
  { name: 'Stepped Lap Repair', category: 'Maintenance & Repair', description: 'Stepped lap composite repair' },
  { name: 'Bolted Composite Repair', category: 'Maintenance & Repair', description: 'Bolted doubler composite repair' },
  { name: 'Composite Moisture Removal', category: 'Maintenance & Repair', description: 'Drying moisture from composites' },
  { name: 'Composite Trimming', category: 'Machining', description: 'Routing and trimming composite edges' },
  { name: 'Composite Drilling', category: 'Machining', description: 'Drilling composites without delamination' },

  // ===== FASTENER INSTALLATION (20) =====
  { name: 'Solid Rivet Installation', category: 'Assembly & Electronics', description: 'Installing AN solid rivets' },
  { name: 'Blind Rivet Installation', category: 'Assembly & Electronics', description: 'Installing Cherry and pop rivets' },
  { name: 'Hi-Lok Installation', category: 'Assembly & Electronics', description: 'Installing Hi-Lok interference fit fasteners' },
  { name: 'Hi-Lite Installation', category: 'Assembly & Electronics', description: 'Installing Hi-Lite flush fasteners' },
  { name: 'Lockbolt Installation', category: 'Assembly & Electronics', description: 'Installing Huck and Jo-bolt fasteners' },
  { name: 'Eddie Bolt Installation', category: 'Assembly & Electronics', description: 'Installing Eddie bolt high-strength fasteners' },
  { name: 'Taper-Lok Installation', category: 'Assembly & Electronics', description: 'Installing taper shank fasteners' },
  { name: 'NAS Close Tolerance Bolts', category: 'Assembly & Electronics', description: 'Installing NAS close tolerance bolts' },
  { name: 'Nutplate Installation', category: 'Assembly & Electronics', description: 'Installing floating and fixed nutplates' },
  { name: 'Helicoil Installation', category: 'Assembly & Electronics', description: 'Installing Helicoil thread inserts' },
  { name: 'Keensert Installation', category: 'Assembly & Electronics', description: 'Installing Keensert thread inserts' },
  { name: 'Rivet Hole Preparation', category: 'Machining', description: 'Drilling and reaming rivet holes' },
  { name: 'Countersinking Operations', category: 'Machining', description: 'Countersinking for flush fasteners' },
  { name: 'Interference Fit Installation', category: 'Assembly & Electronics', description: 'Cold working interference fit holes' },
  { name: 'Wet Installation Sealant', category: 'Assembly & Electronics', description: 'Installing fasteners with wet sealant' },
  { name: 'Torque Stripe Application', category: 'Assembly & Electronics', description: 'Applying torque inspection stripes' },
  { name: 'Fastener Identification', category: 'Assembly & Electronics', description: 'Identifying AN, NAS, MS fasteners' },
  { name: 'Rivet Removal', category: 'Maintenance & Repair', description: 'Removing rivets without damage' },
  { name: 'Oversize Fastener Installation', category: 'Maintenance & Repair', description: 'Installing oversize repair fasteners' },
  { name: 'Titanium Fastener Handling', category: 'Assembly & Electronics', description: 'Special handling for titanium fasteners' },

  // ===== SEALANTS AND ADHESIVES (15) =====
  { name: 'Polysulfide Sealants', category: 'Assembly & Electronics', description: 'Applying PR-1422 and similar sealants' },
  { name: 'Polythioether Sealants', category: 'Assembly & Electronics', description: 'Applying permapol sealants' },
  { name: 'Silicone Sealants', category: 'Assembly & Electronics', description: 'Applying RTV silicone sealants' },
  { name: 'Fay Surface Sealing', category: 'Assembly & Electronics', description: 'Faying surface sealant application' },
  { name: 'Fillet Sealant Application', category: 'Assembly & Electronics', description: 'Applying fillet seal beads' },
  { name: 'Injection Sealing', category: 'Assembly & Electronics', description: 'Injection sealing techniques' },
  { name: 'Brush Sealant Application', category: 'Assembly & Electronics', description: 'Brush coating sealant application' },
  { name: 'Sealant Cure Verification', category: 'Quality & Measurement', description: 'Verifying sealant cure' },
  { name: 'Epoxy Adhesive Application', category: 'Assembly & Electronics', description: 'Applying structural epoxy adhesives' },
  { name: 'Film Adhesive Application', category: 'Assembly & Electronics', description: 'Applying supported film adhesives' },
  { name: 'Paste Adhesive Application', category: 'Assembly & Electronics', description: 'Applying paste adhesives' },
  { name: 'Adhesive Surface Preparation', category: 'Assembly & Electronics', description: 'Surface prep for bonding' },
  { name: 'Potting Compound Application', category: 'Assembly & Electronics', description: 'Potting electronic assemblies' },
  { name: 'Threadlocker Application', category: 'Assembly & Electronics', description: 'Applying anaerobic threadlockers' },
  { name: 'Sealant Removal', category: 'Maintenance & Repair', description: 'Removing old sealants safely' },

  // ===== SURFACE TREATMENT PROCESSES (20) =====
  { name: 'Chromic Acid Anodizing', category: 'Assembly & Electronics', description: 'Type I chromic acid anodizing' },
  { name: 'Sulfuric Acid Anodizing', category: 'Assembly & Electronics', description: 'Type II sulfuric acid anodizing' },
  { name: 'Hard Anodizing', category: 'Assembly & Electronics', description: 'Type III hard coat anodizing' },
  { name: 'Phosphoric Acid Anodizing', category: 'Assembly & Electronics', description: 'PAA for adhesive bonding prep' },
  { name: 'Boric Sulfuric Anodizing', category: 'Assembly & Electronics', description: 'BSA non-chromate anodizing' },
  { name: 'Chromate Conversion Coating', category: 'Assembly & Electronics', description: 'Alodine 1200 chromate conversion' },
  { name: 'Non-Chrome Conversion Coating', category: 'Assembly & Electronics', description: 'Alodine 5700 TCP coating' },
  { name: 'Cadmium Plating', category: 'Assembly & Electronics', description: 'LHE cadmium plating process' },
  { name: 'Zinc-Nickel Plating', category: 'Assembly & Electronics', description: 'Zinc-nickel cadmium replacement' },
  { name: 'IVD Aluminum Coating', category: 'Assembly & Electronics', description: 'Ion vapor deposited aluminum' },
  { name: 'Electroless Nickel Plating', category: 'Assembly & Electronics', description: 'Electroless nickel coating' },
  { name: 'Chrome Plating', category: 'Assembly & Electronics', description: 'Hard chrome plating process' },
  { name: 'Silver Plating', category: 'Assembly & Electronics', description: 'Silver plating for conductivity' },
  { name: 'Gold Plating', category: 'Assembly & Electronics', description: 'Gold plating for contacts' },
  { name: 'Passivation of Stainless', category: 'Assembly & Electronics', description: 'Nitric acid passivation' },
  { name: 'Shot Peening', category: 'Assembly & Electronics', description: 'Shot peening per AMS 2430' },
  { name: 'Glass Bead Peening', category: 'Assembly & Electronics', description: 'Glass bead peening process' },
  { name: 'Laser Peening', category: 'Assembly & Electronics', description: 'Laser shock peening' },
  { name: 'Thermal Spray Coatings', category: 'Assembly & Electronics', description: 'HVOF and plasma spray' },
  { name: 'Dry Film Lubricant', category: 'Assembly & Electronics', description: 'PTFE and MoS2 coatings' },

  // ===== AEROSPACE WELDING (15) =====
  { name: 'Aerospace TIG Welding', category: 'Welding & Fabrication', description: 'GTAW welding per AWS D17.1' },
  { name: 'Electron Beam Welding', category: 'Welding & Fabrication', description: 'EB welding of aerospace materials' },
  { name: 'Laser Beam Welding', category: 'Welding & Fabrication', description: 'LBW of aerospace components' },
  { name: 'Plasma Arc Welding', category: 'Welding & Fabrication', description: 'PAW of aerospace materials' },
  { name: 'Resistance Spot Welding', category: 'Welding & Fabrication', description: 'RSW per AWS D17.2' },
  { name: 'Friction Stir Welding', category: 'Welding & Fabrication', description: 'FSW of aluminum structures' },
  { name: 'Brazing', category: 'Welding & Fabrication', description: 'Aerospace brazing processes' },
  { name: 'Titanium Welding', category: 'Welding & Fabrication', description: 'Welding titanium alloys' },
  { name: 'Inconel Welding', category: 'Welding & Fabrication', description: 'Welding nickel superalloys' },
  { name: 'Aluminum Welding', category: 'Welding & Fabrication', description: 'Welding aerospace aluminum alloys' },
  { name: 'Stainless Steel Welding', category: 'Welding & Fabrication', description: 'Welding corrosion resistant steels' },
  { name: 'Weld Inspection Visual', category: 'Quality & Measurement', description: 'Visual weld inspection per AWS' },
  { name: 'Weld Procedure Qualification', category: 'Quality & Measurement', description: 'WPS/PQR development' },
  { name: 'Welder Certification', category: 'Quality & Measurement', description: 'Welder performance qualification' },
  { name: 'Weld Repair Procedures', category: 'Maintenance & Repair', description: 'Aerospace weld repair methods' },

  // ===== ENGINE SYSTEMS (20) =====
  { name: 'Turbofan Engine Theory', category: 'Maintenance & Repair', description: 'High bypass turbofan principles' },
  { name: 'Turboprop Engine Theory', category: 'Maintenance & Repair', description: 'Turboprop engine principles' },
  { name: 'APU Operation', category: 'Maintenance & Repair', description: 'Auxiliary Power Unit operation' },
  { name: 'Engine Start Systems', category: 'Electrical Systems', description: 'Air and electric start systems' },
  { name: 'Engine Ignition Systems', category: 'Electrical Systems', description: 'Igniter and exciter systems' },
  { name: 'Fuel Control Systems', category: 'Electrical Systems', description: 'Hydromechanical and FADEC controls' },
  { name: 'Engine Oil Systems', category: 'Maintenance & Repair', description: 'Lubrication and scavenge systems' },
  { name: 'Engine Bleed Systems', category: 'Maintenance & Repair', description: 'Bleed air extraction systems' },
  { name: 'Thrust Reverser Systems', category: 'Maintenance & Repair', description: 'Cascade and bucket reversers' },
  { name: 'Engine Vibration Monitoring', category: 'Quality & Measurement', description: 'Engine vibration analysis' },
  { name: 'Borescope Inspection', category: 'Quality & Measurement', description: 'Engine borescope techniques' },
  { name: 'Blade Blend Repair', category: 'Maintenance & Repair', description: 'Fan and compressor blade blending' },
  { name: 'Engine Preservation', category: 'Maintenance & Repair', description: 'Engine preservation procedures' },
  { name: 'Engine Quick Engine Change', category: 'Maintenance & Repair', description: 'QEC module replacement' },
  { name: 'Engine Trend Monitoring', category: 'Quality & Measurement', description: 'Engine performance trending' },
  { name: 'Engine Ground Run', category: 'Maintenance & Repair', description: 'Engine ground run procedures' },
  { name: 'Propeller Balancing', category: 'Quality & Measurement', description: 'Propeller dynamic balancing' },
  { name: 'Propeller Inspection', category: 'Quality & Measurement', description: 'Propeller blade inspection' },
  { name: 'Propeller Governor Service', category: 'Maintenance & Repair', description: 'Propeller governor overhaul' },
  { name: 'Engine Inlet/Exhaust Systems', category: 'Maintenance & Repair', description: 'Inlet cowl and exhaust systems' },

  // ===== SPECIFICATIONS AND STANDARDS (30) =====
  { name: 'AMS 2404 Passivation', category: 'Quality & Measurement', description: 'AMS 2404 passivation specification' },
  { name: 'AMS 2430 Shot Peening', category: 'Quality & Measurement', description: 'AMS 2430 shot peening specification' },
  { name: 'AMS 2750 Pyrometry', category: 'Quality & Measurement', description: 'AMS 2750 pyrometry requirements' },
  { name: 'AMS-QQ-A-250 Aluminum', category: 'Quality & Measurement', description: 'Aluminum sheet and plate specs' },
  { name: 'AMS 5510 Stainless Steel', category: 'Quality & Measurement', description: 'CRES sheet specifications' },
  { name: 'MIL-A-8625 Anodizing', category: 'Quality & Measurement', description: 'MIL-A-8625 anodizing specification' },
  { name: 'MIL-PRF-23377 Primer', category: 'Quality & Measurement', description: 'Epoxy primer specification' },
  { name: 'MIL-PRF-85285 Topcoat', category: 'Quality & Measurement', description: 'Polyurethane topcoat spec' },
  { name: 'NAS 410 NDT Personnel', category: 'Quality & Measurement', description: 'NDT personnel certification' },
  { name: 'ASTM E1444 MT', category: 'Quality & Measurement', description: 'Magnetic particle testing standard' },
  { name: 'ASTM E1417 PT', category: 'Quality & Measurement', description: 'Liquid penetrant testing standard' },
  { name: 'ASTM E2375 UT', category: 'Quality & Measurement', description: 'Phased array UT standard' },
  { name: 'ASTM E1032 RT', category: 'Quality & Measurement', description: 'Radiographic testing standard' },
  { name: 'ASTM E376 Coating Thickness', category: 'Quality & Measurement', description: 'Coating thickness measurement' },
  { name: 'AS9100 Quality System', category: 'Quality & Measurement', description: 'Aerospace quality management' },
  { name: 'AS9102 First Article', category: 'Quality & Measurement', description: 'First article inspection req' },
  { name: 'AS9103 Variation Management', category: 'Quality & Measurement', description: 'Characteristic accountability' },
  { name: 'AS9110 MRO Requirements', category: 'Quality & Measurement', description: 'MRO quality requirements' },
  { name: 'AS9120 Distributor QMS', category: 'Quality & Measurement', description: 'Distributor quality system' },
  { name: 'Nadcap AC7004 Welding', category: 'Quality & Measurement', description: 'Nadcap welding checklist' },
  { name: 'Nadcap AC7108 NDT', category: 'Quality & Measurement', description: 'Nadcap NDT requirements' },
  { name: 'Nadcap AC7109 Coatings', category: 'Quality & Measurement', description: 'Nadcap coatings requirements' },
  { name: 'Nadcap AC7110 Heat Treat', category: 'Quality & Measurement', description: 'Nadcap heat treat requirements' },
  { name: 'Nadcap AC7114 Chemical Processing', category: 'Quality & Measurement', description: 'Nadcap chemical processing' },
  { name: 'Nadcap AC7118 Composites', category: 'Quality & Measurement', description: 'Nadcap composites requirements' },
  { name: 'FAA 14 CFR Part 21', category: 'Quality & Measurement', description: 'Production certification requirements' },
  { name: 'FAA 14 CFR Part 43', category: 'Quality & Measurement', description: 'Maintenance requirements' },
  { name: 'FAA 14 CFR Part 145', category: 'Quality & Measurement', description: 'Repair station requirements' },
  { name: 'EASA Part 21', category: 'Quality & Measurement', description: 'EASA production organization' },
  { name: 'EASA Part 145', category: 'Quality & Measurement', description: 'EASA maintenance organization' },

  // ===== AIRCRAFT DOCUMENTATION (15) =====
  { name: 'AMM Interpretation', category: 'Quality & Measurement', description: 'Aircraft Maintenance Manual use' },
  { name: 'IPC Interpretation', category: 'Quality & Measurement', description: 'Illustrated Parts Catalog use' },
  { name: 'SRM Interpretation', category: 'Quality & Measurement', description: 'Structural Repair Manual use' },
  { name: 'CMM Interpretation', category: 'Quality & Measurement', description: 'Component Maintenance Manual' },
  { name: 'WDM/SDS Usage', category: 'Quality & Measurement', description: 'Wiring diagram manual' },
  { name: 'TSM Usage', category: 'Quality & Measurement', description: 'Troubleshooting manual use' },
  { name: 'Service Bulletin Review', category: 'Quality & Measurement', description: 'Interpreting service bulletins' },
  { name: 'AD Compliance', category: 'Quality & Measurement', description: 'Airworthiness directive compliance' },
  { name: 'Engineering Order Processing', category: 'Quality & Measurement', description: 'Processing engineering orders' },
  { name: 'Non-Conformance Reporting', category: 'Quality & Measurement', description: 'NCR documentation' },
  { name: 'MRB Disposition', category: 'Quality & Measurement', description: 'Material Review Board process' },
  { name: 'Work Order Documentation', category: 'Quality & Measurement', description: 'Completing work packages' },
  { name: 'Traceability Documentation', category: 'Quality & Measurement', description: 'Material traceability records' },
  { name: 'Certification Documentation', category: 'Quality & Measurement', description: 'Conformity and 8130 tags' },
  { name: 'S1000D Technical Publications', category: 'Quality & Measurement', description: 'S1000D data module creation' },

  // ===== AEROSPACE SOFTWARE AND TOOLS (20) =====
  { name: 'CATIA V5 Aerospace', category: 'Software & Programming', description: 'CATIA V5 for aerospace design' },
  { name: 'ENOVIA PLM', category: 'Software & Programming', description: 'ENOVIA product lifecycle management' },
  { name: 'Teamcenter', category: 'Software & Programming', description: 'Siemens Teamcenter PLM' },
  { name: 'SAP ERP Aerospace', category: 'Software & Programming', description: 'SAP for aerospace manufacturing' },
  { name: 'Isight DOE', category: 'Software & Programming', description: 'Design of experiments optimization' },
  { name: 'DOORS Requirements', category: 'Software & Programming', description: 'IBM DOORS requirements management' },
  { name: 'NASTRAN FEA', category: 'Software & Programming', description: 'MSC NASTRAN finite element analysis' },
  { name: 'ABAQUS FEA', category: 'Software & Programming', description: 'ABAQUS structural analysis' },
  { name: 'HyperMesh', category: 'Software & Programming', description: 'Altair HyperMesh preprocessing' },
  { name: 'Patran', category: 'Software & Programming', description: 'MSC Patran pre/post processing' },
  { name: 'Fibersim', category: 'Software & Programming', description: 'Fibersim composite design' },
  { name: 'Vericut Composite', category: 'Software & Programming', description: 'Vericut AFP/ATL simulation' },
  { name: 'CIMStation', category: 'Software & Programming', description: 'AFP/ATL programming software' },
  { name: 'Tecnomatix', category: 'Software & Programming', description: 'Digital manufacturing planning' },
  { name: 'Delmia', category: 'Software & Programming', description: 'Digital manufacturing simulation' },
  { name: 'NDT Ultrasonic Software', category: 'Software & Programming', description: 'TomoView, UltraVision' },
  { name: 'NDT ET Software', category: 'Software & Programming', description: 'Eddy current analysis software' },
  { name: 'SAE Mobilus', category: 'Software & Programming', description: 'SAE standards access platform' },
  { name: 'IHS ESDU', category: 'Software & Programming', description: 'Engineering sciences data' },
  { name: 'ARINC Specification Access', category: 'Software & Programming', description: 'ARINC standards database' },

  // ===== ADDITIONAL AIRCRAFT SYSTEMS (40) =====
  { name: 'Landing Gear Retraction Test', category: 'Maintenance & Repair', description: 'Testing gear swing operations' },
  { name: 'Landing Gear Strut Servicing', category: 'Maintenance & Repair', description: 'Servicing oleo struts' },
  { name: 'Landing Gear Door Rigging', category: 'Maintenance & Repair', description: 'Adjusting gear door sequence' },
  { name: 'Wheel and Tire Service', category: 'Maintenance & Repair', description: 'Aircraft tire mounting and balancing' },
  { name: 'Brake Wear Measurement', category: 'Quality & Measurement', description: 'Measuring brake wear indicators' },
  { name: 'Anti-Skid System Testing', category: 'Quality & Measurement', description: 'Testing anti-skid systems' },
  { name: 'Autobrake System Testing', category: 'Quality & Measurement', description: 'Testing autobrake modes' },
  { name: 'Nose Wheel Steering Test', category: 'Quality & Measurement', description: 'Testing steering systems' },
  { name: 'Towing and Taxiing', category: 'Maintenance & Repair', description: 'Aircraft ground handling' },
  { name: 'Jacking Aircraft', category: 'Maintenance & Repair', description: 'Aircraft jacking procedures' },
  { name: 'Leveling Aircraft', category: 'Quality & Measurement', description: 'Aircraft leveling for measurements' },
  { name: 'Weighing Aircraft', category: 'Quality & Measurement', description: 'Aircraft weight and balance' },
  { name: 'Flight Control Rigging', category: 'Maintenance & Repair', description: 'Primary flight control rigging' },
  { name: 'Aileron Rigging', category: 'Maintenance & Repair', description: 'Aileron cable and rod rigging' },
  { name: 'Elevator Rigging', category: 'Maintenance & Repair', description: 'Elevator travel adjustment' },
  { name: 'Rudder Rigging', category: 'Maintenance & Repair', description: 'Rudder control rigging' },
  { name: 'Flap Rigging', category: 'Maintenance & Repair', description: 'Trailing edge flap rigging' },
  { name: 'Slat Rigging', category: 'Maintenance & Repair', description: 'Leading edge slat rigging' },
  { name: 'Spoiler Rigging', category: 'Maintenance & Repair', description: 'Spoiler and speedbrake rigging' },
  { name: 'Trim Tab Rigging', category: 'Maintenance & Repair', description: 'Trim tab adjustment' },
  { name: 'Stabilizer Trim Rigging', category: 'Maintenance & Repair', description: 'Horizontal stabilizer trim' },
  { name: 'Fly-By-Wire Systems', category: 'Electrical Systems', description: 'FBW architecture and testing' },
  { name: 'PFCS Testing', category: 'Quality & Measurement', description: 'Primary flight control system test' },
  { name: 'Stall Warning Testing', category: 'Quality & Measurement', description: 'Angle of attack system testing' },
  { name: 'Yaw Damper Testing', category: 'Quality & Measurement', description: 'Yaw damper function test' },
  { name: 'Stick Pusher System', category: 'Electrical Systems', description: 'Stick pusher function test' },
  { name: 'Mach Trim System', category: 'Electrical Systems', description: 'Mach trim compensator test' },
  { name: 'Speed Brake Control', category: 'Maintenance & Repair', description: 'Speed brake system service' },
  { name: 'Ground Spoiler System', category: 'Maintenance & Repair', description: 'Ground spoiler logic test' },
  { name: 'Gust Lock System', category: 'Maintenance & Repair', description: 'Control lock system service' },
  { name: 'ECS Pack Operation', category: 'Maintenance & Repair', description: 'Air conditioning pack service' },
  { name: 'Pressurization Control', category: 'Electrical Systems', description: 'Cabin pressure controller test' },
  { name: 'Outflow Valve Service', category: 'Maintenance & Repair', description: 'Outflow valve adjustment' },
  { name: 'Safety Valve Testing', category: 'Quality & Measurement', description: 'Pressure relief valve test' },
  { name: 'Cabin Altitude Warning', category: 'Quality & Measurement', description: 'Cabin altitude warning test' },
  { name: 'Bleed Air Leak Detection', category: 'Quality & Measurement', description: 'Duct leak detection test' },
  { name: 'Temperature Control Test', category: 'Quality & Measurement', description: 'Zone temperature control test' },
  { name: 'Ram Air System', category: 'Maintenance & Repair', description: 'Ram air inlet service' },
  { name: 'Recirculation Fan Service', category: 'Maintenance & Repair', description: 'Recirculation fan replacement' },
  { name: 'HEPA Filter Replacement', category: 'Maintenance & Repair', description: 'Cabin air filter service' },

  // ===== AVIONICS NAVIGATION SYSTEMS (30) =====
  { name: 'IRS Alignment', category: 'Electrical Systems', description: 'Inertial reference system alignment' },
  { name: 'IRS BITE Test', category: 'Quality & Measurement', description: 'IRS built-in test equipment' },
  { name: 'GPS Receiver Installation', category: 'Assembly & Electronics', description: 'GPS antenna and receiver install' },
  { name: 'GPS RAIM Monitoring', category: 'Electrical Systems', description: 'GPS integrity monitoring' },
  { name: 'SBAS/WAAS Operations', category: 'Electrical Systems', description: 'Satellite augmentation systems' },
  { name: 'DME Testing', category: 'Quality & Measurement', description: 'Distance measuring equipment test' },
  { name: 'VOR Testing', category: 'Quality & Measurement', description: 'VOR receiver testing' },
  { name: 'ILS Receiver Testing', category: 'Quality & Measurement', description: 'ILS localizer and glideslope' },
  { name: 'Marker Beacon Testing', category: 'Quality & Measurement', description: 'Marker beacon receiver test' },
  { name: 'ADF Testing', category: 'Quality & Measurement', description: 'Automatic direction finder test' },
  { name: 'Radio Altimeter Calibration', category: 'Quality & Measurement', description: 'RA height calibration' },
  { name: 'TAWS/GPWS Testing', category: 'Quality & Measurement', description: 'Terrain awareness system test' },
  { name: 'TCAS Resolution Advisory', category: 'Quality & Measurement', description: 'TCAS RA testing' },
  { name: 'ADS-B Out Testing', category: 'Quality & Measurement', description: 'ADS-B transmitter verification' },
  { name: 'ADS-B In Testing', category: 'Quality & Measurement', description: 'ADS-B receiver verification' },
  { name: 'Transponder Testing', category: 'Quality & Measurement', description: 'Mode S transponder test' },
  { name: 'VHF Com Testing', category: 'Quality & Measurement', description: 'VHF transceiver testing' },
  { name: 'HF Com Testing', category: 'Quality & Measurement', description: 'HF transceiver testing' },
  { name: 'SATCOM Testing', category: 'Quality & Measurement', description: 'Satellite communication test' },
  { name: 'SELCAL Testing', category: 'Quality & Measurement', description: 'Selective calling test' },
  { name: 'CVR Download', category: 'Quality & Measurement', description: 'Cockpit voice recorder service' },
  { name: 'FDR Download', category: 'Quality & Measurement', description: 'Flight data recorder service' },
  { name: 'DFDR Calibration', category: 'Quality & Measurement', description: 'Digital FDR parameter setup' },
  { name: 'ELT Testing', category: 'Quality & Measurement', description: 'Emergency locator test' },
  { name: 'Weather Radar Calibration', category: 'Quality & Measurement', description: 'WX radar tilt calibration' },
  { name: 'Windshear Detection', category: 'Electrical Systems', description: 'Predictive windshear system' },
  { name: 'Radio Management Panel', category: 'Assembly & Electronics', description: 'RMP installation and test' },
  { name: 'Audio Control Panel', category: 'Assembly & Electronics', description: 'ACP installation and test' },
  { name: 'Interphone System', category: 'Assembly & Electronics', description: 'Flight and cabin interphone' },
  { name: 'PA System Testing', category: 'Quality & Measurement', description: 'Passenger address system test' },

  // ===== AIRCRAFT MATERIALS (30) =====
  { name: 'Aluminum 2024-T3', category: 'Assembly & Electronics', description: 'Working with 2024-T3 alloy' },
  { name: 'Aluminum 7075-T6', category: 'Assembly & Electronics', description: 'Working with 7075-T6 alloy' },
  { name: 'Aluminum-Lithium Alloys', category: 'Assembly & Electronics', description: 'Handling Al-Li materials' },
  { name: 'Titanium 6Al-4V', category: 'Assembly & Electronics', description: 'Working with Ti-6Al-4V' },
  { name: 'Titanium 6Al-2Sn-4Zr-2Mo', category: 'Assembly & Electronics', description: 'Working with Ti-6242' },
  { name: 'Inconel 718', category: 'Assembly & Electronics', description: 'Working with Inconel 718' },
  { name: 'Inconel 625', category: 'Assembly & Electronics', description: 'Working with Inconel 625' },
  { name: 'Waspaloy', category: 'Assembly & Electronics', description: 'Working with Waspaloy' },
  { name: 'Hastelloy X', category: 'Assembly & Electronics', description: 'Working with Hastelloy X' },
  { name: 'Rene 41', category: 'Assembly & Electronics', description: 'Working with Rene 41' },
  { name: 'Stainless 17-4PH', category: 'Assembly & Electronics', description: 'Working with 17-4PH CRES' },
  { name: 'Stainless 15-5PH', category: 'Assembly & Electronics', description: 'Working with 15-5PH CRES' },
  { name: 'Stainless 321', category: 'Assembly & Electronics', description: 'Working with 321 CRES' },
  { name: 'Stainless 347', category: 'Assembly & Electronics', description: 'Working with 347 CRES' },
  { name: 'Maraging Steel', category: 'Assembly & Electronics', description: 'Working with 18Ni maraging' },
  { name: '4340 Steel', category: 'Assembly & Electronics', description: 'Working with 4340 alloy steel' },
  { name: '300M Steel', category: 'Assembly & Electronics', description: 'Working with 300M high-strength' },
  { name: 'CFRP T700', category: 'Assembly & Electronics', description: 'Working with Toray T700 carbon' },
  { name: 'CFRP T800', category: 'Assembly & Electronics', description: 'Working with T800 intermediate modulus' },
  { name: 'CFRP M40', category: 'Assembly & Electronics', description: 'Working with M40 high modulus' },
  { name: 'Cycom 5320', category: 'Assembly & Electronics', description: 'Working with Cycom 5320 prepreg' },
  { name: 'HexPly 8552', category: 'Assembly & Electronics', description: 'Working with HexPly 8552 prepreg' },
  { name: 'FM 300 Adhesive', category: 'Assembly & Electronics', description: 'Working with FM 300 film adhesive' },
  { name: 'FM 94 Adhesive', category: 'Assembly & Electronics', description: 'Working with FM 94 film adhesive' },
  { name: 'Redux 319', category: 'Assembly & Electronics', description: 'Working with Redux 319 adhesive' },
  { name: 'Nomex Honeycomb', category: 'Assembly & Electronics', description: 'Working with Nomex core' },
  { name: 'Aluminum Honeycomb', category: 'Assembly & Electronics', description: 'Working with Al honeycomb' },
  { name: 'Rohacell Foam Core', category: 'Assembly & Electronics', description: 'Working with Rohacell PMI' },
  { name: 'Syntactic Foam', category: 'Assembly & Electronics', description: 'Working with syntactic foam' },
  { name: 'Fiberglass S-2', category: 'Assembly & Electronics', description: 'Working with S-2 glass fiber' },

  // ===== HEAT TREATMENT AND PROCESSING (25) =====
  { name: 'Solution Heat Treatment', category: 'Assembly & Electronics', description: 'Solution treating aluminum' },
  { name: 'Precipitation Hardening', category: 'Assembly & Electronics', description: 'Age hardening aluminum alloys' },
  { name: 'Annealing Aluminum', category: 'Assembly & Electronics', description: 'Softening aluminum for forming' },
  { name: 'Stress Relief Heat Treat', category: 'Assembly & Electronics', description: 'Stress relieving metals' },
  { name: 'Normalizing Steel', category: 'Assembly & Electronics', description: 'Normalizing heat treatment' },
  { name: 'Quench and Temper Steel', category: 'Assembly & Electronics', description: 'Hardening steel' },
  { name: 'Carburizing', category: 'Assembly & Electronics', description: 'Case hardening by carburizing' },
  { name: 'Nitriding', category: 'Assembly & Electronics', description: 'Surface hardening by nitriding' },
  { name: 'Induction Hardening', category: 'Assembly & Electronics', description: 'Induction surface hardening' },
  { name: 'Vacuum Heat Treatment', category: 'Assembly & Electronics', description: 'Vacuum furnace processing' },
  { name: 'Protective Atmosphere', category: 'Assembly & Electronics', description: 'Controlled atmosphere HT' },
  { name: 'Cryogenic Treatment', category: 'Assembly & Electronics', description: 'Deep cryogenic processing' },
  { name: 'Hot Isostatic Pressing', category: 'Assembly & Electronics', description: 'HIP densification' },
  { name: 'Thermocouple Calibration', category: 'Quality & Measurement', description: 'TC calibration per AMS 2750' },
  { name: 'System Accuracy Testing', category: 'Quality & Measurement', description: 'SAT per AMS 2750' },
  { name: 'Temperature Uniformity Survey', category: 'Quality & Measurement', description: 'TUS per AMS 2750' },
  { name: 'Hardness Testing Rockwell', category: 'Quality & Measurement', description: 'Rockwell hardness testing' },
  { name: 'Hardness Testing Brinell', category: 'Quality & Measurement', description: 'Brinell hardness testing' },
  { name: 'Microhardness Testing', category: 'Quality & Measurement', description: 'Vickers and Knoop testing' },
  { name: 'Conductivity Testing IACS', category: 'Quality & Measurement', description: 'Electrical conductivity IACS' },
  { name: 'Metallographic Examination', category: 'Quality & Measurement', description: 'Metallography and microstructure' },
  { name: 'Grain Size Determination', category: 'Quality & Measurement', description: 'ASTM E112 grain size' },
  { name: 'Inclusion Rating', category: 'Quality & Measurement', description: 'ASTM E45 inclusion rating' },
  { name: 'Tensile Testing', category: 'Quality & Measurement', description: 'ASTM E8 tensile testing' },
  { name: 'Fatigue Testing', category: 'Quality & Measurement', description: 'Rotating beam fatigue test' },

  // ===== SPECIAL PROCESSES (30) =====
  { name: 'Chemical Milling', category: 'Machining', description: 'Chemical etching of metals' },
  { name: 'Electrochemical Machining', category: 'Machining', description: 'ECM material removal' },
  { name: 'Abrasive Waterjet Cutting', category: 'Machining', description: 'AWJ cutting of metals' },
  { name: 'Laser Cutting Metals', category: 'Machining', description: 'Laser cutting aluminum and steel' },
  { name: 'Plasma Cutting', category: 'Machining', description: 'Plasma arc cutting metals' },
  { name: 'Wire EDM', category: 'Machining', description: 'Wire electrical discharge machining' },
  { name: 'Sinker EDM', category: 'Machining', description: 'Ram/sinker EDM' },
  { name: 'Electrochemical Grinding', category: 'Machining', description: 'ECG finishing' },
  { name: 'Creep Feed Grinding', category: 'Machining', description: 'Creep feed abrasive grinding' },
  { name: 'HEDG Grinding', category: 'Machining', description: 'High efficiency deep grinding' },
  { name: 'Superabrasive Machining', category: 'Machining', description: 'CBN and diamond grinding' },
  { name: 'Electropolishing', category: 'Assembly & Electronics', description: 'Electrolytic polishing' },
  { name: 'Vibratory Finishing', category: 'Assembly & Electronics', description: 'Mass finishing deburring' },
  { name: 'Barrel Tumbling', category: 'Assembly & Electronics', description: 'Tumble deburring' },
  { name: 'Thermal Deburring', category: 'Assembly & Electronics', description: 'TEM explosive deburring' },
  { name: 'Cryogenic Deburring', category: 'Assembly & Electronics', description: 'Cryo tumble deburring' },
  { name: 'Magnetic Deburring', category: 'Assembly & Electronics', description: 'Magnetic abrasive finishing' },
  { name: 'AFM Deburring', category: 'Assembly & Electronics', description: 'Abrasive flow machining' },
  { name: 'Superfinishing', category: 'Machining', description: 'Microfinishing and superfinishing' },
  { name: 'Burnishing', category: 'Machining', description: 'Roller and ball burnishing' },
  { name: 'Cold Expansion', category: 'Assembly & Electronics', description: 'Split sleeve cold expansion' },
  { name: 'Interference Fit Bushings', category: 'Assembly & Electronics', description: 'Installing interference bushings' },
  { name: 'Shrink Fitting', category: 'Assembly & Electronics', description: 'Thermal shrink fit assembly' },
  { name: 'Press Fitting', category: 'Assembly & Electronics', description: 'Press fit bearing installation' },
  { name: 'Swaging', category: 'Assembly & Electronics', description: 'Tube and wire swaging' },
  { name: 'Flaring Tubes', category: 'Assembly & Electronics', description: 'Tube flaring per MS33584' },
  { name: 'Beading Tubes', category: 'Assembly & Electronics', description: 'Tube beading operations' },
  { name: 'Tube Welding', category: 'Welding & Fabrication', description: 'Orbital tube welding' },
  { name: 'Bellows Forming', category: 'Assembly & Electronics', description: 'Metal bellows fabrication' },
  { name: 'Hydroforming', category: 'Assembly & Electronics', description: 'Tube and sheet hydroforming' },

  // ===== SPACE SYSTEMS SPECIFIC (40) =====
  { name: 'Spacecraft Contamination Control', category: 'Quality & Measurement', description: 'Particulate and molecular contamination' },
  { name: 'Spacecraft ESD Control', category: 'Quality & Measurement', description: 'Electrostatic discharge protection' },
  { name: 'Thermal Vacuum Testing', category: 'Quality & Measurement', description: 'TVAC chamber testing' },
  { name: 'Vibration Testing', category: 'Quality & Measurement', description: 'Sine and random vibration test' },
  { name: 'Acoustic Testing', category: 'Quality & Measurement', description: 'Acoustic noise testing' },
  { name: 'Shock Testing', category: 'Quality & Measurement', description: 'Pyrotechnic shock testing' },
  { name: 'Mass Properties', category: 'Quality & Measurement', description: 'CG and MOI measurement' },
  { name: 'Deployment Testing', category: 'Quality & Measurement', description: 'Solar array and antenna deploy' },
  { name: 'EMI/EMC Testing', category: 'Quality & Measurement', description: 'Electromagnetic compatibility' },
  { name: 'MLI Installation', category: 'Assembly & Electronics', description: 'Multi-layer insulation blankets' },
  { name: 'Thermal Control Surfaces', category: 'Assembly & Electronics', description: 'OSR and thermal coatings' },
  { name: 'Heat Pipe Installation', category: 'Assembly & Electronics', description: 'Heat pipe thermal control' },
  { name: 'Spacecraft Harness', category: 'Assembly & Electronics', description: 'Space-rated wire harness' },
  { name: 'Reaction Wheel Install', category: 'Assembly & Electronics', description: 'Momentum wheel installation' },
  { name: 'Star Tracker Install', category: 'Assembly & Electronics', description: 'Star tracker alignment' },
  { name: 'Sun Sensor Install', category: 'Assembly & Electronics', description: 'Sun sensor installation' },
  { name: 'Earth Sensor Install', category: 'Assembly & Electronics', description: 'Horizon sensor installation' },
  { name: 'Thruster Installation', category: 'Assembly & Electronics', description: 'RCS thruster installation' },
  { name: 'Propellant Tank Install', category: 'Assembly & Electronics', description: 'Propellant tank mounting' },
  { name: 'Pressurant System', category: 'Assembly & Electronics', description: 'Pressurant system installation' },
  { name: 'Fill and Drain Valves', category: 'Assembly & Electronics', description: 'Propellant F&D valve install' },
  { name: 'Pyrotechnic Devices', category: 'Assembly & Electronics', description: 'Separation and deployment pyros' },
  { name: 'Separation Systems', category: 'Assembly & Electronics', description: 'Stage separation mechanisms' },
  { name: 'Antenna Deployment', category: 'Assembly & Electronics', description: 'Deployable antenna mechanisms' },
  { name: 'Solar Array Hinge', category: 'Assembly & Electronics', description: 'SADA and hinge installation' },
  { name: 'Spacecraft Bonding', category: 'Assembly & Electronics', description: 'Electrical bonding requirements' },
  { name: 'RF Payload Testing', category: 'Quality & Measurement', description: 'Communications payload test' },
  { name: 'Optical Payload Testing', category: 'Quality & Measurement', description: 'Imaging payload testing' },
  { name: 'Spacecraft Alignment', category: 'Quality & Measurement', description: 'Optical alignment procedures' },
  { name: 'Laser Tracker Metrology', category: 'Quality & Measurement', description: 'Laser tracker measurements' },
  { name: 'Theodolite Measurements', category: 'Quality & Measurement', description: 'Optical tooling measurements' },
  { name: 'Autocollimator Usage', category: 'Quality & Measurement', description: 'Angular measurement' },
  { name: 'Spacecraft Flight Software', category: 'Software & Programming', description: 'FSW loading and testing' },
  { name: 'Telemetry Processing', category: 'Software & Programming', description: 'TM data processing' },
  { name: 'Command Verification', category: 'Quality & Measurement', description: 'Spacecraft commanding' },
  { name: 'Functional Test Procedure', category: 'Quality & Measurement', description: 'FTP execution' },
  { name: 'Comprehensive Performance Test', category: 'Quality & Measurement', description: 'CPT spacecraft testing' },
  { name: 'Launch Site Operations', category: 'Assembly & Electronics', description: 'Launch campaign activities' },
  { name: 'Propellant Loading', category: 'Assembly & Electronics', description: 'Hydrazine and oxidizer loading' },
  { name: 'EGSE Operation', category: 'Quality & Measurement', description: 'Electrical ground support equipment' },

  // ===== DEFENSE SYSTEMS SPECIFIC (30) =====
  { name: 'Radar Cross Section', category: 'Quality & Measurement', description: 'RCS measurement and testing' },
  { name: 'Low Observable Materials', category: 'Assembly & Electronics', description: 'RAM and LO coatings' },
  { name: 'Signature Management', category: 'Assembly & Electronics', description: 'IR and RF signature reduction' },
  { name: 'EW System Integration', category: 'Assembly & Electronics', description: 'Electronic warfare integration' },
  { name: 'Radar Warning Receiver', category: 'Assembly & Electronics', description: 'RWR installation and test' },
  { name: 'Jammer Installation', category: 'Assembly & Electronics', description: 'ECM jammer installation' },
  { name: 'Chaff Dispenser Install', category: 'Assembly & Electronics', description: 'Chaff system installation' },
  { name: 'Flare Dispenser Install', category: 'Assembly & Electronics', description: 'IR flare system installation' },
  { name: 'Towed Decoy System', category: 'Assembly & Electronics', description: 'Fiber optic towed decoy' },
  { name: 'DIRCM Installation', category: 'Assembly & Electronics', description: 'Directed IR countermeasures' },
  { name: 'Helmet Mounted Display', category: 'Assembly & Electronics', description: 'HMD installation and test' },
  { name: 'Night Vision Goggles', category: 'Assembly & Electronics', description: 'NVG compatibility testing' },
  { name: 'Targeting Pod Install', category: 'Assembly & Electronics', description: 'LANTIRN, Sniper, Litening' },
  { name: 'Weapons Bay Integration', category: 'Assembly & Electronics', description: 'Internal weapons bay systems' },
  { name: 'External Stores', category: 'Assembly & Electronics', description: 'Pylon and stores integration' },
  { name: 'Ejector Rack Systems', category: 'Assembly & Electronics', description: 'BRU ejector rack install' },
  { name: 'Multiple Ejector Rack', category: 'Assembly & Electronics', description: 'MER installation' },
  { name: 'Missile Launcher Rail', category: 'Assembly & Electronics', description: 'Missile rail installation' },
  { name: 'Gun System Harmonization', category: 'Quality & Measurement', description: 'Gun boresighting' },
  { name: 'Ammunition Feed System', category: 'Maintenance & Repair', description: 'Ammo feed maintenance' },
  { name: 'Aerial Refueling System', category: 'Maintenance & Repair', description: 'Air refueling systems' },
  { name: 'Probe and Drogue', category: 'Maintenance & Repair', description: 'Refueling probe service' },
  { name: 'Boom Receptacle', category: 'Maintenance & Repair', description: 'Refueling receptacle service' },
  { name: 'IFF Transponder', category: 'Assembly & Electronics', description: 'IFF system installation' },
  { name: 'Crypto Equipment', category: 'Assembly & Electronics', description: 'Cryptographic system install' },
  { name: 'COMSEC Installation', category: 'Assembly & Electronics', description: 'Communications security' },
  { name: 'Data Link Systems', category: 'Assembly & Electronics', description: 'Link 16, MADL installation' },
  { name: 'Sensor Fusion', category: 'Electrical Systems', description: 'Multi-sensor fusion systems' },
  { name: 'Situational Awareness', category: 'Electrical Systems', description: 'SA display systems' },
  { name: 'Mission Planning Systems', category: 'Software & Programming', description: 'Mission planning software' },

  // ===== ROTORCRAFT SPECIFIC (25) =====
  { name: 'Main Rotor System', category: 'Maintenance & Repair', description: 'Main rotor head service' },
  { name: 'Tail Rotor System', category: 'Maintenance & Repair', description: 'Tail rotor service' },
  { name: 'Rotor Blade Tracking', category: 'Quality & Measurement', description: 'Track and balance' },
  { name: 'Rotor Blade Inspection', category: 'Quality & Measurement', description: 'Blade damage inspection' },
  { name: 'Rotor Hub Inspection', category: 'Quality & Measurement', description: 'Hub component inspection' },
  { name: 'Swashplate Service', category: 'Maintenance & Repair', description: 'Swashplate bearing service' },
  { name: 'Main Transmission', category: 'Maintenance & Repair', description: 'Main gearbox service' },
  { name: 'Tail Rotor Gearbox', category: 'Maintenance & Repair', description: 'TGB service' },
  { name: 'Intermediate Gearbox', category: 'Maintenance & Repair', description: 'IGB service' },
  { name: 'Transmission Oil Analysis', category: 'Quality & Measurement', description: 'SOAP analysis' },
  { name: 'Freewheeling Unit', category: 'Maintenance & Repair', description: 'Overrunning clutch service' },
  { name: 'Drive Shaft Inspection', category: 'Quality & Measurement', description: 'Drive shaft balance check' },
  { name: 'Hanger Bearing Service', category: 'Maintenance & Repair', description: 'Drive shaft bearing service' },
  { name: 'Flight Control Mixing', category: 'Maintenance & Repair', description: 'Mixing unit adjustment' },
  { name: 'Collective Control', category: 'Maintenance & Repair', description: 'Collective rigging' },
  { name: 'Cyclic Control', category: 'Maintenance & Repair', description: 'Cyclic rigging' },
  { name: 'Anti-Torque Control', category: 'Maintenance & Repair', description: 'Pedal rigging' },
  { name: 'SAS/AFCS Testing', category: 'Quality & Measurement', description: 'Stability augmentation test' },
  { name: 'Vibration Analysis Helo', category: 'Quality & Measurement', description: 'Helicopter vibration analysis' },
  { name: 'Ground Resonance Test', category: 'Quality & Measurement', description: 'Ground resonance check' },
  { name: 'Autorotation Testing', category: 'Quality & Measurement', description: 'Autorotation system check' },
  { name: 'External Load Systems', category: 'Assembly & Electronics', description: 'Cargo hook installation' },
  { name: 'Hoist Systems', category: 'Assembly & Electronics', description: 'Rescue hoist installation' },
  { name: 'FLIR Turret Install', category: 'Assembly & Electronics', description: 'EO/IR turret installation' },
  { name: 'Wire Strike Protection', category: 'Assembly & Electronics', description: 'Wire strike system install' },

  // ===== UNMANNED SYSTEMS (20) =====
  { name: 'UAV Assembly', category: 'Assembly & Electronics', description: 'Unmanned aircraft assembly' },
  { name: 'UAV Propulsion', category: 'Maintenance & Repair', description: 'UAV engine/motor service' },
  { name: 'UAV Avionics', category: 'Assembly & Electronics', description: 'UAV avionic systems' },
  { name: 'UAV Payload Integration', category: 'Assembly & Electronics', description: 'Sensor payload install' },
  { name: 'UAV Data Link', category: 'Electrical Systems', description: 'Line of sight data link' },
  { name: 'UAV SATCOM', category: 'Electrical Systems', description: 'BLOS satellite link' },
  { name: 'Ground Control Station', category: 'Electrical Systems', description: 'GCS operation and test' },
  { name: 'UAV Launch Recovery', category: 'Maintenance & Repair', description: 'Catapult and recovery systems' },
  { name: 'UAV Navigation', category: 'Electrical Systems', description: 'GPS and INS navigation' },
  { name: 'UAV Autopilot', category: 'Electrical Systems', description: 'Flight control computer' },
  { name: 'UAV EO/IR Payload', category: 'Assembly & Electronics', description: 'Camera gimbal system' },
  { name: 'UAV Radar Payload', category: 'Assembly & Electronics', description: 'SAR radar installation' },
  { name: 'UAV SIGINT Payload', category: 'Assembly & Electronics', description: 'Signals intelligence payload' },
  { name: 'UAV Weapons Integration', category: 'Assembly & Electronics', description: 'Armed UAV systems' },
  { name: 'UAV Maintenance', category: 'Maintenance & Repair', description: 'UAV scheduled maintenance' },
  { name: 'Swarm Coordination', category: 'Software & Programming', description: 'Multi-UAV coordination' },
  { name: 'Autonomous Operations', category: 'Software & Programming', description: 'Autonomous flight modes' },
  { name: 'Counter-UAS Systems', category: 'Electrical Systems', description: 'Counter drone systems' },
  { name: 'UAS Detect and Avoid', category: 'Electrical Systems', description: 'DAA systems testing' },
  { name: 'Remote Pilot Operations', category: 'Electrical Systems', description: 'Remote pilot procedures' },

  // ===== ADDITIONAL QUALITY METHODS (30) =====
  { name: 'Process FMEA', category: 'Quality & Measurement', description: 'Process failure mode analysis' },
  { name: 'Design FMEA', category: 'Quality & Measurement', description: 'Design failure mode analysis' },
  { name: 'Fault Tree Analysis', category: 'Quality & Measurement', description: 'FTA safety analysis' },
  { name: 'FRACAS', category: 'Quality & Measurement', description: 'Failure reporting analysis' },
  { name: 'Root Cause Analysis', category: 'Quality & Measurement', description: '5-Why and fishbone analysis' },
  { name: '8D Problem Solving', category: 'Quality & Measurement', description: 'Eight disciplines methodology' },
  { name: 'A3 Problem Solving', category: 'Quality & Measurement', description: 'A3 report methodology' },
  { name: 'Six Sigma DMAIC', category: 'Quality & Measurement', description: 'Define Measure Analyze Improve Control' },
  { name: 'Gage R and R', category: 'Quality & Measurement', description: 'Measurement system analysis' },
  { name: 'Process Capability Cp Cpk', category: 'Quality & Measurement', description: 'Process capability indices' },
  { name: 'Control Charts', category: 'Quality & Measurement', description: 'X-bar R and other charts' },
  { name: 'Sampling Plans', category: 'Quality & Measurement', description: 'AQL and LTPD sampling' },
  { name: 'Reliability Testing', category: 'Quality & Measurement', description: 'HALT HASS testing' },
  { name: 'Environmental Stress Screen', category: 'Quality & Measurement', description: 'ESS testing' },
  { name: 'Burn-In Testing', category: 'Quality & Measurement', description: 'Component burn-in' },
  { name: 'Accelerated Life Testing', category: 'Quality & Measurement', description: 'ALT Weibull analysis' },
  { name: 'MTBF Calculation', category: 'Quality & Measurement', description: 'Mean time between failure' },
  { name: 'Warranty Analysis', category: 'Quality & Measurement', description: 'Field failure analysis' },
  { name: 'PPAP Documentation', category: 'Quality & Measurement', description: 'Production part approval' },
  { name: 'Control Plan Development', category: 'Quality & Measurement', description: 'Quality control plans' },
  { name: 'Work Instruction Writing', category: 'Quality & Measurement', description: 'Manufacturing work instructions' },
  { name: 'Lean Manufacturing', category: 'Quality & Measurement', description: 'Lean principles application' },
  { name: '5S Workplace Organization', category: 'Quality & Measurement', description: 'Sort Set Shine Standardize Sustain' },
  { name: 'Value Stream Mapping', category: 'Quality & Measurement', description: 'VSM current and future state' },
  { name: 'Kaizen Events', category: 'Quality & Measurement', description: 'Rapid improvement events' },
  { name: 'SMED Setup Reduction', category: 'Quality & Measurement', description: 'Single minute exchange of die' },
  { name: 'TPM Maintenance', category: 'Quality & Measurement', description: 'Total productive maintenance' },
  { name: 'Poka-Yoke', category: 'Quality & Measurement', description: 'Error proofing methods' },
  { name: 'Visual Management', category: 'Quality & Measurement', description: 'Visual factory methods' },
  { name: 'Standard Work', category: 'Quality & Measurement', description: 'Standardized work procedures' },

  // ===== ADDITIONAL NDT METHODS (25) =====
  { name: 'UT Diffraction Sizing', category: 'Quality & Measurement', description: 'Tip diffraction flaw sizing' },
  { name: 'UT Mode Conversion', category: 'Quality & Measurement', description: 'Understanding mode conversion' },
  { name: 'UT Near Field Effects', category: 'Quality & Measurement', description: 'Near field beam characteristics' },
  { name: 'UT Dead Zone Management', category: 'Quality & Measurement', description: 'Minimizing UT dead zone' },
  { name: 'UT Reference Block Fabrication', category: 'Quality & Measurement', description: 'Making reference standards' },
  { name: 'RT Film Processing Chemistry', category: 'Quality & Measurement', description: 'Film developer and fixer chemistry' },
  { name: 'RT Scattered Radiation Control', category: 'Quality & Measurement', description: 'Backscatter and undercut control' },
  { name: 'RT Isotope Selection', category: 'Quality & Measurement', description: 'Selecting Ir-192, Co-60, Se-75' },
  { name: 'RT Collimator Usage', category: 'Quality & Measurement', description: 'Collimator selection and use' },
  { name: 'ET Lift-Off Compensation', category: 'Quality & Measurement', description: 'Compensating for probe lift-off' },
  { name: 'ET Edge Effect Management', category: 'Quality & Measurement', description: 'Managing edge effect signals' },
  { name: 'ET Ferrite Content', category: 'Quality & Measurement', description: 'Ferrite measurement in welds' },
  { name: 'MT AC vs DC Selection', category: 'Quality & Measurement', description: 'Selecting AC, DC, HWDC' },
  { name: 'MT Field Strength Measurement', category: 'Quality & Measurement', description: 'Using pie gauges and meters' },
  { name: 'MT Particle Application', category: 'Quality & Measurement', description: 'Dry and wet particle application' },
  { name: 'PT Emulsifier Concentration', category: 'Quality & Measurement', description: 'Lipophilic emulsifier control' },
  { name: 'PT Dwell Time Optimization', category: 'Quality & Measurement', description: 'Optimizing penetrant dwell' },
  { name: 'PT Developer Application', category: 'Quality & Measurement', description: 'Dry, aqueous, nonaqueous developers' },
  { name: 'PT Water Wash Parameters', category: 'Quality & Measurement', description: 'Controlling water wash' },
  { name: 'PT System Performance Check', category: 'Quality & Measurement', description: 'Using TAM panels and PSM-5' },
  { name: 'VT Direct Visual', category: 'Quality & Measurement', description: 'Direct visual examination' },
  { name: 'VT Remote Visual', category: 'Quality & Measurement', description: 'Borescope and camera inspection' },
  { name: 'VT Weld Profile Gauges', category: 'Quality & Measurement', description: 'Using weld gauges' },
  { name: 'Replica Preparation', category: 'Quality & Measurement', description: 'Making metallographic replicas' },
  { name: 'Hardness Conversion', category: 'Quality & Measurement', description: 'Converting hardness scales' },

  // ===== ADDITIONAL AIRCRAFT SYSTEMS (30) =====
  { name: 'Pitot Static System Test', category: 'Quality & Measurement', description: 'Pitot static leak check' },
  { name: 'Air Data Computer Test', category: 'Quality & Measurement', description: 'ADC calibration verification' },
  { name: 'Altimeter Calibration', category: 'Quality & Measurement', description: 'Altimeter correlation check' },
  { name: 'Airspeed Indicator Test', category: 'Quality & Measurement', description: 'ASI calibration' },
  { name: 'Vertical Speed Indicator', category: 'Quality & Measurement', description: 'VSI calibration' },
  { name: 'Attitude Indicator Test', category: 'Quality & Measurement', description: 'AI erection and tumble test' },
  { name: 'Heading Indicator Test', category: 'Quality & Measurement', description: 'DG and HSI testing' },
  { name: 'Turn Coordinator Test', category: 'Quality & Measurement', description: 'Turn and slip indicator test' },
  { name: 'Magnetic Compass Compensation', category: 'Quality & Measurement', description: 'Compass swing procedure' },
  { name: 'Flux Valve Alignment', category: 'Quality & Measurement', description: 'Flux valve compensation' },
  { name: 'Engine Indicating Systems', category: 'Electrical Systems', description: 'EGT EPR N1 N2 indication' },
  { name: 'Fuel Flow Indication', category: 'Electrical Systems', description: 'Fuel flow transmitter test' },
  { name: 'Oil Pressure Indication', category: 'Electrical Systems', description: 'Oil system indication' },
  { name: 'Oil Temperature Indication', category: 'Electrical Systems', description: 'Oil temp sensing' },
  { name: 'Vibration Indication', category: 'Electrical Systems', description: 'Engine vibration monitoring' },
  { name: 'Fire Detection Systems', category: 'Electrical Systems', description: 'Fire loop and detector test' },
  { name: 'Smoke Detection Systems', category: 'Electrical Systems', description: 'Smoke detector test' },
  { name: 'Overheat Detection', category: 'Electrical Systems', description: 'Bleed air leak detection' },
  { name: 'Warning Light Test', category: 'Quality & Measurement', description: 'Annunciator panel test' },
  { name: 'Aural Warning Test', category: 'Quality & Measurement', description: 'Warning horn and voice' },
  { name: 'Stick Shaker Test', category: 'Quality & Measurement', description: 'Stall warning test' },
  { name: 'Configuration Warning', category: 'Quality & Measurement', description: 'Takeoff configuration test' },
  { name: 'Gear Warning System', category: 'Quality & Measurement', description: 'Landing gear warning' },
  { name: 'GPWS Test Modes', category: 'Quality & Measurement', description: 'GPWS mode testing' },
  { name: 'Ice Detection System', category: 'Electrical Systems', description: 'Ice detector test' },
  { name: 'Windshield Heat', category: 'Electrical Systems', description: 'Window heat control test' },
  { name: 'Probe Heat Test', category: 'Electrical Systems', description: 'Pitot and TAT probe heat' },
  { name: 'Engine Inlet Heat', category: 'Electrical Systems', description: 'Engine anti-ice test' },
  { name: 'Wing Anti-Ice Test', category: 'Quality & Measurement', description: 'Bleed air anti-ice test' },
  { name: 'Tail Anti-Ice Test', category: 'Quality & Measurement', description: 'Stabilizer anti-ice' },

  // ===== MANUFACTURING PROCESSES (35) =====
  { name: 'Sheet Metal Layout', category: 'Welding & Fabrication', description: 'Flat pattern development' },
  { name: 'Aircraft Skin Repair', category: 'Maintenance & Repair', description: 'Flush and lap skin patches' },
  { name: 'Stringer Repair', category: 'Maintenance & Repair', description: 'Stringer splice repair' },
  { name: 'Frame Repair', category: 'Maintenance & Repair', description: 'Fuselage frame repair' },
  { name: 'Bulkhead Repair', category: 'Maintenance & Repair', description: 'Pressure bulkhead repair' },
  { name: 'Spar Repair', category: 'Maintenance & Repair', description: 'Wing spar repair methods' },
  { name: 'Rib Repair', category: 'Maintenance & Repair', description: 'Wing rib repair' },
  { name: 'Longeron Repair', category: 'Maintenance & Repair', description: 'Longeron splice repair' },
  { name: 'Damage Assessment', category: 'Quality & Measurement', description: 'Structural damage evaluation' },
  { name: 'Negligible Damage Limits', category: 'Quality & Measurement', description: 'SRM damage tolerances' },
  { name: 'Repair Design', category: 'Quality & Measurement', description: 'Structural repair design' },
  { name: 'Load Path Analysis', category: 'Quality & Measurement', description: 'Understanding load paths' },
  { name: 'Fatigue Analysis Basics', category: 'Quality & Measurement', description: 'Basic fatigue concepts' },
  { name: 'Corrosion Treatment', category: 'Maintenance & Repair', description: 'Corrosion removal and treatment' },
  { name: 'Corrosion Prevention', category: 'Maintenance & Repair', description: 'CPC application' },
  { name: 'Protective Coating Removal', category: 'Maintenance & Repair', description: 'Paint stripping methods' },
  { name: 'Conversion Coating Touch-up', category: 'Maintenance & Repair', description: 'Alodine pen application' },
  { name: 'Touch-up Painting', category: 'Maintenance & Repair', description: 'Touch-up primer and paint' },
  { name: 'Masking for Paint', category: 'Assembly & Electronics', description: 'Paint masking techniques' },
  { name: 'Spray Gun Setup', category: 'Assembly & Electronics', description: 'HVLP gun adjustment' },
  { name: 'Paint Film Thickness', category: 'Quality & Measurement', description: 'Measuring DFT' },
  { name: 'Adhesion Testing', category: 'Quality & Measurement', description: 'Cross-hatch tape test' },
  { name: 'Gloss Measurement', category: 'Quality & Measurement', description: 'Paint gloss measurement' },
  { name: 'Color Matching', category: 'Quality & Measurement', description: 'Color specification matching' },
  { name: 'Environmental Sealing', category: 'Assembly & Electronics', description: 'Pressure and environment sealing' },
  { name: 'Drain Hole Installation', category: 'Assembly & Electronics', description: 'Installing drain grommets' },
  { name: 'Nut Plate Riveting', category: 'Assembly & Electronics', description: 'Nutplate installation' },
  { name: 'Blind Fastener Selection', category: 'Assembly & Electronics', description: 'Choosing blind fasteners' },
  { name: 'Rivet Pattern Layout', category: 'Assembly & Electronics', description: 'Fastener pattern layout' },
  { name: 'Edge Distance Calculation', category: 'Quality & Measurement', description: 'Minimum edge distance' },
  { name: 'Pitch and Spacing', category: 'Quality & Measurement', description: 'Fastener pitch requirements' },
  { name: 'Grip Length Selection', category: 'Assembly & Electronics', description: 'Determining fastener grip' },
  { name: 'Stack-up Tolerance', category: 'Quality & Measurement', description: 'Assembly stack-up analysis' },
  { name: 'Shim Selection', category: 'Assembly & Electronics', description: 'Selecting solid and peel shims' },
  { name: 'Liquid Shim Application', category: 'Assembly & Electronics', description: 'Using liquid shim compounds' },

  // ===== ADDITIONAL AVIONICS (25) =====
  { name: 'ACARS Message Testing', category: 'Quality & Measurement', description: 'ACARS uplink downlink test' },
  { name: 'CPDLC Testing', category: 'Quality & Measurement', description: 'Controller pilot data link test' },
  { name: 'ADS-C Testing', category: 'Quality & Measurement', description: 'Automatic dependent surveillance contract' },
  { name: 'RNP AR Operations', category: 'Electrical Systems', description: 'Required navigation performance AR' },
  { name: 'LPV Approach Capability', category: 'Electrical Systems', description: 'Localizer performance vertical' },
  { name: 'VNAV Path Operations', category: 'Electrical Systems', description: 'Vertical navigation modes' },
  { name: 'LNAV Operations', category: 'Electrical Systems', description: 'Lateral navigation modes' },
  { name: 'FMS Database Loading', category: 'Software & Programming', description: 'Navigation database update' },
  { name: 'CDU Programming', category: 'Software & Programming', description: 'Control display unit operation' },
  { name: 'MCDU Operations', category: 'Software & Programming', description: 'Multipurpose CDU programming' },
  { name: 'MFD Configuration', category: 'Software & Programming', description: 'Multifunction display setup' },
  { name: 'PFD Symbology', category: 'Electrical Systems', description: 'Primary flight display symbology' },
  { name: 'ND Map Display', category: 'Electrical Systems', description: 'Navigation display modes' },
  { name: 'EICAS Configuration', category: 'Software & Programming', description: 'Engine indication configuration' },
  { name: 'Synoptic Page Access', category: 'Software & Programming', description: 'System synoptic displays' },
  { name: 'Flight Warning Computer', category: 'Electrical Systems', description: 'FWC operation and test' },
  { name: 'Centralized Fault Display', category: 'Electrical Systems', description: 'CFDS operation' },
  { name: 'BITE Interrogation', category: 'Quality & Measurement', description: 'Built-in test equipment access' },
  { name: 'LRU Identification', category: 'Maintenance & Repair', description: 'Line replaceable unit ID' },
  { name: 'Pin Programming', category: 'Assembly & Electronics', description: 'Configuration pin selection' },
  { name: 'Software Part Number', category: 'Quality & Measurement', description: 'SPN verification' },
  { name: 'Aircraft Configuration', category: 'Quality & Measurement', description: 'Aircraft effectivity checking' },
  { name: 'MEL Compliance', category: 'Quality & Measurement', description: 'Minimum equipment list' },
  { name: 'CDL Compliance', category: 'Quality & Measurement', description: 'Configuration deviation list' },
  { name: 'Dispatch Deviation', category: 'Quality & Measurement', description: 'DDG procedures' },

  // ===== TEST EQUIPMENT (20) =====
  { name: 'Oscilloscope Operation', category: 'Quality & Measurement', description: 'Digital oscilloscope usage' },
  { name: 'Spectrum Analyzer', category: 'Quality & Measurement', description: 'RF spectrum analysis' },
  { name: 'Network Analyzer', category: 'Quality & Measurement', description: 'Vector network analyzer' },
  { name: 'Signal Generator', category: 'Quality & Measurement', description: 'RF signal generation' },
  { name: 'Power Meter RF', category: 'Quality & Measurement', description: 'RF power measurement' },
  { name: 'Frequency Counter', category: 'Quality & Measurement', description: 'Frequency measurement' },
  { name: 'Logic Analyzer', category: 'Quality & Measurement', description: 'Digital logic analysis' },
  { name: 'Protocol Analyzer', category: 'Quality & Measurement', description: 'Bus protocol analysis' },
  { name: 'LCR Meter', category: 'Quality & Measurement', description: 'Inductance capacitance resistance' },
  { name: 'Insulation Tester', category: 'Quality & Measurement', description: 'Megohm insulation testing' },
  { name: 'Ground Bond Tester', category: 'Quality & Measurement', description: 'Ground continuity testing' },
  { name: 'Hipot Tester', category: 'Quality & Measurement', description: 'Dielectric withstand testing' },
  { name: 'Current Clamp', category: 'Quality & Measurement', description: 'AC DC current measurement' },
  { name: 'Power Quality Analyzer', category: 'Quality & Measurement', description: 'Power harmonics analysis' },
  { name: 'Torque Wrench Calibration', category: 'Quality & Measurement', description: 'Verifying torque wrench accuracy' },
  { name: 'Pressure Gauge Calibration', category: 'Quality & Measurement', description: 'Calibrating pressure gauges' },
  { name: 'Temperature Calibration', category: 'Quality & Measurement', description: 'Temperature sensor calibration' },
  { name: 'Flow Meter Calibration', category: 'Quality & Measurement', description: 'Flow measurement calibration' },
  { name: 'Gage Block Usage', category: 'Quality & Measurement', description: 'Using precision gage blocks' },
  { name: 'Optical Flat Inspection', category: 'Quality & Measurement', description: 'Flatness measurement' },

  // ===== ADDITIONAL COMPOSITES (25) =====
  { name: 'Composite Damage Modes', category: 'Quality & Measurement', description: 'BVID and VID damage assessment' },
  { name: 'Impact Damage Mapping', category: 'Quality & Measurement', description: 'Mapping impact damage extent' },
  { name: 'Delamination Sizing', category: 'Quality & Measurement', description: 'Determining delamination size' },
  { name: 'Disbond Detection', category: 'Quality & Measurement', description: 'Finding adhesive disbonds' },
  { name: 'Porosity Assessment', category: 'Quality & Measurement', description: 'Evaluating composite porosity' },
  { name: 'Fiber Waviness', category: 'Quality & Measurement', description: 'Detecting fiber waviness' },
  { name: 'Foreign Object Detection', category: 'Quality & Measurement', description: 'Finding FOD inclusions' },
  { name: 'Moisture Ingress', category: 'Quality & Measurement', description: 'Detecting moisture in composites' },
  { name: 'Resin Starvation', category: 'Quality & Measurement', description: 'Identifying dry spots' },
  { name: 'Resin Rich Areas', category: 'Quality & Measurement', description: 'Finding resin pooling' },
  { name: 'Ply Drop Inspection', category: 'Quality & Measurement', description: 'Inspecting ply terminations' },
  { name: 'Joggle Inspection', category: 'Quality & Measurement', description: 'Inspecting joggle areas' },
  { name: 'Radius Inspection', category: 'Quality & Measurement', description: 'Corner radius examination' },
  { name: 'Tooling Surface Prep', category: 'Assembly & Electronics', description: 'Preparing composite tools' },
  { name: 'Release Agent Application', category: 'Assembly & Electronics', description: 'Applying mold release' },
  { name: 'Bagging Film Selection', category: 'Assembly & Electronics', description: 'Choosing vacuum bag materials' },
  { name: 'Sealant Tape Application', category: 'Assembly & Electronics', description: 'Vacuum bag sealing' },
  { name: 'Vacuum Port Installation', category: 'Assembly & Electronics', description: 'Installing vacuum valves' },
  { name: 'Thermocouple Placement', category: 'Assembly & Electronics', description: 'TC placement for cure monitoring' },
  { name: 'Cure Cycle Monitoring', category: 'Quality & Measurement', description: 'Monitoring autoclave cure' },
  { name: 'Exotherm Control', category: 'Quality & Measurement', description: 'Managing cure exotherm' },
  { name: 'Post Cure Processing', category: 'Assembly & Electronics', description: 'Post cure heat treatment' },
  { name: 'Composite Coupon Testing', category: 'Quality & Measurement', description: 'Mechanical testing coupons' },
  { name: 'Interlaminar Shear Test', category: 'Quality & Measurement', description: 'ILSS short beam shear' },
  { name: 'Open Hole Compression', category: 'Quality & Measurement', description: 'OHC testing' },

  // ===== SAFETY AND COMPLIANCE (20) =====
  { name: 'FOD Prevention', category: 'Quality & Measurement', description: 'Foreign object damage prevention' },
  { name: 'Tool Control', category: 'Quality & Measurement', description: 'Tool accountability program' },
  { name: 'Human Factors MEDA', category: 'Quality & Measurement', description: 'Maintenance error decision aid' },
  { name: 'SMS Safety Management', category: 'Quality & Measurement', description: 'Safety management system' },
  { name: 'Hazmat Handling', category: 'Quality & Measurement', description: 'Hazardous material handling' },
  { name: 'MSDS Interpretation', category: 'Quality & Measurement', description: 'Safety data sheet review' },
  { name: 'PPE Selection', category: 'Quality & Measurement', description: 'Personal protective equipment' },
  { name: 'Confined Space Entry', category: 'Quality & Measurement', description: 'Fuel tank entry procedures' },
  { name: 'Fall Protection', category: 'Quality & Measurement', description: 'Working at height safety' },
  { name: 'Lockout Tagout LOTO', category: 'Quality & Measurement', description: 'Energy isolation' },
  { name: 'Electrical Safety', category: 'Quality & Measurement', description: 'Electrical hazard awareness' },
  { name: 'Fire Safety', category: 'Quality & Measurement', description: 'Fire prevention and response' },
  { name: 'Oxygen Safety', category: 'Quality & Measurement', description: 'Oxygen system safety' },
  { name: 'Fuel Safety', category: 'Quality & Measurement', description: 'Fuel handling safety' },
  { name: 'Hydraulic Safety', category: 'Quality & Measurement', description: 'Hydraulic hazard awareness' },
  { name: 'Composite Material Safety', category: 'Quality & Measurement', description: 'Composite dust hazards' },
  { name: 'Chemical Safety', category: 'Quality & Measurement', description: 'Chemical handling safety' },
  { name: 'Ergonomic Safety', category: 'Quality & Measurement', description: 'Ergonomic hazard prevention' },
  { name: 'Hearing Conservation', category: 'Quality & Measurement', description: 'Noise exposure control' },
  { name: 'Respiratory Protection', category: 'Quality & Measurement', description: 'Respirator use and fit test' },

  // ===== FINAL A&D SKILLS TO REACH 1000 (14) =====
  { name: 'Immersion Tank UT', category: 'Quality & Measurement', description: 'Immersion ultrasonic tank inspection' },
  { name: 'Squirter UT System', category: 'Quality & Measurement', description: 'Water-jet coupled UT scanning' },
  { name: 'C-Scan Mapping', category: 'Quality & Measurement', description: 'Ultrasonic C-scan image generation' },
  { name: 'B-Scan Display', category: 'Quality & Measurement', description: 'Cross-sectional UT display interpretation' },
  { name: 'A-Scan Interpretation', category: 'Quality & Measurement', description: 'Time-base UT signal analysis' },
  { name: 'Delay Line Probes', category: 'Quality & Measurement', description: 'Near surface UT with delay lines' },
  { name: 'Dual Element Probes', category: 'Quality & Measurement', description: 'Pitch-catch dual transducer UT' },
  { name: 'Angle Beam Shear Wave', category: 'Quality & Measurement', description: 'Shear wave weld inspection' },
  { name: 'DAC Curve Generation', category: 'Quality & Measurement', description: 'Distance amplitude correction curves' },
  { name: 'TCG Time Corrected Gain', category: 'Quality & Measurement', description: 'Time corrected gain for depth compensation' },
  { name: 'Attenuation Measurement', category: 'Quality & Measurement', description: 'Material attenuation coefficient' },
  { name: 'Velocity Measurement', category: 'Quality & Measurement', description: 'Sound velocity determination' },
  { name: 'Creep Damage Assessment', category: 'Quality & Measurement', description: 'High temperature creep evaluation' },
  { name: 'Hydrogen Damage Detection', category: 'Quality & Measurement', description: 'Hydrogen induced cracking detection' },

  // ============================================
  // SPACEX-SPECIFIC SKILLS (100+ skills)
  // ============================================

  // Rocket Propulsion
  { name: 'Full-Flow Staged Combustion', category: 'Assembly & Electronics', description: 'Full-flow staged combustion engine principles' },
  { name: 'LOX/Methane Propulsion', category: 'Assembly & Electronics', description: 'Liquid oxygen/methane propellant systems' },
  { name: 'LOX/RP-1 Propulsion', category: 'Assembly & Electronics', description: 'Liquid oxygen/kerosene propellant handling' },
  { name: 'Turbopump Assembly', category: 'Assembly & Electronics', description: 'Rocket engine turbopump building' },
  { name: 'Preburner Assembly', category: 'Assembly & Electronics', description: 'Oxygen-rich and fuel-rich preburner construction' },
  { name: 'Regenerative Cooling Channels', category: 'Assembly & Electronics', description: 'Regeneratively cooled thrust chamber fabrication' },
  { name: 'Injector Fabrication', category: 'Assembly & Electronics', description: 'Coaxial swirl injector manufacturing' },
  { name: 'Engine Gimbal Systems', category: 'Assembly & Electronics', description: 'Thrust vector control actuator installation' },
  { name: 'Engine Controller Integration', category: 'Assembly & Electronics', description: 'Engine control computer installation' },
  { name: 'Propellant Valve Assembly', category: 'Assembly & Electronics', description: 'Cryogenic valve assembly and test' },
  { name: 'Hot Fire Test Operations', category: 'Quality & Measurement', description: 'Engine static fire test procedures' },
  { name: 'Igniter Installation', category: 'Assembly & Electronics', description: 'Torch igniter and TEA-TEB systems' },
  { name: 'Nozzle Extension Install', category: 'Assembly & Electronics', description: 'Radiatively cooled nozzle extension installation' },
  { name: 'Engine Acceptance Testing', category: 'Quality & Measurement', description: 'Engine performance acceptance testing' },
  { name: 'Merlin Engine Systems', category: 'Assembly & Electronics', description: 'Merlin 1D/1D+ engine knowledge' },
  { name: 'Raptor Engine Systems', category: 'Assembly & Electronics', description: 'Raptor engine system knowledge' },
  { name: 'Draco Thruster Systems', category: 'Assembly & Electronics', description: 'Hypergolic Draco thruster installation' },
  { name: 'SuperDraco Systems', category: 'Assembly & Electronics', description: 'SuperDraco launch abort engine systems' },

  // Rocket Structures
  { name: 'Tank Dome Forming', category: 'Machining', description: 'Spin forming propellant tank domes' },
  { name: 'Tank FSW Welding', category: 'Welding', description: 'Friction stir welding of propellant tanks' },
  { name: 'Orbital TIG Welding', category: 'Welding', description: 'Automated orbital tube welding' },
  { name: 'Cryogenic Tank Welding', category: 'Welding', description: 'Welding cryogenic propellant tanks' },
  { name: '301 Stainless Welding', category: 'Welding', description: 'Welding 301/304L stainless steel structures' },
  { name: 'Aluminum-Lithium Welding', category: 'Welding', description: 'Al-Li 2195/2219 alloy welding' },
  { name: 'Isogrid Machining', category: 'Machining', description: 'Machining isogrid structural patterns' },
  { name: 'Orthogrid Fabrication', category: 'Machining', description: 'Orthogrid barrel section fabrication' },
  { name: 'Common Bulkhead Assembly', category: 'Assembly & Electronics', description: 'Shared propellant tank bulkhead construction' },
  { name: 'Stage Separation Systems', category: 'Assembly & Electronics', description: 'Pneumatic pusher and separation bolt installation' },
  { name: 'COPV Installation', category: 'Assembly & Electronics', description: 'Composite overwrap pressure vessel installation' },
  { name: 'Grid Fin Fabrication', category: 'Machining', description: 'Titanium grid fin manufacturing' },
  { name: 'Landing Leg Mechanisms', category: 'Assembly & Electronics', description: 'Deployable landing leg assembly' },
  { name: 'Fairing Separation Systems', category: 'Assembly & Electronics', description: 'Payload fairing separation mechanisms' },
  { name: 'Interstage Construction', category: 'Assembly & Electronics', description: 'Stage coupling interstage assembly' },

  // Starship/Starlink Specific
  { name: 'Heat Shield Tile Installation', category: 'Assembly & Electronics', description: 'Ceramic TPS tile bonding and installation' },
  { name: 'Starship Flap Actuation', category: 'Assembly & Electronics', description: 'Aerosurface actuator systems' },
  { name: 'Starlink Bus Assembly', category: 'Assembly & Electronics', description: 'Satellite bus structure assembly' },
  { name: 'Phased Array Manufacturing', category: 'Assembly & Electronics', description: 'Flat panel phased array antenna production' },
  { name: 'Hall Thruster Installation', category: 'Assembly & Electronics', description: 'Krypton Hall-effect thruster installation' },
  { name: 'Inter-Satellite Laser Link', category: 'Assembly & Electronics', description: 'Optical inter-satellite communication systems' },
  { name: 'Solar Array Deployment', category: 'Assembly & Electronics', description: 'Deployable solar array mechanisms' },
  { name: 'Satellite Dispenser Loading', category: 'Assembly & Electronics', description: 'Loading satellites into stack dispenser' },
  { name: 'Hot Gas RCS', category: 'Assembly & Electronics', description: 'Gaseous methane/oxygen RCS systems' },
  { name: 'Header Tank Systems', category: 'Assembly & Electronics', description: 'Landing propellant header tank installation' },
  { name: 'Thermal Protection Inspection', category: 'Quality & Measurement', description: 'TPS tile gap and step inspection' },

  // Dragon Systems
  { name: 'Pressure Vessel Fabrication', category: 'Assembly & Electronics', description: 'Crew-rated pressure vessel construction' },
  { name: 'ECLSS Installation', category: 'Assembly & Electronics', description: 'Environmental control and life support systems' },
  { name: 'Crew Display Integration', category: 'Assembly & Electronics', description: 'Touchscreen crew interface installation' },
  { name: 'Docking System Installation', category: 'Assembly & Electronics', description: 'IDA docking mechanism installation' },
  { name: 'Parachute Packing', category: 'Assembly & Electronics', description: 'Drogue and main parachute packing' },
  { name: 'Dragon Trunk Assembly', category: 'Assembly & Electronics', description: 'Unpressurized trunk and solar arrays' },
  { name: 'Thermal Control Loops', category: 'Assembly & Electronics', description: 'Active thermal control system installation' },
  { name: 'Dragon Propulsion Systems', category: 'Assembly & Electronics', description: 'Dragon Draco propulsion integration' },
  { name: 'Capsule Closeout', category: 'Assembly & Electronics', description: 'Final capsule closeout procedures' },
  { name: 'Splashdown Systems', category: 'Assembly & Electronics', description: 'Water landing systems and flotation' },

  // Launch Operations
  { name: 'Launch Countdown Procedures', category: 'Quality & Measurement', description: 'Terminal countdown sequence execution' },
  { name: 'Propellant Loading Operations', category: 'Quality & Measurement', description: 'Subcooled LOX and densified RP-1 loading' },
  { name: 'Launch Pad Systems', category: 'Maintenance & Repair', description: 'Pad infrastructure maintenance' },
  { name: 'Strongback Operations', category: 'Assembly & Electronics', description: 'T/E and strongback operations' },
  { name: 'Range Safety Systems', category: 'Quality & Measurement', description: 'Flight termination system procedures' },
  { name: 'Weather Analysis Launch', category: 'Quality & Measurement', description: 'Launch weather constraints analysis' },
  { name: 'TEL Operations', category: 'Assembly & Electronics', description: 'Transporter erector launcher operation' },
  { name: 'Ground Umbilical Systems', category: 'Assembly & Electronics', description: 'T-0 umbilical connection systems' },
  { name: 'Tower Catch Systems', category: 'Assembly & Electronics', description: 'Mechazilla chopstick catch operations' },
  { name: 'Quick Disconnect Systems', category: 'Assembly & Electronics', description: 'Propellant and fluid QD operations' },

  // Recovery Operations
  { name: 'ASDS Operations', category: 'Assembly & Electronics', description: 'Autonomous drone ship positioning' },
  { name: 'Booster Recovery Processing', category: 'Maintenance & Repair', description: 'Recovered booster post-flight inspection' },
  { name: 'Fairing Recovery Operations', category: 'Maintenance & Repair', description: 'Ocean fairing half recovery' },
  { name: 'Dragon Recovery Operations', category: 'Maintenance & Repair', description: 'Capsule ocean recovery and safing' },
  { name: 'Reusability Inspection', category: 'Quality & Measurement', description: 'Flight-proven hardware inspection' },
  { name: 'Booster Refurbishment', category: 'Maintenance & Repair', description: 'Recovered booster refurbishment' },
  { name: 'Engine Refurbishment', category: 'Maintenance & Repair', description: 'Flight-proven engine inspection and refurb' },

  // Mission Operations
  { name: 'Flight Dynamics', category: 'Software & Programming', description: 'Trajectory and orbital mechanics' },
  { name: 'Telemetry Monitoring', category: 'Quality & Measurement', description: 'Real-time vehicle telemetry analysis' },
  { name: 'Spacecraft Commanding', category: 'Software & Programming', description: 'Vehicle command uplink procedures' },
  { name: 'Rendezvous Operations', category: 'Software & Programming', description: 'ISS approach and docking operations' },
  { name: 'Constellation Management', category: 'Software & Programming', description: 'Starlink fleet management' },
  { name: 'Deorbit Planning', category: 'Software & Programming', description: 'Controlled deorbit trajectory planning' },
  { name: 'Anomaly Resolution', category: 'Quality & Measurement', description: 'In-flight anomaly troubleshooting' },

  // ============================================
  // TESLA MANUFACTURING SKILLS (100+ skills)
  // ============================================

  // Battery Cell Manufacturing
  { name: 'Electrode Slurry Mixing', category: 'Assembly & Electronics', description: 'Cathode and anode slurry preparation' },
  { name: 'Electrode Coating', category: 'Assembly & Electronics', description: 'Slot die coating of electrodes' },
  { name: 'Electrode Calendering', category: 'Assembly & Electronics', description: 'Electrode compression and densification' },
  { name: 'Electrode Slitting', category: 'Machining', description: 'Electrode web slitting to width' },
  { name: 'Dry Electrode Process', category: 'Assembly & Electronics', description: 'Solvent-free dry electrode coating' },
  { name: 'Cell Winding', category: 'Assembly & Electronics', description: 'Jelly roll electrode winding' },
  { name: 'Tab Welding', category: 'Welding', description: 'Ultrasonic electrode tab welding' },
  { name: 'Can Insertion', category: 'Assembly & Electronics', description: 'Jelly roll insertion into cell can' },
  { name: 'Electrolyte Filling', category: 'Assembly & Electronics', description: 'Precision electrolyte dispensing' },
  { name: 'Cell Sealing', category: 'Assembly & Electronics', description: 'Laser welding cell cap seals' },
  { name: 'Cell Formation', category: 'Assembly & Electronics', description: 'Initial charge/discharge cycling' },
  { name: 'Cell Degassing', category: 'Assembly & Electronics', description: 'Formation gas venting procedures' },
  { name: 'Cell Aging', category: 'Quality & Measurement', description: 'Storage aging for quality verification' },
  { name: 'Cell Grading', category: 'Quality & Measurement', description: 'Capacity-based cell sorting' },
  { name: 'Dry Room Operations', category: 'Quality & Measurement', description: 'Ultra-low humidity environment work' },
  { name: '4680 Cell Assembly', category: 'Assembly & Electronics', description: '46mm x 80mm cylindrical cell production' },
  { name: 'Tabless Electrode Design', category: 'Assembly & Electronics', description: 'Tabless cell current collection' },
  { name: 'Cathode Active Material', category: 'Assembly & Electronics', description: 'NMC and LFP cathode handling' },
  { name: 'Anode Processing', category: 'Assembly & Electronics', description: 'Silicon-graphite anode preparation' },
  { name: 'Separator Handling', category: 'Assembly & Electronics', description: 'Ceramic-coated separator processing' },

  // Battery Pack Assembly
  { name: 'Module Assembly', category: 'Assembly & Electronics', description: 'Battery module construction' },
  { name: 'Cell Interconnect Welding', category: 'Welding', description: 'Laser welding cell interconnects' },
  { name: 'Busbar Installation', category: 'Assembly & Electronics', description: 'High-current busbar installation' },
  { name: 'BMS Integration', category: 'Electrical Systems', description: 'Battery management system installation' },
  { name: 'Thermal Interface Application', category: 'Assembly & Electronics', description: 'Thermal gap filler and TIM application' },
  { name: 'Pack Cooling System', category: 'Assembly & Electronics', description: 'Glycol cooling system installation' },
  { name: 'HV Harness Installation', category: 'Electrical Systems', description: 'High voltage harness routing' },
  { name: 'Pack Enclosure Sealing', category: 'Assembly & Electronics', description: 'Structural pack sealing' },
  { name: 'Pack Leak Testing', category: 'Quality & Measurement', description: 'Helium leak detection testing' },
  { name: 'Pack EOL Testing', category: 'Quality & Measurement', description: 'End-of-line pack functional test' },
  { name: 'Pack Structural Adhesive', category: 'Assembly & Electronics', description: 'Structural battery pack bonding' },
  { name: 'Pyrofuse Installation', category: 'Electrical Systems', description: 'Pyrotechnic disconnect installation' },
  { name: 'Service Disconnect', category: 'Electrical Systems', description: 'Manual service disconnect installation' },
  { name: 'Pack CAN Bus', category: 'Electrical Systems', description: 'Battery pack CAN communication' },
  { name: 'Cell Voltage Sensing', category: 'Electrical Systems', description: 'Individual cell voltage monitoring' },

  // Electric Motor Manufacturing
  { name: 'Stator Winding', category: 'Assembly & Electronics', description: 'Concentrated and distributed winding' },
  { name: 'Hairpin Insertion', category: 'Assembly & Electronics', description: 'Hairpin conductor insertion' },
  { name: 'Hairpin Welding', category: 'Welding', description: 'Laser welding hairpin conductors' },
  { name: 'Magnet Installation', category: 'Assembly & Electronics', description: 'Permanent magnet insertion and bonding' },
  { name: 'Rotor Balancing', category: 'Quality & Measurement', description: 'Dynamic rotor balance' },
  { name: 'Stator Potting', category: 'Assembly & Electronics', description: 'Epoxy potting of stator windings' },
  { name: 'Motor Housing Assembly', category: 'Assembly & Electronics', description: 'Motor housing and end bell assembly' },
  { name: 'Resolver Installation', category: 'Electrical Systems', description: 'Position resolver installation' },
  { name: 'Motor Cooling Integration', category: 'Assembly & Electronics', description: 'Stator cooling jacket installation' },
  { name: 'Motor EOL Testing', category: 'Quality & Measurement', description: 'Motor performance and NVH testing' },
  { name: 'IPM Motor Assembly', category: 'Assembly & Electronics', description: 'Interior permanent magnet motor' },
  { name: 'SRM Assembly', category: 'Assembly & Electronics', description: 'Switched reluctance motor assembly' },
  { name: 'Carbon Sleeve Rotor', category: 'Assembly & Electronics', description: 'Carbon fiber rotor sleeve installation' },

  // Power Electronics
  { name: 'SiC MOSFET Assembly', category: 'Assembly & Electronics', description: 'Silicon carbide power module assembly' },
  { name: 'Inverter Assembly', category: 'Assembly & Electronics', description: 'Drive inverter unit assembly' },
  { name: 'DC-DC Converter Assembly', category: 'Assembly & Electronics', description: 'Low voltage DC-DC assembly' },
  { name: 'Onboard Charger Assembly', category: 'Assembly & Electronics', description: 'AC-DC onboard charger assembly' },
  { name: 'Gate Driver Assembly', category: 'Assembly & Electronics', description: 'IGBT/MOSFET gate driver boards' },
  { name: 'Power Module Sintering', category: 'Assembly & Electronics', description: 'Silver sintering die attach' },
  { name: 'PE Thermal Management', category: 'Assembly & Electronics', description: 'Power electronics cooling systems' },
  { name: 'Film Capacitor Assembly', category: 'Assembly & Electronics', description: 'DC link capacitor bank assembly' },
  { name: 'EMI Filtering', category: 'Electrical Systems', description: 'Electromagnetic interference filtering' },
  { name: 'Supercharger Assembly', category: 'Assembly & Electronics', description: 'DC fast charger assembly' },

  // Giga Press / Die Casting
  { name: 'Giga Press Operation', category: 'Machining', description: '6000-9000 ton die cast machine operation' },
  { name: 'Mega Casting Tooling', category: 'Machining', description: 'Mega casting die setup and maintenance' },
  { name: 'Shot Sleeve Operation', category: 'Machining', description: 'Molten aluminum shot control' },
  { name: 'Vacuum Die Casting', category: 'Machining', description: 'Vacuum-assisted HPDC process' },
  { name: 'Casting Trim Operations', category: 'Machining', description: 'Automated casting trimming' },
  { name: 'Casting X-Ray Inspection', category: 'Quality & Measurement', description: 'Real-time X-ray porosity detection' },
  { name: 'Casting Heat Treatment', category: 'Machining', description: 'T5/T7 heat treatment of castings' },
  { name: 'Alloy Preparation', category: 'Machining', description: 'Aluminum alloy degassing and prep' },
  { name: 'Die Spray Systems', category: 'Machining', description: 'Die lubricant spray control' },
  { name: 'Structural Casting Machining', category: 'Machining', description: 'CNC machining of mega castings' },

  // Body and Paint
  { name: 'Robotic Spot Welding', category: 'Welding', description: 'Automated resistance spot welding' },
  { name: 'Laser Brazing', category: 'Welding', description: 'Laser brazed roof joint processing' },
  { name: 'Structural Adhesive Bonding', category: 'Assembly & Electronics', description: 'Crash-rated structural adhesives' },
  { name: 'Body Panel Stamping', category: 'Machining', description: 'Aluminum panel stamping operation' },
  { name: 'Hem Flanging', category: 'Machining', description: 'Door and hood hem flange operations' },
  { name: 'Body Dimensional Measurement', category: 'Quality & Measurement', description: 'In-line 3D body measurement' },
  { name: 'E-Coat Processing', category: 'Assembly & Electronics', description: 'Electrocoat primer deposition' },
  { name: 'Robotic Paint Application', category: 'Assembly & Electronics', description: 'Automated paint spray systems' },
  { name: 'Automotive Color Matching', category: 'Quality & Measurement', description: 'Spectrophotometer automotive color verification' },
  { name: 'Paint Defect Detection', category: 'Quality & Measurement', description: 'AI-based paint defect inspection' },

  // General Assembly
  { name: 'Cockpit Module Install', category: 'Assembly & Electronics', description: 'One-piece cockpit installation' },
  { name: 'Glass Bonding', category: 'Assembly & Electronics', description: 'Windshield and glass bonding' },
  { name: 'Seat Installation', category: 'Assembly & Electronics', description: 'Seat mounting and connection' },
  { name: 'HVAC Integration', category: 'Assembly & Electronics', description: 'Climate system installation' },
  { name: 'Touchscreen Installation', category: 'Assembly & Electronics', description: 'Center display installation' },
  { name: 'Wiring Harness Routing', category: 'Electrical Systems', description: 'Vehicle harness installation' },
  { name: 'Fluid Fill Systems', category: 'Assembly & Electronics', description: 'Automated fluid filling' },
  { name: 'Drive Unit Marriage', category: 'Assembly & Electronics', description: 'Drivetrain to body installation' },
  { name: 'Wheel Alignment', category: 'Quality & Measurement', description: 'Production wheel alignment' },
  { name: 'ADAS Calibration', category: 'Quality & Measurement', description: 'Camera and radar calibration' },
  { name: 'Vehicle EOL Testing', category: 'Quality & Measurement', description: 'End-of-line vehicle test' },
  { name: 'Water Leak Testing', category: 'Quality & Measurement', description: 'Water intrusion testing' },
  { name: 'Squeak and Rattle Testing', category: 'Quality & Measurement', description: 'BSR detection and elimination' },
  { name: 'Dyno Testing', category: 'Quality & Measurement', description: 'Chassis dynamometer testing' },

  // Automation and Controls
  { name: 'KUKA KRL Programming', category: 'Software & Programming', description: 'KUKA robot language programming' },
  { name: 'FANUC TP Programming', category: 'Software & Programming', description: 'FANUC teach pendant programming' },
  { name: 'Machine Vision Setup', category: 'Software & Programming', description: 'Machine vision system configuration' },
  { name: 'AGV Fleet Programming', category: 'Software & Programming', description: 'Automated guided vehicle fleet management' },
  { name: 'Rockwell Studio 5000', category: 'Software & Programming', description: 'Allen-Bradley Studio 5000 programming' },
  { name: 'TIA Portal Programming', category: 'Software & Programming', description: 'Siemens TIA Portal S7 programming' },
  { name: 'WinCC HMI Development', category: 'Software & Programming', description: 'Siemens WinCC interface development' },
  { name: 'OPC-UA Integration', category: 'Software & Programming', description: 'Industrial connectivity protocols' },
  { name: 'Manufacturing Execution', category: 'Software & Programming', description: 'MES system operation' },
  { name: 'OEE Analysis', category: 'Quality & Measurement', description: 'Overall equipment effectiveness' },
  { name: 'Predictive Maintenance', category: 'Maintenance & Repair', description: 'Condition-based maintenance' },
  { name: 'Digital Twin', category: 'Software & Programming', description: 'Manufacturing simulation' },

  // ============================================
  // SEMICONDUCTOR MANUFACTURING SKILLS (TSMC/ASML/Intel) - 100+ skills
  // ============================================

  // Wafer Fab Process Skills
  { name: 'Silicon Wafer Handling', category: 'Assembly & Electronics', description: 'Proper handling of silicon wafers' },
  { name: 'Cleanroom Gowning', category: 'Quality & Measurement', description: 'Class 1-100 cleanroom protocols' },
  { name: 'Thermal Oxidation', category: 'Assembly & Electronics', description: 'Growing thermal oxide layers' },
  { name: 'LPCVD Process', category: 'Assembly & Electronics', description: 'Low pressure CVD operation' },
  { name: 'PECVD Process', category: 'Assembly & Electronics', description: 'Plasma enhanced CVD operation' },
  { name: 'APCVD Process', category: 'Assembly & Electronics', description: 'Atmospheric pressure CVD' },
  { name: 'ALD Process', category: 'Assembly & Electronics', description: 'Atomic layer deposition' },
  { name: 'PVD Sputtering', category: 'Assembly & Electronics', description: 'Physical vapor deposition sputtering' },
  { name: 'Dopant Ion Implant', category: 'Assembly & Electronics', description: 'Dopant ion implantation' },
  { name: 'RTP Annealing', category: 'Assembly & Electronics', description: 'Rapid thermal processing' },
  { name: 'Furnace Annealing', category: 'Assembly & Electronics', description: 'Batch thermal annealing' },
  { name: 'Plasma Etch', category: 'Assembly & Electronics', description: 'Plasma dry etching processes' },
  { name: 'RIE Process', category: 'Assembly & Electronics', description: 'Reactive ion etching' },
  { name: 'ICP Etch', category: 'Assembly & Electronics', description: 'Inductively coupled plasma etch' },
  { name: 'Wet Chemical Etch', category: 'Assembly & Electronics', description: 'Wet chemical etching' },
  { name: 'CMP Polish', category: 'Assembly & Electronics', description: 'Chemical mechanical planarization' },
  { name: 'Copper Electroplating', category: 'Assembly & Electronics', description: 'Copper damascene plating' },
  { name: 'Tungsten CVD Fill', category: 'Assembly & Electronics', description: 'Tungsten contact fill' },
  { name: 'Barrier Metal Deposition', category: 'Assembly & Electronics', description: 'TaN/Ta barrier deposition' },
  { name: 'Seed Layer Deposition', category: 'Assembly & Electronics', description: 'Copper seed layer PVD' },
  { name: 'High-K Dielectric', category: 'Assembly & Electronics', description: 'High-K gate dielectric deposition' },
  { name: 'Metal Gate Deposition', category: 'Assembly & Electronics', description: 'Metal gate stack deposition' },
  { name: 'Epitaxial Growth', category: 'Assembly & Electronics', description: 'Epitaxial silicon growth' },
  { name: 'Photoresist Application', category: 'Assembly & Electronics', description: 'Spin coating photoresist' },
  { name: 'Photoresist Develop', category: 'Assembly & Electronics', description: 'Photoresist development' },
  { name: 'Photoresist Strip', category: 'Assembly & Electronics', description: 'Plasma ash and wet strip' },

  // Lithography Skills
  { name: 'i-Line Lithography', category: 'Assembly & Electronics', description: '365nm lithography' },
  { name: 'DUV Lithography', category: 'Assembly & Electronics', description: '248nm and 193nm lithography' },
  { name: 'Immersion Lithography', category: 'Assembly & Electronics', description: '193i immersion lithography' },
  { name: 'EUV Lithography', category: 'Assembly & Electronics', description: '13.5nm EUV lithography' },
  { name: 'Overlay Measurement', category: 'Quality & Measurement', description: 'Measuring lithography overlay' },
  { name: 'CD Measurement', category: 'Quality & Measurement', description: 'Critical dimension measurement' },
  { name: 'Focus Exposure Matrix', category: 'Quality & Measurement', description: 'FEM dose optimization' },
  { name: 'Reticle Inspection', category: 'Quality & Measurement', description: 'Photomask inspection' },
  { name: 'Pellicle Mounting', category: 'Assembly & Electronics', description: 'Reticle pellicle installation' },
  { name: 'OPC Application', category: 'Software & Programming', description: 'Optical proximity correction' },
  { name: 'Source Mask Optimization', category: 'Software & Programming', description: 'SMO computational litho' },

  // Metrology and Inspection Skills
  { name: 'CD-SEM Operation', category: 'Quality & Measurement', description: 'Critical dimension SEM' },
  { name: 'Defect SEM Review', category: 'Quality & Measurement', description: 'Defect review SEM operation' },
  { name: 'TEM Sample Prep', category: 'Quality & Measurement', description: 'TEM specimen preparation' },
  { name: 'FIB Cross Section', category: 'Quality & Measurement', description: 'Focused ion beam sectioning' },
  { name: 'Ellipsometry Measurement', category: 'Quality & Measurement', description: 'Thin film thickness measurement' },
  { name: 'Four Point Probe', category: 'Quality & Measurement', description: 'Sheet resistance measurement' },
  { name: 'Wafer Defect Inspection', category: 'Quality & Measurement', description: 'Automated defect inspection' },
  { name: 'Defect Classification', category: 'Quality & Measurement', description: 'ADC defect classification' },
  { name: 'XRF Analysis', category: 'Quality & Measurement', description: 'X-ray fluorescence analysis' },
  { name: 'SIMS Analysis', category: 'Quality & Measurement', description: 'Secondary ion mass spec' },
  { name: 'XRD Analysis', category: 'Quality & Measurement', description: 'X-ray diffraction analysis' },
  { name: 'Stress Measurement', category: 'Quality & Measurement', description: 'Film stress measurement' },

  // Backend/Packaging Skills
  { name: 'Wafer Probe Testing', category: 'Quality & Measurement', description: 'Wafer-level electrical test' },
  { name: 'Die Attach Bonding', category: 'Assembly & Electronics', description: 'Die to substrate attach' },
  { name: 'Wire Bonding Gold', category: 'Assembly & Electronics', description: 'Gold wire ball bonding' },
  { name: 'Wire Bonding Copper', category: 'Assembly & Electronics', description: 'Copper wire bonding' },
  { name: 'Flip Chip Bonding', category: 'Assembly & Electronics', description: 'Flip chip bump bonding' },
  { name: 'Underfill Dispensing', category: 'Assembly & Electronics', description: 'Underfill application' },
  { name: 'Transfer Molding', category: 'Assembly & Electronics', description: 'Epoxy transfer molding' },
  { name: 'Wafer Dicing', category: 'Assembly & Electronics', description: 'Wafer saw singulation' },
  { name: 'Laser Marking IC', category: 'Assembly & Electronics', description: 'IC laser marking' },
  { name: 'Package Burn-In', category: 'Quality & Measurement', description: 'Burn-in reliability testing' },
  { name: 'Final Test ATE', category: 'Quality & Measurement', description: 'ATE final testing' },

  // ============================================
  // COMPUTER/ELECTRONICS SKILLS (Dell/Apple/Lenovo/HP) - 100+ skills
  // ============================================

  // PCB Assembly Skills
  { name: 'Solder Paste Printing', category: 'Assembly & Electronics', description: 'Stencil printing solder paste' },
  { name: 'Pick and Place Programming', category: 'Software & Programming', description: 'Component placement programming' },
  { name: 'Reflow Profile Setup', category: 'Assembly & Electronics', description: 'Reflow oven profiling' },
  { name: 'Wave Solder Setup', category: 'Assembly & Electronics', description: 'Wave solder parameter setup' },
  { name: 'Selective Solder Program', category: 'Software & Programming', description: 'Selective solder programming' },
  { name: 'AOI Programming', category: 'Software & Programming', description: 'AOI inspection programming' },
  { name: 'SPI Setup', category: 'Quality & Measurement', description: 'Solder paste inspection setup' },
  { name: 'X-Ray BGA Inspection', category: 'Quality & Measurement', description: 'BGA X-ray inspection' },
  { name: 'ICT Fixture Design', category: 'Assembly & Electronics', description: 'In-circuit test fixtures' },
  { name: 'Flying Probe Test', category: 'Quality & Measurement', description: 'Flying probe test development' },
  { name: 'Boundary Scan Test', category: 'Quality & Measurement', description: 'JTAG boundary scan testing' },
  { name: 'BGA Reballing', category: 'Assembly & Electronics', description: 'BGA reballing process' },
  { name: 'QFN Inspection', category: 'Quality & Measurement', description: 'QFN solder joint inspection' },
  { name: 'Conformal Coating Apply', category: 'Assembly & Electronics', description: 'Conformal coating application' },
  { name: 'PCB Depaneling', category: 'Assembly & Electronics', description: 'PCB array depaneling' },

  // System Assembly Skills
  { name: 'Server Rack Assembly', category: 'Assembly & Electronics', description: 'Server rack mounting' },
  { name: 'Cable Management', category: 'Assembly & Electronics', description: 'Data center cable management' },
  { name: 'Thermal Paste Application', category: 'Assembly & Electronics', description: 'CPU thermal paste application' },
  { name: 'Heat Sink Installation', category: 'Assembly & Electronics', description: 'Heat sink mounting' },
  { name: 'Memory Module Install', category: 'Assembly & Electronics', description: 'DIMM installation' },
  { name: 'SSD Installation', category: 'Assembly & Electronics', description: 'Solid state drive installation' },
  { name: 'NVMe Drive Install', category: 'Assembly & Electronics', description: 'NVMe drive installation' },
  { name: 'GPU Installation', category: 'Assembly & Electronics', description: 'Graphics card installation' },
  { name: 'RAID Configuration', category: 'Software & Programming', description: 'RAID array configuration' },
  { name: 'BIOS Configuration', category: 'Software & Programming', description: 'BIOS/UEFI configuration' },
  { name: 'BMC Configuration', category: 'Software & Programming', description: 'Baseboard management config' },
  { name: 'OS Imaging', category: 'Software & Programming', description: 'Operating system deployment' },
  { name: 'Driver Installation', category: 'Software & Programming', description: 'Hardware driver installation' },
  { name: 'System Burn-In Test', category: 'Quality & Measurement', description: 'System stress testing' },
  { name: 'Power Supply Test', category: 'Quality & Measurement', description: 'PSU testing and validation' },

  // Mobile Device Skills
  { name: 'Display Module Assembly', category: 'Assembly & Electronics', description: 'Screen assembly installation' },
  { name: 'Touch Panel Calibration', category: 'Quality & Measurement', description: 'Touch screen calibration' },
  { name: 'Camera Module Assembly', category: 'Assembly & Electronics', description: 'Camera module installation' },
  { name: 'Camera Focus Calibration', category: 'Quality & Measurement', description: 'Camera focus calibration' },
  { name: 'Battery Assembly Mobile', category: 'Assembly & Electronics', description: 'Mobile battery installation' },
  { name: 'Antenna Assembly', category: 'Assembly & Electronics', description: 'Antenna module installation' },
  { name: 'RF Testing Mobile', category: 'Quality & Measurement', description: 'Mobile RF performance testing' },
  { name: 'Audio Testing Mobile', category: 'Quality & Measurement', description: 'Speaker and mic testing' },
  { name: 'Sensor Calibration Mobile', category: 'Quality & Measurement', description: 'Accelerometer/gyro calibration' },
  { name: 'Waterproof Seal Apply', category: 'Assembly & Electronics', description: 'Waterproof gasket application' },
  { name: 'Haptic Motor Install', category: 'Assembly & Electronics', description: 'Taptic engine installation' },
  { name: 'Face ID Calibration', category: 'Quality & Measurement', description: 'Facial recognition calibration' },

  // ============================================
  // AEROSPACE/DEFENSE SKILLS (Boeing/Lockheed/Northrop/RTX/NASA) - 100+ skills
  // ============================================

  // Aircraft Assembly Skills
  { name: 'Major Assembly Join', category: 'Assembly & Electronics', description: 'Major section joining' },
  { name: 'Skin Panel Installation', category: 'Assembly & Electronics', description: 'Aircraft skin installation' },
  { name: 'Longeron Installation', category: 'Assembly & Electronics', description: 'Longeron structure install' },
  { name: 'Bulkhead Installation', category: 'Assembly & Electronics', description: 'Pressure bulkhead install' },
  { name: 'Floor Grid Installation', category: 'Assembly & Electronics', description: 'Cabin floor assembly' },
  { name: 'Wing Fuel Tank Seal', category: 'Assembly & Electronics', description: 'Integral fuel tank sealing' },
  { name: 'Control Surface Rig', category: 'Assembly & Electronics', description: 'Flight control rigging' },
  { name: 'Flap Track Install', category: 'Assembly & Electronics', description: 'Flap track mechanism install' },
  { name: 'Slat Mechanism Install', category: 'Assembly & Electronics', description: 'Leading edge slat install' },
  { name: 'Spoiler Installation', category: 'Assembly & Electronics', description: 'Spoiler system installation' },
  { name: 'Aileron Installation', category: 'Assembly & Electronics', description: 'Aileron system installation' },
  { name: 'Rudder Installation', category: 'Assembly & Electronics', description: 'Rudder system installation' },
  { name: 'Elevator Installation', category: 'Assembly & Electronics', description: 'Elevator system installation' },
  { name: 'Horizontal Stab Install', category: 'Assembly & Electronics', description: 'Horizontal stabilizer install' },
  { name: 'Vertical Fin Installation', category: 'Assembly & Electronics', description: 'Vertical fin installation' },
  { name: 'Winglet Installation', category: 'Assembly & Electronics', description: 'Winglet system installation' },

  // Defense System Skills
  { name: 'AESA Radar Integration', category: 'Assembly & Electronics', description: 'Active phased array radar installation' },
  { name: 'ECM System Install', category: 'Assembly & Electronics', description: 'Electronic countermeasures systems' },
  { name: 'IRST Sensor Install', category: 'Assembly & Electronics', description: 'IR search track systems' },
  { name: 'Weapons Pylon Install', category: 'Assembly & Electronics', description: 'Weapons pylon installation' },
  { name: 'LAU Launcher Rail Install', category: 'Assembly & Electronics', description: 'LAU series launcher rail installation' },
  { name: 'Aircraft Gun Mount', category: 'Assembly & Electronics', description: 'Aircraft gun installation' },
  { name: 'TGP Installation', category: 'Assembly & Electronics', description: 'Targeting pod integration' },
  { name: 'CMDS Installation', category: 'Assembly & Electronics', description: 'Countermeasures dispensers install' },
  { name: 'RAM Coating Application', category: 'Assembly & Electronics', description: 'Radar absorbing coating application' },
  { name: 'Canopy Installation', category: 'Assembly & Electronics', description: 'Fighter canopy installation' },
  { name: 'ACES II Install', category: 'Assembly & Electronics', description: 'Ejection seat systems' },
  { name: 'OBOGS System Install', category: 'Assembly & Electronics', description: 'Onboard oxygen system' },

  // Space System Skills
  { name: 'Satellite Bus Build', category: 'Assembly & Electronics', description: 'Satellite bus assembly' },
  { name: 'SA Deployment Test', category: 'Quality & Measurement', description: 'Solar array deployment' },
  { name: 'Antenna Deploy Verify', category: 'Quality & Measurement', description: 'Antenna deployment test' },
  { name: 'Spacecraft Prop Load', category: 'Assembly & Electronics', description: 'Spacecraft propellant load' },
  { name: 'MLI Blanket Install', category: 'Assembly & Electronics', description: 'MLI blanket installation' },
  { name: 'Spacecraft Harness Route', category: 'Assembly & Electronics', description: 'Spacecraft harness routing' },
  { name: 'Momentum Wheel Install', category: 'Assembly & Electronics', description: 'ADCS wheel installation' },
  { name: 'Star Sensor Install', category: 'Assembly & Electronics', description: 'Star tracker installation' },
  { name: 'IMU Sensor Install', category: 'Assembly & Electronics', description: 'Inertial measurement unit' },
  { name: 'Spacecraft Balance', category: 'Quality & Measurement', description: 'Spacecraft spin balance' },
  { name: 'CG MOI Measurement', category: 'Quality & Measurement', description: 'CG and inertia measurement' },

  // ============================================
  // AUTOMOTIVE MANUFACTURING SKILLS (Ford/GM/Toyota/Nissan) - 100+ skills
  // ============================================

  // Stamping Skills
  { name: 'Transfer Die Operation', category: 'Machining', description: 'Transfer die press operation' },
  { name: 'Progressive Die Operation', category: 'Machining', description: 'Progressive die operation' },
  { name: 'Die Setting Automotive', category: 'Machining', description: 'Automotive die setup' },
  { name: 'Blank Development', category: 'Machining', description: 'Sheet metal blank layout' },
  { name: 'Draw Die Operation', category: 'Machining', description: 'Deep draw die operation' },
  { name: 'Trim Die Operation', category: 'Machining', description: 'Trim and pierce operations' },
  { name: 'Flange Die Operation', category: 'Machining', description: 'Flange forming operation' },
  { name: 'Panel Quality Check', category: 'Quality & Measurement', description: 'Stamped panel inspection' },
  { name: 'Die Tryout', category: 'Machining', description: 'New die validation' },
  { name: 'Die Spotting', category: 'Machining', description: 'Die spotting and adjustment' },

  // Body Shop Skills
  { name: 'Resistance Spot Weld', category: 'Welding', description: 'Automotive spot welding' },
  { name: 'Weld Tip Dress', category: 'Welding', description: 'Spot weld electrode dress' },
  { name: 'MIG Weld Automotive', category: 'Welding', description: 'Automotive MIG welding' },
  { name: 'Laser Weld Automotive', category: 'Welding', description: 'Automotive laser welding' },
  { name: 'Laser Braze Automotive', category: 'Welding', description: 'Automotive laser brazing' },
  { name: 'Hem Flange Operation', category: 'Assembly & Electronics', description: 'Panel hem flanging' },
  { name: 'Clinching Operation', category: 'Assembly & Electronics', description: 'Mechanical clinching' },
  { name: 'Flow Drill Screw', category: 'Assembly & Electronics', description: 'FDS fastening operation' },
  { name: 'Self Pierce Rivet', category: 'Assembly & Electronics', description: 'SPR joining operation' },
  { name: 'Structural Adhesive Auto', category: 'Assembly & Electronics', description: 'Automotive adhesive bonding' },
  { name: 'Body Framing', category: 'Assembly & Electronics', description: 'Body-in-white framing' },
  { name: 'Door Hanging Auto', category: 'Assembly & Electronics', description: 'Automotive door installation' },
  { name: 'Hood Alignment', category: 'Quality & Measurement', description: 'Hood gap and flush' },
  { name: 'Body Dimensional Audit', category: 'Quality & Measurement', description: 'Body dimensional measurement' },

  // Paint Shop Skills
  { name: 'Pretreatment Operation', category: 'Assembly & Electronics', description: 'Phosphate pretreatment' },
  { name: 'E-Coat Operation', category: 'Assembly & Electronics', description: 'Electrocoat deposition' },
  { name: 'Sealer Application Auto', category: 'Assembly & Electronics', description: 'Automotive sealer apply' },
  { name: 'PVC Undercoat Apply', category: 'Assembly & Electronics', description: 'Underbody PVC coating' },
  { name: 'Primer Surfacer Apply', category: 'Assembly & Electronics', description: 'Primer spray application' },
  { name: 'Base Coat Application', category: 'Assembly & Electronics', description: 'Base coat spray' },
  { name: 'Clear Coat Application', category: 'Assembly & Electronics', description: 'Clear coat spray' },
  { name: 'Paint Defect Repair Auto', category: 'Assembly & Electronics', description: 'Automotive paint repair' },
  { name: 'Color Matching Auto', category: 'Quality & Measurement', description: 'Automotive color match' },
  { name: 'Film Build Measurement', category: 'Quality & Measurement', description: 'Paint thickness measurement' },
  { name: 'Orange Peel Assessment', category: 'Quality & Measurement', description: 'Paint texture evaluation' },
  { name: 'DOI Measurement', category: 'Quality & Measurement', description: 'Distinctness of image' },

  // Assembly Skills
  { name: 'Instrument Panel Install', category: 'Assembly & Electronics', description: 'IP module installation' },
  { name: 'Powertrain Marriage', category: 'Assembly & Electronics', description: 'Engine/trans marriage' },
  { name: 'Front End Module Install', category: 'Assembly & Electronics', description: 'FEM installation' },
  { name: 'Cockpit Module Install Auto', category: 'Assembly & Electronics', description: 'Cockpit installation' },
  { name: 'Seat Installation Auto', category: 'Assembly & Electronics', description: 'Seat belt and seat install' },
  { name: 'Door Glass Install', category: 'Assembly & Electronics', description: 'Door glass installation' },
  { name: 'Windshield Install Auto', category: 'Assembly & Electronics', description: 'Windshield bonding' },
  { name: 'Headlamp Aim', category: 'Quality & Measurement', description: 'Headlight aiming' },
  { name: 'Wheel Alignment Auto', category: 'Quality & Measurement', description: 'Wheel alignment service' },
  { name: 'Brake Bleeding', category: 'Assembly & Electronics', description: 'Brake system bleeding' },
  { name: 'AC Charge Auto', category: 'Assembly & Electronics', description: 'Refrigerant charging' },
  { name: 'Fluid Fill Auto', category: 'Assembly & Electronics', description: 'Vehicle fluid filling' },
  { name: 'Final Inspection Auto', category: 'Quality & Measurement', description: 'Final line inspection' },
  { name: 'Water Leak Test Auto', category: 'Quality & Measurement', description: 'Water leak testing' },
  { name: 'Squeak Rattle Test', category: 'Quality & Measurement', description: 'BSR testing' },
  { name: 'Roll Test', category: 'Quality & Measurement', description: 'Chassis dyno testing' },

  // ============================================
  // INDUSTRIAL MACHINERY SKILLS (DMG Mori/Siemens) - 50+ skills
  // ============================================

  { name: 'Machine Bed Scraping', category: 'Machining', description: 'Hand scraping slideways' },
  { name: 'Ballscrew Installation', category: 'Assembly & Electronics', description: 'Precision ballscrew install' },
  { name: 'Linear Guide Install', category: 'Assembly & Electronics', description: 'Linear rail installation' },
  { name: 'Spindle Assembly', category: 'Assembly & Electronics', description: 'Machine spindle assembly' },
  { name: 'Spindle Balancing', category: 'Quality & Measurement', description: 'High speed spindle balance' },
  { name: 'Turret Assembly', category: 'Assembly & Electronics', description: 'Tool turret assembly' },
  { name: 'Tool Changer Assembly', category: 'Assembly & Electronics', description: 'ATC mechanism assembly' },
  { name: 'Machine Leveling', category: 'Quality & Measurement', description: 'Precision machine leveling' },
  { name: 'Geometric Alignment', category: 'Quality & Measurement', description: 'Machine geometry alignment' },
  { name: 'Laser Interferometry', category: 'Quality & Measurement', description: 'Laser position measurement' },
  { name: 'Ballbar Testing', category: 'Quality & Measurement', description: 'Circular interpolation test' },
  { name: 'Machine Calibration', category: 'Quality & Measurement', description: 'CNC machine calibration' },
  { name: 'Servo Tuning', category: 'Software & Programming', description: 'Servo system tuning' },
  { name: 'CNC Parameter Setup', category: 'Software & Programming', description: 'CNC control configuration' },
  { name: 'Ladder Logic Debug', category: 'Software & Programming', description: 'PLC ladder logic debug' },
  { name: 'Machine Acceptance Test', category: 'Quality & Measurement', description: 'Machine runoff testing' },
  { name: 'Cutting Test', category: 'Quality & Measurement', description: 'Machine cutting validation' },

  // ============================================
  // PHARMA/MEDICAL SKILLS (J&J/Cardinal Health) - 50+ skills
  // ============================================

  { name: 'cGMP Compliance', category: 'Quality & Measurement', description: 'Current good manufacturing practice' },
  { name: 'Aseptic Technique', category: 'Quality & Measurement', description: 'Sterile manufacturing technique' },
  { name: 'Gowning Qualification', category: 'Quality & Measurement', description: 'Cleanroom gowning qualification' },
  { name: 'Environmental Monitoring', category: 'Quality & Measurement', description: 'EM sampling and trending' },
  { name: 'HPLC Analysis', category: 'Quality & Measurement', description: 'HPLC method execution' },
  { name: 'GC Analysis', category: 'Quality & Measurement', description: 'Gas chromatography analysis' },
  { name: 'Dissolution Testing', category: 'Quality & Measurement', description: 'Dissolution method execution' },
  { name: 'Karl Fischer Titration', category: 'Quality & Measurement', description: 'Moisture content testing' },
  { name: 'Particle Count Testing', category: 'Quality & Measurement', description: 'Particulate matter testing' },
  { name: 'Endotoxin Testing', category: 'Quality & Measurement', description: 'LAL endotoxin analysis' },
  { name: 'Sterility Testing', category: 'Quality & Measurement', description: 'Product sterility testing' },
  { name: 'Bioburden Testing', category: 'Quality & Measurement', description: 'Microbial enumeration' },
  { name: 'Container Closure Test', category: 'Quality & Measurement', description: 'Package integrity testing' },
  { name: 'Tablet Compression', category: 'Assembly & Electronics', description: 'Tablet press operation' },
  { name: 'Capsule Filling', category: 'Assembly & Electronics', description: 'Capsule fill operation' },
  { name: 'Film Coating', category: 'Assembly & Electronics', description: 'Tablet film coating' },
  { name: 'Granulation Process', category: 'Assembly & Electronics', description: 'Wet/dry granulation' },
  { name: 'Blending Pharma', category: 'Assembly & Electronics', description: 'Pharmaceutical blending' },
  { name: 'Lyophilization', category: 'Assembly & Electronics', description: 'Freeze drying operation' },
  { name: 'Aseptic Filling', category: 'Assembly & Electronics', description: 'Sterile fill operation' },
  { name: 'Terminal Sterilization', category: 'Assembly & Electronics', description: 'Autoclave sterilization' },
  { name: 'Validation Protocol', category: 'Quality & Measurement', description: 'Process validation execution' },
  { name: 'Deviation Investigation', category: 'Quality & Measurement', description: 'Quality deviation investigation' },
  { name: 'CAPA Management', category: 'Quality & Measurement', description: 'Corrective and preventive action' },

  // ============================================
  // FOOD/CONSUMER GOODS SKILLS (Nestle/PepsiCo/P&G) - 50+ skills
  // ============================================

  { name: 'Food Safety HACCP', category: 'Quality & Measurement', description: 'HACCP plan execution' },
  { name: 'Allergen Management', category: 'Quality & Measurement', description: 'Allergen control procedures' },
  { name: 'Sanitation SOP', category: 'Quality & Measurement', description: 'Sanitation procedures' },
  { name: 'CIP System Operation', category: 'Assembly & Electronics', description: 'Clean in place operation' },
  { name: 'Pasteurization', category: 'Assembly & Electronics', description: 'Pasteurization process' },
  { name: 'UHT Processing', category: 'Assembly & Electronics', description: 'Ultra high temperature process' },
  { name: 'Retort Operation', category: 'Assembly & Electronics', description: 'Retort sterilization' },
  { name: 'Spray Drying Food', category: 'Assembly & Electronics', description: 'Spray dryer operation' },
  { name: 'Extrusion Food', category: 'Assembly & Electronics', description: 'Food extrusion process' },
  { name: 'Batch Cooking', category: 'Assembly & Electronics', description: 'Batch cooking operation' },
  { name: 'Continuous Cooking', category: 'Assembly & Electronics', description: 'Continuous cooker operation' },
  { name: 'Flavor Mixing', category: 'Assembly & Electronics', description: 'Flavor blend preparation' },
  { name: 'Carbonation Process', category: 'Assembly & Electronics', description: 'Beverage carbonation' },
  { name: 'Bottle Filling', category: 'Assembly & Electronics', description: 'Bottle fill operation' },
  { name: 'Can Seaming', category: 'Assembly & Electronics', description: 'Can seam operation' },
  { name: 'Aseptic Fill Food', category: 'Assembly & Electronics', description: 'Aseptic filling operation' },
  { name: 'Metal Detection', category: 'Quality & Measurement', description: 'Metal detector operation' },
  { name: 'X-Ray Inspection Food', category: 'Quality & Measurement', description: 'X-ray contaminant detection' },
  { name: 'Checkweighing', category: 'Quality & Measurement', description: 'Weight verification' },
  { name: 'Date Coding', category: 'Assembly & Electronics', description: 'Date code application' },
  { name: 'Carton Erecting', category: 'Assembly & Electronics', description: 'Carton forming operation' },
  { name: 'Case Packing', category: 'Assembly & Electronics', description: 'Case packer operation' },
  { name: 'Palletizing', category: 'Assembly & Electronics', description: 'Palletizer operation' },
  { name: 'Brix Testing', category: 'Quality & Measurement', description: 'Sugar content measurement' },
  { name: 'pH Testing Food', category: 'Quality & Measurement', description: 'Food pH measurement' },
  { name: 'Moisture Analysis Food', category: 'Quality & Measurement', description: 'Moisture content testing' },
  { name: 'Microbial Testing Food', category: 'Quality & Measurement', description: 'Food micro testing' },
  { name: 'Shelf Life Testing', category: 'Quality & Measurement', description: 'Shelf stability testing' },
  { name: 'Sensory Evaluation', category: 'Quality & Measurement', description: 'Product taste panel' },

  // ============================================
  // SOFTWARE/CAD SKILLS (Autodesk) - 20+ skills
  // ============================================

  { name: 'Geometric Modeling', category: 'Software & Programming', description: 'NURBS and solid modeling' },
  { name: 'Parametric Design', category: 'Software & Programming', description: 'Parametric CAD design' },
  { name: 'Direct Modeling', category: 'Software & Programming', description: 'Direct edit CAD operations' },
  { name: 'Assembly Modeling', category: 'Software & Programming', description: 'Assembly design techniques' },
  { name: 'Sheet Metal Design', category: 'Software & Programming', description: 'Sheet metal CAD design' },
  { name: 'Surface Modeling', category: 'Software & Programming', description: 'Complex surface design' },
  { name: 'Mesh Modeling', category: 'Software & Programming', description: 'Polygon mesh modeling' },
  { name: 'FEA Simulation', category: 'Software & Programming', description: 'Finite element analysis' },
  { name: 'CFD Simulation', category: 'Software & Programming', description: 'Computational fluid dynamics' },
  { name: 'Motion Simulation', category: 'Software & Programming', description: 'Mechanism simulation' },
  { name: 'Rendering Visualization', category: 'Software & Programming', description: '3D rendering and visualization' },
  { name: 'CAM Programming CAD', category: 'Software & Programming', description: 'CAM toolpath generation' },
  { name: 'Drawing Creation', category: 'Software & Programming', description: 'Technical drawing creation' },
  { name: 'BIM Modeling', category: 'Software & Programming', description: 'Building information modeling' },
  { name: 'Generative Design', category: 'Software & Programming', description: 'AI-driven design optimization' },
  { name: 'Point Cloud Processing', category: 'Software & Programming', description: 'Scan to CAD workflows' },
  { name: 'API Automation', category: 'Software & Programming', description: 'CAD API programming' },
  { name: 'PDM Integration', category: 'Software & Programming', description: 'Product data management' },
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

  // Additional Michigan Locations - Automotive Hub
  { state: 'MI', city: 'Sterling Heights', lat: 42.5803, lng: -83.0302, specialization: 'Automotive Assembly' },
  { state: 'MI', city: 'Romulus', lat: 42.2223, lng: -83.3966, specialization: 'Powertrain Components' },
  { state: 'MI', city: 'Hamtramck', lat: 42.3970, lng: -83.0497, specialization: 'Electric Vehicle Assembly' },
  { state: 'MI', city: 'Auburn Hills', lat: 42.6875, lng: -83.2341, specialization: 'Automotive R&D' },
  { state: 'MI', city: 'Pontiac', lat: 42.6389, lng: -83.2910, specialization: 'Automotive Parts' },
  { state: 'MI', city: 'Livonia', lat: 42.3684, lng: -83.3527, specialization: 'Transmission Components' },
  { state: 'MI', city: 'Troy', lat: 42.6064, lng: -83.1498, specialization: 'Automotive Engineering' },

  // Additional Texas Locations
  { state: 'TX', city: 'Round Rock', lat: 30.5083, lng: -97.6789, specialization: 'Computer Assembly' },
  { state: 'TX', city: 'Sherman', lat: 33.6356, lng: -96.6089, specialization: 'Semiconductor Fab' },
  { state: 'TX', city: 'Temple', lat: 31.0982, lng: -97.3428, specialization: 'Medical Devices' },
  { state: 'TX', city: 'Lubbock', lat: 33.5779, lng: -101.8552, specialization: 'Wind Turbine Components' },
  { state: 'TX', city: 'Midland', lat: 31.9973, lng: -102.0779, specialization: 'Oilfield Equipment' },
  { state: 'TX', city: 'Beaumont', lat: 30.0802, lng: -94.1266, specialization: 'Petrochemical' },
  { state: 'TX', city: 'Tyler', lat: 32.3513, lng: -95.3011, specialization: 'Oil Equipment' },
  { state: 'TX', city: 'Waco', lat: 31.5493, lng: -97.1467, specialization: 'Agricultural Equipment' },

  // Additional California Locations
  { state: 'CA', city: 'Irvine', lat: 33.6846, lng: -117.8265, specialization: 'Medical Devices' },
  { state: 'CA', city: 'Torrance', lat: 33.8358, lng: -118.3406, specialization: 'Automotive R&D' },
  { state: 'CA', city: 'Sunnyvale', lat: 37.3688, lng: -122.0363, specialization: 'Semiconductor' },
  { state: 'CA', city: 'Mountain View', lat: 37.3861, lng: -122.0839, specialization: 'Tech Hardware' },
  { state: 'CA', city: 'Hayward', lat: 37.6688, lng: -122.0808, specialization: 'Biotech Manufacturing' },
  { state: 'CA', city: 'Oakland', lat: 37.8044, lng: -122.2712, specialization: 'Food Processing' },
  { state: 'CA', city: 'Sacramento', lat: 38.5816, lng: -121.4944, specialization: 'Medical Equipment' },
  { state: 'CA', city: 'Bakersfield', lat: 35.3733, lng: -119.0187, specialization: 'Agriculture Equipment' },

  // Additional Ohio Locations
  { state: 'OH', city: 'Lima', lat: 40.7425, lng: -84.1052, specialization: 'Tank Manufacturing' },
  { state: 'OH', city: 'Mansfield', lat: 40.7589, lng: -82.5155, specialization: 'Automotive Parts' },
  { state: 'OH', city: 'Defiance', lat: 41.2845, lng: -84.3558, specialization: 'Powertrain' },
  { state: 'OH', city: 'Marion', lat: 40.5887, lng: -83.1285, specialization: 'Heavy Equipment' },
  { state: 'OH', city: 'Newark', lat: 40.0581, lng: -82.4013, specialization: 'Glass Manufacturing' },
  { state: 'OH', city: 'Findlay', lat: 41.0442, lng: -83.6499, specialization: 'Industrial Machinery' },

  // Additional Indiana Locations
  { state: 'IN', city: 'Anderson', lat: 40.1053, lng: -85.6803, specialization: 'Automotive Components' },
  { state: 'IN', city: 'Kokomo', lat: 40.4864, lng: -86.1336, specialization: 'Transmission Assembly' },
  { state: 'IN', city: 'Evansville', lat: 37.9716, lng: -87.5711, specialization: 'Appliance Manufacturing' },
  { state: 'IN', city: 'South Bend', lat: 41.6764, lng: -86.2520, specialization: 'Automotive' },
  { state: 'IN', city: 'Terre Haute', lat: 39.4667, lng: -87.4139, specialization: 'Pharmaceutical' },

  // Additional Pennsylvania Locations
  { state: 'PA', city: 'Harrisburg', lat: 40.2732, lng: -76.8867, specialization: 'Industrial Equipment' },
  { state: 'PA', city: 'Scranton', lat: 41.4090, lng: -75.6624, specialization: 'Textile Machinery' },
  { state: 'PA', city: 'Reading', lat: 40.3356, lng: -75.9269, specialization: 'Metal Fabrication' },
  { state: 'PA', city: 'Lancaster', lat: 40.0379, lng: -76.3055, specialization: 'Industrial Equipment' },
  { state: 'PA', city: 'Bethlehem', lat: 40.6259, lng: -75.3705, specialization: 'Steel Processing' },

  // Additional Arizona Locations
  { state: 'AZ', city: 'Gilbert', lat: 33.3528, lng: -111.7890, specialization: 'Semiconductor Testing' },
  { state: 'AZ', city: 'Scottsdale', lat: 33.4942, lng: -111.9261, specialization: 'Aerospace Components' },
  { state: 'AZ', city: 'Glendale', lat: 33.5387, lng: -112.1860, specialization: 'Defense Systems' },
  { state: 'AZ', city: 'Goodyear', lat: 33.4353, lng: -112.3587, specialization: 'Aerospace Assembly' },

  // Additional North Carolina Locations
  { state: 'NC', city: 'Winston-Salem', lat: 36.0999, lng: -80.2442, specialization: 'Biotech' },
  { state: 'NC', city: 'Asheville', lat: 35.5951, lng: -82.5515, specialization: 'Precision Components' },
  { state: 'NC', city: 'Wilmington', lat: 34.2257, lng: -77.9447, specialization: 'Pharmaceutical' },
  { state: 'NC', city: 'Fayetteville', lat: 35.0527, lng: -78.8784, specialization: 'Military Equipment' },

  // Additional Georgia Locations
  { state: 'GA', city: 'Macon', lat: 32.8407, lng: -83.6324, specialization: 'Aerospace Assembly' },
  { state: 'GA', city: 'Columbus', lat: 32.4610, lng: -84.9877, specialization: 'Military Vehicles' },
  { state: 'GA', city: 'Albany', lat: 31.5785, lng: -84.1557, specialization: 'Food Processing' },
  { state: 'GA', city: 'Marietta', lat: 33.9526, lng: -84.5499, specialization: 'Aircraft Assembly' },

  // Additional Tennessee Locations
  { state: 'TN', city: 'Knoxville', lat: 35.9606, lng: -83.9207, specialization: 'Nuclear Components' },
  { state: 'TN', city: 'Jackson', lat: 35.6145, lng: -88.8139, specialization: 'Automotive Parts' },
  { state: 'TN', city: 'Clarksville', lat: 36.5298, lng: -87.3595, specialization: 'Industrial Equipment' },
  { state: 'TN', city: 'Spring Hill', lat: 35.7512, lng: -86.9300, specialization: 'Automotive Assembly' },

  // Additional South Carolina Locations
  { state: 'SC', city: 'Columbia', lat: 34.0007, lng: -81.0348, specialization: 'Electrical Equipment' },
  { state: 'SC', city: 'Anderson', lat: 34.5034, lng: -82.6501, specialization: 'Automotive Parts' },
  { state: 'SC', city: 'Greer', lat: 34.9385, lng: -82.2270, specialization: 'Automotive Assembly' },
  { state: 'SC', city: 'Rock Hill', lat: 34.9249, lng: -81.0251, specialization: 'Textile Machinery' },

  // Additional Alabama Locations
  { state: 'AL', city: 'Tuscaloosa', lat: 33.2098, lng: -87.5692, specialization: 'Automotive Assembly' },
  { state: 'AL', city: 'Decatur', lat: 34.6059, lng: -86.9833, specialization: 'Chemical Manufacturing' },
  { state: 'AL', city: 'Auburn', lat: 32.6099, lng: -85.4808, specialization: 'Automotive Components' },
  { state: 'AL', city: 'Anniston', lat: 33.6598, lng: -85.8316, specialization: 'Military Vehicle Overhaul' },

  // Additional Kentucky Locations
  { state: 'KY', city: 'Georgetown', lat: 38.2098, lng: -84.5588, specialization: 'Automotive Assembly' },
  { state: 'KY', city: 'Owensboro', lat: 37.7719, lng: -87.1112, specialization: 'Aluminum Products' },
  { state: 'KY', city: 'Richmond', lat: 37.7479, lng: -84.2947, specialization: 'Automotive Parts' },
  { state: 'KY', city: 'Florence', lat: 38.9990, lng: -84.6266, specialization: 'Electronics Assembly' },

  // Additional Wisconsin Locations
  { state: 'WI', city: 'Kenosha', lat: 42.5847, lng: -87.8212, specialization: 'Automotive Parts' },
  { state: 'WI', city: 'Madison', lat: 43.0731, lng: -89.4012, specialization: 'Medical Equipment' },
  { state: 'WI', city: 'Wausau', lat: 44.9591, lng: -89.6301, specialization: 'Paper Machinery' },
  { state: 'WI', city: 'La Crosse', lat: 43.8014, lng: -91.2396, specialization: 'Medical Devices' },
  { state: 'WI', city: 'Manitowoc', lat: 44.0886, lng: -87.6576, specialization: 'Crane Manufacturing' },

  // Additional Minnesota Locations
  { state: 'MN', city: 'Duluth', lat: 46.7867, lng: -92.1005, specialization: 'Paper Products' },
  { state: 'MN', city: 'Bloomington', lat: 44.8408, lng: -93.2983, specialization: 'Medical Devices' },
  { state: 'MN', city: 'Eden Prairie', lat: 44.8547, lng: -93.4708, specialization: 'Electronics' },
  { state: 'MN', city: 'Mankato', lat: 44.1636, lng: -93.9994, specialization: 'Food Processing' },

  // Additional Missouri Locations
  { state: 'MO', city: 'Columbia', lat: 38.9517, lng: -92.3341, specialization: 'Medical Equipment' },
  { state: 'MO', city: 'Jefferson City', lat: 38.5767, lng: -92.1735, specialization: 'Government Equipment' },
  { state: 'MO', city: 'Joplin', lat: 37.0842, lng: -94.5133, specialization: 'Metal Fabrication' },
  { state: 'MO', city: 'St. Joseph', lat: 39.7675, lng: -94.8467, specialization: 'Food Processing' },

  // Additional Illinois Locations
  { state: 'IL', city: 'Decatur', lat: 39.8403, lng: -88.9548, specialization: 'Agricultural Processing' },
  { state: 'IL', city: 'Champaign', lat: 40.1164, lng: -88.2434, specialization: 'Research Equipment' },
  { state: 'IL', city: 'Joliet', lat: 41.5250, lng: -88.0817, specialization: 'Heavy Equipment' },
  { state: 'IL', city: 'Normal', lat: 40.5142, lng: -88.9906, specialization: 'Electrical Equipment' },
  { state: 'IL', city: 'East Peoria', lat: 40.6661, lng: -89.5801, specialization: 'Construction Equipment' },

  // Additional Washington Locations
  { state: 'WA', city: 'Vancouver', lat: 45.6387, lng: -122.6615, specialization: 'Electronics' },
  { state: 'WA', city: 'Bellingham', lat: 48.7519, lng: -122.4787, specialization: 'Aluminum Processing' },
  { state: 'WA', city: 'Kent', lat: 47.3809, lng: -122.2348, specialization: 'Aerospace Parts' },
  { state: 'WA', city: 'Auburn', lat: 47.3073, lng: -122.2285, specialization: 'Aerospace Components' },

  // Additional Oregon Locations
  { state: 'OR', city: 'Eugene', lat: 44.0521, lng: -123.0868, specialization: 'Wood Products' },
  { state: 'OR', city: 'Salem', lat: 44.9429, lng: -123.0351, specialization: 'Food Processing' },
  { state: 'OR', city: 'Bend', lat: 44.0582, lng: -121.3153, specialization: 'Recreation Equipment' },

  // Additional Colorado Locations
  { state: 'CO', city: 'Fort Collins', lat: 40.5853, lng: -105.0844, specialization: 'Clean Technology' },
  { state: 'CO', city: 'Pueblo', lat: 38.2544, lng: -104.6091, specialization: 'Steel Production' },
  { state: 'CO', city: 'Longmont', lat: 40.1672, lng: -105.1019, specialization: 'Semiconductor' },
  { state: 'CO', city: 'Loveland', lat: 40.3978, lng: -105.0750, specialization: 'Electronics' },

  // Additional Utah Locations
  { state: 'UT', city: 'Clearfield', lat: 41.1105, lng: -112.0261, specialization: 'Defense Logistics' },
  { state: 'UT', city: 'Logan', lat: 41.7370, lng: -111.8338, specialization: 'Aerospace Components' },
  { state: 'UT', city: 'St. George', lat: 37.0965, lng: -113.5684, specialization: 'Composite Materials' },

  // Additional Nevada Locations
  { state: 'NV', city: 'Henderson', lat: 36.0395, lng: -114.9817, specialization: 'Battery Assembly' },
  { state: 'NV', city: 'Carson City', lat: 39.1638, lng: -119.7674, specialization: 'Precision Manufacturing' },

  // Additional Florida Locations
  { state: 'FL', city: 'Miami', lat: 25.7617, lng: -80.1918, specialization: 'Aircraft Maintenance' },
  { state: 'FL', city: 'Fort Lauderdale', lat: 26.1224, lng: -80.1373, specialization: 'Marine Electronics' },
  { state: 'FL', city: 'St. Petersburg', lat: 27.7676, lng: -82.6403, specialization: 'Defense Systems' },
  { state: 'FL', city: 'Tallahassee', lat: 30.4383, lng: -84.2807, specialization: 'Medical Equipment' },
  { state: 'FL', city: 'Pensacola', lat: 30.4213, lng: -87.2169, specialization: 'Naval Aircraft' },

  // Additional New York Locations
  { state: 'NY', city: 'Binghamton', lat: 42.0987, lng: -75.9180, specialization: 'Defense Electronics' },
  { state: 'NY', city: 'Schenectady', lat: 42.8142, lng: -73.9396, specialization: 'Turbine Manufacturing' },
  { state: 'NY', city: 'Utica', lat: 43.1009, lng: -75.2327, specialization: 'Precision Instruments' },
  { state: 'NY', city: 'Poughkeepsie', lat: 41.7004, lng: -73.9210, specialization: 'Computer Systems' },

  // Additional Massachusetts Locations
  { state: 'MA', city: 'Lowell', lat: 42.6334, lng: -71.3162, specialization: 'Defense Electronics' },
  { state: 'MA', city: 'Cambridge', lat: 42.3736, lng: -71.1097, specialization: 'Biotech' },
  { state: 'MA', city: 'Waltham', lat: 42.3765, lng: -71.2356, specialization: 'Medical Devices' },
  { state: 'MA', city: 'Tewksbury', lat: 42.6104, lng: -71.2342, specialization: 'Defense Systems' },

  // Additional Connecticut Locations
  { state: 'CT', city: 'Bridgeport', lat: 41.1865, lng: -73.1952, specialization: 'Helicopter Manufacturing' },
  { state: 'CT', city: 'Stratford', lat: 41.1845, lng: -73.1332, specialization: 'Helicopter Assembly' },
  { state: 'CT', city: 'Middletown', lat: 41.5623, lng: -72.6506, specialization: 'Aerospace Parts' },
  { state: 'CT', city: 'East Hartford', lat: 41.7823, lng: -72.6120, specialization: 'Jet Engines' },

  // Additional New Jersey Locations
  { state: 'NJ', city: 'Camden', lat: 39.9259, lng: -75.1196, specialization: 'Naval Systems' },
  { state: 'NJ', city: 'Clifton', lat: 40.8584, lng: -74.1638, specialization: 'Pharmaceutical' },
  { state: 'NJ', city: 'Piscataway', lat: 40.5362, lng: -74.4684, specialization: 'Electronics' },
  { state: 'NJ', city: 'Edison', lat: 40.5187, lng: -74.4121, specialization: 'Medical Devices' },

  // Additional Louisiana Locations
  { state: 'LA', city: 'Lake Charles', lat: 30.2266, lng: -93.2174, specialization: 'Petrochemical' },
  { state: 'LA', city: 'Shreveport', lat: 32.5252, lng: -93.7502, specialization: 'Steel Fabrication' },
  { state: 'LA', city: 'Houma', lat: 29.5958, lng: -90.7195, specialization: 'Offshore Equipment' },

  // Additional Oklahoma Locations
  { state: 'OK', city: 'Oklahoma City', lat: 35.4676, lng: -97.5164, specialization: 'Aerospace' },
  { state: 'OK', city: 'Tulsa', lat: 36.1540, lng: -95.9928, specialization: 'Aerospace Components' },
  { state: 'OK', city: 'McAlester', lat: 34.9334, lng: -95.7696, specialization: 'Ammunition' },

  // More Automotive Manufacturing Locations
  { state: 'MI', city: 'Battle Creek', lat: 42.3212, lng: -85.1797, specialization: 'Electric Vehicle Components' },
  { state: 'MI', city: 'Holland', lat: 42.7875, lng: -86.1089, specialization: 'Automotive Interiors' },
  { state: 'MI', city: 'Muskegon', lat: 43.2342, lng: -86.2484, specialization: 'Engine Components' },
  { state: 'OH', city: 'Lordstown', lat: 41.1656, lng: -80.8687, specialization: 'Electric Vehicle Assembly' },
  { state: 'OH', city: 'Marysville', lat: 40.2364, lng: -83.3671, specialization: 'Automotive Assembly' },
  { state: 'OH', city: 'East Liberty', lat: 40.3142, lng: -83.5763, specialization: 'Automotive Assembly' },
  { state: 'IN', city: 'Princeton', lat: 38.3553, lng: -87.5678, specialization: 'SUV Assembly' },
  { state: 'IN', city: 'Roanoke', lat: 40.9634, lng: -85.3766, specialization: 'Powertrain' },
  { state: 'KY', city: 'Elizabethtown', lat: 37.6940, lng: -85.8591, specialization: 'Automotive Parts' },
  { state: 'TN', city: 'Decherd', lat: 35.2095, lng: -86.0784, specialization: 'Powertrain Components' },
  { state: 'AL', city: 'Vance', lat: 33.1737, lng: -87.2325, specialization: 'Automotive Assembly' },
  { state: 'MS', city: 'Blue Springs', lat: 34.4151, lng: -88.7876, specialization: 'Pickup Truck Assembly' },
  { state: 'TX', city: 'San Antonio South', lat: 29.3400, lng: -98.5100, specialization: 'Pickup Truck Assembly' },

  // More Semiconductor and Electronics
  { state: 'AZ', city: 'Chandler East', lat: 33.3100, lng: -111.7900, specialization: 'Semiconductor Packaging' },
  { state: 'AZ', city: 'Phoenix North', lat: 33.5200, lng: -112.0400, specialization: 'Wafer Fabrication' },
  { state: 'TX', city: 'Richardson', lat: 32.9483, lng: -96.7299, specialization: 'Semiconductor Testing' },
  { state: 'TX', city: 'Lewisville', lat: 33.0462, lng: -96.9942, specialization: 'Electronics Assembly' },
  { state: 'CA', city: 'San Jose South', lat: 37.2800, lng: -121.8600, specialization: 'Chip Design' },
  { state: 'CA', city: 'Folsom', lat: 38.6780, lng: -121.1761, specialization: 'Semiconductor R&D' },
  { state: 'OR', city: 'Wilsonville', lat: 45.2998, lng: -122.7730, specialization: 'Test Equipment' },
  { state: 'ID', city: 'Boise', lat: 43.6150, lng: -116.2023, specialization: 'Memory Chips' },
  { state: 'NY', city: 'Malta', lat: 42.9850, lng: -73.7930, specialization: 'Semiconductor Foundry' },
  { state: 'VT', city: 'Essex Junction', lat: 44.4900, lng: -73.1100, specialization: 'RF Semiconductors' },

  // More Aerospace and Defense
  { state: 'WA', city: 'Moses Lake', lat: 47.1301, lng: -119.2781, specialization: 'Composite Structures' },
  { state: 'WA', city: 'Paine Field', lat: 47.9063, lng: -122.2827, specialization: 'Aircraft Final Assembly' },
  { state: 'CA', city: 'Mojave', lat: 35.0525, lng: -118.1739, specialization: 'Space Launch Systems' },
  { state: 'CA', city: 'Hawthorne', lat: 33.9164, lng: -118.3526, specialization: 'Rocket Manufacturing' },
  { state: 'CA', city: 'Seal Beach', lat: 33.7414, lng: -118.1048, specialization: 'Defense Systems' },
  { state: 'TX', city: 'Grand Prairie', lat: 32.7459, lng: -96.9978, specialization: 'Helicopter Assembly' },
  { state: 'TX', city: 'Boca Chica', lat: 25.9974, lng: -97.1560, specialization: 'Rocket Assembly' },
  { state: 'FL', city: 'Merritt Island', lat: 28.3582, lng: -80.6719, specialization: 'Space Launch Operations' },

  // SpaceX Facilities
  { state: 'TX', city: 'McGregor', lat: 31.4383, lng: -97.4108, specialization: 'Rocket Engine Testing' },
  { state: 'CA', city: 'Hawthorne SpaceX HQ', lat: 33.9207, lng: -118.3280, specialization: 'Falcon Production' },
  { state: 'TX', city: 'Starbase', lat: 25.9971, lng: -97.1553, specialization: 'Starship Manufacturing' },
  { state: 'FL', city: 'Cape Canaveral LC-40', lat: 28.5618, lng: -80.5770, specialization: 'Launch Operations' },
  { state: 'FL', city: 'Kennedy LC-39A', lat: 28.6083, lng: -80.6041, specialization: 'Crew Launch Operations' },
  { state: 'CA', city: 'Vandenberg SLC-4', lat: 34.6321, lng: -120.6107, specialization: 'Polar Launch Operations' },
  { state: 'WA', city: 'Redmond Starlink', lat: 47.6740, lng: -122.1215, specialization: 'Starlink Satellite Production' },
  { state: 'TX', city: 'Brownsville Starlink', lat: 25.9544, lng: -97.4892, specialization: 'Starlink Manufacturing' },

  // Tesla Facilities
  { state: 'CA', city: 'Fremont Factory', lat: 37.4945, lng: -121.9441, specialization: 'EV Assembly' },
  { state: 'TX', city: 'Austin Gigafactory', lat: 30.2225, lng: -97.6189, specialization: 'EV and Battery Production' },
  { state: 'NV', city: 'Sparks Gigafactory', lat: 39.5383, lng: -119.4448, specialization: 'Battery Cell Production' },
  { state: 'NY', city: 'Buffalo Gigafactory', lat: 42.9016, lng: -78.8487, specialization: 'Solar and Energy Storage' },
  { state: 'CA', city: 'Lathrop Megafactory', lat: 37.8283, lng: -121.2765, specialization: 'Megapack Production' },
  { state: 'CA', city: 'Palo Alto Engineering', lat: 37.3944, lng: -122.1501, specialization: 'Engineering and R&D' },
  { state: 'MI', city: 'Detroit Service', lat: 42.3314, lng: -83.0458, specialization: 'Service and Parts' },
  { state: 'AL', city: 'Decatur North', lat: 34.6100, lng: -86.9800, specialization: 'Rocket Propulsion' },
  { state: 'MD', city: 'Bethesda', lat: 38.9847, lng: -77.0947, specialization: 'Defense Electronics' },
  { state: 'VA', city: 'Manassas', lat: 38.7509, lng: -77.4753, specialization: 'Defense Sensors' },
  { state: 'CT', city: 'Windsor Locks', lat: 41.9290, lng: -72.6277, specialization: 'Aircraft Engines' },
  { state: 'KS', city: 'Wichita East', lat: 37.6900, lng: -97.2800, specialization: 'Aircraft Structures' },

  // More Medical Devices and Pharma
  { state: 'MN', city: 'Fridley', lat: 45.0860, lng: -93.2636, specialization: 'Cardiac Devices' },
  { state: 'MN', city: 'Plymouth', lat: 45.0105, lng: -93.4555, specialization: 'Neuromodulation' },
  { state: 'MA', city: 'Marlborough', lat: 42.3459, lng: -71.5523, specialization: 'Surgical Devices' },
  { state: 'MA', city: 'Bedford', lat: 42.4906, lng: -71.2760, specialization: 'Diagnostic Equipment' },
  { state: 'CA', city: 'Santa Ana', lat: 33.7455, lng: -117.8677, specialization: 'Cardiovascular Devices' },
  { state: 'CA', city: 'Aliso Viejo', lat: 33.5750, lng: -117.7256, specialization: 'Glucose Monitors' },
  { state: 'IN', city: 'Warsaw', lat: 41.2381, lng: -85.8530, specialization: 'Orthopedic Implants' },
  { state: 'NJ', city: 'Raritan', lat: 40.5687, lng: -74.6332, specialization: 'Pharmaceutical Manufacturing' },
  { state: 'NC', city: 'Research Triangle', lat: 35.8992, lng: -78.8634, specialization: 'Biotech Manufacturing' },
  { state: 'PA', city: 'West Chester', lat: 39.9606, lng: -75.6055, specialization: 'Pharmaceutical' },

  // More Heavy Equipment and Industrial
  { state: 'IL', city: 'East Peoria Plant 2', lat: 40.6700, lng: -89.5750, specialization: 'Bulldozers and Excavators' },
  { state: 'IL', city: 'Aurora West', lat: 41.7600, lng: -88.3400, specialization: 'Hydraulic Equipment' },
  { state: 'WI', city: 'West Allis', lat: 43.0167, lng: -88.0070, specialization: 'Mining Equipment' },
  { state: 'WI', city: 'Milwaukee South', lat: 42.9800, lng: -87.9100, specialization: 'Industrial Controls' },
  { state: 'IA', city: 'Waterloo', lat: 42.4928, lng: -92.3426, specialization: 'Tractor Manufacturing' },
  { state: 'IA', city: 'Dubuque', lat: 42.5006, lng: -90.6646, specialization: 'Construction Equipment' },
  { state: 'NE', city: 'Grand Island', lat: 40.9264, lng: -98.3420, specialization: 'Agricultural Equipment' },
  { state: 'KS', city: 'Hutchinson', lat: 38.0608, lng: -97.9298, specialization: 'Grain Equipment' },
  { state: 'SD', city: 'Watertown', lat: 44.8994, lng: -97.1151, specialization: 'Farm Machinery' },
  { state: 'ND', city: 'Wahpeton', lat: 46.2652, lng: -96.6059, specialization: 'Ag Tech Equipment' },

  // More Steel and Metals
  { state: 'IN', city: 'Burns Harbor', lat: 41.6264, lng: -87.1333, specialization: 'Steel Production' },
  { state: 'IN', city: 'East Chicago', lat: 41.6392, lng: -87.4545, specialization: 'Steel Processing' },
  { state: 'PA', city: 'Coatesville', lat: 39.9834, lng: -75.8238, specialization: 'Plate Steel' },
  { state: 'OH', city: 'Middletown', lat: 39.5150, lng: -84.3983, specialization: 'Steel Rolling' },
  { state: 'AL', city: 'Fairfield', lat: 33.4859, lng: -86.9119, specialization: 'Tubular Steel' },
  { state: 'TX', city: 'Baytown', lat: 29.7355, lng: -94.9774, specialization: 'Steel Pipe' },
  { state: 'AR', city: 'Blytheville', lat: 35.9273, lng: -89.9190, specialization: 'Steel Coils' },
  { state: 'WV', city: 'Weirton', lat: 40.4189, lng: -80.5895, specialization: 'Tin Mill Products' },

  // More Energy Equipment
  { state: 'TX', city: 'Houston North', lat: 29.8500, lng: -95.3600, specialization: 'Drilling Equipment' },
  { state: 'TX', city: 'Odessa', lat: 31.8457, lng: -102.3676, specialization: 'Oilfield Services' },
  { state: 'OK', city: 'Duncan', lat: 34.5023, lng: -97.9578, specialization: 'Oil Wellheads' },
  { state: 'LA', city: 'Port Allen', lat: 30.4521, lng: -91.2101, specialization: 'Refinery Equipment' },
  { state: 'CO', city: 'Brighton', lat: 39.9852, lng: -104.8206, specialization: 'Solar Inverters' },
  { state: 'CA', city: 'Lancaster', lat: 34.6868, lng: -118.1542, specialization: 'Solar Cell Production' },
  { state: 'NV', city: 'Sparks East', lat: 39.5400, lng: -119.7400, specialization: 'Battery Cells' },
  { state: 'OH', city: 'Lordstown Energy', lat: 41.1700, lng: -80.8600, specialization: 'EV Battery Plant' },

  // More Food Processing
  { state: 'NE', city: 'Columbus', lat: 41.4297, lng: -97.3684, specialization: 'Meat Processing' },
  { state: 'KS', city: 'Garden City', lat: 37.9717, lng: -100.8727, specialization: 'Beef Processing' },
  { state: 'MN', city: 'Austin', lat: 43.6666, lng: -92.9746, specialization: 'Processed Foods' },
  { state: 'IA', city: 'Storm Lake', lat: 42.6411, lng: -95.2097, specialization: 'Pork Processing' },
  { state: 'GA', city: 'Gainesville', lat: 34.2979, lng: -83.8241, specialization: 'Poultry Processing' },
  { state: 'AR', city: 'Springdale', lat: 36.1867, lng: -94.1288, specialization: 'Poultry Products' },
  { state: 'NC', city: 'Smithfield', lat: 35.5085, lng: -78.3395, specialization: 'Pork Products' },
  { state: 'WI', city: 'Green Bay East', lat: 44.5200, lng: -87.9800, specialization: 'Dairy Products' },

  // More Appliance and Consumer Goods
  { state: 'MI', city: 'Benton Harbor', lat: 42.1167, lng: -86.4542, specialization: 'Kitchen Appliances' },
  { state: 'OH', city: 'Clyde', lat: 41.3042, lng: -82.9752, specialization: 'Washing Machines' },
  { state: 'TN', city: 'Cleveland', lat: 35.1595, lng: -84.8766, specialization: 'Home Appliances' },
  { state: 'KY', city: 'Findlay', lat: 37.7828, lng: -85.5069, specialization: 'HVAC Systems' },
  { state: 'IA', city: 'Newton', lat: 41.6997, lng: -93.0480, specialization: 'Laundry Equipment' },
  { state: 'SC', city: 'Newberry', lat: 34.2746, lng: -81.6187, specialization: 'Air Conditioners' },

  // More Chemical and Materials
  { state: 'TX', city: 'Freeport', lat: 28.9541, lng: -95.3597, specialization: 'Chemical Production' },
  { state: 'LA', city: 'Plaquemine', lat: 30.2891, lng: -91.2343, specialization: 'Polyethylene' },
  { state: 'TN', city: 'Kingsport', lat: 36.5484, lng: -82.5618, specialization: 'Specialty Chemicals' },
  { state: 'WV', city: 'Parkersburg', lat: 39.2667, lng: -81.5615, specialization: 'Polymers' },
  { state: 'MI', city: 'Midland', lat: 43.6156, lng: -84.2472, specialization: 'Silicones' },
  { state: 'DE', city: 'Newark', lat: 39.6837, lng: -75.7497, specialization: 'Specialty Materials' },

  // More Tools and Industrial Products
  { state: 'CT', city: 'New Britain', lat: 41.6612, lng: -72.7795, specialization: 'Hand Tools' },
  { state: 'CT', city: 'Torrington', lat: 41.8007, lng: -73.1212, specialization: 'Bearings and Fasteners' },
  { state: 'OH', city: 'Cleveland East', lat: 41.5100, lng: -81.6500, specialization: 'Welding Equipment' },
  { state: 'WI', city: 'Kenosha South', lat: 42.5700, lng: -87.8300, specialization: 'Power Tools' },
  { state: 'MD', city: 'Towson', lat: 39.4015, lng: -76.6019, specialization: 'Measurement Tools' },
  { state: 'IL', city: 'Skokie', lat: 42.0324, lng: -87.7416, specialization: 'Industrial Controls' },

  // Additional Diverse Manufacturing Locations
  { state: 'CA', city: 'Ontario', lat: 34.0633, lng: -117.6509, specialization: 'Logistics Equipment' },
  { state: 'CA', city: 'Riverside', lat: 33.9533, lng: -117.3962, specialization: 'Electronics Assembly' },
  { state: 'CA', city: 'Stockton', lat: 37.9577, lng: -121.2908, specialization: 'Food Processing' },
  { state: 'CA', city: 'Modesto', lat: 37.6391, lng: -120.9969, specialization: 'Agriculture Equipment' },
  { state: 'CA', city: 'Oxnard', lat: 34.1975, lng: -119.1771, specialization: 'Defense Electronics' },
  { state: 'TX', city: 'McKinney', lat: 33.1972, lng: -96.6397, specialization: 'Semiconductor' },
  { state: 'TX', city: 'Frisco', lat: 33.1507, lng: -96.8236, specialization: 'Electronics' },
  { state: 'TX', city: 'Garland', lat: 32.9126, lng: -96.6389, specialization: 'Electronics Assembly' },
  { state: 'TX', city: 'Laredo', lat: 27.5036, lng: -99.5076, specialization: 'Automotive Parts' },
  { state: 'TX', city: 'Brownsville', lat: 25.9017, lng: -97.4975, specialization: 'Electronics Assembly' },
  { state: 'AZ', city: 'Yuma', lat: 32.6927, lng: -114.6277, specialization: 'Defense Testing' },
  { state: 'AZ', city: 'Prescott', lat: 34.5400, lng: -112.4685, specialization: 'Aerospace Components' },
  { state: 'NM', city: 'Las Cruces', lat: 32.3199, lng: -106.7637, specialization: 'Space Systems' },
  { state: 'NM', city: 'Santa Fe', lat: 35.6870, lng: -105.9378, specialization: 'Precision Optics' },
  { state: 'NC', city: 'Hickory', lat: 35.7344, lng: -81.3412, specialization: 'Fiber Optics' },
  { state: 'NC', city: 'High Point', lat: 35.9557, lng: -80.0053, specialization: 'Furniture Manufacturing' },
  { state: 'SC', city: 'Florence', lat: 34.1954, lng: -79.7626, specialization: 'Automotive Parts' },
  { state: 'GA', city: 'Warner Robins', lat: 32.6130, lng: -83.6238, specialization: 'Aircraft Maintenance' },
  { state: 'GA', city: 'Dalton', lat: 34.7698, lng: -84.9702, specialization: 'Flooring Products' },
  { state: 'FL', city: 'Daytona Beach', lat: 29.2108, lng: -81.0228, specialization: 'Motorsport Equipment' },
  { state: 'FL', city: 'Gainesville', lat: 29.6516, lng: -82.3248, specialization: 'Medical Equipment' },
  { state: 'FL', city: 'Ocala', lat: 29.1872, lng: -82.1401, specialization: 'Logistics Equipment' },
  { state: 'VA', city: 'Lynchburg', lat: 37.4138, lng: -79.1422, specialization: 'Nuclear Components' },
  { state: 'VA', city: 'Roanoke', lat: 37.2710, lng: -79.9414, specialization: 'Railroad Equipment' },
  { state: 'VA', city: 'Hampton', lat: 37.0299, lng: -76.3452, specialization: 'Aerospace' },
  { state: 'PA', city: 'Johnstown', lat: 40.3267, lng: -78.9220, specialization: 'Defense Systems' },
  { state: 'PA', city: 'State College', lat: 40.7934, lng: -77.8600, specialization: 'Research Equipment' },
  { state: 'NY', city: 'Ithaca', lat: 42.4440, lng: -76.5019, specialization: 'Scientific Instruments' },
  { state: 'NY', city: 'Corning', lat: 42.1428, lng: -77.0547, specialization: 'Glass and Ceramics' },
  { state: 'OH', city: 'Sandusky', lat: 41.4489, lng: -82.7079, specialization: 'Automotive Parts' },
  { state: 'OH', city: 'Zanesville', lat: 39.9403, lng: -82.0132, specialization: 'Ceramics' },
  { state: 'IN', city: 'Muncie', lat: 40.1934, lng: -85.3864, specialization: 'Automotive Parts' },
  { state: 'IN', city: 'Richmond', lat: 39.8289, lng: -84.8902, specialization: 'Lawn Equipment' },
  { state: 'MI', city: 'Saginaw', lat: 43.4195, lng: -83.9508, specialization: 'Automotive Steering' },
  { state: 'MI', city: 'Jackson', lat: 42.2459, lng: -84.4013, specialization: 'Automotive Parts' },
  { state: 'MI', city: 'Kalamazoo', lat: 42.2917, lng: -85.5872, specialization: 'Pharmaceutical' },
  { state: 'WI', city: 'Janesville', lat: 42.6828, lng: -89.0187, specialization: 'Automotive Assembly' },
  { state: 'WI', city: 'Beloit', lat: 42.5083, lng: -89.0318, specialization: 'Paper Machinery' },
  { state: 'MN', city: 'St. Cloud', lat: 45.5579, lng: -94.1632, specialization: 'Granite Processing' },
  { state: 'MN', city: 'Winona', lat: 44.0499, lng: -91.6393, specialization: 'Composite Materials' },
  { state: 'IA', city: 'Mason City', lat: 43.1536, lng: -93.2010, specialization: 'Agricultural Equipment' },
  { state: 'IA', city: 'Ottumwa', lat: 41.0200, lng: -92.4113, specialization: 'Meat Processing' },
  { state: 'MO', city: 'Cape Girardeau', lat: 37.3059, lng: -89.5181, specialization: 'Concrete Products' },
  { state: 'MO', city: 'Sedalia', lat: 38.7045, lng: -93.2283, specialization: 'Railroad Equipment' },
  { state: 'KS', city: 'Topeka', lat: 39.0473, lng: -95.6752, specialization: 'Pet Food' },
  { state: 'KS', city: 'Lawrence', lat: 38.9717, lng: -95.2353, specialization: 'Scientific Equipment' },
  { state: 'OK', city: 'Stillwater', lat: 36.1156, lng: -97.0584, specialization: 'Agricultural Equipment' },
  { state: 'OK', city: 'Muskogee', lat: 35.7479, lng: -95.3697, specialization: 'Glass Manufacturing' },
  { state: 'AR', city: 'Fort Smith', lat: 35.3859, lng: -94.3985, specialization: 'Appliances' },
  { state: 'AR', city: 'Jonesboro', lat: 35.8423, lng: -90.7043, specialization: 'Rice Processing' },
  { state: 'TN', city: 'Morristown', lat: 36.2140, lng: -83.2949, specialization: 'Automotive Parts' },
  { state: 'TN', city: 'Columbia', lat: 35.6151, lng: -87.0353, specialization: 'Automotive Assembly' },
  { state: 'KY', city: 'Hopkinsville', lat: 36.8656, lng: -87.4886, specialization: 'Automotive Parts' },
  { state: 'KY', city: 'Bardstown', lat: 37.8092, lng: -85.4669, specialization: 'Distillery Equipment' },
  { state: 'WV', city: 'Huntington', lat: 38.4192, lng: -82.4452, specialization: 'Steel Fabrication' },
  { state: 'WV', city: 'Morgantown', lat: 39.6295, lng: -79.9559, specialization: 'Research Equipment' },

  // Additional High-Tech and Semiconductor
  { state: 'CA', city: 'Cupertino', lat: 37.3230, lng: -122.0322, specialization: 'Consumer Electronics' },
  { state: 'CA', city: 'Palo Alto', lat: 37.4419, lng: -122.1430, specialization: 'Tech Hardware' },
  { state: 'CA', city: 'Newark', lat: 37.5199, lng: -122.0400, specialization: 'Semiconductor' },
  { state: 'TX', city: 'Cedar Park', lat: 30.5052, lng: -97.8203, specialization: 'Semiconductor' },
  { state: 'CO', city: 'Colorado Springs South', lat: 38.8000, lng: -104.8200, specialization: 'Semiconductor' },
  { state: 'MA', city: 'Andover', lat: 42.6584, lng: -71.1370, specialization: 'Semiconductor' },
  { state: 'NH', city: 'Manchester', lat: 42.9956, lng: -71.4548, specialization: 'Defense Electronics' },

  // Food Processing - Ensure coverage for food companies
  { state: 'NE', city: 'Omaha South', lat: 41.2100, lng: -95.9400, specialization: 'Packaged Foods' },
  { state: 'MN', city: 'Austin North', lat: 43.6700, lng: -92.9700, specialization: 'Meat Products' },
  { state: 'IL', city: 'Chicago Heights', lat: 41.5061, lng: -87.6356, specialization: 'Food Production' },
  { state: 'IN', city: 'Indianapolis East', lat: 39.7700, lng: -86.1000, specialization: 'Food Processing' },
  { state: 'PA', city: 'Hanover', lat: 39.8007, lng: -76.9836, specialization: 'Snack Foods' },
  { state: 'CA', city: 'City of Industry', lat: 34.0197, lng: -117.9587, specialization: 'Beverage Production' },
  { state: 'TX', city: 'San Antonio East', lat: 29.4300, lng: -98.4500, specialization: 'Food Manufacturing' },
  { state: 'OH', city: 'Troy Food', lat: 40.0400, lng: -84.2000, specialization: 'Condiments' },
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
  'Receiving Inspector Basic': ['Caliper Measurement', 'Micrometer Reading', 'GD&T Interpretation', 'Blueprint Reading', 'Height Gauge Usage'],

  // Electronics and Semiconductor
  'Electronics Assembler': ['Through-Hole Soldering', 'SMT Soldering', 'Wire Harness Assembly', 'Crimping and Termination', 'IPC-A-610 Soldering'],
  'PCB Assembler': ['SMT Soldering', 'Through-Hole Soldering', 'BGA Rework', 'IPC-A-610 Soldering', 'Conformal Coating'],
  'Electronics Technician': ['Oscilloscope Usage', 'Multimeter Testing', 'Through-Hole Soldering', 'SMT Soldering', 'Electrical Schematic Reading'],
  'Semiconductor Process Technician': ['Cleanroom Protocols', 'Wafer Handling', 'Photolithography', 'Plasma Etching', 'Chemical Vapor Deposition'],
  'Cleanroom Technician': ['Cleanroom Protocols', 'Wafer Handling', 'Photolithography', 'Physical Vapor Deposition', 'Ion Implantation'],
  'Wafer Fab Operator Basic': ['Photolithography', 'Plasma Etching', 'Chemical Vapor Deposition', 'Cleanroom Protocols', 'Wafer Handling'],
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

  // Semiconductor Engineering
  'Process Integration Engineer': ['Photolithography', 'Plasma Etching', 'Chemical Vapor Deposition', 'Statistical Process Control', 'Cleanroom Protocols'],
  'Lithography Engineer': ['Photolithography', 'Cleanroom Protocols', 'Statistical Process Control', 'Wafer Handling', 'Optical Comparator'],
  'Etch Engineer': ['Plasma Etching', 'Cleanroom Protocols', 'Statistical Process Control', 'Wafer Handling', 'Chemical Handling'],
  'Thin Film Engineer': ['Chemical Vapor Deposition', 'Physical Vapor Deposition', 'Cleanroom Protocols', 'Statistical Process Control', 'Wafer Handling'],
  'Failure Analysis Engineer General': ['Semiconductor Testing', 'Oscilloscope Usage', 'Multimeter Testing', 'Statistical Process Control', 'GD&T Interpretation'],
  'Device Engineer': ['Semiconductor Testing', 'Statistical Process Control', 'Electrical Schematic Reading', 'Oscilloscope Usage', 'Wafer Handling'],
  'Yield Engineer General': ['Statistical Process Control', 'Semiconductor Testing', 'Cleanroom Protocols', 'Photolithography', 'Plasma Etching'],
  'Metrology Engineer': ['CMM Operation', 'CMM Programming', 'Statistical Process Control', 'Cleanroom Protocols', 'GD&T Interpretation'],

  // Aerospace Engineering
  'Propulsion Engineer': ['CATIA', 'NX (Unigraphics)', 'GD&T Interpretation', 'AS9100 Compliance', 'Thermal Imaging'],
  'Avionics Technician': ['Electrical Schematic Reading', 'Through-Hole Soldering', 'SMT Soldering', 'Wire Harness Assembly', 'Oscilloscope Usage'],
  'Flight Test Engineer': ['GD&T Interpretation', 'Statistical Process Control', 'Oscilloscope Usage', 'Multimeter Testing', 'CATIA'],
  'Structures Engineer': ['CATIA', 'NX (Unigraphics)', 'GD&T Interpretation', 'Composite Layup', 'AS9100 Compliance'],
  'Aerostructures Mechanic': ['Aerospace Riveting', 'Blueprint Reading', 'Sealant Application', 'Torque Wrench Usage', 'Composite Layup'],
  'Aircraft Mechanic': ['Blueprint Reading', 'Torque Wrench Usage', 'Hydraulic System Repair', 'Electrical Schematic Reading', 'Micrometer Reading'],
  'Space Systems Engineer': ['CATIA', 'NX (Unigraphics)', 'Composite Layup', 'Cleanroom Protocols', 'GD&T Interpretation'],

  // Automotive Engineering
  'Battery Engineer': ['SolidWorks', 'Electrical Schematic Reading', 'Statistical Process Control', 'Thermal Imaging', 'Multimeter Testing'],
  'EV Systems Engineer': ['SolidWorks', 'Electrical Schematic Reading', 'VFD Programming', 'Servo Drive Configuration', 'Allen-Bradley PLC'],
  'Powertrain Engineer': ['SolidWorks', 'CATIA', 'GD&T Interpretation', 'Statistical Process Control', 'NX (Unigraphics)'],
  'ADAS Engineer': ['Electrical Schematic Reading', 'Oscilloscope Usage', 'Statistical Process Control', 'HMI Development', 'FANUC Robot Programming'],
  'Chassis Engineer': ['SolidWorks', 'CATIA', 'GD&T Interpretation', 'Blueprint Reading', 'Statistical Process Control'],
  'NVH Engineer': ['SolidWorks', 'Vibration Analysis', 'Statistical Process Control', 'GD&T Interpretation', 'Oscilloscope Usage'],
  'Vehicle Integration Engineer': ['SolidWorks', 'CATIA', 'Blueprint Reading', 'GD&T Interpretation', 'Electrical Schematic Reading'],
  'Automotive Body Engineer': ['SolidWorks', 'CATIA', 'GD&T Interpretation', 'Sheet Metal Forming', 'Blueprint Reading'],

  // Robotics and Automation
  'Robot Programmer': ['FANUC Robot Programming', 'ABB Robot Programming', 'KUKA Robot Programming', 'Allen-Bradley PLC', 'Siemens PLC'],
  'Vision Systems Engineer': ['Allen-Bradley PLC', 'HMI Development', 'Statistical Process Control', 'Electrical Schematic Reading', 'Oscilloscope Usage'],
  'Cobot Technician': ['FANUC Robot Programming', 'Allen-Bradley PLC', 'Electrical Schematic Reading', 'Blueprint Reading', 'Torque Wrench Usage'],
  'Motion Control Engineer': ['Servo Drive Configuration', 'VFD Programming', 'Allen-Bradley PLC', 'Siemens PLC', 'Electrical Schematic Reading'],
  'Automation Technician': ['Allen-Bradley PLC', 'Siemens PLC', 'Electrical Schematic Reading', 'VFD Programming', 'Pneumatic System Repair'],

  // Advanced Manufacturing
  'Additive Manufacturing Engineer': ['SolidWorks', 'CATIA', 'GD&T Interpretation', 'Statistical Process Control', 'Blueprint Reading'],
  'Additive Manufacturing Technician': ['Blueprint Reading', 'SolidWorks', 'Micrometer Reading', 'GD&T Interpretation', 'Caliper Measurement'],
  'Laser Technician': ['Blueprint Reading', 'Micrometer Reading', 'Electrical Schematic Reading', 'Oscilloscope Usage', 'Caliper Measurement'],
  'Precision Assembly Technician': ['Blueprint Reading', 'Torque Wrench Usage', 'Micrometer Reading', 'GD&T Interpretation', 'CMM Operation'],

  // Defense and Military
  'Ordnance Technician': ['Blueprint Reading', 'Torque Wrench Usage', 'Electrical Schematic Reading', 'Caliper Measurement', 'Micrometer Reading'],
  'Radar Technician': ['Electrical Schematic Reading', 'Oscilloscope Usage', 'Multimeter Testing', 'RF Cable Assembly', 'Wire Harness Assembly'],
  'Missile Technician': ['Blueprint Reading', 'Electrical Schematic Reading', 'Torque Wrench Usage', 'Wire Harness Assembly', 'Composite Layup'],
  'Electronic Warfare Technician': ['Electrical Schematic Reading', 'Oscilloscope Usage', 'Multimeter Testing', 'SMT Soldering', 'RF Cable Assembly'],

  // Medical Device Manufacturing
  'Medical Device Assembler': ['Blueprint Reading', 'Cleanroom Protocols', 'Torque Wrench Usage', 'Micrometer Reading', 'ISO 9001 Compliance'],
  'Sterilization Technician': ['Cleanroom Protocols', 'ISO 9001 Compliance', 'Blueprint Reading', 'Statistical Process Control', 'Instrumentation Calibration'],
  'Biomedical Engineer': ['SolidWorks', 'CATIA', 'GD&T Interpretation', 'ISO 9001 Compliance', 'Blueprint Reading'],

  // ============================================
  // AEROSPACE & DEFENSE OCCUPATION-SKILL MAPPINGS
  // ============================================

  // NDT/NDI Inspection Specialists
  'UT Level II Inspector': ['Conventional UT - Contact Method', 'Conventional UT - Immersion Method', 'UT Calibration Standards', 'Reference Standard Verification', 'NAS 410 Certification', 'Inspection Report Writing'],
  'Phased Array UT Technician': ['Phased Array UT - Sectorial Scan', 'Phased Array UT - Linear Scan', 'PAUT Calibration', 'Full Matrix Capture FMC', 'Flaw Sizing Techniques', 'TOFD Ultrasonic Testing'],
  'UT Level III Examiner': ['Conventional UT - Contact Method', 'UT Procedure Writing', 'Technique Development', 'NAS 410 Certification', 'ASNT SNT-TC-1A', 'Flaw Sizing Techniques'],
  'RT Level II Inspector': ['Film Radiography', 'Computed Radiography CR', 'Radiographic Film Interpretation', 'IQI Selection', 'RT Exposure Calculations', 'Radiation Safety'],
  'Digital Radiography Technician': ['Digital Radiography DR', 'Computed Radiography CR', 'Radiographic Film Interpretation', 'IQI Selection', 'Image Quality Enhancement', 'RT Exposure Calculations'],
  'ET Level II Inspector': ['Conventional Eddy Current', 'Eddy Current Array ECA', 'Conductivity Testing', 'Coating Thickness Measurement', 'Crack Detection ET', 'Bolt Hole Inspection'],
  'MT Level II Inspector': ['Dry Powder MT', 'Wet Fluorescent MT', 'Yoke Technique MT', 'Prods Technique MT', 'Coil Technique MT', 'MT Particle Selection'],
  'PT Level II Inspector': ['Solvent Removable PT', 'Water Washable PT', 'Post-Emulsifiable PT', 'Fluorescent Penetrant', 'Visible Dye Penetrant', 'Dwell Time Control'],
  'NDT Level III Manager': ['UT Procedure Writing', 'RT Procedure Writing', 'Technique Development', 'Nadcap Audit Support', 'NAS 410 Certification', 'ASNT SNT-TC-1A'],
  'Bond Testing Technician': ['Resonance Bond Testing', 'Mechanical Impedance Analysis', 'Pitch-Catch UT', 'Disbond Detection', 'Adhesive Bond Inspection', 'Composite Damage Modes'],
  'Shearography Inspector': ['Laser Shearography', 'Thermal Shearography', 'Vacuum Loading', 'Impact Damage Mapping', 'Delamination Sizing', 'Disbond Detection'],
  'Thermography Technician': ['Infrared Thermography', 'Thermal Imaging', 'Lock-In Thermography', 'Pulsed Thermography', 'Composite Damage Modes', 'Moisture Ingress'],
  'Visual Inspector Level II': ['Visual Inspection VT', 'Borescope Inspection', 'Videoscope Inspection', 'Surface Finish Comparison', 'Optical Comparator', 'Inspection Report Writing'],
  'Borescope Inspector': ['Borescope Inspection', 'Videoscope Inspection', 'Engine Borescope Inspection', 'FOD Prevention', 'Inspection Report Writing', 'Visual Inspection VT'],

  // Aircraft Structural Mechanics
  'Fuselage Structural Mechanic': ['Fuselage Section Assembly', 'Frame and Stringer Installation', 'Skin Panel Fitting', 'Hi-Lok Installation', 'Hi-Lite Installation', 'Aerospace Sealant Application'],
  'Wing Assembly Mechanic': ['Wing Box Assembly', 'Spar Installation', 'Leading Edge Assembly', 'Trailing Edge Assembly', 'Hi-Lok Installation', 'Solid Rivet Installation'],
  'Empennage Mechanic': ['Vertical Stabilizer Assembly', 'Horizontal Stabilizer Assembly', 'Rudder Installation', 'Elevator Installation', 'Hi-Lok Installation', 'Aerospace Sealant Application'],
  'Aircraft Structural Repair Technician': ['SRM Structural Repair Manual', 'Doubler Installation', 'Patch Repair', 'Hi-Lok Removal', 'Countersink Repair', 'Blueprint Reading'],
  'Sheet Metal Assembler': ['Sheet Metal Forming', 'Joggle Forming', 'Edge Forming', 'Hand Forming', 'Solid Rivet Installation', 'Buck Riveting'],
  'Riveting Specialist': ['Solid Rivet Installation', 'Buck Riveting', 'CherryMAX Blind Rivets', 'Hi-Lok Installation', 'Flush Riveting', 'Rivet Removal'],
  'Structural Sealant Technician': ['Aerospace Sealant Application', 'PR Sealant Application', 'Fuel Tank Sealant', 'Fillet Seal', 'Fay Seal', 'Cap Seal'],
  'Flight Control Surface Mechanic': ['Aileron Assembly', 'Rudder Installation', 'Elevator Installation', 'Flap Assembly', 'Spoiler Assembly', 'Control Surface Balancing'],
  'Landing Gear Mechanic': ['Landing Gear Overhaul', 'Strut Servicing', 'Brake System Maintenance', 'Wheel and Tire Installation', 'Retraction System Testing', 'Hydraulic System Repair'],
  'Door and Hatch Mechanic': ['Door Rigging', 'Hinge Adjustment', 'Seal Installation', 'Latch Adjustment', 'Pressure Seal Testing', 'Emergency Exit Testing'],

  // Aircraft Systems Mechanics
  'Aircraft Hydraulic Technician': ['Hydraulic Pump Overhaul', 'Hydraulic Actuator Overhaul', 'Hydraulic Valve Maintenance', 'Hydraulic Reservoir Service', 'Hydraulic Fluid Analysis', 'Hydraulic Line Installation'],
  'Hydraulic Test Technician': ['Hydraulic System Leak Check', 'Hydraulic System Pressure Test', 'Hydraulic Flow Testing', 'Accumulator Precharge', 'Hydraulic Filter Service', 'Flow Testing'],
  'Pneumatic Systems Mechanic': ['Bleed Air System Maintenance', 'Pneumatic Valve Maintenance', 'Regulator Adjustment', 'Pneumatic Duct Repair', 'Pressure Testing', 'Engine Bleed Systems'],
  'Fuel Systems Mechanic': ['Fuel Tank Entry', 'Fuel Pump Removal', 'Fuel Quantity Probe', 'Fuel Valve Maintenance', 'Fuel Filter Replacement', 'Fuel System Leak Check'],
  'Fuel Tank Repair Technician': ['Fuel Tank Sealing', 'Fuel Tank Entry', 'Fuel Tank Sealant', 'Fuel Tank Repair', 'Confined Space Entry', 'Fuel Safety'],
  'Environmental Control Technician': ['ECS Pack Maintenance', 'Cabin Pressurization', 'Air Cycle Machine', 'Temperature Control', 'Humidity Control', 'Bleed Air System Maintenance'],
  'Flight Control Systems Technician': ['Flight Control Rigging', 'Autopilot System Testing', 'Fly-by-Wire Systems', 'Flight Control Computers', 'Cable Tension Measurement', 'Control Surface Balancing'],
  'Oxygen Systems Technician': ['Oxygen System Maintenance', 'Oxygen Generator Service', 'Oxygen Mask Testing', 'OBOGS Maintenance', 'Oxygen Safety', 'LOX System Maintenance'],
  'Ice Protection Systems Technician': ['De-Ice Boot Replacement', 'Anti-Ice Valve Maintenance', 'Ice Detection Testing', 'Heated Probe Maintenance', 'Bleed Air System Maintenance', 'Wing Anti-Ice System'],
  'Fire Protection Systems Technician': ['Fire Detector Testing', 'Fire Extinguisher Service', 'APU Fire System', 'Engine Fire System', 'Cargo Fire System', 'Fire Loop Testing'],
  'APU Technician': ['APU Maintenance', 'APU Start System', 'APU Fuel System', 'APU Bleed Air', 'APU Generator', 'APU Troubleshooting'],

  // Avionics and Electronics Specialists
  'Navigation Systems Technician': ['IRS Inertial Reference System', 'GPS Navigation System', 'VOR/ILS Systems', 'ADF Systems', 'DME Systems', 'RNAV VNAV Systems'],
  'Communication Systems Technician': ['VHF Communication Systems', 'HF Communication Systems', 'SATCOM Systems', 'Intercom Systems', 'Audio Panel Testing', 'ACARS Systems'],
  'Radar Systems Technician': ['Weather Radar Systems', 'TCAS Systems', 'Radar Antenna Maintenance', 'Radar Transmitter Repair', 'Waveguide Maintenance', 'RF Cable Assembly'],
  'Display Systems Technician': ['EFIS Display Systems', 'PFD Primary Flight Display', 'MFD Multifunction Display', 'HUD Systems', 'Display Calibration', 'Glass Cockpit Systems'],
  'Flight Management Systems Specialist': ['FMS Programming', 'FMC Maintenance', 'CDU Operation', 'Navigation Database Update', 'RNAV VNAV Systems', 'Autopilot System Testing'],
  'Autopilot Systems Technician': ['Autopilot System Testing', 'Autothrottle Systems', 'Flight Director Systems', 'Yaw Damper Systems', 'Flight Control Computers', 'Servo Calibration'],
  'Electrical Power Systems Technician': ['Generator Maintenance', 'TRU Transformer Rectifier', 'Bus Power Distribution', 'Circuit Breaker Testing', 'Electrical Load Analysis', 'APU Generator'],
  'Wire Harness Fabricator': ['Wire Harness Assembly', 'Connector Installation', 'Wire Termination', 'Cable Lacing', 'Wire Marking', 'Shielding Termination'],
  'Avionics Installation Technician': ['Avionics Rack Installation', 'Equipment Bonding', 'Coaxial Cable Routing', 'ARINC 600 Connectors', 'EMI Shielding', 'Avionics Cooling'],
  'Data Bus Technician': ['ARINC 429 Testing', 'ARINC 629 Testing', 'MIL-STD-1553 Testing', 'AFDX Testing', 'Ethernet Aviation', 'Bus Analyzer Operation'],

  // Engine and Propulsion Specialists
  'Turbofan Engine Mechanic': ['Fan Module Assembly', 'Core Module Assembly', 'LPT Module Assembly', 'HPT Module Assembly', 'Combustor Maintenance', 'Engine Build-Up'],
  'Engine Component Technician': ['Turbine Blade Inspection', 'Combustor Liner Repair', 'NGV Nozzle Guide Vane', 'Seal Segment Replacement', 'Bearing Inspection', 'Engine Borescope Inspection'],
  'Engine Test Cell Operator': ['Engine Test Cell Operation', 'Engine Run Procedures', 'Vibration Monitoring', 'Fuel Flow Calibration', 'EGT Monitoring', 'Engine Performance Analysis'],
  'Propeller Technician': ['Propeller Overhaul', 'Blade Tracking', 'Governor Adjustment', 'Propeller Balancing', 'De-Ice Boot Installation', 'Feather System Testing'],
  'Gearbox Overhaul Technician': ['Accessory Gearbox Overhaul', 'Main Gearbox Overhaul', 'Gear Inspection', 'Bearing Replacement', 'Seal Replacement', 'Chip Detector Installation'],
  'FADEC Systems Technician': ['FADEC Testing', 'Engine Control Unit', 'Fuel Control Adjustment', 'Sensor Calibration', 'Engine Parameter Monitoring', 'Throttle Rigging'],
  'Nacelle Technician': ['Cowling Installation', 'Thrust Reverser Maintenance', 'Nacelle Acoustic Panel', 'Fire Detection Loop', 'Engine Mounts', 'Fan Case Installation'],
  'Engine Fuel Systems Technician': ['Fuel Control Unit', 'Fuel Pump Overhaul', 'Fuel Manifold Repair', 'Fuel Nozzle Testing', 'Fuel Heater Maintenance', 'Fuel Flow Calibration'],

  // Composites Specialists
  'Composite Laminator': ['Composite Layup', 'Prepreg Handling', 'Ply Orientation', 'Ply Compaction', 'Debulk Procedures', 'Autoclave Processing'],
  'Autoclave Operator': ['Autoclave Operation', 'Autoclave Processing', 'Cure Cycle Monitoring', 'Vacuum Bag Leak Check', 'Thermocouple Placement', 'Exotherm Control'],
  'Composite Repair Technician': ['Composite Repair', 'Scarf Repair', 'Stepped Repair', 'Bonded Repair', 'Hot Bonder Operation', 'Repair Layup'],
  'Core Fabricator': ['Honeycomb Core Machining', 'Core Splicing', 'Core Forming', 'Core Stabilization', 'Edge Close-Out', 'Potting Compound'],
  'RTM Operator': ['Resin Transfer Molding', 'VARTM Process', 'Resin Infusion', 'Mold Preparation', 'Resin Mixing', 'Flow Front Monitoring'],
  'Composite CNC Technician': ['Composite CNC Trimming', 'Ultrasonic Knife Cutting', 'Waterjet Cutting', 'Ply Cutting', 'Nest Optimization', 'CNC Programming'],
  'NDI Composite Inspector': ['Tap Testing', 'Through Transmission UT', 'Pulse Echo UT', 'Laser Shearography', 'Disbond Detection', 'Delamination Sizing'],
  'Bonded Structure Technician': ['Surface Preparation', 'Adhesive Application', 'Bonding Fixture Use', 'Adhesive Film Application', 'Structural Bonding', 'Bond Line Thickness'],

  // Aircraft Electrical Installation
  'Aircraft Electrician': ['Aircraft Wire Installation', 'Aircraft Connector Termination', 'Electrical Schematic Reading', 'Wire Splicing', 'Grounding Bonding', 'Wire Bundle Routing'],
  'Electrical Assembly Technician': ['Wire Bundle Fabrication', 'Connector Pin Insertion', 'Heat Shrink Application', 'Wire Marking', 'Backshell Installation', 'EMI Shielding'],
  'Circuit Card Assembly Technician': ['Through-Hole Soldering', 'SMT Soldering', 'BGA Rework', 'Conformal Coating', 'Wire Bonding', 'PCB Inspection'],
  'Electrical Test Technician': ['Continuity Testing', 'Insulation Resistance Testing', 'Hi-Pot Testing', 'EWIS Testing', 'Electrical Load Analysis', 'Harness Testing'],

  // Tooling and Manufacturing
  'Aerospace Tool Maker': ['Tool Design', 'Fixture Design', 'Jig Fabrication', 'Drill Jig', 'Assembly Fixture', 'Check Fixture'],
  'Jig and Fixture Builder': ['Fixture Design', 'Jig Fabrication', 'Drill Jig', 'Assembly Fixture', 'Locating Features', 'Clamping Design'],
  'Tool Crib Attendant': ['Tool Control', 'Calibration Tracking', 'Tool Issue', 'FOD Prevention', 'Tool Inventory', 'Calibration Labels'],
  'Manufacturing Process Developer': ['Process Development', 'Lean Manufacturing', 'Process FMEA', 'Work Instructions', 'Cycle Time Reduction', 'First Article Inspection'],

  // Surface Treatment and Finishing
  'Aerospace Painter': ['Aircraft Primer Application', 'Aircraft Paint Application', 'Chemical Film Application', 'Surface Preparation', 'Paint Thickness Measurement', 'Paint Booth Operation'],
  'Anodizing Technician': ['Chromic Anodizing', 'Sulfuric Anodizing', 'Hard Anodizing', 'Tank Line Operation', 'Solution Chemistry', 'Coating Thickness Measurement'],
  'Plating Technician': ['Cadmium Plating', 'Nickel Plating', 'Chrome Plating', 'Silver Plating', 'Brush Plating', 'Plating Thickness Measurement'],
  'Chemical Processing Technician': ['Passivation', 'Chemical Film Application', 'Alkaline Cleaning', 'Acid Etch', 'Deoxidizing', 'Tank Line Operation'],
  'Shot Peen Operator': ['Shot Peening Operation', 'Almen Strip Testing', 'Saturation Curve', 'Coverage Verification', 'Media Control', 'Peening Intensity'],
  'NDT after Surface Treatment': ['Fluorescent Penetrant', 'Visual Inspection VT', 'Coating Thickness Measurement', 'Surface Finish Comparison', 'Inspection Report Writing'],

  // Space Systems Specialists
  'Spacecraft Assembly Technician': ['Cleanroom Protocols', 'Spacecraft Bus Assembly', 'Solar Array Installation', 'Thermal Blanket Installation', 'Harness Integration', 'Torque Wrench Usage'],
  'Satellite Integration Technician': ['Payload Integration', 'Solar Array Deployment Test', 'Antenna Deployment Test', 'Mass Properties', 'Alignment Verification', 'Cleanroom Protocols'],
  'Propulsion Integration Technician': ['Propellant Loading', 'Thruster Installation', 'Propulsion Testing', 'Hypergolic Safety', 'Clean Propulsion Systems', 'Leak Rate Testing'],
  'Thermal Vacuum Test Technician': ['Thermal Vacuum Testing', 'Bakeout Procedures', 'Thermal Cycling', 'Chamber Operation', 'Thermal Control', 'Vacuum System Operation'],
  'Launch Operations Technician': ['Launch Pad Operations', 'Countdown Procedures', 'Ordnance Installation', 'Propellant Loading', 'Launch Vehicle Integration', 'Hypergolic Safety'],

  // Weapons and Defense Systems
  'Weapons Integration Technician': ['Weapons Bay Installation', 'Pylon Installation', 'Weapons Release Systems', 'Arming Systems', 'Weapons Umbilical', 'MIL-STD-1760'],
  'Fire Control Systems Technician': ['Fire Control Radar', 'Targeting Systems', 'Weapons Computer', 'Laser Systems', 'FLIR Systems', 'HUD Systems'],
  'EW Systems Technician': ['ECM Systems', 'ESM Systems', 'ELINT Systems', 'RF Jamming Systems', 'Chaff and Flare Systems', 'RWR Systems'],
  'Armament Technician': ['Gun System Maintenance', 'Ammunition Handling', 'Feed System Maintenance', 'Weapons Loading', 'Gun Gas Purge', 'Weapons Safety'],

  // Quality and Inspection Roles
  'Receiving Inspector': ['Receiving Inspection', 'Certificate of Conformance', 'Material Traceability', 'Shelf Life Control', 'Sampling Plans', 'First Article Inspection'],
  'In-Process Inspector': ['In-Process Inspection', 'Workmanship Standards', 'Visual Inspection VT', 'Statistical Process Control', 'Process Audit', 'Inspection Report Writing'],
  'Final Inspector': ['Final Inspection', 'Functional Test Witness', 'Acceptance Test Witness', 'Quality Buyoff', 'Inspection Report Writing', 'AS9102 FAI'],
  'CMM Operator Aerospace': ['CMM Operation', 'CMM Programming', 'GD&T Interpretation', 'PC-DMIS Software', 'Probe Calibration', 'First Article Inspection'],
  'DER Inspector': ['DER Inspection', 'Repair Approval', 'Engineering Disposition', 'Airworthiness Compliance', 'SRM Structural Repair Manual', 'FAA Regulations'],

  // Rotorcraft Specialists
  'Rotor System Mechanic': ['Main Rotor Assembly', 'Tail Rotor Assembly', 'Rotor Head Overhaul', 'Blade Tracking', 'Vibration Analysis', 'Dynamic Balancing'],
  'Transmission Overhaul Technician': ['Main Gearbox Overhaul', 'Tail Gearbox Overhaul', 'Intermediate Gearbox', 'Chip Detector Installation', 'Oil System Service', 'Gear Inspection'],
  'Flight Control Rigging Specialist': ['Swashplate Rigging', 'Collective Rigging', 'Cyclic Rigging', 'Tail Rotor Rigging', 'Cable Tension Measurement', 'Flight Control Rigging'],

  // Unmanned Systems Specialists
  'UAS Airframe Technician': ['UAS Airframe Assembly', 'Composite Repair', 'Antenna Installation', 'Payload Bay Access', 'Control Surface Rigging', 'Ground Control Station'],
  'Drone Avionics Technician': ['Autopilot Installation', 'GPS Antenna', 'Data Link Systems', 'Camera Gimbal', 'Sense and Avoid', 'Ground Control Station'],
  'UAS Launch and Recovery Specialist': ['Catapult Launch System', 'Arresting System', 'VTOL Operations', 'Net Recovery', 'Launch Procedures', 'Recovery Procedures'],

  // ============================================
  // SPACEX OCCUPATION-SKILL MAPPINGS
  // ============================================

  // Falcon Manufacturing
  'Falcon Stage Technician': ['LOX/RP-1 Propulsion', 'Aluminum-Lithium Welding', 'Isogrid Machining', 'Stage Separation Systems', 'COPV Installation', 'Blueprint Reading'],
  'Falcon Interstage Technician': ['Interstage Construction', 'Aluminum-Lithium Welding', 'Composite Layup', 'Stage Separation Systems', 'Blueprint Reading', 'Torque Wrench Usage'],
  'Falcon Fairing Technician': ['Composite Layup', 'Fairing Separation Systems', 'Autoclave Processing', 'Blueprint Reading', 'Composite Repair', 'Cleanroom Protocols'],
  'Grid Fin Technician': ['Grid Fin Fabrication', 'Titanium Welding', '5-Axis Machining', 'Blueprint Reading', 'GD&T Interpretation', 'CMM Operation'],
  'Landing Leg Technician': ['Landing Leg Mechanisms', 'Aluminum-Lithium Welding', 'Hydraulic System Repair', 'Blueprint Reading', 'Torque Wrench Usage', 'Composite Layup'],
  'Falcon Propulsion Technician': ['Merlin Engine Systems', 'LOX/RP-1 Propulsion', 'Propellant Valve Assembly', 'Engine Gimbal Systems', 'Torque Wrench Usage', 'Blueprint Reading'],
  'LOX Tank Welder': ['Cryogenic Tank Welding', 'Orbital TIG Welding', 'Aluminum-Lithium Welding', 'X-Ray Weld Inspection', 'Weld Procedure Qualification', 'Blueprint Reading'],
  'RP-1 Tank Welder': ['Cryogenic Tank Welding', 'Orbital TIG Welding', 'Aluminum-Lithium Welding', 'X-Ray Weld Inspection', 'Weld Procedure Qualification', 'Blueprint Reading'],
  'Helium Pressurant Technician': ['COPV Installation', 'High Pressure Systems', 'Leak Testing', 'Blueprint Reading', 'Torque Wrench Usage', 'Cleanroom Protocols'],
  'Stage Separation Technician': ['Stage Separation Systems', 'Pneumatic System Repair', 'Electrical Schematic Reading', 'Blueprint Reading', 'Torque Wrench Usage', 'Functional Test'],

  // Starship/Super Heavy
  'Starship Barrel Welder': ['Stainless Steel Welding', 'Friction Stir Welding', 'Orbital TIG Welding', 'X-Ray Weld Inspection', 'Weld Procedure Qualification', 'Blueprint Reading'],
  'Starship Dome Technician': ['Tank Dome Forming', 'Stainless Steel Welding', 'Friction Stir Welding', 'Blueprint Reading', 'GD&T Interpretation', 'CMM Operation'],
  'Super Heavy Booster Technician': ['Stainless Steel Welding', 'Raptor Integration', 'Grid Fin Fabrication', 'Landing Leg Mechanisms', 'Blueprint Reading', 'Torque Wrench Usage'],
  'Heat Shield Tile Technician': ['Heat Shield Tile Installation', 'Thermal Protection Inspection', 'Adhesive Application', 'Blueprint Reading', 'Surface Preparation', 'Cleanroom Protocols'],
  'Starship Flap Technician': ['Starship Flap Actuation', 'Stainless Steel Welding', 'Hydraulic System Repair', 'Blueprint Reading', 'Electrical Schematic Reading', 'Torque Wrench Usage'],
  'Header Tank Technician': ['Header Tank Systems', 'Stainless Steel Welding', 'Cryogenic Tank Welding', 'Blueprint Reading', 'Torque Wrench Usage', 'Leak Testing'],
  'Hot Gas Thruster Technician': ['Hot Gas RCS', 'LOX/Methane Propulsion', 'Propellant Valve Assembly', 'Blueprint Reading', 'Torque Wrench Usage', 'Electrical Schematic Reading'],
  'Starship Avionics Technician': ['Flight Computer Installation', 'Wire Harness Assembly', 'Electrical Schematic Reading', 'Avionics Integration', 'Blueprint Reading', 'Cleanroom Protocols'],
  'Starship TPS Inspector': ['Thermal Protection Inspection', 'Visual Inspection VT', 'Heat Shield Tile Installation', 'Inspection Report Writing', 'Blueprint Reading', 'GD&T Interpretation'],
  'Raptor Integration Technician': ['Raptor Engine Systems', 'Engine Gimbal Systems', 'Propellant Valve Assembly', 'Blueprint Reading', 'Torque Wrench Usage', 'Electrical Schematic Reading'],

  // Raptor Engine
  'Raptor Engine Assembler': ['Raptor Engine Systems', 'Full-Flow Staged Combustion', 'Turbopump Assembly', 'Injector Fabrication', 'Torque Wrench Usage', 'Blueprint Reading'],
  'Raptor Turbopump Technician': ['Turbopump Assembly', 'High-Speed Bearing Installation', 'Precision Grinding', 'Blueprint Reading', 'GD&T Interpretation', 'CMM Operation'],
  'Raptor Combustion Chamber Tech': ['Regenerative Cooling Channels', 'Electron Beam Welding', 'Additive Manufacturing', 'Blueprint Reading', 'GD&T Interpretation', 'CMM Operation'],
  'Raptor Injector Technician': ['Injector Fabrication', 'Additive Manufacturing', 'Precision Grinding', 'Blueprint Reading', 'GD&T Interpretation', 'CMM Operation'],
  'Raptor Preburner Technician': ['Preburner Assembly', 'Full-Flow Staged Combustion', 'Turbopump Assembly', 'Blueprint Reading', 'Torque Wrench Usage', 'Electron Beam Welding'],
  'Raptor Nozzle Technician': ['Nozzle Extension Install', 'Regenerative Cooling Channels', 'TIG Welding', 'Blueprint Reading', 'GD&T Interpretation', 'CMM Operation'],
  'Raptor TVC Technician': ['Engine Gimbal Systems', 'Hydraulic System Repair', 'Electrical Schematic Reading', 'Blueprint Reading', 'Torque Wrench Usage', 'Functional Test'],
  'Raptor Test Engineer': ['Hot Fire Test Operations', 'Engine Acceptance Testing', 'Propellant Loading Operations', 'Telemetry Monitoring', 'Data Analysis', 'Anomaly Resolution'],
  'Engine Hot Fire Operator': ['Hot Fire Test Operations', 'Propellant Loading Operations', 'LOX/Methane Propulsion', 'Safety Protocols', 'Emergency Procedures', 'Data Monitoring'],
  'Raptor Turbine Blade Inspector': ['Turbine Blade Inspection', 'Borescope Inspection', 'Fluorescent Penetrant', 'CMM Operation', 'Inspection Report Writing', 'GD&T Interpretation'],

  // Dragon Capsule
  'Dragon Pressure Vessel Tech': ['Pressure Vessel Fabrication', 'Aluminum-Lithium Welding', 'Leak Testing', 'Blueprint Reading', 'GD&T Interpretation', 'Cleanroom Protocols'],
  'Dragon Trunk Technician': ['Dragon Trunk Assembly', 'Solar Array Deployment', 'Composite Layup', 'Wire Harness Assembly', 'Blueprint Reading', 'Torque Wrench Usage'],
  'Dragon ECLSS Technician': ['ECLSS Installation', 'Environmental Control', 'Life Support Systems', 'Blueprint Reading', 'Electrical Schematic Reading', 'Leak Testing'],
  'SuperDraco Technician': ['SuperDraco Systems', 'Hypergolic Propellant', 'Propellant Valve Assembly', 'Blueprint Reading', 'Torque Wrench Usage', 'Hazmat Handling'],
  'Dragon Hatch Technician': ['Docking System Installation', 'Seal Installation', 'Leak Testing', 'Blueprint Reading', 'Torque Wrench Usage', 'Cleanroom Protocols'],
  'Dragon Thermal Control Tech': ['Thermal Control Loops', 'Fluid System Installation', 'Heat Exchanger Installation', 'Blueprint Reading', 'Leak Testing', 'Cleanroom Protocols'],
  'Draco Thruster Technician': ['Draco Thruster Systems', 'Hypergolic Propellant', 'Propellant Valve Assembly', 'Blueprint Reading', 'Torque Wrench Usage', 'Hazmat Handling'],
  'Dragon Parachute Technician': ['Parachute Packing', 'Textile Inspection', 'Rigging', 'Blueprint Reading', 'Quality Documentation', 'Cleanroom Protocols'],
  'Dragon Avionics Integrator': ['Crew Display Integration', 'Avionics Integration', 'Wire Harness Assembly', 'Electrical Schematic Reading', 'Blueprint Reading', 'Functional Test'],
  'Dragon Final Integration Tech': ['Capsule Closeout', 'Final Inspection', 'Cleanroom Protocols', 'Quality Documentation', 'Torque Wrench Usage', 'Blueprint Reading'],

  // Starlink
  'Starlink Assembly Technician': ['Starlink Bus Assembly', 'Wire Harness Assembly', 'Cleanroom Protocols', 'Blueprint Reading', 'Torque Wrench Usage', 'ESD Control'],
  'Starlink Solar Array Tech': ['Solar Array Deployment', 'Wire Harness Assembly', 'Cleanroom Protocols', 'Blueprint Reading', 'Torque Wrench Usage', 'ESD Control'],
  'Starlink Antenna Technician': ['Phased Array Manufacturing', 'RF Testing', 'Wire Harness Assembly', 'Cleanroom Protocols', 'Blueprint Reading', 'ESD Control'],
  'Starlink Propulsion Tech': ['Hall Thruster Installation', 'Xenon Propellant Systems', 'Wire Harness Assembly', 'Blueprint Reading', 'Cleanroom Protocols', 'ESD Control'],
  'Starlink Laser Link Tech': ['Inter-Satellite Laser Link', 'Optical Alignment', 'Cleanroom Protocols', 'Blueprint Reading', 'ESD Control', 'Precision Assembly'],
  'Starlink Test Technician': ['Satellite Functional Test', 'RF Testing', 'Thermal Vacuum Testing', 'Data Analysis', 'Cleanroom Protocols', 'Inspection Report Writing'],
  'Starlink Dispenser Technician': ['Satellite Dispenser Loading', 'Cleanroom Protocols', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation', 'ESD Control'],
  'Starlink RF Test Engineer': ['RF Testing', 'Spectrum Analyzer', 'Network Analyzer', 'Data Analysis', 'Test Procedure Development', 'Anomaly Resolution'],

  // Launch Operations
  'Launch Pad Technician': ['Launch Pad Systems', 'Ground Umbilical Systems', 'Pneumatic System Repair', 'Hydraulic System Repair', 'Electrical Maintenance', 'Safety Protocols'],
  'Propellant Systems Operator': ['Propellant Loading Operations', 'LOX/Methane Propulsion', 'LOX/RP-1 Propulsion', 'Cryogenic Systems', 'Safety Protocols', 'Emergency Procedures'],
  'Launch Controller': ['Launch Countdown Procedures', 'Telemetry Monitoring', 'Anomaly Resolution', 'Communication Procedures', 'Emergency Procedures', 'Data Monitoring'],
  'Range Safety Operator': ['Range Safety Systems', 'Flight Termination Systems', 'Tracking Systems', 'Safety Protocols', 'Emergency Procedures', 'Communication Procedures'],
  'Pad Umbilical Technician': ['Ground Umbilical Systems', 'Quick Disconnect Systems', 'Pneumatic System Repair', 'Blueprint Reading', 'Torque Wrench Usage', 'Safety Protocols'],
  'TEL Operator': ['TEL Operations', 'Strongback Operations', 'Hydraulic System Repair', 'Safety Protocols', 'Communication Procedures', 'Emergency Procedures'],
  'Strongback Technician': ['Strongback Operations', 'Hydraulic System Repair', 'Pneumatic System Repair', 'Blueprint Reading', 'Torque Wrench Usage', 'Safety Protocols'],
  'Launch Weather Specialist': ['Weather Analysis Launch', 'Meteorological Data', 'Data Analysis', 'Communication Procedures', 'Report Writing', 'Safety Protocols'],
  'Countdown Sequencer': ['Launch Countdown Procedures', 'Software Operation', 'Data Monitoring', 'Communication Procedures', 'Emergency Procedures', 'Anomaly Resolution'],
  'Pad Safety Coordinator': ['Safety Protocols', 'Emergency Procedures', 'Hazmat Handling', 'Communication Procedures', 'Training Development', 'Incident Investigation'],

  // Recovery Operations
  'Drone Ship Technician': ['ASDS Operations', 'Marine Systems', 'Hydraulic System Repair', 'Electrical Maintenance', 'Safety Protocols', 'Communication Procedures'],
  'Fairing Recovery Specialist': ['Fairing Recovery Operations', 'Marine Operations', 'Crane Operations', 'Safety Protocols', 'Communication Procedures', 'Composite Handling'],
  'Booster Recovery Technician': ['Booster Recovery Processing', 'Safing Procedures', 'Inspection Procedures', 'Crane Operations', 'Safety Protocols', 'Documentation'],
  'Dragon Recovery Specialist': ['Dragon Recovery Operations', 'Safing Procedures', 'Hypergolic Safety', 'Marine Operations', 'Safety Protocols', 'Communication Procedures'],
  'Marine Operations Coordinator': ['Marine Operations', 'Communication Procedures', 'Safety Protocols', 'Weather Analysis Launch', 'Logistics Coordination', 'Emergency Procedures'],
  'Booster Refurbishment Tech': ['Booster Refurbishment', 'Engine Refurbishment', 'Inspection Procedures', 'Reusability Inspection', 'Blueprint Reading', 'Quality Documentation'],

  // Mission Operations
  'Mission Control Operator': ['Telemetry Monitoring', 'Spacecraft Commanding', 'Anomaly Resolution', 'Communication Procedures', 'Data Analysis', 'Emergency Procedures'],
  'Flight Director': ['Flight Dynamics', 'Mission Planning', 'Team Leadership', 'Decision Making', 'Communication Procedures', 'Emergency Procedures'],
  'GNC Engineer': ['Flight Dynamics', 'Telemetry Monitoring', 'Trajectory Analysis', 'Data Analysis', 'Anomaly Resolution', 'Software Operation'],
  'Propulsion Console Operator': ['Telemetry Monitoring', 'Propulsion System Analysis', 'Data Analysis', 'Anomaly Resolution', 'Communication Procedures', 'Emergency Procedures'],
  'Communications Console Op': ['Telemetry Monitoring', 'Communication Systems', 'Ground Station Operations', 'Data Analysis', 'Communication Procedures', 'Anomaly Resolution'],
  'Dragon Mission Specialist': ['Rendezvous Operations', 'Telemetry Monitoring', 'Spacecraft Commanding', 'ISS Operations', 'Communication Procedures', 'Anomaly Resolution'],
  'Orbital Analyst': ['Flight Dynamics', 'Trajectory Analysis', 'Deorbit Planning', 'Data Analysis', 'Software Tools', 'Report Writing'],
  'Starlink Network Engineer': ['Constellation Management', 'Telemetry Monitoring', 'Network Analysis', 'Data Analysis', 'Anomaly Resolution', 'Software Tools'],

  // ============================================
  // TESLA OCCUPATION-SKILL MAPPINGS
  // ============================================

  // Battery Cell Manufacturing
  'Electrode Coating Technician': ['Electrode Coating', 'Electrode Slurry Mixing', 'Electrode Calendering', 'Statistical Process Control', 'Cleanroom Protocols', 'Quality Documentation'],
  'Cell Assembly Technician': ['Cell Winding', 'Tab Welding', 'Can Insertion', 'Cleanroom Protocols', 'ESD Control', 'Quality Documentation'],
  'Dry Electrode Technician': ['Dry Electrode Process', 'Electrode Coating', 'Statistical Process Control', 'Cleanroom Protocols', 'Quality Documentation', 'Process Monitoring'],
  'Cell Tabbing Technician': ['Tab Welding', 'Ultrasonic Welding', 'Laser Welding', 'Cleanroom Protocols', 'ESD Control', 'Quality Documentation'],
  'Electrolyte Fill Technician': ['Electrolyte Filling', 'Dry Room Operations', 'Cleanroom Protocols', 'Safety Protocols', 'Quality Documentation', 'Process Monitoring'],
  'Cell Formation Technician': ['Cell Formation', 'Cell Degassing', 'Cell Aging', 'Data Monitoring', 'Quality Documentation', 'Statistical Process Control'],
  'Cell Grading Technician': ['Cell Grading', 'Data Analysis', 'Statistical Process Control', 'Quality Documentation', 'Process Monitoring', 'Equipment Operation'],
  'Cell Aging Technician': ['Cell Aging', 'Data Monitoring', 'Quality Documentation', 'Statistical Process Control', 'Process Monitoring', 'Equipment Operation'],
  'Separator Coating Operator': ['Separator Handling', 'Coating Operations', 'Statistical Process Control', 'Cleanroom Protocols', 'Quality Documentation', 'Process Monitoring'],
  'Mixing Room Operator': ['Electrode Slurry Mixing', 'Chemical Handling', 'Process Monitoring', 'Safety Protocols', 'Quality Documentation', 'Statistical Process Control'],
  'Dry Room Technician': ['Dry Room Operations', 'Cleanroom Protocols', 'Safety Protocols', 'Process Monitoring', 'Quality Documentation', 'Equipment Operation'],
  'Battery Cell Inspector': ['Cell Grading', 'Visual Inspection VT', 'Data Analysis', 'Quality Documentation', 'Statistical Process Control', 'Inspection Report Writing'],

  // Battery Pack Assembly
  'Battery Module Assembler': ['Module Assembly', 'Cell Interconnect Welding', 'BMS Integration', 'Blueprint Reading', 'Torque Wrench Usage', 'ESD Control'],
  'Pack Assembly Technician': ['Pack Structural Adhesive', 'Pack Enclosure Sealing', 'HV Harness Installation', 'Blueprint Reading', 'Torque Wrench Usage', 'Safety Protocols'],
  'BMS Wire Harness Tech': ['BMS Integration', 'Wire Harness Assembly', 'Cell Voltage Sensing', 'Electrical Schematic Reading', 'Crimping', 'ESD Control'],
  'Busbar Welding Technician': ['Busbar Installation', 'Laser Welding', 'Cell Interconnect Welding', 'Blueprint Reading', 'Quality Documentation', 'Safety Protocols'],
  'Thermal Interface Technician': ['Thermal Interface Application', 'Pack Cooling System', 'Adhesive Application', 'Blueprint Reading', 'Quality Documentation', 'Process Monitoring'],
  'Pack Leak Test Technician': ['Pack Leak Testing', 'Helium Leak Detection', 'Data Analysis', 'Quality Documentation', 'Equipment Operation', 'Inspection Report Writing'],
  'Pack EOL Tester': ['Pack EOL Testing', 'HV Testing', 'Data Analysis', 'Quality Documentation', 'Equipment Operation', 'Anomaly Resolution'],
  'HV Connector Technician': ['HV Harness Installation', 'High Voltage Safety', 'Crimping', 'Electrical Schematic Reading', 'Blueprint Reading', 'Safety Protocols'],
  'Pack Enclosure Technician': ['Pack Enclosure Sealing', 'Adhesive Application', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation', 'Leak Testing'],
  'Coolant System Technician': ['Pack Cooling System', 'Fluid System Installation', 'Leak Testing', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation'],

  // Electric Motor Manufacturing
  'Motor Stator Winder': ['Stator Winding', 'Hairpin Insertion', 'Insulation Application', 'Blueprint Reading', 'Quality Documentation', 'Process Monitoring'],
  'Motor Rotor Assembler': ['Magnet Installation', 'Rotor Balancing', 'Bearing Installation', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation'],
  'Motor Magnet Inserter': ['Magnet Installation', 'Adhesive Application', 'Precision Assembly', 'Blueprint Reading', 'Quality Documentation', 'ESD Control'],
  'Hairpin Stator Technician': ['Hairpin Insertion', 'Hairpin Welding', 'Stator Winding', 'Blueprint Reading', 'Quality Documentation', 'Process Monitoring'],
  'Motor Housing Technician': ['Motor Housing Assembly', 'Bearing Installation', 'Seal Installation', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation'],
  'Motor Balancing Technician': ['Rotor Balancing', 'Vibration Analysis', 'Data Analysis', 'Quality Documentation', 'Equipment Operation', 'Inspection Report Writing'],
  'Motor EOL Test Technician': ['Motor EOL Testing', 'Dynamometer Testing', 'Data Analysis', 'Quality Documentation', 'Equipment Operation', 'Anomaly Resolution'],
  'Motor Potting Technician': ['Stator Potting', 'Adhesive Application', 'Vacuum Impregnation', 'Blueprint Reading', 'Quality Documentation', 'Process Monitoring'],

  // Power Electronics
  'Inverter Assembly Technician': ['Inverter Assembly', 'SiC MOSFET Assembly', 'PCB Assembly', 'Electrical Schematic Reading', 'ESD Control', 'Quality Documentation'],
  'Power Module Technician': ['SiC MOSFET Assembly', 'Power Module Sintering', 'Wire Bonding', 'Cleanroom Protocols', 'ESD Control', 'Quality Documentation'],
  'DC-DC Converter Technician': ['DC-DC Converter Assembly', 'PCB Assembly', 'Electrical Schematic Reading', 'ESD Control', 'Quality Documentation', 'Functional Test'],
  'Onboard Charger Technician': ['Onboard Charger Assembly', 'PCB Assembly', 'Electrical Schematic Reading', 'ESD Control', 'Quality Documentation', 'Functional Test'],
  'PE Thermal Technician': ['PE Thermal Management', 'Thermal Interface Application', 'Heat Sink Installation', 'Blueprint Reading', 'Quality Documentation', 'Leak Testing'],
  'PE PCB Assembler': ['PCB Assembly', 'SMT Soldering', 'Through-Hole Soldering', 'Electrical Schematic Reading', 'ESD Control', 'Quality Documentation'],
  'PE Test Technician': ['HV Testing', 'Functional Test', 'Data Analysis', 'Quality Documentation', 'Equipment Operation', 'Anomaly Resolution'],
  'Capacitor Bank Technician': ['Film Capacitor Assembly', 'HV Testing', 'Electrical Schematic Reading', 'Blueprint Reading', 'Safety Protocols', 'Quality Documentation'],

  // Giga Press / Die Casting
  'Giga Press Operator': ['Giga Press Operation', 'Vacuum Die Casting', 'Shot Sleeve Operation', 'Process Monitoring', 'Safety Protocols', 'Quality Documentation'],
  'Die Cast Setup Technician': ['Mega Casting Tooling', 'Die Spray Systems', 'Process Setup', 'Blueprint Reading', 'Quality Documentation', 'Troubleshooting'],
  'Die Maintenance Technician': ['Mega Casting Tooling', 'Die Repair', 'Precision Grinding', 'Blueprint Reading', 'Preventive Maintenance', 'Quality Documentation'],
  'Casting Trim Operator': ['Casting Trim Operations', 'CNC Operation', 'Blueprint Reading', 'Quality Documentation', 'Safety Protocols', 'Process Monitoring'],
  'Casting X-Ray Inspector': ['Casting X-Ray Inspection', 'Digital Radiography DR', 'Data Analysis', 'Quality Documentation', 'Inspection Report Writing', 'Defect Recognition'],
  'Casting Heat Treat Tech': ['Casting Heat Treatment', 'Furnace Operation', 'Process Monitoring', 'Quality Documentation', 'Temperature Control', 'Safety Protocols'],
  'Casting CNC Machinist': ['Structural Casting Machining', 'CNC Programming', '5-Axis Machining', 'GD&T Interpretation', 'Blueprint Reading', 'CMM Operation'],
  'Alloy Preparation Tech': ['Alloy Preparation', 'Furnace Operation', 'Chemical Analysis', 'Process Monitoring', 'Safety Protocols', 'Quality Documentation'],
  'Casting Quality Engineer': ['Statistical Process Control', 'Process Optimization', 'Root Cause Analysis', 'Quality Documentation', 'Data Analysis', 'Process FMEA'],
  'Die Design Engineer': ['CAD Design', 'Die Flow Analysis', 'GD&T Interpretation', 'Blueprint Reading', 'Process Simulation', 'Material Selection'],

  // Body Assembly
  'Body Framing Technician': ['Robot Operation', 'Spot Weld Monitoring', 'Blueprint Reading', 'Quality Documentation', 'Safety Protocols', 'Process Monitoring'],
  'Spot Weld Technician': ['Robotic Spot Welding', 'Weld Quality Inspection', 'Robot Operation', 'Blueprint Reading', 'Quality Documentation', 'Troubleshooting'],
  'Laser Welding Technician': ['Laser Welding', 'Laser Brazing', 'Robot Operation', 'Blueprint Reading', 'Quality Documentation', 'Process Monitoring'],
  'Adhesive Bonding Technician': ['Structural Adhesive Bonding', 'Adhesive Application', 'Surface Preparation', 'Blueprint Reading', 'Quality Documentation', 'Process Monitoring'],
  'Body Panel Technician': ['Panel Fitting', 'Gap and Flush Measurement', 'Hand Tools', 'Blueprint Reading', 'Quality Documentation', 'Adjustment Procedures'],
  'Closure Technician': ['Door Installation', 'Hinge Adjustment', 'Gap and Flush Measurement', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation'],
  'Body Dimensional Inspector': ['Body Dimensional Measurement', 'CMM Operation', 'Data Analysis', 'Quality Documentation', 'GD&T Interpretation', 'Inspection Report Writing'],
  'Sealer Application Tech': ['Sealer Application', 'Robot Operation', 'Blueprint Reading', 'Quality Documentation', 'Process Monitoring', 'Visual Inspection VT'],
  'Underbody Assembly Tech': ['Underbody Assembly', 'Robotic Spot Welding', 'Blueprint Reading', 'Quality Documentation', 'Safety Protocols', 'Process Monitoring'],

  // Paint Shop
  'Pretreatment Operator': ['Chemical Processing', 'Tank Maintenance', 'Process Monitoring', 'Safety Protocols', 'Quality Documentation', 'Water Treatment'],
  'E-Coat Operator': ['E-Coat Processing', 'Tank Maintenance', 'Process Monitoring', 'Safety Protocols', 'Quality Documentation', 'Electrical Systems'],
  'Sealer Booth Technician': ['Sealer Application', 'Robot Operation', 'Blueprint Reading', 'Quality Documentation', 'Process Monitoring', 'Visual Inspection VT'],
  'Prime Coat Technician': ['Robotic Paint Application', 'Paint Booth Operation', 'Process Monitoring', 'Quality Documentation', 'Color Matching', 'Safety Protocols'],
  'Base Coat Technician': ['Robotic Paint Application', 'Paint Booth Operation', 'Color Matching', 'Process Monitoring', 'Quality Documentation', 'Safety Protocols'],
  'Clear Coat Technician': ['Robotic Paint Application', 'Paint Booth Operation', 'Process Monitoring', 'Quality Documentation', 'Safety Protocols', 'Visual Inspection VT'],
  'Paint Repair Technician': ['Paint Defect Repair', 'Sanding', 'Touch-Up Painting', 'Color Matching', 'Quality Documentation', 'Visual Inspection VT'],
  'Color Match Technician': ['Color Matching', 'Spectrophotometer Operation', 'Paint Mixing', 'Quality Documentation', 'Data Analysis', 'Process Monitoring'],
  'Paint Robot Programmer': ['Robot Programming', 'Paint Path Programming', 'Process Optimization', 'Software Programming', 'Quality Documentation', 'Troubleshooting'],
  'Paint Quality Inspector': ['Paint Defect Detection', 'Visual Inspection VT', 'Color Matching', 'Quality Documentation', 'Data Analysis', 'Inspection Report Writing'],

  // General Assembly
  'Trim Assembly Technician': ['Interior Assembly', 'Fastener Installation', 'Blueprint Reading', 'Quality Documentation', 'Torque Wrench Usage', 'Visual Inspection VT'],
  'Cockpit Installation Tech': ['Cockpit Module Install', 'Electrical Connection', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation', 'Safety Protocols'],
  'Glass Installation Tech': ['Glass Bonding', 'Adhesive Application', 'Alignment Procedures', 'Blueprint Reading', 'Quality Documentation', 'Safety Protocols'],
  'Seat Installation Tech': ['Seat Installation', 'Electrical Connection', 'Torque Wrench Usage', 'Blueprint Reading', 'Quality Documentation', 'Safety Protocols'],
  'Headliner Installation Tech': ['Interior Assembly', 'Adhesive Application', 'Blueprint Reading', 'Quality Documentation', 'Visual Inspection VT', 'Hand Tools'],
  'HVAC Installation Tech': ['HVAC Integration', 'Refrigerant Handling', 'Electrical Connection', 'Blueprint Reading', 'Torque Wrench Usage', 'Leak Testing'],
  'Wheel and Tire Tech': ['Wheel Installation', 'Torque Wrench Usage', 'TPMS Programming', 'Blueprint Reading', 'Quality Documentation', 'Safety Protocols'],
  'Fluid Fill Technician': ['Fluid Fill Systems', 'Process Monitoring', 'Quality Documentation', 'Safety Protocols', 'Equipment Operation', 'Leak Detection'],
  'Vehicle Alignment Tech': ['Wheel Alignment', 'Alignment Equipment', 'Data Analysis', 'Quality Documentation', 'Adjustment Procedures', 'Vehicle Testing'],
  'Vehicle Final Inspector': ['Final Inspection', 'Visual Inspection VT', 'Functional Test', 'Quality Documentation', 'Data Analysis', 'Inspection Report Writing'],

  // Drive Unit Assembly
  'Drive Unit Assembler': ['Motor Housing Assembly', 'Gearbox Assembly', 'Bearing Installation', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation'],
  'Gearbox Assembly Tech': ['Gearbox Assembly', 'Gear Installation', 'Bearing Installation', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation'],
  'Drive Unit Test Technician': ['Dyno Testing', 'Motor EOL Testing', 'Data Analysis', 'Quality Documentation', 'Equipment Operation', 'Anomaly Resolution'],
  'Drive Unit Integration Tech': ['Drive Unit Marriage', 'Electrical Connection', 'Fluid System Connection', 'Blueprint Reading', 'Torque Wrench Usage', 'Quality Documentation'],

  // Automation and Robotics
  'Tesla Robot Technician': ['KUKA Robot Programming', 'FANUC Robot Programming', 'Robot Maintenance', 'Electrical Troubleshooting', 'Safety Protocols', 'Preventive Maintenance'],
  'Vision System Technician': ['Vision System Setup', 'Camera Calibration', 'Image Processing', 'Troubleshooting', 'Quality Documentation', 'Software Configuration'],
  'Conveyor System Tech': ['Conveyor Maintenance', 'AGV Programming', 'Mechanical Maintenance', 'Electrical Troubleshooting', 'Safety Protocols', 'Preventive Maintenance'],
  'PLC Programmer': ['Allen-Bradley PLC', 'Siemens TIA Portal', 'Ladder Logic Programming', 'HMI Development', 'Troubleshooting', 'Documentation'],
  'Tesla Robot Programmer': ['KUKA Robot Programming', 'FANUC Robot Programming', 'Path Optimization', 'Process Programming', 'Safety Protocols', 'Documentation'],
  'Controls Technician': ['PLC Troubleshooting', 'Electrical Troubleshooting', 'Sensor Calibration', 'Safety Systems', 'Preventive Maintenance', 'Documentation'],
  'Automation Integration Engineer': ['System Integration', 'OPC-UA Integration', 'PLC Programming', 'Robot Programming', 'Process Optimization', 'Documentation'],
  'Manufacturing Data Analyst': ['OEE Analysis', 'Data Analysis', 'Statistical Process Control', 'Manufacturing Execution', 'Report Writing', 'Process Improvement'],

  // Tesla Engineering
  'Battery Cell Engineer': ['Cell Chemistry', 'Electrode Design', 'Cell Testing', 'Data Analysis', 'Process Development', 'Technical Documentation'],
  'Pack Design Engineer': ['Pack Design', 'BMS Design', 'Thermal Design', 'CAD Design', 'Simulation', 'Technical Documentation'],
  'Motor Design Engineer': ['Motor Design', 'Electromagnetic Simulation', 'CAD Design', 'Testing Protocols', 'Data Analysis', 'Technical Documentation'],
  'Power Electronics Engineer': ['Inverter Design', 'Power Semiconductor Selection', 'Circuit Design', 'Simulation', 'Testing Protocols', 'Technical Documentation'],
  'Casting Process Engineer': ['Casting Process Optimization', 'Die Design Review', 'Statistical Process Control', 'Root Cause Analysis', 'Process FMEA', 'Technical Documentation'],
  'Body Process Engineer': ['Welding Process Optimization', 'Robot Programming', 'Statistical Process Control', 'Root Cause Analysis', 'Process FMEA', 'Technical Documentation'],
  'Paint Process Engineer': ['Paint Process Optimization', 'Robot Programming', 'Statistical Process Control', 'Root Cause Analysis', 'Process FMEA', 'Technical Documentation'],
  'Assembly Process Engineer': ['Assembly Process Design', 'Ergonomics', 'Statistical Process Control', 'Root Cause Analysis', 'Process FMEA', 'Technical Documentation'],
  'NPI Launch Engineer': ['New Product Introduction', 'Process Development', 'Equipment Qualification', 'Training Development', 'Documentation', 'Project Management'],
  'Manufacturing Test Engineer': ['Test System Design', 'Test Software Development', 'Data Analysis', 'Equipment Qualification', 'Documentation', 'Troubleshooting'],
  'Quality Systems Engineer': ['Quality System Management', 'IATF 16949 Compliance', 'Audit Management', 'Document Control', 'Training', 'Process Improvement'],
  'Supplier Quality Engineer': ['Supplier Assessment', 'PPAP Review', 'Audit Procedures', 'Root Cause Analysis', 'Quality Documentation', 'Supplier Development'],

  // ============================================
  // SEMICONDUCTOR OCCUPATION-SKILL MAPPINGS
  // ============================================

  'Wafer Fab Operator': ['Wafer Handling', 'Cleanroom Gowning', 'Process Monitoring', 'Equipment Operation', 'Data Documentation', 'Safety Protocols'],
  'Diffusion Furnace Operator': ['Thermal Oxidation', 'Furnace Annealing', 'Wafer Handling', 'Process Monitoring', 'Temperature Control', 'Cleanroom Gowning'],
  'Ion Implant Operator': ['Ion Implantation', 'Wafer Handling', 'Process Monitoring', 'Equipment Operation', 'Safety Protocols', 'Cleanroom Gowning'],
  'CVD Process Technician': ['LPCVD Process', 'PECVD Process', 'Wafer Handling', 'Process Monitoring', 'Gas Delivery', 'Cleanroom Gowning'],
  'PVD Sputter Technician': ['PVD Sputtering', 'Wafer Handling', 'Vacuum Systems', 'Process Monitoring', 'Equipment Maintenance', 'Cleanroom Gowning'],
  'ALD Process Technician': ['ALD Process', 'Wafer Handling', 'Process Monitoring', 'Equipment Operation', 'Precursor Handling', 'Cleanroom Gowning'],
  'CMP Operator': ['CMP Polish', 'Wafer Handling', 'Slurry Handling', 'Process Monitoring', 'Endpoint Detection', 'Cleanroom Gowning'],
  'Dry Etch Technician': ['Plasma Etch', 'RIE Process', 'Wafer Handling', 'Process Monitoring', 'Endpoint Detection', 'Cleanroom Gowning'],
  'Photo Operator': ['Photoresist Application', 'Photoresist Develop', 'Overlay Measurement', 'Wafer Handling', 'Cleanroom Gowning', 'Process Monitoring'],
  'EUV Scanner Operator': ['EUV Lithography', 'Wafer Handling', 'Overlay Measurement', 'CD Measurement', 'Cleanroom Gowning', 'Equipment Operation'],
  'CD Metrology Technician': ['CD Measurement', 'CD-SEM Operation', 'Data Analysis', 'Wafer Handling', 'Cleanroom Gowning', 'Statistical Process Control'],
  'Fab Metrology Technician': ['Ellipsometry Measurement', 'Four Point Probe', 'Stress Measurement', 'Wafer Handling', 'Data Analysis', 'Cleanroom Gowning'],
  'Defect Review Technician': ['Defect SEM Review', 'Defect Classification', 'Wafer Defect Inspection', 'Data Analysis', 'Cleanroom Gowning', 'Inspection Report Writing'],
  'Litho Process Engineer': ['EUV Lithography', 'Immersion Lithography', 'OPC Application', 'Focus Exposure Matrix', 'CD Measurement', 'Overlay Measurement'],
  'CVD Process Engineer': ['LPCVD Process', 'PECVD Process', 'ALD Process', 'Process Development', 'Statistical Process Control', 'Equipment Qualification'],
  'Etch Process Engineer': ['Plasma Etch', 'RIE Process', 'ICP Etch', 'Process Development', 'Endpoint Detection', 'Statistical Process Control'],
  'Yield Engineer': ['Statistical Process Control', 'Data Analysis', 'Defect Classification', 'Root Cause Analysis', 'Process Improvement', 'Wafer Defect Inspection'],
  'Integration Engineer': ['Process Development', 'TCAD Simulation', 'Device Physics', 'Yield Analysis', 'Cross-Functional Coordination', 'Technical Documentation'],
  'ASML Field Service Engineer': ['EUV Lithography', 'Immersion Lithography', 'Equipment Maintenance', 'Troubleshooting', 'Customer Support', 'Technical Documentation'],
  'Package Engineer': ['Die Attach Bonding', 'Wire Bonding Gold', 'Flip Chip Bonding', 'Package Design', 'Thermal Analysis', 'Reliability Testing'],
  'Test Engineer Semiconductor': ['Final Test ATE', 'Wafer Probe Testing', 'Test Program Development', 'Data Analysis', 'Yield Improvement', 'Technical Documentation'],
  'Failure Analysis Engineer': ['FIB Cross Section', 'TEM Sample Prep', 'Defect SEM Review', 'SIMS Analysis', 'Root Cause Analysis', 'Technical Documentation'],

  // ============================================
  // COMPUTER/ELECTRONICS OCCUPATION-SKILL MAPPINGS
  // ============================================

  'SMT Line Operator': ['Solder Paste Printing', 'Pick and Place Programming', 'Reflow Profile Setup', 'AOI Programming', 'Process Monitoring', 'Quality Documentation'],
  'Pick and Place Operator': ['Pick and Place Programming', 'Component Handling', 'Feeder Setup', 'Process Monitoring', 'Quality Documentation', 'Equipment Operation'],
  'Reflow Oven Operator': ['Reflow Profile Setup', 'Temperature Monitoring', 'Process Monitoring', 'Equipment Maintenance', 'Quality Documentation', 'Safety Protocols'],
  'AOI Operator': ['AOI Programming', 'Defect Recognition', 'Data Analysis', 'Process Monitoring', 'Quality Documentation', 'Inspection Report Writing'],
  'BGA Rework Technician': ['BGA Reballing', 'SMT Soldering', 'Rework Station Operation', 'Inspection', 'ESD Control', 'Quality Documentation'],
  'Server Assembly Tech': ['Server Rack Assembly', 'Memory Module Install', 'SSD Installation', 'Cable Management', 'BIOS Configuration', 'Burn-In Testing'],
  'Laptop Assembly Tech': ['Display Module Assembly', 'Battery Assembly Mobile', 'Thermal Paste Application', 'Keyboard Assembly', 'Quality Documentation', 'ESD Control'],
  'iPhone Assembly Tech': ['Display Module Assembly', 'Camera Module Assembly', 'Battery Assembly Mobile', 'Touch Panel Calibration', 'Waterproof Seal Apply', 'Quality Documentation'],
  'Hardware Design Engineer': ['PCB Layout Design', 'Signal Integrity Analysis', 'Power Integrity Analysis', 'EMC Design', 'Schematic Capture', 'Technical Documentation'],
  'PCB Layout Engineer': ['PCB Layout Design', 'Signal Integrity Analysis', 'Design Rule Check', 'High Speed Design', 'EMC Design', 'Technical Documentation'],
  'Firmware Engineer': ['Embedded C Programming', 'RTOS Programming', 'Hardware Debug', 'Protocol Implementation', 'Code Review', 'Technical Documentation'],
  'Validation Engineer': ['Test Plan Development', 'Functional Testing', 'Stress Testing', 'Data Analysis', 'Bug Reporting', 'Technical Documentation'],

  // ============================================
  // AEROSPACE/DEFENSE OCCUPATION-SKILL MAPPINGS
  // ============================================

  'Fuselage Join Mechanic': ['Major Assembly Join', 'Skin Panel Installation', 'Hi-Lok Installation', 'Blueprint Reading', 'Torque Wrench Usage', 'Aerospace Sealant Application'],
  'Wing-Body Join Mechanic': ['Major Assembly Join', 'Wing Spar Installation', 'Hi-Lok Installation', 'Blueprint Reading', 'Torque Wrench Usage', 'Alignment Procedures'],
  'Flight Deck Assembly': ['Instrument Panel Installation', 'Wire Harness Assembly', 'Electrical Schematic Reading', 'Blueprint Reading', 'Torque Wrench Usage', 'Functional Test'],
  'Fighter Assembly Mechanic': ['Stealth Coating Apply', 'Weapons Bay Mechanic', 'Radar System Integration', 'Blueprint Reading', 'Torque Wrench Usage', 'Security Clearance'],
  'Stealth Coatings Tech': ['Stealth Coating Apply', 'Surface Preparation', 'Material Handling', 'Quality Documentation', 'Blueprint Reading', 'Safety Protocols'],
  'Missile Assembly Tech': ['Guidance System Integration', 'Propulsion Integration', 'Wire Harness Assembly', 'Blueprint Reading', 'Torque Wrench Usage', 'Security Clearance'],
  'Satellite Bus Tech': ['Satellite Structure Assembly', 'Harness Routing Space', 'Cleanroom Protocols', 'Blueprint Reading', 'Torque Wrench Usage', 'ESD Control'],
  'NASA Flight Hardware Tech': ['Cleanroom Protocols', 'Torque Wrench Usage', 'Wire Harness Assembly', 'Blueprint Reading', 'Quality Documentation', 'Flight Hardware Processing'],
  'Phased Array Tech': ['RF Assembly', 'TR Module Assembly', 'Antenna Assembly', 'RF Testing', 'Blueprint Reading', 'ESD Control'],
  'Patriot System Tech': ['Missile Assembly', 'Radar System Integration', 'Wire Harness Assembly', 'Blueprint Reading', 'Security Clearance', 'Functional Test'],

  // ============================================
  // AUTOMOTIVE OCCUPATION-SKILL MAPPINGS
  // ============================================

  'Stamping Press Operator': ['Transfer Die Operation', 'Progressive Die Operation', 'Die Setting Automotive', 'Panel Quality Check', 'Safety Protocols', 'Process Monitoring'],
  'Die Setter': ['Die Setting Automotive', 'Die Spotting', 'Die Tryout', 'Crane Operation', 'Blueprint Reading', 'Safety Protocols'],
  'Body Weld Technician': ['Resistance Spot Weld', 'MIG Weld Automotive', 'Weld Tip Dress', 'Blueprint Reading', 'Quality Documentation', 'Safety Protocols'],
  'Spot Weld Operator Auto': ['Resistance Spot Weld', 'Weld Tip Dress', 'Robot Operation', 'Process Monitoring', 'Quality Documentation', 'Safety Protocols'],
  'Laser Weld Operator Auto': ['Laser Weld Automotive', 'Laser Braze Automotive', 'Robot Operation', 'Process Monitoring', 'Quality Documentation', 'Safety Protocols'],
  'Phosphate Operator': ['Pretreatment Operation', 'Chemical Handling', 'Tank Maintenance', 'Process Monitoring', 'Safety Protocols', 'Quality Documentation'],
  'E-Coat Operator Auto': ['E-Coat Operation', 'Tank Maintenance', 'Process Monitoring', 'Electrical Systems', 'Safety Protocols', 'Quality Documentation'],
  'Base Coat Spray Op': ['Base Coat Application', 'Color Matching Auto', 'Robot Operation', 'Process Monitoring', 'Quality Documentation', 'Safety Protocols'],
  'Suspension Installer': ['Torque Wrench Usage', 'Blueprint Reading', 'Suspension Systems', 'Quality Documentation', 'Safety Protocols', 'Assembly Procedures'],
  'Engine Assembly Tech Auto': ['Torque Wrench Usage', 'Blueprint Reading', 'Precision Measurement', 'Quality Documentation', 'Assembly Procedures', 'Engine Systems'],
  'Transmission Assembly': ['Torque Wrench Usage', 'Blueprint Reading', 'Gear Installation', 'Quality Documentation', 'Assembly Procedures', 'Precision Measurement'],
  'Final Line Inspector': ['Final Inspection Auto', 'Water Leak Test Auto', 'Squeak Rattle Test', 'Roll Test', 'Quality Documentation', 'Inspection Report Writing'],

  // ============================================
  // INDUSTRIAL MACHINERY OCCUPATION-SKILL MAPPINGS
  // ============================================

  'Machine Tool Assembler': ['Machine Bed Scraping', 'Ballscrew Installation', 'Linear Guide Install', 'Geometric Alignment', 'Blueprint Reading', 'Precision Measurement'],
  'Spindle Assembler': ['Spindle Assembly', 'Spindle Balancing', 'Bearing Installation', 'Precision Grinding', 'Blueprint Reading', 'Quality Documentation'],
  'Way System Scraper': ['Machine Bed Scraping', 'Precision Measurement', 'Hand Fitting', 'Blueprint Reading', 'Quality Documentation', 'Surface Finish'],
  'Servo Drive Installer': ['Servo Tuning', 'CNC Parameter Setup', 'Electrical Schematic Reading', 'Troubleshooting', 'Technical Documentation', 'Safety Protocols'],
  'Geometric Alignment Tech': ['Geometric Alignment', 'Laser Interferometry', 'Ballbar Testing', 'Machine Calibration', 'Technical Documentation', 'Precision Measurement'],
  'PLC Assembly Technician': ['PLC Wiring', 'Electrical Schematic Reading', 'I/O Testing', 'Technical Documentation', 'Safety Protocols', 'Quality Documentation'],
  'Drive System Assembler': ['VFD Assembly', 'Motor Connections', 'Electrical Schematic Reading', 'Testing Procedures', 'Technical Documentation', 'Safety Protocols'],
  'Turbine Assembly Tech': ['Precision Assembly', 'Torque Wrench Usage', 'Blueprint Reading', 'Quality Documentation', 'Balancing', 'Safety Protocols'],

  // ============================================
  // PHARMA/MEDICAL OCCUPATION-SKILL MAPPINGS
  // ============================================

  'Tablet Press Operator': ['Tablet Compression', 'cGMP Compliance', 'Process Monitoring', 'In-Process Testing', 'Equipment Cleaning', 'Documentation'],
  'Coating Pan Operator': ['Film Coating', 'cGMP Compliance', 'Process Monitoring', 'In-Process Testing', 'Equipment Cleaning', 'Documentation'],
  'Vial Fill Operator': ['Aseptic Filling', 'Aseptic Technique', 'cGMP Compliance', 'Gowning Qualification', 'Environmental Monitoring', 'Documentation'],
  'Lyophilization Operator': ['Lyophilization', 'cGMP Compliance', 'Process Monitoring', 'Equipment Operation', 'Documentation', 'Aseptic Technique'],
  'QC Analyst Pharma': ['HPLC Analysis', 'GC Analysis', 'Dissolution Testing', 'cGMP Compliance', 'Documentation', 'Data Analysis'],
  'HPLC Analyst': ['HPLC Analysis', 'Method Validation', 'cGMP Compliance', 'Data Analysis', 'Documentation', 'Equipment Maintenance'],
  'Microbiology Analyst': ['Microbial Testing Food', 'Sterility Testing', 'Endotoxin Testing', 'Aseptic Technique', 'cGMP Compliance', 'Documentation'],
  'Surgical Instrument Assembler': ['Precision Assembly', 'Cleanroom Protocols', 'Quality Documentation', 'Blueprint Reading', 'Inspection', 'cGMP Compliance'],
  'Implant Assembler': ['Precision Assembly', 'Cleanroom Protocols', 'Quality Documentation', 'Blueprint Reading', 'Inspection', 'cGMP Compliance'],
  'Pacemaker Assembler': ['Precision Assembly', 'Wire Bonding', 'Cleanroom Protocols', 'ESD Control', 'Quality Documentation', 'cGMP Compliance'],

  // ============================================
  // FOOD/CONSUMER GOODS OCCUPATION-SKILL MAPPINGS
  // ============================================

  'Food Blending Operator': ['Food Safety HACCP', 'Sanitation SOP', 'Process Monitoring', 'Equipment Operation', 'Documentation', 'Safety Protocols'],
  'Retort Operator': ['Retort Operation', 'Food Safety HACCP', 'Process Monitoring', 'Temperature Control', 'Documentation', 'Safety Protocols'],
  'Pasteurizer Operator': ['Pasteurization', 'Food Safety HACCP', 'Process Monitoring', 'Temperature Control', 'CIP System Operation', 'Documentation'],
  'Spray Dryer Operator': ['Spray Drying Food', 'Process Monitoring', 'Temperature Control', 'Equipment Maintenance', 'Documentation', 'Safety Protocols'],
  'Carbonation Operator': ['Carbonation Process', 'Process Monitoring', 'Brix Testing', 'Equipment Operation', 'Documentation', 'Safety Protocols'],
  'Filler Operator Beverage': ['Bottle Filling', 'CIP System Operation', 'Food Safety HACCP', 'Process Monitoring', 'Documentation', 'Safety Protocols'],
  'Soap Making Operator': ['Chemical Handling', 'Process Monitoring', 'Equipment Operation', 'Quality Testing', 'Documentation', 'Safety Protocols'],
  'Detergent Blending Op': ['Chemical Handling', 'Process Monitoring', 'Batch Preparation', 'Quality Testing', 'Documentation', 'Safety Protocols'],
  'Diaper Line Operator': ['Equipment Operation', 'Process Monitoring', 'Quality Inspection', 'Troubleshooting', 'Documentation', 'Safety Protocols'],

  // ============================================
  // SOFTWARE/CAD OCCUPATION-SKILL MAPPINGS
  // ============================================

  'CAD Software Developer': ['Geometric Modeling', 'Parametric Design', 'API Automation', 'Software Development', 'Code Review', 'Technical Documentation'],
  'Graphics Engine Developer': ['Rendering Visualization', 'GPU Programming', '3D Graphics', 'Performance Optimization', 'Code Review', 'Technical Documentation'],
  'Geometry Kernel Developer': ['Geometric Modeling', 'Surface Modeling', 'Mesh Modeling', 'Algorithm Development', 'Code Review', 'Technical Documentation'],
  'Simulation Developer': ['FEA Simulation', 'CFD Simulation', 'Motion Simulation', 'Numerical Methods', 'Code Review', 'Technical Documentation'],
  'Cloud Platform Developer': ['Cloud Architecture', 'API Development', 'Web Services', 'Security Implementation', 'Code Review', 'Technical Documentation'],
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

    // Insert factories with intelligent assignment
    console.log('Inserting factories...');

    // Map specializations to industries for smart matching
    const specializationToIndustry: Record<string, string[]> = {
      'Automotive Assembly': ['Automotive'],
      'Automotive Parts': ['Automotive'],
      'Automotive Powertrain': ['Automotive'],
      'Powertrain Components': ['Automotive'],
      'Transmission Components': ['Automotive'],
      'Transmission Assembly': ['Automotive'],
      'Electric Vehicle Assembly': ['Automotive', 'Energy'],
      'Automotive R&D': ['Automotive'],
      'Automotive Engineering': ['Automotive'],
      'Automotive Components': ['Automotive'],
      'Sports Cars': ['Automotive'],
      'Semiconductor': ['Electronics'],
      'Semiconductor Fab': ['Electronics'],
      'Semiconductor Testing': ['Electronics'],
      'Electronics': ['Electronics'],
      'Electronics Assembly': ['Electronics'],
      'Defense Electronics': ['Electronics', 'Aerospace & Defense'],
      'Aerospace': ['Aerospace & Defense'],
      'Aerospace Assembly': ['Aerospace & Defense'],
      'Aerospace Components': ['Aerospace & Defense'],
      'Aerospace Parts': ['Aerospace & Defense'],
      'Aerospace Engines': ['Aerospace & Defense'],
      'Aerospace Instruments': ['Aerospace & Defense'],
      'Aerospace Fasteners': ['Aerospace & Defense'],
      'Aerospace Missiles': ['Aerospace & Defense'],
      'Commercial Aircraft': ['Aerospace & Defense'],
      'Aircraft Assembly': ['Aerospace & Defense'],
      'Wide-Body Aircraft': ['Aerospace & Defense'],
      'Defense Aircraft': ['Aerospace & Defense'],
      'General Aviation': ['Aerospace & Defense'],
      'Helicopter Manufacturing': ['Aerospace & Defense'],
      'Helicopter Assembly': ['Aerospace & Defense'],
      'Jet Engines': ['Aerospace & Defense'],
      'Space Systems': ['Aerospace & Defense'],
      'Launch Systems': ['Aerospace & Defense'],
      'Defense Systems': ['Aerospace & Defense'],
      'Defense Simulation': ['Aerospace & Defense'],
      'Defense Vehicles': ['Aerospace & Defense'],
      'Defense Logistics': ['Aerospace & Defense'],
      'Military Equipment': ['Aerospace & Defense'],
      'Military Vehicles': ['Aerospace & Defense'],
      'Military Vehicle Overhaul': ['Aerospace & Defense'],
      'Naval Systems': ['Aerospace & Defense'],
      'Naval Aircraft': ['Aerospace & Defense'],
      'Shipbuilding': ['Aerospace & Defense', 'Metals & Fabrication'],
      'Ammunition': ['Aerospace & Defense'],
      'Medical Devices': ['Medical & Pharmaceuticals'],
      'Medical Equipment': ['Medical & Pharmaceuticals'],
      'Healthcare Products': ['Medical & Pharmaceuticals'],
      'Pharmaceutical': ['Medical & Pharmaceuticals'],
      'Biotech': ['Medical & Pharmaceuticals'],
      'Biotech Manufacturing': ['Medical & Pharmaceuticals'],
      'Steel Processing': ['Metals & Fabrication'],
      'Steel Production': ['Metals & Fabrication'],
      'Steel Fabrication': ['Metals & Fabrication'],
      'Specialty Steel': ['Metals & Fabrication'],
      'Aluminum Processing': ['Metals & Fabrication'],
      'Aluminum Products': ['Metals & Fabrication'],
      'Metal Fabrication': ['Metals & Fabrication'],
      'Heavy Fabrication': ['Metals & Fabrication'],
      'Precision Components': ['Metals & Fabrication'],
      'Industrial Machinery': ['Industrial Machinery'],
      'Industrial Equipment': ['Industrial Machinery'],
      'Industrial Controls': ['Industrial Machinery'],
      'Heavy Machinery': ['Industrial Machinery'],
      'Heavy Equipment': ['Industrial Machinery'],
      'Machine Tools': ['Industrial Machinery'],
      'Construction Equipment': ['Industrial Machinery', 'Construction'],
      'Agricultural Equipment': ['Industrial Machinery', 'Agriculture & Food'],
      'Agricultural Machinery': ['Industrial Machinery', 'Agriculture & Food'],
      'Agricultural Processing': ['Agriculture & Food'],
      'Agriculture Equipment': ['Agriculture & Food'],
      'Specialty Vehicles': ['Industrial Machinery', 'Automotive'],
      'Crane Manufacturing': ['Industrial Machinery'],
      'Locomotive Manufacturing': ['Industrial Machinery'],
      'Diesel Engines': ['Industrial Machinery', 'Automotive'],
      'Petrochemical': ['Energy'],
      'Petrochemical Equipment': ['Energy'],
      'Oilfield Equipment': ['Energy'],
      'Oil Equipment': ['Energy'],
      'Offshore Equipment': ['Energy'],
      'Nuclear Components': ['Energy'],
      'Solar Panels': ['Energy'],
      'Wind Turbine Components': ['Energy'],
      'Battery Manufacturing': ['Energy', 'Electronics'],
      'Battery Assembly': ['Energy', 'Electronics'],
      'EV Battery Packs': ['Energy', 'Automotive'],
      'Clean Technology': ['Energy'],
      'Food Processing': ['Agriculture & Food'],
      'Paper Products': ['Polymers & Composites'],
      'Paper Manufacturing': ['Polymers & Composites'],
      'Paper Machinery': ['Industrial Machinery'],
      'Chemical Manufacturing': ['Energy', 'Polymers & Composites'],
      'Chemical Processing': ['Energy', 'Polymers & Composites'],
      'Polymers and Rubber': ['Polymers & Composites'],
      'Composite Materials': ['Polymers & Composites'],
      'Glass Manufacturing': ['Metals & Fabrication'],
      'RV Manufacturing': ['Automotive'],
      'Appliance Manufacturing': ['Electronics', 'Industrial Machinery'],
      'HVAC Equipment': ['Industrial Machinery'],
      'Logistics Equipment': ['Industrial Machinery'],
      'Precision Tools': ['Industrial Machinery'],
      'Precision Instruments': ['Industrial Machinery', 'Electronics'],
      'Precision Manufacturing': ['Industrial Machinery'],
      'Telecom Equipment': ['Electronics'],
      'Computer Assembly': ['Electronics'],
      'Computer Systems': ['Electronics'],
      'Tech Hardware': ['Electronics'],
      'Optics and Imaging': ['Electronics'],
      'Textiles': ['Polymers & Composites'],
      'Textile Machinery': ['Industrial Machinery'],
      'Energy Equipment': ['Energy', 'Industrial Machinery'],
      'Electrical Equipment': ['Electronics', 'Industrial Machinery'],
      'Turbine Manufacturing': ['Energy', 'Industrial Machinery'],
      'R&D and Prototyping': ['Industrial Machinery'],
      'Research Equipment': ['Industrial Machinery'],
      'Tank Manufacturing': ['Aerospace & Defense'],
      'Furniture Manufacturing': ['Polymers & Composites'],
      'Jewelry and Metals': ['Metals & Fabrication'],
      'Tobacco Machinery': ['Industrial Machinery'],
      'Government Equipment': ['Industrial Machinery'],
      'Marine Electronics': ['Electronics'],
      'Aircraft Maintenance': ['Aerospace & Defense'],
      'Recreation Equipment': ['Industrial Machinery'],
      'Wood Products': ['Polymers & Composites'],
      'Ceramics': ['Metals & Fabrication'],
      'Software/Hardware': ['Electronics'],
      'Microelectronics': ['Electronics'],
    };

    // Shuffle factory locations to randomize distribution
    const shuffledLocations = [...FACTORY_LOCATIONS].sort(() => Math.random() - 0.5);
    let locationIndex = 0;

    // Define company size tiers for factory counts
    const majorCompanyNames = new Set([
      'Apple Inc.', 'Ford Motor Company', 'General Motors', 'Boeing', 'Intel Corporation',
      'Caterpillar Inc.', '3M Company', 'Honeywell International', 'Lockheed Martin',
      'Raytheon Technologies', 'Northrop Grumman', 'General Dynamics', 'Tesla Inc.',
      'General Electric', 'Deere & Company', 'Texas Instruments', 'NVIDIA', 'AMD',
      'Micron Technology', 'Applied Materials', 'Johnson & Johnson', 'Medtronic',
      'GlobalFoundries', 'L3Harris Technologies', 'BAE Systems', 'Huntington Ingalls Industries',
      'Spirit AeroSystems', 'Nucor Corporation', 'United States Steel', 'Cleveland-Cliffs',
      'Cummins Inc.', 'PACCAR Inc.', 'Oshkosh Corporation', 'Textron Inc.',
      'Whirlpool Corporation', 'Stanley Black & Decker', 'Rockwell Automation',
      'Parker Hannifin', 'Emerson Electric', 'Illinois Tool Works',
    ]);

    const midTierCompanyNames = new Set([
      'Qualcomm', 'Procter & Gamble', 'PepsiCo', 'Coca-Cola Company', 'Dow Inc.',
      'DuPont', 'Rivian', 'BorgWarner', 'Aptiv', 'Lear Corporation', 'Magna International',
      'Dana Incorporated', 'American Axle', 'Abbott Laboratories', 'Boston Scientific',
      'Stryker Corporation', 'Edwards Lifesciences', 'Intuitive Surgical', 'Dexcom',
      'Zimmer Biomet', 'Ball Corporation', 'Alcoa Corporation', 'Howmet Aerospace',
      'Lincoln Electric', 'Steel Dynamics', 'Freeport-McMoRan', 'Eastman Chemical',
      'PPG Industries', 'ON Semiconductor', 'Analog Devices', 'Skyworks Solutions',
      'Microchip Technology', 'Lam Research', 'KLA Corporation', 'Leidos',
      'General Atomics', 'BWX Technologies', 'Mercury Systems', 'Curtiss-Wright',
      'Snap-on Inc.', 'Baker Hughes', 'Schlumberger', 'Halliburton',
    ]);

    const factoryValues: Array<{
      companyId: string;
      name: string;
      specialization: string;
      description: string;
      latitude: string;
      longitude: string;
      state: string;
      stateId: string | undefined;
      workforceSize: number;
      openPositions: number;
    }> = [];

    // Assign factories to companies based on tier
    for (const [companyName, companyData] of companyMap.entries()) {
      let factoryCount: number;

      if (majorCompanyNames.has(companyName)) {
        factoryCount = Math.floor(Math.random() * 5) + 4; // 4-8 factories
      } else if (midTierCompanyNames.has(companyName)) {
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
          const locIndustries = specializationToIndustry[loc.specialization] || [];
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
          latitude: loc.lat.toString(),
          longitude: loc.lng.toString(),
          state: loc.state,
          stateId: stateMap.get(loc.state),
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
