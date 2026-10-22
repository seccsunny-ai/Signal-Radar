const db = require('./db');
const {
  CONFLUENCE_WINDOWS_DAYS,
  BULLISH_STRUCTURE_TYPES,
  BEARISH_STRUCTURE_TYPES
} = require('./indicators');

/**
 * Computes all confluence setups across the database
 * Options:
 *  - symbol (optional filter)
 *  - timeframe (optional filter)
 *  - status: 'ALL' | 'CONFIRMED' | 'PENDING' | 'EXPIRED'
 *  - direction: 'ALL' | 'BULLISH' | 'BEARISH'
 */
function getConfluences(filters = {}) {
  // Query all Gold signals
  let query = `
    SELECT * FROM signals 
    WHERE indicator_type IN ('G🔥', 'G❄')
  `;
  const params = [];

  if (filters.symbol) {
    query += ` AND symbol = ?`;
    params.push(filters.symbol);
  }
  if (filters.timeframe) {
    query += ` AND LOWER(timeframe) = LOWER(?)`;
    params.push(filters.timeframe);
  }
  if (filters.direction && filters.direction !== 'ALL') {
    query += ` AND direction = ?`;
    params.push(filters.direction.toUpperCase());
  }

  query += ` ORDER BY signal_timestamp DESC, id DESC`;

  const goldSignals = db.prepare(query).all(...params);

  // Reference time: use latest upload reference time or current clock
  const latestUpload = db.prepare(`
    SELECT reference_time FROM image_uploads 
    WHERE reference_time IS NOT NULL AND reference_time != '' 
    ORDER BY id DESC LIMIT 1
  `).get();
  
  let referenceNow = new Date();
  if (latestUpload && latestUpload.reference_time) {
    const uploadRefDate = new Date(latestUpload.reference_time);
    if (!isNaN(uploadRefDate.getTime())) {
      // If local clock is close to or ahead of upload time, use current clock; otherwise use upload reference time
      referenceNow = uploadRefDate;
    }
  }

  const results = [];

  for (const gold of goldSignals) {
    const tfKey = gold.timeframe.toLowerCase();
    const windowDays = CONFLUENCE_WINDOWS_DAYS[gold.timeframe] || CONFLUENCE_WINDOWS_DAYS[tfKey] || 2;
    const goldTs = new Date(gold.signal_timestamp).getTime();
    const expireTs = goldTs + windowDays * 24 * 60 * 60 * 1000;
    const expireDate = new Date(expireTs);

    const isBull = gold.indicator_type === 'G🔥';
    const targetTypes = isBull ? BULLISH_STRUCTURE_TYPES : BEARISH_STRUCTURE_TYPES;

    // Placeholders for IN query
    const placeholders = targetTypes.map(() => '?').join(',');

    // Look for follow-up BOS / CHoCH signals on the same symbol
    // occurring at or after the Gold signal and within the window
    const followUpsQuery = `
      SELECT * FROM signals
      WHERE symbol = ?
        AND indicator_type IN (${placeholders})
        AND datetime(signal_timestamp) >= datetime(?)
        AND datetime(signal_timestamp) <= datetime(?)
      ORDER BY signal_timestamp ASC
    `;

    const followUpParams = [
      gold.symbol,
      ...targetTypes,
      new Date(goldTs).toISOString(),
      expireDate.toISOString()
    ];

    const followUpSignals = db.prepare(followUpsQuery).all(...followUpParams);

    // Format follow-ups with elapsed time from gold signal
    const formattedFollowUps = followUpSignals.map(f => {
      const fTs = new Date(f.signal_timestamp).getTime();
      const diffMs = fTs - goldTs;
      const diffHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
      return {
        id: f.id,
        indicatorType: f.indicator_type,
        indicatorName: f.indicator_name,
        timeframe: f.timeframe,
        signalDateStr: f.signal_date_str,
        signalTimestamp: f.signal_timestamp,
        isRecent: Boolean(f.is_recent),
        hoursAfterGold: diffHours,
        isSameTimeframe: f.timeframe.toLowerCase() === gold.timeframe.toLowerCase()
      };
    });

    const isConfirmed = formattedFollowUps.length > 0;
    const isStillActiveWindow = referenceNow.getTime() <= expireTs;

    let status = 'EXPIRED';
    if (isConfirmed) {
      status = 'CONFIRMED';
    } else if (isStillActiveWindow) {
      status = 'PENDING';
    }

    // Filter by status if specified
    if (filters.status && filters.status !== 'ALL' && filters.status !== status) {
      continue;
    }

    // Remaining time calculation
    const msRemaining = Math.max(0, expireTs - referenceNow.getTime());
    const hoursRemaining = Math.round(msRemaining / (1000 * 60 * 60));
    const daysRemaining = Math.floor(hoursRemaining / 24);
    const remHours = hoursRemaining % 24;

    let timeRemainingStr = '';
    if (status === 'CONFIRMED') {
      timeRemainingStr = 'Confirmed';
    } else if (status === 'PENDING') {
      timeRemainingStr = `${daysRemaining}d ${remHours}h remaining`;
    } else {
      const expD = new Date(expireTs);
      const expMonthStr = expD.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      timeRemainingStr = `Expired (${expMonthStr})`;
    }

    results.push({
      id: gold.id,
      symbol: gold.symbol,
      goldIndicator: gold.indicator_type,
      goldName: gold.indicator_name,
      direction: gold.direction,
      timeframe: gold.timeframe,
      goldDateStr: gold.signal_date_str,
      goldTimestamp: gold.signal_timestamp,
      goldIsRecent: Boolean(gold.is_recent),
      windowDays,
      expireTimestamp: expireDate.toISOString(),
      status,
      timeRemainingStr,
      isConfirmed,
      followUpCount: formattedFollowUps.length,
      followUps: formattedFollowUps,
      latestFollowUp: formattedFollowUps[formattedFollowUps.length - 1] || null
    });
  }

  return results;
}

module.exports = {
  getConfluences
};
