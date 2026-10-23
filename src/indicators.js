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
 * Normalizes indicator string into canonical form (stripping variation selectors and handling variations)
 */
function normalizeIndicatorType(str) {
  if (!str) return null;
  const s = String(str).replace(/[\uFE0E\uFE0F]/g, '').trim();

  // Gold checks (🔥 = Buy, ❄ = Sell)
  if (/G.*[❄\u2744]|gold.*sell/i.test(s)) return 'G❄';
  if (/G.*[🔥\uD83D\uDD25]|gold.*buy/i.test(s)) return 'G🔥';

  // VMC checks (↑ = Bull, ↓ = Bear)
  if (/V.*[↑\u2191\u2B06]|vmc.*bull/i.test(s)) return 'V↑';
  if (/V.*[↓\u2193\u2B07]|vmc.*bear/i.test(s)) return 'V↓';

  // RSI checks (↑ = Bull, ↓ = Bear)
  if (/R.*[↑\u2191\u2B06]|rsi.*bull/i.test(s)) return 'R↑';
  if (/R.*[↓\u2193\u2B07]|rsi.*bear/i.test(s)) return 'R↓';

  // Structure breaks
  if (/int.*bos.*[↑\u2191\u2B06]|int.*bos.*bull/i.test(s)) return 'Int BOS↑';
  if (/int.*bos.*[↓\u2193\u2B07]|int.*bos.*bear/i.test(s)) return 'Int BOS↓';
  if (/sw.*bos.*[↑\u2191\u2B06]|sw.*bos.*bull/i.test(s)) return 'Sw BOS↑';
  if (/sw.*bos.*[↓\u2193\u2B07]|sw.*bos.*bear/i.test(s)) return 'Sw BOS↓';
  if (/int.*choch.*[↑\u2191\u2B06]|int.*choch.*bull/i.test(s)) return 'Int CHoCH↑';
  if (/int.*choch.*[↓\u2193\u2B07]|int.*choch.*bear/i.test(s)) return 'Int CHoCH↓';
  if (/sw.*choch.*[↑\u2191\u2B06]|sw.*choch.*bull/i.test(s)) return 'Sw CHoCH↑';
  if (/sw.*choch.*[↓\u2193\u2B07]|sw.*choch.*bear/i.test(s)) return 'Sw CHoCH↓';

  for (const key of Object.keys(INDICATOR_MAP)) {
    if (s.includes(key.replace(/[\uFE0E\uFE0F]/g, ''))) return key;
  }
  return s;
}

/**
 * Parses date string like "22 Oct 15:15", "23 Oct 12.30", "12:30", or "25 Nov 2024 05:30"
 */
function parseSignalDate(dateStr, referenceDate = new Date()) {
  if (!dateStr) return new Date();
  
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  
  const str = String(dateStr).trim();

  // 1. Full date with month (supports : and . for time)
  const matchFull = str.match(/(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?(?:\s+(\d{1,2})[:.](\d{2}))?/i);
  if (matchFull) {
    const day = parseInt(matchFull[1], 10);
    const month = months[matchFull[2].toLowerCase()] ?? 0;
    const explicitYear = matchFull[3] ? parseInt(matchFull[3], 10) : null;
    const hour = matchFull[4] ? parseInt(matchFull[4], 10) : 0;
    const minute = matchFull[5] ? parseInt(matchFull[5], 10) : 0;
    
    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth();
    
    let year = refYear;
    if (explicitYear) {
      year = explicitYear;
    } else if (month > refMonth) {
      year = refYear - 1;
    }
    
    return new Date(Date.UTC(year, month, day, hour, minute, 0));
  }

  // 2. Time-only format: '12:30', '12.30'
  const matchTimeOnly = str.match(/^(\d{1,2})[:.](\d{2})$/);
  if (matchTimeOnly) {
    const hour = parseInt(matchTimeOnly[1], 10);
    const minute = parseInt(matchTimeOnly[2], 10);
    return new Date(Date.UTC(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
      hour,
      minute,
      0
    ));
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

module.exports = {
  INDICATOR_MAP,
  CONFLUENCE_WINDOWS_DAYS,
  BULLISH_STRUCTURE_TYPES,
  BEARISH_STRUCTURE_TYPES,
  normalizeIndicatorType,
  parseSignalDate
};
