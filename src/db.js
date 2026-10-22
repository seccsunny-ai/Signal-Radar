const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'signals.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS symbols (
      symbol TEXT PRIMARY KEY,
      category TEXT DEFAULT 'CRYPTO',
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS image_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      original_name TEXT,
      file_path TEXT,
      header_text TEXT,
      reference_time TEXT,
      table_type TEXT, -- 'OSCILLATOR_GOLD' or 'STRUCTURE_BOS_CHOCH' or 'UNKNOWN'
      signals_count INTEGER DEFAULT 0,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL, -- '15m', '1h', '4h', '1D'
      indicator_group TEXT NOT NULL, -- 'GOLD', 'VMC', 'RSI', 'STRUCTURE'
      indicator_type TEXT NOT NULL, -- 'G🔥', 'G❄', 'V↑', 'V↓', 'R↑', 'R↓', 'Int BOS↑', 'Int BOS↓', 'Sw BOS↑', 'Sw BOS↓', 'Int CHoCH↑', 'Int CHoCH↓', 'Sw CHoCH↑', 'Sw CHoCH↓'
      indicator_name TEXT NOT NULL, -- human readable e.g. 'Gold Buy', 'Bullish Internal Break of Structure'
      direction TEXT NOT NULL, -- 'BULLISH' or 'BEARISH'
      is_recent INTEGER DEFAULT 0, -- 1 if ⚡ present, 0 otherwise
      signal_date_str TEXT NOT NULL, -- original string e.g. '22 Oct 15:15'
      signal_timestamp DATETIME NOT NULL, -- calculated ISO timestamp e.g. '2026-10-22T15:15:00'
      raw_text TEXT,
      upload_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (symbol) REFERENCES symbols (symbol) ON DELETE CASCADE,
      FOREIGN KEY (upload_id) REFERENCES image_uploads (id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_signals_sym_tf ON signals(symbol, timeframe);
    CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(indicator_type);
    CREATE INDEX IF NOT EXISTS idx_signals_recent ON signals(is_recent);
    CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(signal_timestamp);
  `);
}

initSchema();

module.exports = db;
