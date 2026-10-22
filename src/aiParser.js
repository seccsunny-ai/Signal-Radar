const fs = require('fs');
const db = require('./db');

function getApiKey(explicitKey = null) {
  if (explicitKey && typeof explicitKey === 'string' && explicitKey.trim().length > 0) {
    return explicitKey.trim();
  }
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get('gemini_api_key');
  return (row && row.value) || process.env.GEMINI_API_KEY || '';
}

function setApiKey(key) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?
  `).run('gemini_api_key', key, key);
}

/**
 * Parses an image file using Google Gemini Vision model
 */
async function parseTradingViewImage(filePath, mimeType = 'image/png', explicitKey = null) {
  const apiKey = getApiKey(explicitKey);
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please enter your Gemini API key in Settings.');
  }

  const fileBytes = fs.readFileSync(filePath);
  const base64Data = fileBytes.toString('base64');

  const systemInstruction = `
You are an expert financial chart OCR parser specializing in TradingView table dashboards.
You will receive an image containing a table of cryptocurrency symbols and indicator signals across multiple timeframes (e.g. 15m, 1h, 4h, 1D).

There are two primary table types:
1) "OSCILLATOR_GOLD": Contains multi-line cells with:
   - "G🔥" (Gold Buy) or "G❄" (Gold Sell)
   - "V↑" (VMC Bull Div) or "V↓" (VMC Bear Div)
   - "R↑" (RSI Bull Div) or "R↓" (RSI Bear Div)
   - "⚡" prefix before an indicator indicates it is "Recent" (e.g., "⚡ G🔥 22 Oct 15:15")
   Columns are usually: SYMBOL, 15m, 1h, 4h, 1D.

2) "STRUCTURE_BOS_CHOCH": Contains structure break cells with:
   - "Int BOS↑", "Int BOS↓", "Sw BOS↑", "Sw BOS↓", "Int CHoCH↑", "Int CHoCH↓", "Sw CHoCH↑", "Sw CHoCH↓"
   - "⚡" prefix indicates Recent.
   Columns are usually: SYMBOL, 15m, 1h, 4h.

Return ONLY a strict JSON object with this exact structure:
{
  "tableType": "OSCILLATOR_GOLD" | "STRUCTURE_BOS_CHOCH",
  "headerText": "The text from the top/watermark, e.g. seccsunny created with TradingView.com, Oct 22, 2026 23:31 UTC+5:30",
  "referenceTime": "ISO datetime or header date string",
  "columns": ["15m", "1h", "4h", "1D"],
  "rows": [
    {
      "symbol": "BTCUSDT.P",
      "signals": [
        {
          "timeframe": "15m",
          "indicator": "G🔥",
          "isRecent": true,
          "dateStr": "22 Oct 15:15"
        }
      ]
    }
  ]
}
Be extremely accurate with:
1. Symbol names (e.g. BTCUSDT.P, 1000BONKUSDT.P, NEARUSDT.P, BCHUSDT.P, etc.)
2. Identifying the ⚡ lightning symbol before any indicator line to mark isRecent = true.
3. Distinguishing G🔥 (Gold Buy) vs G❄ (Gold Sell).
4. Distinguishing Int BOS vs Sw BOS vs Int CHoCH vs Sw CHoCH and ↑ vs ↓.
5. All symbols in both top and bottom tables if image has multiple tables.
`;

  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: 'Parse this TradingView indicator table into JSON according to the instructions.' },
                { inlineData: { mimeType, data: base64Data } }
              ]
            }
          ],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      const data = await res.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const text = data.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(text);
        return parsed;
      }

      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
    } catch (err) {
      console.warn(`Vision model ${model} error:`, err.message);
      lastError = err;
    }
  }

  throw new Error(`Vision Parsing failed: ${lastError ? lastError.message : 'No candidate returned'}`);
}

module.exports = {
  getApiKey,
  setApiKey,
  parseTradingViewImage
};
