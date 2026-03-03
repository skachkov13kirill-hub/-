// ═══════════════════════════════════════════════════════════════
// BUSINESS.JS — Вкладка "Бизнес" (филиалы + прогноз)
// ═══════════════════════════════════════════════════════════════

// ── OVERVIEW ──
function renderBizOverview(data) {
  if (!data || !data.totals) return;
  var t = data.totals;
  document.getElementById('ov-atelie').textContent = fmt(t.fact.atelie);
  document.getElementById('ov-himch').textContent = fmt(t.fact.himchistka);
  document.getElementById('ov-total').textContent = fmt(t.fact.total);
  document.getElementById('ov-clients').textContent = t.fact.clients.toLocaleString('ru-RU');
  document.getElementById('ov-profit').textContent = fmt(t.fact.profit);

  if (t.plan.total > 0) {
    document.getElementById('ov-atelie-plan').textContent = 'План: ' + fmt(t.plan.atelie) + ' (' + t.performance.atelie + '%)';
    document.getElementById('ov-himch-plan').textContent = 'План: ' + fmt(t.plan.himchistka) + ' (' + t.performance.himchistka + '%)';
    document.getElementById('ov-total-plan').textContent = 'План: ' + fmt(t.plan.total) + ' (' + t.performance.total + '%)';
  }
  if (t.fact.avgCheck) document.getElementById('ov-avg-check').textContent = 'Ср.чек: ' + fmt(t.fact.avgCheck);

  var pct = t.performance ? Math.min(t.performance.total, 100) : 0;
  document.getElementById('ov-progress').style.width = pct + '%';
  document.getElementById('ov-progress').textContent = (t.performance ? t.performance.total : 0) + '%';

  var netForecast = calcNetworkForecast(data.filials);
  if (netForecast > 0) {
    document.getElementById('ov-forecast').textContent = fmtShort(netForecast);
    var fcPct = t.plan.total > 0 ? Math.round(netForecast / t.plan.total * 100) : 0;
    document.getElementById('ov-forecast-sub').textContent = fcPct + '% плана';
  }

  document.getElementById('bizLoading').style.display = 'none';
  document.getElementById('bizOverviewContent').style.display = 'block';
}

// ── FORECAST ──
function calcNetworkForecast(filials) {
  if (!filials) return 0;
  var month = new Date().getMonth() + 1;
  return filials.reduce(function(sum, f) {
    var fc3 = calcForecast3Weeks(f.fact.total, month);
    return sum + (fc3 ? fc3.total : f.fact.total);
  }, 0);
}

function calcForecast3Weeks(factTotal, month) {
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  var daysPassed = (now.getMonth() + 1) === month ? now.getDate() : ((now.getMonth() + 1) > month ? daysInMonth : 0);
  if (daysPassed === 0) return null;
  var nonWork = (month === 1) ? 5 : 0;
  var workPassed = Math.max(1, daysPassed - (month === 1 ? Math.min(nonWork, daysPassed) : 0));
  var workTotal = daysInMonth - nonWork;
  var workLeft = workTotal - workPassed;
  var dailyAvg = factTotal / workPassed;
  return { total: Math.round(factTotal + dailyAvg * Math.max(0, workLeft)), daysPassed: workPassed, daysLeft: workLeft, daysInMonth: workTotal, note: '(' + workPassed + ' раб.дн.)' };
}

// ── FILIALS ──
function renderFilials(data) {
  var grid = document.getElementById('filialsGrid');
  grid.innerHTML = '';
  if (!data || !data.filials) return;
  var month = data.currentMonth || (new Date().getMonth() + 1);
  var nowMonth = new Date().getMonth() + 1;
  var dayOfMonth = new Date().getDate();

  var withZone = data.filials.map(function(f) {
    var perf = f.performance.total;
    var zone;
    if (dayOfMonth <= 5 && month === nowMonth) zone = 'yellow';
    else zone = perf >= 95 ? 'green' : perf >= 85 ? 'yellow' : 'red';
    return Object.assign({}, f, { zone: zone });
  });
  var sorted = [].concat(
    withZone.filter(function(f) { return f.zone === 'red'; }).sort(function(a, b) { return a.performance.total - b.performance.total; }),
    withZone.filter(function(f) { return f.zone === 'yellow'; }).sort(function(a, b) { return a.performance.total - b.performance.total; }),
    withZone.filter(function(f) { return f.zone === 'green'; }).sort(function(a, b) { return b.performance.total - a.performance.total; })
  );

  var zoneTitles = { red: '\uD83D\uDD34 Требуют внимания', yellow: '\uD83D\uDFE1 Под наблюдением', green: '\uD83D\uDFE2 Идут хорошо' };
  var lastZone = '';

  sorted.forEach(function(f, i) {
    var zone = f.zone;
    if (zone !== lastZone) {
      lastZone = zone;
      var zoneEl = document.createElement('div');
      zoneEl.style.cssText = 'font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 6px;font-weight:700;';
      zoneEl.innerHTML = zoneTitles[zone];
      grid.appendChild(zoneEl);
    }

    var perf = f.performance.total;
    var rankColor = zone === 'red' ? '#FF4D4D' : zone === 'yellow' ? '#FFAA00' : '#22C55E';
    var perfClass = zone === 'green' ? 'perf-high' : zone === 'yellow' ? 'perf-med' : 'perf-low';

    var fcHtml = '';
    if (month === nowMonth) {
      var fc3 = calcForecast3Weeks(f.fact.total, month);
      var fcTotal = fc3 ? fc3.total : f.fact.total;
      var fcPct = f.plan.total > 0 ? Math.round(fcTotal / f.plan.total * 100) : 0;
      var fcEmoji = fcPct >= 95 ? '\uD83D\uDFE2' : fcPct >= 85 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
      fcHtml = '<div style="background:#EEF2FF;padding:10px 12px;border-radius:10px;margin-top:10px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">' +
        '<div><div style="color:#7B61FF;font-weight:600;margin-bottom:2px;">\uD83D\uDD2E Прогноз</div></div>' +
        '<div style="text-align:right;"><div style="font-weight:800;font-size:14px;">' + fmt(fcTotal) + ' ' + fcEmoji + '</div><div style="font-size:10px;color:#888;">' + fcPct + '% плана</div></div></div>';
    }

    var card = document.createElement('div');
    card.className = 'filial-card';
    card.innerHTML =
      '<div class="filial-top"><div class="filial-name">' + f.name + '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;"><div style="font-size:10px;color:#A29BFE;font-weight:600;">\u25B6 аналитика</div>' +
      '<div class="filial-rank" style="background:' + rankColor + ';">#' + (i + 1) + '</div></div></div>' +
      '<div class="filial-row"><span>Ателье:</span><span>' + fmt(f.fact.atelie) + '</span></div>' +
      '<div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">План: ' + fmt(f.plan.atelie) + ' (' + f.performance.atelie + '%)</div>' +
      '<div class="filial-row"><span>Химчистка:</span><span>' + fmt(f.fact.himchistka) + '</span></div>' +
      '<div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">План: ' + fmt(f.plan.himchistka) + ' (' + f.performance.himchistka + '%)</div>' +
      '<div class="filial-row"><span><strong>ИТОГО:</strong></span><span><strong>' + fmt(f.fact.total) + '</strong></span></div>' +
      '<div class="filial-perf ' + perfClass + '">' + perf + '% от плана</div>' +
      '<div style="background:#E7F3FF;padding:8px;border-radius:8px;margin-top:8px;font-size:11px;">' +
      '<div style="display:flex;justify-content:space-between;"><span>Ср.чек:</span><strong>' + fmt(f.fact.avgCheck) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span>Прибыль:</span><strong>' + fmt(f.fact.profit) + '</strong></div></div>' + fcHtml;

    card.addEventListener('click', function() { openFilialDetail(f, month); });
    grid.appendChild(card);
  });
}

// ── FILIAL DETAIL OVERLAY ──
function openFilialDetail(f, month) {
  var overlay = getOverlay('filialOverlay');
  var perf = f.performance.total;
  var zone = perf >= 95 ? 'green' : perf >= 85 ? 'yellow' : 'red';
  var zoneColor = zone === 'green' ? '#22C55E' : zone === 'yellow' ? '#FFAA00' : '#FF4D4D';
  var nowMonth = new Date().getMonth() + 1;
  var isPast = month < nowMonth;
  var fc3 = !isPast ? calcForecast3Weeks(f.fact.total, month) : null;
  var fcTotal = fc3 ? fc3.total : f.fact.total;
  var fcPct = f.plan.total > 0 ? Math.round(fcTotal / f.plan.total * 100) : 0;

  overlay.querySelector('.overlay-panel').innerHTML =
    '<div class="overlay-handle"></div>' +
    '<div style="background:linear-gradient(135deg,#6C5CE7,#A29BFE);color:white;padding:16px 18px 18px;margin-top:8px;">' +
      '<div style="font-size:18px;font-weight:800;">' + f.name + '</div>' +
      '<div style="font-size:13px;opacity:0.85;margin-top:3px;">' + MONTH_NAMES_CAP[month] + ' 2026 \u00b7 ' + perf + '% плана' + (isPast ? ' \u00b7 закрыт' : ' \u00b7 прогноз ' + fcPct + '%') + '</div>' +
    '</div>' +
    '<div style="padding:14px;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
        '<div style="background:white;border-radius:12px;padding:12px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">Средний чек</div><div style="font-size:20px;font-weight:800;">' + fmt(f.fact.avgCheck) + '</div></div>' +
        '<div style="background:white;border-radius:12px;padding:12px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">' + (isPast ? 'Итог' : 'Прогноз') + '</div><div style="font-size:20px;font-weight:800;">' + fmtShort(fcTotal) + '</div><div style="font-size:11px;color:' + zoneColor + ';margin-top:2px;">' + fcPct + '% плана</div></div>' +
      '</div>' +
      '<div style="background:white;border-radius:14px;padding:14px;margin-bottom:12px;">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:4px;">Выручка по неделям</div>' +
        '<div id="weekRevChart"><div class="loading-box" style="padding:20px;"><div class="spinner"></div></div></div>' +
      '</div>' +
    '</div>' +
    '<div class="overlay-close" onclick="closeOverlay(\'filialOverlay\')">Закрыть</div>';

  showOverlay('filialOverlay');
  loadBranchDailyData(f, month, zoneColor);
}

function loadBranchDailyData(f, month, zoneColor) {
  fetchWithTimeout(API_ATELIE + '?action=getBranchDaily&code=' + f.code + '&month=' + month + '&year=2026', 10000)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.success && data.days && data.days.length >= 3) {
        var weeks = buildWeeksFromDays(data.days, month);
        var el = document.getElementById('weekRevChart');
        if (el) el.innerHTML = renderWeekBars(weeks, zoneColor);
      } else {
        var el = document.getElementById('weekRevChart');
        if (el) el.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--text-3);padding:20px;">Посуточные данные недоступны</div>';
      }
    })
    .catch(function() {
      var el = document.getElementById('weekRevChart');
      if (el) el.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--text-3);padding:20px;">Не удалось загрузить</div>';
    });
}

function buildWeeksFromDays(days, month) {
  var weekMap = {};
  days.forEach(function(d) {
    var dt = new Date(d.date);
    var dow = dt.getDay();
    var diff = (dow === 0) ? -6 : 1 - dow;
    var mon = new Date(dt); mon.setDate(dt.getDate() + diff);
    var key = mon.toISOString().substring(0, 10);
    if (!weekMap[key]) weekMap[key] = { total: 0, clients: 0, days: 0 };
    weekMap[key].total += d.total;
    weekMap[key].clients += d.clients;
    weekMap[key].days++;
  });
  var keys = Object.keys(weekMap).sort().slice(-6);
  return keys.map(function(key, i) {
    var w = weekMap[key];
    var check = w.clients > 0 ? Math.round(w.total / w.clients) : 0;
    var prev = i > 0 ? weekMap[keys[i - 1]].total : null;
    var pct = prev && prev > 0 ? Math.round((w.total / prev - 1) * 100) : null;
    return { label: 'Нед ' + (i + 1), val: w.total, check: check, pct: pct };
  });
}

function renderWeekBars(weeks, color) {
  var maxVal = Math.max.apply(null, weeks.map(function(w) { return w.val; }));
  return '<div style="display:flex;align-items:flex-end;gap:6px;height:100px;">' +
    weeks.map(function(w, i) {
      var h = Math.max(4, Math.round(w.val / maxVal * 80));
      var isLast = i === weeks.length - 1;
      var pctStr = w.pct !== null ? (w.pct > 0 ? '+' + w.pct + '%' : w.pct + '%') : '';
      var pctColor = w.pct > 0 ? '#22C55E' : w.pct < 0 ? '#FF4D4D' : '#888';
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">' +
        '<div style="font-size:8px;color:' + pctColor + ';font-weight:700;min-height:12px;">' + pctStr + '</div>' +
        '<div style="flex:1;display:flex;align-items:flex-end;width:100%;">' +
          '<div style="width:100%;height:' + h + 'px;background:' + (isLast ? color : '#C4B5FD') + ';border-radius:4px 4px 0 0;opacity:' + (isLast ? '1' : '0.7') + ';"></div>' +
        '</div>' +
        '<div style="font-size:7px;color:#666;">' + Math.round(w.val / 1000) + '\u041A</div>' +
        '<div style="font-size:7px;color:#888;">' + w.label + '</div></div>';
    }).join('') + '</div>';
}

// ── NETWORK DETAIL OVERLAY ──
function openNetworkDetail(metricKey) {
  if (!state.branches || !state.branches.filials) return;
  var data = state.branches;
  var METRIC = {
    atelie:   { title: 'Ателье \u2014 сеть', field: 'atelie', planField: 'atelie', fmt: 'money', color: '#6C5CE7' },
    himch:    { title: 'Химчистка \u2014 сеть', field: 'himchistka', planField: 'himchistka', fmt: 'money', color: '#0984E3' },
    total:    { title: 'Выручка итого', field: 'total', planField: 'total', fmt: 'money', color: '#00B894' },
    clients:  { title: 'Клиенты \u2014 сеть', field: 'clients', planField: 'clients', fmt: 'count', color: '#E17055' },
    profit:   { title: 'Прибыль \u2014 сеть', field: 'profit', planField: 'total', fmt: 'money', color: '#FDCB6E' },
    forecast: { title: 'Прогноз', field: null, planField: 'total', fmt: 'money', color: '#A29BFE' }
  };
  var cfg = METRIC[metricKey]; if (!cfg) return;
  var month = data.currentMonth || (new Date().getMonth() + 1);

  var rows = data.filials.map(function(f) {
    var fact = 0, plan = 0;
    if (metricKey === 'forecast') {
      var fc3 = calcForecast3Weeks(f.fact.total, month);
      fact = fc3 ? fc3.total : f.fact.total;
      plan = f.plan.total || 0;
    } else if (metricKey === 'profit') {
      fact = f.fact.profit || 0;
      plan = Math.round((f.plan.atelie || 0) * 0.5 + (f.plan.himchistka || 0) * 0.4);
    } else {
      fact = f.fact[cfg.field] || 0;
      plan = f.plan[cfg.planField] || 0;
    }
    var pct = plan > 0 ? Math.round(fact / plan * 100) : 0;
    return { name: f.name, fact: fact, plan: plan, pct: pct };
  }).sort(function(a, b) { return b.fact - a.fact; });

  var totalFact = rows.reduce(function(s, r) { return s + r.fact; }, 0);
  var totalPlan = rows.reduce(function(s, r) { return s + r.plan; }, 0);
  var totalPct = totalPlan > 0 ? Math.round(totalFact / totalPlan * 100) : 0;
  var maxFact = rows[0] ? rows[0].fact : 1;
  var fmtV = function(v) { return cfg.fmt === 'count' ? v.toLocaleString('ru-RU') : fmtShort(v); };

  var rowsHtml = rows.map(function(r) {
    var barW = maxFact > 0 ? Math.round(r.fact / maxFact * 100) : 0;
    var zc = r.pct >= 95 ? '#22C55E' : r.pct >= 85 ? '#FFAA00' : '#FF4D4D';
    return '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
      '<span style="font-size:13px;font-weight:600;">' + r.name + '</span><span style="font-size:13px;font-weight:800;">' + fmtV(r.fact) + '</span></div>' +
      '<div style="background:#F3F4F6;border-radius:6px;height:8px;overflow:hidden;margin-bottom:3px;"><div style="height:100%;width:' + barW + '%;background:' + cfg.color + ';border-radius:6px;"></div></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:10px;color:#888;"><span>план ' + fmtV(r.plan) + '</span><span style="color:' + zc + ';font-weight:700;">' + r.pct + '%</span></div></div>';
  }).join('');

  var overlay = getOverlay('networkOverlay');
  overlay.querySelector('.overlay-panel').innerHTML =
    '<div class="overlay-handle"></div>' +
    '<div style="background:linear-gradient(135deg,' + cfg.color + ',' + cfg.color + 'CC);color:white;padding:16px 18px 18px;margin-top:8px;">' +
      '<div style="font-size:18px;font-weight:800;">' + cfg.title + '</div>' +
      '<div style="font-size:13px;opacity:0.85;margin-top:3px;">' + MONTH_NAMES_CAP[month] + ' 2026 \u00b7 ' + totalPct + '% плана</div>' +
      '<div style="display:flex;gap:16px;margin-top:12px;">' +
        '<div><div style="font-size:10px;opacity:0.8;">ФАКТ</div><div style="font-size:22px;font-weight:800;">' + fmtV(totalFact) + '</div></div>' +
        '<div><div style="font-size:10px;opacity:0.8;">ПЛАН</div><div style="font-size:22px;font-weight:800;">' + fmtV(totalPlan) + '</div></div>' +
        '<div><div style="font-size:10px;opacity:0.8;">%</div><div style="font-size:22px;font-weight:800;">' + totalPct + '%</div></div>' +
      '</div>' +
      '<div style="background:rgba(255,255,255,0.2);border-radius:8px;height:8px;overflow:hidden;margin-top:10px;"><div style="height:100%;width:' + Math.min(totalPct, 100) + '%;background:white;border-radius:8px;"></div></div>' +
    '</div>' +
    '<div style="padding:14px;"><div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">По филиалам</div>' + rowsHtml + '</div>' +
    '<div class="overlay-close" onclick="closeOverlay(\'networkOverlay\')">Закрыть</div>';

  showOverlay('networkOverlay');
}

// ── LOAD BRANCHES (month selector) ──
function loadBranches() {
  var month = document.getElementById('bizMonthSelect').value;
  document.getElementById('bizLoading').style.display = 'block';
  document.getElementById('bizOverviewContent').style.display = 'none';
  document.getElementById('bizError').style.display = 'none';

  fetchWithTimeout(API_ATELIE + '?action=getBranches&month=' + month, 20000)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) throw new Error(data.error);
      state.branches = data;
      renderBizOverview(data);
      renderFilials(data);
      document.getElementById('bizLoading').style.display = 'none';
      document.getElementById('bizOverviewContent').style.display = 'block';
    })
    .catch(function(err) {
      document.getElementById('bizLoading').style.display = 'none';
      document.getElementById('bizError').style.display = 'block';
      document.getElementById('bizError').innerHTML = '<div class="error-box">' + err.message + '</div>';
    });
}

// ═══════════════════════════════════════════════════════════════
// РСч АНАЛИЗАТОР — Расчётный счёт ИП
// ═══════════════════════════════════════════════════════════════

// ── RSC CONSTANTS ──
var RSC_CATEGORIES = {
  'Переводы себе':          { emoji: '\uD83D\uDCB8', order: 1 },
  'Аренда':                 { emoji: '\uD83C\uDFE0', order: 2 },
  'Подрядчики (химчистка)': { emoji: '\uD83E\uDDF9', order: 3 },
  'Подрядчики (ателье)':    { emoji: '\uD83E\uDDF5', order: 4 },
  'Погашение кредитов':     { emoji: '\uD83D\uDCB3', order: 5 },
  'Реклама':                { emoji: '\uD83D\uDCE2', order: 6 },
  'Оплата по счетам':       { emoji: '\uD83D\uDCC4', order: 7 },
  'Налоги':                 { emoji: '\uD83D\uDCCB', order: 8 },
  'Комиссии банка':         { emoji: '\uD83C\uDFE6', order: 9 },
  'Коммуналка':             { emoji: '\uD83D\uDD27', order: 10 },
  'Расходники':             { emoji: '\uD83D\uDCE6', order: 11 },
  'Амортизация':            { emoji: '\uD83D\uDD28', order: 12 },
  'Прочее':                 { emoji: '\u2753', order: 99 }
};
var RSC_CAT_NAMES = Object.keys(RSC_CATEGORIES);

var RSC_BRANCHES = [
  'В 8', 'М 16', 'М 50', 'М 65', 'П 30', 'П 69', 'Д 21',
  'Химчистка 1', 'Химчистка 2', 'Не определён'
];

// ── RSC STATE ──
var rscData = null;
var rscCatChanges = {};
var rscMerchantMap = {};
var rscUndoStack = [];
var rscSelectedMonth = 'all';
var rscCurrentMerchant = null;

try { rscCatChanges = JSON.parse(localStorage.getItem('rsc_cats') || '{}'); } catch(e) {}
try { rscMerchantMap = JSON.parse(localStorage.getItem('rsc_merchants') || '{}'); } catch(e) {}

function rscSave() {
  localStorage.setItem('rsc_cats', JSON.stringify(rscCatChanges));
  localStorage.setItem('rsc_merchants', JSON.stringify(rscMerchantMap));
}

// ── RSC UTILITIES ──
function rscGetCat(tx) {
  return rscCatChanges[tx.id] !== undefined ? rscCatChanges[tx.id] : tx.category;
}
function rscFmtFull(n) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function rscEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── RSC UNDO ──
function rscPushUndo(action) {
  rscUndoStack.push(action);
  if (rscUndoStack.length > 50) rscUndoStack.shift();
  rscUpdateUndoBtn();
}

function rscUndo() {
  if (!rscUndoStack.length) return;
  var action = rscUndoStack.pop();
  if (action.type === 'category') {
    if (action.oldCat === null) delete rscCatChanges[action.id];
    else rscCatChanges[action.id] = action.oldCat;
    showToast('\u21A9 Отменено');
  } else if (action.type === 'merchant') {
    if (action.oldBranch === null) delete rscMerchantMap[action.merchant];
    else rscMerchantMap[action.merchant] = action.oldBranch;
    showToast('\u21A9 Отменено');
  }
  rscSave();
  renderRsc();
}

function rscUpdateUndoBtn() {
  var btn = document.getElementById('rscUndoBtn');
  if (!btn) return;
  btn.disabled = !rscUndoStack.length;
  var badge = btn.querySelector('.rsc-undo-badge');
  if (badge) badge.remove();
  if (rscUndoStack.length) {
    var b = document.createElement('span');
    b.className = 'rsc-undo-badge';
    b.textContent = rscUndoStack.length;
    btn.appendChild(b);
  }
}

// ── RSC CATEGORY CHANGE ──
function rscChangeCat(id, newCat) {
  if (!rscData) return;
  var tx = null;
  for (var i = 0; i < rscData.transactions.length; i++) {
    if (rscData.transactions[i].id === id) { tx = rscData.transactions[i]; break; }
  }
  if (!tx) return;
  var oldCat = rscCatChanges[id] !== undefined ? rscCatChanges[id] : null;
  rscPushUndo({ type: 'category', id: id, oldCat: oldCat, newCat: newCat });
  if (newCat === tx.category) delete rscCatChanges[id];
  else rscCatChanges[id] = newCat;
  rscSave();
  if (tx.contragent && newCat !== tx.category) {
    rscSyncToSheets('category', tx.contragent, newCat);
  }
  showToast('\u2713 \u2192 ' + (RSC_CATEGORIES[newCat] ? RSC_CATEGORIES[newCat].emoji : '\u2753') + ' ' + newCat);
  renderRsc();
}

// ── RSC MERCHANT MAPPING ──
function rscOpenMerchantModal(mid) {
  rscCurrentMerchant = mid;
  var overlay = getOverlay('rscMerchantOverlay');
  var btns = RSC_BRANCHES.map(function(b) {
    var isActive = rscMerchantMap[mid] === b;
    return '<button class="rsc-branch-btn' + (isActive ? ' active' : '') + '" onclick="rscSetMerchantBranch(\'' + b + '\')">' + b + '</button>';
  }).join('');
  overlay.querySelector('.overlay-panel').innerHTML =
    '<div class="overlay-handle"></div>' +
    '<div style="padding:20px;">' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">Привязать к филиалу</div>' +
      '<div style="font-size:12px;color:var(--text-3);margin-bottom:14px;">Мерчант \u2116' + mid + '</div>' +
      '<div class="rsc-branch-list">' + btns + '</div>' +
    '</div>' +
    '<div class="overlay-close" onclick="closeOverlay(\'rscMerchantOverlay\')">Отмена</div>';
  showOverlay('rscMerchantOverlay');
}

function rscSetMerchantBranch(branch) {
  if (!rscCurrentMerchant) return;
  var old = rscMerchantMap[rscCurrentMerchant] || null;
  rscPushUndo({ type: 'merchant', merchant: rscCurrentMerchant, oldBranch: old, newBranch: branch });
  rscMerchantMap[rscCurrentMerchant] = branch;
  rscSave();
  rscSyncToSheets('merchant', rscCurrentMerchant, branch);
  showToast('\u2713 \u2116' + rscCurrentMerchant + ' \u2192 ' + branch);
  closeOverlay('rscMerchantOverlay');
  renderRsc();
}

// ── RSC CLOUD SYNC ──
function rscSyncToSheets(type, key, value) {
  try {
    fetch(API_ATELIE + '?action=saveBusinessRule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, key: key, value: value }),
      mode: 'no-cors'
    });
  } catch(e) {}
}

function rscLoadRulesFromSheets() {
  try {
    var script = document.createElement('script');
    script.src = API_ATELIE + '?action=getBusinessRules&callback=rscApplyCloudRules&t=' + Date.now();
    document.head.appendChild(script);
    script.onload = function() { script.remove(); };
  } catch(e) {}
}

function rscApplyCloudRules(data) {
  if (!data || data.error || !rscData) return;
  var applied = 0;
  if (data.merchants) {
    for (var mid in data.merchants) {
      if (!rscMerchantMap[mid]) {
        rscMerchantMap[mid] = data.merchants[mid];
        applied++;
      }
    }
  }
  if (data.categories && rscData.transactions) {
    for (var key in data.categories) {
      for (var i = 0; i < rscData.transactions.length; i++) {
        var tx = rscData.transactions[i];
        if ((tx.contragent === key || tx.id == key) && rscCatChanges[tx.id] === undefined) {
          rscCatChanges[tx.id] = data.categories[key];
          applied++;
          break;
        }
      }
    }
  }
  if (applied > 0) {
    rscSave();
    renderRsc();
    showToast('\u2601\uFE0F ' + applied + ' правил из облака');
  }
}

// ── RSC MONTH FILTER ──
function rscGetMonths(txs) {
  var s = {};
  txs.forEach(function(t) {
    var parts = t.date.split('.');
    if (parts.length === 3) s[parts[2] + '-' + parts[1]] = true;
  });
  return Object.keys(s).sort();
}

function rscFilterMonth(txs) {
  if (rscSelectedMonth === 'all') return txs;
  return txs.filter(function(t) {
    var parts = t.date.split('.');
    return parts[2] + '-' + parts[1] === rscSelectedMonth;
  });
}

function rscSetMonth(m) {
  rscSelectedMonth = m;
  renderRsc();
}

// ── RSC TOGGLE ──
function rscToggle(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('open');
}

// ── RSC RENDER ──
function renderRsc() {
  var content = document.getElementById('rscContent');
  var txContent = document.getElementById('rscTxContent');
  if (!content) return;

  if (!rscData) {
    content.innerHTML = '<div class="fam-empty">Нет данных \u0420\u0421\u0447.<br>\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 JSON-\u0444\u0430\u0439\u043B \u0441 \u0442\u0440\u0430\u043D\u0437\u0430\u043A\u0446\u0438\u044F\u043C\u0438.</div>';
    if (txContent) txContent.innerHTML = '';
    return;
  }

  content.innerHTML = '';
  rscUpdateUndoBtn();

  // Period text
  var periodEl = document.getElementById('rscPeriod');
  if (periodEl && rscData.period) periodEl.textContent = rscData.period;

  // Month pills
  var months = rscGetMonths(rscData.transactions);
  var mnames = { '01':'Янв','02':'Фев','03':'Мар','04':'Апр','05':'Май','06':'Июн','07':'Июл','08':'Авг','09':'Сен','10':'Окт','11':'Ноя','12':'Дек' };
  var pills = '<button class="rsc-pill' + (rscSelectedMonth === 'all' ? ' active' : '') + '" onclick="rscSetMonth(\'all\')">Все</button>';
  months.forEach(function(m) {
    var parts = m.split('-');
    pills += '<button class="rsc-pill' + (rscSelectedMonth === m ? ' active' : '') + '" onclick="rscSetMonth(\'' + m + '\')">' + mnames[parts[1]] + ' ' + parts[0].slice(2) + '</button>';
  });
  document.getElementById('rscMonthPills').innerHTML = pills;

  // Balance bar
  var changes = Object.keys(rscCatChanges).length + Object.keys(rscMerchantMap).length;
  document.getElementById('rscBalanceBar').innerHTML =
    '<div class="rsc-bal-item"><div class="rsc-bal-label">\u0411\u0430\u043B\u0430\u043D\u0441 ' + (rscData.balance_end_date || '') + '</div><div class="rsc-bal-value" style="color:var(--primary)">' + fmtShort(rscData.balance_end || 0) + '</div></div>' +
    '<div class="rsc-bal-item"><div class="rsc-bal-label">\u041F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F</div><div class="rsc-bal-value" style="color:var(--green)">+' + fmtShort(rscData.turnover_credit || 0) + '</div></div>' +
    '<div class="rsc-bal-item"><div class="rsc-bal-label">\u0421\u043F\u0438\u0441\u0430\u043D\u0438\u044F</div><div class="rsc-bal-value" style="color:var(--red)">\u2212' + fmtShort(rscData.turnover_debit || 0) + '</div></div>' +
    '<div class="rsc-bal-item"><div class="rsc-bal-label">\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439</div><div class="rsc-bal-value" style="color:var(--primary)">' + changes + '</div></div>';

  // Commission
  var commEl = document.getElementById('rscCommission');
  if (rscData.total_commission > 0) {
    commEl.style.display = 'flex';
    commEl.innerHTML =
      '<div>\u26A0\uFE0F \u041A\u043E\u043C\u0438\u0441\u0441\u0438\u044F 0.7%: <strong style="color:var(--red);">' + rscFmtFull(rscData.total_commission) + '\u20BD</strong></div>' +
      '<div style="font-size:11px;color:var(--text-3);">\u0420\u0435\u0430\u043B\u044C\u043D\u044B\u0439: ' + fmtShort(rscData.total_real_turnover || 0) + '</div>';
  } else {
    commEl.style.display = 'none';
  }

  // Group by category
  var filtered = rscFilterMonth(rscData.transactions);
  var groups = {};
  filtered.forEach(function(t) {
    var cat = rscGetCat(t);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  });

  var sortedCats = Object.keys(groups).sort(function(a, b) {
    return ((RSC_CATEGORIES[a] || {}).order || 99) - ((RSC_CATEGORIES[b] || {}).order || 99);
  });

  var html = renderRscEkvayring();
  sortedCats.forEach(function(cat) {
    html += renderRscCatSection(cat, groups[cat]);
  });
  if (txContent) txContent.innerHTML = html;
}

function renderRscEkvayring() {
  if (!rscData || !rscData.ekvayring) return '';
  var ekv = rscData.ekvayring;
  var merchants = [];
  for (var id in ekv) merchants.push([id, ekv[id]]);
  merchants.sort(function(a, b) { return b[1].received - a[1].received; });

  var totalRec = 0, totalComm = 0, totalCount = 0, mapped = 0;
  merchants.forEach(function(m) {
    totalRec += m[1].received;
    totalComm += m[1].commission;
    totalCount += m[1].count;
    if (rscMerchantMap[m[0]]) mapped++;
  });

  var cards = merchants.map(function(m) {
    var id = m[0], d = m[1];
    var branch = rscMerchantMap[id];
    var tag = branch
      ? '<span class="rsc-tag" onclick="event.stopPropagation();rscOpenMerchantModal(\'' + id + '\')">' + branch + '</span>'
      : '<span class="rsc-tag unset" onclick="event.stopPropagation();rscOpenMerchantModal(\'' + id + '\')">+ \u0424\u0438\u043B\u0438\u0430\u043B</span>';
    return '<div class="rsc-ekv-card">' +
      '<div style="font-size:10px;color:var(--text-3);font-weight:600;">\u2116' + id + '</div>' +
      '<div style="font-size:16px;font-weight:800;color:var(--green);margin:2px 0;">' + fmtShort(d.received) + '</div>' +
      '<div style="font-size:11px;color:var(--text-3);">\u0420\u0435\u0430\u043B: ' + fmtShort(d.real_turnover) + ' <span style="color:var(--red);">(\u2212' + fmtShort(d.commission) + ')</span></div>' +
      '<div style="font-size:10px;color:var(--text-3);">' + d.count + ' \u043E\u043F. \u2022 ' + d.active_days + ' \u0434\u043D.</div>' +
      tag + '</div>';
  }).join('');

  return '<div class="rsc-section">' +
    '<div class="rsc-section-head" onclick="rscToggle(this)">' +
      '<div style="display:flex;align-items:center;gap:8px;"><span>\uD83D\uDCB0</span><span style="font-weight:700;">\u042D\u043A\u0432\u0430\u0439\u0440\u0438\u043D\u0433</span>' +
      '<span class="rsc-count">' + totalCount + ' \u0448\u0442 \u2022 ' + mapped + '/' + merchants.length + ' \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u043E</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;"><span style="font-weight:800;color:var(--green);">+' + fmtShort(totalRec) + '</span><span class="rsc-arrow">\u25BC</span></div>' +
    '</div>' +
    '<div class="rsc-section-body">' +
      '<div style="padding:8px 14px;font-size:12px;color:var(--text-3);">\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB+ \u0424\u0438\u043B\u0438\u0430\u043B\u00BB \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u0442\u044C \u043C\u0435\u0440\u0447\u0430\u043D\u0442 \u043A \u0442\u043E\u0447\u043A\u0435.</div>' +
      '<div class="rsc-ekv-grid">' + cards + '</div>' +
    '</div></div>';
}

function renderRscCatSection(catName, txs) {
  var cat = RSC_CATEGORIES[catName] || { emoji: '\u2753', order: 99 };
  var total = txs.reduce(function(s, t) { return s + t.amount; }, 0);

  var rows = txs.slice().sort(function(a, b) {
    return a.date.split('.').reverse().join('').localeCompare(b.date.split('.').reverse().join(''));
  }).map(function(t) {
    var changed = rscCatChanges[t.id] !== undefined;
    var opts = RSC_CAT_NAMES.map(function(c) {
      return '<option value="' + c + '"' + (c === catName ? ' selected' : '') + '>' + (RSC_CATEGORIES[c] ? RSC_CATEGORIES[c].emoji : '\u2753') + ' ' + c + '</option>';
    }).join('');
    return '<div class="rsc-tx">' +
      '<div class="rsc-tx-date">' + t.date + '</div>' +
      '<div class="rsc-tx-info">' +
        '<div class="rsc-tx-name">' + rscEsc(t.contragent || '\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D') + (changed ? '<span class="rsc-dot"></span>' : '') + '</div>' +
        '<div class="rsc-tx-desc" title="' + rscEsc(t.purpose) + '">' + rscEsc(t.purpose) + '</div>' +
      '</div>' +
      '<div class="rsc-tx-sum">\u2212' + rscFmtFull(t.amount) + '</div>' +
      '<div class="rsc-tx-cat"><select onchange="rscChangeCat(' + t.id + ',this.value)">' + opts + '</select></div>' +
    '</div>';
  }).join('');

  return '<div class="rsc-section">' +
    '<div class="rsc-section-head" onclick="rscToggle(this)">' +
      '<div style="display:flex;align-items:center;gap:8px;"><span>' + cat.emoji + '</span><span style="font-weight:700;">' + catName + '</span>' +
      '<span class="rsc-count">' + txs.length + '</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;"><span style="font-weight:800;color:var(--red);">\u2212' + fmtShort(total) + '</span><span class="rsc-arrow">\u25BC</span></div>' +
    '</div>' +
    '<div class="rsc-section-body">' + rows + '</div></div>';
}

// ── RSC DATA IMPORT ──
function rscOpenImport() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!data.transactions || !Array.isArray(data.transactions)) {
          showToast('\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442 JSON');
          return;
        }
        rscData = data;
        localStorage.setItem('rsc_data', JSON.stringify(data));
        renderRsc();
        rscLoadRulesFromSheets();
        showToast('\u2713 \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E ' + data.transactions.length + ' \u0442\u0440\u0430\u043D\u0437\u0430\u043A\u0446\u0438\u0439');
      } catch(err) {
        showToast('\u041E\u0448\u0438\u0431\u043A\u0430: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Load cached RSC data on startup
function rscLoadCached() {
  try {
    var raw = localStorage.getItem('rsc_data');
    if (raw) {
      rscData = JSON.parse(raw);
      renderRsc();
    }
  } catch(e) {}
}
