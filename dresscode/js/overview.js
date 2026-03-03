// ═══════════════════════════════════════════════════════════════
// OVERVIEW.JS — Главная вкладка
// Виджет "Свободные деньги", мини-карточки, платежи, кредиты
// ═══════════════════════════════════════════════════════════════

function renderOverview() {
  var cm = new Date().getMonth() + 1;

  // Виджет "Свободные деньги"
  renderFreeMoneyWidget();

  // Мини-карточки
  renderMiniCards();

  // Платежи
  if (state.credits.length) {
    renderPaymentsCard();
  }
}

// ═══════════════════════════════════════════════════════════════
// FREE MONEY WIDGET
// ═══════════════════════════════════════════════════════════════
function renderFreeMoneyWidget() {
  var el = document.getElementById('freeMoneyContent');
  if (!el) return;

  var now = new Date();
  var cm = now.getMonth() + 1;
  var yr = now.getFullYear();
  var today = now.getDate();
  var daysInMonth = new Date(yr, cm, 0).getDate();
  var daysLeft = daysInMonth - today;
  var monthPct = Math.round(today / daysInMonth * 100);

  // 1. На счетах
  var totalOnAccounts = 0;
  if (state.balances && state.balances.length) {
    totalOnAccounts = state.balances.reduce(function(s, b) { return s + (b.balance || 0); }, 0);
  }

  // 2. Кредиты — оставшиеся платежи в этом месяце
  var creditPayments = 0;
  var totalMonthlyCredits = 0;
  var active = state.credits.filter(function(c) {
    var st = String(c.status || '');
    return st === 'Активный' || st.includes('ГРЕЙС');
  });
  active.forEach(function(c) {
    var payment = parseFloat(c.payment) || 0;
    totalMonthlyCredits += payment;
    if (c.paymentDay && c.paymentDay >= today) {
      creditPayments += payment;
    } else if (!c.paymentDay || c.paymentDay === 0) {
      creditPayments += payment;
    }
  });

  // 3. Аренда
  var rent = parseFloat(state.settings['аренда_всего']) || 396000;

  // 4. Семья (прогноз)
  var familyBudget = parseFloat(state.settings['расходы_семья']) || 300000;
  var familySpent = calcFamilySpent();
  var familyRemaining = Math.max(0, familyBudget - familySpent);

  // 5. Расходы филиалов (коммуналка + прочие)
  var perBranch = (parseFloat(state.settings['коммуналка_филиал']) || 5000)
                + (parseFloat(state.settings['прочие_филиал']) || 3000);
  var branchExpenses = perBranch * 10;

  // Итог
  var canSpend = totalOnAccounts - creditPayments - rent - familyRemaining - branchExpenses;
  var dailyCanSpend = daysLeft > 0 ? Math.round(canSpend / daysLeft) : 0;
  var isPositive = canSpend >= 0;

  var html = '';
  html += '<div class="free-money-title">\uD83D\uDCB0 Свободные деньги</div>';
  html += '<div class="free-money-total">На счетах: <strong>' + fmt(totalOnAccounts) + '</strong></div>';

  html += '<div class="free-money-row"><span class="label">\u2212 Кредиты (осталось)</span><span class="value negative">\u2212' + fmtShort(creditPayments) + '</span></div>';
  html += '<div class="free-money-row"><span class="label">\u2212 Аренда</span><span class="value negative">\u2212' + fmtShort(rent) + '</span></div>';
  html += '<div class="free-money-row"><span class="label">\u2212 Семья (прогноз)</span><span class="value negative">\u2212' + fmtShort(familyRemaining) + '</span></div>';
  html += '<div class="free-money-row"><span class="label">\u2212 Филиалы (ком. + пр.)</span><span class="value negative">\u2212' + fmtShort(branchExpenses) + '</span></div>';

  html += '<hr class="free-money-divider">';

  html += '<div class="free-money-result">';
  html += '<span>МОЖНО ТРАТИТЬ:</span>';
  html += '<span class="' + (isPositive ? 'positive' : 'negative') + '">' + fmt(canSpend) + '</span>';
  html += '</div>';

  if (daysLeft > 0 && isPositive) {
    html += '<div class="free-money-daily">' + fmtShort(dailyCanSpend) + '/день до конца месяца</div>';
  } else if (!isPositive) {
    html += '<div class="free-money-daily" style="color:#F87171;">Дефицит! Нужно сократить расходы</div>';
  }

  html += '<div class="month-progress"><div class="month-progress-fill" style="width:' + monthPct + '%;">' + monthPct + '% месяца</div></div>';

  el.innerHTML = html;
}

// Подсчёт трат семьи за текущий месяц
// Используем getAllFamilyTx() если доступна (Phase 2), иначе state.familyTx
function calcFamilySpent() {
  var now = new Date();
  var cm = now.getMonth() + 1;
  var yr = now.getFullYear();
  var currentMK = yr + '-' + String(cm).padStart(2, '0');
  var txList = (typeof getAllFamilyTx === 'function') ? getAllFamilyTx() : (state.familyTx || []);
  var spent = 0;
  txList.forEach(function(tx) {
    if (!tx.date && !tx.monthKey) return;
    var mk = tx.monthKey || (typeof famGetMonthKey === 'function' ? famGetMonthKey(tx.date) : null);
    if (!mk) {
      var d = new Date(tx.date);
      if (isNaN(d.getTime())) return;
      mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
    if (mk !== currentMK) return;
    // family system хранит расходы как positive, JSONP может дать negative
    spent += Math.abs(parseFloat(tx.amount) || 0);
  });
  return spent;
}

// ═══════════════════════════════════════════════════════════════
// MINI CARDS
// ═══════════════════════════════════════════════════════════════
function renderMiniCards() {
  var cm = new Date().getMonth() + 1;

  // ── Бизнес ──
  var bizEl = document.getElementById('miniCardBiz');
  if (bizEl && state.branches && state.branches.totals) {
    var t = state.branches.totals;
    var pct = t.performance ? t.performance.total : 0;
    var pctColor = pct >= 95 ? 'var(--green)' : pct >= 80 ? 'var(--orange)' : 'var(--red)';
    bizEl.querySelector('.mini-card-value').textContent = fmtShort(t.fact.total);
    bizEl.querySelector('.mini-card-value').style.color = '';
    var sub = bizEl.querySelector('.mini-card-sub');
    sub.innerHTML = 'План <strong style="color:' + pctColor + ';">' + pct + '%</strong>';
  }

  // ── Семья ──
  var famEl = document.getElementById('miniCardFamily');
  if (famEl) {
    var spent = calcFamilySpent();
    var budget = parseFloat(state.settings['расходы_семья']) || 300000;
    var over = spent > budget;
    famEl.querySelector('.mini-card-value').textContent = fmtShort(spent);
    famEl.querySelector('.mini-card-value').style.color = over ? 'var(--red)' : '';
    var sub = famEl.querySelector('.mini-card-sub');
    sub.textContent = 'из ' + fmtShort(budget);
  }

  // ── Кредиты ──
  var credEl = document.getElementById('miniCardCredits');
  if (credEl && state.credits.length) {
    var active = state.credits.filter(function(c) { var s = String(c.status || ''); return s === 'Активный' || s.includes('ГРЕЙС'); });
    var totalDebt = active.reduce(function(s, c) { return s + (parseFloat(c.balanceCurrent) || parseFloat(c.balanceInit) || 0); }, 0);
    var totalMonthly = active.reduce(function(s, c) { return s + (parseFloat(c.payment) || 0); }, 0);
    credEl.querySelector('.mini-card-value').textContent = fmtShort(totalDebt);
    credEl.querySelector('.mini-card-sub').textContent = fmtShort(totalMonthly) + '/мес';
  }
}

// ═══════════════════════════════════════════════════════════════
// PAYMENTS CARD
// ═══════════════════════════════════════════════════════════════
function renderPaymentsCard() {
  var now = new Date();
  var today = now.getDate();
  var cm = now.getMonth() + 1;
  document.getElementById('payMonthName').textContent = MONTH_NAMES[cm];

  var active = state.credits.filter(function(c) {
    var st = String(c.status || '');
    return st === 'Активный' || st.includes('ГРЕЙС');
  });

  var withDay = active.filter(function(c) { return c.paymentDay > 0; }).map(function(c) {
    return { name: c.name, amount: c.payment, day: c.paymentDay, isPast: c.paymentDay < today, isToday: c.paymentDay === today, daysUntil: c.paymentDay >= today ? c.paymentDay - today : 30 };
  }).sort(function(a, b) { return a.day - b.day; });

  var noDay = active.filter(function(c) { return !c.paymentDay || c.paymentDay === 0; });
  var noDayTotal = noDay.reduce(function(s, c) { return s + (c.payment || 0); }, 0);
  var totalMonthly = active.reduce(function(s, c) { return s + (c.payment || 0); }, 0);
  var remaining = withDay.filter(function(p) { return !p.isPast; }).reduce(function(s, p) { return s + p.amount; }, 0) + noDayTotal;

  var html = '';
  var next = withDay.find(function(p) { return !p.isPast; });
  if (next) {
    var cls = next.daysUntil === 0 ? 'today' : next.daysUntil <= 2 ? 'urgent' : '';
    var when = next.isToday ? 'СЕГОДНЯ!' : (next.daysUntil === 1 ? 'завтра' : 'через ' + next.daysUntil + ' дн.');
    html += '<div class="next-payment ' + cls + '"><div class="next-label">Ближайший платёж</div>';
    html += '<div class="next-info">' + next.name + ' \u2014 ' + fmt(next.amount) + '</div>';
    html += '<div class="next-date">' + next.day + ' ' + MONTH_NAMES[cm] + ' \u00b7 ' + when + '</div></div>';
  }
  html += '<div style="margin-bottom:8px;">';
  withDay.forEach(function(p) {
    var status = p.isPast ? '\u2705' : (p.isToday ? '\uD83D\uDD34' : '\u23F3');
    html += '<div class="pay-row ' + (p.isPast ? 'paid' : '') + '">';
    html += '<span class="pay-day">' + p.day + '-е</span><span class="pay-name">' + p.name + '</span>';
    html += '<span class="pay-amount">' + fmt(p.amount) + '</span><span class="pay-status">' + status + '</span></div>';
  });
  if (noDay.length > 0) {
    html += '<div class="pay-row" style="opacity:0.6;"><span class="pay-day">\u2014</span>';
    html += '<span class="pay-name">' + noDay.length + ' без указанной даты</span>';
    html += '<span class="pay-amount">' + fmtShort(noDayTotal) + '</span><span class="pay-status">\uD83D\uDCC5</span></div>';
  }
  html += '</div>';
  html += '<div style="background:var(--bg);border-radius:12px;padding:12px;font-size:13px;">';
  html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Итого в месяце:</span><strong>' + fmtShort(totalMonthly) + '</strong></div>';
  html += '<div style="display:flex;justify-content:space-between;"><span>Осталось заплатить:</span><strong style="color:var(--red);">\u2212' + fmtShort(remaining) + '</strong></div>';
  html += '</div>';
  document.getElementById('paymentsContent').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// CREDITS OVERLAY (вместо отдельной вкладки)
// ═══════════════════════════════════════════════════════════════
function openCreditsOverlay() {
  var credits = state.credits;
  if (!credits.length) {
    showToast('Кредиты не загружены');
    return;
  }

  var active = credits.filter(function(c) { var s = String(c.status || ''); return s === 'Активный' || s.includes('ГРЕЙС'); });
  var totalDebt = active.reduce(function(s, c) { return s + (parseFloat(c.balanceCurrent) || parseFloat(c.balanceInit) || 0); }, 0);
  var totalInit = active.reduce(function(s, c) { return s + (parseFloat(c.balanceInit) || 0); }, 0);
  var paidPct = totalInit > 0 ? Math.round((1 - totalDebt / totalInit) * 100) : 0;
  var totalMonthly = active.reduce(function(s, c) { return s + (parseFloat(c.payment) || 0); }, 0);

  var html = '<div class="overlay-handle"></div>';
  html += '<div style="background:linear-gradient(135deg,#1E293B,#334155);color:white;padding:16px 18px 18px;margin-top:8px;">';
  html += '<div style="font-size:18px;font-weight:800;">\uD83D\uDCB3 Кредиты</div>';
  html += '<div style="font-size:13px;opacity:0.85;margin-top:3px;">Общий долг: ' + fmtShort(totalDebt) + '</div>';
  html += '<div style="display:flex;gap:16px;margin-top:12px;">';
  html += '<div><div style="font-size:10px;opacity:0.8;">ДОЛГ</div><div style="font-size:22px;font-weight:800;">' + fmtShort(totalDebt) + '</div></div>';
  html += '<div><div style="font-size:10px;opacity:0.8;">В МЕСЯЦ</div><div style="font-size:22px;font-weight:800;color:#F87171;">' + fmtShort(totalMonthly) + '</div></div>';
  html += '<div><div style="font-size:10px;opacity:0.8;">ПОГАШЕНО</div><div style="font-size:22px;font-weight:800;color:#34D399;">' + Math.max(paidPct, 0) + '%</div></div>';
  html += '</div>';
  html += '<div style="background:rgba(255,255,255,0.15);border-radius:8px;height:8px;overflow:hidden;margin-top:10px;"><div style="height:100%;width:' + Math.max(paidPct, 0) + '%;background:#34D399;border-radius:8px;"></div></div>';
  html += '</div>';

  html += '<div style="padding:14px;">';

  // Сортируем: ГРЕЙС первые, потом по ставке
  var sorted = credits.slice().sort(function(a, b) {
    var aGrace = String(a.status || '').includes('ГРЕЙС') ? 1 : 0;
    var bGrace = String(b.status || '').includes('ГРЕЙС') ? 1 : 0;
    if (aGrace !== bGrace) return bGrace - aGrace;
    return (parseFloat(b.rate) || 0) - (parseFloat(a.rate) || 0);
  });

  sorted.forEach(function(c) {
    var balance = parseFloat(c.balanceCurrent) || parseFloat(c.balanceInit) || 0;
    var init = parseFloat(c.balanceInit) || 0;
    var rate = parseFloat(c.rate) || 0;
    var payment = parseFloat(c.payment) || 0;
    var paidPctC = init > 0 ? Math.round((1 - balance / init) * 100) : 0;
    var rateStr = rate > 1 ? rate.toFixed(1) + '%' : (rate * 100).toFixed(1) + '%';
    var isGrace = String(c.status || '').includes('ГРЕЙС');

    html += '<div class="credit-card ' + (isGrace ? 'grace' : '') + '">';
    html += '<div class="credit-top"><div class="credit-name">' + c.name + '</div><span class="credit-rate">' + rateStr + '</span></div>';
    html += '<div class="credit-amount">' + fmt(balance) + '</div>';
    if (payment > 0) html += '<div class="credit-row"><span>Платёж /мес</span><span>' + fmt(payment) + '</span></div>';
    if (c.paymentDay > 0) html += '<div class="credit-row"><span>День платежа</span><span>' + c.paymentDay + '-е число</span></div>';
    if (c.closeDate) html += '<div class="credit-row"><span>Закрытие</span><span>' + formatDate(c.closeDate) + '</span></div>';
    if (isGrace) {
      html += '<div style="margin-top:8px;"><span class="grace-badge">\u26A0\uFE0F ' + c.status + '</span></div>';
    }
    html += '<div class="credit-progress"><div class="credit-progress-fill" style="width:' + Math.max(paidPctC, 0) + '%;"></div></div>';
    html += '<div style="text-align:right;font-size:10px;color:var(--text-3);margin-top:2px;">Погашено ' + Math.max(paidPctC, 0) + '%</div>';
    html += '</div>';
  });

  html += '</div>';
  html += '<div class="overlay-close" onclick="closeOverlay(\'creditsOverlay\')">Закрыть</div>';

  var overlay = getOverlay('creditsOverlay');
  overlay.querySelector('.overlay-panel').innerHTML = html;
  showOverlay('creditsOverlay');
}
