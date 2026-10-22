const db = require('./db');
const { INDICATOR_MAP, parseSignalDate } = require('./indicators');

/**
 * Ingests a structured batch of rows into the database
 */
function ingestParsedData({
  headerText = '',
  referenceTime = '',
  tableType = 'UNKNOWN',
  filename = '',
  filePath = '',
  rows = []
}) {
  const refDate = referenceTime ? new Date(referenceTime) : new Date();

  // Begin transaction
  const insertUpload = db.prepare(`
    INSERT INTO image_uploads (filename, original_name, file_path, header_text, reference_time, table_type, signals_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertSymbol = db.prepare(`
    INSERT INTO symbols (symbol, category, last_updated_at)
    VALUES (?, 'CRYPTO', CURRENT_TIMESTAMP)
    ON CONFLICT(symbol) DO UPDATE SET last_updated_at = CURRENT_TIMESTAMP
  `);

  const insertSignal = db.prepare(`
    INSERT INTO signals (
      symbol, timeframe, indicator_group, indicator_type, indicator_name,
      direction, is_recent, signal_date_str, signal_timestamp, raw_text, upload_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteExistingSameTypeTf = db.prepare(`
    DELETE FROM signals 
    WHERE symbol = ? 
      AND LOWER(timeframe) = LOWER(?) 
      AND indicator_group = ?
  `);

  let insertedSignalsCount = 0;

  const runIngest = db.transaction(() => {
    const uploadResult = insertUpload.run(
      filename,
      filename,
      filePath,
      headerText,
      referenceTime,
      tableType,
      0
    );
    const uploadId = uploadResult.lastInsertRowid;

    for (const row of rows) {
      const symbol = row.symbol.trim();
      upsertSymbol.run(symbol);

      for (const sig of row.signals) {
        const indKey = sig.ind || sig.indicator;
        const meta = INDICATOR_MAP[indKey] || {
          name: indKey,
          group: indKey.includes('BOS') || indKey.includes('CHoCH') ? 'STRUCTURE' : 'OTHER',
          direction: indKey.includes('↑') || indKey.includes('🔥') ? 'BULLISH' : 'BEARISH'
        };

        const tf = sig.tf || sig.timeframe;
        const isRecent = sig.recent || sig.isRecent ? 1 : 0;
        const dateStr = sig.date || sig.dateStr;
        const signalDate = parseSignalDate(dateStr, refDate);
        const isoTs = signalDate.toISOString();
        const rawText = `${isRecent ? '⚡ ' : ''}${indKey} ${dateStr}`;

        // When a new image provides updated data for a symbol + timeframe + indicator group,
        // we update the current state so old symbols are retained while their cell data updates.
        // We delete only identical timeframe + indicator_group to keep the latest state clean,
        // or for structure vs gold they don't overwrite each other!
        if (meta.group === 'STRUCTURE') {
          deleteExistingSameTypeTf.run(symbol, tf, 'STRUCTURE');
        } else if (meta.group === 'GOLD') {
          deleteExistingSameTypeTf.run(symbol, tf, 'GOLD');
        } else if (meta.group === 'VMC') {
          deleteExistingSameTypeTf.run(symbol, tf, 'VMC');
        } else if (meta.group === 'RSI') {
          deleteExistingSameTypeTf.run(symbol, tf, 'RSI');
        }

        insertSignal.run(
          symbol,
          tf,
          meta.group,
          indKey,
          meta.name,
          meta.direction,
          isRecent,
          dateStr,
          isoTs,
          rawText,
          uploadId
        );
        insertedSignalsCount++;
      }
    }

    db.prepare(`UPDATE image_uploads SET signals_count = ? WHERE id = ?`).run(
      insertedSignalsCount,
      uploadId
    );

    return { uploadId, insertedSignalsCount };
  });

  return runIngest();
}

/**
 * Get all symbols with their summary
 */
function getAllSymbols() {
  return db.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM signals WHERE symbol = s.symbol) as total_signals,
      (SELECT COUNT(*) FROM signals WHERE symbol = s.symbol AND is_recent = 1) as recent_signals
    FROM symbols s
    ORDER BY s.last_updated_at DESC, s.symbol ASC
  `).all();
}

/**
 * Filter individual signals
 */
function querySignals(filters = {}) {
  let sql = `SELECT * FROM signals WHERE 1=1`;
  const params = [];

  if (filters.symbol) {
    sql += ` AND symbol LIKE ?`;
    params.push(`%${filters.symbol}%`);
  }
  if (filters.indicatorType) {
    sql += ` AND indicator_type = ?`;
    params.push(filters.indicatorType);
  }
  if (filters.indicatorGroup) {
    sql += ` AND indicator_group = ?`;
    params.push(filters.indicatorGroup);
  }
  if (filters.timeframe) {
    sql += ` AND LOWER(timeframe) = LOWER(?)`;
    params.push(filters.timeframe);
  }
  if (filters.direction && filters.direction !== 'ALL') {
    sql += ` AND direction = ?`;
    params.push(filters.direction.toUpperCase());
  }
  if (filters.recentOnly === 'true' || filters.recentOnly === true || filters.recentOnly === '1') {
    sql += ` AND is_recent = 1`;
  }

  sql += ` ORDER BY is_recent DESC, signal_timestamp DESC, id DESC`;

  if (filters.limit) {
    sql += ` LIMIT ?`;
    params.push(parseInt(filters.limit, 10));
    if (filters.offset) {
      sql += ` OFFSET ?`;
      params.push(parseInt(filters.offset, 10));
    }
  }

  return db.prepare(sql).all(...params);
}

/**
 * Matrix view: All symbols as rows, timeframes as columns with all indicator groups
 */
function getMatrixData() {
  const symbols = db.prepare(`SELECT * FROM symbols ORDER BY symbol ASC`).all();
  const allSignals = db.prepare(`SELECT * FROM signals ORDER BY signal_timestamp DESC`).all();

  const timeframes = ['15m', '1h', '4h', '1D'];

  // Map signals by symbol -> timeframe -> { gold, vmc, rsi, structure }
  const matrix = symbols.map(sym => {
    const symSignals = allSignals.filter(s => s.symbol === sym.symbol);
    const tfData = {};

    timeframes.forEach(tf => {
      const tfMatch = symSignals.filter(s => s.timeframe.toLowerCase() === tf.toLowerCase());
      
      const goldSig = tfMatch.find(s => s.indicator_group === 'GOLD');
      const vmcSig = tfMatch.find(s => s.indicator_group === 'VMC');
      const rsiSig = tfMatch.find(s => s.indicator_group === 'RSI');
      const structSig = tfMatch.find(s => s.indicator_group === 'STRUCTURE');

      const recentAny = tfMatch.some(s => s.is_recent === 1);

      tfData[tf] = {
        gold: goldSig || null,
        vmc: vmcSig || null,
        rsi: rsiSig || null,
        structure: structSig || null,
        hasRecent: recentAny
      };
    });

    const hasAnyRecent = symSignals.some(s => s.is_recent === 1);
    const hasGoldBuy = symSignals.some(s => s.indicator_type === 'G🔥');
    const hasGoldSell = symSignals.some(s => s.indicator_type === 'G❄');

    return {
      symbol: sym.symbol,
      lastUpdatedAt: sym.last_updated_at,
      hasAnyRecent,
      hasGoldBuy,
      hasGoldSell,
      totalSignals: symSignals.length,
      timeframes: tfData
    };
  });

  return matrix;
}

/**
 * Dashboard top-level stats
 */
function getDashboardStats() {
  const totalSymbols = db.prepare(`SELECT COUNT(*) as count FROM symbols`).get().count;
  const recentGFlame = db.prepare(`SELECT COUNT(*) as count FROM signals WHERE indicator_type = 'G🔥' AND is_recent = 1`).get().count;
  const recentGSnow = db.prepare(`SELECT COUNT(*) as count FROM signals WHERE indicator_type = 'G❄' AND is_recent = 1`).get().count;
  const totalRecent = db.prepare(`SELECT COUNT(*) as count FROM signals WHERE is_recent = 1`).get().count;
  const totalGold = db.prepare(`SELECT COUNT(*) as count FROM signals WHERE indicator_type IN ('G🔥', 'G❄')`).get().count;
  const totalStructure = db.prepare(`SELECT COUNT(*) as count FROM signals WHERE indicator_group = 'STRUCTURE'`).get().count;

  return {
    totalSymbols,
    recentGFlame,
    recentGSnow,
    totalRecent,
    totalGold,
    totalStructure
  };
}

module.exports = {
  ingestParsedData,
  getAllSymbols,
  querySignals,
  getMatrixData,
  getDashboardStats
};
