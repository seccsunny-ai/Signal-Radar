require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const {
  ingestParsedData,
  getAllSymbols,
  querySignals,
  getMatrixData,
  getDashboardStats
} = require('./storage');
const { getConfluences } = require('./confluence');
const { parseTradingViewImage, getApiKey, setApiKey } = require('./aiParser');
const { SAMPLE_1_DATA, SAMPLE_2_DATA, SAMPLE_3_DATA } = require('./seedData');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static directories
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/samples', express.static(path.join(__dirname, '..', 'samples')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Multer storage for uploaded screenshots
const uploadDir = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create upload directory:', e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.png';
    cb(null, 'tv-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// Auto-seed with sample data on startup if database is empty
function autoSeedIfEmpty() {
  const symCount = db.prepare(`SELECT COUNT(*) as c FROM symbols`).get().c;
  if (symCount === 0) {
    console.log('Database empty: Seeding with provided sample image data (Sample 1 & Sample 2)...');
    ingestParsedData({
      ...SAMPLE_1_DATA,
      filePath: path.join(__dirname, '..', 'samples', 'sample_image_1_g_v_r.png')
    });
    ingestParsedData({
      ...SAMPLE_2_DATA,
      filePath: path.join(__dirname, '..', 'samples', 'sample_image_2_bos_choch.png')
    });
    console.log('Seeding complete. Initial symbols and signals loaded.');
  }
}

autoSeedIfEmpty();

// --- API Endpoints ---

// Dashboard stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = getDashboardStats();
    const confluences = getConfluences();
    const confirmedCount = confluences.filter(c => c.status === 'CONFIRMED').length;
    const pendingCount = confluences.filter(c => c.status === 'PENDING').length;

    res.json({
      success: true,
      data: {
        ...stats,
        confluencesTotal: confluences.length,
        confluencesConfirmed: confirmedCount,
        confluencesPending: pendingCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get symbols
app.get('/api/symbols', (req, res) => {
  try {
    const symbols = getAllSymbols();
    res.json({ success: true, data: symbols });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Query signals with filters
app.get('/api/signals', (req, res) => {
  try {
    const { symbol, indicatorType, indicatorGroup, timeframe, direction, recentOnly, limit, offset } = req.query;
    const signals = querySignals({
      symbol,
      indicatorType,
      indicatorGroup,
      timeframe,
      direction,
      recentOnly,
      limit: limit || 100,
      offset: offset || 0
    });
    res.json({ success: true, count: signals.length, data: signals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Confluence Radar (Gold Buy/Sell followed by BOS / CHoCH)
app.get('/api/confluences', (req, res) => {
  try {
    const { symbol, timeframe, status, direction } = req.query;
    const results = getConfluences({
      symbol,
      timeframe,
      status,
      direction
    });
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Matrix Table View (TradingView Grid)
app.get('/api/matrix', (req, res) => {
  try {
    const matrix = getMatrixData();
    res.json({ success: true, data: matrix });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Image Upload Endpoint with Vision OCR
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded' });
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype || 'image/png';
    const filename = req.file.filename;

    const clientKey = req.headers['x-gemini-api-key'] || req.body?.apiKey;
    const apiKey = getApiKey(clientKey);
    if (!apiKey) {
      return res.json({
        success: true,
        needsApiKey: true,
        message: 'Gemini API key is required to process screenshots with AI Vision. Please enter your API key in Settings.',
        file: {
          filename,
          originalName: req.file.originalname,
          url: `/uploads/${filename}`,
          path: filePath
        }
      });
    }

    // Process image with Gemini Vision
    try {
      const parsedData = await parseTradingViewImage(filePath, mimeType, apiKey);
      
function getFullDashboardData() {
  const stats = getDashboardStats();
  const confluences = getConfluences();
  const confirmedCount = confluences.filter(c => c.status === 'CONFIRMED').length;
  const pendingCount = confluences.filter(c => c.status === 'PENDING').length;
  const matrix = getMatrixData();
  const signals = querySignals({ limit: 100 });
  const uploads = db.prepare(`SELECT * FROM image_uploads ORDER BY uploaded_at DESC`).all();

  return {
    stats: {
      ...stats,
      confluencesTotal: confluences.length,
      confluencesConfirmed: confirmedCount,
      confluencesPending: pendingCount
    },
    confluences,
    matrix,
    signals,
    uploads
  };
}

      // Auto-commit or return for review based on query param
      const autoCommit = req.query.autoCommit !== 'false';
      if (autoCommit && parsedData.rows && parsedData.rows.length > 0) {
        const result = ingestParsedData({
          headerText: parsedData.headerText || '',
          referenceTime: parsedData.referenceTime || new Date().toISOString(),
          tableType: parsedData.tableType || 'AUTO',
          filename,
          filePath,
          rows: parsedData.rows
        });

        const fullData = getFullDashboardData();

        return res.json({
          success: true,
          committed: true,
          uploadId: result.uploadId,
          insertedSignalsCount: result.insertedSignalsCount,
          parsedData,
          file: {
            filename,
            url: `/uploads/${filename}`
          },
          fullData
        });
      }

      return res.json({
        success: true,
        committed: false,
        parsedData,
        file: {
          filename,
          url: `/uploads/${filename}`,
          path: filePath
        }
      });
    } catch (parseErr) {
      console.error('Vision Parsing error:', parseErr);
      return res.status(500).json({
        success: false,
        error: `Vision Parsing failed: ${parseErr.message}`,
        file: {
          filename,
          url: `/uploads/${filename}`,
          path: filePath
        }
      });
    }
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync endpoint for serverless persistence (syncs uploads from client storage)
app.post('/api/sync', (req, res) => {
  try {
    const { uploads } = req.body;
    let newlyIngestedCount = 0;

    if (Array.isArray(uploads) && uploads.length > 0) {
      const existingUploads = db.prepare(`SELECT header_text, reference_time, filename FROM image_uploads`).all();
      
      for (const up of uploads) {
        if (!up.rows || !Array.isArray(up.rows)) continue;

        // Check if already in this instance by filename or headerText
        const alreadyExists = existingUploads.some(
          e => (up.filename && e.filename === up.filename) ||
               (up.headerText && e.header_text && e.header_text === up.headerText)
        );

        if (!alreadyExists) {
          const result = ingestParsedData({
            headerText: up.headerText || '',
            referenceTime: up.referenceTime || new Date().toISOString(),
            tableType: up.tableType || 'AUTO',
            filename: up.filename || 'uploaded_image.png',
            filePath: up.filePath || '',
            rows: up.rows
          });
          newlyIngestedCount += result.insertedSignalsCount;
          existingUploads.push({
            header_text: up.headerText || '',
            reference_time: up.referenceTime || '',
            filename: up.filename || ''
          });
        }
      }
    }

    const fullData = getFullDashboardData();

    res.json({
      success: true,
      newlyIngestedCount,
      data: fullData
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual commit / confirmation of parsed data
app.post('/api/upload/commit', (req, res) => {
  try {
    const { headerText, referenceTime, tableType, filename, filePath, rows } = req.body;
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: 'Rows array is required' });
    }

    const result = ingestParsedData({
      headerText,
      referenceTime,
      tableType,
      filename,
      filePath,
      rows
    });

    res.json({
      success: true,
      uploadId: result.uploadId,
      insertedSignalsCount: result.insertedSignalsCount
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload history
app.get('/api/uploads', (req, res) => {
  try {
    const uploads = db.prepare(`SELECT * FROM image_uploads ORDER BY uploaded_at DESC`).all();
    res.json({ success: true, data: uploads });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Load sample images endpoint
app.post('/api/samples/load', (req, res) => {
  try {
    const { sampleId } = req.body; // 1, 2, or 'all'
    let count = 0;

    if (sampleId === 1 || sampleId === '1' || sampleId === 'all') {
      const res1 = ingestParsedData({
        ...SAMPLE_1_DATA,
        filePath: path.join(__dirname, '..', 'samples', 'sample_image_1_g_v_r.png')
      });
      count += res1.insertedSignalsCount;
    }

    if (sampleId === 2 || sampleId === '2' || sampleId === 'all') {
      const res2 = ingestParsedData({
        ...SAMPLE_2_DATA,
        filePath: path.join(__dirname, '..', 'samples', 'sample_image_2_bos_choch.png')
      });
      count += res2.insertedSignalsCount;
    }

    if (sampleId === 3 || sampleId === '3') {
      if (SAMPLE_3_DATA) {
        const res3 = ingestParsedData({
          ...SAMPLE_3_DATA,
          filePath: path.join(__dirname, '..', 'samples', 'sample_image_3_oct23.png')
        });
        count += res3.insertedSignalsCount;
      }
    }

    const fullData = getFullDashboardData();
    res.json({ success: true, insertedSignalsCount: count, fullData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Settings endpoints
app.get('/api/settings', (req, res) => {
  try {
    const key = getApiKey();
    res.json({
      success: true,
      hasApiKey: Boolean(key && key.trim().length > 0),
      maskedKey: key ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : ''
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { apiKey } = req.body;
    if (apiKey !== undefined) {
      setApiKey(apiKey.trim());
    }
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear / reset database
app.post('/api/reset', (req, res) => {
  try {
    db.exec(`
      DELETE FROM signals;
      DELETE FROM symbols;
      DELETE FROM image_uploads;
    `);
    res.json({ success: true, message: 'All data cleared successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Signal Filter Web App running at http://localhost:${PORT}`);
  });
}

module.exports = app;
