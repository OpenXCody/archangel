// Sample companies for the local seed (server/scripts/seed.ts): the fictional ones, the real ones with
// their headquarters, and which of the real ones get more plants.

// ============================================
// COMPANIES DATA (20 fictional companies; the first industry listed is the company's)
// ============================================

export const COMPANIES_DATA = [
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

export const TOP_50_MANUFACTURING_COMPANIES = [
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

// Define company size tiers for factory counts
export const majorCompanyNames = new Set([
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

export const midTierCompanyNames = new Set([
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
