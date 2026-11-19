// Which sample skills each sample career lists, in order of importance (server/scripts/seed.ts).

// ============================================
// OCCUPATION-SKILL MAPPINGS (comprehensive mappings)
// ============================================

export const OCCUPATION_SKILL_MAPPINGS: Record<string, string[]> = {
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
