const fs = require('fs');
const path = require('path');

// Determine writable data file location (on Vercel serverless, /tmp is writable)
const isVercel = Boolean(process.env.VERCEL);
const dataDir = isVercel ? '/tmp' : path.join(__dirname, '..', 'data');
const dataFilePath = path.join(dataDir, 'signals.json');

try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create data directory:', e.message);
}

// In-memory state
let state = {
  settings: {},
  symbols: [],
  signals: [],
  image_uploads: [],
  counters: {
    signals: 1,
    image_uploads: 1
  }
};

// Load existing data if available
function loadState() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch (err) {
    console.warn('Using fresh in-memory database state:', err.message);
  }
}

// Save data to disk
function saveState() {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    // On read-only environments, continue in-memory
  }
}

loadState();

/**
 * Pure JavaScript SQL/Query Engine
 * Compatible with better-sqlite3 API: db.prepare(sql).all(...params), .get(...params), .run(...params)
 */
const db = {
  pragma: () => {},
  exec: (sql) => {
    if (sql.includes('DELETE FROM signals')) {
      state.signals = [];
      state.symbols = [];
      state.image_uploads = [];
      saveState();
    }
  },
  transaction: (fn) => {
    return (...args) => {
      const result = fn(...args);
      saveState();
      return result;
    };
  },
  prepare: (sql) => {
    const trimmed = sql.trim().replace(/\s+/g, ' ');

    return {
      all: (...params) => {
        // Query symbols
        if (trimmed.startsWith('SELECT s.*,') || (trimmed.startsWith('SELECT * FROM symbols') && !trimmed.includes('COUNT'))) {
          return state.symbols.map(s => {
            const symSignals = state.signals.filter(sig => sig.symbol === s.symbol);
            const recentSignals = symSignals.filter(sig => sig.is_recent === 1).length;
            return {
              ...s,
              total_signals: symSignals.length,
              recent_signals: recentSignals
            };
          }).sort((a, b) => (b.last_updated_at || '').localeCompare(a.last_updated_at || '') || a.symbol.localeCompare(b.symbol));
        }

        // Query image uploads
        if (trimmed.startsWith('SELECT * FROM image_uploads')) {
          return [...state.image_uploads].sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''));
        }

        // Query signals with filters
        if (trimmed.includes('FROM signals')) {
          let list = [...state.signals];

          // Check for Gold confluence query: SELECT * FROM signals WHERE indicator_type IN ('G🔥', 'G❄')
          if (trimmed.includes("indicator_type IN ('G🔥', 'G❄')")) {
            list = list.filter(s => s.indicator_type === 'G🔥' || s.indicator_type === 'G❄');

            // Apply dynamic params if present
            let pIdx = 0;
            if (trimmed.includes('symbol = ?') && params[pIdx] !== undefined) {
              const sym = params[pIdx++];
              list = list.filter(s => s.symbol === sym);
            }
            if (trimmed.includes('LOWER(timeframe) = LOWER(?)') && params[pIdx] !== undefined) {
              const tf = params[pIdx++];
              list = list.filter(s => s.timeframe.toLowerCase() === tf.toLowerCase());
            }
            if (trimmed.includes('direction = ?') && params[pIdx] !== undefined) {
              const dir = params[pIdx++];
              list = list.filter(s => s.direction === dir);
            }

            return list.sort((a, b) => new Date(b.signal_timestamp).getTime() - new Date(a.signal_timestamp).getTime() || b.id - a.id);
          }

          // Follow-up BOS / CHoCH structure signals query:
          if (trimmed.includes('indicator_type IN') && trimmed.includes('datetime(signal_timestamp) >=')) {
            const sym = params[0];
            // Follow-up params: [symbol, ...targetTypes, goldTsIso, expireDateIso]
            const targetTypes = params.slice(1, -2);
            const startIso = params[params.length - 2];
            const endIso = params[params.length - 1];

            const startTs = new Date(startIso).getTime();
            const endTs = new Date(endIso).getTime();

            return list.filter(s => {
              if (s.symbol !== sym) return false;
              if (!targetTypes.includes(s.indicator_type)) return false;
              const sTs = new Date(s.signal_timestamp).getTime();
              return sTs >= startTs && sTs <= endTs;
            }).sort((a, b) => new Date(a.signal_timestamp).getTime() - new Date(b.signal_timestamp).getTime());
          }

          // Generic signals query
          let pIdx = 0;
          if (trimmed.includes('symbol LIKE ?')) {
            const pattern = (params[pIdx++] || '').replace(/%/g, '').toLowerCase();
            list = list.filter(s => s.symbol.toLowerCase().includes(pattern));
          }
          if (trimmed.includes('indicator_type = ?')) {
            const type = params[pIdx++];
            list = list.filter(s => s.indicator_type === type);
          }
          if (trimmed.includes('indicator_group = ?')) {
            const group = params[pIdx++];
            list = list.filter(s => s.indicator_group === group);
          }
          if (trimmed.includes('LOWER(timeframe) = LOWER(?)')) {
            const tf = params[pIdx++];
            list = list.filter(s => s.timeframe.toLowerCase() === tf.toLowerCase());
          }
          if (trimmed.includes('direction = ?')) {
            const dir = params[pIdx++];
            list = list.filter(s => s.direction === dir);
          }
          if (trimmed.includes('is_recent = 1')) {
            list = list.filter(s => s.is_recent === 1);
          }

          list.sort((a, b) => {
            if (b.is_recent !== a.is_recent) return b.is_recent - a.is_recent;
            return new Date(b.signal_timestamp).getTime() - new Date(a.signal_timestamp).getTime() || b.id - a.id;
          });

          if (trimmed.includes('LIMIT ?')) {
            const limit = params[pIdx++];
            const offset = trimmed.includes('OFFSET ?') ? (params[pIdx++] || 0) : 0;
            list = list.slice(offset, offset + limit);
          }

          return list;
        }

        return [];
      },

      get: (...params) => {
        // Stats counts
        if (trimmed.includes('SELECT COUNT(*) as c FROM symbols') || trimmed.includes('SELECT COUNT(*) as count FROM symbols')) {
          return { count: state.symbols.length, c: state.symbols.length };
        }
        if (trimmed.includes("indicator_type = 'G🔥' AND is_recent = 1")) {
          const count = state.signals.filter(s => s.indicator_type === 'G🔥' && s.is_recent === 1).length;
          return { count };
        }
        if (trimmed.includes("indicator_type = 'G❄' AND is_recent = 1")) {
          const count = state.signals.filter(s => s.indicator_type === 'G❄' && s.is_recent === 1).length;
          return { count };
        }
        if (trimmed.includes('is_recent = 1')) {
          const count = state.signals.filter(s => s.is_recent === 1).length;
          return { count };
        }
        if (trimmed.includes("indicator_type IN ('G🔥', 'G❄')")) {
          const count = state.signals.filter(s => s.indicator_type === 'G🔥' || s.indicator_type === 'G❄').length;
          return { count };
        }
        if (trimmed.includes("indicator_group = 'STRUCTURE'")) {
          const count = state.signals.filter(s => s.indicator_group === 'STRUCTURE').length;
          return { count };
        }

        // Get latest reference time from image_uploads
        if (trimmed.includes('SELECT reference_time FROM image_uploads') || trimmed.includes('ORDER BY id DESC LIMIT 1')) {
          if (state.image_uploads.length === 0) return undefined;
          const sorted = [...state.image_uploads].sort((a, b) => b.id - a.id);
          return sorted[0];
        }

        // Settings lookup
        if (trimmed.includes('FROM settings WHERE key')) {
          let key = params[0];
          if (!key) {
            const match = trimmed.match(/key\s*=\s*['"]?([a-zA-Z0-9_\-]+)['"]?/);
            if (match) key = match[1];
          }
          if (key && state.settings && state.settings[key] !== undefined) {
            return { value: state.settings[key] };
          }
          return undefined;
        }

        return undefined;
      },

      run: (...params) => {
        // Insert / update image upload
        if (trimmed.startsWith('INSERT INTO image_uploads')) {
          const [filename, original_name, file_path, header_text, reference_time, table_type, signals_count] = params;
          const id = state.counters.image_uploads++;
          const entry = {
            id,
            filename,
            original_name,
            file_path,
            header_text,
            reference_time,
            table_type,
            signals_count,
            uploaded_at: new Date().toISOString()
          };
          state.image_uploads.push(entry);
          return { lastInsertRowid: id, changes: 1 };
        }

        if (trimmed.startsWith('UPDATE image_uploads SET signals_count = ? WHERE id = ?')) {
          const [signals_count, id] = params;
          const upload = state.image_uploads.find(u => u.id === id);
          if (upload) upload.signals_count = signals_count;
          return { changes: 1 };
        }

        // Upsert symbol
        if (trimmed.startsWith('INSERT INTO symbols')) {
          const [symbol] = params;
          const existing = state.symbols.find(s => s.symbol === symbol);
          const now = new Date().toISOString();
          if (existing) {
            existing.last_updated_at = now;
          } else {
            state.symbols.push({
              symbol,
              category: 'CRYPTO',
              first_seen_at: now,
              last_updated_at: now
            });
          }
          return { changes: 1 };
        }

        // Delete existing signals of same type + timeframe for updating symbol data
        if (trimmed.startsWith('DELETE FROM signals WHERE symbol = ? AND LOWER(timeframe) = LOWER(?) AND indicator_group = ?')) {
          const [symbol, tf, group] = params;
          state.signals = state.signals.filter(s => {
            return !(s.symbol === symbol && s.timeframe.toLowerCase() === tf.toLowerCase() && s.indicator_group === group);
          });
          return { changes: 1 };
        }

        // Insert signal
        if (trimmed.startsWith('INSERT INTO signals')) {
          const [
            symbol, timeframe, indicator_group, indicator_type, indicator_name,
            direction, is_recent, signal_date_str, signal_timestamp, raw_text, upload_id
          ] = params;

          const id = state.counters.signals++;
          const sig = {
            id,
            symbol,
            timeframe,
            indicator_group,
            indicator_type,
            indicator_name,
            direction,
            is_recent,
            signal_date_str,
            signal_timestamp,
            raw_text,
            upload_id,
            created_at: new Date().toISOString()
          };
          state.signals.push(sig);
          return { lastInsertRowid: id, changes: 1 };
        }

        // Upsert setting
        if (trimmed.startsWith('INSERT INTO settings')) {
          let sKey, sVal;
          if (trimmed.includes("VALUES ('gemini_api_key'")) {
            sKey = 'gemini_api_key';
            sVal = params[0];
          } else if (params.length >= 2) {
            sKey = params[0];
            sVal = params[1];
          } else {
            sKey = params[0];
            sVal = params[0];
          }
          if (sKey) {
            state.settings[sKey] = sVal;
            saveState();
          }
          return { changes: 1 };
        }

        return { changes: 0 };
      }
    };
  }
};

module.exports = db;
