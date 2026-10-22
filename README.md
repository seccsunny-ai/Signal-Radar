# TradingView Signal Filter & Confluence Radar

A web application designed for processing hourly TradingView table screenshots, converting them into structured, filterable data, and tracking confluence setups when a Gold signal (`G🔥` or `G❄`) is followed by a Break of Structure (`BOS`) or Change of Character (`CHoCH`).

---

## ⚡ Features

1. **Hourly Screenshot Ingestion**:
   - **AI Vision Parsing**: Extracts table cells, symbols, timeframes, indicators, and recent (`⚡`) flags using Gemini Vision OCR.
   - **Clipboard Paste**: Press `Ctrl + V` anywhere on the screen to instantly paste TradingView screenshots.
   - **Drag & Drop**: Easily drag image files into the upload zone.
   - **Persistent Accumulation**: Old symbols remain in the database when new images arrive; only incoming symbol/indicator data is updated.

2. **Gold Signal + Structure Follow-up Confluence Engine**:
   - Automatically tracks **Bullish Setups** when `G🔥` (Gold Buy) is followed by:
     - `Int BOS↑`, `Sw BOS↑`, `Int CHoCH↑`, or `Sw CHoCH↑`
   - Automatically tracks **Bearish Setups** when `G❄` (Gold Sell) is followed by:
     - `Int BOS↓`, `Sw BOS↓`, `Int CHoCH↓`, or `Sw CHoCH↓`
   - **Validity Timeframes**:
     - **15m**: 2 Days
     - **1H**: 7 Days
     - **4H**: 14 Days
     - **1D**: 21 Days
   - Tracks whether a setup is **Confirmed** (follow-up triggered), **Pending** (window active), or **Expired**.

3. **TradingView Matrix View**:
   - Interactive table mirroring the TradingView layout with rows as symbols and columns for `15m`, `1h`, `4h`, and `1D`.
   - 1-click Quick Filters:
     - `⚡ Recent G🔥 (Gold Buy)`
     - `⚡ Recent G❄ (Gold Sell)`
     - `⚡ Any Recent`
     - `Confirmed Confluences Only`

4. **Detailed Signal Explorer**:
   - Filter by indicator (`G🔥`, `G❄`, `V↑`, `V↓`, `R↑`, `R↓`, `Int BOS`, `Sw BOS`, `Int CHoCH`, `Sw CHoCH`).
   - Filter by timeframe, direction, symbol, and recent status.
   - 1-click export to CSV.

---

## 🚀 Quick Start

1. **Start the application**:
   ```bash
   npm start
   ```

2. **Open in browser**:
   Navigate to:
   [http://localhost:3000](http://localhost:3000)

3. **Pre-loaded Sample Data**:
   - The application automatically seeds with the two sample screenshots provided.
   - Use the **Load Samples** button in the top navbar at any time to re-test Sample 1 (Gold/VMC/RSI) or Sample 2 (BOS/CHoCH).

4. **Gemini API Key Configuration**:
   - Click the **Settings (⚙)** icon in the top right.
   - Enter your free Gemini API key from [Google AI Studio](https://aistudio.google.com/) to enable automatic OCR on new hourly screenshots.
