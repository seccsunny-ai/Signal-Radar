// State management
const state = {
  activeTab: 'confluence',
  stats: {},
  confluences: [],
  matrix: [],
  signals: [],
  uploads: [],
  selectedFile: null,
  filters: {
    confluence: {
      status: 'ALL',
      direction: 'ALL',
      timeframe: '',
      symbol: ''
    },
    matrix: {
      quickFilter: 'all',
      symbol: ''
    },
    signals: {
      indicatorType: '',
      timeframe: '',
      direction: 'ALL',
      recentOnly: false,
      symbol: ''
    }
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  setupEventListeners();
  loadAllData();
});

// Setup event listeners
function setupEventListeners() {
  // Global paste handler for instant screenshot ingestion
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        handleSelectedFile(file);
        openUploadModal();
        showToast('Image pasted from clipboard!', 'info');
        break;
      }
    }
  });

  // Drag and drop for upload zone
  setupDropZone('dropZone', 'fileInput');
  setupDropZone('modalDropZone', 'modalFileInput');

  // Sample menu dropdown toggle
  const btnSample = document.getElementById('btnSampleDropdown');
  const sampleMenu = document.getElementById('sampleMenu');
  btnSample.addEventListener('click', (e) => {
    e.stopPropagation();
    sampleMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    if (!sampleMenu.classList.contains('hidden')) {
      sampleMenu.classList.add('hidden');
    }
  });

  // Sync API key from localStorage to server on startup if present
  const savedKey = localStorage.getItem('gemini_api_key');
  if (savedKey) {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: savedKey })
    }).catch(() => {});
  }

  // Modal open/close buttons
  document.getElementById('btnOpenUpload').addEventListener('click', openUploadModal);
  document.getElementById('btnOpenSettings').addEventListener('click', openSettingsModal);
}

function setupDropZone(zoneId, inputId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());

  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(name => {
    zone.addEventListener(name, (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    zone.addEventListener(name, (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
    });
  });

  zone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });
}

function handleSelectedFile(file) {
  if (!file) return;
  state.selectedFile = file;
  const preview = document.getElementById('modalPreviewImg');
  const previewContainer = document.getElementById('modalPreviewContainer');
  const fileName = document.getElementById('modalFileName');

  if (preview) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      fileName.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
      previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
  openUploadModal();
}

function applyFullData(data) {
  if (!data) return;
  if (data.stats) {
    state.stats = data.stats;
    renderStats();
  }
  if (data.confluences) {
    state.confluences = data.confluences;
    renderConfluences();
  }
  if (data.matrix) {
    state.matrix = data.matrix;
    renderMatrix();
  }
  if (data.signals) {
    state.signals = data.signals;
    renderSignals();
  }
  if (data.uploads) {
    state.uploads = data.uploads;
    renderUploads();
  }
}

async function syncUserUploads() {
  try {
    const raw = localStorage.getItem('tv_user_uploads');
    if (!raw) return false;
    const uploads = JSON.parse(raw);
    if (!Array.isArray(uploads) || uploads.length === 0) return false;

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploads })
    });
    const json = await res.json();
    if (json.success && json.data) {
      applyFullData(json.data);
      return true;
    }
  } catch (err) {
    console.warn('Failed to sync uploads:', err);
  }
  return false;
}

// Data Fetching
async function loadAllData() {
  const synced = await syncUserUploads();
  if (synced) return;

  await Promise.all([
    fetchStats(),
    fetchConfluences(),
    fetchMatrix(),
    fetchSignals(),
    fetchUploads()
  ]);
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const json = await res.json();
    if (json.success) {
      state.stats = json.data;
      renderStats();
    }
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

function renderStats() {
  const s = state.stats;
  document.getElementById('statSymbols').textContent = s.totalSymbols ?? '-';
  document.getElementById('statRecentGFlame').textContent = s.recentGFlame ?? '-';
  document.getElementById('statRecentGSnow').textContent = s.recentGSnow ?? '-';
  document.getElementById('statConfirmed').textContent = s.confluencesConfirmed ?? '-';
  document.getElementById('statPending').textContent = s.confluencesPending ?? '-';
  document.getElementById('statTotalRecent').textContent = s.totalRecent ?? '-';
  document.getElementById('badgeConfluenceCount').textContent = s.confluencesTotal ?? '0';
}

// --- CONFLUENCE RADAR (TAB 1) ---
async function fetchConfluences() {
  try {
    const f = state.filters.confluence;
    let url = `/api/confluences?status=${encodeURIComponent(f.status)}&direction=${encodeURIComponent(f.direction)}`;
    if (f.timeframe) url += `&timeframe=${encodeURIComponent(f.timeframe)}`;
    if (f.symbol) url += `&symbol=${encodeURIComponent(f.symbol)}`;

    const res = await fetch(url);
    const json = await res.json();
    if (json.success) {
      state.confluences = json.data;
      renderConfluences();
    }
  } catch (err) {
    console.error('Error fetching confluences:', err);
  }
}

function renderConfluences() {
  const container = document.getElementById('confluenceCardsContainer');
  const empty = document.getElementById('confluenceEmptyState');
  container.innerHTML = '';

  if (!state.confluences || state.confluences.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  state.confluences.forEach(c => {
    const isBull = c.direction === 'BULLISH';
    const isConfirmed = c.status === 'CONFIRMED';
    const isPending = c.status === 'PENDING';

    // Status chip styling
    let statusBadge = '';
    if (isConfirmed) {
      statusBadge = `
        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
          <i data-lucide="check" class="h-3 w-3"></i> Confirmed
        </span>`;
    } else if (isPending) {
      statusBadge = `
        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
          <span class="h-1.5 w-1.5 rounded-full bg-purple-400 animate-ping"></span>
          <span>Pending (${c.timeRemainingStr})</span>
        </span>`;
    } else {
      statusBadge = `
        <span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
          ${c.timeRemainingStr}
        </span>`;
    }

    // Card border glow
    let glowClass = '';
    if (isConfirmed) glowClass = isBull ? 'bull-glow' : 'bear-glow';
    else if (c.goldIsRecent) glowClass = 'recent-pulse';

    // Follow-ups chips list
    let followUpsHtml = '';
    if (c.followUps && c.followUps.length > 0) {
      followUpsHtml = `
        <div class="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Follow-up Confirmations (${c.followUps.length})</span>
            <span class="text-[10px] text-emerald-400">Triggered</span>
          </div>
          <div class="space-y-1">
            ${c.followUps.map(f => `
              <div class="p-1.5 rounded bg-slate-950/70 border border-slate-800/90 flex items-center justify-between text-xs">
                <div class="flex items-center space-x-1.5">
                  <span class="font-bold ${isBull ? 'text-emerald-400' : 'text-rose-400'} font-mono">${f.indicatorType}</span>
                  <span class="text-slate-400 font-mono text-[11px] bg-slate-800 px-1 py-0.2 rounded">${f.timeframe}</span>
                  ${f.isRecent ? '<span class="text-amber-400 text-[10px]" title="Recent">⚡</span>' : ''}
                </div>
                <div class="flex items-center space-x-2 text-[11px] text-slate-400 font-mono">
                  <span>${f.signalDateStr}</span>
                  <span class="text-emerald-400 font-semibold">(+${f.hoursAfterGold}h)</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (isPending) {
      followUpsHtml = `
        <div class="mt-3 pt-3 border-t border-slate-800/80">
          <div class="p-2.5 rounded bg-purple-950/20 border border-purple-500/20 text-xs text-purple-300 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <i data-lucide="hourglass" class="h-3.5 w-3.5 text-purple-400 animate-spin"></i>
              <span>Watching for ${isBull ? 'Bullish (↑)' : 'Bearish (↓)'} BOS/CHoCH</span>
            </span>
            <span class="font-mono text-[11px] text-purple-200">${c.timeRemainingStr}</span>
          </div>
        </div>
      `;
    }

    const card = document.createElement('div');
    card.className = `bg-slate-900 border border-slate-800 rounded-xl p-4 transition hover:border-slate-700 relative cursor-pointer ${glowClass}`;
    card.onclick = () => openSetupModal(c);

    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center space-x-2">
            <h4 class="font-bold text-base text-white tracking-tight">${c.symbol}</h4>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">${c.timeframe}</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5">
            Window: <span class="font-mono text-slate-300">${c.windowDays} Days</span>
          </div>
        </div>
        ${statusBadge}
      </div>

      <!-- Gold Trigger Box -->
      <div class="mt-3 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="text-lg">${c.goldIndicator === 'G🔥' ? '🔥' : '❄'}</span>
          <div>
            <div class="text-xs font-bold ${isBull ? 'text-amber-400' : 'text-cyan-400'} flex items-center gap-1">
              <span>${c.goldIndicator} ${c.goldName}</span>
              ${c.goldIsRecent ? '<span class="text-amber-300 bg-amber-500/20 px-1 py-0.2 rounded text-[9px] font-mono border border-amber-500/40">⚡ RECENT</span>' : ''}
            </div>
            <div class="text-[11px] text-slate-400 font-mono">${c.goldDateStr}</div>
          </div>
        </div>
        <div class="text-right">
          <span class="text-[10px] font-semibold uppercase tracking-wider ${isBull ? 'text-emerald-400' : 'text-rose-400'}">${c.direction}</span>
        </div>
      </div>

      <!-- Follow ups -->
      ${followUpsHtml}
    `;

    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

function setConfluenceFilter(type, value) {
  state.filters.confluence[type] = value;

  // Update button active states
  if (type === 'status') {
    document.querySelectorAll('[id^="conf-status-"]').forEach(btn => {
      btn.className = 'conf-filter-btn px-3 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
    });
    const active = document.getElementById(`conf-status-${value}`);
    if (active) active.className = 'conf-filter-btn px-3 py-1 text-xs font-bold rounded-lg bg-amber-500 text-slate-950 transition';
  } else if (type === 'direction') {
    document.querySelectorAll('[id^="conf-dir-"]').forEach(btn => {
      btn.className = 'conf-filter-btn px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
    });
    const active = document.getElementById(`conf-dir-${value}`);
    if (active) active.className = 'conf-filter-btn px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 text-slate-950 transition';
  }

  fetchConfluences();
}

let confSearchTimeout = null;
function handleConfSearch(val) {
  clearTimeout(confSearchTimeout);
  confSearchTimeout = setTimeout(() => {
    state.filters.confluence.symbol = val.trim();
    fetchConfluences();
  }, 300);
}

// --- TRADINGVIEW MATRIX (TAB 2) ---
async function fetchMatrix() {
  try {
    const res = await fetch('/api/matrix');
    const json = await res.json();
    if (json.success) {
      state.matrix = json.data;
      renderMatrix();
    }
  } catch (err) {
    console.error('Error fetching matrix:', err);
  }
}

function renderMatrix() {
  const tbody = document.getElementById('matrixTableBody');
  tbody.innerHTML = '';

  let list = [...state.matrix];

  // Quick Filters
  const qf = state.filters.matrix.quickFilter;
  if (qf === 'recent_g_flame') {
    list = list.filter(row => {
      return ['15m', '1h', '4h', '1D'].some(tf => {
        const g = row.timeframes[tf]?.gold;
        return g && g.indicator_type === 'G🔥' && g.is_recent === 1;
      });
    });
  } else if (qf === 'recent_g_snow') {
    list = list.filter(row => {
      return ['15m', '1h', '4h', '1D'].some(tf => {
        const g = row.timeframes[tf]?.gold;
        return g && g.indicator_type === 'G❄' && g.is_recent === 1;
      });
    });
  } else if (qf === 'any_recent') {
    list = list.filter(row => row.hasAnyRecent);
  } else if (qf === 'confluence_only') {
    // Check if symbol has confirmed confluence
    const confirmedSymbols = new Set(state.confluences.filter(c => c.status === 'CONFIRMED').map(c => c.symbol));
    list = list.filter(row => confirmedSymbols.has(row.symbol));
  }

  // Symbol text filter
  const sFilter = state.filters.matrix.symbol.toLowerCase();
  if (sFilter) {
    list = list.filter(row => row.symbol.toLowerCase().includes(sFilter));
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-12 text-slate-500 text-xs">
          No symbols match the current matrix filter.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-800/70 hover:bg-slate-800/30 transition';

    // Symbol cell
    let symHtml = `
      <td class="font-bold text-white font-mono sticky left-0 z-10 bg-slate-900 border-r border-slate-800 text-xs">
        <div class="flex items-center space-x-1.5">
          <span>${row.symbol}</span>
          ${row.hasAnyRecent ? '<span class="text-amber-400 text-xs animate-pulse" title="Has recent signals">⚡</span>' : ''}
        </div>
      </td>
    `;

    // 4 timeframe cells: 15m, 1h, 4h, 1D
    ['15m', '1h', '4h', '1D'].forEach(tf => {
      const cellData = row.timeframes[tf];
      symHtml += renderMatrixCell(cellData);
    });

    tr.innerHTML = symHtml;
    tbody.appendChild(tr);
  });
}

function renderMatrixCell(cell) {
  if (!cell || (!cell.gold && !cell.vmc && !cell.rsi && !cell.structure)) {
    return `<td class="text-slate-600 text-xs font-mono">-</td>`;
  }

  const lines = [];

  // 1) Gold Signal
  if (cell.gold) {
    const g = cell.gold;
    const isBull = g.indicator_type === 'G🔥';
    const color = isBull ? 'text-amber-400' : 'text-cyan-400';
    lines.push(`
      <div class="flex items-center justify-between font-mono text-[11px] leading-tight ${g.is_recent ? 'bg-amber-500/10 rounded px-1 -mx-1 py-0.5' : ''}">
        <div class="flex items-center space-x-1 font-semibold ${color}">
          ${g.is_recent ? '<span class="text-amber-300">⚡</span>' : ''}
          <span>${g.indicator_type}</span>
        </div>
        <span class="text-slate-400 text-[10px] ml-1">${g.signal_date_str}</span>
      </div>
    `);
  }

  // 2) VMC Div
  if (cell.vmc) {
    const v = cell.vmc;
    const isBull = v.direction === 'BULLISH';
    const color = isBull ? 'text-emerald-400' : 'text-rose-400';
    lines.push(`
      <div class="flex items-center justify-between font-mono text-[11px] leading-tight ${v.is_recent ? 'bg-slate-800/80 rounded px-1 -mx-1 py-0.5' : ''}">
        <div class="flex items-center space-x-1 ${color}">
          ${v.is_recent ? '<span class="text-amber-300">⚡</span>' : ''}
          <span class="font-semibold">${v.indicator_type}</span>
        </div>
        <span class="text-slate-400 text-[10px] ml-1">${v.signal_date_str}</span>
      </div>
    `);
  }

  // 3) RSI Div
  if (cell.rsi) {
    const r = cell.rsi;
    const isBull = r.direction === 'BULLISH';
    const color = isBull ? 'text-emerald-400' : 'text-rose-400';
    lines.push(`
      <div class="flex items-center justify-between font-mono text-[11px] leading-tight ${r.is_recent ? 'bg-slate-800/80 rounded px-1 -mx-1 py-0.5' : ''}">
        <div class="flex items-center space-x-1 ${color}">
          ${r.is_recent ? '<span class="text-amber-300">⚡</span>' : ''}
          <span class="font-semibold">${r.indicator_type}</span>
        </div>
        <span class="text-slate-400 text-[10px] ml-1">${r.signal_date_str}</span>
      </div>
    `);
  }

  // 4) Structure (BOS / CHoCH)
  if (cell.structure) {
    const s = cell.structure;
    const isBull = s.direction === 'BULLISH';
    const color = isBull ? 'text-emerald-400' : 'text-rose-400';
    lines.push(`
      <div class="flex items-center justify-between font-mono text-[11px] leading-tight mt-1 pt-1 border-t border-slate-800/80 ${s.is_recent ? 'bg-slate-800/90 rounded px-1 -mx-1 py-0.5' : ''}">
        <div class="flex items-center space-x-1 font-semibold ${color}">
          ${s.is_recent ? '<span class="text-amber-300">⚡</span>' : ''}
          <span>${s.indicator_type}</span>
        </div>
        <span class="text-slate-400 text-[10px] ml-1">${s.signal_date_str}</span>
      </div>
    `);
  }

  const highlightBorder = cell.hasRecent ? 'border-amber-500/20 bg-amber-500/[0.02]' : '';

  return `
    <td class="p-2 space-y-1 align-top border-r border-slate-800/50 ${highlightBorder}">
      ${lines.join('')}
    </td>
  `;
}

function setMatrixFilter(filterKey) {
  state.filters.matrix.quickFilter = filterKey;

  document.querySelectorAll('.matrix-filter-btn').forEach(btn => {
    btn.classList.remove('ring-2', 'ring-amber-400');
  });

  const activeBtn = document.getElementById(`mf-${filterKey}`);
  if (activeBtn) activeBtn.classList.add('ring-2', 'ring-amber-400');

  renderMatrix();
}

let matrixSearchTimeout = null;
function handleMatrixSearch(val) {
  clearTimeout(matrixSearchTimeout);
  matrixSearchTimeout = setTimeout(() => {
    state.filters.matrix.symbol = val.trim();
    renderMatrix();
  }, 250);
}

// --- SIGNAL EXPLORER (TAB 3) ---
async function fetchSignals() {
  try {
    const f = state.filters.signals;
    let url = `/api/signals?limit=250`;
    if (f.indicatorType) url += `&indicatorType=${encodeURIComponent(f.indicatorType)}`;
    if (f.timeframe) url += `&timeframe=${encodeURIComponent(f.timeframe)}`;
    if (f.direction && f.direction !== 'ALL') url += `&direction=${encodeURIComponent(f.direction)}`;
    if (f.recentOnly) url += `&recentOnly=true`;
    if (f.symbol) url += `&symbol=${encodeURIComponent(f.symbol)}`;

    const res = await fetch(url);
    const json = await res.json();
    if (json.success) {
      state.signals = json.data;
      renderSignals();
    }
  } catch (err) {
    console.error('Error fetching signals:', err);
  }
}

function renderSignals() {
  const tbody = document.getElementById('signalsTableBody');
  const countLabel = document.getElementById('signalsCountLabel');
  tbody.innerHTML = '';

  countLabel.textContent = `Showing ${state.signals.length} signals`;

  if (!state.signals || state.signals.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-10 text-slate-500">
          No signals match your filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  state.signals.forEach(s => {
    const isBull = s.direction === 'BULLISH';
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 font-mono transition';

    tr.innerHTML = `
      <td class="p-3 font-bold text-white">${s.symbol}</td>
      <td class="p-3 text-slate-300 font-semibold">${s.timeframe}</td>
      <td class="p-3">
        <span class="px-2 py-0.5 rounded text-xs font-bold ${isBull ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">
          ${s.indicator_type}
        </span>
      </td>
      <td class="p-3 font-sans text-slate-300">${s.indicator_name}</td>
      <td class="p-3">
        <span class="text-[11px] font-bold ${isBull ? 'text-emerald-400' : 'text-rose-400'}">
          ${s.direction}
        </span>
      </td>
      <td class="p-3">
        ${s.is_recent ? '<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">⚡ RECENT</span>' : '<span class="text-slate-600">-</span>'}
      </td>
      <td class="p-3 text-slate-400">${s.signal_date_str}</td>
      <td class="p-3 text-slate-500 text-[11px]">${s.raw_text || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function applySignalFilters() {
  state.filters.signals.indicatorType = document.getElementById('filterIndicator').value;
  state.filters.signals.timeframe = document.getElementById('filterTimeframe').value;
  state.filters.signals.direction = document.getElementById('filterDirection').value;
  state.filters.signals.recentOnly = document.getElementById('filterRecentOnly').value === 'true';
  state.filters.signals.symbol = document.getElementById('filterSymbol').value.trim();

  fetchSignals();
}

function exportSignalsCSV() {
  if (!state.signals || state.signals.length === 0) {
    showToast('No signals to export', 'error');
    return;
  }

  const headers = ['Symbol', 'Timeframe', 'Indicator', 'Name', 'Direction', 'IsRecent', 'SignalDate', 'RawText'];
  const rows = state.signals.map(s => [
    s.symbol,
    s.timeframe,
    s.indicator_type,
    `"${s.indicator_name}"`,
    s.direction,
    s.is_recent ? 'YES' : 'NO',
    `"${s.signal_date_str}"`,
    `"${s.raw_text || ''}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `signals_export_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- TAB 4: UPLOADS & INGESTION ---
async function fetchUploads() {
  try {
    const res = await fetch('/api/uploads');
    const json = await res.json();
    if (json.success) {
      state.uploads = json.data;
      renderUploads();
    }
  } catch (err) {
    console.error('Error fetching uploads:', err);
  }
}

function renderUploads() {
  const container = document.getElementById('uploadsListContainer');
  const badge = document.getElementById('uploadsCountBadge');
  badge.textContent = `${state.uploads.length} batches`;
  container.innerHTML = '';

  if (state.uploads.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-500 text-xs">
        No uploads yet. Upload an hourly screenshot to begin!
      </div>
    `;
    return;
  }

  state.uploads.forEach(u => {
    const div = document.createElement('div');
    div.className = 'p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs';
    div.innerHTML = `
      <div class="flex items-center space-x-3">
        <div class="h-9 w-9 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold">
          #${u.id}
        </div>
        <div>
          <div class="font-medium text-slate-200">${u.header_text || u.filename}</div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">
            Uploaded: ${new Date(u.uploaded_at).toLocaleString()} | Type: <span class="text-amber-400">${u.table_type}</span>
          </div>
        </div>
      </div>
      <div class="text-right">
        <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-bold">
          +${u.signals_count} signals
        </span>
      </div>
    `;
    container.appendChild(div);
  });
}

async function processSelectedUpload() {
  if (!state.selectedFile) {
    showToast('Please select or paste an image first', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('image', state.selectedFile);

  const btn = document.getElementById('btnProcessUpload');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i> <span>Processing with AI Vision...</span>`;
  if (window.lucide) lucide.createIcons();

  const clientKey = localStorage.getItem('gemini_api_key') || '';
  const headers = {};
  if (clientKey) {
    headers['x-gemini-api-key'] = clientKey;
  }

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers,
      body: formData
    });
    const json = await res.json();

    if (json.success) {
      if (json.needsApiKey) {
        showToast('Gemini API key is required. Please save it below to continue.', 'warning');
        closeUploadModal(false); // Preserve state.selectedFile!
        openSettingsModal();
      } else {
        // Save to browser storage so user uploads are NEVER lost across Vercel serverless cold starts!
        if (json.parsedData && json.parsedData.rows) {
          try {
            const savedUploads = JSON.parse(localStorage.getItem('tv_user_uploads') || '[]');
            savedUploads.push({
              headerText: json.parsedData.headerText || '',
              referenceTime: json.parsedData.referenceTime || new Date().toISOString(),
              tableType: json.parsedData.tableType || 'AUTO',
              filename: json.file?.filename || 'uploaded_image.png',
              rows: json.parsedData.rows
            });
            localStorage.setItem('tv_user_uploads', JSON.stringify(savedUploads));
          } catch (e) {
            console.warn('LocalStorage error:', e);
          }
        }

        showToast(`Successfully extracted and merged ${json.insertedSignalsCount} signals!`, 'success');
        closeUploadModal(true);

        if (json.fullData) {
          applyFullData(json.fullData);
        } else {
          await syncUserUploads();
          await loadAllData();
        }

        switchTab('matrix');
      }
    } else {
      showToast(json.error || 'Failed to process image', 'error');
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="cpu" class="h-4 w-4"></i> <span>Parse & Merge with AI Vision</span>`;
    if (window.lucide) lucide.createIcons();
  }
}

// Sample Loader
async function loadSample(sampleId) {
  try {
    showToast(`Loading Sample ${sampleId}...`, 'info');
    const res = await fetch('/api/samples/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampleId })
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Sample data loaded (+${json.insertedSignalsCount} signals)!`, 'success');
      if (json.fullData) {
        applyFullData(json.fullData);
      } else {
        await loadAllData();
      }
    } else {
      showToast(json.error || 'Failed to load sample', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Settings
async function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  modal.classList.remove('hidden');

  const localKey = localStorage.getItem('gemini_api_key');
  if (localKey) {
    document.getElementById('inputApiKey').value = localKey;
  }

  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success && json.hasApiKey) {
      document.getElementById('inputApiKey').placeholder = `Stored: ${json.maskedKey}`;
    }
  } catch (e) {
    console.error(e);
  }
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

async function saveSettings() {
  const apiKey = document.getElementById('inputApiKey').value.trim();
  if (!apiKey) {
    showToast('Please enter an API key', 'error');
    return;
  }

  localStorage.setItem('gemini_api_key', apiKey);

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    const json = await res.json();
    if (json.success) {
      showToast('API key saved successfully!', 'success');
      closeSettingsModal();

      // If user had an image waiting to be processed, automatically resume!
      if (state.selectedFile) {
        showToast('Resuming image processing with your API key...', 'info');
        openUploadModal();
        processSelectedUpload();
      }
    }
  } catch (err) {
    showToast('Error saving settings', 'error');
  }
}

async function resetAllData() {
  if (!confirm('Are you sure you want to clear all data and reload default samples?')) {
    return;
  }

  localStorage.removeItem('tv_user_uploads');
  try {
    await fetch('/api/reset', { method: 'POST' });
    await loadSample('all');
    closeSettingsModal();
    showToast('Database reset and samples reloaded!', 'success');
  } catch (err) {
    showToast('Error resetting database', 'error');
  }
}

// Setup Details Modal
function openSetupModal(setup) {
  const modal = document.getElementById('setupModal');
  const content = document.getElementById('setupModalContent');

  const isBull = setup.direction === 'BULLISH';

  content.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <div class="flex items-center space-x-2">
            <h3 class="text-xl font-bold text-white">${setup.symbol}</h3>
            <span class="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">${setup.timeframe}</span>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">Confluence Strategy Details</p>
        </div>
        <div>
          <span class="px-3 py-1 rounded-full text-xs font-bold ${setup.status === 'CONFIRMED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'}">
            ${setup.status}
          </span>
        </div>
      </div>

      <!-- Trigger Details -->
      <div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Step 1: Gold Trigger</div>
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-2xl">${setup.goldIndicator === 'G🔥' ? '🔥' : '❄'}</span>
            <div>
              <div class="text-sm font-bold ${isBull ? 'text-amber-400' : 'text-cyan-400'}">${setup.goldIndicator} ${setup.goldName}</div>
              <div class="text-xs text-slate-400 font-mono">${setup.goldDateStr}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs font-mono text-slate-300">Window: ${setup.windowDays} Days</div>
            <div class="text-[10px] text-slate-500">Expires: ${new Date(setup.expireTimestamp).toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      <!-- Follow-up Confirmations -->
      <div class="space-y-2">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Step 2: Subsequent BOS / CHoCH Follow-Ups</div>
        ${setup.followUps && setup.followUps.length > 0 ? `
          <div class="space-y-2">
            ${setup.followUps.map(f => `
              <div class="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                    <span>${f.indicatorType}</span>
                    <span class="text-slate-400 font-sans font-normal">(${f.indicatorName})</span>
                  </div>
                  <div class="text-[11px] text-slate-400 font-mono mt-0.5">
                    Timeframe: <span class="text-white">${f.timeframe}</span> | Occurred: ${f.signalDateStr}
                  </div>
                </div>
                <div class="text-right">
                  <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">
                    +${f.hoursAfterGold}h
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 text-center text-xs text-purple-300">
            Awaiting subsequent BOS or CHoCH signal within the ${setup.windowDays}-day validity window.
          </div>
        `}
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeSetupModal() {
  document.getElementById('setupModal').classList.add('hidden');
}

// Modal Helpers
function openUploadModal() {
  document.getElementById('uploadModal').classList.remove('hidden');
}

function closeUploadModal(clearFile = true) {
  document.getElementById('uploadModal').classList.add('hidden');
  if (clearFile) {
    document.getElementById('modalPreviewContainer').classList.add('hidden');
    state.selectedFile = null;
  }
}

// Tab Switching
function switchTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.className = 'tab-button border-b-2 border-transparent text-slate-400 hover:text-slate-200 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium flex items-center space-x-2';
  });

  const content = document.getElementById(`tab-${tabName}`);
  const btn = document.getElementById(`tab-btn-${tabName}`);

  if (content) content.classList.remove('hidden');
  if (btn) btn.className = 'tab-button border-b-2 border-amber-500 text-amber-400 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold flex items-center space-x-2';

  if (tabName === 'confluence') fetchConfluences();
  if (tabName === 'matrix') fetchMatrix();
  if (tabName === 'signals') fetchSignals();
  if (tabName === 'uploads') fetchUploads();
}

function refreshCurrentTab() {
  fetchStats();
  switchTab(state.activeTab);
  showToast('Refreshed data', 'info');
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  const bgClasses = {
    info: 'bg-blue-950 text-blue-200 border-blue-800',
    success: 'bg-emerald-950 text-emerald-200 border-emerald-800',
    warning: 'bg-amber-950 text-amber-200 border-amber-800',
    error: 'bg-rose-950 text-rose-200 border-rose-800'
  };

  toast.className = `fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl border flex items-center space-x-2 transition-all ${bgClasses[type] || bgClasses.info}`;
  toast.innerHTML = `<span>${message}</span>`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}
