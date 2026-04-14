/**
 * Seed script for 50 largest US Manufacturing companies and their major factories
 * Data based on public information about major US manufacturers
 */

import { db, companies, factories } from '../server/db';
import { sql } from 'drizzle-orm';

interface CompanyData {
  name: string;
  industry: string;
  description: string;
  factories: FactoryData[];
}

interface FactoryData {
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  specialization: string;
  workforceSize: number;
}

// 50 Largest US Manufacturers with their major facilities
const majorManufacturers: CompanyData[] = [
  {
    name: "Apple Inc.",
    industry: "Electronics",
    description: "Consumer electronics, software, and online services",
    factories: [
      { name: "Apple Austin Campus", city: "Austin", state: "TX", lat: 30.3966, lng: -97.7383, specialization: "Mac Pro Assembly", workforceSize: 6000 },
      { name: "Apple Elk Grove Facility", city: "Elk Grove", state: "CA", lat: 38.4088, lng: -121.3716, specialization: "Refurbishment Center", workforceSize: 1500 },
      { name: "Apple Mesa Data Center", city: "Mesa", state: "AZ", lat: 33.4152, lng: -111.8315, specialization: "Data Center Operations", workforceSize: 800 },
      { name: "Apple Reno Distribution", city: "Reno", state: "NV", lat: 39.5296, lng: -119.8138, specialization: "Distribution Hub", workforceSize: 1200 },
      { name: "Apple Newark Campus", city: "Newark", state: "CA", lat: 37.5297, lng: -122.0402, specialization: "R&D and Testing", workforceSize: 2000 },
    ]
  },
  {
    name: "General Motors",
    industry: "Automotive",
    description: "Automobiles and automotive components",
    factories: [
      { name: "GM Detroit-Hamtramck Assembly", city: "Detroit", state: "MI", lat: 42.3977, lng: -83.0560, specialization: "Electric Vehicle Assembly", workforceSize: 2200 },
      { name: "GM Arlington Assembly", city: "Arlington", state: "TX", lat: 32.7357, lng: -97.1081, specialization: "Full-Size SUV Assembly", workforceSize: 4800 },
      { name: "GM Fort Wayne Assembly", city: "Fort Wayne", state: "IN", lat: 41.0534, lng: -85.1103, specialization: "Truck Assembly", workforceSize: 3800 },
      { name: "GM Spring Hill Manufacturing", city: "Spring Hill", state: "TN", lat: 35.7512, lng: -86.9302, specialization: "SUV and Crossover Assembly", workforceSize: 3600 },
      { name: "GM Wentzville Assembly", city: "Wentzville", state: "MO", lat: 38.8111, lng: -90.8529, specialization: "Mid-Size Vehicle Assembly", workforceSize: 3200 },
    ]
  },
  {
    name: "Ford Motor Company",
    industry: "Automotive",
    description: "Automobiles, trucks, and mobility solutions",
    factories: [
      { name: "Ford Rouge Complex", city: "Dearborn", state: "MI", lat: 42.2989, lng: -83.1497, specialization: "F-150 Assembly", workforceSize: 6000 },
      { name: "Ford Kentucky Truck Plant", city: "Louisville", state: "KY", lat: 38.2973, lng: -85.6572, specialization: "Super Duty Truck Assembly", workforceSize: 8800 },
      { name: "Ford Chicago Assembly", city: "Chicago", state: "IL", lat: 41.6565, lng: -87.5545, specialization: "Explorer and Aviator Assembly", workforceSize: 4600 },
      { name: "Ford Kansas City Assembly", city: "Claycomo", state: "MO", lat: 39.2014, lng: -94.4914, specialization: "F-150 and Transit Assembly", workforceSize: 7100 },
      { name: "Ford Ohio Assembly", city: "Avon Lake", state: "OH", lat: 41.5034, lng: -82.0282, specialization: "Commercial Vehicle Assembly", workforceSize: 1800 },
    ]
  },
  {
    name: "Boeing",
    industry: "Aerospace",
    description: "Commercial aircraft, defense systems, and space technology",
    factories: [
      { name: "Boeing Everett Factory", city: "Everett", state: "WA", lat: 47.9234, lng: -122.2706, specialization: "Widebody Aircraft Assembly", workforceSize: 30000 },
      { name: "Boeing Renton Factory", city: "Renton", state: "WA", lat: 47.4951, lng: -122.1972, specialization: "737 Assembly", workforceSize: 12000 },
      { name: "Boeing North Charleston", city: "North Charleston", state: "SC", lat: 32.8998, lng: -80.0379, specialization: "787 Dreamliner Assembly", workforceSize: 7000 },
      { name: "Boeing St. Louis", city: "St. Louis", state: "MO", lat: 38.7503, lng: -90.3740, specialization: "Defense Aircraft Assembly", workforceSize: 15000 },
      { name: "Boeing Mesa", city: "Mesa", state: "AZ", lat: 33.3065, lng: -111.6679, specialization: "Apache Helicopter Assembly", workforceSize: 5500 },
    ]
  },
  {
    name: "Lockheed Martin",
    industry: "Defense",
    description: "Aerospace, defense, security, and advanced technologies",
    factories: [
      { name: "Lockheed Martin Fort Worth", city: "Fort Worth", state: "TX", lat: 32.7687, lng: -97.4368, specialization: "F-35 Fighter Assembly", workforceSize: 18000 },
      { name: "Lockheed Martin Marietta", city: "Marietta", state: "GA", lat: 33.9137, lng: -84.5371, specialization: "C-130 and F-22 Assembly", workforceSize: 8500 },
      { name: "Lockheed Martin Palmdale", city: "Palmdale", state: "CA", lat: 34.6151, lng: -118.0849, specialization: "Advanced Development Programs", workforceSize: 4000 },
      { name: "Lockheed Martin Sunnyvale", city: "Sunnyvale", state: "CA", lat: 37.3861, lng: -122.0108, specialization: "Space Systems", workforceSize: 6500 },
      { name: "Lockheed Martin Orlando", city: "Orlando", state: "FL", lat: 28.4594, lng: -81.3100, specialization: "Missiles and Fire Control", workforceSize: 8000 },
    ]
  },
  {
    name: "General Electric",
    industry: "Industrial Equipment",
    description: "Power generation, aviation engines, and healthcare equipment",
    factories: [
      { name: "GE Aviation Evendale", city: "Evendale", state: "OH", lat: 39.2506, lng: -84.4199, specialization: "Jet Engine Assembly", workforceSize: 7800 },
      { name: "GE Appliances Louisville", city: "Louisville", state: "KY", lat: 38.1781, lng: -85.7133, specialization: "Home Appliance Manufacturing", workforceSize: 6000 },
      { name: "GE Power Greenville", city: "Greenville", state: "SC", lat: 34.8411, lng: -82.3540, specialization: "Gas Turbine Manufacturing", workforceSize: 3800 },
      { name: "GE Healthcare Waukesha", city: "Waukesha", state: "WI", lat: 43.0117, lng: -88.2313, specialization: "Medical Imaging Equipment", workforceSize: 2500 },
      { name: "GE Aviation Durham", city: "Durham", state: "NC", lat: 35.9382, lng: -78.9253, specialization: "Turbofan Engine Assembly", workforceSize: 3200 },
    ]
  },
  {
    name: "Caterpillar Inc.",
    industry: "Heavy Machinery",
    description: "Construction and mining equipment, engines, and turbines",
    factories: [
      { name: "Caterpillar East Peoria", city: "East Peoria", state: "IL", lat: 40.6656, lng: -89.5801, specialization: "Track-Type Tractor Assembly", workforceSize: 4500 },
      { name: "Caterpillar Decatur", city: "Decatur", state: "IL", lat: 39.8653, lng: -88.9548, specialization: "Large Mining Equipment", workforceSize: 3200 },
      { name: "Caterpillar Aurora", city: "Aurora", state: "IL", lat: 41.7606, lng: -88.3201, specialization: "Hydraulic Excavator Assembly", workforceSize: 2800 },
      { name: "Caterpillar Clayton", city: "Clayton", state: "NC", lat: 35.6507, lng: -78.4564, specialization: "Backhoe Loader Manufacturing", workforceSize: 1800 },
      { name: "Caterpillar Victoria", city: "Victoria", state: "TX", lat: 28.8053, lng: -96.9852, specialization: "Engine Manufacturing", workforceSize: 2200 },
    ]
  },
  {
    name: "Johnson & Johnson",
    industry: "Pharmaceuticals",
    description: "Pharmaceuticals, medical devices, and consumer health products",
    factories: [
      { name: "J&J Janssen Pharmaceuticals", city: "Titusville", state: "NJ", lat: 40.2929, lng: -74.8735, specialization: "Pharmaceutical Manufacturing", workforceSize: 3500 },
      { name: "J&J Ethicon", city: "Cincinnati", state: "OH", lat: 39.2270, lng: -84.3264, specialization: "Surgical Device Manufacturing", workforceSize: 2800 },
      { name: "J&J DePuy Synthes", city: "Warsaw", state: "IN", lat: 41.2381, lng: -85.8530, specialization: "Orthopedic Implants", workforceSize: 4200 },
      { name: "J&J Vision Care", city: "Jacksonville", state: "FL", lat: 30.2241, lng: -81.5352, specialization: "Contact Lens Manufacturing", workforceSize: 2100 },
      { name: "J&J Consumer Health", city: "Fort Washington", state: "PA", lat: 40.1326, lng: -75.2096, specialization: "Consumer Products", workforceSize: 1600 },
    ]
  },
  {
    name: "Pfizer Inc.",
    industry: "Pharmaceuticals",
    description: "Biopharmaceuticals and vaccines",
    factories: [
      { name: "Pfizer Kalamazoo", city: "Kalamazoo", state: "MI", lat: 42.2749, lng: -85.5467, specialization: "Sterile Injectable Manufacturing", workforceSize: 3000 },
      { name: "Pfizer McPherson", city: "McPherson", state: "KS", lat: 38.3709, lng: -97.6642, specialization: "Solid Dose Manufacturing", workforceSize: 1800 },
      { name: "Pfizer Rocky Mount", city: "Rocky Mount", state: "NC", lat: 35.9382, lng: -77.7906, specialization: "Injectable Manufacturing", workforceSize: 2200 },
      { name: "Pfizer Andover", city: "Andover", state: "MA", lat: 42.6583, lng: -71.1368, specialization: "Biotech Manufacturing", workforceSize: 2500 },
      { name: "Pfizer Pearl River", city: "Pearl River", state: "NY", lat: 41.0587, lng: -74.0215, specialization: "Vaccine Research and Production", workforceSize: 1500 },
    ]
  },
  {
    name: "Procter & Gamble",
    industry: "Consumer Goods",
    description: "Consumer packaged goods including personal care and household products",
    factories: [
      { name: "P&G Lima Plant", city: "Lima", state: "OH", lat: 40.7426, lng: -84.1052, specialization: "Liquid Laundry Detergent", workforceSize: 1500 },
      { name: "P&G Mehoopany", city: "Mehoopany", state: "PA", lat: 41.5537, lng: -76.0674, specialization: "Paper Products Manufacturing", workforceSize: 2300 },
      { name: "P&G Iowa City", city: "Iowa City", state: "IA", lat: 41.6611, lng: -91.5302, specialization: "Oral Care Products", workforceSize: 1200 },
      { name: "P&G Alexandria", city: "Alexandria", state: "LA", lat: 31.3113, lng: -92.4451, specialization: "Fabric Care Manufacturing", workforceSize: 900 },
      { name: "P&G Jackson", city: "Jackson", state: "TN", lat: 35.6145, lng: -88.8139, specialization: "Home Care Products", workforceSize: 700 },
    ]
  },
  {
    name: "Intel Corporation",
    industry: "Semiconductors",
    description: "Semiconductor chips and computing technology",
    factories: [
      { name: "Intel Chandler Campus", city: "Chandler", state: "AZ", lat: 33.2756, lng: -111.8103, specialization: "Advanced Chip Fabrication", workforceSize: 12000 },
      { name: "Intel Rio Rancho", city: "Rio Rancho", state: "NM", lat: 35.2872, lng: -106.6883, specialization: "Semiconductor Manufacturing", workforceSize: 5000 },
      { name: "Intel Hillsboro Campus", city: "Hillsboro", state: "OR", lat: 45.5272, lng: -122.9361, specialization: "Process Development", workforceSize: 20000 },
      { name: "Intel Folsom", city: "Folsom", state: "CA", lat: 38.6668, lng: -121.1422, specialization: "Chip Design Center", workforceSize: 6000 },
      { name: "Intel Hudson", city: "Hudson", state: "MA", lat: 42.3918, lng: -71.5662, specialization: "Server Chip Development", workforceSize: 3500 },
    ]
  },
  {
    name: "Tesla Inc.",
    industry: "Automotive",
    description: "Electric vehicles and clean energy products",
    factories: [
      { name: "Tesla Fremont Factory", city: "Fremont", state: "CA", lat: 37.4926, lng: -121.9447, specialization: "Model S/X/3/Y Assembly", workforceSize: 22000 },
      { name: "Tesla Gigafactory Texas", city: "Austin", state: "TX", lat: 30.2237, lng: -97.6166, specialization: "Cybertruck and Model Y Assembly", workforceSize: 15000 },
      { name: "Tesla Gigafactory Nevada", city: "Sparks", state: "NV", lat: 39.5383, lng: -119.4433, specialization: "Battery Cell Manufacturing", workforceSize: 11000 },
      { name: "Tesla Gigafactory New York", city: "Buffalo", state: "NY", lat: 42.8864, lng: -78.8784, specialization: "Solar Panel Manufacturing", workforceSize: 1500 },
      { name: "Tesla Lathrop Service Center", city: "Lathrop", state: "CA", lat: 37.8133, lng: -121.2724, specialization: "Parts Distribution", workforceSize: 800 },
    ]
  },
  {
    name: "3M Company",
    industry: "Diversified Manufacturing",
    description: "Industrial, safety, healthcare, and consumer products",
    factories: [
      { name: "3M Maplewood Campus", city: "Maplewood", state: "MN", lat: 44.9531, lng: -92.9936, specialization: "R&D and Specialty Products", workforceSize: 12000 },
      { name: "3M Hutchinson", city: "Hutchinson", state: "MN", lat: 44.8874, lng: -94.3697, specialization: "Adhesive Products", workforceSize: 1800 },
      { name: "3M Cordova", city: "Cordova", state: "IL", lat: 41.6897, lng: -90.3190, specialization: "Tape and Abrasive Products", workforceSize: 1200 },
      { name: "3M Brownwood", city: "Brownwood", state: "TX", lat: 31.7093, lng: -98.9912, specialization: "Medical Products", workforceSize: 800 },
      { name: "3M Valley", city: "Valley", state: "NE", lat: 41.3128, lng: -96.3467, specialization: "Filtration Products", workforceSize: 600 },
    ]
  },
  {
    name: "Honeywell International",
    industry: "Aerospace & Technology",
    description: "Aerospace products, building technologies, and performance materials",
    factories: [
      { name: "Honeywell Phoenix Engines", city: "Phoenix", state: "AZ", lat: 33.4373, lng: -112.0078, specialization: "Aircraft Engine Manufacturing", workforceSize: 5500 },
      { name: "Honeywell Kansas City", city: "Kansas City", state: "MO", lat: 39.0422, lng: -94.5945, specialization: "Defense Electronics", workforceSize: 3800 },
      { name: "Honeywell Freeport", city: "Freeport", state: "IL", lat: 42.2967, lng: -89.6212, specialization: "Turbocharger Manufacturing", workforceSize: 2200 },
      { name: "Honeywell Olathe", city: "Olathe", state: "KS", lat: 38.8814, lng: -94.8191, specialization: "Avionics Systems", workforceSize: 2800 },
      { name: "Honeywell Minneapolis", city: "Golden Valley", state: "MN", lat: 45.0097, lng: -93.3499, specialization: "Building Automation", workforceSize: 3200 },
    ]
  },
  {
    name: "Raytheon Technologies",
    industry: "Defense & Aerospace",
    description: "Defense systems, aerospace products, and intelligence services",
    factories: [
      { name: "Raytheon Tucson", city: "Tucson", state: "AZ", lat: 32.1545, lng: -110.8782, specialization: "Missile Systems", workforceSize: 13000 },
      { name: "Raytheon Andover", city: "Andover", state: "MA", lat: 42.6483, lng: -71.1268, specialization: "Radar Systems", workforceSize: 4500 },
      { name: "Raytheon McKinney", city: "McKinney", state: "TX", lat: 33.1972, lng: -96.6397, specialization: "Space and Airborne Systems", workforceSize: 3200 },
      { name: "Pratt & Whitney East Hartford", city: "East Hartford", state: "CT", lat: 41.7828, lng: -72.6193, specialization: "Aircraft Engine Assembly", workforceSize: 8000 },
      { name: "Collins Aerospace Cedar Rapids", city: "Cedar Rapids", state: "IA", lat: 42.0083, lng: -91.6680, specialization: "Avionics Manufacturing", workforceSize: 10000 },
    ]
  },
  {
    name: "Dow Inc.",
    industry: "Chemicals",
    description: "Materials science company producing plastics, chemicals, and agricultural products",
    factories: [
      { name: "Dow Freeport Operations", city: "Freeport", state: "TX", lat: 28.9541, lng: -95.3597, specialization: "Petrochemical Production", workforceSize: 4500 },
      { name: "Dow Midland Operations", city: "Midland", state: "MI", lat: 43.6156, lng: -84.2472, specialization: "Chemical Manufacturing HQ", workforceSize: 5000 },
      { name: "Dow Plaquemine", city: "Plaquemine", state: "LA", lat: 30.2891, lng: -91.2343, specialization: "Polyethylene Production", workforceSize: 2200 },
      { name: "Dow St. Charles Operations", city: "Hahnville", state: "LA", lat: 29.9768, lng: -90.4057, specialization: "Ethylene Production", workforceSize: 1800 },
      { name: "Dow Seadrift Operations", city: "Seadrift", state: "TX", lat: 28.4147, lng: -96.7136, specialization: "Polyethylene Manufacturing", workforceSize: 1200 },
    ]
  },
  {
    name: "Micron Technology",
    industry: "Semiconductors",
    description: "Memory and storage solutions manufacturer",
    factories: [
      { name: "Micron Boise Campus", city: "Boise", state: "ID", lat: 43.5898, lng: -116.2146, specialization: "DRAM Development", workforceSize: 6000 },
      { name: "Micron Manassas", city: "Manassas", state: "VA", lat: 38.7509, lng: -77.4753, specialization: "Flash Memory Manufacturing", workforceSize: 2800 },
      { name: "Micron Lehi", city: "Lehi", state: "UT", lat: 40.3916, lng: -111.8507, specialization: "3D NAND Production", workforceSize: 3500 },
      { name: "Micron Allen", city: "Allen", state: "TX", lat: 33.1032, lng: -96.6706, specialization: "Memory Testing", workforceSize: 1200 },
      { name: "Micron Syracuse", city: "Syracuse", state: "NY", lat: 43.0481, lng: -76.1474, specialization: "New Fab Construction", workforceSize: 2000 },
    ]
  },
  {
    name: "Northrop Grumman",
    industry: "Defense",
    description: "Aerospace and defense technology company",
    factories: [
      { name: "Northrop Grumman Palmdale", city: "Palmdale", state: "CA", lat: 34.5794, lng: -118.1165, specialization: "B-21 Raider Assembly", workforceSize: 8000 },
      { name: "Northrop Grumman Lake Charles", city: "Lake Charles", state: "LA", lat: 30.2266, lng: -93.2174, specialization: "Aircraft Structures", workforceSize: 1800 },
      { name: "Northrop Grumman Melbourne", city: "Melbourne", state: "FL", lat: 28.0836, lng: -80.6081, specialization: "Space Systems", workforceSize: 4500 },
      { name: "Northrop Grumman Clearfield", city: "Clearfield", state: "UT", lat: 41.1108, lng: -112.0261, specialization: "Solid Rocket Motors", workforceSize: 3200 },
      { name: "Northrop Grumman Baltimore", city: "Linthicum", state: "MD", lat: 39.2048, lng: -76.6519, specialization: "Cyber and ISR Systems", workforceSize: 10000 },
    ]
  },
  {
    name: "General Dynamics",
    industry: "Defense",
    description: "Aerospace, combat systems, marine systems, and information technology",
    factories: [
      { name: "General Dynamics Bath Iron Works", city: "Bath", state: "ME", lat: 43.9109, lng: -69.8206, specialization: "Navy Destroyer Construction", workforceSize: 6700 },
      { name: "General Dynamics Electric Boat", city: "Groton", state: "CT", lat: 41.3500, lng: -72.0700, specialization: "Submarine Construction", workforceSize: 18000 },
      { name: "General Dynamics Land Systems", city: "Sterling Heights", state: "MI", lat: 42.5803, lng: -83.0302, specialization: "Combat Vehicle Manufacturing", workforceSize: 4500 },
      { name: "General Dynamics Ordnance", city: "St. Petersburg", state: "FL", lat: 27.7676, lng: -82.6403, specialization: "Ammunition Manufacturing", workforceSize: 2800 },
      { name: "Gulfstream Savannah", city: "Savannah", state: "GA", lat: 32.1280, lng: -81.2021, specialization: "Business Jet Assembly", workforceSize: 10000 },
    ]
  },
  {
    name: "Deere & Company",
    industry: "Agricultural Equipment",
    description: "Agricultural, construction, and forestry machinery",
    factories: [
      { name: "John Deere Waterloo Works", city: "Waterloo", state: "IA", lat: 42.4928, lng: -92.3426, specialization: "Tractor Assembly", workforceSize: 6000 },
      { name: "John Deere Harvester Works", city: "East Moline", state: "IL", lat: 41.5003, lng: -90.3987, specialization: "Combine Harvester Assembly", workforceSize: 3200 },
      { name: "John Deere Davenport Works", city: "Davenport", state: "IA", lat: 41.5236, lng: -90.5776, specialization: "Construction Equipment", workforceSize: 2400 },
      { name: "John Deere Des Moines Works", city: "Ankeny", state: "IA", lat: 41.7318, lng: -93.6001, specialization: "Sprayer Manufacturing", workforceSize: 1800 },
      { name: "John Deere Dubuque Works", city: "Dubuque", state: "IA", lat: 42.5006, lng: -90.6648, specialization: "Construction Crawler Assembly", workforceSize: 2100 },
    ]
  },
  {
    name: "Abbott Laboratories",
    industry: "Medical Devices",
    description: "Medical devices, diagnostics, nutrition, and pharmaceutical products",
    factories: [
      { name: "Abbott Sturgis", city: "Sturgis", state: "MI", lat: 41.7992, lng: -85.4192, specialization: "Infant Formula Manufacturing", workforceSize: 800 },
      { name: "Abbott Temecula", city: "Temecula", state: "CA", lat: 33.4936, lng: -117.1484, specialization: "Diagnostic Systems", workforceSize: 1500 },
      { name: "Abbott Plymouth", city: "Plymouth", state: "MN", lat: 45.0105, lng: -93.4555, specialization: "Vascular Devices", workforceSize: 2200 },
      { name: "Abbott St. Paul", city: "St. Paul", state: "MN", lat: 44.9537, lng: -93.0900, specialization: "Cardiac Devices", workforceSize: 1800 },
      { name: "Abbott Casa Grande", city: "Casa Grande", state: "AZ", lat: 32.8795, lng: -111.7574, specialization: "Nutrition Products", workforceSize: 1200 },
    ]
  },
  {
    name: "Medtronic",
    industry: "Medical Devices",
    description: "Medical device company focused on cardiovascular and surgical technologies",
    factories: [
      { name: "Medtronic Fridley", city: "Fridley", state: "MN", lat: 45.0852, lng: -93.2636, specialization: "Cardiac Rhythm Products", workforceSize: 8000 },
      { name: "Medtronic Tempe", city: "Tempe", state: "AZ", lat: 33.4255, lng: -111.9400, specialization: "Spinal Products", workforceSize: 3500 },
      { name: "Medtronic Jacksonville", city: "Jacksonville", state: "FL", lat: 30.3322, lng: -81.6557, specialization: "Diabetes Products", workforceSize: 2200 },
      { name: "Medtronic Louisville", city: "Louisville", state: "CO", lat: 39.9778, lng: -105.1319, specialization: "Surgical Innovations", workforceSize: 1500 },
      { name: "Medtronic Santa Rosa", city: "Santa Rosa", state: "CA", lat: 38.4404, lng: -122.7141, specialization: "Coronary Products", workforceSize: 1200 },
    ]
  },
  {
    name: "Stellantis North America",
    industry: "Automotive",
    description: "Automobiles under Jeep, Ram, Dodge, and Chrysler brands",
    factories: [
      { name: "Stellantis Sterling Heights", city: "Sterling Heights", state: "MI", lat: 42.5803, lng: -83.0302, specialization: "Ram 1500 Assembly", workforceSize: 7200 },
      { name: "Stellantis Toledo Assembly", city: "Toledo", state: "OH", lat: 41.6528, lng: -83.5379, specialization: "Jeep Wrangler Assembly", workforceSize: 6000 },
      { name: "Stellantis Detroit Assembly", city: "Detroit", state: "MI", lat: 42.3314, lng: -83.0458, specialization: "Jeep Grand Cherokee Assembly", workforceSize: 5000 },
      { name: "Stellantis Belvidere", city: "Belvidere", state: "IL", lat: 42.2639, lng: -88.8442, specialization: "Compact Car Assembly", workforceSize: 1200 },
      { name: "Stellantis Warren Truck", city: "Warren", state: "MI", lat: 42.4775, lng: -83.0277, specialization: "Ram Heavy Duty Assembly", workforceSize: 3800 },
    ]
  },
  {
    name: "Tyson Foods",
    industry: "Food Processing",
    description: "Meat and prepared foods production",
    factories: [
      { name: "Tyson Springdale HQ", city: "Springdale", state: "AR", lat: 36.1867, lng: -94.1288, specialization: "Poultry Processing HQ", workforceSize: 5500 },
      { name: "Tyson Dakota City", city: "Dakota City", state: "NE", lat: 42.4153, lng: -96.4183, specialization: "Beef Processing", workforceSize: 4200 },
      { name: "Tyson Amarillo", city: "Amarillo", state: "TX", lat: 35.2220, lng: -101.8313, specialization: "Beef Processing", workforceSize: 3800 },
      { name: "Tyson Perry", city: "Perry", state: "IA", lat: 41.8386, lng: -94.1072, specialization: "Pork Processing", workforceSize: 2400 },
      { name: "Tyson Emporia", city: "Emporia", state: "KS", lat: 38.4039, lng: -96.1817, specialization: "Beef Processing", workforceSize: 2800 },
    ]
  },
  {
    name: "Cargill",
    industry: "Food Processing",
    description: "Food processing, agricultural commodities, and animal nutrition",
    factories: [
      { name: "Cargill Wayzata HQ", city: "Wayzata", state: "MN", lat: 44.9744, lng: -93.5066, specialization: "Corporate and R&D", workforceSize: 3000 },
      { name: "Cargill Dodge City", city: "Dodge City", state: "KS", lat: 37.7528, lng: -100.0171, specialization: "Beef Processing", workforceSize: 3500 },
      { name: "Cargill Fort Morgan", city: "Fort Morgan", state: "CO", lat: 40.2503, lng: -103.8000, specialization: "Beef Processing", workforceSize: 2800 },
      { name: "Cargill Eddyville", city: "Eddyville", state: "IA", lat: 41.1564, lng: -92.6346, specialization: "Corn Processing", workforceSize: 600 },
      { name: "Cargill Blair", city: "Blair", state: "NE", lat: 41.5447, lng: -96.1250, specialization: "Corn Processing", workforceSize: 500 },
    ]
  },
  {
    name: "PepsiCo",
    industry: "Food & Beverage",
    description: "Beverages and snack foods manufacturer",
    factories: [
      { name: "Frito-Lay Plano", city: "Plano", state: "TX", lat: 33.0198, lng: -96.6989, specialization: "Snack Food HQ", workforceSize: 3500 },
      { name: "Frito-Lay Frankfort", city: "Frankfort", state: "IN", lat: 40.2795, lng: -86.5108, specialization: "Snack Production", workforceSize: 1500 },
      { name: "Pepsi Beverages Munster", city: "Munster", state: "IN", lat: 41.5645, lng: -87.5125, specialization: "Beverage Bottling", workforceSize: 800 },
      { name: "Quaker Oats Cedar Rapids", city: "Cedar Rapids", state: "IA", lat: 41.9779, lng: -91.6656, specialization: "Cereal Manufacturing", workforceSize: 700 },
      { name: "Frito-Lay Killingly", city: "Killingly", state: "CT", lat: 41.8387, lng: -71.8773, specialization: "Snack Production", workforceSize: 900 },
    ]
  },
  {
    name: "Coca-Cola Company",
    industry: "Food & Beverage",
    description: "Nonalcoholic beverages manufacturer",
    factories: [
      { name: "Coca-Cola Atlanta HQ", city: "Atlanta", state: "GA", lat: 33.7676, lng: -84.3880, specialization: "Syrup Production", workforceSize: 4500 },
      { name: "Coca-Cola Houston", city: "Houston", state: "TX", lat: 29.7604, lng: -95.3698, specialization: "Bottling Operations", workforceSize: 1200 },
      { name: "Coca-Cola Indianapolis", city: "Indianapolis", state: "IN", lat: 39.7684, lng: -86.1581, specialization: "Bottling Operations", workforceSize: 900 },
      { name: "Coca-Cola Auburndale", city: "Auburndale", state: "FL", lat: 28.0650, lng: -81.7887, specialization: "Juice Production", workforceSize: 700 },
      { name: "Coca-Cola Denver", city: "Denver", state: "CO", lat: 39.7392, lng: -104.9903, specialization: "Bottling Operations", workforceSize: 650 },
    ]
  },
  {
    name: "Archer-Daniels-Midland",
    industry: "Food Processing",
    description: "Agricultural processing and food ingredients",
    factories: [
      { name: "ADM Decatur", city: "Decatur", state: "IL", lat: 39.8403, lng: -88.9548, specialization: "Corn and Soy Processing HQ", workforceSize: 4000 },
      { name: "ADM Clinton", city: "Clinton", state: "IA", lat: 41.8445, lng: -90.1887, specialization: "Corn Processing", workforceSize: 600 },
      { name: "ADM Cedar Rapids", city: "Cedar Rapids", state: "IA", lat: 41.9779, lng: -91.6656, specialization: "Corn Processing", workforceSize: 550 },
      { name: "ADM Lincoln", city: "Lincoln", state: "NE", lat: 40.8258, lng: -96.6852, specialization: "Soy Processing", workforceSize: 450 },
      { name: "ADM Mankato", city: "Mankato", state: "MN", lat: 44.1636, lng: -94.0027, specialization: "Soy Processing", workforceSize: 400 },
    ]
  },
  {
    name: "Exxon Mobil",
    industry: "Petrochemicals",
    description: "Petroleum refining and petrochemical manufacturing",
    factories: [
      { name: "ExxonMobil Baytown Complex", city: "Baytown", state: "TX", lat: 29.7355, lng: -95.0393, specialization: "Petrochemical Production", workforceSize: 7500 },
      { name: "ExxonMobil Beaumont Refinery", city: "Beaumont", state: "TX", lat: 29.9509, lng: -94.0215, specialization: "Oil Refining", workforceSize: 2200 },
      { name: "ExxonMobil Baton Rouge", city: "Baton Rouge", state: "LA", lat: 30.4515, lng: -91.1871, specialization: "Refining and Chemicals", workforceSize: 5500 },
      { name: "ExxonMobil Torrance", city: "Torrance", state: "CA", lat: 33.8358, lng: -118.3406, specialization: "Oil Refining", workforceSize: 900 },
      { name: "ExxonMobil Joliet Refinery", city: "Joliet", state: "IL", lat: 41.5250, lng: -88.0817, specialization: "Oil Refining", workforceSize: 750 },
    ]
  },
  {
    name: "Chevron Corporation",
    industry: "Petrochemicals",
    description: "Petroleum and chemical production",
    factories: [
      { name: "Chevron Richmond Refinery", city: "Richmond", state: "CA", lat: 37.9358, lng: -122.3477, specialization: "Oil Refining", workforceSize: 3000 },
      { name: "Chevron El Segundo Refinery", city: "El Segundo", state: "CA", lat: 33.9192, lng: -118.4165, specialization: "Oil Refining", workforceSize: 1400 },
      { name: "Chevron Pascagoula Refinery", city: "Pascagoula", state: "MS", lat: 30.3658, lng: -88.5561, specialization: "Oil Refining", workforceSize: 1800 },
      { name: "Chevron Salt Lake City Refinery", city: "Salt Lake City", state: "UT", lat: 40.7608, lng: -111.8910, specialization: "Oil Refining", workforceSize: 500 },
      { name: "Chevron Phillips Cedar Bayou", city: "Baytown", state: "TX", lat: 29.7533, lng: -94.9719, specialization: "Petrochemical Production", workforceSize: 1200 },
    ]
  },
  {
    name: "LyondellBasell",
    industry: "Chemicals",
    description: "Plastics, chemicals, and refining company",
    factories: [
      { name: "LyondellBasell Houston Refinery", city: "Houston", state: "TX", lat: 29.7347, lng: -95.2405, specialization: "Oil Refining", workforceSize: 1000 },
      { name: "LyondellBasell Channelview", city: "Channelview", state: "TX", lat: 29.7755, lng: -95.1150, specialization: "Olefins Production", workforceSize: 1800 },
      { name: "LyondellBasell La Porte", city: "La Porte", state: "TX", lat: 29.6658, lng: -95.0194, specialization: "Polyethylene Production", workforceSize: 1200 },
      { name: "LyondellBasell Morris", city: "Morris", state: "IL", lat: 41.3573, lng: -88.4212, specialization: "Polypropylene Production", workforceSize: 600 },
      { name: "LyondellBasell Clinton", city: "Clinton", state: "IA", lat: 41.8445, lng: -90.1887, specialization: "Polypropylene Production", workforceSize: 450 },
    ]
  },
  {
    name: "International Paper",
    industry: "Paper & Packaging",
    description: "Paper and packaging products manufacturer",
    factories: [
      { name: "International Paper Eastover", city: "Eastover", state: "SC", lat: 33.8679, lng: -80.6916, specialization: "Containerboard Production", workforceSize: 1100 },
      { name: "International Paper Valliant", city: "Valliant", state: "OK", lat: 34.0001, lng: -95.0922, specialization: "Containerboard Production", workforceSize: 750 },
      { name: "International Paper Prattville", city: "Prattville", state: "AL", lat: 32.4640, lng: -86.4597, specialization: "Pulp and Paper", workforceSize: 950 },
      { name: "International Paper Riverdale", city: "Riverdale", state: "AL", lat: 32.5804, lng: -87.7486, specialization: "Containerboard Production", workforceSize: 800 },
      { name: "International Paper Rome", city: "Rome", state: "GA", lat: 34.2570, lng: -85.1647, specialization: "Corrugated Packaging", workforceSize: 650 },
    ]
  },
  {
    name: "Nucor Corporation",
    industry: "Steel",
    description: "Steel and steel products manufacturer",
    factories: [
      { name: "Nucor Berkeley", city: "Huger", state: "SC", lat: 33.0468, lng: -79.8289, specialization: "Flat-Rolled Steel", workforceSize: 1200 },
      { name: "Nucor Hickman", city: "Armorel", state: "AR", lat: 35.9351, lng: -89.7709, specialization: "Flat-Rolled Steel", workforceSize: 900 },
      { name: "Nucor Crawfordsville", city: "Crawfordsville", state: "IN", lat: 40.0412, lng: -86.8745, specialization: "Steel Sheet", workforceSize: 600 },
      { name: "Nucor Decatur", city: "Decatur", state: "AL", lat: 34.6059, lng: -86.9833, specialization: "Steel Sheet", workforceSize: 650 },
      { name: "Nucor Gallatin", city: "Ghent", state: "KY", lat: 38.7381, lng: -85.0604, specialization: "Flat-Rolled Steel", workforceSize: 550 },
    ]
  },
  {
    name: "United States Steel",
    industry: "Steel",
    description: "Integrated steel producer",
    factories: [
      { name: "U.S. Steel Gary Works", city: "Gary", state: "IN", lat: 41.6086, lng: -87.3125, specialization: "Flat-Rolled Steel", workforceSize: 3800 },
      { name: "U.S. Steel Mon Valley Works", city: "West Mifflin", state: "PA", lat: 40.3545, lng: -79.8670, specialization: "Flat-Rolled Steel", workforceSize: 2800 },
      { name: "U.S. Steel Granite City Works", city: "Granite City", state: "IL", lat: 38.7015, lng: -90.1487, specialization: "Flat-Rolled Steel", workforceSize: 1200 },
      { name: "U.S. Steel Fairfield", city: "Fairfield", state: "AL", lat: 33.4859, lng: -86.9119, specialization: "Tubular Products", workforceSize: 1500 },
      { name: "Big River Steel", city: "Osceola", state: "AR", lat: 35.7051, lng: -89.9695, specialization: "Electric Arc Furnace Steel", workforceSize: 900 },
    ]
  },
  {
    name: "Alcoa Corporation",
    industry: "Aluminum",
    description: "Aluminum production and manufacturing",
    factories: [
      { name: "Alcoa Davenport", city: "Riverdale", state: "IA", lat: 41.4683, lng: -90.4771, specialization: "Aluminum Rolling", workforceSize: 2200 },
      { name: "Alcoa Warrick", city: "Newburgh", state: "IN", lat: 37.9453, lng: -87.4078, specialization: "Aluminum Smelting", workforceSize: 2000 },
      { name: "Alcoa Massena", city: "Massena", state: "NY", lat: 44.9276, lng: -74.8918, specialization: "Aluminum Smelting", workforceSize: 750 },
      { name: "Alcoa Lafayette", city: "Lafayette", state: "IN", lat: 40.4167, lng: -86.8753, specialization: "Aluminum Forging", workforceSize: 1100 },
      { name: "Alcoa Rockdale", city: "Rockdale", state: "TX", lat: 30.6555, lng: -97.0017, specialization: "Aluminum Smelting", workforceSize: 600 },
    ]
  },
  {
    name: "Corning Incorporated",
    industry: "Glass & Ceramics",
    description: "Specialty glass and ceramics manufacturer",
    factories: [
      { name: "Corning Canton", city: "Canton", state: "NY", lat: 44.5956, lng: -75.1690, specialization: "Specialty Glass", workforceSize: 800 },
      { name: "Corning Harrodsburg", city: "Harrodsburg", state: "KY", lat: 37.7623, lng: -84.8433, specialization: "Gorilla Glass", workforceSize: 1200 },
      { name: "Corning Erwin", city: "Erwin", state: "NY", lat: 42.1131, lng: -77.1311, specialization: "Optical Fiber", workforceSize: 700 },
      { name: "Corning Concord", city: "Concord", state: "NC", lat: 35.4088, lng: -80.5795, specialization: "Fiber Optic Cable", workforceSize: 900 },
      { name: "Corning Wilmington", city: "Wilmington", state: "NC", lat: 34.2257, lng: -77.9447, specialization: "Optical Components", workforceSize: 500 },
    ]
  },
  {
    name: "Parker Hannifin",
    industry: "Industrial Equipment",
    description: "Motion and control technologies manufacturer",
    factories: [
      { name: "Parker Cleveland HQ", city: "Cleveland", state: "OH", lat: 41.4993, lng: -81.6944, specialization: "Hydraulic Systems", workforceSize: 3500 },
      { name: "Parker Elyria", city: "Elyria", state: "OH", lat: 41.3684, lng: -82.1076, specialization: "Fluid Connectors", workforceSize: 1800 },
      { name: "Parker Irvine", city: "Irvine", state: "CA", lat: 33.6846, lng: -117.8265, specialization: "Aerospace Components", workforceSize: 2200 },
      { name: "Parker Fort Worth", city: "Fort Worth", state: "TX", lat: 32.7555, lng: -97.3308, specialization: "Aircraft Components", workforceSize: 1400 },
      { name: "Parker Ravenna", city: "Ravenna", state: "OH", lat: 41.1578, lng: -81.2420, specialization: "Seal Manufacturing", workforceSize: 700 },
    ]
  },
  {
    name: "Cummins Inc.",
    industry: "Engines",
    description: "Diesel and alternative fuel engines and generators",
    factories: [
      { name: "Cummins Columbus", city: "Columbus", state: "IN", lat: 39.2014, lng: -85.9214, specialization: "Engine Manufacturing HQ", workforceSize: 5500 },
      { name: "Cummins Jamestown", city: "Jamestown", state: "NY", lat: 42.0970, lng: -79.2353, specialization: "Engine Assembly", workforceSize: 2800 },
      { name: "Cummins Rocky Mount", city: "Rocky Mount", state: "NC", lat: 35.9382, lng: -77.7906, specialization: "Engine Parts", workforceSize: 1800 },
      { name: "Cummins Seymour", city: "Seymour", state: "IN", lat: 38.9592, lng: -85.8903, specialization: "Engine Components", workforceSize: 1200 },
      { name: "Cummins Fridley", city: "Fridley", state: "MN", lat: 45.0852, lng: -93.2636, specialization: "Power Generation", workforceSize: 900 },
    ]
  },
  {
    name: "Illinois Tool Works",
    industry: "Diversified Manufacturing",
    description: "Diversified manufacturer of specialty products",
    factories: [
      { name: "ITW Glenview HQ", city: "Glenview", state: "IL", lat: 42.0698, lng: -87.7878, specialization: "Corporate HQ", workforceSize: 2500 },
      { name: "ITW Elgin", city: "Elgin", state: "IL", lat: 42.0354, lng: -88.2826, specialization: "Automotive Components", workforceSize: 800 },
      { name: "ITW Eden Prairie", city: "Eden Prairie", state: "MN", lat: 44.8547, lng: -93.4708, specialization: "Food Equipment", workforceSize: 1100 },
      { name: "ITW Appleton", city: "Appleton", state: "WI", lat: 44.2619, lng: -88.4154, specialization: "Welding Equipment", workforceSize: 650 },
      { name: "ITW Troy", city: "Troy", state: "OH", lat: 40.0395, lng: -84.2033, specialization: "Specialty Products", workforceSize: 550 },
    ]
  },
  {
    name: "Emerson Electric",
    industry: "Industrial Technology",
    description: "Technology and engineering company for industrial automation",
    factories: [
      { name: "Emerson St. Louis HQ", city: "Ferguson", state: "MO", lat: 38.7442, lng: -90.3051, specialization: "Corporate HQ", workforceSize: 4000 },
      { name: "Emerson Marshalltown", city: "Marshalltown", state: "IA", lat: 42.0494, lng: -92.9080, specialization: "Control Valves", workforceSize: 2200 },
      { name: "Emerson Shakopee", city: "Shakopee", state: "MN", lat: 44.7974, lng: -93.5272, specialization: "Process Control", workforceSize: 1500 },
      { name: "Emerson Sidney", city: "Sidney", state: "OH", lat: 40.2842, lng: -84.1555, specialization: "HVAC Compressors", workforceSize: 2000 },
      { name: "Emerson Eden Prairie", city: "Eden Prairie", state: "MN", lat: 44.8547, lng: -93.4708, specialization: "Flow Measurement", workforceSize: 900 },
    ]
  },
  {
    name: "Whirlpool Corporation",
    industry: "Home Appliances",
    description: "Home appliances manufacturer",
    factories: [
      { name: "Whirlpool Benton Harbor", city: "Benton Harbor", state: "MI", lat: 42.1167, lng: -86.4542, specialization: "Appliance HQ", workforceSize: 3500 },
      { name: "Whirlpool Clyde", city: "Clyde", state: "OH", lat: 41.3031, lng: -82.9752, specialization: "Washing Machines", workforceSize: 3200 },
      { name: "Whirlpool Findlay", city: "Findlay", state: "OH", lat: 41.0442, lng: -83.6499, specialization: "Dishwashers", workforceSize: 1800 },
      { name: "Whirlpool Tulsa", city: "Tulsa", state: "OK", lat: 36.1540, lng: -95.9928, specialization: "Ranges", workforceSize: 1200 },
      { name: "Whirlpool Amana", city: "Amana", state: "IA", lat: 41.8008, lng: -91.8660, specialization: "Refrigerators", workforceSize: 800 },
    ]
  },
  {
    name: "Stanley Black & Decker",
    industry: "Tools & Hardware",
    description: "Tools, industrial, and security solutions",
    factories: [
      { name: "Stanley Black & Decker New Britain", city: "New Britain", state: "CT", lat: 41.6612, lng: -72.7795, specialization: "Hand Tools HQ", workforceSize: 2500 },
      { name: "Stanley Black & Decker Jackson", city: "Jackson", state: "TN", lat: 35.6145, lng: -88.8139, specialization: "Power Tools", workforceSize: 1100 },
      { name: "Stanley Black & Decker Fort Mill", city: "Fort Mill", state: "SC", lat: 35.0074, lng: -80.9451, specialization: "Industrial Tools", workforceSize: 800 },
      { name: "Stanley Black & Decker Cheraw", city: "Cheraw", state: "SC", lat: 34.6977, lng: -79.8834, specialization: "Metal Products", workforceSize: 600 },
      { name: "Stanley Black & Decker Charlotte", city: "Charlotte", state: "NC", lat: 35.2271, lng: -80.8431, specialization: "Fastening Systems", workforceSize: 700 },
    ]
  },
  {
    name: "Textron Inc.",
    industry: "Aerospace & Defense",
    description: "Aerospace, defense, and industrial products",
    factories: [
      { name: "Bell Helicopter Fort Worth", city: "Fort Worth", state: "TX", lat: 32.8187, lng: -97.1594, specialization: "Helicopter Manufacturing", workforceSize: 8000 },
      { name: "Textron Aviation Wichita", city: "Wichita", state: "KS", lat: 37.6872, lng: -97.3301, specialization: "Cessna and Beechcraft Assembly", workforceSize: 10000 },
      { name: "Bell Helicopter Amarillo", city: "Amarillo", state: "TX", lat: 35.2220, lng: -101.8313, specialization: "V-22 Osprey Assembly", workforceSize: 2500 },
      { name: "Textron Systems Hunt Valley", city: "Hunt Valley", state: "MD", lat: 39.4959, lng: -76.6413, specialization: "Unmanned Systems", workforceSize: 1800 },
      { name: "E-Z-GO Augusta", city: "Augusta", state: "GA", lat: 33.4735, lng: -82.0105, specialization: "Golf Carts", workforceSize: 1200 },
    ]
  },
  {
    name: "L3Harris Technologies",
    industry: "Defense Electronics",
    description: "Defense and commercial electronics",
    factories: [
      { name: "L3Harris Melbourne", city: "Melbourne", state: "FL", lat: 28.0836, lng: -80.6081, specialization: "Space and Airborne Systems", workforceSize: 8000 },
      { name: "L3Harris Rochester", city: "Rochester", state: "NY", lat: 43.1566, lng: -77.6088, specialization: "Communication Systems", workforceSize: 6500 },
      { name: "L3Harris Salt Lake City", city: "Salt Lake City", state: "UT", lat: 40.7608, lng: -111.8910, specialization: "Electronic Warfare", workforceSize: 2200 },
      { name: "L3Harris Greenville", city: "Greenville", state: "TX", lat: 33.1385, lng: -96.1108, specialization: "ISR Systems", workforceSize: 1800 },
      { name: "L3Harris Waco", city: "Waco", state: "TX", lat: 31.5493, lng: -97.1467, specialization: "Aircraft Modification", workforceSize: 1400 },
    ]
  },
  {
    name: "Oshkosh Corporation",
    industry: "Specialty Vehicles",
    description: "Specialty vehicles and truck bodies manufacturer",
    factories: [
      { name: "Oshkosh Defense", city: "Oshkosh", state: "WI", lat: 44.0247, lng: -88.5426, specialization: "Military Vehicles HQ", workforceSize: 4500 },
      { name: "Pierce Manufacturing", city: "Appleton", state: "WI", lat: 44.2619, lng: -88.4154, specialization: "Fire Trucks", workforceSize: 2800 },
      { name: "JLG Industries", city: "McConnellsburg", state: "PA", lat: 39.9326, lng: -77.9964, specialization: "Aerial Work Platforms", workforceSize: 2200 },
      { name: "Oshkosh Airport Products", city: "Neenah", state: "WI", lat: 44.1858, lng: -88.4626, specialization: "Airport Vehicles", workforceSize: 900 },
      { name: "McNeilus Companies", city: "Dodge Center", state: "MN", lat: 44.0280, lng: -92.8546, specialization: "Refuse Trucks", workforceSize: 1100 },
    ]
  },
  {
    name: "Carrier Global",
    industry: "HVAC",
    description: "Heating, ventilation, air conditioning, and refrigeration",
    factories: [
      { name: "Carrier Indianapolis", city: "Indianapolis", state: "IN", lat: 39.7953, lng: -86.2453, specialization: "Residential HVAC", workforceSize: 2200 },
      { name: "Carrier Charlotte", city: "Charlotte", state: "NC", lat: 35.2271, lng: -80.8431, specialization: "Commercial HVAC", workforceSize: 1500 },
      { name: "Carrier Tyler", city: "Tyler", state: "TX", lat: 32.3513, lng: -95.3011, specialization: "Commercial Refrigeration", workforceSize: 1100 },
      { name: "Carrier Collierville", city: "Collierville", state: "TN", lat: 35.0420, lng: -89.6645, specialization: "Residential AC", workforceSize: 1800 },
      { name: "Carrier McMinnville", city: "McMinnville", state: "TN", lat: 35.6834, lng: -85.7697, specialization: "HVAC Components", workforceSize: 900 },
    ]
  },
  {
    name: "Ball Corporation",
    industry: "Packaging",
    description: "Aluminum packaging and aerospace technologies",
    factories: [
      { name: "Ball Golden", city: "Westminster", state: "CO", lat: 39.8636, lng: -105.0318, specialization: "Beverage Can HQ", workforceSize: 2500 },
      { name: "Ball Findlay", city: "Findlay", state: "OH", lat: 41.0442, lng: -83.6499, specialization: "Beverage Cans", workforceSize: 800 },
      { name: "Ball Rome", city: "Rome", state: "GA", lat: 34.2570, lng: -85.1647, specialization: "Beverage Cans", workforceSize: 600 },
      { name: "Ball Fort Worth", city: "Fort Worth", state: "TX", lat: 32.7555, lng: -97.3308, specialization: "Beverage Cans", workforceSize: 550 },
      { name: "Ball Aerospace Boulder", city: "Boulder", state: "CO", lat: 40.0150, lng: -105.2705, specialization: "Aerospace Systems", workforceSize: 3500 },
    ]
  },
];

async function seedMajorManufacturers() {
  console.log('Starting seed of 50 major US manufacturers...\n');

  // First, clear existing data to avoid duplicates
  console.log('Clearing existing data...');
  await db.delete(factories);
  await db.delete(companies);
  console.log('Existing data cleared.\n');

  let totalCompanies = 0;
  let totalFactories = 0;

  for (const companyData of majorManufacturers) {
    console.log(`Creating: ${companyData.name}`);

    // Insert company
    const [newCompany] = await db.insert(companies).values({
      name: companyData.name,
      industry: companyData.industry,
      description: companyData.description,
    }).returning();

    totalCompanies++;

    // Insert factories for this company
    for (const factoryData of companyData.factories) {
      await db.insert(factories).values({
        name: factoryData.name,
        companyId: newCompany.id,
        specialization: factoryData.specialization,
        description: `${factoryData.specialization} facility in ${factoryData.city}, ${factoryData.state}`,
        latitude: factoryData.lat.toString(),
        longitude: factoryData.lng.toString(),
        state: factoryData.state,
        workforceSize: factoryData.workforceSize,
        openPositions: Math.floor(Math.random() * 50) + 5, // Random 5-55 open positions
      });
      totalFactories++;
    }

    console.log(`  ✓ Added ${companyData.factories.length} factories`);
  }

  console.log('\n========================================');
  console.log(`Seed completed!`);
  console.log(`Total companies: ${totalCompanies}`);
  console.log(`Total factories: ${totalFactories}`);
  console.log('========================================\n');
}

// Run the seed
seedMajorManufacturers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
