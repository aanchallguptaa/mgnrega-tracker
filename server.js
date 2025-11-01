// server.js - MGNREGA Backend API with MongoDB
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// FIX: Serve static files from the current directory
app.use(express.static(__dirname)); 

// MongoDB Connection
// FIX: Ensure the fallback URI explicitly includes the desired database name.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mgnrega_db';

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});

// MongoDB Schemas (Schemas remain the same)
const districtSchema = new mongoose.Schema({
  stateCode: { type: String, required: true, index: true },
  stateName: { type: String, required: true },
  districtName: { type: String, required: true, index: true },
  districtCode: String,
  createdAt: { type: Date, default: Date.now }
});
districtSchema.index({ stateCode: 1, districtName: 1 }, { unique: true });

const performanceSchema = new mongoose.Schema({
  stateCode: { type: String, required: true, index: true },
  districtName: { type: String, required: true, index: true },
  dataMonth: { type: Date, required: true, index: true },
  
  // Job card and worker statistics
  jobCardsIssued: { type: Number, default: 0 },
  householdsWorked: { type: Number, default: 0 },
  activeWorkers: { type: Number, default: 0 },
  womenWorkers: { type: Number, default: 0 },
  scWorkers: { type: Number, default: 0 },
  stWorkers: { type: Number, default: 0 },
  
  // Employment statistics
  avgDaysProvided: { type: Number, default: 0 },
  totalPersondays: { type: Number, default: 0 },
  
  // Financial data
  avgWage: { type: Number, default: 0 },
  totalExpenditure: { type: Number, default: 0 },
  
  // Works data
  completedWorks: { type: Number, default: 0 },
  ongoingWorks: { type: Number, default: 0 },
  
  // Metadata
  updatedAt: { type: Date, default: Date.now },
  dataSource: { type: String, default: 'data.gov.in (Simulated)' }
});

// 1. ORIGINAL INDEX: Ensures uniqueness (state, district, month are unique)
performanceSchema.index({ stateCode: 1, districtName: 1, dataMonth: 1 }, { unique: true });

// 2. NEW OPTIMIZED INDEX FOR SPEED: Supports the findOne and sort operations perfectly.
performanceSchema.index({ 
    stateCode: 1, 
    districtName: 1, 
    dataMonth: -1 
});

const apiLogSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, index: true },
  ipAddress: String,
  userAgent: String,
  requestParams: mongoose.Schema.Types.Mixed,
  responseStatus: Number,
  responseTimeMs: Number,
  errorMessage: String,
  createdAt: { type: Date, default: Date.now, index: true }
});
const syncLogSchema = new mongoose.Schema({
  syncType: { type: String, required: true },
  status: { type: String, enum: ['started', 'success', 'failed'], required: true, index: true },
  recordsProcessed: { type: Number, default: 0 },
  errorMessage: String,
  startedAt: { type: Date, default: Date.now, index: true },
  completedAt: Date
});

// Models
const District = mongoose.model('District', districtSchema);
const Performance = mongoose.model('Performance', performanceSchema);
const ApiLog = mongoose.model('ApiLog', apiLogSchema);
const SyncLog = mongoose.model('SyncLog', syncLogSchema);

// API Endpoints (Endpoints remain the same)
app.get('/api/district-data', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { state, district } = req.query;

    if (!state || !district) {
      return res.status(400).json({ 
        error: 'State and district parameters are required' 
      });
    }

    // --- 1. Get current month data (latest) ---
    const currentData = await Performance.findOne({
      stateCode: state,
      districtName: district
    }).sort({ dataMonth: -1 });

    if (!currentData) {
      return res.status(404).json({ 
        error: 'No data found for this district',
        message: 'Database initialization might be incomplete or district name is incorrect.'
      });
    }

    // --- Only current data exists, so comparisons will default to current data ---
    const latestDataMonth = currentData.dataMonth;

    // Last Month (Will likely be null, defaulting comparison value to currentData in final metrics)
    const lastMonth = new Date(latestDataMonth);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const lastMonthData = await Performance.findOne({
      stateCode: state,
      districtName: district,
      dataMonth: lastMonth
    });

    // Last Year (Will likely be null, defaulting comparison value to currentData in final metrics)
    const lastYear = new Date(latestDataMonth);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    
    const lastYearData = await Performance.findOne({
      stateCode: state,
      districtName: district,
      dataMonth: lastYear
    });

    // State average
    const stateAvgData = await Performance.aggregate([
      {
        $match: {
          stateCode: state,
          dataMonth: latestDataMonth
        }
      },
      {
        $group: {
          _id: null,
          avgHouseholds: { $avg: '$householdsWorked' },
          avgAvgDays: { $avg: '$avgDaysProvided' },
          avgAvgWage: { $avg: '$avgWage' }
        }
      }
    ]);

    // Historical data (returns only the single current month record)
    const historical = [currentData];


    // Calculate final metrics (Handling null comparisons by using currentData)
    const lastMonthHouseholds = lastMonthData ? lastMonthData.householdsWorked : currentData.householdsWorked;
    const lastYearHouseholds = lastYearData ? lastYearData.householdsWorked : currentData.householdsWorked;
    const stateAvgHouseholds = stateAvgData.length > 0 ? stateAvgData[0].avgHouseholds : currentData.householdsWorked;
    const stateAvgDays = stateAvgData.length > 0 ? stateAvgData[0].avgAvgDays : currentData.avgDaysProvided;
    const stateAvgWage = stateAvgData.length > 0 ? stateAvgData[0].avgAvgWage : currentData.avgWage;

    // The logic below ensures that if no previous data exists, the change is 0 (or calculated against itself)
    const lastMonthChange = lastMonthData ? ((currentData.householdsWorked - lastMonthHouseholds) / lastMonthHouseholds * 100) : 0;
    const lastYearChange = lastYearData ? ((currentData.householdsWorked - lastYearHouseholds) / lastYearHouseholds * 100) : 0;
    const stateComparisonHouseholds = currentData.householdsWorked - stateAvgHouseholds;


    // Format response
    const response = {
      district: district,
      state: currentData.stateName,
      lastUpdated: formatDate(currentData.updatedAt),
      current: {
        householdsWorked: currentData.householdsWorked,
        activeWorkers: currentData.activeWorkers,
        womenWorkers: currentData.womenWorkers,
        // FIX: Ensure float values are explicitly rounded to 2 decimal places for consistency
        avgDays: parseFloat(currentData.avgDaysProvided.toFixed(1)),
        avgWage: parseFloat(currentData.avgWage.toFixed(2)),
      },
      comparison: {
        lastMonth: {
          previousValue: lastMonthHouseholds,
          // FIX: Ensure change is rounded to 2 decimal places
          change: parseFloat(lastMonthChange.toFixed(2))
        },
        lastYear: {
          previousValue: lastYearHouseholds,
          // FIX: Ensure change is rounded to 2 decimal places
          change: parseFloat(lastYearChange.toFixed(2))
        },
        stateAvg: {
          value: Math.round(stateAvgHouseholds),
          avgDays: parseFloat(stateAvgDays.toFixed(1)),
          avgWage: parseFloat(stateAvgWage.toFixed(2)),
          position: stateComparisonHouseholds > 0 ? 'above' : 'below'
        }
      },
      // Only returning the current data point for the historical chart
      historical: historical.map(row => ({
        month: formatMonth(row.dataMonth),
        value: row.householdsWorked 
      }))
    };

    // Log API call
    await ApiLog.create({
      endpoint: '/api/district-data',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      requestParams: req.query,
      responseStatus: 200,
      responseTimeMs: Date.now() - startTime
    });

    res.json(response);

  } catch (error) {
    console.error('Error fetching district data:', error);
    
    await ApiLog.create({
      endpoint: '/api/district-data',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      requestParams: req.query,
      responseStatus: 500,
      responseTimeMs: Date.now() - startTime,
      errorMessage: error.message
    });
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});
app.get('/api/states', async (req, res) => {
    try {
        const states = await District.aggregate([
            {
                $group: {
                    _id: { code: '$stateCode', name: '$stateName' }
                }
            },
            {
                $project: {
                    _id: 0,
                    stateCode: '$_id.code',
                    stateName: '$_id.name'
                }
            },
            {
                $sort: { stateName: 1 }
            }
        ]);
        
        // We only seeded MH, so we return the seeded data.
        if (states.length === 0) {
            // Fallback in case seeding fails completely
            return res.json([{ stateCode: 'MH', stateName: 'महाराष्ट्र (Maharashtra)' }]);
        }
        res.json(states);
    } catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/districts', async (req, res) => {
    try {
        const { state } = req.query;
        
        if (!state) {
            return res.status(400).json({ error: 'State parameter is required' });
        }

        const districts = await District.find({ stateCode: state })
            .select('districtName -_id')
            .sort({ districtName: 1 });

        res.json(districts.map(d => d.districtName));
    } catch (error) {
        console.error('Error fetching districts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Location Detection API with Robust Name Extraction ---
app.get('/api/detect-location', async (req, res) => {
    const startTime = Date.now();
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ 
                error: 'Latitude and longitude parameters are required' 
            });
        }
        
        // Using OpenStreetMap Nominatim for reverse geocoding
        const response = await axios.get(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            {
                headers: {
                    'User-Agent': 'MGNREGA-Tracker-Project/1.0 (Contact: your-email@example.com)'
                },
                timeout: 5000 
            }
        );

        const address = response.data.address;
        
        // FIX: Robustly extract the most likely district/city name
        // Prioritize: state_district (common in India) -> county -> city -> village
        let detectedDistrictName = address.state_district || address.county || address.city || address.village;
        let detectedStateName = address.state; // We only support MH, but grab the name anyway

        if (!detectedDistrictName) {
             // If we still can't find a name, return failure gracefully
            return res.json({
                detected: false,
                detectedDistrictName: 'External Geocoding Failure', // Better message
                message: 'External geocoding failed to identify the region name.'
            });
        }
        
        // --- NEW FUZZY MATCHING LOGIC ---
        
        // NORMALIZE THE DETECTED NAME (e.g., "Chhatrapati Sambhajinagar" -> "chhatrapatisambhajinagar")
        const normalizedDetectedName = detectedDistrictName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ''); // Remove all non-alphanumeric chars
        
        // Find ALL districts in Maharashtra to iterate and manually match
        const allDistricts = await District.find({ stateCode: 'MH' });
        
        let matchingDistrict = null;

        for (const district of allDistricts) {
            // NORMALIZE THE DB NAME (e.g., "छत्रपति संभाजीनगर (Chh. Sambhajinagar)" -> "chhsambhajinagar")
            const normalizedDBName = district.districtName
                .toLowerCase()
                // Keep only English letters, numbers, and remove parentheses/symbols
                .match(/\(([^)]+)\)/)?.[1] // Grab the content inside parentheses (English short form)
                ?.replace(/[^a-z0-9]/g, ''); // Remove spaces/dots/etc.
            
            // Fallback: If no parentheses, just use the entire string and strip symbols
            const fallbackDBName = district.districtName
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '');

            // Try matching the full normalized detected name against the English part of the DB name.
            if (normalizedDBName && normalizedDetectedName.includes(normalizedDBName)) {
                matchingDistrict = district;
                break;
            }
            
            // Try matching the normalized detected name against the full normalized DB name.
            // This catches cases like "Pune" matching "pune"
            if (normalizedDetectedName === fallbackDBName) {
                 matchingDistrict = district;
                break;
            }
        }
        
        // --- END NEW FUZZY MATCHING LOGIC ---

        if (matchingDistrict) {
            res.json({
                state: matchingDistrict.stateCode,
                district: matchingDistrict.districtName,
                detected: true
            });
            return;
        }
        
        // If we found a name but couldn't match it:
        res.json({
            detected: false,
            detectedDistrictName: detectedDistrictName, // Return the full name found
            message: `Location detected but could not map '${detectedDistrictName}' to a known district.`
        });

    } catch (error) {
        console.error('Error detecting location:', error.message);
        
        await ApiLog.create({
            endpoint: '/api/detect-location',
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            requestParams: req.query,
            responseStatus: 500,
            responseTimeMs: Date.now() - startTime,
            errorMessage: error.message
        });
        
        // Return 200 with an error message in the payload for frontend handling
        res.status(200).json({ 
            detected: false, 
            message: 'Location service temporarily unavailable. Please select manually.' 
        });
    }
});
app.get('/api/health', async (req, res) => {
    try {
        await mongoose.connection.db.admin().ping();
        res.json({ 
            status: 'healthy', 
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'unhealthy', 
            database: 'disconnected',
            error: error.message 
        });
    }
});
async function syncMGNREGAData() { /* ... unchanged ... */ }
cron.schedule('0 2 * * *', () => { /* ... unchanged ... */ });
function formatDate(date) { /* ... unchanged ... */ }
function formatMonth(date) { /* ... unchanged ... */ }


// --- Database Initialization and Seeding ---
async function initializeDatabase() {
  try {
    // Check if any district data exists for MH. We can skip if data is already present.
    const count = await District.countDocuments({stateCode: 'MH'});
    
    if (count === 0) {
      console.log('📥 Initializing database with seed data for Maharashtra...');
      
      const maharashtraDistricts = [
        'अहमदनगर (Ahmednagar)', 'अकोला (Akola)', 'अमरावती (Amravati)',
        'छत्रपति संभाजीनगर (Chh. Sambhajinagar)', 
        'भंडारा (Bhandara)', 'बुलढाणा (Buldhana)',
        'चंद्रपूर (Chandrapur)', 'धुले (Dhule)', 'गड़चिरोली (Gadchiroli)',
        'गोंदिया (Gondia)', 'हिंगोली (Hingoli)', 'जलगांव (Jalgaon)',
        'जालना (Jalna)', 'कोल्हापुर (Kolhapur)', 'लातूर (Latur)',
        'मुंबई उपनगर (Mumbai Sub)', 'नागपुर (Nagpur)', 'नांदेड़ (Nanded)',
        'नंदुरबार (Nandurbar)', 'नासिक (Nashik)', 'धाराशिव (Dharashiv)',
        'परभणी (Parbhani)', 'पुणे (Pune)', 'रायगड़ (Raigad)',
        'रत्नागिरी (Ratnagiri)', 'सांगली (Sangli)', 'सतारा (Satara)',
        'सिंधुदुर्ग (Sindhudurg)', 'सोलापुर (Solapur)', 'ठाणे (Thane)',
        'वर्धा (Wardha)', 'वाशिम (Washim)', 'यवतमाल (Yavatmal)',
        'पालघर (Palghar)'
      ];
      
      const uniqueDistricts = [...new Set(maharashtraDistricts)];
      
      const districts = uniqueDistricts.map(name => ({
        stateCode: 'MH',
        stateName: 'महाराष्ट्र (Maharashtra)',
        districtName: name
      }));
      
      await District.insertMany(districts, { ordered: false });
      console.log(`✅ Seeded ${uniqueDistricts.length} districts for MH.`);
      
      // FIX: Generate ONLY the current month's data for all districts
      console.log('📊 Generating current month performance data for ALL districts...');
      
      const generationPromises = districts.map(district => 
        generateCurrentMonthData(district.stateCode, district.districtName)
      );
      
      await Promise.all(generationPromises);
      console.log('✅ All current month data generation completed.');

    } else {
        // If District collection exists, check if ANY data exists for the current month
        const currentMonthDataCount = await Performance.countDocuments({
            stateCode: 'MH',
            dataMonth: getCurrentMonthDate()
        });

        // Only generate if current month data is missing for some reason
        if (currentMonthDataCount < count) {
            console.log('⚠️ District data exists, but current month data is incomplete. Triggering regeneration...');
            
            const districts = await District.find({stateCode: 'MH'});
            const generationPromises = districts.map(district => 
                generateCurrentMonthData(district.stateCode, district.districtName)
            );
            
            await Promise.all(generationPromises);
            console.log('✅ Current month data regeneration completed.');
        } else {
            console.log('✅ Database already contains district and current month performance information. Skipping initial seed.');
        }
    }
  } catch (error) {
    if (error.code === 11000) {
        console.warn('⚠️ District seed data already partially exists. Skipping insert.');
    } else {
        console.error('Error initializing database:', error);
    }
  }
}

// Helper to get the current month's date (1st day, 00:00:00)
function getCurrentMonthDate() {
    const today = new Date();
    // Use the previous month for data, as current month data is usually incomplete
    const targetDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    targetDate.setHours(0, 0, 0, 0);
    return targetDate;
}

// Function to generate ONLY the current/latest month's data
async function generateCurrentMonthData(stateCode, districtName) {
  
  const monthDate = getCurrentMonthDate();
  
  const existing = await Performance.findOne({
    stateCode: stateCode,
    districtName: districtName,
    dataMonth: monthDate
  });
  
  // Only insert if the record for this month doesn't exist
  if (!existing) {
    // Generate static data (no trend needed since it's only one month)
    const baseHouseholds = Math.floor((60000 + Math.random() * 30000));
    const activeWorkers = Math.floor(baseHouseholds * (0.7 + Math.random() * 0.2));
    const womenWorkers = Math.floor(activeWorkers * (0.55 + Math.random() * 0.15));
    
    await Performance.create({
      stateCode: stateCode,
      stateName: 'महाराष्ट्र (Maharashtra)',
      districtName: districtName,
      dataMonth: monthDate,
      householdsWorked: baseHouseholds,
      activeWorkers: activeWorkers,
      womenWorkers: womenWorkers,
      scWorkers: Math.floor(activeWorkers * 0.2),
      stWorkers: Math.floor(activeWorkers * 0.15),
      // Ensures the DB value is truncated/rounded the same way the API output is expected to be
      avgDaysProvided: parseFloat((35 + Math.random() * 20).toFixed(1)), 
      avgWage: parseFloat((285 + Math.random() * 50).toFixed(2)),
      completedWorks: Math.floor(800 + Math.random() * 600),
      ongoingWorks: Math.floor(300 + Math.random() * 400),
      totalExpenditure: parseFloat((baseHouseholds * 300 * (35 + Math.random() * 20)).toFixed(2))
    });
  }
}

// Start server
async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`🚀 MGNREGA Backend API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌍 Frontend: http://localhost:${PORT}`);
  });
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  mongoose.connection.close();
  process.exit(0);
});

startServer();
