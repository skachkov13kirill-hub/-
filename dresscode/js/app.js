// ═══════════════════════════════════════════════════════════════
// APP.JS — Ядро приложения DressCode Финансы v5
// State, API, Cache, Navigation, Utilities
// ═══════════════════════════════════════════════════════════════

// ── CONSTANTS ──
var API_ATELIE = 'https://script.google.com/macros/s/AKfycbwYYk5LU9uTxaPhJkt8X89mXpTlfZaR8dSQcw3SNZtIws1nYRlxy_MAGErMPmO4dY_b1g/exec';
var API_FAMILY = 'https://script.google.com/macros/s/AKfycbzg1ELGJnnS7rKKFchd5y5CieOOPFZ0-KsUtCN5FcRiu_gZUoZSI6k2-kBt2Ur7d6UR/exec';
var CACHE_KEY = 'dresscode_dashboard_v5';
var CACHE_TTL = 5 * 60 * 1000;
var MONTH_NAMES = ['','январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
var MONTH_NAMES_CAP = ['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
var MONTH_NAMES_SHORT = ['','янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

// ── STATE ──
var state = {
  branches: null,
  credits: [],
  familyTx: [],
  familyExcluded: [],
  balances: [],
  settings: {},
  forecast: [],
  updatedAt: 0
};

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════
function loadCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    var c = JSON.parse(raw);
    if (Date.now() - c.updatedAt > CACHE_TTL) return null;
    return c;
  } catch(e) { return null; }
}
function saveCache(s) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// FETCH HELPERS
// ═══════════════════════════════════════════════════════════════
function fetchWithTimeout(url, timeout) {
  timeout = timeout || 15000;
  var controller = new AbortController();
  var id = setTimeout(function() { controller.abort(); }, timeout);
  return fetch(url, { signal: controller.signal }).then(function(r) {
    clearTimeout(id); return r;
  });
}

function fetchJSONP(url, timeout) {
  timeout = timeout || 20000;
  return new Promise(function(resolve, reject) {
    var cbName = 'cb_' + Math.random().toString(36).substr(2, 8) + '_' + Date.now();
    var timer = setTimeout(function() { delete window[cbName]; reject(new Error('JSONP timeout')); }, timeout);
    window[cbName] = function(response) {
      clearTimeout(timer); delete window[cbName];
      resolve(response);
    };
    var script = document.createElement('script');
    script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cbName;
    script.onerror = function() { clearTimeout(timer); delete window[cbName]; reject(new Error('JSONP error')); };
    document.head.appendChild(script);
    script.onload = function() { script.remove(); };
  });
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════
function refreshAll() {
  var btn = document.getElementById('btnRefresh');
  btn.classList.add('spinning');
  showToast('Обновление...');

  var month = new Date().getMonth() + 1;
  Promise.all([
    fetchWithTimeout(API_ATELIE + '?action=getBranches&month=' + month, 20000).then(function(r) { return r.json(); }).catch(function() { return null; }),
    fetchJSONP(API_FAMILY + '?type=credits').catch(function() { return { success: false }; }),
    fetchJSONP(API_FAMILY + '?type=transactions').catch(function() { return { success: false }; }),
    fetchWithTimeout(API_ATELIE + '?action=getBalances', 15000).then(function(r) { return r.json(); }).catch(function() { return null; }),
    fetchWithTimeout(API_ATELIE + '?action=getSettings', 15000).then(function(r) { return r.json(); }).catch(function() { return null; }),
    fetchJSONP(API_FAMILY + '?type=excluded').catch(function() { return { success: false }; })
  ]).then(function(results) {
    var branches = results[0];
    var creditsResp = results[1];
    var familyResp = results[2];
    var balancesResp = results[3];
    var settingsResp = results[4];
    var excludedResp = results[5];

    if (branches) state.branches = branches;
    if (creditsResp && creditsResp.success && creditsResp.data) state.credits = creditsResp.data;
    if (familyResp && familyResp.success && familyResp.data) state.familyTx = familyResp.data;
    if (balancesResp && balancesResp.success && balancesResp.balances) state.balances = balancesResp.balances;
    if (settingsResp && settingsResp.success && settingsResp.settings) state.settings = settingsResp.settings;
    if (excludedResp && excludedResp.success && excludedResp.data) state.familyExcluded = excludedResp.data;

    state.updatedAt = Date.now();
    saveCache(state);
    renderAll();
    showLastUpdate();
    btn.classList.remove('spinning');
    showToast('Данные обновлены');
  }).catch(function(err) {
    btn.classList.remove('spinning');
    showToast('Ошибка: ' + err.message);
  });
}

function renderAll() {
  var cm = new Date().getMonth() + 1;

  // Overview (home tab)
  if (typeof renderOverview === 'function') renderOverview();

  // Business tab
  if (state.branches) {
    if (typeof renderBizOverview === 'function') renderBizOverview(state.branches);
    if (typeof renderFilials === 'function') renderFilials(state.branches);
  }

  // Family tab
  if (typeof renderFamilyTab === 'function') renderFamilyTab();
}

function showLastUpdate() {
  if (!state.updatedAt) return;
  var d = new Date(state.updatedAt);
  var hh = String(d.getHours()).padStart(2, '0');
  var mm = String(d.getMinutes()).padStart(2, '0');
  document.getElementById('updateBadge').textContent = hh + ':' + mm;
  document.getElementById('headerSubtitle').textContent = 'Обновлено ' + hh + ':' + mm;
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function switchTab(name, btn) {
  document.querySelectorAll('.main-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  else document.getElementById('nav-' + name).classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
// OVERLAY HELPERS
// ═══════════════════════════════════════════════════════════════
function getOverlay(id) {
  var el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'overlay-bg';
    el.innerHTML = '<div class="overlay-panel"></div>';
    el.addEventListener('click', function(e) { if (e.target === el) closeOverlay(id); });
    document.body.appendChild(el);
  }
  return el;
}
function showOverlay(id) {
  document.getElementById(id).style.display = 'block';
  document.body.style.overflow = 'hidden';
}
function closeOverlay(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'none';
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function fmt(num) {
  if (!num && num !== 0) return '\u2014';
  return new Intl.NumberFormat('ru-RU').format(Math.round(num)) + '\u20BD';
}
function fmtShort(num) {
  if (!num) return '0';
  if (num < 0) return '\u2212' + fmtShort(Math.abs(num));
  if (num >= 1000000) return (num / 1000000).toFixed(1) + '\u041C\u20BD';
  if (num >= 1000) return Math.round(num / 1000) + '\u041A\u20BD';
  return Math.round(num) + '\u20BD';
}
function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
}

// Человекочитаемая дата: "3 мар", "15 янв 2025"
function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // Попробуем формат "ДД.ММ.ГГГГ"
    var parts = String(dateStr).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (parts) d = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
    else return String(dateStr);
  }
  var day = d.getDate();
  var month = d.getMonth() + 1;
  var year = d.getFullYear();
  var thisYear = new Date().getFullYear();
  var result = day + ' ' + MONTH_NAMES_SHORT[month];
  if (year !== thisYear) result += ' ' + year;
  return result;
}

// Дни до конца месяца
function daysLeftInMonth() {
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return daysInMonth - now.getDate();
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
window.onload = function() {
  var now = new Date();
  var sel = document.getElementById('bizMonthSelect');
  if (sel) sel.value = now.getMonth() + 1;

  // 1. Показать кеш если свежий
  var cached = loadCache();
  if (cached) {
    state = cached;
    renderAll();
    showLastUpdate();
    document.getElementById('headerSubtitle').textContent = 'Из кеша \u00b7 обновление...';
  }

  // 2. Загрузить кеш РСч
  if (typeof rscLoadCached === 'function') rscLoadCached();

  // 3. Загрузить свежие данные
  refreshAll();

  // 4. Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function(e) { console.log('SW:', e); });
  }
};
