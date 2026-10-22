// Indicator definitions, mappings and confluence rules

const INDICATOR_MAP = {
  'G🔥': {
    name: 'Gold Buy',
    group: 'GOLD',
    direction: 'BULLISH',
    isGold: true,
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    dotColor: '#f59e0b'
  },
  'G❄': {
    name: 'Gold Sell',
    group: 'GOLD',
    direction: 'BEARISH',
    isGold: true,
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    dotColor: '#06b6d4'
  },
  'V↑': {
    name: 'VMC Bull Div',
    group: 'VMC',
    direction: 'BULLISH',
    isGold: false,
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dotColor: '#10b981'
  },
  'V↓': {
    name: 'VMC Bear Div',
    group: 'VMC',
    direction: 'BEARISH',
    isGold: false,
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    dotColor: '#f43f5e'
  },
  'R↑': {
    name: 'RSI Bull Div',
    group: 'RSI',
    direction: 'BULLISH',
    isGold: false,
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dotColor: '#10b981'
  },
  'R↓': {
    name: 'RSI Bear Div',
    group: 'RSI',
    direction: 'BEARISH',
    isGold: false,
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    dotColor: '#f43f5e'
  },
  'Int BOS↑': {
    name: 'Bullish Internal Break of Structure',
    group: 'STRUCTURE',
    direction: 'BULLISH',
    isGold: false,
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dotColor: '#10b981'
  },
  'Int BOS↓': {
    name: 'Bearish Internal Break of Structure',
    group: 'STRUCTURE',
    direction: 'BEARISH',
    isGold: false,
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    dotColor: '#f43f5e'
  },
  'Sw BOS↑': {
    name: 'Bullish Swing Break of Structure',
    group: 'STRUCTURE',
    direction: 'BULLISH',
    isGold: false,
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dotColor: '#10b981'
  },
  'Sw BOS↓': {
    name: 'Bearish Swing Break of Structure',
    group: 'STRUCTURE',
    direction: 'BEARISH',
    isGold: false,
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    dotColor: '#f43f5e'
  },
  'Int CHoCH↑': {
    name: 'Bullish Internal Change of Character',
    group: 'STRUCTURE',
    direction: 'BULLISH',
    isGold: false,
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dotColor: '#10b981'
  },
  'Int CHoCH↓': {
    name: 'Bearish Internal Change of Character',
    group: 'STRUCTURE',
    direction: 'BEARISH',
    isGold: false,
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    dotColor: '#f43f5e'
  },
  'Sw CHoCH↑': {
    name: 'Bullish Swing Change of Character',
    group: 'STRUCTURE',
    direction: 'BULLISH',
    isGold: false,
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dotColor: '#10b981'
  },
  'Sw CHoCH↓': {
    name: 'Bearish Swing Change of Character',
    group: 'STRUCTURE',
    direction: 'BEARISH',
    isGold: false,
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    dotColor: '#f43f5e'
  }
};

// Window rules in days based on timeframe of the Gold signal
const CONFLUENCE_WINDOWS_DAYS = {
  '15m': 2,
  '1h': 7,
  '1H': 7,
  '4h': 14,
  '4H': 14,
  '1d': 21,
  '1D': 21
};

const BULLISH_STRUCTURE_TYPES = ['Int BOS↑', 'Sw BOS↑', 'Int CHoCH↑', 'Sw CHoCH↑'];
const BEARISH_STRUCTURE_TYPES = ['Int BOS↓', 'Sw BOS↓', 'Int CHoCH↓', 'Sw CHoCH↓'];

/**
 * Normalizes indicator string into canonical form
 */
function normalizeIndicatorType(str) {
  if (!str) return null;
  const s = str.trim();
  for (const key of Object.keys(INDICATOR_MAP)) {
    if (s.includes(key)) return key;
  }
  return null;
}

/**
 * Parses date string like "22 Oct 15:15" or "25 Nov 2024 05:30" into Date object using reference year/date
 */
function parseSignalDate(dateStr, referenceDate = new Date()) {
  if (!dateStr) return new Date();
  
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  
  // Format typically: "22 Oct 15:15" or "25 Nov 2024 05:30" or "22 Oct 15:15:00"
  const match = dateStr.match(/(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?(?:\s+(\d{1,2}):(\d{2}))?/i);
  if (!match) {
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  
  const day = parseInt(match[1], 10);
  const monthStr = match[2].toLowerCase();
  const month = months[monthStr] !== undefined ? months[monthStr] : 0;
  const explicitYear = match[3] ? parseInt(match[3], 10) : null;
  const hour = match[4] ? parseInt(match[4], 10) : 0;
  const minute = match[5] ? parseInt(match[5], 10) : 0;
  
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();
  
  let year = refYear;
  if (explicitYear) {
    year = explicitYear;
  } else {
    // Financial indicator tables only display historical/current events, NEVER future events.
    // If the signal's month is after reference month, or same month with day after reference day,
    // the event occurred in the previous year (e.g. Nov 25 when today is Oct 22).
    if (month > refMonth || (month === refMonth && day > refDay)) {
      year = refYear - 1;
    }
  }
  
  const d = new Date(year, month, day, hour, minute, 0);
  return d;
}

module.exports = {
  INDICATOR_MAP,
  CONFLUENCE_WINDOWS_DAYS,
  BULLISH_STRUCTURE_TYPES,
  BEARISH_STRUCTURE_TYPES,
  normalizeIndicatorType,
  parseSignalDate
};
