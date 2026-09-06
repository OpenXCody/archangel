const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

// Mock state counts
app.get('/api/map/state-counts', (req, res) => {
  res.json({
    "WA": 2500,
    "CA": 6000,
    "TX": 4000,
    "NY": 3000,
    "FL": 2000,
    "IL": 1800,
    "PA": 1500,
    "OH": 1400,
    "MI": 1200,
    "GA": 1000
  });
});

// Mock factories GeoJSON
app.get('/api/factories/geojson', (req, res) => {
  const features = [];
  
  // Add some mock factories for Washington state (around Seattle/Boeing area)
  const waFactories = [
    { name: "Boeing - Everett", lng: -122.2806, lat: 47.9277 },
    { name: "Boeing - Renton", lng: -122.2171, lat: 47.4842 },
    { name: "Microsoft Hardware", lng: -122.1272, lat: 47.6397 },
    { name: "Amazon Robotics", lng: -122.3321, lat: 47.6062 },
    { name: "Paccar", lng: -122.2843, lat: 47.6517 }
  ];
  
  waFactories.forEach((f, i) => {
    features.push({
      type: "Feature",
      id: `wa-factory-${i}`,
      properties: {
        id: `wa-factory-${i}`,
        name: f.name,
        company: f.name.split(' - ')[0] || f.name,
        city: "Seattle Area",
        state: "WA",
        industry: "Aerospace & Technology"
      },
      geometry: {
        type: "Point",
        coordinates: [f.lng, f.lat]
      }
    });
  });
  
  // Add more factories across the US for continental view testing
  const otherStates = [
    { name: "Tesla - Fremont", lng: -121.9467, lat: 37.4933, state: "CA" },
    { name: "SpaceX - Hawthorne", lng: -118.3275, lat: 33.9207, state: "CA" },
    { name: "Apple - Cupertino", lng: -122.0322, lat: 37.3230, state: "CA" },
    { name: "Intel - Santa Clara", lng: -121.9534, lat: 37.3861, state: "CA" },
    { name: "Ford - Dearborn", lng: -83.1763, lat: 42.3123, state: "MI" },
    { name: "GM - Detroit", lng: -83.0458, lat: 42.3314, state: "MI" },
    { name: "Lockheed Martin - Fort Worth", lng: -97.3308, lat: 32.7555, state: "TX" },
    { name: "Raytheon - Tucson", lng: -110.9747, lat: 32.2217, state: "AZ" }
  ];
  
  otherStates.forEach((f, i) => {
    features.push({
      type: "Feature",
      id: `factory-${i}`,
      properties: {
        id: `factory-${i}`,
        name: f.name,
        company: f.name.split(' - ')[0] || f.name,
        city: f.name.split(' - ')[1] || "Unknown",
        state: f.state,
        industry: "Manufacturing"
      },
      geometry: {
        type: "Point",
        coordinates: [f.lng, f.lat]
      }
    });
  });
  
  res.json({
    type: "FeatureCollection",
    features
  });
});

// Mock factory details
app.get('/api/factories/:id', (req, res) => {
  res.json({
    id: req.params.id,
    name: "Boeing - Everett",
    company: "Boeing",
    city: "Everett",
    state: "WA",
    latitude: 47.9277,
    longitude: -122.2806,
    industry: "Aerospace",
    employees: 30000,
    founded: 1967
  });
});

// Mock state details
app.get('/api/states/:code', (req, res) => {
  res.json({
    code: req.params.code,
    name: "Washington",
    factories: [
      {
        id: "wa-factory-0",
        name: "Boeing - Everett",
        company: "Boeing",
        city: "Everett",
        industry: "Aerospace"
      },
      {
        id: "wa-factory-1",
        name: "Boeing - Renton",
        company: "Boeing",
        city: "Renton",
        industry: "Aerospace"
      },
      {
        id: "wa-factory-2",
        name: "Microsoft Hardware",
        company: "Microsoft",
        city: "Redmond",
        industry: "Technology"
      }
    ],
    topCompanies: [
      { name: "Boeing", count: 2 },
      { name: "Microsoft", count: 1 },
      { name: "Amazon", count: 1 }
    ],
    totalFactories: 2500
  });
});

app.listen(PORT, () => {
  console.log(`Mock API server running on http://localhost:${PORT}`);
});
