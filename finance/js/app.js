// Finance Helper — Main Application
// ============================================================
//  GLOBAL STATE
// ============================================================
const APP_KEY = 'financeHelper_v1';

// Deterministic hash for transaction IDs (deduplication-safe)
function txHash(bank, date, time, amount, desc, authCode) {
  const norm = (desc || '').toUpperCase().replace(/\s+/g, ' ').trim().substring(0, 40);
  const str = `${bank}_${date}_${time}_${amount}_${norm}` + (authCode ? `_${authCode}` : '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0; // Convert to 32bit int
  }
  return Math.abs(hash).toString(36);
}
let STATE = loadState();
let currentMonth = null; // 'YYYY-MM'
let currentFilter = 'all';
let currentCatFilter = null; // category name or null
let dashFilter = 'all'; // kept for compat
let dashToggles = { expenses: true, transfers: false, self: false, income: false };
let txSortMode = 'date'; // 'date' | 'amount'
let donutChart = null;

// ============================================================
//  FEATURE FLAGS & MONETIZATION
// ============================================================
const FREE_LIMITS = {
  maxMonths: 3,
  maxBanks: 1,
  exportCSV: false,
  budgets: false,
  goals: false,
  trends: false,
  familyMode: false,
  splitTransactions: false,
  shareReport: false,
  customCategories: 3,
};

const PRO_FEATURE_NAMES = {
  budgets: 'Бюджеты по категориям',
  goals: 'Финансовые цели',
  trends: 'Графики трендов',
  exportCSV: 'Экспорт в CSV',
  shareReport: 'Отправка отчётов',
  splitTransactions: 'Разделение операций',
  familyMode: 'Семейный режим',
  customCategories: 'Свои категории',
  unlimitedBanks: 'Все банки',
  extendedHistory: 'Безлимитная история',
  cloudBackup: 'Облачный бекап'
};

function isPro() {
  const plan = STATE.settings.plan || 'free';
  if (plan === 'pro') return true;
  if (plan === 'trial') {
    const start = STATE.settings.trialStartDate;
    if (!start) return false;
    const days = (Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
    return days <= (STATE.settings.trialDays || 14);
  }
  return false;
}

function getTrialDaysLeft() {
  if (STATE.settings.plan !== 'trial' || !STATE.settings.trialStartDate) return 0;
  const days = (STATE.settings.trialDays || 14) - (Date.now() - new Date(STATE.settings.trialStartDate).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(days));
}

function requirePro(featureName) {
  if (isPro()) return true;
  trackEvent('pro_modal_shown', { feature: featureName });
  showProModal(featureName);
  return false;
}

function startTrial() {
  STATE.settings.plan = 'trial';
  STATE.settings.trialStartDate = new Date().toISOString();
  STATE.settings.trialDays = 14;
  saveState();
  trackEvent('pro_trial_started');
  toast('PRO-триал активирован на 14 дней!');
  closeModal('modal-detail');
}

function showProModal(feature) {
  const title = PRO_FEATURE_NAMES[feature] || 'Эта функция';
  const trialLeft = getTrialDaysLeft();
  const trialInfo = (STATE.settings.plan === 'trial' && trialLeft > 0)
    ? '<div style="padding:8px 12px;background:var(--yellow-bg);border-radius:8px;margin-bottom:16px;font-size:0.85rem;">⏳ Триал: осталось ' + trialLeft + ' дн.</div>'
    : '';
  const trialBtn = (!STATE.settings.trialStartDate)
    ? '<button class="btn-primary" style="width:100%;padding:14px;font-size:1rem;margin-bottom:8px;background:var(--green);" onclick="startTrial()">🎁 Попробовать 14 дней бесплатно</button>'
    : '';
  showDetailModal('✨ PRO', '<div style="text-align:center;padding:20px 0;">'
    + '<div style="font-size:3rem;margin-bottom:16px;">✨</div>'
    + '<h3 style="margin-bottom:8px;">' + title + '</h3>'
    + '<p style="color:var(--text-secondary);margin-bottom:20px;">Доступно в PRO-версии</p>'
    + trialInfo
    + '<div style="text-align:left;margin-bottom:24px;">'
    + '<div style="padding:6px 0;">✅ Безлимитная история</div>'
    + '<div style="padding:6px 0;">✅ Все банки + CSV-импорт</div>'
    + '<div style="padding:6px 0;">✅ Бюджеты и цели</div>'
    + '<div style="padding:6px 0;">✅ Графики трендов</div>'
    + '<div style="padding:6px 0;">✅ Разделение и шаринг</div>'
    + '<div style="padding:6px 0;">✅ Семейный режим</div>'
    + '</div>'
    + trialBtn
    + '<button class="btn-primary" style="width:100%;padding:14px;font-size:1rem;background:var(--accent);" onclick="toast(\'Оплата скоро будет доступна\');closeModal(\'modal-detail\');">Подписаться — 199 ₽/мес</button>'
    + '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">или 1 490 ₽/год (скидка 38%)</div>'
    + '<div style="margin-top:12px;"><a href="#" onclick="closeModal(\'modal-detail\');return false;" style="color:var(--text-muted);font-size:0.85rem;">Не сейчас</a></div>'
    + '</div>');
}

// ============================================================
//  ANALYTICS — trackEvent
// ============================================================
function trackEvent(name, params) {
  try {
    if (window.ym) window.ym(window.YM_COUNTER_ID, 'reachGoal', name, params);
    const key = 'finHelper_analytics';
    const events = JSON.parse(localStorage.getItem(key) || '[]');
    events.push({ name, params: params || {}, ts: Date.now() });
    if (events.length > 500) events.splice(0, events.length - 500);
    localStorage.setItem(key, JSON.stringify(events));
  } catch(e) { /* analytics should never break the app */ }
}

function getAnalyticsSummary() {
  try {
    const events = JSON.parse(localStorage.getItem('finHelper_analytics') || '[]');
    const summary = {};
    events.forEach(function(e) { summary[e.name] = (summary[e.name] || 0) + 1; });
    return { total: events.length, events: summary, since: events.length > 0 ? new Date(events[0].ts).toLocaleDateString('ru') : '-' };
  } catch(e) { return { total: 0, events: {}, since: '-' }; }
}

function defaultState() {
  return {
    transactions: [],
    customRules: {},  // merchant -> category
    incomeRules: [],  // keywords that mark incoming transfers as salary/income
    settings: { salaryDate: 25, theme: 'light', familyMode: false },
    files: [], // loaded file names
    trash: []  // soft-deleted transactions
  };
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(APP_KEY)) || defaultState();
    // Migration: ensure trash array exists
    if (!s.trash) s.trash = [];
    if (!s.incomeRules) s.incomeRules = [];
    if (!s.smartPatterns) s.smartPatterns = [];
    if (!s.budgets) s.budgets = {};
    if (!s.goals) s.goals = [];
    if (!s.settings.dashExclude) s.settings.dashExclude = [];
    if (!s.settings.hints) s.settings.hints = {};
    if (!s.settings.plan) s.settings.plan = 'free';
    if (s.settings.trialStartDate === undefined) s.settings.trialStartDate = null;
    if (!s.settings.trialDays) s.settings.trialDays = 14;
    // Period selection (Stage 6)
    if (!s.settings.periodMode) s.settings.periodMode = 'month';
    if (s.settings.periodStart === undefined) s.settings.periodStart = null;
    if (s.settings.periodEnd === undefined) s.settings.periodEnd = null;

    // Gamification state
    if (!s.gamification) s.gamification = {
      rank: 'novice',
      monthsInBudget: 0,
      badges: [],
      streak: { current: 0, best: 0 },
      totalSaved: 0,
      monthHistory: {},   // { '2026-01': { inBudget: true, saved: 5000 }, ... }
      lastRank: null,
      rankUpPending: false // flag to show rank-up animation
    };

    // Migration v2: re-classify transfer types for existing transactions (BUG-4 fix)
    if (!s._migrationTransferV2) {
      let migrated = 0;
      for (const tx of s.transactions) {
        if (tx.category === 'Перевод себе') continue; // already correct (e.g. from autoMatch)
        const info = classifyTransferType(tx.description, tx.bankCategory, tx.type === 'income');
        if (info) {
          if (info.type !== tx.type) { tx.type = info.type; migrated++; }
          if (info.category && info.category !== tx.category) { tx.category = info.category; migrated++; }
          else if (info.type === 'transfer' && tx.category === 'Прочее') { tx.category = 'Переводы'; migrated++; }
        }
        // Also re-categorize transactions that are in 'Прочее' (BUG-3 partial fix on load)
        if (tx.category === 'Прочее') {
          const newCat = categorizeTransaction(tx.description, tx.bankCategory);
          if (newCat !== 'Прочее') { tx.category = newCat; migrated++; }
        }
      }
      s._migrationTransferV2 = true;
      if (migrated > 0) console.log(`[FinHelper] Migration v2: updated ${migrated} transactions`);
    }

    // Migration v3: re-hash txIds with normalized desc (BUG-2 fix)
    // Old txHash didn't normalize case → same tx could get different IDs → duplicates on re-upload
    if (!s._migrationHashV3) {
      const oldIds = new Set();
      let rehashed = 0;
      for (const tx of s.transactions) {
        oldIds.add(tx.id);
        // Re-compute ID with normalized hash
        const prefix = tx.id.split('_').slice(0, 3).join('_'); // e.g. "sber_25.01.2026_10:06"
        // Extract bank, date, time, amount from the stored data
        const bankPrefix = tx.bank === 'Сбербанк' ? 'sber' : tx.bank === 'Тинькофф' ? 'tink' : 'csv';
        const dateStr = tx.date ? tx.date.split('-').reverse().join('.') : '';
        const amountStr = tx.amount ? tx.amount.toString() : '';
        const newHash = txHash(bankPrefix, dateStr, tx.time || '', amountStr, tx.description || '');
        const newId = bankPrefix + '_' + dateStr + '_' + (tx.time || '') + '_' + newHash;
        if (newId !== tx.id) {
          tx._oldId = tx.id; // keep old ID for reference
          tx.id = newId;
          rehashed++;
        }
      }
      // Deduplicate after re-hashing (same new ID = duplicate)
      const seen = new Set();
      const deduped = [];
      for (const tx of s.transactions) {
        if (!seen.has(tx.id)) {
          seen.add(tx.id);
          deduped.push(tx);
        }
      }
      const removed = s.transactions.length - deduped.length;
      s.transactions = deduped;
      s._migrationHashV3 = true;
      if (rehashed > 0 || removed > 0) console.log(`[FinHelper] Migration v3: rehashed ${rehashed}, removed ${removed} duplicates`);
    }

    // Migration v4: clean descriptions (strip processing dates) + re-hash (FIX-1/FIX-2)
    // Old descriptions included processing dates like "07.03.2026 KOPILKA KARTA-VKLAD"
    // This caused different hashes when overlapping PDFs were uploaded → phantom duplicates
    if (!s._migrationHashV4) {
      let cleaned = 0;
      for (const tx of s.transactions) {
        // Clean description: strip leading processing date
        if (tx.description) {
          const oldDesc = tx.description;
          const newDesc = oldDesc.replace(/^\d{2}\.\d{2}\.\d{4}\s+/, '');
          if (newDesc !== oldDesc) {
            tx.description = newDesc;
            if (tx.merchant === oldDesc || !tx.merchant) tx.merchant = newDesc;
            cleaned++;
          }
        }
        // Re-hash with cleaned desc (authCode empty for old transactions)
        const bankPrefix = tx.bank === 'Сбербанк' ? 'sber' : tx.bank === 'Тинькофф' ? 'tink' : 'csv';
        const dateStr = tx.date ? tx.date.split('-').reverse().join('.') : '';
        const amountStr = tx.amount ? tx.amount.toString() : '';
        const newHash = txHash(bankPrefix, dateStr, tx.time || '', amountStr, tx.description || '', tx.authCode || '');
        const newId = bankPrefix + '_' + dateStr + '_' + (tx.time || '') + '_' + newHash;
        if (newId !== tx.id) {
          tx._oldIdV3 = tx.id;
          tx.id = newId;
          cleaned++;
        }
      }
      // Deduplicate after re-hashing
      const seen = new Set();
      const deduped = [];
      for (const tx of s.transactions) {
        if (!seen.has(tx.id)) {
          seen.add(tx.id);
          deduped.push(tx);
        }
      }
      const removed = s.transactions.length - deduped.length;
      s.transactions = deduped;
      s._migrationHashV4 = true;
      if (cleaned > 0 || removed > 0) console.log(`[FinHelper] Migration v4: cleaned ${cleaned}, removed ${removed} duplicates`);
    }

    // Migration v5: re-classify BRANCH KARTA-CREDIT as 'Перевод себе' (FIX-3)
    if (!s._migrationTransferV5) {
      let fixed = 0;
      for (const tx of s.transactions) {
        if (tx.category !== 'Перевод себе') {
          const upper = (tx.description || '').toUpperCase();
          if (upper.includes('KARTA-CREDIT') || upper.includes('KARTA CREDIT') ||
              upper.includes('BRANCH KARTA-CREDIT') || upper.includes('BRANCH KARTA CREDIT') ||
              upper.includes('ПОГАШЕНИЕ КРЕДИТА') || upper.includes('ПОГАШЕНИЕ КРЕДИТНОЙ')) {
            tx.category = 'Перевод себе';
            tx.type = 'transfer';
            fixed++;
          }
        }
      }
      s._migrationTransferV5 = true;
      if (fixed > 0) console.log(`[FinHelper] Migration v5: reclassified ${fixed} KARTA-CREDIT transactions`);
    }

    // Migration v6: remove paired duplicate transfers (FIX-6)
    // Same authCode+date+time+amount = bank reported one operation as two lines
    if (!s._migrationPairedDedupV6) {
      const byAuthKey = new Map();
      for (const tx of s.transactions) {
        if (!tx.authCode || tx.authCode === '000000') continue;
        const key = tx.authCode + '|' + tx.date + '|' + tx.time + '|' + tx.amount;
        if (!byAuthKey.has(key)) byAuthKey.set(key, []);
        byAuthKey.get(key).push(tx);
      }
      const removeIds = new Set();
      for (const [key, group] of byAuthKey) {
        if (group.length < 2) continue;
        let best = group[0];
        for (let k = 1; k < group.length; k++) {
          const curr = group[k];
          const bestDesc = (best.description || '').toUpperCase();
          const currDesc = (curr.description || '').toUpperCase();
          const bestHuman = /^ПЕРЕВОД (ДЛЯ|ОТ) /.test(bestDesc);
          const currHuman = /^ПЕРЕВОД (ДЛЯ|ОТ) /.test(currDesc);
          if (currHuman && !bestHuman) best = curr;
          else if (!currHuman && !bestHuman && currDesc.length > bestDesc.length) best = curr;
        }
        for (const tx of group) {
          if (tx !== best) removeIds.add(tx.id);
        }
      }
      if (removeIds.size > 0) {
        s.transactions = s.transactions.filter(tx => !removeIds.has(tx.id));
        console.log(`[FinHelper] Migration v6: removed ${removeIds.size} paired duplicate transfers`);
      }
      s._migrationPairedDedupV6 = true;
    }

    // Migration v7: re-categorize with improved MERCHANT_RULES (FIX-7)
    // Only re-categorize transactions that are still 'Прочее' and haven't been manually changed
    if (!s._migrationRecatV7) {
      let recat = 0;
      for (const tx of s.transactions) {
        if (tx.category !== 'Прочее') continue;
        if (tx._userEdited) continue; // don't touch manually categorized
        const newCat = categorizeTransaction(tx.description, tx.bankCategory);
        if (newCat !== 'Прочее') {
          tx.category = newCat;
          // Update type if needed
          if (newCat === 'Наличные расход') tx.type = 'expense';
          if (newCat === 'Перевод себе') tx.type = 'transfer';
          recat++;
        }
      }
      s._migrationRecatV7 = true;
      if (recat > 0) console.log(`[FinHelper] Migration v7: re-categorized ${recat} transactions from Прочее`);
    }

    // Migration v8: apply incomeRules to reclassify incoming transfers as 'Зарплата' (FIX-8)
    if (!s._migrationSalaryV8 && s.incomeRules && s.incomeRules.length > 0) {
      let fixed = 0;
      for (const tx of s.transactions) {
        if (tx._userEdited) continue;
        if (tx.type === 'expense') continue;
        const upper = (tx.description || '').toUpperCase();
        const isOutgoing = upper.includes('ПЕРЕВОД ДЛЯ') || upper.includes('ПЕРЕВОД НА ');
        if (isOutgoing) continue;
        for (const rule of s.incomeRules) {
          if (upper.includes(rule.toUpperCase()) && tx.category !== 'Зарплата') {
            tx.category = 'Зарплата';
            tx.type = 'income';
            fixed++;
            break;
          }
        }
      }
      s._migrationSalaryV8 = true;
      if (fixed > 0) console.log(`[FinHelper] Migration v8: reclassified ${fixed} transfers as Зарплата`);
    }

    // Migration v9: ATM income → transfer (FIX-9)
    if (!s._migrationAtmV9) {
      let fixed = 0;
      for (const tx of s.transactions) {
        if (tx.type !== 'income') continue;
        const upper = (tx.description || '').toUpperCase();
        if (upper.includes('ATM ') || upper.includes('ATM_') || upper.includes('БАНКОМАТ') || upper.includes('CASH WITHDRAWAL') || upper.includes('СНЯТИЕ НАЛИЧНЫХ')) {
          tx.type = 'transfer';
          tx.category = 'Перевод себе';
          fixed++;
        }
      }
      s._migrationAtmV9 = true;
      if (fixed > 0) console.log(`[FinHelper] Migration v9: reclassified ${fixed} ATM income as transfers`);
    }

    // Migration v10: fix type for transfer categories (12.7M false expenses)
    if (!s._migrationTransferTypeV10) {
      let fixed = 0;
      const transferCats = new Set(['Перевод себе', 'Переводы']);
      for (const tx of s.transactions) {
        if (transferCats.has(tx.category) && tx.type === 'expense') {
          tx.type = 'transfer';
          fixed++;
        }
      }
      s._migrationTransferTypeV10 = true;
      if (fixed > 0) console.log(`[FinHelper] Migration v10: fixed ${fixed} transfer types`);
    }

    // Migration v11: re-categorize «Прочее» with new merchant rules + business contacts
    if (!s._migrationRecatV11) {
      let fixed = 0;
      for (const tx of s.transactions) {
        if (tx.category !== 'Прочее' || tx._userEdited) continue;
        const newCat = categorizeTransaction(tx.description, tx.bankCategory);
        if (newCat && newCat !== 'Прочее') {
          tx.category = newCat;
          fixed++;
        }
      }
      s._migrationRecatV11 = true;
      if (fixed > 0) console.log(`[FinHelper] Migration v11: re-categorized ${fixed} transactions from Прочее`);
    }

    return s;
  }
  catch(e) { return defaultState(); }
}
function saveState() {
  localStorage.setItem(APP_KEY, JSON.stringify(STATE));
}

// ============================================================
//  THEME
// ============================================================
function applyTheme() {
  const t = STATE.settings.theme;
  document.documentElement.setAttribute('data-theme', t);
  const tog = document.getElementById('theme-toggle');
  if (tog) tog.classList.toggle('active', t === 'dark');
}
function toggleTheme() {
  STATE.settings.theme = STATE.settings.theme === 'dark' ? 'light' : 'dark';
  saveState(); applyTheme();
}
applyTheme();

// ============================================================
//  NAVIGATION
// ============================================================
function showScreen(name) {
  // If no data and trying to go to dashboard/etc — show onboarding
  if (STATE.transactions.length === 0 && name !== 'settings') {
    name = 'onboarding';
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-screen="${name}"]`);
  if (navItem) navItem.classList.add('active');

  // Show/hide FAB add button
  const fab = document.getElementById('fab-add');
  if (fab) fab.classList.toggle('visible', name === 'transactions' || name === 'dashboard');

  trackEvent('screen_view', { screen: name });
  if (name === 'dashboard') renderDashboard();
  if (name === 'transactions') renderTransactions();
  if (name === 'advisor') renderAdvisor();
  if (name === 'analytics') renderAnalytics();
  if (name === 'calendar') { renderCalendar(); renderTrends(); }
  if (name === 'settings') { renderSettings(); renderDebtsSection(); renderTrash(); renderRules(); renderBudgets(); renderGoals(); getStorageUsage(); renderProStatus(); }
  // Contextual hints for first use
  checkHints(name);
}

// ============================================================
//  TOAST
// ============================================================
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ============================================================
//  MERCHANT CATEGORIZATION
// ============================================================
const CATEGORIES = {
  'Продукты': { emoji: '🛒', color: '#00B894' },
  'Еда вне дома': { emoji: '🍕', color: '#E17055' },
  'Транспорт': { emoji: '🚗', color: '#74B9FF' },
  'Жильё': { emoji: '🏠', color: '#6C5CE7' },
  'Одежда': { emoji: '👕', color: '#FD79A8' },
  'Здоровье': { emoji: '💊', color: '#55EFC4' },
  'Подписки и связь': { emoji: '📱', color: '#A29BFE' },
  'Развлечения': { emoji: '🎮', color: '#FFEAA7' },
  'Дети': { emoji: '👶', color: '#FAB1A0' },
  'Образование': { emoji: '🎓', color: '#81ECEC' },
  'Кредиты': { emoji: '💳', color: '#636E72' },
  'Маркетплейсы': { emoji: '📦', color: '#DFE6E9' },
  'Красота': { emoji: '💅', color: '#E84393' },
  'Переводы': { emoji: '💸', color: '#B2BEC3' },
  'Автомобиль': { emoji: '⛽', color: '#2D3436' },
  'Коммуналка': { emoji: '🏢', color: '#0984E3' },
  'Прочее': { emoji: '📥', color: '#636E72', displayName: 'Разобрать' },
  'Долг выдан': { emoji: '🤝', color: '#FDCB6E' },
  'Долг возврат': { emoji: '💰', color: '#00B894' },
  'Наличные расход': { emoji: '💵', color: '#E17055' },
  'Наличные доход': { emoji: '💵', color: '#00B894' },
  'Зарплата': { emoji: '💼', color: '#00B894' },
  'Перевод себе': { emoji: '🔄', color: '#74B9FF' },
  'Дом': { emoji: '🏡', color: '#636E72' },
  'Животные': { emoji: '🐾', color: '#FAB1A0' },
  'Путешествия': { emoji: '✈️', color: '#74B9FF' },
  'Электроника': { emoji: '📱', color: '#A29BFE' },
  'Страхование': { emoji: '🛡️', color: '#DFE6E9' },
  'Благотворительность': { emoji: '❤️', color: '#E84393' },
};

const MERCHANT_RULES = [
  // --- Продукты ---
  { patterns: ['PYATEROCHKA','ПЯТЕРОЧКА','ПЯТЁРОЧКА','5KA','PYATYOROCHKA'], cat: 'Продукты' },
  { patterns: ['MAGNIT','МАГНИТ'], cat: 'Продукты' },
  { patterns: ['PEREKRESTOK','ПЕРЕКРЁСТОК','ПЕРЕКРЕСТОК','PEREKRYOSTOK'], cat: 'Продукты' },
  { patterns: ['LENTA','ЛЕНТА'], cat: 'Продукты' },
  { patterns: ['VKUSVILL','ВКУСВИЛЛ','ВКУС ВИЛЛ'], cat: 'Продукты' },
  { patterns: ['DIKSI','ДИКСИ'], cat: 'Продукты' },
  { patterns: ['AUCHAN','АШАН'], cat: 'Продукты' },
  { patterns: ['METRO CASH','МЕТРО КЭШ'], cat: 'Продукты' },
  { patterns: ['SAMOKAT','САМОКАТ'], cat: 'Продукты' },
  { patterns: ['AZBUKA','АЗБУКА ВКУСА'], cat: 'Продукты' },
  { patterns: ['KRASNOE','КРАСНОЕ И БЕЛОЕ','КРАСНОЕ&БЕЛОЕ','KRASNOEIBELOE'], cat: 'Продукты' },
  { patterns: ['BRISTOL','БРИСТОЛЬ'], cat: 'Продукты' },
  { patterns: ['FIXPRICE','FIX PRICE','ФИКС ПРАЙС','ФИКСПРАЙС'], cat: 'Продукты' },
  { patterns: ['GLOBUS','ГЛОБУС'], cat: 'Продукты' },
  { patterns: ['SPAR','СПАР'], cat: 'Продукты' },
  { patterns: ['ВЕРНЫЙ','VERNIY','VERNY'], cat: 'Продукты' },
  { patterns: ['BILLA','БИЛЛА'], cat: 'Продукты' },
  { patterns: ['PRISMA','ПРИЗМА'], cat: 'Продукты' },
  { patterns: ['OKEY','О\'КЕЙ','ОКЕЙ'], cat: 'Продукты' },
  { patterns: ['ТАБАКО','TABAKO'], cat: 'Продукты' },
  { patterns: ['МЯСН','MYASN'], cat: 'Продукты' },
  { patterns: ['BAKERY','ПЕКАРНЯ','ХЛЕБ'], cat: 'Продукты' },
  { patterns: ['LAVKA','ЛАВКА','YANDEX*LAVKA','ЯНДЕКС*ЛАВКА','YANDEX*5411*LAVKA'], cat: 'Продукты' },
  { patterns: ['SBERMARKET','СБЕРМАРКЕТ'], cat: 'Продукты' },
  { patterns: ['VPROK','ВПРОК'], cat: 'Продукты' },

  // --- Еда вне дома ---
  { patterns: ['YANDEX EDA','ЯНДЕКС ЕДА','YANDEX*EDA'], cat: 'Еда вне дома' },
  { patterns: ['DELIVERY','ДЕЛИВЕРИ'], cat: 'Еда вне дома' },
  { patterns: ['MCDONALD','МАКДОНАЛД','ВКУСНО И ТОЧКА','VKUSNO I TOCHKA'], cat: 'Еда вне дома' },
  { patterns: ['KFC','КФС'], cat: 'Еда вне дома' },
  { patterns: ['BURGER KING','БУРГЕР КИНГ'], cat: 'Еда вне дома' },
  { patterns: ['DODO','ДОДО'], cat: 'Еда вне дома' },
  { patterns: ['SUSHI','СУШИ'], cat: 'Еда вне дома' },
  { patterns: ['STARBUCKS','СТАРБАКС'], cat: 'Еда вне дома' },
  { patterns: ['ШОКОЛАДНИЦА','SHOKOLADNICA'], cat: 'Еда вне дома' },
  { patterns: ['COFFEE','КОФЕ','COFIX','КОФИКС'], cat: 'Еда вне дома' },
  { patterns: ['ПИЦЦА','PIZZA','ПИЦЦЕРИЯ'], cat: 'Еда вне дома' },
  { patterns: ['ШАВЕРМА','SHAVERMA','ШАУРМА','SHAWARMA','ДЖУДОС','JUDOS'], cat: 'Еда вне дома' },
  { patterns: ['РЕСТОРАН','RESTORAN','RESTAURANT'], cat: 'Еда вне дома' },
  { patterns: ['КАФЕ','CAFE','СТОЛОВАЯ'], cat: 'Еда вне дома' },
  { patterns: ['BAR ','БАР ','ПАСТА','PASTA'], cat: 'Еда вне дома' },
  { patterns: ['ТЕРЕМОК','TEREMOK'], cat: 'Еда вне дома' },
  { patterns: ['SUBWAY','САБВЕЙ'], cat: 'Еда вне дома' },
  { patterns: ['FUDTRAK','ФУДТРАК'], cat: 'Еда вне дома' },

  // --- Транспорт ---
  { patterns: ['YANDEX TAXI','ЯНДЕКС ТАКСИ','YANDEX*TAXI','YANDEX GO'], cat: 'Транспорт' },
  { patterns: ['UBER','УБЕР'], cat: 'Транспорт' },
  { patterns: ['CITIMOBIL','СИТИМОБИЛ'], cat: 'Транспорт' },
  { patterns: ['YANDEX DRIVE','ЯНДЕКС ДРАЙВ','DELIMOBIL','ДЕЛИМОБИЛЬ'], cat: 'Транспорт' },
  { patterns: ['RZD','РЖД','RZHDRU'], cat: 'Транспорт' },
  { patterns: ['AEROFLOT','АЭРОФЛОТ','S7','ПОБЕДА','POBEDA'], cat: 'Транспорт' },
  { patterns: ['METRO','МЕТРО','МЕТРОПОЛИТЕН','TROIKA','ТРОЙКА'], cat: 'Транспорт' },
  { patterns: ['PARKING','ПАРКОВКА'], cat: 'Транспорт' },

  // --- Автомобиль ---
  { patterns: ['LUKOIL','ЛУКОЙЛ'], cat: 'Автомобиль' },
  { patterns: ['GAZPROM','ГАЗПРОМ'], cat: 'Автомобиль' },
  { patterns: ['ROSNEFT','РОСНЕФТЬ'], cat: 'Автомобиль' },
  { patterns: ['TATNEFT','ТАТНЕФТЬ'], cat: 'Автомобиль' },
  { patterns: ['SHELL','ШЕЛЛ'], cat: 'Автомобиль' },
  { patterns: ['AZS','АЗС','БЕНЗИН','BENZIN'], cat: 'Автомобиль' },
  { patterns: ['АВТОМОЙКА','AVTOMOYKA','МОЙКА','MOYKA'], cat: 'Автомобиль' },
  { patterns: ['TROFIMOV','ТРОФИМОВ'], cat: 'Автомобиль' }, // из выписки — шиномонтаж
  { patterns: ['11180 KAD','TOLL','ПЛАТНАЯ ДОРОГА','АВТОДОР','AVTODOR','NOTHERN CAPITAL'], cat: 'Автомобиль' },

  // --- Подписки и связь ---
  { patterns: ['MTS','МТС','PAY.MTS'], cat: 'Подписки и связь' },
  { patterns: ['BEELINE','БИЛАЙН'], cat: 'Подписки и связь' },
  { patterns: ['MEGAFON','МЕГАФОН'], cat: 'Подписки и связь' },
  { patterns: ['TELE2','ТЕЛЕ2'], cat: 'Подписки и связь' },
  { patterns: ['ROSTELEKOM','РОСТЕЛЕКОМ'], cat: 'Подписки и связь' },
  { patterns: ['NETFLIX'], cat: 'Подписки и связь' },
  { patterns: ['KINOPOISK','КИНОПОИСК'], cat: 'Подписки и связь' },
  { patterns: ['IVI','ИВИ'], cat: 'Подписки и связь' },
  { patterns: ['OKKO','ОККО'], cat: 'Подписки и связь' },
  { patterns: ['YANDEX PLUS','ЯНДЕКС ПЛЮС','YA.PLUS'], cat: 'Подписки и связь' },
  { patterns: ['SPOTIFY'], cat: 'Подписки и связь' },
  { patterns: ['YOUTUBE PREMIUM','YOUTUBE PREM'], cat: 'Подписки и связь' },
  { patterns: ['APPLE.COM','APPLE STORE','ITUNES'], cat: 'Подписки и связь' },
  { patterns: ['GOOGLE*','GOOGLE PLAY','GOOGLEPLAY'], cat: 'Подписки и связь' },
  { patterns: ['T-MOBILE','T-BUNDLE','TMMB.T-MOBILE'], cat: 'Подписки и связь' },
  { patterns: ['SMOTRESHKA','СМОТРЁШКА'], cat: 'Подписки и связь' },
  { patterns: ['DEDVPN','VPN'], cat: 'Подписки и связь' },
  { patterns: ['УЮТ ТЕЛЕКОМ','UYT TELEKOM'], cat: 'Подписки и связь' },

  // --- Маркетплейсы ---
  { patterns: ['OZON','ОЗОН'], cat: 'Маркетплейсы' },
  { patterns: ['WILDBERRIES','ВАЙЛДБЕРРИЗ','WB'], cat: 'Маркетплейсы' },
  { patterns: ['YANDEX MARKET','ЯНДЕКС МАРКЕТ','YA.MARKET'], cat: 'Маркетплейсы' },
  { patterns: ['ALIEXPRESS','АЛИЭКСПРЕСС','ALI'], cat: 'Маркетплейсы' },
  { patterns: ['LAMODA','ЛАМОДА'], cat: 'Маркетплейсы' },
  { patterns: ['SBERMEGAMARKET','СБЕРМЕГАМАРКЕТ','MEGAMARKET'], cat: 'Маркетплейсы' },
  { patterns: ['AVITO','АВИТО','TBANK-AVITO'], cat: 'Маркетплейсы' },

  // --- Здоровье ---
  { patterns: ['APTEKA','АПТЕКА','PHARMACY','ФАРМАЦИЯ'], cat: 'Здоровье' },
  { patterns: ['GORZDRAV','ГОРЗДРАВ'], cat: 'Здоровье' },
  { patterns: ['RIGLA','РИГЛА'], cat: 'Здоровье' },
  { patterns: ['STOLICHKI','СТОЛИЧКИ'], cat: 'Здоровье' },
  { patterns: ['36.6','366'], cat: 'Здоровье' },
  { patterns: ['CLINIC','КЛИНИКА','DENTAL','СТОМАТОЛ','МЕДИЦИН','MEDIC'], cat: 'Здоровье' },
  { patterns: ['INVITRO','ИНВИТРО','HELIX','ХЕЛИКС'], cat: 'Здоровье' },

  // --- Красота ---
  { patterns: ['ATRIBEAUTE','BEAUTY','КРАСОТ','САЛОН','БАРБЕР','BARBER'], cat: 'Красота' },
  { patterns: ['ПАРИКМАХ','HAIRDRESS','НОГТ','NAIL','МАНИКЮР'], cat: 'Красота' },
  { patterns: ['COSMETIC','КОСМЕТИК','ЗОЛОТОЕ ЯБЛОКО','LUSH','РИВА','RIVE'], cat: 'Красота' },

  // --- Одежда ---
  { patterns: ['ZARA','ЗАРА'], cat: 'Одежда' },
  { patterns: ['H&M','H AND M','HM '], cat: 'Одежда' },
  { patterns: ['UNIQLO','ЮНИКЛО'], cat: 'Одежда' },
  { patterns: ['GLORIA','ГЛОРИЯ'], cat: 'Одежда' },
  { patterns: ['SPORTMASTER','СПОРТМАСТЕР'], cat: 'Одежда' },
  { patterns: ['DECATHLON','ДЕКАТЛОН'], cat: 'Одежда' },
  { patterns: ['RESERVED','BERSHKA','PULL&BEAR','STRADIVARIUS'], cat: 'Одежда' },
  { patterns: ['ADIDAS','NIKE','PUMA','REEBOK'], cat: 'Одежда' },

  // --- Жильё ---
  { patterns: ['IPOTEKA','ИПОТЕКА','MORTGAGE'], cat: 'Жильё' },
  { patterns: ['ARENDA','АРЕНДА','RENT'], cat: 'Жильё' },

  // --- Коммуналка ---
  { patterns: ['GIS ZKH','ГИС ЖКХ','ЖКХ','KOMMUNAL','КОММУНАЛ','EPR_GIS'], cat: 'Коммуналка' },
  { patterns: ['ЭЛЕКТРИЧЕСТВО','ЭЛЕКТРОЭНЕРГ','TGK','ТГК','МОСЭНЕРГ','ЭНЕРГО'], cat: 'Коммуналка' },
  { patterns: ['ВОДОКАНАЛ','ВОДОСН'], cat: 'Коммуналка' },

  // --- Развлечения ---
  { patterns: ['CINEMA','КИНО','КИНОТЕАТР','КАРО','KARO','СИНЕМА'], cat: 'Развлечения' },
  { patterns: ['GAME','GAMING','STEAM','PLAYSTATION','XBOX'], cat: 'Развлечения' },
  { patterns: ['CONCERT','КОНЦЕРТ','ТЕАТР','THEATER','МУЗЕЙ','MUSEUM'], cat: 'Развлечения' },
  { patterns: ['AIJORA'], cat: 'Развлечения' },
  { patterns: ['LOGICLIKE'], cat: 'Дети' },

  // --- Дети ---
  { patterns: ['ДЕТСКИЙ','DETSKI','KIDS','MOTHERCARE'], cat: 'Дети' },
  { patterns: ['ДОЧКИ-СЫНОЧКИ','КОРАБЛИК','KORABLIK'], cat: 'Дети' },

  // --- Образование ---
  { patterns: ['COURSE','КУРС','SKILLBOX','SKILLFACTORY','GEEKBRAINS','НЕТОЛОГИЯ'], cat: 'Образование' },

  // --- Дом ---
  { patterns: ['LEROY','ЛЕРУА','ЛЕМАНА','LEMANAPRO'], cat: 'Дом' },
  { patterns: ['IKEA','ИКЕА','HOFF','ХОФФ'], cat: 'Дом' },
  { patterns: ['OBI','ОБИ'], cat: 'Дом' },
  { patterns: ['ASKONA','АСКОНА','LAZURIT','ЛАЗУРИТ'], cat: 'Дом' },
  { patterns: ['PETROVICH','ПЕТРОВИЧ','СТРОЙМАТЕРИАЛ'], cat: 'Дом' },
  { patterns: ['CASTORAMA','КАСТОРАМА','MAXIDOM','МАКСИДОМ'], cat: 'Дом' },
  { patterns: ['SPB_NEBO','TRC NEBO','ТРЦ НЕБО','NEBO'], cat: 'Дом' },
  { patterns: ['AFONYA','АФОНЯ'], cat: 'Дом' },
  { patterns: ['МЕБЕЛЬ','MEBELSHIK','FURNITURE','МИРОНИКА'], cat: 'Дом' },
  { patterns: ['УБОРКА','CLEANING','КЛИНИН','ХИМЧИСТ','ПРАЧЕЧН','LAUNDRY'], cat: 'Дом' },

  // --- Животные ---
  { patterns: ['ЧЕТЫРЕ ЛАПЫ','4LAPY','PETSHOP','ЗООМАГАЗИН','ЗООТОВАР'], cat: 'Животные' },
  { patterns: ['БЕТХОВЕН','BEETHOVEN','VETERIN','ВЕТЕРИНАР','ВЕТКЛИН'], cat: 'Животные' },
  { patterns: ['PET ','ЗООМИР','LEMURRR','ЛЕМУРР'], cat: 'Животные' },

  // --- Путешествия ---
  { patterns: ['BOOKING','БУКИНГ','HOTEL','ОТЕЛЬ','ГОСТИНИЦ','HOSTEL','ХОСТЕЛ'], cat: 'Путешествия' },
  { patterns: ['AIRBNB','SUTOCHNO','СУТОЧНО','КВАРТИРОСЪЁМ'], cat: 'Путешествия' },
  { patterns: ['TUTU.RU','ТУТУ','AVIASALES','АВИАСЕЙЛЗ','TRAVELATA'], cat: 'Путешествия' },
  { patterns: ['OSTROVOK','ОСТРОВОК','LEVEL.TRAVEL'], cat: 'Путешествия' },

  // --- Электроника ---
  { patterns: ['DNS','ДНС','MVIDEO','М.ВИДЕО','М ВИДЕО','МВИДЕО'], cat: 'Электроника' },
  { patterns: ['ELDORADO','ЭЛЬДОРАДО','CITILINK','СИТИЛИНК'], cat: 'Электроника' },
  { patterns: ['RE:STORE','RESTORE','СВЯЗНОЙ','SVYAZNOY','МТС МАГАЗИН'], cat: 'Электроника' },
  { patterns: ['SAMSUNG','XIAOMI','HUAWEI'], cat: 'Электроника' },

  // --- Страхование ---
  { patterns: ['STRAHOVANIE','СТРАХОВАНИ','OSAGO','ОСАГО','КАСКО','KASKO'], cat: 'Страхование' },
  { patterns: ['INGOSSTRAKH','ИНГОССТРАХ','SOGAZ','СОГАЗ','RESO','РЕСО'], cat: 'Страхование' },
  { patterns: ['АЛЬФАСТРАХ','ALFASTRAKH'], cat: 'Страхование' },

  // --- Благотворительность ---
  { patterns: ['БЛАГОТВОРИТЕЛ','CHARITY','ПОЖЕРТВОВАН','DONATION','ФОНД ПОМОЩ'], cat: 'Благотворительность' },

  // --- Кредиты ---
  { patterns: ['КРЕДИТ','CREDIT','ПРОЦЕНТ','INTEREST'], cat: 'Кредиты' },
  { patterns: ['КРЕДИТНАЯ КАРТА','МИНИМАЛЬНЫЙ ПЛАТЁЖ','ПЛАТА ЗА ОБСЛУЖИВАНИЕ'], cat: 'Кредиты' },
  { patterns: ['ПЛАТА ЗА ПРОГРАММУ','ПЛАТА ЗА ИСПОЛЬЗОВАНИЕ','КОМИССИЯ'], cat: 'Кредиты' },

  // --- Дополнительные Еда ---
  { patterns: ['ЧАЙХОНА','CHAYHONA','ТАНУКИ','TANUKI'], cat: 'Еда вне дома' },
  { patterns: ['ЯКИТОРИЯ','YAKITORIYA','ГИННО','GINNO','IL PATIO','ИЛ ПАТИО'], cat: 'Еда вне дома' },
  { patterns: ['КУЛИНАРИЯ','ВЫПЕЧКА','BAKEHOUSE','KONDITER','КОНДИТЕР'], cat: 'Еда вне дома' },

  // --- Дополнительные Продукты ---
  { patterns: ['СЕМИШАГОВ','7SHAGOV','МИНИ МАРКЕТ','MINIMARKET','ПРОДУКТЫ'], cat: 'Продукты' },
  { patterns: ['ВИНЛАБ','WINLAB','АЛКОМАРКЕТ','АЛКОТЕКА'], cat: 'Продукты' },
  { patterns: ['SBERMARKET','СБЕРМАРКЕТ','IGOOODS','СБЕР ЕАПТЕКА'], cat: 'Продукты' },

  // --- Дополнительные Подписки ---
  { patterns: ['WINK','ВИНК','START.RU','СТАРТ','PREMIER','ПРЕМЬЕР'], cat: 'Подписки и связь' },
  { patterns: ['STORYTEL','ЛИТРЕС','LITRES','MYBOOK','МАЙБУК'], cat: 'Подписки и связь' },
  { patterns: ['CHATGPT','OPENAI','MIDJOURNEY','GITHUB','NOTION'], cat: 'Подписки и связь' },
  { patterns: ['YANDEX*360','YANDEX*MUSIC','ЯНДЕКС МУЗЫК'], cat: 'Подписки и связь' },

  // --- Дополнительные Здоровье ---
  { patterns: ['OZON PHARMA','ПЛАНЕТА ЗДОРОВ','БУДЬ ЗДОРОВ'], cat: 'Здоровье' },
  { patterns: ['ТРЕНАЖЁР','ТРЕНАЖЕР','GYM','ФИТНЕС','FITNESS','СПОРТЗАЛ'], cat: 'Здоровье' },
  { patterns: ['YOGA','ЙОГА','МАССАЖ','MASSAGE','SPA','СПА'], cat: 'Здоровье' },
  { patterns: ['WORLDCLASS','WORLD CLASS','ALEXFITNESS','АЛЕКС ФИТНЕС'], cat: 'Здоровье' },

  // --- Дополнительные Транспорт ---
  { patterns: ['САМОКАТ','СКУТЕР','WHOOSH','URENT','ЮРЕНТ','JETSHARING'], cat: 'Транспорт' },
  { patterns: ['ШЕРЕМЕТЬЕВО','ПУЛКОВО','ДОМОДЕДОВО','VNUKOVO','ВНУКОВО'], cat: 'Транспорт' },
  { patterns: ['BUS','АВТОБУС','МАРШРУТ','ПРОЕЗД'], cat: 'Транспорт' },

  // --- Дополнительные Развлечения ---
  { patterns: ['BOWLING','БОУЛИНГ','БАТУТ','TRAMPOLINE','КВЕСТ','QUEST'], cat: 'Развлечения' },
  { patterns: ['ПАРК РАЗВЛЕЧЕНИЙ','АТТРАКЦИОН','ЗООПАРК','ZOO','ПЛАНЕТАРИЙ'], cat: 'Развлечения' },
  { patterns: ['КАТОК','SKATING','БИЛЕТ','TICKET'], cat: 'Развлечения' },

  // --- Сбер-специфические паттерны (BUG-3 fix) ---
  // Продукты (SberPay / MAPP_ variants)
  { patterns: ['SBERBANK_ONL@IN_PAY RUS MOSKVA PYATEROCHKA','SBERBANK_ONL@IN_PAY RUS MOSKVA 5KA'], cat: 'Продукты' },
  { patterns: ['SBERBANK_ONL@IN_PAY RUS MOSKVA MAGNIT','SBERBANK_ONL@IN_PAY RUS MOSKVA PEREKRESTOK'], cat: 'Продукты' },
  { patterns: ['SBERBANK_ONL@IN_PAY RUS MOSKVA LENTA','SBERBANK_ONL@IN_PAY RUS MOSKVA VKUSVILL'], cat: 'Продукты' },

  // Транспорт (SberPay / MAPP_)
  { patterns: ['CITY MOBILE','CITIMOBIL','СИТИ МОБИЛ'], cat: 'Транспорт' },
  { patterns: ['SBERBANK_ONL@IN_PAY RUS MOSKVA YANDEX'], cat: 'Транспорт' },

  // Автомобиль (SberPay)
  { patterns: ['BP_NEFTEPRODUKTY','BP NEFTEPRODUKTY','BP_NEFTEPROD','BRITISH PETROLEUM'], cat: 'Автомобиль' },
  { patterns: ['NESTE','НЕСТЕ','EKA_','ЕКА_'], cat: 'Автомобиль' },

  // Красота (SberPay)
  { patterns: ['LETUAL','ЛЭТУАЛЬ','ЛЕТУАЛЬ','L\'ETOILE'], cat: 'Красота' },
  { patterns: ['PODRUZHKA','ПОДРУЖКА','ИЛЬ ДЕ БОТЭ','ILDEBOTE'], cat: 'Красота' },

  // Дети
  { patterns: ['DETSKIY MIR','ДЕТСКИЙ МИР','ДОЧКИ СЫНОЧКИ','ДЕТМИР'], cat: 'Дети' },

  // Кредиты / банковские услуги (Сбер)
  { patterns: ['PLATI CHASTYAMI','ПЛАТИ ЧАСТЯМИ','РАССРОЧК','INSTALLMENT'], cat: 'Кредиты' },
  { patterns: ['КОМИССИЯ ЗА','ПЛАТА ЗА ОБСЛУЖ','ГОДОВОЕ ОБСЛУЖ'], cat: 'Кредиты' },
  { patterns: ['ПОГАШЕНИЕ ПРОЦЕНТ','МИНИМАЛЬНЫЙ ПЛАТЁЖ','МИНИМАЛЬНЫЙ ПЛАТЕЖ'], cat: 'Кредиты' },

  // Благотворительность (Сбер)
  { patterns: ['NETMONET','NETMONET.COM','ПОДПИСКА СБЕР ВМЕСТЕ'], cat: 'Благотворительность' },

  // Кэшбэк / бонусы — убрать из расходов будет позже, пока в Прочее
  { patterns: ['SP THANKYOU','СПАСИБО','CASHBACK','КЭШБЭК','КЕШБЭК'], cat: 'Прочее' },
  { patterns: ['SBERPAY','SBER PAY'], cat: 'Прочее' }, // SberPay без конкретного мерчанта

  // Дополнительные СБП-паттерны
  { patterns: ['БЫСТРЫХ ПЛАТЕЖЕЙ','СИСТЕМА БЫСТРЫХ','СБП'], cat: 'Переводы' },

  // Дополнительные магазины/сервисы
  { patterns: ['PINGVIN','ПИНГВИН','ХИМЧИСТ'], cat: 'Дом' },
  { patterns: ['ЧИСТЮЛЯ','CHISTULYA'], cat: 'Дом' },
  { patterns: ['ЦВЕТЫ','FLOWERS','ФЛОРИСТ','FLORIST','БУКЕТ'], cat: 'Прочее' },
  { patterns: ['ФОТО','PHOTO','ФОТОГРАФ'], cat: 'Развлечения' },
  { patterns: ['ПОЧТА РОССИ','POCHTA','CDEK','СДЭК','BOXBERRY','БОКСБЕРРИ'], cat: 'Прочее' },
  { patterns: ['МЕГАМАРТ','MEGAMART','МАГНОЛИЯ','MAGNOLIA'], cat: 'Продукты' },
  { patterns: ['MIRATORG','МИРАТОРГ'], cat: 'Продукты' },
  { patterns: ['MYASNOV','МЯСНОВ'], cat: 'Продукты' },
  { patterns: ['РЫБНЫЙ','SEAFOOD'], cat: 'Продукты' },
  { patterns: ['ВКУСНО И ТОЧКА','ROSTICS','РОСТИКС'], cat: 'Еда вне дома' },
  { patterns: ['IL PATIO','ИЛ ПАТИО','PLANET SUSHI','ПЛАНЕТА СУШИ'], cat: 'Еда вне дома' },
  { patterns: ['МОСИГРА','HOBBY','ХОББИ','КНИГА','BOOK','ЧИТАЙ-ГОРОД','ЧИТАЙ ГОРОД'], cat: 'Развлечения' },
  { patterns: ['APTEKA.RU','ЕАПТЕКА','EAPTEKA','АПТЕКИ СТОЛИЧКИ'], cat: 'Здоровье' },
  { patterns: ['РОСГОССТРАХ','ROSGOSSTRAH','ТИНЬКОФФ СТРАХОВ'], cat: 'Страхование' },
  { patterns: ['МЕГАФОН БАНК','TELE2 BANK'], cat: 'Подписки и связь' },
  { patterns: ['DOMCLICK','ДОМКЛИК','ЦИАН','CIAN','ЯНДЕКС НЕДВИЖИМ'], cat: 'Жильё' },

  // --- Наличные (ATM снятия) ---
  { patterns: ['ATM ','БАНКОМАТ','CASH WITHDRAWAL','СНЯТИЕ НАЛИЧНЫХ','ATM_'], cat: 'Наличные расход' },

  // --- Автомобиль (доп.) ---
  { patterns: ['АВТОПЛАТЁЖ ТАЧКА','АВТОПЛАТЕЖ ТАЧКА','ТАЧКА'], cat: 'Автомобиль' },
  { patterns: ['TVEL-SPORT','ТВЕЛ-СПОРТ'], cat: 'Автомобиль' },

  // --- Еда вне дома (доп. из выписок) ---
  { patterns: ['UZHINDOMA','УЖИНДОМА','УЖИН ДОМА'], cat: 'Еда вне дома' },
  { patterns: ['CHEFMARKET','ШЕФ МАРКЕТ','ШЕФМАРКЕТ'], cat: 'Еда вне дома' },

  // --- Финансы / Инвестиции ---
  { patterns: ['СБЕРНПФ','НПФ','ПЕНСИОНН','NPF'], cat: 'Перевод себе' },
  { patterns: ['SBERBANK_ONL@IN VKLAD','VKLAD-KAR'], cat: 'Перевод себе' },

  // --- Кабинет жителя / Дом ---
  { patterns: ['KABINET-ZHITELYA','КАБИНЕТ ЖИТЕЛЯ','КАБИНЕТ-ЖИТЕЛЯ'], cat: 'Коммуналка' },

  // --- Доп. маркетплейсы ---
  { patterns: ['DDX','ДДХ'], cat: 'Маркетплейсы' },
  { patterns: ['FAST BOX','FASTBOX','ФАСТ БОКС'], cat: 'Маркетплейсы' },

  // --- Дом (доп.) ---
  { patterns: ['YAKOB-ART','ЯКОБ-АРТ','ЯКОБ АРТ'], cat: 'Дом' },
  { patterns: ['TROYA-LYUKS','ТРОЯ-ЛЮКС','ТРОЯ ЛЮКС','TROYA LYUKS'], cat: 'Дом' },
  { patterns: ['ARED SPB','АРЕД СПБ'], cat: 'Дом' },

  // --- Здоровье (доп.) ---
  { patterns: ['ЯКОБ-ДЕНТИК','YAKOB-DENT','ДЕНТИК'], cat: 'Здоровье' },

  // --- Страхование (доп.) ---
  { patterns: ['OSK-INS','ОСК-ИНС','YM*OSK'], cat: 'Страхование' },

  // --- Прочие внутренние платежи Сбер ---
  { patterns: ['МОМЕНТАЛЬНЫЕ ПЛАТЕЖИ','SBSCR_МОМЕНТ'], cat: 'Переводы' },
  { patterns: ['BPWWW','ОПЛАТА УСЛУГ'], cat: 'Прочее' },

  // --- Доп. по данным из выписок ---
  { patterns: ['РЯДКОМ','RDKOM'], cat: 'Продукты' },

  // --- Фаза 2: новые правила для уменьшения «Прочее» ---
  { patterns: ['SBSCR_СЕРВИСЫ ЯНДЕКСА','SBSCR_СЕРВИСЫ','SBSCR_СЕРВИ'], cat: 'Подписки и связь' },
  { patterns: ['ZHOLOBOV VADIM','ЖОЛОБОВ'], cat: 'Развлечения' },
  { patterns: ['ULYBKA RADUGI','УЛЫБКА РАДУГИ'], cat: 'Дом' },
  { patterns: ['GALAMART','ГАЛАМАРТ'], cat: 'Дом' },
  { patterns: ['NOVOE KACHESTVO DOROG','НОВОЕ КАЧЕСТВО ДОРОГ'], cat: 'Автомобиль' },
  { patterns: ['WHSD','ЗСД'], cat: 'Автомобиль' },
  { patterns: ['DINOLAND','ДИНОЛЕНД'], cat: 'Дети' },
  { patterns: ['YANDEX*SCOOTERS','YANDEX*7999*SCOOTER','ЯНДЕКС*САМОКАТ'], cat: 'Транспорт' },
  { patterns: ['YANDEX*GO_BERIZARYAD','YANDEX*GO_RUNCHARGE','ЯНДЕКС*ЗАРЯДКА'], cat: 'Транспорт' },
  { patterns: ['KOPIMURINO','KOPI TSENTR','КОПИ ЦЕНТР','КОПИМУРИНО'], cat: 'Дом' },
  { patterns: ['BUKVOED','БУКВОЕД'], cat: 'Дети' },
  { patterns: ['CDEK','СДЭК'], cat: 'Маркетплейсы' },
  { patterns: ['SPB DEVYATKINO','ДЕВЯТКИНО'], cat: 'Транспорт' },
  { patterns: ['IP FILIPPOV','ИП ФИЛИППОВ'], cat: 'Развлечения' },
  { patterns: ['IP DAUD ALADKHAM','ИП ДАУД'], cat: 'Еда вне дома' },
  { patterns: ['ПЕРЕВОД СРЕДСТВ ИП'], cat: 'Перевод себе' },
];

function categorizeTransaction(desc, bankCat) {
  const upper = (desc || '').toUpperCase();

  // 1. Custom user rules
  for (const [merchant, cat] of Object.entries(STATE.customRules)) {
    if (upper.includes(merchant.toUpperCase())) return cat;
  }

  // 1b. Business contacts auto-detect (salary payments to subcontractors)
  const BUSINESS_CONTACTS = [
    'ГАСАНАГА', 'М. ГАСАНАГА',
    'К. АННА ВИКТОРОВНА', 'К. ЖАННА ВАСИЛЬЕВН',
    'Н. АНЖЕЛИКА ИВАНОВ', 'П. ВИКТОР АНДРЕЕВИ',
    'Н. ЕВГЕНИЙ ВИКТОРО', 'Ф. ОКСАНА НИКОЛАЕВ',
    'Б. РАИСА',
  ];
  if (upper.includes('ПЕРЕВОД ДЛЯ') || upper.includes('ПЕРЕВОД')) {
    for (const contact of BUSINESS_CONTACTS) {
      if (upper.includes(contact.toUpperCase())) return 'Бизнес';
    }
  }

  // 2. Merchant rules
  for (const rule of MERCHANT_RULES) {
    for (const pat of rule.patterns) {
      if (upper.includes(pat.toUpperCase())) return rule.cat;
    }
  }

  // 2b. Strip MAPP_SBERBANK prefix and re-check (BUG-3: Sber wraps merchant names)
  if (upper.includes('MAPP_') || upper.includes('ONL@IN')) {
    const cleaned = upper
      .replace(/^MAPP_/i, '')
      .replace(/SBERBANK_?/gi, '')
      .replace(/ONL@IN_?PAY/gi, '')
      .replace(/\s+RUS\s+\w+/i, '')
      .replace(/\s+\d{3}\s+\d{8,}/g, '')
      .replace(/\s+/g, ' ').trim();
    for (const rule of MERCHANT_RULES) {
      for (const pat of rule.patterns) {
        if (cleaned.includes(pat.toUpperCase())) return rule.cat;
      }
    }
  }

  // 3. Bank category (Sber gives these)
  if (bankCat) {
    const catMap = {
      'Супермаркеты': 'Продукты',
      'Продукты': 'Продукты',
      'Ресторан': 'Еда вне дома',
      'Рестораны и кафе': 'Еда вне дома',
      'Рестораны': 'Еда вне дома',
      'Фастфуд': 'Еда вне дома',
      'Транспорт': 'Транспорт',
      'Такси': 'Транспорт',
      'Автомобиль': 'Автомобиль',
      'Топливо': 'Автомобиль',
      'АЗС': 'Автомобиль',
      'Здоровье и красота': 'Здоровье',
      'Здоровье': 'Здоровье',
      'Аптеки': 'Здоровье',
      'Красота': 'Красота',
      'Все для дома': 'Дом',
      'Всё для дома': 'Дом',
      'Дом и ремонт': 'Дом',
      'Одежда и обувь': 'Одежда',
      'Одежда': 'Одежда',
      'Коммунальные платежи': 'Коммуналка',
      'Связь, интернет': 'Подписки и связь',
      'Связь': 'Подписки и связь',
      'Интернет': 'Подписки и связь',
      'Коммунальные платежи, связь, интернет.': 'Коммуналка',
      'Развлечения': 'Развлечения',
      'Образование': 'Образование',
      'Маркетплейсы': 'Маркетплейсы',
      'Перевод с карты': 'Переводы',
      'Перевод на карту': 'Переводы',
      'Перевод СБП': 'Переводы',
      'Оплата по QR-коду СБП': 'Прочее', // пусть merchant rules разберут по описанию
      'Оплата по QR–коду СБП': 'Прочее',
      'Прочие операции': 'Прочее',
      'Прочие расходы': 'Прочее',
      'Другое': 'Прочее',
      'Животные': 'Животные',
      'Путешествия': 'Путешествия',
      'Электроника': 'Электроника',
      'Страхование': 'Страхование',
      'Кредиты': 'Кредиты',
      'Дети': 'Дети',
    };
    for (const [key, val] of Object.entries(catMap)) {
      if (bankCat.includes(key)) return val;
    }
  }

  // 4. Keyword detection for transfers / self-transfers
  if (upper.includes('KOPILKA') || upper.includes('КОПИЛКА') ||
      upper.includes('KARTA-VKLAD') || upper.includes('KARTA VKLAD') ||
      upper.includes('КАРТА-ВКЛАД') || upper.includes('КАРТА ВКЛАД') ||
      upper.includes('ПОПОЛНЕНИЕ ВКЛАД') || upper.includes('НАКОПИТЕЛЬН') ||
      upper.includes('МЕЖДУ СВОИМИ') || upper.includes('ПЕРЕВОД НА ВКЛАД') ||
      upper.includes('СО ВКЛАДА') || upper.includes('НА ВКЛАД')) return 'Перевод себе';
  if (upper.includes('ПЕРЕВОД') || upper.includes('ПЕРЕВЕЛ') || upper.includes('TRANSFER')) return 'Переводы';
  if (upper.includes('ПОПОЛНЕНИЕ') || upper.includes('БЫСТРЫХ ПЛАТЕЖЕЙ')) return 'Переводы';

  return 'Прочее';
}

// Clean transaction description for display (UX-1)
// Strips Sber MAPP_ prefixes, card numbers, city codes etc.
function cleanDescription(desc) {
  if (!desc) return '';
  let d = desc;
  d = d.replace(/^MAPP_/i, '');
  d = d.replace(/SBERBANK_?/gi, '');
  d = d.replace(/ONL@IN_?PAY/gi, '');
  d = d.replace(/\s+RUS\s+[A-ZА-ЯЁ]+(\s+[A-ZА-ЯЁ]+)?/gi, ''); // RUS MOSKVA, RUS SAINT PETER
  d = d.replace(/\s+\d{3}\s+\d{8,}/g, ''); // country code + auth: 643 48037769
  d = d.replace(/\*{4}\d{4}/g, ''); // card mask ****1234
  d = d.replace(/\s+\d{6}$/g, ''); // trailing auth code
  d = d.replace(/\bMCC\d+/gi, ''); // MCC codes
  d = d.replace(/_/g, ' '); // underscores to spaces
  d = d.replace(/\s+/g, ' ').trim();
  // Capitalize first letter
  if (d.length > 0) d = d.charAt(0).toUpperCase() + d.slice(1);
  return d;
}

// Detect internal transfers (self-transfers and general transfers)
// Returns { type, category } or null (no override)
function classifyTransferType(desc, bankCat, isIncome) {
  const upper = (desc || '').toUpperCase();
  const bankUpper = (bankCat || '').toUpperCase();

  // FIX-9: ATM operations are never income — they are cash withdrawals or deposits (self-transfer)
  if (upper.includes('ATM ') || upper.includes('ATM_') || upper.includes('БАНКОМАТ') || upper.includes('CASH WITHDRAWAL') || upper.includes('СНЯТИЕ НАЛИЧНЫХ')) {
    return { type: isIncome ? 'transfer' : 'expense', category: isIncome ? 'Перевод себе' : 'Наличные расход' };
  }

  // FIX-8: User-defined income rules (salary, etc.)
  if (isIncome && STATE.incomeRules && STATE.incomeRules.length > 0) {
    for (const rule of STATE.incomeRules) {
      if (upper.includes(rule.toUpperCase())) {
        return { type: 'income', category: 'Зарплата' };
      }
    }
  }

  // Self-transfer patterns (between own accounts)
  const selfPatterns = [
    'KOPILKA', 'КОПИЛКА', 'ИНВЕСТКОПИЛКА',
    'KARTA-VKLAD', 'KARTA VKLAD', 'КАРТА-ВКЛАД', 'КАРТА ВКЛАД',
    'KARTA-CREDIT', 'KARTA CREDIT', 'КАРТА-КРЕДИТ', 'КАРТА КРЕДИТ',
    'BRANCH KARTA-CREDIT', 'BRANCH KARTA CREDIT',
    'ПОПОЛНЕНИЕ ВКЛАДА', 'ПОПОЛНЕНИЕ СЧЁТА', 'ПОПОЛНЕНИЕ СЧЕТА',
    'ПОПОЛНЕНИЕ. СИСТЕМА БЫСТРЫХ ПЛ',
    'ПЕРЕВОД МЕЖДУ СЧЕТАМИ', 'МЕЖДУ СВОИМИ СЧЕТАМИ', 'МЕЖДУ СВОИМИ',
    'НАКОПИТЕЛЬНЫЙ СЧЁТ', 'НАКОПИТЕЛЬНЫЙ СЧЕТ', 'НАКОПИТЕЛЬН',
    'СБЕРЕГАТЕЛЬНЫЙ СЧЁТ', 'СБЕРЕГАТЕЛЬНЫЙ СЧЕТ',
    'ПЕРЕВОД НА ВКЛАД', 'ПЕРЕВОД СО ВКЛАДА',
    'СО ВКЛАДА', 'НА ВКЛАД',
    'ВНУТРИБАНКОВСКИЙ ПЕРЕВОД', 'ВНУТРЕННИЙ ПЕРЕВОД',
    'ПОГАШЕНИЕ КРЕДИТА', 'ПОГАШЕНИЕ КРЕДИТНОЙ',
    'ПЕРЕВОД СОБСТВЕННЫХ СРЕДСТВ', 'ПРОЧИЕ ВЫПЛАТЫ',
    'ВНЕШНИЙ ПЕРЕВОД ПО НОМЕРУ ТЕЛЕ',
    'ПЕРЕВОД СРЕДСТВ ИП НА ЛИЧНЫЙ СЧЕТ',
  ];

  // Wife transfers (Алёна Скачкова) — always transfer
  const wifePatterns = ['АЛЁНА СЕРГЕЕВНА', 'АЛЕНА СЕРГЕЕВНА', 'С. АЛЁНА', 'С. АЛЕНА', 'СКАЧКОВА А'];
  for (const pat of wifePatterns) {
    if (upper.includes(pat)) return { type: 'transfer', category: 'Переводы' };
  }

  // ИП → personal account transfer
  if (upper.includes('ПЕРЕВОД ОТ С. КИРИЛЛ ВЛАДИМИРО') || upper.includes('ПЕРЕВОД ОТ СКАЧКОВ К')) {
    return { type: 'transfer', category: 'Перевод себе' };
  }

  for (const pat of selfPatterns) {
    if (upper.includes(pat)) return { type: 'transfer', category: 'Перевод себе' };
  }

  // SBOL/SberOnline transfers to self (patterns specific to own-account transfers)
  if ((upper.includes('SBOL') || upper.includes('СБОЛ')) &&
      (upper.includes('PEREVOD') || upper.includes('ПЕРЕВОД')) &&
      (upper.includes('МЕЖДУ') || upper.includes('СВОИМИ') || upper.includes('СОБСТВ'))) {
    return { type: 'transfer', category: 'Перевод себе' };
  }

  // Bank category hints for general transfers
  if (bankUpper.includes('ПЕРЕВОД С КАРТЫ') || bankUpper.includes('ПЕРЕВОД НА КАРТУ') ||
      bankUpper.includes('ПЕРЕВОД СБП')) {
    return { type: 'transfer', category: null }; // general transfer, keep existing category from categorizeTransaction
  }

  // Description-based general transfer detection
  if (upper.includes('ПЕРЕВОД') || upper.includes('ПЕРЕВЕЛ') || upper.includes('TRANSFER')) {
    // Exclude cases that are clearly purchases (e.g. "Перевод СБП" with merchant name)
    // but still classify as transfer type
    return { type: 'transfer', category: null };
  }

  if (upper.includes('ПОПОЛНЕНИЕ') && !isIncome) {
    return { type: 'transfer', category: 'Перевод себе' };
  }

  return null; // no override
}

// ============================================================
//  PDF PARSERS
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function parsePDF(file) {
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.filter(it => it.str.trim() !== '');
    if (items.length === 0) continue;
    // Sort by Y descending (top to bottom), then X ascending (left to right)
    items.sort((a, b) => {
      const dy = b.transform[5] - a.transform[5];
      if (Math.abs(dy) > 2) return dy;
      return a.transform[4] - b.transform[4];
    });
    // Group by Y-line, then split into table cells by X-gap
    // Large X-gap (>30px) = separate cell = separate line in output
    // Small X-gap = same cell, join with space (e.g. "30 000,00")
    let currentY = items[0].transform[5];
    let cells = []; // array of cell strings for current Y-line
    let cellParts = [items[0].str];
    let prevRight = items[0].transform[4] + (items[0].width || 0);

    for (let k = 1; k < items.length; k++) {
      const item = items[k];
      const y = item.transform[5];
      const x = item.transform[4];

      if (Math.abs(y - currentY) > 2) {
        // New Y-line: flush current cell, then flush all cells
        cells.push(cellParts.join(' '));
        for (const c of cells) fullText += c + '\n';
        cells = [];
        cellParts = [item.str];
        currentY = y;
        prevRight = x + (item.width || 0);
      } else {
        // Same Y-line: check X-gap to decide if new cell
        const gap = x - prevRight;
        if (gap > 30) {
          // Large gap = new table cell
          cells.push(cellParts.join(' '));
          cellParts = [item.str];
        } else {
          // Small gap = same cell
          cellParts.push(item.str);
        }
        prevRight = x + (item.width || 0);
      }
    }
    // Flush remaining
    if (cellParts.length > 0) cells.push(cellParts.join(' '));
    for (const c of cells) fullText += c + '\n';

    updateProgress(Math.round((i / pdf.numPages) * 60), `Читаю страницу ${i} из ${pdf.numPages}...`);
  }
  return fullText;
}

function detectBank(text) {
  // Search only the header (first 1500 chars) to avoid false matches from transaction descriptions
  const header = text.substring(0, 1500);
  if (header.includes('sberbank.ru') || header.includes('СберБанк') || header.includes('СБЕРБАНК') || header.includes('Выписка по платёжному счёту') || header.includes('Выписка по счёту кредитной карты')) return 'sber';
  if (header.includes('ТБАНК') || header.includes('TBANK') || header.includes('tbank.ru') || header.includes('Т-Банк') || header.includes('Тинькофф') || header.includes('Tinkoff') || header.includes('Справка о движении средств')) return 'tinkoff';
  return null;
}

function detectOwner(text) {
  // Try to detect name from statement
  const nameMatch = text.match(/(?:СКАЧКОВ[А-Я]*|Скачков[а-я]*)\s+([А-ЯЁа-яё]+)\s+([А-ЯЁа-яё]+)/i);
  if (nameMatch) return nameMatch[0];
  return 'Неизвестно';
}

function parseSber(text) {
  const transactions = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Sber PDF.js extracts table cells in five modes:
  // MODE A (credit, merged):   "25.01.2026 10:06" / category / amount / balance / "25.01.2026 060393" / description
  // MODE B (credit, separate): "25.01.2026" / "10:06" / [authcode] / category / amount / balance / date2 / [authcode] / description
  // MODE C (debit, all-in-one): "27.02.2026 14:31 444516 Перевод СБП" / amount / balance / date2 / description
  // MODE D (debit, split cells): "31.01.2026 21:13 734687" / category / amount / balance / date2 / description
  // MODE E (full-line fallback): "27.02.2026 14:31 444516 Перевод СБП 1 125,00 124,09" (all on one line)

  const dateTimeAuthCatRe = /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(\d{6})\s+(.+)$/;
  const dateTimeAuthOnlyRe = /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(\d{6})$/;
  const dateTimeRe = /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})$/;
  const dateRe = /^\d{2}\.\d{2}\.\d{4}$/;
  const timeRe = /^\d{2}:\d{2}$/;
  const authRe = /^\d{6}$/;
  const dateAuthRe = /^\d{2}\.\d{2}\.\d{4}\s+\d{6}$/;
  const amountRe = /^[\+]?[\d\s]+,\d{2}$/;
  const pageMarkerRe = /^(?:ДАТА|Продолжение|Для проверки|Действителен|www\.sberbank|Выписка по|ВЫПИСКА|Страница \d|Расшифровка)/;

  function isNewTxStart(idx) {
    if (idx >= lines.length) return false;
    if (dateTimeAuthCatRe.test(lines[idx])) return true;
    if (dateTimeAuthOnlyRe.test(lines[idx])) return true;
    if (dateTimeRe.test(lines[idx])) return true;
    if (idx + 1 < lines.length && dateRe.test(lines[idx]) && timeRe.test(lines[idx + 1])) return true;
    return false;
  }

  for (let i = 0; i < lines.length - 2; i++) {
    let date, time, category, amountLine, balanceLine, descStart;
    let authCode = '';

    // MODE C: "27.02.2026 14:31 444516 Перевод СБП" / amount / balance / date2 / description
    // MODE E fallback: same regex but amounts embedded in category capture
    const dtacMatch = lines[i].match(dateTimeAuthCatRe);
    if (dtacMatch) {
      date = dtacMatch[1];
      time = dtacMatch[2];
      authCode = dtacMatch[3];
      const catRaw = dtacMatch[4];
      if (i + 2 < lines.length && amountRe.test(lines[i + 1]) && amountRe.test(lines[i + 2])) {
        // MODE C: amounts on next lines
        category = catRaw;
        amountLine = lines[i + 1];
        balanceLine = lines[i + 2];
        descStart = i + 3;
      } else {
        // MODE E: amounts embedded in the same line as category
        const fullMatch = catRaw.match(/^(.+?)\s+([\+]?\d[\d ]*,\d{2})\s+([\+]?\d[\d ]*,\d{2})$/);
        if (fullMatch) {
          category = fullMatch[1];
          amountLine = fullMatch[2];
          balanceLine = fullMatch[3];
          descStart = i + 1;
        } else {
          continue;
        }
      }
    } else {
      // MODE D: "31.01.2026 21:13 734687" / category / amount / balance
      const dtaMatch = lines[i].match(dateTimeAuthOnlyRe);
      if (dtaMatch) {
        date = dtaMatch[1];
        time = dtaMatch[2];
        authCode = dtaMatch[3];
        if (i + 3 >= lines.length) continue;
        category = lines[i + 1];
        if (dateRe.test(category) || amountRe.test(category) || dateTimeRe.test(category) ||
            dateTimeAuthOnlyRe.test(category) || dateTimeAuthCatRe.test(category) || pageMarkerRe.test(category)) continue;
        amountLine = lines[i + 2];
        balanceLine = lines[i + 3];
        if (!amountRe.test(amountLine) || !amountRe.test(balanceLine)) continue;
        descStart = i + 4;
      } else {
        // MODE A: merged date+time "25.01.2026 10:06"
        const dtMatch = lines[i].match(dateTimeRe);
        let nextIdx;
        if (dtMatch) {
          date = dtMatch[1];
          time = dtMatch[2];
          nextIdx = i + 1;
        } else if (dateRe.test(lines[i]) && i + 1 < lines.length && timeRe.test(lines[i + 1])) {
          // MODE B: separate "25.01.2026" + "10:06"
          date = lines[i];
          time = lines[i + 1];
          nextIdx = i + 2;
        } else {
          continue;
        }

        if (nextIdx + 2 >= lines.length) continue;

        if (authRe.test(lines[nextIdx])) {
          // DEBIT: authcode → category → amount → balance
          authCode = lines[nextIdx];
          if (nextIdx + 3 >= lines.length) continue;
          category = lines[nextIdx + 1];
          if (dateRe.test(category) || amountRe.test(category) || dateTimeRe.test(category)) continue;
          amountLine = lines[nextIdx + 2];
          balanceLine = lines[nextIdx + 3];
          if (!amountRe.test(amountLine) || !amountRe.test(balanceLine)) continue;
          descStart = nextIdx + 4;
        } else if (!dateRe.test(lines[nextIdx]) && !amountRe.test(lines[nextIdx]) && !dateTimeRe.test(lines[nextIdx]) &&
                   nextIdx + 2 < lines.length && amountRe.test(lines[nextIdx + 1]) && amountRe.test(lines[nextIdx + 2])) {
          // CREDIT: category → amount → balance
          category = lines[nextIdx];
          amountLine = lines[nextIdx + 1];
          balanceLine = lines[nextIdx + 2];
          descStart = nextIdx + 3;
        } else {
          continue;
        }
      }
    }

    const amountStr = amountLine.replace(/\s/g, '').replace(',', '.');
    const balanceStr = balanceLine.replace(/\s/g, '').replace(',', '.');

    // Collect description, skipping date2+authcode, extracting authCode if not yet set
    let desc = '';
    let j = descStart;
    // Skip merged date2+authcode: "25.01.2026 060393"
    if (j < lines.length && dateAuthRe.test(lines[j])) {
      if (!authCode) {
        const daMatch = lines[j].match(/^\d{2}\.\d{2}\.\d{4}\s+(\d{6})$/);
        if (daMatch) authCode = daMatch[1];
      }
      j++;
    } else {
      // Or skip separate date2 and authcode
      if (j < lines.length && dateRe.test(lines[j])) j++;
      if (j < lines.length && authRe.test(lines[j])) {
        if (!authCode) authCode = lines[j];
        j++;
      }
    }
    // Collect until next transaction or page marker
    // FIX-1: Strip leading processing dates from description lines
    while (j < lines.length) {
      const l = lines[j];
      if (isNewTxStart(j)) break;
      if (pageMarkerRe.test(l)) break;
      if (dateRe.test(l) || dateTimeRe.test(l) || dateAuthRe.test(l)) { j++; continue; }
      if (authRe.test(l)) { j++; continue; }
      // Strip leading processing date (e.g. "07.03.2026 KOPILKA KARTA-VKLAD" → "KOPILKA KARTA-VKLAD")
      const cleaned = l.replace(/^\d{2}\.\d{2}\.\d{4}\s+/, '');
      if (cleaned) desc += (desc ? ' ' : '') + cleaned;
      j++;
    }

    // Clean description - remove card info and footer legalese
    desc = desc.replace(/\.?\s*Операция\s+по\s+(?:карте|счету)\s+\*{4}\d+/gi, '').trim();
    desc = desc.replace(/\s*Дата формирования документа[\s\S]*/i, '').trim();
    desc = desc.replace(/\s*ПАО Сбербанк\.[\s\S]*/i, '').trim();
    desc = desc.replace(/\s*Погашение процентов\s+[\d\s,]+/i, '').trim();
    desc = desc.replace(/\s+/g, ' ').trim();

    const isIncome = amountLine.trim().startsWith('+');
    const amount = Math.abs(parseFloat(amountStr));
    if (amount === 0 || isNaN(amount)) continue;

    const [dd, mm, yyyy] = date.split('.');
    const monthKey = yyyy + '-' + mm;
    const isoDate = yyyy + '-' + mm + '-' + dd;

    let cat = categorizeTransaction(desc, category);
    let type = isIncome ? 'income' : 'expense';

    // Detect transfers (BUG-4 fix)
    const transferInfo = classifyTransferType(desc, category, isIncome);
    if (transferInfo) {
      type = transferInfo.type;
      if (transferInfo.category) cat = transferInfo.category;
      else if (type === 'transfer' && cat === 'Прочее') cat = 'Переводы';
    }

    transactions.push({
      id: 'sber_' + date + '_' + time + '_' + txHash('sber', date, time, amountStr, desc, authCode),
      authCode: authCode || '',
      date: isoDate,
      time: time,
      monthKey: monthKey,
      amount: amount,
      type: type,
      description: desc || category,
      bankCategory: category,
      category: cat,
      merchant: desc || category,
      balance: parseFloat(balanceStr),
      bank: 'Сбербанк'
    });

    i = j - 1;
  }

  // FIX-6: Deduplicate paired transfers
  // Sber reports some operations as two lines with same authCode+time+amount but different descriptions:
  //   "SBOL перевод на карту 5469****7742 М. ГАСАНАГА..." (technical)
  //   "Перевод для М. Гасанага Гюльоглан Оглы" (human-readable)
  // Keep the more descriptive one (longer description or the "Перевод для/от" variant)
  const byAuthKey = new Map();
  for (const tx of transactions) {
    if (!tx.authCode || tx.authCode === '000000') continue;
    const key = tx.authCode + '|' + tx.date + '|' + tx.time + '|' + tx.amount;
    if (!byAuthKey.has(key)) byAuthKey.set(key, []);
    byAuthKey.get(key).push(tx);
  }
  const removeIds = new Set();
  for (const [key, group] of byAuthKey) {
    if (group.length < 2) continue;
    // Keep the best description: prefer "Перевод для/от" human-readable, else longest
    let best = group[0];
    for (let k = 1; k < group.length; k++) {
      const curr = group[k];
      const bestDesc = (best.description || '').toUpperCase();
      const currDesc = (curr.description || '').toUpperCase();
      // Prefer human-readable "Перевод для/от" over SBOL technical
      const bestHuman = /^ПЕРЕВОД (ДЛЯ|ОТ) /.test(bestDesc);
      const currHuman = /^ПЕРЕВОД (ДЛЯ|ОТ) /.test(currDesc);
      if (currHuman && !bestHuman) best = curr;
      else if (!currHuman && !bestHuman && currDesc.length > bestDesc.length) best = curr;
    }
    for (const tx of group) {
      if (tx !== best) removeIds.add(tx.id);
    }
  }
  if (removeIds.size > 0) {
    console.log(`[FinHelper] FIX-6: Removed ${removeIds.size} paired duplicate transfers`);
    return transactions.filter(tx => !removeIds.has(tx.id));
  }

  return transactions;
}

function parseTinkoff(text) {
  const transactions = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Tinkoff PDF.js - two known extraction modes:
  // MODE A (new, merged): "31.12.2025 31.12.2025" / "+20 823.00" / "+20 823.00" / desc+card+₽ / ₽ / time / time / desc...
  // MODE B (old, separate): "31.12.2025" / "17:06" / "31.12.2025" / "17:06" / "+20 823.00 ₽" / "+20 823.00 ₽" / desc / "9971"

  const twoDateRe = /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})$/;
  const dateRe = /^\d{2}\.\d{2}\.\d{4}$/;
  const timeRe = /^\d{2}:\d{2}$/;
  const amountNoRubleRe = /^[+-][\d\s]+\.\d{2}$/;
  const amountWithRubleRe = /^[+-][\d\s]+\.\d{2}\s*₽$/;
  const amountAnyRe = /^[+-][\d\s]+\.\d{2}\s*₽?$/;
  const cardRe = /^\d{4}$|^—$/;
  const footerRe = /^(?:АО|БИК|Дата и время|Исх\.|Справка о движении)/;

  function classifyType(desc, isIncome) {
    let type = isIncome ? 'income' : 'expense';
    // Use shared classifyTransferType first
    const transferInfo = classifyTransferType(desc, null, isIncome);
    if (transferInfo) {
      type = transferInfo.type;
    }
    // Tinkoff-specific overrides
    if (desc.includes('Внутрибанковский перевод') || desc.includes('Внутренний перевод')) {
      type = isIncome ? 'income' : 'transfer';
    }
    if (desc.includes('Пополнение') && isIncome) type = 'income';
    if (desc.includes('Внешний перевод') || desc.includes('Внешний банковский')) type = 'transfer';
    if (desc.includes('Проценты по кредиту') || desc.includes('Плата за Программу') || desc.includes('Плата за использование')) type = 'expense';
    return type;
  }

  // Try NEW format first: two dates on one line + amounts (with or without ₽)
  for (let i = 0; i < lines.length - 2; i++) {
    const dateMatch = lines[i].match(twoDateRe);
    if (!dateMatch) continue;
    if (!amountAnyRe.test(lines[i + 1])) continue;
    if (!amountAnyRe.test(lines[i + 2])) continue;

    const date = dateMatch[1];
    const amountStr = lines[i + 1].replace(/\s/g, '').replace('₽', '');

    // Find next transaction start (next twoDateRe or footer)
    let nextTx = lines.length;
    for (let k = i + 3; k < lines.length; k++) {
      if (twoDateRe.test(lines[k])) { nextTx = k; break; }
      if (footerRe.test(lines[k])) { nextTx = k; break; }
    }

    // Collect lines between amounts and next tx, extracting time and filtering noise
    let time = '';
    const descParts = [];
    for (let j = i + 3; j < nextTx; j++) {
      const l = lines[j];
      if (footerRe.test(l)) break;
      if (timeRe.test(l)) { if (!time) time = l; continue; }
      if (l === '₽') continue;
      if (cardRe.test(l)) continue;
      descParts.push(l);
    }

    let desc = descParts.join(' ');
    // Clean embedded card+₽: "Описание 9971 ₽ продолжение" → "Описание продолжение"
    desc = desc.replace(/\s+\d{4}\s*₽/g, '');
    desc = desc.replace(/\s*₽/g, '');
    desc = desc.replace(/\s+\d{4}$/g, '');
    desc = desc.replace(/\s+—$/g, '');
    // Remove embedded 4-digit card number between words: "Система 9971 быстрых" → "Система быстрых"
    desc = desc.replace(/\s+\d{4}\s+/g, ' ');
    desc = desc.replace(/\s+/g, ' ').trim();

    const isIncome = amountStr.startsWith('+');
    const amount = Math.abs(parseFloat(amountStr));
    if (amount === 0 || isNaN(amount)) continue;

    const [dd, mm, yyyy] = date.split('.');
    const monthKey = yyyy + '-' + mm;
    const isoDate = yyyy + '-' + mm + '-' + dd;
    const type = classifyType(desc, isIncome);
    let cat = categorizeTransaction(desc, null);

    // Apply transfer category from classifyTransferType (BUG-4 fix)
    const transferInfo = classifyTransferType(desc, null, isIncome);
    if (transferInfo && transferInfo.category) cat = transferInfo.category;
    else if (type === 'transfer' && cat === 'Прочее') cat = 'Переводы';

    transactions.push({
      id: 'tink_' + date + '_' + time + '_' + txHash('tink', date, time, amountStr, desc),
      date: isoDate,
      time: time,
      monthKey: monthKey,
      amount: amount,
      type: type,
      description: desc,
      bankCategory: null,
      category: cat,
      merchant: desc,
      balance: null,
      bank: 'Тинькофф'
    });

    i = nextTx - 1;
  }

  // If new format found nothing, try OLD format: date/time/date/time/amount₽/amount₽
  if (transactions.length === 0) {
    for (let i = 0; i < lines.length - 5; i++) {
      if (!dateRe.test(lines[i])) continue;
      if (!timeRe.test(lines[i+1])) continue;
      if (!dateRe.test(lines[i+2])) continue;
      if (!timeRe.test(lines[i+3])) continue;
      if (!amountWithRubleRe.test(lines[i+4])) continue;
      if (!amountWithRubleRe.test(lines[i+5])) continue;

      const date = lines[i];
      const time = lines[i+1];
      const amountStr = lines[i+4].replace(/\s/g, '').replace('₽', '');

      let desc = '';
      let j = i + 6;
      while (j < lines.length) {
        const l = lines[j];
        if (cardRe.test(l)) { j++; break; }
        if (dateRe.test(l) && j+1 < lines.length && timeRe.test(lines[j+1]) && j+2 < lines.length && dateRe.test(lines[j+2])) break;
        if (footerRe.test(l)) break;
        desc += (desc ? ' ' : '') + l;
        j++;
      }

      desc = desc.replace(/\s+/g, ' ').trim();
      const isIncome = amountStr.startsWith('+');
      const amount = Math.abs(parseFloat(amountStr));
      if (amount === 0 || isNaN(amount)) continue;

      const [dd, mm, yyyy] = date.split('.');
      const monthKey = yyyy + '-' + mm;
      const isoDate = yyyy + '-' + mm + '-' + dd;
      const type = classifyType(desc, isIncome);
      let cat = categorizeTransaction(desc, null);

      // Apply transfer category from classifyTransferType (BUG-4 fix)
      const transferInfo = classifyTransferType(desc, null, isIncome);
      if (transferInfo && transferInfo.category) cat = transferInfo.category;
      else if (type === 'transfer' && cat === 'Прочее') cat = 'Переводы';

      transactions.push({
        id: 'tink_' + date + '_' + time + '_' + txHash('tink', date, time, amountStr, desc),
        date: isoDate,
        time: time,
        monthKey: monthKey,
        amount: amount,
        type: type,
        description: desc,
        bankCategory: null,
        category: cat,
        merchant: desc,
        balance: null,
        bank: 'Тинькофф'
      });

      i = j - 1;
    }
  }

  return transactions;
}

// ============================================================
//  FILE HANDLING
// ============================================================
function updateProgress(pct, text) {
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = text;
}

async function handleFiles(files) {
  if (!files || files.length === 0) return;

  // Check if we're on the onboarding screen or uploading via FAB
  const isOnboarding = document.getElementById('screen-onboarding').classList.contains('active');
  if (isOnboarding) {
    document.querySelector('.upload-zone').style.display = 'none';
    document.getElementById('upload-progress').classList.add('active');
  } else {
    toast('Загружаю выписку...');
  }

  try { // Global try-catch for entire file handling

  let allNewTx = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fname = file.name.toLowerCase();
    const isCSV = fname.endsWith('.csv') || fname.endsWith('.tsv');
    if (!fname.endsWith('.pdf') && !isCSV) {
      toast('Поддерживаются PDF и CSV файлы');
      continue;
    }

    updateProgress(10, `Читаю ${file.name}...`);

    try {
      let txs;
      let text = '';
      let bank = null;

      if (isCSV) {
        // CSV import
        text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        updateProgress(65, 'Разбираю CSV...');
        txs = parseCSV(text);
        console.log(`[FinHelper] CSV: Parsed ${txs.length} transactions from ${file.name}`);
      } else {
        // PDF import
        text = await parsePDF(file);
        bank = detectBank(text);
        if (!bank) {
          toast('Не удалось определить банк. Поддерживаем Сбер и Тинькофф.');
          continue;
        }
        updateProgress(65, 'Распознаю операции...');
        const debugLines = text.split('\n').slice(0, 30);
        console.log(`[FinHelper] Bank: ${bank}, File: ${file.name}`);
        console.log('[FinHelper] First 30 lines:', debugLines);
        if (bank === 'sber') {
          txs = parseSber(text);
        } else {
          txs = parseTinkoff(text);
        }
        console.log(`[FinHelper] Parsed ${txs.length} transactions from ${file.name}`);
      }

      updateProgress(85, `Раскладываю по категориям... (${txs.length} операций)`);

      const owner = detectOwner(text);

      // Tag with owner/file
      txs.forEach(tx => {
        tx.owner = owner;
        tx.sourceFile = file.name;
      });

      allNewTx = allNewTx.concat(txs);

      if (!STATE.files.includes(file.name)) {
        STATE.files.push(file.name);
      }

      const bankLabel = bank === 'sber' ? 'Сбербанк' : bank === 'tinkoff' ? 'Тинькофф' : 'CSV';
      toast(`${bankLabel}: ${txs.length} операций`);
      trackEvent('pdf_upload', { bank: bank || 'csv', count: txs.length });

    } catch(e) {
      console.error('Parse error:', e);
      toast('Ошибка чтения файла: ' + e.message);
      trackEvent('pdf_error', { error: e.message });
    }
  }

  if (allNewTx.length > 0) {
    let unique = [];
    let dupeCount = 0;
    try {
      // Merge, avoiding duplicates — smart dedup (FIX-2: handles authCode transition)
      const existingIds = new Set(STATE.transactions.map(t => t.id));

      // Phase 1: exact ID match (fast path)
      unique = allNewTx.filter(t => !existingIds.has(t.id));

      // Phase 2: semantic dedup for old↔new transition
      // Old transactions without authCode get different hash than new ones with authCode
      // Match by (bank, date, time, amount, normalizedDesc) and upgrade old entries
      if (unique.length > 0) {
        const existingByBaseKey = new Map();
        for (const t of STATE.transactions) {
          const norm = (t.description || '').toUpperCase().replace(/\s+/g, ' ').trim().substring(0, 40);
          const key = `${t.bank}_${t.date}_${t.time}_${t.amount}_${norm}`;
          if (!existingByBaseKey.has(key)) existingByBaseKey.set(key, []);
          existingByBaseKey.get(key).push(t);
        }

        unique = unique.filter(newTx => {
          const norm = (newTx.description || '').toUpperCase().replace(/\s+/g, ' ').trim().substring(0, 40);
          const key = `${newTx.bank}_${newTx.date}_${newTx.time}_${newTx.amount}_${norm}`;
          const matches = existingByBaseKey.get(key);
          if (!matches || matches.length === 0) return true; // no match → new transaction

          // Check if any existing entry is the same transaction (upgrade scenario)
          for (const m of matches) {
            // Both have authCode and they match → duplicate
            if (m.authCode && newTx.authCode && m.authCode === newTx.authCode) return false;
            // Existing has no authCode → old version, upgrade it
            if (!m.authCode && newTx.authCode) {
              m.authCode = newTx.authCode;
              m.id = newTx.id;
              existingIds.add(newTx.id);
              return false;
            }
            // Neither has authCode → duplicate
            if (!m.authCode && !newTx.authCode) return false;
          }
          // All existing have different authCodes → legitimate different transaction
          return true;
        });
      }

      STATE.transactions = STATE.transactions.concat(unique);

      // FIX-6 cross-file: deduplicate paired transfers across all loaded transactions
      // Same authCode+date+time+amount from different files = same operation reported twice
      const byAuthKey = new Map();
      for (const tx of STATE.transactions) {
        if (!tx.authCode || tx.authCode === '000000') continue;
        const key = tx.authCode + '|' + tx.date + '|' + tx.time + '|' + tx.amount;
        if (!byAuthKey.has(key)) byAuthKey.set(key, []);
        byAuthKey.get(key).push(tx);
      }
      const pairedRemoveIds = new Set();
      for (const [key, group] of byAuthKey) {
        if (group.length < 2) continue;
        let best = group[0];
        for (let k = 1; k < group.length; k++) {
          const curr = group[k];
          const bestD = (best.description || '').toUpperCase();
          const currD = (curr.description || '').toUpperCase();
          const bestH = /^ПЕРЕВОД (ДЛЯ|ОТ) /.test(bestD);
          const currH = /^ПЕРЕВОД (ДЛЯ|ОТ) /.test(currD);
          if (currH && !bestH) best = curr;
          else if (!currH && !bestH && currD.length > bestD.length) best = curr;
        }
        for (const tx of group) {
          if (tx !== best) pairedRemoveIds.add(tx.id);
        }
      }
      if (pairedRemoveIds.size > 0) {
        STATE.transactions = STATE.transactions.filter(tx => !pairedRemoveIds.has(tx.id));
        console.log(`[FinHelper] FIX-6: Removed ${pairedRemoveIds.size} cross-file paired duplicates`);
      }

      STATE.transactions.sort((a, b) => {
        const da = a.date || ''; const db = b.date || '';
        return db.localeCompare(da) || (b.time || '').localeCompare(a.time || '');
      });
      saveState();
    } catch(mergeErr) {
      console.error('[FinHelper] Merge/save error:', mergeErr);
      // Still add transactions without sorting if sort fails
      if (unique.length === 0) unique = allNewTx;
    }

    dupeCount = allNewTx.length - unique.length;
    if (unique.length === 0 && dupeCount > 0) {
      updateProgress(100, `Все ${dupeCount} операций уже были загружены ранее`);
      toast('Дубликатов не добавлено — эта выписка уже загружена');
    } else if (dupeCount > 0) {
      updateProgress(100, `Готово! +${unique.length} новых (${dupeCount} дубл. пропущено)`);
    } else {
      updateProgress(100, `Готово! ${unique.length} операций загружено`);
    }

    // Find most recent month
    if (STATE.transactions.length > 0) {
      currentMonth = STATE.transactions[0].monthKey;
    }

    // Auto-match transfers between own cards
    setTimeout(() => {
      try {
        autoMatchTransfers();
      } catch(e) { console.error('[FinHelper] autoMatchTransfers error:', e); }
      try {
        applySmartPatterns();
      } catch(e) { console.error('[FinHelper] applySmartPatterns error:', e); }
      try {
        showScreen('dashboard');
      } catch(e) { console.error('[FinHelper] showScreen error:', e); }
      // Show Wow screen summary
      setTimeout(() => { try { showWowScreen(unique, unique.length, dupeCount); } catch(e) { console.error('[FinHelper] showWowScreen error:', e); } }, 400);
      // Show wizard if many "Прочее" items in new transactions
      setTimeout(() => { try { showWizardMisc(allNewTx); } catch(e) { console.error('[FinHelper] showWizardMisc error:', e); } }, 2000);
      // Check for smart pattern suggestions
      setTimeout(() => { try { showSmartPatternSuggestions(); } catch(e) { console.error('[FinHelper] showSmartPatternSuggestions error:', e); } }, 4000);
    }, 800);
  } else {
    if (isOnboarding) {
      document.querySelector('.upload-zone').style.display = 'flex';
      document.getElementById('upload-progress').classList.remove('active');
    }
    toast('Не удалось найти операции в файле');
  }

  } catch(globalErr) {
    // Global error handler — ensures app never hangs on upload
    console.error('[FinHelper] CRITICAL handleFiles error:', globalErr);
    updateProgress(100, 'Ошибка при обработке файла');
    toast('Ошибка: ' + (globalErr.message || 'неизвестная'));
    // Try to recover — show dashboard if we have data
    setTimeout(() => {
      try {
        if (STATE.transactions.length > 0) showScreen('dashboard');
        else {
          document.querySelector('.upload-zone').style.display = 'flex';
          document.getElementById('upload-progress').classList.remove('active');
        }
      } catch(e) { console.error('[FinHelper] Recovery failed:', e); }
    }, 500);
  }
}

// Drag & drop
const uploadZone = document.getElementById('upload-zone');
if (uploadZone) {
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
}

// ============================================================
//  DATA HELPERS
// ============================================================
function getMonthData(monthKey) {
  return STATE.transactions.filter(t => t.monthKey === monthKey);
}

// Custom period support: returns data for current month OR custom date range
function getDataForPeriod() {
  if (STATE.settings.periodMode === 'custom' && STATE.settings.periodStart && STATE.settings.periodEnd) {
    return STATE.transactions.filter(t =>
      t.date >= STATE.settings.periodStart && t.date <= STATE.settings.periodEnd
    );
  }
  return getMonthData(currentMonth);
}

function getPeriodLabel() {
  if (STATE.settings.periodMode === 'custom' && STATE.settings.periodStart && STATE.settings.periodEnd) {
    const fmt = d => {
      const [y, m, dd] = d.split('-');
      const shortM = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
      return parseInt(dd) + ' ' + shortM[parseInt(m) - 1];
    };
    return fmt(STATE.settings.periodStart) + ' – ' + fmt(STATE.settings.periodEnd);
  }
  return monthName(currentMonth);
}

function getAvailableMonths() {
  const months = new Set(STATE.transactions.map(t => t.monthKey));
  return [...months].sort();
}

function formatMoney(n, showSign) {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (showSign) {
    return (n >= 0 ? '+' : '-') + formatted + ' ₽';
  }
  return formatted + ' ₽';
}

function monthName(key) {
  const [y, m] = key.split('-');
  const names = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return names[parseInt(m) - 1] + ' ' + y;
}

// ============================================================
//  AUTO-TRENDS (3-month average comparison)
// ============================================================
function getPrevMonths(monthKey, count) {
  // Returns array of N month keys before the given month
  const [y, m] = monthKey.split('-').map(Number);
  const result = [];
  for (let i = 1; i <= count; i++) {
    let pm = m - i;
    let py = y;
    while (pm <= 0) { pm += 12; py--; }
    result.push(py + '-' + String(pm).padStart(2, '0'));
  }
  return result;
}

function calculateTrends(targetMonth) {
  const prevKeys = getPrevMonths(targetMonth, 3);
  const available = getAvailableMonths();
  const validPrev = prevKeys.filter(k => available.includes(k));

  if (validPrev.length === 0) return null; // No historical data

  // Aggregate expenses by category for each previous month
  const monthlyCatTotals = {};
  for (const mk of validPrev) {
    const mData = getMonthData(mk).filter(t => t.type === 'expense');
    for (const t of mData) {
      if (!monthlyCatTotals[t.category]) monthlyCatTotals[t.category] = {};
      monthlyCatTotals[t.category][mk] = (monthlyCatTotals[t.category][mk] || 0) + t.amount;
    }
  }

  // Current month expenses by category
  const curData = getMonthData(targetMonth).filter(t => t.type === 'expense');
  const curCatTotals = {};
  for (const t of curData) {
    curCatTotals[t.category] = (curCatTotals[t.category] || 0) + t.amount;
  }

  // Build trends array
  const trends = [];
  const allCats = new Set([...Object.keys(monthlyCatTotals), ...Object.keys(curCatTotals)]);

  for (const cat of allCats) {
    const monthVals = monthlyCatTotals[cat] || {};
    const vals = validPrev.map(k => monthVals[k] || 0);
    const avg3m = vals.reduce((s, v) => s + v, 0) / validPrev.length;
    const current = curCatTotals[cat] || 0;

    let diffPct = 0;
    let direction = 'stable'; // ↑ up, ↓ down, → stable
    if (avg3m > 0) {
      diffPct = Math.round(((current - avg3m) / avg3m) * 100);
      if (diffPct > 10) direction = 'up';
      else if (diffPct < -10) direction = 'down';
      else direction = 'stable';
    } else if (current > 0) {
      diffPct = 100;
      direction = 'up';
    }

    trends.push({
      category: cat,
      avg3m: Math.round(avg3m),
      current: Math.round(current),
      diffPct: diffPct,
      direction: direction
    });
  }

  // Sort by current spending (desc)
  trends.sort((a, b) => b.current - a.current);
  return trends;
}

// Also calculate total income/expense trends
function calculateTotalTrends(targetMonth) {
  const prevKeys = getPrevMonths(targetMonth, 3);
  const available = getAvailableMonths();
  const validPrev = prevKeys.filter(k => available.includes(k));

  if (validPrev.length === 0) return null;

  let prevIncomes = [], prevExpenses = [];
  for (const mk of validPrev) {
    const mData = getMonthData(mk);
    prevIncomes.push(mData.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
    prevExpenses.push(mData.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
  }

  const avgIncome = prevIncomes.reduce((s, v) => s + v, 0) / validPrev.length;
  const avgExpense = prevExpenses.reduce((s, v) => s + v, 0) / validPrev.length;

  return {
    avgIncome: Math.round(avgIncome),
    avgExpense: Math.round(avgExpense),
    monthsUsed: validPrev.length
  };
}

// ============================================================
//  DASHBOARD FILTER (toggle-based)
// ============================================================
function toggleDashType(type) {
  dashToggles[type] = !dashToggles[type];
  // At least one toggle must be active
  if (!dashToggles.expenses && !dashToggles.transfers && !dashToggles.self && !dashToggles.income) {
    dashToggles[type] = true;
    toast('Хотя бы одна группа должна быть включена');
    return;
  }
  updateDashToggleUI();
  renderDashboard();
}

function updateDashToggleUI() {
  document.querySelectorAll('#dash-filters .filter-chip[data-dtoggle]').forEach(function(c) {
    var key = c.dataset.dtoggle;
    var on = dashToggles[key];
    c.classList.toggle('active', on);
    c.style.opacity = on ? '1' : '0.5';
  });
}

// Classify a transaction into a toggle group
function getTxToggleGroup(t) {
  if (t.category === 'Перевод себе') return 'self';
  if (t.type === 'transfer' || t.category === 'Переводы') return 'transfers';
  if (t.type === 'income') return 'income';
  return 'expenses';
}

// Apply dashboard filter
function applyDashFilter(data) {
  var filtered = data.filter(function(t) {
    return dashToggles[getTxToggleGroup(t)];
  });
  // Apply dashExclude (category-level)
  var exclude = STATE.settings.dashExclude || [];
  if (exclude.length > 0) {
    filtered = filtered.filter(function(t) { return exclude.indexOf(t.category) === -1; });
  }
  return filtered;
}

// Legacy compat
function setDashFilter(f) {
  if (f === 'no-transfers') {
    dashToggles = { expenses: true, transfers: false, self: false, income: true };
  } else if (f === 'transfers-only') {
    dashToggles = { expenses: false, transfers: true, self: true, income: false };
  } else {
    dashToggles = { expenses: true, transfers: true, self: true, income: true };
  }
  updateDashToggleUI();
  renderDashboard();
}

// ============================================================
//  GAMIFICATION — RANK SYSTEM
// ============================================================
const RANKS = [
  { id: 'novice',     label: 'Новичок',    icon: '⭐',  months: 0  },
  { id: 'controller', label: 'Контролёр',  icon: '⭐⭐', months: 1  },
  { id: 'bronze',     label: 'Бронза',     icon: '🥉',  months: 3  },
  { id: 'silver',     label: 'Серебро',    icon: '🥈',  months: 6  },
  { id: 'gold',       label: 'Золото',     icon: '🥇',  months: 12 },
  { id: 'diamond',    label: 'Алмаз',      icon: '💎',  months: 24 }
];

const BADGE_DEFS = [
  { id: 'first_upload',  icon: '📄', label: 'Первый шаг',     desc: 'Загрузил первую выписку' },
  { id: 'analyst',       icon: '📊', label: 'Аналитик',       desc: 'Открыл 5 разных категорий' },
  { id: 'sniper',        icon: '🎯', label: 'Снайпер',        desc: '0 операций в «Прочее»' },
  { id: 'streak3',       icon: '📱', label: 'Постоянство',    desc: '3 месяца подряд' },
  { id: 'streak6',       icon: '🔥', label: 'Огонь',          desc: '6 месяцев подряд' },
  { id: 'budgetmaster',  icon: '🧮', label: 'Бюджетмейстер', desc: '4 месяца подряд в рамках средних' },
  { id: 'saver',         icon: '💰', label: 'Копилка',        desc: 'Сэкономил 50,000₽ суммарно' },
  { id: 'categorizer',   icon: '🏷️', label: 'Категоризатор', desc: 'Создал 3 своих правила' },
  { id: 'multisource',   icon: '🏦', label: 'Мультибанк',     desc: 'Загрузил выписки 2+ банков' }
];

// Evaluate if a given month was "in budget" (within avg+30% per category, or total <= avg+10%)
function evaluateMonthBudget(monthKey) {
  const trends = calculateTrends(monthKey);
  const totalTrends = calculateTotalTrends(monthKey);
  if (!trends && !totalTrends) return null; // not enough data

  // Criterion 1: no category exceeds avg by more than 30%
  let allCatsOk = true;
  if (trends) {
    for (const t of trends) {
      if (t.avg3m > 0 && t.diffPct > 30) { allCatsOk = false; break; }
    }
  }

  // Criterion 2: total expenses <= avg + 10%
  let totalOk = false;
  if (totalTrends && totalTrends.avgExpense > 0) {
    const monthExpenses = getMonthData(monthKey).filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    totalOk = monthExpenses <= totalTrends.avgExpense * 1.1;
  }

  // Either criterion passes
  const inBudget = allCatsOk || totalOk;

  // Calculate savings
  const monthData = getMonthData(monthKey);
  const income = monthData.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = monthData.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const saved = income - expenses;

  return { inBudget, saved };
}

// Recalculate gamification state based on all available data
function updateGamification() {
  const g = STATE.gamification;
  const months = getAvailableMonths();

  // First upload badge
  if (STATE.transactions.length > 0 && !g.badges.includes('first_upload')) {
    g.badges.push('first_upload');
  }

  // Evaluate all months that have enough historical data (need at least 1 prior month)
  let consecutiveInBudget = 0;
  let totalSaved = 0;

  for (let i = 0; i < months.length; i++) {
    const mk = months[i];
    const result = evaluateMonthBudget(mk);
    if (result) {
      g.monthHistory[mk] = { inBudget: result.inBudget, saved: Math.round(result.saved) };
      if (result.inBudget) consecutiveInBudget++;
      else consecutiveInBudget = 0;
      if (result.saved > 0) totalSaved += result.saved;
    }
  }

  g.monthsInBudget = consecutiveInBudget;
  g.totalSaved = Math.round(totalSaved);

  // Determine rank
  const oldRank = g.rank;
  let newRank = 'novice';
  if (STATE.transactions.length > 0) newRank = 'novice';
  // Diamond: 24 months + savings > 10% consistently
  if (consecutiveInBudget >= 24 && totalSaved > 0) newRank = 'diamond';
  else if (consecutiveInBudget >= 12) newRank = 'gold';
  else if (consecutiveInBudget >= 6) newRank = 'silver';
  else if (consecutiveInBudget >= 3) newRank = 'bronze';
  else if (consecutiveInBudget >= 1) newRank = 'controller';

  if (newRank !== oldRank) {
    const oldIdx = RANKS.findIndex(r => r.id === oldRank);
    const newIdx = RANKS.findIndex(r => r.id === newRank);
    if (newIdx > oldIdx) {
      g.rankUpPending = true;
      g.lastRank = oldRank;
    }
  }
  g.rank = newRank;

  // Streak (consecutive months with data)
  let streak = 0;
  for (let i = months.length - 1; i > 0; i--) {
    const cur = months[i].split('-').map(Number);
    const prev = months[i - 1].split('-').map(Number);
    const expectedPrev = cur[1] === 1 ? [cur[0] - 1, 12] : [cur[0], cur[1] - 1];
    if (prev[0] === expectedPrev[0] && prev[1] === expectedPrev[1]) {
      streak++;
    } else break;
  }
  if (months.length > 0) streak++; // count the latest month itself
  g.streak.current = streak;
  if (streak > g.streak.best) g.streak.best = streak;

  // Check badges
  checkBadges(g, months);

  saveState();
}

function checkBadges(g, months) {
  // Streak badges
  if (g.streak.current >= 3 && !g.badges.includes('streak3')) g.badges.push('streak3');
  if (g.streak.current >= 6 && !g.badges.includes('streak6')) g.badges.push('streak6');

  // Budgetmaster: 4 consecutive months in budget
  if (g.monthsInBudget >= 4 && !g.badges.includes('budgetmaster')) g.badges.push('budgetmaster');

  // Saver: 50000+ total saved
  if (g.totalSaved >= 50000 && !g.badges.includes('saver')) g.badges.push('saver');

  // Sniper: 0 in Прочее for current month
  if (currentMonth) {
    const monthData = getMonthData(currentMonth);
    const inMisc = monthData.filter(t => t.type === 'expense' && t.category === 'Прочее').length;
    if (inMisc === 0 && monthData.length > 0 && !g.badges.includes('sniper')) g.badges.push('sniper');
  }

  // Categorizer: 3+ custom rules
  if (Object.keys(STATE.customRules || {}).length >= 3 && !g.badges.includes('categorizer')) g.badges.push('categorizer');

  // Multisource: 2+ different banks
  const banks = new Set(STATE.transactions.map(t => t.bank).filter(Boolean));
  if (banks.size >= 2 && !g.badges.includes('multisource')) g.badges.push('multisource');

  // Analyst: 5+ unique categories opened (we track via screen views, but simpler: 5+ expense categories with data)
  if (currentMonth) {
    const cats = new Set(getMonthData(currentMonth).filter(t => t.type === 'expense').map(t => t.category));
    if (cats.size >= 5 && !g.badges.includes('analyst')) g.badges.push('analyst');
  }
}

function getRankInfo(rankId) {
  return RANKS.find(r => r.id === rankId) || RANKS[0];
}

function getNextRank(rankId) {
  const idx = RANKS.findIndex(r => r.id === rankId);
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
}

function getRankProgress() {
  const g = STATE.gamification;
  const current = getRankInfo(g.rank);
  const next = getNextRank(g.rank);
  if (!next) return { current, next: null, progress: 100 };

  const monthsNeeded = next.months - current.months;
  const monthsDone = Math.min(g.monthsInBudget - current.months, monthsNeeded);
  const progress = monthsNeeded > 0 ? Math.max(0, Math.round((monthsDone / monthsNeeded) * 100)) : 0;

  return { current, next, progress };
}

// Confetti animation for rank-up
function showRankUpAnimation(newRankId) {
  const rank = getRankInfo(newRankId);
  const overlay = document.createElement('div');
  overlay.className = 'rankup-overlay';
  overlay.innerHTML = `
    <div class="rankup-content">
      <div class="rankup-confetti" id="rankup-confetti"></div>
      <div class="rankup-icon">${rank.icon}</div>
      <div class="rankup-title">Новый ранг!</div>
      <div class="rankup-rank">${rank.label}</div>
      <div class="rankup-desc">Продолжайте контролировать расходы!</div>
      <button class="btn-primary" style="margin-top:16px;width:100%;max-width:200px;" onclick="this.closest('.rankup-overlay').remove()">Отлично!</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Create confetti particles
  const confettiEl = document.getElementById('rankup-confetti');
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.className = 'confetti-particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.animationDelay = Math.random() * 0.5 + 's';
    particle.style.animationDuration = (1.5 + Math.random() * 2) + 's';
    confettiEl.appendChild(particle);
  }

  // Auto-dismiss after 5s
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 5000);
}

// Check and show rank-up if pending
function checkRankUpAnimation() {
  const g = STATE.gamification;
  if (g.rankUpPending) {
    g.rankUpPending = false;
    saveState();
    setTimeout(() => showRankUpAnimation(g.rank), 800);
  }
}

// Achievements screen
function showAchievements() {
  const g = STATE.gamification;
  const { current, next, progress } = getRankProgress();
  const months = getAvailableMonths();

  let html = '';

  // Current rank card
  html += `<div style="text-align:center;padding:16px 0;">
    <div style="font-size:3rem;">${current.icon}</div>
    <div style="font-size:1.3rem;font-weight:800;margin:4px 0;">${current.label}</div>`;

  if (next) {
    html += `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">До «${next.label}» ${next.icon}</div>
    <div style="background:var(--border);border-radius:8px;height:8px;overflow:hidden;max-width:240px;margin:0 auto;">
      <div style="height:100%;width:${progress}%;background:var(--accent);border-radius:8px;transition:width 0.5s;"></div>
    </div>
    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${g.monthsInBudget} из ${next.months} мес. в рамках бюджета</div>`;
  } else {
    html += `<div style="font-size:0.8rem;color:var(--accent);margin-bottom:4px;">Максимальный ранг достигнут!</div>`;
  }
  html += `</div>`;

  // Stats row
  html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0;">
    <div style="text-align:center;padding:10px;background:var(--bg-primary);border-radius:var(--radius-sm);">
      <div style="font-size:1.2rem;font-weight:700;">${g.streak.current}</div>
      <div style="font-size:0.7rem;color:var(--text-muted);">мес. подряд</div>
    </div>
    <div style="text-align:center;padding:10px;background:var(--bg-primary);border-radius:var(--radius-sm);">
      <div style="font-size:1.2rem;font-weight:700;">${g.monthsInBudget}</div>
      <div style="font-size:0.7rem;color:var(--text-muted);">в бюджете</div>
    </div>
    <div style="text-align:center;padding:10px;background:var(--bg-primary);border-radius:var(--radius-sm);">
      <div style="font-size:1.2rem;font-weight:700;">${g.totalSaved > 0 ? formatMoney(g.totalSaved) : '0 ₽'}</div>
      <div style="font-size:0.7rem;color:var(--text-muted);">сэкономлено</div>
    </div>
  </div>`;

  // Badges
  html += `<div style="margin-top:16px;"><div style="font-weight:700;font-size:0.95rem;margin-bottom:8px;">🏅 Достижения</div>`;
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
  for (const bd of BADGE_DEFS) {
    const earned = g.badges.includes(bd.id);
    html += `<div style="padding:10px;border-radius:var(--radius-sm);background:${earned ? 'var(--bg-primary)' : 'var(--bg-secondary)'};opacity:${earned ? '1' : '0.4'};border:1px solid ${earned ? 'var(--accent)' : 'var(--border)'};">
      <div style="font-size:1.3rem;">${bd.icon}</div>
      <div style="font-size:0.8rem;font-weight:600;margin-top:2px;">${bd.label}</div>
      <div style="font-size:0.7rem;color:var(--text-muted);">${bd.desc}</div>
      ${earned ? '<div style="font-size:0.65rem;color:var(--accent);margin-top:2px;">✅ Получено</div>' : ''}
    </div>`;
  }
  html += `</div></div>`;

  // Month history
  if (months.length > 0 && Object.keys(g.monthHistory).length > 0) {
    html += `<div style="margin-top:16px;"><div style="font-weight:700;font-size:0.95rem;margin-bottom:8px;">📅 История месяцев</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:6px;">`;
    for (const mk of months) {
      const h = g.monthHistory[mk];
      const [, mm] = mk.split('-');
      const shortName = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'][parseInt(mm) - 1];
      if (h) {
        const icon = h.inBudget ? '✅' : '❌';
        const bg = h.inBudget ? 'var(--green-bg)' : 'var(--red-bg)';
        html += `<div style="padding:6px 10px;border-radius:8px;background:${bg};text-align:center;min-width:50px;" title="${monthName(mk)}: ${h.inBudget ? 'в бюджете' : 'перерасход'}">
          <div style="font-size:0.7rem;color:var(--text-muted);">${shortName}</div>
          <div style="font-size:1rem;">${icon}</div>
        </div>`;
      } else {
        html += `<div style="padding:6px 10px;border-radius:8px;background:var(--bg-secondary);text-align:center;min-width:50px;" title="${monthName(mk)}">
          <div style="font-size:0.7rem;color:var(--text-muted);">${shortName}</div>
          <div style="font-size:1rem;">⏳</div>
        </div>`;
      }
    }
    html += `</div></div>`;
  }

  // Rank ladder
  html += `<div style="margin-top:16px;"><div style="font-weight:700;font-size:0.95rem;margin-bottom:8px;">🏆 Ранги</div>`;
  for (const r of RANKS) {
    const isCurrent = r.id === g.rank;
    const isPast = RANKS.indexOf(r) < RANKS.findIndex(x => x.id === g.rank);
    html += `<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;${isCurrent ? 'background:var(--accent-light);border:1px solid var(--accent);' : ''}opacity:${isPast || isCurrent ? '1' : '0.4'};">
      <div style="font-size:1.3rem;width:36px;text-align:center;">${r.icon}</div>
      <div style="flex:1;">
        <div style="font-size:0.85rem;font-weight:${isCurrent ? '700' : '500'};">${r.label}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);">${r.months > 0 ? r.months + ' мес. в бюджете' : 'Загрузил выписку'}</div>
      </div>
      ${isCurrent ? '<div style="font-size:0.75rem;color:var(--accent);font-weight:600;">← Вы здесь</div>' : ''}
      ${isPast ? '<div style="color:var(--green);">✓</div>' : ''}
    </div>`;
  }
  html += `</div>`;

  document.getElementById('achievements-content').innerHTML = html;
  document.getElementById('modal-achievements').classList.add('active');
}

// ============================================================
//  DASHBOARD RENDER
// ============================================================
function renderDashboard() {
  try {
  if (!currentMonth) {
    const months = getAvailableMonths();
    currentMonth = months[months.length - 1] || '2025-01';
  }

  const isCustomPeriod = STATE.settings.periodMode === 'custom' && STATE.settings.periodStart && STATE.settings.periodEnd;
  const allData = getDataForPeriod();
  const data = applyDashFilter(allData);

  // Gamification: update ranks/badges before rendering rank badge
  try { updateGamification(); } catch(e) { console.error('[FinHelper] updateGamification error:', e); }

  // Rank badge next to month name + period label
  if (!STATE.gamification) STATE.gamification = { rank: 'newbie', badges: [], monthHistory: {} };
  const rankInfo = getRankInfo(STATE.gamification.rank);
  document.getElementById('month-name').innerHTML = getPeriodLabel() +
    ' <span class="rank-badge" onclick="event.stopPropagation();showAchievements()" title="' + rankInfo.label + '">' + rankInfo.icon + '</span>';

  // Hide prev/next arrows in custom period mode
  var prevBtn = document.getElementById('month-prev-btn');
  var nextBtn = document.getElementById('month-next-btn');
  if (prevBtn) prevBtn.style.visibility = isCustomPeriod ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.style.visibility = isCustomPeriod ? 'hidden' : 'visible';

  // Update exclude filter badge
  const exclBtn = document.getElementById('dash-exclude-btn');
  const exclCount = (STATE.settings.dashExclude || []).length;
  if (exclBtn) exclBtn.textContent = exclCount > 0 ? '⚙️ Фильтр (' + exclCount + ')' : '⚙️ Фильтр';
  if (exclBtn) exclBtn.style.background = exclCount > 0 ? 'var(--accent-light)' : 'var(--yellow-bg)';

  // BUG-1 fix: income ALWAYS from allData (not filtered), so it's never 0 due to dashToggles
  const income = allData.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = data.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const transfers = data.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);
  const selfTransfers = data.filter(t => t.category === 'Перевод себе').reduce((s, t) => s + t.amount, 0);

  document.getElementById('total-income').textContent = '+' + formatMoney(income);
  document.getElementById('total-expense').textContent = '-' + formatMoney(expenses);

  // Show transfers sum if filter is 'all'
  if (dashFilter === 'all' && transfers > 0) {
    document.getElementById('total-expense').title = `+ ${formatMoney(transfers)} переводов`;
  }

  // Subtitle note about what's excluded
  const exclNote = document.getElementById('dash-excl-note');
  if (exclNote) {
    const exclCats = (STATE.settings.dashExclude || []);
    const parts = ['переводов'];
    parts.push(...exclCats.map(c => c.toLowerCase()));
    exclNote.textContent = `Семейные расходы · без ${parts.join(', ')}`;
  }

  // Calculate trends (3-month average comparison) — only in month mode
  const trends = isCustomPeriod ? [] : calculateTrends(currentMonth);
  const totalTrends = isCustomPeriod ? null : calculateTotalTrends(currentMonth);

  // Salary forecast (only in month mode — needs calendar month context)
  if (!isCustomPeriod) {
    try { renderForecast(allData, income, expenses, totalTrends); } catch(e) { console.error('[FinHelper] renderForecast error:', e); }
  } else {
    // Hide forecast in custom mode
    var forecastEl = document.getElementById('forecast-section');
    if (forecastEl) forecastEl.style.display = 'none';
  }

  // Donut chart
  try { renderDonut(data, expenses); } catch(e) { console.error('[FinHelper] renderDonut error:', e); }

  // Categories list
  try { renderCategories(data, expenses, trends); } catch(e) { console.error('[FinHelper] renderCategories error:', e); }

  // Insight phrases (smart comments)
  try { renderInsight(data, income, expenses, trends, totalTrends); } catch(e) { console.error('[FinHelper] renderInsight error:', e); }

  // Shock fact
  try { renderShock(data, income, expenses); } catch(e) { console.error('[FinHelper] renderShock error:', e); }

  // Month comparison
  try { renderComparison(expenses, income); } catch(e) { console.error('[FinHelper] renderComparison error:', e); }

  // Upload streak
  try { renderStreak(); } catch(e) { console.error('[FinHelper] renderStreak error:', e); }

  // Health score
  try { renderHealth(income, expenses, data); } catch(e) { console.error('[FinHelper] renderHealth error:', e); }

  // Goal progress card
  try { renderGoalDashCard(); } catch(e) { console.error('[FinHelper] renderGoalDashCard error:', e); }

  // Check for rank-up animation
  try { checkRankUpAnimation(); } catch(e) { console.error('[FinHelper] checkRankUpAnimation error:', e); }

  } catch(dashErr) {
    console.error('[FinHelper] renderDashboard critical error:', dashErr);
  }
}

function renderForecast(data, income, expenses, totalTrends) {
  const salaryDate = parseInt(STATE.settings.salaryDate) || 25;
  const [y, m] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = new Date();
  const isCurrentMonth = (today.getFullYear() === y && today.getMonth() + 1 === m);

  let daysLeft, daysPassed;
  if (isCurrentMonth) {
    daysPassed = today.getDate();
    daysLeft = Math.max(salaryDate - today.getDate(), 1);
    if (today.getDate() >= salaryDate) daysLeft = daysInMonth - today.getDate() + salaryDate;
  } else {
    daysPassed = daysInMonth;
    daysLeft = 0;
  }

  const balance = income - expenses;
  const dailyLimit = daysLeft > 0 ? Math.max(balance / daysLeft, 0) : 0;
  const avgDailySpend = daysPassed > 0 ? expenses / daysPassed : 0;
  const projectedTotal = avgDailySpend * daysInMonth;
  const willMakeIt = income >= projectedTotal;

  document.getElementById('forecast-balance').textContent = formatMoney(balance);
  document.getElementById('forecast-daily').textContent = formatMoney(dailyLimit);

  const bar = document.getElementById('forecast-bar');
  const pct = income > 0 ? Math.min((expenses / income) * 100, 100) : 0;
  bar.style.width = pct + '%';
  bar.style.background = pct < 70 ? 'var(--green)' : pct < 90 ? 'var(--yellow)' : 'var(--red)';

  const status = document.getElementById('forecast-status');
  if (!isCurrentMonth) {
    const saved = income - expenses;
    status.innerHTML = saved >= 0
      ? `<span style="color:var(--green)">✅ Сэкономлено: ${formatMoney(saved)}</span>`
      : `<span style="color:var(--red)">⚠️ Перерасход: ${formatMoney(Math.abs(saved))}</span>`;
  } else if (willMakeIt) {
    status.innerHTML = `<span style="color:var(--green)">✅ До ${salaryDate}-го хватит! Можно тратить ${formatMoney(dailyLimit)} в день</span>`;
  } else {
    status.innerHTML = `<span style="color:var(--red)">⚠️ При таком темпе может не хватить. Сократите до ${formatMoney(dailyLimit)} в день</span>`;
  }

  // Trend comparison with historical average
  const trendEl = document.getElementById('forecast-trend');
  if (trendEl) {
    if (totalTrends && totalTrends.avgExpense > 0) {
      const avgExp = totalTrends.avgExpense;
      let trendHtml = '';

      if (isCurrentMonth && daysPassed > 0) {
        // Show projected vs average with formula
        trendHtml += `<div style="color:var(--text-muted);font-size:0.78rem;margin-bottom:4px;">📐 ${formatMoney(expenses)} ÷ ${daysPassed} дн. = ${formatMoney(Math.round(avgDailySpend))}/день × ${daysInMonth} дн.</div>`;
        trendHtml += `<div style="color:var(--text-muted);">📈 Прогноз к концу месяца: <b>${formatMoney(Math.round(projectedTotal))}</b></div>`;
        trendHtml += `<div style="color:var(--text-muted);">📊 Обычно вы тратите: <b>${formatMoney(avgExp)}</b></div>`;
        const diff = Math.round(projectedTotal) - avgExp;
        const diffPct = Math.round((diff / avgExp) * 100);
        if (diff > 0) {
          trendHtml += `<div style="color:var(--red);">↑ На ${formatMoney(diff)} больше обычного (${diffPct > 0 ? '+' : ''}${diffPct}%)</div>`;
        } else if (diff < 0) {
          trendHtml += `<div style="color:var(--green);">↓ На ${formatMoney(Math.abs(diff))} меньше обычного (${diffPct}%)</div>`;
        } else {
          trendHtml += `<div style="color:var(--text-muted);">→ Примерно как обычно</div>`;
        }
      } else if (!isCurrentMonth) {
        // Past month: compare actual vs average
        const diff = expenses - avgExp;
        const diffPct = Math.round((diff / avgExp) * 100);
        if (Math.abs(diffPct) > 10) {
          const color = diff > 0 ? 'var(--red)' : 'var(--green)';
          const arrow = diff > 0 ? '↑' : '↓';
          trendHtml += `<div style="color:${color};">${arrow} ${diff > 0 ? 'На ' + formatMoney(diff) + ' больше' : 'На ' + formatMoney(Math.abs(diff)) + ' меньше'} обычного (${diffPct > 0 ? '+' : ''}${diffPct}%)</div>`;
        }
      }

      trendEl.innerHTML = trendHtml;
    } else {
      trendEl.innerHTML = '';
    }
  }
}

function renderDonut(data, totalExpense) {
  const expenseData = data.filter(t => t.type === 'expense');
  const catTotals = {};
  for (const tx of expenseData) {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
  }

  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([c]) => c);
  const values = sorted.map(([, v]) => v);
  const colors = sorted.map(([c]) => CATEGORIES[c]?.color || '#636E72');

  document.getElementById('donut-total').textContent = formatMoney(totalExpense);

  const ctx = document.getElementById('donut-chart').getContext('2d');
  if (donutChart) donutChart.destroy();

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(c) { return c.label + ': ' + formatMoney(c.raw) + ' (' + Math.round(c.raw / totalExpense * 100) + '%)'; }
          }
        }
      },
      onClick: function(evt, elements) {
        if (elements.length > 0) {
          var idx = elements[0].index;
          var cat = labels[idx];
          drillDownCategory(cat);
        }
      }
    }
  });
}

// Drill-down: клик по сегменту donut → показать детальный экран категории
function drillDownCategory(cat) {
  closeModal('modal-detail'); // close expense modal if open
  showCategoryDetail(cat);
}

function renderCategories(data, totalExpense, trends) {
  const expenseData = data.filter(t => t.type === 'expense');
  const catTotals = {};
  for (const tx of expenseData) {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
  }

  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const maxVal = sorted[0]?.[1] || 1;

  // Build trends lookup
  const trendMap = {};
  if (trends) {
    for (const t of trends) trendMap[t.category] = t;
  }

  const html = sorted.map(([cat, amount]) => {
    const info = CATEGORIES[cat] || { emoji: '❓', color: '#636E72' };
    const pct = totalExpense > 0 ? Math.round(amount / totalExpense * 100) : 0;
    const barW = Math.round(amount / maxVal * 100);
    const budget = (STATE.budgets || {})[cat];
    let budgetHtml = '';
    if (budget && budget > 0) {
      const budgetPct = Math.min(Math.round(amount / budget * 100), 100);
      const budgetColor = budgetPct >= 90 ? 'var(--red)' : budgetPct >= 70 ? 'var(--yellow)' : 'var(--green)';
      budgetHtml = `<div style="margin-top:2px;height:3px;background:var(--border);border-radius:2px;overflow:hidden;"><div style="height:100%;width:${budgetPct}%;background:${budgetColor};border-radius:2px;transition:width 0.3s;"></div></div><div style="font-size:0.65rem;color:${budgetColor};margin-top:1px;">${budgetPct}% от ${formatMoney(budget)}</div>`;
    }

    // Trend indicator with colored progress bar
    let trendHtml = '';
    const tr = trendMap[cat];
    if (tr && tr.avg3m > 0) {
      let arrow, color, label;
      if (tr.direction === 'up') {
        arrow = '↑'; color = 'var(--red)'; label = '+' + tr.diffPct + '%';
      } else if (tr.direction === 'down') {
        arrow = '↓'; color = 'var(--green)'; label = tr.diffPct + '%';
      } else {
        arrow = '→'; color = 'var(--text-muted)'; label = '~' + tr.diffPct + '%';
      }
      trendHtml = `<div style="font-size:0.65rem;color:${color};margin-top:1px;">${arrow} ${label} <span style="color:var(--text-muted);">(обычно ${formatMoney(tr.avg3m)})</span></div>`;
    }

    // Color zones for progress bar based on trend average
    let barColor = info.color;
    let remainText = '';
    if (tr && tr.avg3m > 0) {
      const trendPct = Math.round((amount / tr.avg3m) * 100);
      if (trendPct < 70) barColor = '#00B894';
      else if (trendPct < 90) barColor = '#00B894';
      else if (trendPct < 110) barColor = '#FDCB6E';
      else barColor = '#E17055';
      const remaining = tr.avg3m - amount;
      // Visual budget-style bar showing progress toward average
      const fillW = Math.min(trendPct, 130);
      const zoneColor = trendPct > 110 ? 'rgba(225,112,85,0.15)' : trendPct > 90 ? 'rgba(253,203,110,0.15)' : 'rgba(0,184,148,0.1)';
      const statusEmoji = trendPct > 110 ? '🔴' : trendPct > 90 ? '🟡' : '🟢';
      if (remaining > 0) {
        remainText = `<div style="font-size:0.6rem;color:var(--text-muted);margin-top:2px;">Осталось ${formatMoney(remaining)} из ${formatMoney(tr.avg3m)}</div>`;
      } else {
        const over = amount - tr.avg3m;
        remainText = `<div style="font-size:0.6rem;color:#E17055;margin-top:2px;">Перерасход ${formatMoney(over)} сверх ${formatMoney(tr.avg3m)}</div>`;
      }
    }

    // "Разобрать" instead of "Прочее" — special display + click opens wizard
    const displayName = info.displayName || cat;
    const miscCount = cat === 'Прочее' ? expenseData.filter(t => t.category === 'Прочее').length : 0;
    const miscBadge = miscCount > 0 ? ` <span style="background:var(--red);color:#fff;font-size:0.6rem;padding:1px 5px;border-radius:8px;font-weight:700;vertical-align:middle;">${miscCount}</span>` : '';
    const clickAction = cat === 'Прочее' ? `showWizardMiscOrDetail()` : `showCategoryDetail('${cat}')`;

    return `
      <div class="cat-item" onclick="${clickAction}">
        <div class="cat-emoji">${info.emoji}</div>
        <div class="cat-info">
          <div class="cat-name">${displayName}${miscBadge}</div>
          <div class="cat-bar-wrap"><div class="cat-bar" style="width:${barW}%;background:${barColor}"></div></div>
          ${budgetHtml}
          ${remainText}
          ${trendHtml}
        </div>
        <div class="cat-amount">
          <span class="amount">${formatMoney(amount)}</span>
          <span class="pct">${pct}%</span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('all-categories').innerHTML = html;
}

// ============================================================
//  INSIGHT PHRASES (smart dashboard comments)
// ============================================================
function renderInsight(data, income, expenses, trends, totalTrends) {
  const card = document.getElementById('insight-card');
  const content = document.getElementById('insight-content');
  if (!card || !content) return;

  const insights = [];
  const expenseData = data.filter(t => t.type === 'expense');

  // 1. Most stable category (lowest diffPct)
  if (trends && trends.length > 0) {
    const stableCats = trends.filter(t => t.avg3m > 0 && Math.abs(t.diffPct) <= 10 && t.current > 0);
    if (stableCats.length > 0) {
      const best = stableCats[0];
      const info = CATEGORIES[best.category] || {};
      insights.push(`${info.emoji || '📊'} <b>${best.category}</b> — ваша самая стабильная категория ✅`);
    }
  }

  // 2. Fastest growing category (3+ months trend)
  if (trends) {
    const growing = trends.filter(t => t.direction === 'up' && t.diffPct > 20 && t.current > 0).sort((a, b) => b.diffPct - a.diffPct);
    if (growing.length > 0) {
      const g = growing[0];
      const info = CATEGORIES[g.category] || {};
      insights.push(`${info.emoji || '📈'} <b>${g.category}</b> выросли на ${g.diffPct}% по сравнению с обычным 📈`);
    }
  }

  // 3. Biggest single expense this month
  if (expenseData.length > 0) {
    const biggest = expenseData.reduce((max, t) => t.amount > max.amount ? t : max, expenseData[0]);
    if (biggest.amount > 0) {
      const cleanDesc = typeof cleanDescription === 'function' ? cleanDescription(biggest.description) : biggest.description;
      insights.push(`💸 Самая крупная трата: <b>${cleanDesc}</b> — ${formatMoney(biggest.amount)}`);
    }
  }

  // 4. Savings insight
  if (income > 0 && expenses > 0) {
    const savingsRate = Math.round(((income - expenses) / income) * 100);
    if (savingsRate > 20) {
      insights.push(`💰 Вы откладываете ${savingsRate}% дохода — отличный результат!`);
    } else if (savingsRate > 0) {
      insights.push(`💡 Уровень накоплений: ${savingsRate}% дохода. Цель — минимум 20%`);
    }
  }

  // 5. "Прочее" reminder
  const miscCount = expenseData.filter(t => t.category === 'Прочее').length;
  if (miscCount > 5) {
    insights.push(`📥 <b>${miscCount}</b> ${pluralize(miscCount, 'операция', 'операции', 'операций')} в «Разобрать» — нажмите, чтобы распределить`);
  }

  // 6. Category reduction congratulation
  if (trends) {
    const reduced = trends.filter(t => t.direction === 'down' && t.diffPct < -20 && t.avg3m > 0);
    if (reduced.length > 0) {
      const r = reduced[0];
      const info = CATEGORIES[r.category] || {};
      insights.push(`${info.emoji || '↓'} <b>${r.category}</b> — сократили на ${Math.abs(r.diffPct)}%. Так держать! 🎉`);
    }
  }

  if (insights.length === 0) {
    card.style.display = 'none';
    return;
  }

  // Show up to 2 random insights
  const shuffled = insights.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 2);
  content.innerHTML = selected.map(i => `<div style="padding:4px 0;">${i}</div>`).join('');
  card.style.display = 'block';
}

function renderShock(data, income, expenses) {
  const expenseData = data.filter(t => t.type === 'expense');
  if (expenseData.length === 0) {
    document.getElementById('shock-card').style.display = 'none';
    return;
  }
  document.getElementById('shock-card').style.display = 'block';

  // Pick a random shock fact
  const facts = [];

  // Biggest category
  const catTotals = {};
  for (const tx of expenseData) {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
  }
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const info = CATEGORIES[topCat[0]] || { emoji: '💰' };
    const yearly = topCat[1] * 12;
    facts.push({
      emoji: info.emoji,
      amount: formatMoney(yearly),
      text: `Если тратить на "${topCat[0]}" как в этом месяце — за год уйдёт ${formatMoney(yearly)}`
    });
  }

  // Most expensive day
  const dayTotals = {};
  for (const tx of expenseData) {
    dayTotals[tx.date] = (dayTotals[tx.date] || 0) + tx.amount;
  }
  const topDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
  if (topDay) {
    const d = new Date(topDay[0]);
    const dayStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    facts.push({
      emoji: '📅',
      amount: formatMoney(topDay[1]),
      text: `Самый дорогой день — ${dayStr}`
    });
  }

  // Number of transactions
  facts.push({
    emoji: '🧮',
    amount: expenseData.length.toString(),
    text: `покупок за месяц — в среднем ${Math.round(expenseData.length / 30)} в день`
  });

  const fact = facts[Math.floor(Math.random() * facts.length)];
  document.getElementById('shock-emoji').textContent = fact.emoji;
  document.getElementById('shock-amount').textContent = fact.amount;
  document.getElementById('shock-text').textContent = fact.text;
}

function renderHealth(income, expenses, data) {
  let score = 50;

  // Income vs expense ratio
  if (income > 0) {
    const ratio = expenses / income;
    if (ratio < 0.6) score += 25;
    else if (ratio < 0.8) score += 15;
    else if (ratio < 0.95) score += 5;
    else if (ratio < 1.0) score -= 5;
    else score -= 20;
  }

  // Compare with previous month
  const months = getAvailableMonths();
  const idx = months.indexOf(currentMonth);
  if (idx > 0) {
    const prevData = getMonthData(months[idx - 1]);
    const prevExp = prevData.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    if (prevExp > 0 && expenses < prevExp) score += 10; // improving
    if (prevExp > 0 && expenses > prevExp * 1.2) score -= 10; // worsening
  }

  // Diversity of spending (not too concentrated)
  const expenseData = data.filter(t => t.type === 'expense');
  const catTotals = {};
  for (const tx of expenseData) catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
  const catCount = Object.keys(catTotals).length;
  if (catCount >= 5) score += 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const circle = document.getElementById('health-circle');
  circle.textContent = score;
  circle.style.background = score >= 70 ? 'var(--green-bg)' : score >= 40 ? 'var(--yellow-bg)' : 'var(--red-bg)';
  circle.style.color = score >= 70 ? 'var(--green)' : score >= 40 ? '#E67E22' : 'var(--red)';

  const labels = { good: 'Хорошо!', ok: 'Нормально', bad: 'Нужно внимание' };
  const descs = {
    good: 'Расходы под контролем, так держать!',
    ok: 'Есть куда расти, но в целом неплохо',
    bad: 'Расходы превышают комфортный уровень'
  };
  const level = score >= 70 ? 'good' : score >= 40 ? 'ok' : 'bad';
  document.getElementById('health-label').textContent = labels[level];
  document.getElementById('health-desc').textContent = descs[level];
}

// ============================================================
//  MONTH-VS-MONTH COMPARISON
// ============================================================
function renderComparison(expenses, income) {
  var card = document.getElementById('comparison-card');
  if (!card) return;
  var months = getAvailableMonths();
  var idx = months.indexOf(currentMonth);
  if (idx <= 0) { card.style.display = 'none'; return; }

  var prevMonth = months[idx - 1];
  var prevAllData = getMonthData(prevMonth);
  var prevData = applyDashFilter(prevAllData);
  var prevExp = prevData.filter(function(t) { return t.type === 'expense'; }).reduce(function(s, t) { return s + t.amount; }, 0);
  // BUG-1 fix: income from unfiltered data
  var prevInc = prevAllData.filter(function(t) { return t.type === 'income'; }).reduce(function(s, t) { return s + t.amount; }, 0);

  if (prevExp === 0 && prevInc === 0) { card.style.display = 'none'; return; }

  var expDiff = expenses - prevExp;
  var expPct = prevExp > 0 ? Math.round((expDiff / prevExp) * 100) : 0;
  var incDiff = income - prevInc;
  var incPct = prevInc > 0 ? Math.round((incDiff / prevInc) * 100) : 0;

  var expColor = expDiff <= 0 ? 'var(--green)' : 'var(--red)';
  var expArrow = expDiff <= 0 ? '↓' : '↑';
  var incColor = incDiff >= 0 ? 'var(--green)' : 'var(--red)';
  var incArrow = incDiff >= 0 ? '↑' : '↓';

  card.innerHTML = '<div class="card-title">📊 Сравнение с ' + monthName(prevMonth) + '</div>'
    + '<div style="display:flex;gap:12px;margin-top:8px;">'
    + '<div style="flex:1;padding:10px;border-radius:var(--radius-sm);background:var(--bg-primary);text-align:center;">'
    + '<div style="font-size:0.75rem;color:var(--text-muted);">Расходы</div>'
    + '<div style="font-weight:700;color:' + expColor + ';font-size:1rem;">' + expArrow + ' ' + Math.abs(expPct) + '%</div>'
    + '<div style="font-size:0.7rem;color:var(--text-secondary);">' + (expDiff > 0 ? '+' : '') + formatMoney(expDiff) + '</div>'
    + '</div>'
    + '<div style="flex:1;padding:10px;border-radius:var(--radius-sm);background:var(--bg-primary);text-align:center;">'
    + '<div style="font-size:0.75rem;color:var(--text-muted);">Доходы</div>'
    + '<div style="font-weight:700;color:' + incColor + ';font-size:1rem;">' + incArrow + ' ' + Math.abs(incPct) + '%</div>'
    + '<div style="font-size:0.7rem;color:var(--text-secondary);">' + (incDiff > 0 ? '+' : '') + formatMoney(incDiff) + '</div>'
    + '</div>'
    + '</div>';
  card.style.display = 'block';
}

// ============================================================
//  UPLOAD STREAK (gamification)
// ============================================================
function renderStreak() {
  var card = document.getElementById('streak-card');
  if (!card) return;
  var months = getAvailableMonths();
  if (months.length < 2) { card.style.display = 'none'; return; }

  // Count consecutive months from the latest going backwards
  var streak = 1;
  for (var i = months.length - 1; i > 0; i--) {
    var cur = months[i].split('-').map(Number);
    var prev = months[i - 1].split('-').map(Number);
    var expectedPrev = cur[1] === 1 ? [cur[0] - 1, 12] : [cur[0], cur[1] - 1];
    if (prev[0] === expectedPrev[0] && prev[1] === expectedPrev[1]) {
      streak++;
    } else {
      break;
    }
  }

  var emoji = streak >= 12 ? '💎' : streak >= 6 ? '🔥' : streak >= 3 ? '⚡' : '📅';
  var msg = streak >= 12 ? 'Мастер финансов!' : streak >= 6 ? 'Невероятная серия!' : streak >= 3 ? 'Отличная серия!' : 'Хорошее начало!';
  var best = STATE.gamification && STATE.gamification.streak ? STATE.gamification.streak.best : streak;
  if (streak > best) best = streak;

  // Build visual streak bar (last 8 months)
  var shortNames = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  var streakBarHtml = '<div style="display:flex;gap:3px;margin-top:8px;">';
  var showMonths = months.slice(-8);
  for (var j = 0; j < showMonths.length; j++) {
    var mk = showMonths[j];
    var mm = parseInt(mk.split('-')[1]);
    var isInStreak = months.indexOf(mk) >= months.length - streak;
    var bg = isInStreak ? 'var(--accent)' : 'var(--border)';
    var checkmark = isInStreak ? '✓' : '';
    streakBarHtml += '<div style="flex:1;text-align:center;">'
      + '<div style="height:22px;border-radius:6px;background:' + bg + ';display:flex;align-items:center;justify-content:center;font-size:0.55rem;color:#fff;font-weight:700;">' + checkmark + '</div>'
      + '<div style="font-size:0.55rem;color:var(--text-muted);margin-top:2px;">' + shortNames[mm - 1] + '</div>'
      + '</div>';
  }
  streakBarHtml += '</div>';

  // Next milestone + motivational text
  var nextMilestone = streak < 3 ? 3 : streak < 6 ? 6 : streak < 12 ? 12 : 24;
  var milestoneText = '';
  if (streak < nextMilestone) {
    var remaining = nextMilestone - streak;
    var pctToNext = Math.round(streak / nextMilestone * 100);
    milestoneText = '<div style="margin-top:6px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-muted);margin-bottom:2px;"><span>До ' + nextMilestone + ' мес.</span><span>' + remaining + ' ост.</span></div>'
      + '<div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;"><div style="height:100%;width:' + pctToNext + '%;background:var(--accent);border-radius:2px;"></div></div>'
      + '</div>';
  }
  var bestText = best > streak ? '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">Рекорд: ' + best + ' мес.</div>' : '';

  card.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:4px 0;">'
    + '<div style="font-size:2.2rem;">' + emoji + '</div>'
    + '<div style="flex:1;">'
    + '<div style="font-weight:700;font-size:0.95rem;">Серия: ' + streak + ' мес. подряд</div>'
    + '<div style="font-size:0.8rem;color:var(--text-secondary);">' + msg + '</div>'
    + bestText
    + milestoneText
    + '</div>'
    + '</div>'
    + streakBarHtml;
  card.style.display = 'block';
}

// ============================================================
//  CATEGORY DETAIL
// ============================================================
let catDetailSort = 'date-desc'; // 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'
let catDetailCat = null;

function showCategoryDetail(cat) {
  catDetailCat = cat;
  renderCategoryDetail();
}

function cycleCatDetailSort() {
  const modes = ['date-desc', 'date-asc', 'amount-desc', 'amount-asc'];
  const idx = modes.indexOf(catDetailSort);
  catDetailSort = modes[(idx + 1) % modes.length];
  renderCategoryDetail();
}

function hideMerchantFromDash(merchantPrefix) {
  // Add all transactions from this merchant to dashExclude by creating a custom rule
  const exclude = STATE.settings.dashExclude || [];
  // We'll use category exclude for now — but also offer to recategorize
  const txs = getMonthData(currentMonth).filter(t =>
    t.description.substring(0, 30) === merchantPrefix
  );
  if (txs.length === 0) return;

  // Change these transactions to "Перевод себе" type
  for (const tx of txs) {
    const real = STATE.transactions.find(r => r.id === tx.id);
    if (real) {
      real.category = 'Перевод себе';
      real.type = 'transfer';
    }
  }
  saveState();
  toast(txs.length + ' операций → «Перевод себе»');
  renderCategoryDetail();
}

function renderCategoryDetail() {
  const cat = catDetailCat;
  if (!cat) return;

  const allData = getMonthData(currentMonth);
  const data = allData.filter(t => t.type === 'expense' && t.category === cat);
  const info = CATEGORIES[cat] || { emoji: '❓', color: '#636E72' };
  const total = data.reduce((s, t) => s + t.amount, 0);

  // Group by merchant (use cleaned description for display)
  const merchants = {};
  for (const tx of data) {
    const key = cleanDescription(tx.description).substring(0, 30);
    if (!merchants[key]) merchants[key] = { amount: 0, count: 0, txIds: [] };
    merchants[key].amount += tx.amount;
    merchants[key].count++;
    merchants[key].txIds.push(tx.id);
  }
  const sortedMerchants = Object.entries(merchants).sort((a, b) => b[1].amount - a[1].amount).slice(0, 10);
  const maxMerchant = sortedMerchants[0]?.[1].amount || 1;

  // Sort transactions
  let sorted;
  if (catDetailSort === 'amount-desc') sorted = [...data].sort((a, b) => b.amount - a.amount);
  else if (catDetailSort === 'amount-asc') sorted = [...data].sort((a, b) => a.amount - b.amount);
  else if (catDetailSort === 'date-asc') sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  else sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));

  const sortLabels = {
    'date-desc': '📅 Новые ↓',
    'date-asc': '📅 Старые ↓',
    'amount-desc': '💰 Крупные ↓',
    'amount-asc': '💰 Мелкие ↓'
  };

  let html = `
    <h2 style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      ${info.emoji} ${cat}
    </h2>
    <div class="amount amount-expense amount-lg" style="margin-bottom:16px;">${formatMoney(total)}
      <span style="font-size:0.8rem;color:var(--text-muted);font-weight:400;margin-left:8px;">${data.length} операций</span>
    </div>

    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Где тратили</span>
        <span style="font-size:0.7rem;color:var(--text-muted);">нажми → «Перевод себе»</span>
      </div>
      ${sortedMerchants.map(([name, d]) => {
        const escapedName = name.replace(/'/g, "\\'");
        return `
        <div style="margin-bottom:10px;cursor:pointer;padding:4px 2px;border-radius:8px;transition:background 0.15s;" onclick="event.stopPropagation()">
          <div class="flex-between" style="margin-bottom:2px;">
            <span style="font-size:0.85rem;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
            <span style="display:flex;align-items:center;gap:6px;">
              <span class="amount" style="font-size:0.85rem;">${formatMoney(d.amount)}</span>
              <span style="font-size:0.7rem;color:var(--text-muted);">(${d.count})</span>
              <button onclick="hideMerchantFromDash('${escapedName}')" style="background:none;border:none;cursor:pointer;font-size:0.85rem;padding:2px 6px;border-radius:6px;color:var(--text-muted);" title="Перевести в «Перевод себе»">🔄</button>
            </span>
          </div>
          <div class="cat-bar-wrap"><div class="cat-bar" style="width:${Math.round(d.amount/maxMerchant*100)}%;background:${info.color}"></div></div>
        </div>
      `;}).join('')}
    </div>

    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Все операции (${data.length})</span>
        <span onclick="cycleCatDetailSort()" style="font-size:0.75rem;color:var(--accent);cursor:pointer;user-select:none;">${sortLabels[catDetailSort]}</span>
      </div>
      ${sorted.map(tx => {
        const escapedId = tx.id.replace(/'/g, "\\'");
        return `
        <div class="tx-item" data-txid="${tx.id.replace(/"/g, '&quot;')}" onclick="openRecat('${escapedId}')">
          <div class="tx-info">
            <div class="tx-desc" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55vw;">${cleanDescription(tx.description)}</div>
            <div class="tx-cat">${tx.date} ${tx.time || ''}</div>
          </div>
          <div class="tx-amount amount-expense">${formatMoney(tx.amount)}</div>
        </div>`;
      }).join('')}
    </div>
  `;

  document.getElementById('cat-detail-content').innerHTML = html;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-category-detail').classList.add('active');
}

// ============================================================
//  TRANSACTIONS
// ============================================================
function renderTransactions() {
  const data = getMonthData(currentMonth);
  let filtered = data;

  if (currentFilter === 'expense') filtered = data.filter(t => t.type === 'expense');
  else if (currentFilter === 'income') filtered = data.filter(t => t.type === 'income');
  else if (currentFilter === 'transfer') filtered = data.filter(t => t.type === 'transfer');

  // Category filter chips
  const catCounts = {};
  for (const t of filtered) {
    catCounts[t.category] = (catCounts[t.category] || 0) + 1;
  }
  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const catChipsEl = document.getElementById('tx-cat-filters');
  if (catChipsEl) {
    let chipsHtml = '';
    if (topCats.length > 1) {
      chipsHtml = `<span class="filter-chip ${!currentCatFilter ? 'active' : ''}" onclick="setCatFilter(null)">Все</span>`;
      for (const [cat, count] of topCats) {
        const info = CATEGORIES[cat] || { emoji: '❓' };
        chipsHtml += `<span class="filter-chip ${currentCatFilter === cat ? 'active' : ''}" onclick="setCatFilter('${cat.replace(/'/g, "\\'")}')">${info.emoji} ${count}</span>`;
      }
    }
    catChipsEl.innerHTML = chipsHtml;
  }

  // Apply category filter
  if (currentCatFilter) {
    filtered = filtered.filter(t => t.category === currentCatFilter);
  }

  const search = (document.getElementById('tx-search')?.value || '').toLowerCase();
  if (search) {
    filtered = filtered.filter(t =>
      t.description.toLowerCase().includes(search) ||
      cleanDescription(t.description).toLowerCase().includes(search) ||
      t.category.toLowerCase().includes(search) ||
      (t.merchant || '').toLowerCase().includes(search)
    );
  }

  // Update sort toggle label
  const sortLabels = {
    'date': '📅 Новые ↓',
    'date-asc': '📅 Старые ↓',
    'amount': '💰 Крупные ↓',
    'amount-asc': '💰 Мелкие ↓'
  };
  const sortToggle = document.getElementById('tx-sort-toggle');
  if (sortToggle) sortToggle.textContent = sortLabels[txSortMode] || '📅 Новые ↓';

  let html = '';

  if (txSortMode === 'amount' || txSortMode === 'amount-asc') {
    // Sort by amount
    const sortedByAmount = [...filtered].sort((a, b) =>
      txSortMode === 'amount' ? b.amount - a.amount : a.amount - b.amount
    );
    for (const tx of sortedByAmount) {
      html += renderTxItem(tx);
    }
  } else {
    // Group by date
    const grouped = {};
    for (const tx of filtered) {
      if (!grouped[tx.date]) grouped[tx.date] = [];
      grouped[tx.date].push(tx);
    }
    const dateEntries = Object.entries(grouped);
    if (txSortMode === 'date-asc') dateEntries.sort((a, b) => a[0].localeCompare(b[0]));
    // default: date-desc (already sorted by default since entries follow insertion order which is desc)

    for (const [date, txs] of dateEntries) {
      const d = new Date(date);
      const dayStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
      const dayTotal = txs.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
      html += '<div class="tx-date-header flex-between"><span>' + dayStr + '</span><span class="amount" style="font-size:0.8rem;">' + formatMoney(dayTotal, true) + '</span></div>';
      for (const tx of txs) {
        html += renderTxItem(tx);
      }
    }
  }

  if (!html) {
    html = '<div class="empty-state"><div class="emoji">📭</div><p>Нет операций</p></div>';
  }

  document.getElementById('tx-list').innerHTML = html;
}

function formatTxDate(tx) {
  if (!tx.date) return '';
  const [y, m, d] = tx.date.split('-');
  const shortMonths = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const mon = shortMonths[parseInt(m) - 1] || m;
  const timeStr = tx.time ? ', ' + tx.time : '';
  return parseInt(d) + ' ' + mon + timeStr;
}

function renderTxItem(tx) {
  const info = CATEGORIES[tx.category] || { emoji: '❓' };
  // Special emoji for KOPILKA auto-savings (FIX-4)
  const isKopilka = /KOPILKA|КОПИЛКА/i.test(tx.description || '');
  const emoji = isKopilka ? '🐷' : info.emoji;
  const colorClass = tx.type === 'income' ? 'amount-income' : (tx.type === 'transfer' ? '' : 'amount-expense');
  const sign = tx.type === 'income' ? '+' : (tx.type === 'transfer' ? '' : '-');
  const commentBadge = tx.comment ? ' · 💬' : '';
  const manualBadge = tx.manual ? '✏️ ' : '';
  const selfBadge = tx.category === 'Перевод себе' ? ' · 🔄' : '';
  const escapedId = tx.id.replace(/'/g, "\\'");
  const dateStr = formatTxDate(tx);
  return '<div class="tx-item" data-txid="' + tx.id.replace(/"/g, '&quot;') + '" onclick="openRecat(\'' + escapedId + '\')">'
    + '<div class="tx-emoji">' + emoji + '</div>'
    + '<div class="tx-info">'
    + '<div class="tx-desc">' + manualBadge + cleanDescription(tx.description) + '</div>'
    + '<div class="tx-cat">' + tx.category + ' · ' + (tx.bank || '') + commentBadge + selfBadge + '</div>'
    + (tx.comment ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">💬 ' + tx.comment + '</div>' : '')
    + '</div>'
    + '<div style="text-align:right;min-width:fit-content;display:flex;align-items:center;gap:6px;">'
    + '<div>'
    + '<div class="tx-amount ' + colorClass + '" style="margin-bottom:2px;">' + sign + formatMoney(tx.amount) + '</div>'
    + '<div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">' + dateStr + '</div>'
    + '</div>'
    + (tx.type !== 'excluded' ? '<div class="tx-exclude-btn" onclick="excludeTransaction(\'' + escapedId + '\')" title="Исключить из расходов" style="font-size:0.75rem;color:var(--text-muted);cursor:pointer;padding:4px;">✕</div>' : '')
    + '</div>'
    + '</div>';
}

let lastExcludedTx = null;

function excludeTransaction(txId) {
  event.stopPropagation();
  const tx = STATE.transactions.find(t => t.id === txId);
  if (!tx) return;
  tx._prevType = tx.type;
  tx.type = 'excluded';
  lastExcludedTx = tx;
  saveState();
  renderTransactions();
  renderDashboard();
  // Show undo toast
  if (undoTimer) clearTimeout(undoTimer);
  const t = document.getElementById('toast');
  t.innerHTML = `Исключено: ${cleanDescription(tx.description).substring(0, 25)} <button onclick="undoExclude()" style="margin-left:8px;padding:4px 12px;border-radius:8px;background:var(--accent);color:white;border:none;font-weight:600;cursor:pointer;">Отменить</button>`;
  t.classList.add('show');
  undoTimer = setTimeout(() => { t.classList.remove('show'); lastExcludedTx = null; }, 6000);
}

function undoExclude() {
  if (!lastExcludedTx) return;
  lastExcludedTx.type = lastExcludedTx._prevType || 'expense';
  delete lastExcludedTx._prevType;
  lastExcludedTx = null;
  saveState();
  renderTransactions();
  renderDashboard();
  const t = document.getElementById('toast');
  t.classList.remove('show');
  if (undoTimer) clearTimeout(undoTimer);
}

function toggleTxSort() {
  const modes = ['date', 'date-asc', 'amount', 'amount-asc'];
  const idx = modes.indexOf(txSortMode);
  txSortMode = modes[(idx + 1) % modes.length];
  renderTransactions();
}

function setTxFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === f));
  renderTransactions();
}

function filterTransactions() { renderTransactions(); }
function setCatFilter(cat) { currentCatFilter = cat; renderTransactions(); }

// ============================================================
//  EDIT TRANSACTION (full editor)
// ============================================================
let editingTxId = null;
let editType = 'expense';
let addType = 'expense';

function openRecat(txId) {
  // Now opens full edit modal instead of just category
  openEditTx(txId);
}

function openEditTx(txId) {
  const tx = STATE.transactions.find(t => t.id === txId);
  if (!tx) return;
  editingTxId = txId;

  // Summary
  document.getElementById('edit-tx-summary').innerHTML =
    `<b>${tx.bank || 'Вручную'}</b> · ${tx.date}${tx.time ? ' ' + tx.time : ''}`;

  // Determine edit type
  let txType = tx.type;
  if (tx.category === 'Перевод себе') txType = 'self-transfer';
  setEditType(txType);

  // Fill category dropdown
  fillCategorySelect('edit-category', tx.category);

  // Fields
  document.getElementById('edit-description').value = tx.description || '';
  document.getElementById('edit-comment').value = tx.comment || '';
  document.getElementById('edit-amount').value = tx.amount;

  // Show matched transfer if exists
  const match = findMatchedTransfer(tx);
  if (match) {
    document.getElementById('edit-tx-summary').innerHTML +=
      `<div class="match-banner" style="margin-top:8px;">🔄 <b>Возможный перевод себе:</b> ${match.bank} ${match.date} ${formatMoney(match.amount)}` +
      `<br><span style="font-size:0.75rem;">${match.description}</span></div>`;
  }

  document.getElementById('modal-edit').classList.add('active');
}

function setEditType(t) {
  editType = t;
  document.querySelectorAll('#edit-type-chips .type-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.type === t));
}

function setAddType(t) {
  addType = t;
  document.querySelectorAll('#add-type-chips .type-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.type === t));

  // Auto-select appropriate category
  const catMap = {
    'expense': 'Прочее', 'income': 'Прочее', 'transfer': 'Переводы',
    'debt-out': 'Долг выдан', 'debt-in': 'Долг возврат',
    'cash-expense': 'Наличные расход', 'cash-income': 'Наличные доход'
  };
  const sel = document.getElementById('add-category');
  if (sel && catMap[t]) sel.value = catMap[t];
}

function fillCategorySelect(selectId, currentVal) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = Object.entries(CATEGORIES).map(([cat, info]) =>
    `<option value="${cat}" ${cat === currentVal ? 'selected' : ''}>${info.emoji} ${cat}</option>`
  ).join('');
}

let lastEditSnapshot = null; // for undo edits

function saveEditTx() {
  const tx = STATE.transactions.find(t => t.id === editingTxId);
  if (!tx) return;

  // Snapshot before changes for undo
  const snapshot = {
    id: tx.id,
    category: tx.category,
    type: tx.type,
    description: tx.description,
    comment: tx.comment,
    amount: tx.amount
  };

  const oldCat = tx.category;
  const newCat = document.getElementById('edit-category').value;
  const newDesc = document.getElementById('edit-description').value.trim();
  const newComment = document.getElementById('edit-comment').value.trim();
  const newAmount = parseFloat(document.getElementById('edit-amount').value) || tx.amount;

  // Map editType to actual type
  let newType = editType;
  if (editType === 'self-transfer') {
    newType = 'transfer';
    tx.category = 'Перевод себе';
  } else {
    tx.category = newCat;
  }
  tx.type = newType;
  tx.description = newDesc || tx.description;
  tx.comment = newComment;
  tx.amount = newAmount;

  // Track changes in history
  if (oldCat !== tx.category) addTxHistory(tx, 'category', oldCat, tx.category);
  if (snapshot.amount !== newAmount) addTxHistory(tx, 'amount', snapshot.amount, newAmount);

  // Check if anything actually changed
  const changed = snapshot.category !== tx.category || snapshot.amount !== tx.amount ||
    snapshot.description !== tx.description || snapshot.type !== tx.type;

  // If category changed, remember custom rule
  if (oldCat !== tx.category && tx.description) {
    const key = tx.description.substring(0, 30).toUpperCase();
    STATE.customRules[key] = tx.category;
    // Apply to similar
    STATE.transactions.forEach(t => {
      if (t.id !== tx.id && t.description && t.description.substring(0, 30).toUpperCase() === key) {
        t.category = tx.category;
      }
    });
  }

  saveState();
  closeModal('modal-edit');

  if (changed) {
    lastEditSnapshot = snapshot;
    showUndoEditToast(oldCat !== tx.category
      ? `Категория: ${oldCat} → ${tx.category}`
      : 'Операция обновлена');
  } else {
    toast('Операция обновлена');
  }
  refreshCurrentView();
}

function showUndoEditToast(msg) {
  if (undoTimer) clearTimeout(undoTimer);
  const t = document.getElementById('toast');
  t.innerHTML = `${msg} <button onclick="undoEdit()" style="margin-left:8px;padding:4px 12px;border-radius:8px;background:var(--accent);color:white;border:none;font-weight:600;cursor:pointer;">Отменить</button>`;
  t.classList.add('show');
  undoTimer = setTimeout(() => {
    t.classList.remove('show');
    lastEditSnapshot = null;
  }, 6000);
}

function undoEdit() {
  if (!lastEditSnapshot) return;
  const tx = STATE.transactions.find(t => t.id === lastEditSnapshot.id);
  if (!tx) { lastEditSnapshot = null; return; }

  // Restore from snapshot
  tx.category = lastEditSnapshot.category;
  tx.type = lastEditSnapshot.type;
  tx.description = lastEditSnapshot.description;
  tx.comment = lastEditSnapshot.comment;
  tx.amount = lastEditSnapshot.amount;

  saveState();
  lastEditSnapshot = null;

  const t = document.getElementById('toast');
  t.classList.remove('show');
  if (undoTimer) clearTimeout(undoTimer);

  toast('Изменения отменены');
  refreshCurrentView();
}

let undoTimer = null;
let lastDeletedTx = null;

function deleteEditTx() {
  const tx = STATE.transactions.find(t => t.id === editingTxId);
  if (!tx) return;

  // Move to trash (soft delete)
  tx.deletedAt = new Date().toISOString();
  STATE.trash.push(tx);
  STATE.transactions = STATE.transactions.filter(t => t.id !== editingTxId);
  lastDeletedTx = tx;
  saveState();
  editingTxId = null;
  closeModal('modal-edit');
  showUndoToast(`Удалено: ${tx.description.substring(0, 25)}`);
  refreshCurrentView();
}

let splitOriginalTx = null;

function splitEditTx() {
  if (!requirePro('splitTransactions')) return;
  const tx = STATE.transactions.find(t => t.id === editingTxId);
  if (!tx) return;

  splitOriginalTx = tx;
  closeModal('modal-edit');

  document.getElementById('split-tx-info').innerHTML =
    `<b>${tx.description}</b> · ${tx.date} · <span style="color:var(--expense)">${formatMoney(tx.amount)}</span>`;

  // Start with 2 parts: first gets half, second gets half
  const half = Math.round(tx.amount / 2);
  document.getElementById('split-parts').innerHTML = '';
  addSplitPart(half, tx.category);
  addSplitPart(tx.amount - half, 'Прочее');

  updateSplitRemaining();
  document.getElementById('modal-split').classList.add('active');
}

function addSplitPart(amount, category) {
  const container = document.getElementById('split-parts');
  const idx = container.children.length;
  const div = document.createElement('div');
  div.className = 'split-part';
  div.style.cssText = 'padding:10px;margin-bottom:8px;background:var(--bg-secondary);border-radius:10px;border:1px solid var(--border);';

  let catOptions = Object.entries(CATEGORIES).map(([cat, info]) =>
    `<option value="${cat}" ${cat === (category || 'Прочее') ? 'selected' : ''}>${info.emoji} ${cat}</option>`
  ).join('');

  div.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="font-weight:600;font-size:0.85rem;color:var(--text-muted);">Часть ${idx + 1}</span>
      ${idx >= 2 ? `<button onclick="removeSplitPart(this)" style="margin-left:auto;background:none;border:none;color:var(--red);cursor:pointer;font-size:1rem;">✕</button>` : '<span style="flex:1"></span>'}
    </div>
    <div style="display:flex;gap:8px;">
      <input type="number" class="split-amount" value="${amount || ''}" min="1" step="0.01"
        oninput="updateSplitRemaining()"
        style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.95rem;font-family:'JetBrains Mono',monospace;"
        placeholder="Сумма">
      <select class="split-category" style="flex:1.2;padding:8px 6px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.85rem;">
        ${catOptions}
      </select>
    </div>`;
  container.appendChild(div);
  updateSplitRemaining();
}

function removeSplitPart(btn) {
  btn.closest('.split-part').remove();
  // Re-number parts
  document.querySelectorAll('#split-parts .split-part').forEach((p, i) => {
    p.querySelector('span').textContent = `Часть ${i + 1}`;
  });
  updateSplitRemaining();
}

function updateSplitRemaining() {
  if (!splitOriginalTx) return;
  const total = splitOriginalTx.amount;
  let used = 0;
  document.querySelectorAll('.split-amount').forEach(inp => {
    used += parseFloat(inp.value) || 0;
  });
  const remaining = Math.round((total - used) * 100) / 100;
  const el = document.getElementById('split-remaining');
  const btn = document.getElementById('split-save-btn');

  if (Math.abs(remaining) < 0.01) {
    el.innerHTML = `<span style="color:var(--green);">Сумма совпадает ✓</span>`;
    btn.disabled = false;
  } else if (remaining > 0) {
    el.innerHTML = `<span style="color:var(--accent);">Осталось распределить: ${formatMoney(remaining)}</span>`;
    btn.disabled = true;
  } else {
    el.innerHTML = `<span style="color:var(--red);">Превышение на ${formatMoney(Math.abs(remaining))}</span>`;
    btn.disabled = true;
  }
}

function saveSplit() {
  if (!splitOriginalTx) return;
  const tx = splitOriginalTx;
  const parts = [];

  document.querySelectorAll('#split-parts .split-part').forEach(p => {
    const amount = parseFloat(p.querySelector('.split-amount').value) || 0;
    const category = p.querySelector('.split-category').value;
    if (amount > 0) parts.push({ amount, category });
  });

  if (parts.length < 2) { toast('Нужно минимум 2 части'); return; }

  const totalParts = parts.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(totalParts - tx.amount) > 0.01) { toast('Сумма частей не совпадает'); return; }

  // First part stays as original tx (updated)
  tx.amount = parts[0].amount;
  tx.category = parts[0].category;
  tx.comment = (tx.comment ? tx.comment + ' · ' : '') + 'Разделено';

  // Remaining parts become new transactions
  for (let i = 1; i < parts.length; i++) {
    const newTx = {
      ...tx,
      id: `split_${Date.now()}_${i}_${txHash('split', tx.date, tx.time || '', String(parts[i].amount), tx.description)}`,
      amount: parts[i].amount,
      category: parts[i].category,
      comment: (tx.comment || '') + (i === 1 ? '' : ' · Разделено'),
      splitFrom: tx.id
    };
    STATE.transactions.push(newTx);
  }

  STATE.transactions.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
  saveState();

  closeModal('modal-split');
  toast(`Операция разбита на ${parts.length} части`);
  splitOriginalTx = null;
  refreshCurrentView();
}

function showUndoToast(msg) {
  if (undoTimer) clearTimeout(undoTimer);
  const t = document.getElementById('toast');
  t.innerHTML = `${msg} <button onclick="undoDelete()" style="margin-left:8px;padding:4px 12px;border-radius:8px;background:var(--accent);color:white;border:none;font-weight:600;cursor:pointer;">Отменить</button>`;
  t.classList.add('show');
  undoTimer = setTimeout(() => {
    t.classList.remove('show');
    lastDeletedTx = null;
  }, 6000);
}

function undoDelete() {
  if (!lastDeletedTx) return;
  // Restore from trash
  STATE.trash = STATE.trash.filter(t => t.id !== lastDeletedTx.id);
  delete lastDeletedTx.deletedAt;
  STATE.transactions.push(lastDeletedTx);
  STATE.transactions.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
  saveState();
  lastDeletedTx = null;

  const t = document.getElementById('toast');
  t.classList.remove('show');
  if (undoTimer) clearTimeout(undoTimer);

  toast('Операция восстановлена!');
  refreshCurrentView();
}

// ============================================================
//  MANUAL ADD
// ============================================================
function openManualAdd() {
  addType = 'expense';
  document.querySelectorAll('#add-type-chips .type-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.type === 'expense'));

  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('add-date').value = today;
  document.getElementById('add-amount').value = '';
  document.getElementById('add-description').value = '';
  document.getElementById('add-comment').value = '';
  fillCategorySelect('add-category', 'Прочее');

  document.getElementById('modal-add').classList.add('active');
}

function saveManualTx() {
  const dateVal = document.getElementById('add-date').value;
  const amount = parseFloat(document.getElementById('add-amount').value);
  const desc = document.getElementById('add-description').value.trim();
  const comment = document.getElementById('add-comment').value.trim();
  let cat = document.getElementById('add-category').value;

  if (!dateVal || !amount || amount <= 0) {
    toast('Укажите дату и сумму');
    return;
  }
  if (!desc) {
    toast('Укажите описание');
    return;
  }

  // Map addType to transaction type and category
  let type = 'expense';
  switch (addType) {
    case 'income': type = 'income'; break;
    case 'transfer': type = 'transfer'; cat = 'Переводы'; break;
    case 'debt-out': type = 'expense'; cat = 'Долг выдан'; break;
    case 'debt-in': type = 'income'; cat = 'Долг возврат'; break;
    case 'cash-expense': type = 'expense'; cat = 'Наличные расход'; break;
    case 'cash-income': type = 'income'; cat = 'Наличные доход'; break;
    default: type = 'expense';
  }

  const [yyyy, mm, dd] = dateVal.split('-');
  const monthKey = `${yyyy}-${mm}`;

  const tx = {
    id: `manual_${Date.now()}_${txHash('manual', dateVal, '', String(amount), desc)}`,
    date: dateVal,
    time: new Date().toTimeString().substr(0, 5),
    monthKey: monthKey,
    amount: amount,
    type: type,
    description: desc,
    bankCategory: null,
    category: cat,
    merchant: desc,
    balance: null,
    bank: 'Вручную',
    comment: comment,
    manual: true
  };

  STATE.transactions.push(tx);
  saveState();
  closeModal('modal-add');
  toast(`Добавлено: ${desc} — ${formatMoney(amount)}`);

  // Switch to the month of the new tx
  currentMonth = monthKey;
  refreshCurrentView();
}

// ============================================================
//  TRANSFER MATCHING (переводы между своими картами)
// ============================================================
function findMatchedTransfer(tx) {
  // Look for a matching transfer: same amount, same date ±1 day, different bank, opposite direction
  if (!tx || tx.type === 'self-transfer') return null;

  const txDate = new Date(tx.date);
  const matchType = tx.type === 'income' ? 'expense' : 'income';
  const isTransferCategory = ['Переводы', 'Перевод себе'].includes(tx.category) ||
    tx.description.toUpperCase().includes('ПЕРЕВОД') ||
    tx.description.toUpperCase().includes('ВНУТРЕННИЙ');

  if (!isTransferCategory) return null;

  return STATE.transactions.find(t => {
    if (t.id === tx.id) return false;
    if (t.bank === tx.bank) return false; // Same bank = not inter-bank transfer
    if (Math.abs(t.amount - tx.amount) > 1) return false; // Amount must match (±1₽ tolerance)

    const tDate = new Date(t.date);
    const dayDiff = Math.abs(txDate - tDate) / (1000 * 60 * 60 * 24);
    if (dayDiff > 2) return false; // Within 2 days

    return true;
  });
}

function autoMatchTransfers() {
  // Auto-detect transfers between own cards and mark them
  let matched = 0;
  const processed = new Set();

  for (const tx of STATE.transactions) {
    if (processed.has(tx.id)) continue;
    if (tx.category === 'Перевод себе') continue;

    const match = findMatchedTransfer(tx);
    if (match && !processed.has(match.id)) {
      // Mark both as self-transfer
      tx.category = 'Перевод себе';
      tx.type = 'transfer';
      match.category = 'Перевод себе';
      match.type = 'transfer';
      processed.add(tx.id);
      processed.add(match.id);
      matched++;
    }
  }

  if (matched > 0) {
    saveState();
    toast(`Найдено ${matched} переводов между картами`);
    refreshCurrentView();
  }
  return matched;
}

// ============================================================
//  DEBTS SUMMARY
// ============================================================
function getDebts() {
  const debts = [];
  const txs = STATE.transactions.filter(t => t.category === 'Долг выдан' || t.category === 'Долг возврат');

  // Group by description (person name)
  const byPerson = {};
  for (const tx of txs) {
    const person = tx.description || 'Неизвестно';
    if (!byPerson[person]) byPerson[person] = { given: 0, returned: 0, txs: [] };
    if (tx.category === 'Долг выдан') byPerson[person].given += tx.amount;
    else byPerson[person].returned += tx.amount;
    byPerson[person].txs.push(tx);
  }

  for (const [person, data] of Object.entries(byPerson)) {
    const remaining = data.given - data.returned;
    if (Math.abs(remaining) > 1) {
      debts.push({ person, given: data.given, returned: data.returned, remaining, txs: data.txs });
    }
  }

  return debts;
}

// ============================================================
//  DETAIL MODALS (clickable dashboard tiles)
// ============================================================
function openIncomeDetail() {
  const allData = getMonthData(currentMonth);
  const incomeTxs = allData.filter(t => t.type === 'income');
  const totalIncome = incomeTxs.reduce((s, t) => s + t.amount, 0);

  if (incomeTxs.length === 0) {
    showDetailModal('💰 Доходы', '<div class="empty-state"><p>Нет доходов в этом месяце</p></div>');
    return;
  }

  // Sort by date desc
  const sorted = [...incomeTxs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  let html = `<div class="detail-section">
    <h4>Источники дохода · ${formatMoney(totalIncome)}</h4>`;

  for (const tx of sorted) {
    const emoji = (CATEGORIES[tx.category] || {}).emoji || '💰';
    const desc = (tx.description || 'Прочее').substring(0, 50);
    const dateStr = tx.date ? tx.date.split('-').reverse().join('.') : '';
    const escapedId = tx.id.replace(/'/g, "\\'");
    html += `
      <div class="detail-row" style="flex-wrap:wrap;">
        <div class="dl" style="flex:1;min-width:0;">
          <div class="dl-emoji">${emoji}</div>
          <div style="min-width:0;">
            <div class="dl-text" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${desc}</div>
            <div class="dl-sub">${dateStr} · ${tx.category}</div>
          </div>
        </div>
        <div class="dr" style="display:flex;align-items:center;gap:6px;">
          <div class="dr-amount amount-income">+${formatMoney(tx.amount)}</div>
          <button onclick="reclassifyIncomeTx('${escapedId}')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:2px 6px;cursor:pointer;font-size:0.7rem;color:var(--text-muted);" title="Это не доход">✕</button>
        </div>
      </div>`;
  }
  html += `</div>
  <div style="margin-top:8px;padding:8px 12px;background:rgba(0,0,0,0.03);border-radius:8px;font-size:0.75rem;color:var(--text-muted);">
    💡 Нажмите ✕ чтобы убрать операцию из доходов → Перевод себе
  </div>`;

  // Compare to previous month
  const prevMonth = getPrevMonth(currentMonth);
  const prevData = getMonthData(prevMonth);
  const prevIncome = prevData.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  if (prevIncome > 0) {
    const diff = totalIncome - prevIncome;
    const diffPct = Math.round(diff / prevIncome * 100);
    const arrow = diff >= 0 ? '📈' : '📉';
    const color = diff >= 0 ? 'var(--green)' : 'var(--red)';
    html += `<div class="detail-tip">
      ${arrow} <b>Сравнение:</b> ${diff >= 0 ? '+' : ''}${formatMoney(diff)} (${diffPct >= 0 ? '+' : ''}${diffPct}%) относительно ${monthName(prevMonth)}
    </div>`;
  }

  // Personal tips
  const transferIncome = incomeTxs.filter(t => t.category === 'Переводы' || t.category === 'Перевод себе');
  const realIncome = totalIncome - transferIncome.reduce((s, t) => s + t.amount, 0);
  if (transferIncome.length > 0 && realIncome > 0) {
    html += `<div class="detail-tip">
      <span class="tip-emoji">💡</span> <b>Реальный доход:</b> ${formatMoney(realIncome)} (без переводов себе). Переводами пришло ${formatMoney(totalIncome - realIncome)}.
    </div>`;
  }

  showDetailModal('💰 Доходы · ' + monthName(currentMonth), html);
}

function reclassifyIncomeTx(txId) {
  const tx = STATE.transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.type = 'transfer';
  tx.category = 'Перевод себе';
  saveState();
  toast('→ Перевод себе');
  closeDetailModal();
  renderDashboard();
}

function openExpenseDetail() {
  const allData = getMonthData(currentMonth);
  const data = applyDashFilter(allData);
  const expenseTxs = data.filter(t => t.type === 'expense');
  const totalExpense = expenseTxs.reduce((s, t) => s + t.amount, 0);

  if (expenseTxs.length === 0) {
    showDetailModal('🔥 Расходы', '<div class="empty-state"><p>Нет расходов в этом месяце</p></div>');
    return;
  }

  // Group by category
  const byCat = {};
  for (const tx of expenseTxs) {
    if (!byCat[tx.category]) byCat[tx.category] = { amount: 0, count: 0, txs: [] };
    byCat[tx.category].amount += tx.amount;
    byCat[tx.category].count++;
    byCat[tx.category].txs.push(tx);
  }

  const sorted = Object.entries(byCat).sort((a, b) => b[1].amount - a[1].amount);
  const maxAmount = sorted.length > 0 ? sorted[0][1].amount : 1;

  // Visual bars — clickable → drill down into category
  let html = `<div class="detail-section"><h4>Расходы по категориям</h4>`;
  for (const [cat, info] of sorted) {
    const pct = Math.round(info.amount / totalExpense * 100);
    const barPct = Math.round(info.amount / maxAmount * 100);
    const emoji = (CATEGORIES[cat] || {}).emoji || '❓';
    const color = (CATEGORIES[cat] || {}).color || '#636E72';
    const escapedCat = cat.replace(/'/g, "\\'");
    html += `
      <div class="detail-bar-row" onclick="closeModal('modal-detail');showCategoryDetail('${escapedCat}')">
        <div class="detail-bar-label">${emoji} ${cat}</div>
        <div class="detail-bar-track"><div class="detail-bar-fill" style="width:${barPct}%;background:${color};"></div></div>
        <div class="detail-bar-val">${formatMoney(info.amount)} <span style="font-size:0.7rem;color:var(--text-muted);">${pct}%</span></div>
      </div>`;
  }
  html += `</div>`;

  // Top 5 biggest single expenses — clickable → open edit
  const topTxs = [...expenseTxs].sort((a, b) => b.amount - a.amount).slice(0, 5);
  html += `<div class="detail-section"><h4>Самые крупные траты</h4>`;
  for (const tx of topTxs) {
    const emoji = (CATEGORIES[tx.category] || {}).emoji || '❓';
    const escapedId = tx.id.replace(/'/g, "\\'");
    html += `
      <div class="detail-row" onclick="closeModal('modal-detail');openEditTx('${escapedId}')">
        <div class="dl">
          <div class="dl-emoji">${emoji}</div>
          <div>
            <div class="dl-text">${cleanDescription(tx.description)}</div>
            <div class="dl-sub">${tx.date} · ${tx.category}</div>
          </div>
        </div>
        <div class="dr">
          <div class="dr-amount amount-expense">-${formatMoney(tx.amount)}</div>
        </div>
      </div>`;
  }
  html += `</div>`;

  // Compare to previous month
  const prevMonth = getPrevMonth(currentMonth);
  const prevData = getMonthData(prevMonth);
  const prevExpense = prevData.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  if (prevExpense > 0) {
    const diff = totalExpense - prevExpense;
    const diffPct = Math.round(diff / prevExpense * 100);
    const isMore = diff > 0;
    html += `<div class="detail-tip">
      ${isMore ? '📈' : '📉'} <b>Сравнение:</b> ${isMore ? 'на ' : 'на '}${formatMoney(Math.abs(diff))} ${isMore ? 'больше' : 'меньше'} чем в ${monthName(prevMonth)} (${diffPct >= 0 ? '+' : ''}${diffPct}%)
    </div>`;
  }

  // Tips
  const dailyAvg = totalExpense / new Date(currentMonth.split('-')[0], currentMonth.split('-')[1], 0).getDate();
  html += `<div class="detail-tip">
    <span class="tip-emoji">📊</span> <b>Средний расход в день:</b> ${formatMoney(dailyAvg)}<br>
    Всего операций: ${expenseTxs.length}, средний чек: ${formatMoney(totalExpense / expenseTxs.length)}
  </div>`;

  // Suggest where to save
  if (sorted.length >= 2) {
    const topCat = sorted[0];
    html += `<div class="detail-tip">
      <span class="tip-emoji">💡</span> <b>Где сэкономить?</b> Категория «${topCat[0]}» — ${Math.round(topCat[1].amount / totalExpense * 100)}% всех расходов (${formatMoney(topCat[1].amount)}). Попробуй сократить на 10% — сэкономишь ${formatMoney(topCat[1].amount * 0.1)} в месяц.
    </div>`;
  }

  // Show excluded totals (transfers, business, etc.)
  const excludedCats = STATE.settings.dashExclude || [];
  const allMonthData = getMonthData(currentMonth);
  const transfersTotal = allMonthData.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);
  const excludedByFilter = allMonthData.filter(t => t.type === 'expense' && excludedCats.includes(t.category));
  const excludedMap = {};
  for (const tx of excludedByFilter) {
    excludedMap[tx.category] = (excludedMap[tx.category] || 0) + tx.amount;
  }
  let exclParts = [];
  if (transfersTotal > 0) exclParts.push(`Переводы ${formatMoney(transfersTotal)}`);
  for (const [cat, amt] of Object.entries(excludedMap).sort((a, b) => b[1] - a[1])) {
    exclParts.push(`${cat} ${formatMoney(amt)}`);
  }
  if (exclParts.length > 0) {
    html += `<div class="detail-tip" style="opacity:0.7;">
      <span class="tip-emoji">🚫</span> <b>Исключено:</b> ${exclParts.join(', ')}
    </div>`;
  }

  showDetailModal('🔥 Расходы · ' + monthName(currentMonth), html);
}

function openForecastDetail() {
  const allData = getMonthData(currentMonth);
  const data = applyDashFilter(allData);

  const income = data.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = data.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const transfers = data.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);
  const balance = income - expenses;

  const salaryDate = parseInt(STATE.settings.salaryDate) || 25;
  const [y, m] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = new Date();
  const isCurrentMonth = (today.getFullYear() === y && today.getMonth() + 1 === m);

  let daysPassed, daysLeft;
  if (isCurrentMonth) {
    daysPassed = today.getDate();
    daysLeft = Math.max(salaryDate - today.getDate(), 1);
    if (today.getDate() >= salaryDate) daysLeft = daysInMonth - today.getDate() + salaryDate;
  } else {
    daysPassed = daysInMonth;
    daysLeft = 0;
  }

  const avgDailySpend = daysPassed > 0 ? expenses / daysPassed : 0;
  const projectedTotal = avgDailySpend * daysInMonth;
  const dailyLimit = daysLeft > 0 ? Math.max(balance / daysLeft, 0) : 0;
  const savingsRate = income > 0 ? Math.round((income - expenses) / income * 100) : 0;

  let html = '';

  // Summary block
  html += `<div class="detail-section"><h4>Сводка</h4>
    <div class="detail-row"><div class="dl"><div class="dl-text">💰 Доходы</div></div><div class="dr"><div class="dr-amount amount-income">+${formatMoney(income)}</div></div></div>
    <div class="detail-row"><div class="dl"><div class="dl-text">🔥 Расходы</div></div><div class="dr"><div class="dr-amount amount-expense">-${formatMoney(expenses)}</div></div></div>
    <div class="detail-row"><div class="dl"><div class="dl-text">💸 Переводы</div></div><div class="dr"><div class="dr-amount">${formatMoney(transfers)}</div></div></div>
    <div class="detail-row"><div class="dl"><div class="dl-text"><b>📊 Баланс</b></div></div><div class="dr"><div class="dr-amount" style="color:${balance >= 0 ? 'var(--green)' : 'var(--red)'};">${balance >= 0 ? '+' : ''}${formatMoney(balance)}</div></div></div>
  </div>`;

  // Daily analysis
  html += `<div class="detail-section"><h4>Ежедневный анализ</h4>
    <div class="detail-row"><div class="dl"><div class="dl-text">📅 Прошло дней</div></div><div class="dr"><div class="dr-amount">${daysPassed} из ${daysInMonth}</div></div></div>
    <div class="detail-row"><div class="dl"><div class="dl-text">📊 Средний расход/день</div></div><div class="dr"><div class="dr-amount">${formatMoney(avgDailySpend)}</div></div></div>`;

  if (isCurrentMonth && daysLeft > 0) {
    html += `<div class="detail-row"><div class="dl"><div class="dl-text">⏳ Дней до з/п (${salaryDate}-е)</div></div><div class="dr"><div class="dr-amount">${daysLeft}</div></div></div>
    <div class="detail-row"><div class="dl"><div class="dl-text"><b>✅ Лимит на день</b></div></div><div class="dr"><div class="dr-amount" style="color:var(--accent);font-size:1.1rem;">${formatMoney(dailyLimit)}</div></div></div>`;
  }
  html += `</div>`;

  // Projection
  if (isCurrentMonth) {
    const willSave = income - projectedTotal;
    html += `<div class="detail-section"><h4>Прогноз до конца месяца</h4>
      <div class="detail-row"><div class="dl"><div class="dl-text">📈 Темп расходов</div></div><div class="dr"><div class="dr-amount">${formatMoney(avgDailySpend)}/день</div></div></div>
      <div class="detail-row"><div class="dl"><div class="dl-text">📊 Прогноз на месяц</div></div><div class="dr"><div class="dr-amount">${formatMoney(projectedTotal)}</div></div></div>
      <div class="detail-row"><div class="dl"><div class="dl-text"><b>${willSave >= 0 ? '✅ Сэкономишь' : '⚠️ Перерасход'}</b></div></div><div class="dr"><div class="dr-amount" style="color:${willSave >= 0 ? 'var(--green)' : 'var(--red)'};">${formatMoney(Math.abs(willSave))}</div></div></div>
    </div>`;
  }

  // Historical comparison (3-month avg)
  const totalTrends = calculateTotalTrends(currentMonth);
  if (totalTrends && totalTrends.avgExpense > 0) {
    const avgExp = totalTrends.avgExpense;
    const avgInc = totalTrends.avgIncome;
    const expDiff = expenses - avgExp;
    const expDiffPct = Math.round((expDiff / avgExp) * 100);
    const expColor = expDiff > 0 ? 'var(--red)' : 'var(--green)';
    const expArrow = expDiff > 0 ? '↑' : expDiff < 0 ? '↓' : '→';

    html += `<div class="detail-section"><h4>📊 Сравнение с обычным</h4>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px;">Среднее за ${totalTrends.monthsUsed} мес.</div>
      <div class="detail-row"><div class="dl"><div class="dl-text">Обычный доход</div></div><div class="dr"><div class="dr-amount">${formatMoney(avgInc)}</div></div></div>
      <div class="detail-row"><div class="dl"><div class="dl-text">Обычные расходы</div></div><div class="dr"><div class="dr-amount">${formatMoney(avgExp)}</div></div></div>
      <div class="detail-row"><div class="dl"><div class="dl-text"><b>${expArrow} Отклонение расходов</b></div></div><div class="dr"><div class="dr-amount" style="color:${expColor};">${expDiff > 0 ? '+' : ''}${formatMoney(expDiff)} (${expDiffPct > 0 ? '+' : ''}${expDiffPct}%)</div></div></div>`;

    // Progress bar: actual vs average
    const barActual = Math.min(Math.round(expenses / Math.max(avgExp, expenses) * 100), 100);
    const barAvg = Math.min(Math.round(avgExp / Math.max(avgExp, expenses) * 100), 100);
    html += `<div style="margin-top:8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:0.75rem;width:60px;">Факт</span>
        <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${barActual}%;background:${expenses > avgExp ? 'var(--red)' : 'var(--green)'};border-radius:4px;transition:width 0.3s;"></div></div>
        <span style="font-size:0.75rem;min-width:70px;text-align:right;">${formatMoney(expenses)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:0.75rem;width:60px;">Среднее</span>
        <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${barAvg}%;background:var(--accent);border-radius:4px;transition:width 0.3s;"></div></div>
        <span style="font-size:0.75rem;min-width:70px;text-align:right;">${formatMoney(avgExp)}</span>
      </div>
    </div>`;

    html += `</div>`;
  }

  // Savings rate
  html += `<div class="detail-tip">
    <span class="tip-emoji">💎</span> <b>Норма сбережений:</b> ${savingsRate}%
    ${savingsRate >= 20 ? ' — отлично! Финансовые эксперты рекомендуют 20%+.' :
      savingsRate >= 10 ? ' — неплохо. Попробуй довести до 20%.' :
      savingsRate >= 0 ? ' — маловато. Рекомендуется откладывать хотя бы 10-20%.' :
      ' — расходы превышают доходы. Нужно сокращать траты.'}
  </div>`;

  // Week-by-week breakdown
  const weeks = {};
  for (const tx of data.filter(t => t.type === 'expense')) {
    const d = new Date(tx.date);
    const weekNum = Math.ceil(d.getDate() / 7);
    const label = `Неделя ${weekNum}`;
    if (!weeks[label]) weeks[label] = 0;
    weeks[label] += tx.amount;
  }
  if (Object.keys(weeks).length > 1) {
    const maxWeek = Math.max(...Object.values(weeks));
    html += `<div class="detail-section"><h4>Расходы по неделям</h4>`;
    for (const [week, amount] of Object.entries(weeks)) {
      const barPct = Math.round(amount / maxWeek * 100);
      html += `<div class="detail-bar-row">
        <div class="detail-bar-label">${week}</div>
        <div class="detail-bar-track"><div class="detail-bar-fill" style="width:${barPct}%;background:var(--accent);"></div></div>
        <div class="detail-bar-val">${formatMoney(amount)}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // Personal action tips
  if (isCurrentMonth && balance < 0) {
    html += `<div class="detail-tip" style="background:var(--red-bg);">
      <span class="tip-emoji">🚨</span> <b>Расходы превысили доходы.</b> Проверь крупные траты, возможно часть — это переводы себе на другие карты. Нажми на операцию → смени тип на «Перевод себе».
    </div>`;
  } else if (isCurrentMonth && dailyLimit < avgDailySpend) {
    html += `<div class="detail-tip" style="background:var(--yellow-bg);">
      <span class="tip-emoji">⚡</span> <b>Темп высоковат.</b> Средний расход ${formatMoney(avgDailySpend)}/день, а лимит ${formatMoney(dailyLimit)}/день. Попробуй снизить на ${formatMoney(avgDailySpend - dailyLimit)} в день.
    </div>`;
  }

  showDetailModal('📊 Детальный прогноз · ' + monthName(currentMonth), html);
}

function getPrevMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const prev = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2, '0')}`;
  return prev;
}

function showDetailModal(title, content) {
  document.getElementById('detail-content').innerHTML = `
    <h3 style="margin-bottom:16px;font-size:1.1rem;">${title}</h3>
    ${content}
  `;
  document.getElementById('modal-detail').classList.add('active');
}

// ============================================================
//  BANK INSTRUCTIONS MODAL
// ============================================================
function showBankInstructions() {
  trackEvent('bank_instructions_shown');
  showDetailModal('📋 Как скачать выписку', '<div style="text-align:left;">'
    + '<div style="padding:12px;background:var(--bg-primary);border-radius:var(--radius-sm);margin-bottom:12px;">'
    + '<div style="font-weight:700;margin-bottom:8px;">🟢 Сбербанк (СберБанк Онлайн)</div>'
    + '<div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">'
    + '1. Откройте приложение Сбербанк Онлайн<br>'
    + '2. Выберите карту или счёт<br>'
    + '3. Нажмите «Выписка» или «История операций»<br>'
    + '4. Выберите период (например, за месяц)<br>'
    + '5. Нажмите «Сохранить» или «Экспорт» → формат <strong>PDF</strong><br>'
    + '6. Загрузите полученный файл сюда'
    + '</div></div>'
    + '<div style="padding:12px;background:var(--bg-primary);border-radius:var(--radius-sm);margin-bottom:12px;">'
    + '<div style="font-weight:700;margin-bottom:8px;">🟡 Т-Банк (Тинькофф)</div>'
    + '<div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">'
    + '1. Откройте приложение Т-Банк<br>'
    + '2. Перейдите в раздел «Счета» → выберите карту<br>'
    + '3. Нажмите «Выписка» или «Справка»<br>'
    + '4. Выберите «Справка о движении средств»<br>'
    + '5. Укажите период и формат <strong>PDF</strong><br>'
    + '6. Загрузите файл сюда'
    + '</div></div>'
    + '<div style="padding:12px;background:var(--bg-primary);border-radius:var(--radius-sm);">'
    + '<div style="font-weight:700;margin-bottom:8px;">📋 Другие банки (CSV)</div>'
    + '<div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">'
    + '1. Скачайте выписку из личного кабинета банка<br>'
    + '2. Формат: CSV (разделитель — запятая или точка с запятой)<br>'
    + '3. Обязательные колонки: дата, описание, сумма<br>'
    + '4. Загрузите .csv или .tsv файл сюда'
    + '</div></div>'
    + '</div>');
}

// ============================================================
//  HELPERS
// ============================================================
function refreshCurrentView() {
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) {
    if (activeScreen.id === 'screen-dashboard') renderDashboard();
    if (activeScreen.id === 'screen-transactions') renderTransactions();
    if (activeScreen.id === 'screen-settings') renderDebtsSection();
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ============================================================
//  WOW SCREEN (post-upload summary)
// ============================================================
function showWowScreen(newTx, uniqueCount, dupeCount) {
  if (uniqueCount === 0) return;

  // Determine period(s) from new transactions
  const monthKeys = [...new Set(newTx.map(t => t.monthKey))].sort();
  const periodStr = monthKeys.map(k => monthName(k)).join(', ');

  // Calculate stats from new unique transactions only
  const income = newTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = newTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const transfers = newTx.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);

  // Top categories by expense amount
  const catMap = {};
  newTx.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Count "Прочее" items
  const miscCount = newTx.filter(t => t.category === 'Прочее' && t.type === 'expense').length;

  // Build HTML
  let html = '<h3 style="margin-bottom:12px;text-align:center;">Выписка загружена!</h3>';

  // Stats grid
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">';

  html += '<div style="background:var(--bg-secondary);border-radius:12px;padding:12px;text-align:center;">'
    + '<div style="font-size:0.8rem;color:var(--text-muted);">Операций</div>'
    + '<div style="font-size:1.3rem;font-weight:700;">' + uniqueCount + '</div>'
    + (dupeCount > 0 ? '<div style="font-size:0.7rem;color:var(--text-muted);">+' + dupeCount + ' дубл. пропущено</div>' : '')
    + '</div>';

  html += '<div style="background:var(--bg-secondary);border-radius:12px;padding:12px;text-align:center;">'
    + '<div style="font-size:0.8rem;color:var(--text-muted);">Период</div>'
    + '<div style="font-size:1rem;font-weight:600;">' + periodStr + '</div>'
    + '</div>';

  if (income > 0) {
    html += '<div style="background:var(--bg-secondary);border-radius:12px;padding:12px;text-align:center;">'
      + '<div style="font-size:0.8rem;color:var(--text-muted);">Доходы</div>'
      + '<div style="font-size:1.1rem;font-weight:700;color:var(--green);">+' + formatMoney(income) + '</div>'
      + '</div>';
  }

  if (expenses > 0) {
    html += '<div style="background:var(--bg-secondary);border-radius:12px;padding:12px;text-align:center;">'
      + '<div style="font-size:0.8rem;color:var(--text-muted);">Расходы</div>'
      + '<div style="font-size:1.1rem;font-weight:700;color:var(--red);">-' + formatMoney(expenses) + '</div>'
      + '</div>';
  }

  if (transfers > 0) {
    html += '<div style="background:var(--bg-secondary);border-radius:12px;padding:12px;text-align:center;">'
      + '<div style="font-size:0.8rem;color:var(--text-muted);">Переводы</div>'
      + '<div style="font-size:1.1rem;font-weight:600;color:var(--text-muted);">' + formatMoney(transfers) + '</div>'
      + '</div>';
  }

  html += '</div>';

  // Top categories
  if (topCats.length > 0 && expenses > 0) {
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;">Топ расходов:</div>';
    topCats.forEach(([cat, amount]) => {
      const pct = Math.round(amount / expenses * 100);
      const catIcon = (CATEGORIES[cat]) ? CATEGORIES[cat].emoji : '📦';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">'
        + '<span>' + catIcon + ' ' + cat + '</span>'
        + '<span style="font-weight:600;">' + formatMoney(amount) + ' <span style="color:var(--text-muted);font-weight:400;">(' + pct + '%)</span></span>'
        + '</div>';
    });
    html += '</div>';
  }

  // Type breakdown (how many expenses, transfers, business)
  const expCount = newTx.filter(t => t.type === 'expense').length;
  const trfCount = newTx.filter(t => t.type === 'transfer').length;
  const bizCount = newTx.filter(t => t.category === 'Бизнес').length;
  html += '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;text-align:center;">'
    + expCount + ' расход' + pluralize(expCount, '', 'а', 'ов')
    + ', ' + trfCount + ' перевод' + pluralize(trfCount, '', 'а', 'ов')
    + (bizCount > 0 ? ', ' + bizCount + ' бизнес' : '')
    + '</div>';

  // "Прочее" notice with button
  const miscPct = expenses > 0 ? Math.round(miscCount / expCount * 100) : 0;
  if (miscCount > 0) {
    html += '<div style="background:rgba(255,193,7,0.12);border-radius:10px;padding:10px 12px;font-size:0.85rem;">'
      + '❓ <b>Нужно разобрать:</b> ' + miscCount + ' операц' + pluralize(miscCount, 'ия', 'ии', 'ий') + ' в «Прочее» (' + miscPct + '%)'
      + (miscPct >= 20 ? '<br><button onclick="closeModal(\'modal-wow\');showScreen(\'transactions\');setCatFilter(\'Прочее\')" style="margin-top:8px;padding:6px 14px;border-radius:8px;background:var(--accent);color:white;border:none;font-size:0.82rem;font-weight:600;cursor:pointer;">Разобрать Прочее</button>' : '')
      + '</div>';
  }

  document.getElementById('wow-content').innerHTML = html;
  document.getElementById('modal-wow').classList.add('active');
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// ============================================================
//  ADVISOR
// ============================================================
function renderAdvisor() {
  const data = getMonthData(currentMonth);
  const income = data.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = data.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const expenseData = data.filter(t => t.type === 'expense');

  const catTotals = {};
  for (const tx of expenseData) catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;

  const advice = [];

  // 1. Salary forecast
  const salaryDate = parseInt(STATE.settings.salaryDate) || 25;
  const balance = income - expenses;
  const [y, m] = currentMonth.split('-').map(Number);
  const now = new Date();
  const isCurrentMonth = (now.getFullYear() === y && now.getMonth() + 1 === m);

  if (isCurrentMonth && balance < expenses * 0.3) {
    const daysLeft = Math.max(salaryDate - now.getDate(), 1);
    const dailyLimit = Math.round(balance / daysLeft);
    advice.push({
      type: 'critical', emoji: '🚨',
      tag: 'Важно',
      text: `При текущем темпе к ${salaryDate}-му на счету может быть мало средств. Рекомендуем сократить расходы до <strong>${formatMoney(dailyLimit)}</strong> в день.`
    });
  }

  // 2. Categories > 15% of income
  if (income > 0) {
    for (const [cat, amount] of Object.entries(catTotals)) {
      if (cat === 'Переводы' || cat === 'Кредиты' || cat === 'Жильё' || cat === 'Коммуналка') continue;
      const pct = amount / income * 100;
      if (pct > 15) {
        const info = CATEGORIES[cat] || { emoji: '❓' };
        advice.push({
          type: 'warning', emoji: info.emoji,
          tag: 'Обратите внимание',
          text: `${info.emoji} <strong>${cat}</strong> — ${formatMoney(amount)} (${Math.round(pct)}% дохода). ${pct > 25 ? 'Это значительная часть бюджета.' : 'Стоит присмотреться.'}`
        });
      }
    }
  }

  // 3. Compare with previous month
  const months = getAvailableMonths();
  const idx = months.indexOf(currentMonth);
  if (idx > 0) {
    const prevData = getMonthData(months[idx - 1]);
    const prevCatTotals = {};
    for (const tx of prevData.filter(t => t.type === 'expense')) {
      prevCatTotals[tx.category] = (prevCatTotals[tx.category] || 0) + tx.amount;
    }

    for (const [cat, amount] of Object.entries(catTotals)) {
      const prev = prevCatTotals[cat] || 0;
      if (prev > 0) {
        const change = ((amount - prev) / prev) * 100;
        const info = CATEGORIES[cat] || { emoji: '❓' };
        if (change > 30 && amount > 3000) {
          advice.push({
            type: 'warning', emoji: '📈',
            tag: 'Рост расходов',
            text: `${info.emoji} <strong>${cat}</strong> выросли на ${Math.round(change)}% по сравнению с прошлым месяцем (${formatMoney(prev)} → ${formatMoney(amount)}).`
          });
        }
        if (change < -15 && prev > 3000) {
          advice.push({
            type: 'positive', emoji: '🎉',
            tag: 'Молодец!',
            text: `${info.emoji} <strong>${cat}</strong> сократились на ${Math.round(Math.abs(change))}%! Экономия ${formatMoney(prev - amount)}.`
          });
        }
      }
    }

    // Overall comparison
    const prevTotal = prevData.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    if (prevTotal > 0 && expenses < prevTotal) {
      advice.push({
        type: 'positive', emoji: '✅',
        tag: 'Отлично!',
        text: `Общие расходы снизились на ${Math.round((1 - expenses / prevTotal) * 100)}% по сравнению с прошлым месяцем. Так держать!`
      });
    }
  }

  // 4. Subscriptions detector
  const subscriptions = findSubscriptions();
  if (subscriptions.length > 0) {
    const subTotal = subscriptions.reduce((s, sub) => s + sub.amount, 0);
    const subList = subscriptions.map(s => `${s.name}: ${formatMoney(s.amount)}`).join(', ');
    advice.push({
      type: 'info', emoji: '📱',
      tag: 'Подписки',
      text: `Обнаружено <strong>${subscriptions.length}</strong> регулярных платежей на сумму <strong>${formatMoney(subTotal)}/мес</strong>. ${subList}. Может, что-то лишнее?`
    });
  }

  // 5. Yearly projection for top category
  const topCat = Object.entries(catTotals).filter(([c]) => c !== 'Переводы' && c !== 'Жильё').sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const yearly = topCat[1] * 12;
    const info = CATEGORIES[topCat[0]] || { emoji: '❓' };
    advice.push({
      type: 'info', emoji: '🧮',
      tag: 'На заметку',
      text: `При таких расходах за год на <strong>${topCat[0]}</strong> ${info.emoji} уйдёт <strong>${formatMoney(yearly)}</strong>. Есть способ сократить?`
    });
  }

  // Render
  if (advice.length === 0) {
    advice.push({ type: 'positive', emoji: '👏', tag: 'Всё в порядке', text: 'Пока нет замечаний. Финансы под контролем!' });
  }

  document.getElementById('advice-list').innerHTML = advice.map(a => `
    <div class="card advice-card ${a.type}">
      <div class="advice-header">
        <span style="font-size:1.2rem;">${a.emoji}</span>
        <span class="advice-tag">${a.tag}</span>
      </div>
      <div class="advice-text">${a.text}</div>
    </div>
  `).join('');
}

// ============================================================
//  SUBSCRIPTIONS DETECTOR
// ============================================================
function findSubscriptions() {
  // Look for recurring payments with same amount in different months
  const months = getAvailableMonths();
  if (months.length < 2) return [];

  const merchantMonthly = {};

  for (const monthKey of months) {
    const data = getMonthData(monthKey).filter(t => t.type === 'expense');
    for (const tx of data) {
      const key = tx.description.substring(0, 25).toUpperCase();
      if (!merchantMonthly[key]) merchantMonthly[key] = {};
      if (!merchantMonthly[key][monthKey]) merchantMonthly[key][monthKey] = 0;
      merchantMonthly[key][monthKey] += tx.amount;
    }
  }

  const subs = [];
  for (const [name, monthData] of Object.entries(merchantMonthly)) {
    const monthValues = Object.values(monthData);
    if (monthValues.length < 2) continue;

    // Check if amounts are similar (within 20%)
    const avg = monthValues.reduce((s, v) => s + v, 0) / monthValues.length;
    const allSimilar = monthValues.every(v => Math.abs(v - avg) / avg < 0.25);

    if (allSimilar && avg > 50 && avg < 10000) {
      subs.push({ name: name.substring(0, 20), amount: Math.round(avg), months: monthValues.length });
    }
  }

  return subs.sort((a, b) => b.amount - a.amount).slice(0, 10);
}

// ============================================================
//  CALENDAR
// ============================================================
function renderCalendar() {
  const subs = findSubscriptions();
  const [y, m] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDay = new Date(y, m - 1, 1).getDay();
  const startDay = firstDay === 0 ? 6 : firstDay - 1; // Monday = 0

  // Find payment dates from current month data
  const data = getMonthData(currentMonth).filter(t => t.type === 'expense');
  const paymentDays = new Set();
  const dayPayments = {};

  for (const sub of subs) {
    // Find the typical day of month for this subscription
    for (const tx of data) {
      if (tx.description.substring(0, 25).toUpperCase() === sub.name.toUpperCase()) {
        const day = parseInt(tx.date.split('-')[2]);
        paymentDays.add(day);
        if (!dayPayments[day]) dayPayments[day] = [];
        dayPayments[day].push({ name: sub.name, amount: sub.amount });
      }
    }
  }

  // Render calendar grid
  const headers = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  let html = headers.map(h => `<div class="cal-header">${h}</div>`).join('');

  for (let i = 0; i < startDay; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = (today.getFullYear() === y && today.getMonth() + 1 === m && today.getDate() === day);
    const hasPayment = paymentDays.has(day);
    html += `<div class="cal-day ${isToday ? 'today' : ''} ${hasPayment ? 'has-payment' : ''}">${day}</div>`;
  }

  document.getElementById('cal-grid').innerHTML = html;

  // Render payment list
  let paymentsHtml = '<div class="card"><div class="card-title">📋 Регулярные списания</div>';
  if (subs.length === 0) {
    paymentsHtml += '<div class="empty-state"><p>Загрузите выписки за 2+ месяцев для определения регулярных платежей</p></div>';
  } else {
    const totalSubs = subs.reduce((s, sub) => s + sub.amount, 0);
    paymentsHtml += `<div style="margin-bottom:12px;font-weight:600;">Итого: ${formatMoney(totalSubs)}/мес</div>`;
    for (const sub of subs) {
      paymentsHtml += `
        <div class="cal-payment-item">
          <div>
            <div class="cal-payment-name">${sub.name}</div>
            <div class="cal-payment-date">ежемесячно · ${sub.months} мес подряд</div>
          </div>
          <div class="amount">${formatMoney(sub.amount)}</div>
        </div>`;
    }
  }
  paymentsHtml += '</div>';
  document.getElementById('cal-payments').innerHTML = paymentsHtml;
}

// ============================================================
//  SETTINGS
// ============================================================
function renderSettings() {
  document.getElementById('salary-date').value = STATE.settings.salaryDate || 25;
  document.getElementById('theme-toggle').classList.toggle('active', STATE.settings.theme === 'dark');
  document.getElementById('family-toggle').classList.toggle('active', STATE.settings.familyMode);

  const filesHtml = STATE.files.length > 0
    ? STATE.files.map(f => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.9rem;">📄 ${f}</div>`).join('')
    : '<div class="empty-state"><p>Нет загруженных файлов</p></div>';
  document.getElementById('loaded-files').innerHTML = filesHtml;
  renderIncomeRules();
}

function renderIncomeRules() {
  const container = document.getElementById('income-rules-list');
  if (!container) return;
  const rules = STATE.incomeRules || [];
  if (rules.length === 0) {
    container.innerHTML = '<div style="padding:8px 0;font-size:0.85rem;color:var(--text-muted);">Нет правил. Входящие переводы считаются переводами, а не доходом.</div>';
    return;
  }
  container.innerHTML = rules.map((r, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:0.9rem;">💼 ${r}</span>
      <button onclick="removeIncomeRule(${i})" style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--text-muted);">✕</button>
    </div>`).join('');
}

function addIncomeRule() {
  const input = document.getElementById('income-rule-input');
  const val = (input.value || '').trim();
  if (!val) return;
  if (!STATE.incomeRules) STATE.incomeRules = [];
  if (STATE.incomeRules.some(r => r.toUpperCase() === val.toUpperCase())) {
    toast('Такое правило уже есть');
    return;
  }
  STATE.incomeRules.push(val);
  input.value = '';
  // Re-classify matching incoming transactions
  let fixed = 0;
  const valUp = val.toUpperCase();
  for (const tx of STATE.transactions) {
    if (tx._userEdited) continue;
    if (tx.type === 'expense') continue;
    const upper = (tx.description || '').toUpperCase();
    if (!upper.includes(valUp)) continue;
    // Only incoming: "ПЕРЕВОД ОТ" or non-"ПЕРЕВОД ДЛЯ" transfers
    const isOutgoing = upper.includes('ПЕРЕВОД ДЛЯ') || upper.includes('ПЕРЕВОД НА ');
    if (isOutgoing) continue;
    if (tx.category !== 'Зарплата') {
      tx.category = 'Зарплата';
      tx.type = 'income';
      fixed++;
    }
  }
  saveState();
  renderIncomeRules();
  if (fixed > 0) toast(`${fixed} операций → Зарплата`);
  else toast('Правило добавлено');
}

function removeIncomeRule(idx) {
  const removed = STATE.incomeRules.splice(idx, 1)[0];
  // Revert matching transactions back to transfer
  if (removed) {
    for (const tx of STATE.transactions) {
      if (tx._userEdited) continue;
      if (tx.category !== 'Зарплата') continue;
      const upper = (tx.description || '').toUpperCase();
      if (upper.includes(removed.toUpperCase())) {
        tx.type = 'transfer';
        tx.category = 'Переводы';
      }
    }
  }
  saveState();
  renderIncomeRules();
  toast('Правило удалено');
}

function renderDebtsSection() {
  // Render debts in settings if element exists
  let container = document.getElementById('debts-section');
  if (!container) {
    // Create debts section dynamically in settings screen
    const settingsScreen = document.getElementById('screen-settings');
    if (!settingsScreen) return;
    const legalCard = settingsScreen.querySelector('.card:last-of-type');
    container = document.createElement('div');
    container.className = 'card';
    container.id = 'debts-section';
    if (legalCard) settingsScreen.insertBefore(container, legalCard);
    else settingsScreen.appendChild(container);
  }

  const debts = getDebts();
  if (debts.length === 0) {
    container.innerHTML = `
      <div class="card-title">🤝 Долги</div>
      <div class="empty-state" style="padding:16px 0;"><p style="font-size:0.85rem;">Нет записей о долгах.<br>Добавьте через кнопку ＋ → «Дал в долг»</p></div>
    `;
    return;
  }

  let html = '<div class="card-title">🤝 Долги</div>';
  let totalDebt = 0;
  for (const d of debts) {
    totalDebt += d.remaining;
    html += `
      <div class="debt-item">
        <div class="debt-avatar">🤝</div>
        <div class="debt-info">
          <div class="debt-name">${d.person}</div>
          <div class="debt-date">Выдано: ${formatMoney(d.given)}${d.returned > 0 ? ' · Возвращено: ' + formatMoney(d.returned) : ''}</div>
        </div>
        <div class="debt-amount amount-expense">${formatMoney(d.remaining)}</div>
      </div>`;
  }
  html += `<div style="text-align:right;padding-top:8px;font-weight:600;font-size:0.9rem;">Итого должны вам: <span class="amount amount-expense">${formatMoney(totalDebt)}</span></div>`;
  container.innerHTML = html;
}

function renderTrash() {
  const container = document.getElementById('trash-list');
  if (!container) return;
  const trash = STATE.trash || [];

  if (trash.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:12px 0;"><p style="font-size:0.85rem;">Корзина пуста</p></div>';
    return;
  }

  // Auto-clean: remove items older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  STATE.trash = trash.filter(t => !t.deletedAt || t.deletedAt > thirtyDaysAgo);
  if (STATE.trash.length !== trash.length) saveState();

  let html = `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">Хранится 30 дней (${STATE.trash.length} шт.)</div>`;
  for (const tx of STATE.trash.slice(0, 10)) {
    const info = CATEGORIES[tx.category] || { emoji: '❓' };
    html += `
      <div class="tx-item" style="cursor:default;">
        <div class="tx-emoji">${info.emoji}</div>
        <div class="tx-info">
          <div class="tx-desc">${tx.description.substring(0, 30)}</div>
          <div class="tx-cat">${tx.date} · ${formatMoney(tx.amount)}</div>
        </div>
        <button style="padding:6px 12px;border-radius:8px;background:var(--accent);color:white;border:none;font-size:0.8rem;font-weight:600;cursor:pointer;" onclick="restoreFromTrash('${tx.id.replace(/'/g, "\\'")}')">↩</button>
      </div>`;
  }

  if (STATE.trash.length > 0) {
    html += `<button style="margin-top:8px;padding:8px 16px;border-radius:8px;background:var(--red);color:white;border:none;font-size:0.85rem;font-weight:600;cursor:pointer;width:100%;" onclick="emptyTrash()">Очистить корзину</button>`;
  }

  container.innerHTML = html;
}

function restoreFromTrash(txId) {
  const tx = STATE.trash.find(t => t.id === txId);
  if (!tx) return;
  STATE.trash = STATE.trash.filter(t => t.id !== txId);
  delete tx.deletedAt;
  STATE.transactions.push(tx);
  STATE.transactions.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
  saveState();
  toast('Операция восстановлена');
  renderTrash();
  refreshCurrentView();
}

function emptyTrash() {
  if (!confirm(`Удалить ${STATE.trash.length} операций навсегда?`)) return;
  STATE.trash = [];
  saveState();
  toast('Корзина очищена');
  renderTrash();
}

// ============================================================
//  CUSTOM CATEGORIES & RULES MANAGEMENT
// ============================================================
function renderRules() {
  const container = document.getElementById('rules-list');
  if (!container) return;
  const rules = Object.entries(STATE.customRules || {});

  if (rules.length === 0) {
    container.innerHTML = '<div style="font-size:0.85rem;color:var(--text-muted);padding:8px 0;">Пока нет пользовательских правил. Измените категорию любой транзакции — правило создастся автоматически.</div>';
    return;
  }

  let html = `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">${rules.length} правил</div>`;
  for (const [merchant, cat] of rules.slice(0, 20)) {
    const info = CATEGORIES[cat] || { emoji: '❓' };
    html += `
      <div class="tx-item" style="padding:8px;">
        <div class="tx-emoji" style="font-size:1rem;">${info.emoji}</div>
        <div class="tx-info" style="min-width:0;">
          <div class="tx-desc" style="font-size:0.8rem;">${merchant.substring(0, 25)}</div>
          <div class="tx-cat" style="font-size:0.75rem;">${cat}</div>
        </div>
        <button style="padding:4px 10px;border-radius:6px;background:var(--red-bg);color:var(--red);border:none;font-size:0.8rem;cursor:pointer;" onclick="deleteRule('${merchant.replace(/'/g, "\\'")}')">✕</button>
      </div>`;
  }
  if (rules.length > 20) {
    html += `<div style="font-size:0.8rem;color:var(--text-muted);padding:8px;">...и ещё ${rules.length - 20}</div>`;
  }
  container.innerHTML = html;
}

function deleteRule(merchant) {
  delete STATE.customRules[merchant];
  saveState();
  toast('Правило удалено');
  renderRules();
}

function openAddCategory() {
  document.getElementById('addcat-emoji').value = '';
  document.getElementById('addcat-name').value = '';
  document.getElementById('addcat-color').value = '#6C5CE7';
  document.getElementById('modal-addcat').classList.add('active');
}

function saveNewCategory() {
  const emoji = document.getElementById('addcat-emoji').value.trim() || '🏷️';
  const name = document.getElementById('addcat-name').value.trim();
  const color = document.getElementById('addcat-color').value;

  if (!name) { toast('Введите название категории'); return; }
  if (CATEGORIES[name]) { toast('Категория уже существует'); return; }

  CATEGORIES[name] = { emoji, color };

  // Save custom categories to state so they persist
  if (!STATE.settings.customCategories) STATE.settings.customCategories = {};
  STATE.settings.customCategories[name] = { emoji, color };
  saveState();

  closeModal('modal-addcat');
  toast(`Категория «${emoji} ${name}» добавлена`);
  renderRules();
}

// Restore custom categories from state on load
function restoreCustomCategories() {
  if (STATE.settings.customCategories) {
    for (const [name, info] of Object.entries(STATE.settings.customCategories)) {
      if (!CATEGORIES[name]) {
        CATEGORIES[name] = info;
      }
    }
  }
}

function saveSetting(key, value) {
  STATE.settings[key] = parseInt(value) || value;
  saveState();
  toast('Сохранено');
}

function toggleFamily() {
  if (!requirePro('familyMode')) return;
  STATE.settings.familyMode = !STATE.settings.familyMode;
  document.getElementById('family-toggle').classList.toggle('active', STATE.settings.familyMode);
  saveState();
}

function exportCSV() {
  if (!requirePro('exportCSV')) return;
  trackEvent('feature_use', { feature: 'exportCSV' });
  const data = getMonthData(currentMonth);
  if (data.length === 0) { toast('Нет данных для экспорта'); return; }

  let csv = 'Дата,Время,Описание,Категория,Сумма,Тип,Банк,Комментарий,Источник\n';
  for (const tx of data) {
    csv += `${tx.date},${tx.time || ''},\"${tx.description}\",${tx.category},${tx.amount},${tx.type},${tx.bank || ''},\"${tx.comment || ''}\",${tx.manual ? 'Вручную' : 'PDF'}\n`;
  }

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `finance_${currentMonth}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV скачан');
}

// ============================================================
//  BACKUP / RESTORE
// ============================================================
function exportBackup() {
  const backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'FinanceHelper',
    data: {
      transactions: STATE.transactions,
      customRules: STATE.customRules,
      settings: STATE.settings,
      files: STATE.files,
      trash: STATE.trash || [],
      budgets: STATE.budgets || {},
      goals: STATE.goals || [],
      smartPatterns: STATE.smartPatterns || []
    }
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `finance_backup_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Бекап сохранён (${STATE.transactions.length} операций)`);
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);

      // Validate
      if (!backup.data || !backup.data.transactions) {
        toast('Некорректный файл бекапа');
        return;
      }

      const txCount = backup.data.transactions.length;
      if (!confirm(`Восстановить ${txCount} операций из бекапа от ${backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString('ru-RU') : 'неизвестно'}?\n\nТекущие данные будут заменены.`)) return;

      STATE.transactions = backup.data.transactions || [];
      STATE.customRules = backup.data.customRules || {};
      STATE.settings = { ...defaultState().settings, ...backup.data.settings };
      STATE.files = backup.data.files || [];
      STATE.trash = backup.data.trash || [];
      STATE.budgets = backup.data.budgets || {};
      STATE.goals = backup.data.goals || [];
      STATE.smartPatterns = backup.data.smartPatterns || [];
      saveState();

      // Update view
      if (STATE.transactions.length > 0) {
        const months = getAvailableMonths();
        currentMonth = months[months.length - 1];
        showScreen('dashboard');
      }
      toast(`Восстановлено: ${txCount} операций`);
    } catch(err) {
      toast('Ошибка чтения файла: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (confirm('Удалить все данные? Это действие нельзя отменить.')) {
    localStorage.removeItem(APP_KEY);
    STATE = defaultState();
    currentMonth = null;
    saveState();
    showScreen('onboarding');
    toast('Данные удалены');
  }
}

// ============================================================
//  WIZARD: РАЗОБРАТЬ ПРОЧЕЕ
// ============================================================
function showWizardMisc(newTxs) {
  const miscTxs = (newTxs || STATE.transactions).filter(t => t.category === 'Прочее' && t.type === 'expense');
  if (miscTxs.length === 0) return;

  // Group by merchant (first 25 chars of description)
  const groups = {};
  miscTxs.forEach(tx => {
    const key = (tx.description || '').substring(0, 25).toUpperCase().trim();
    if (!key) return;
    if (!groups[key]) groups[key] = { desc: tx.description.substring(0, 25), count: 0, total: 0, ids: [] };
    groups[key].count++;
    groups[key].total += tx.amount;
    groups[key].ids.push(tx.id);
  });

  const sorted = Object.entries(groups).sort((a, b) => b[1].count - a[1].count).slice(0, 15);
  if (sorted.length === 0) return;

  // Build UI
  const catOptions = Object.entries(CATEGORIES).map(([name, info]) =>
    `<option value="${name}">${info.emoji} ${name}</option>`
  ).join('');

  let html = '';
  sorted.forEach(([key, g]) => {
    html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.desc}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);">×${g.count} · ${formatMoney(g.total)}</div>
      </div>
      <select class="wizard-cat-select" data-key="${key}" style="padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:0.8rem;">
        <option value="">— Выбрать —</option>
        ${catOptions}
      </select>
    </div>`;
  });
  document.getElementById('wizard-misc-list').innerHTML = html;
  document.getElementById('modal-wizard-misc').classList.add('active');
}

// Wrapper: opens WizardMisc or falls back to CategoryDetail for "Прочее"
function showWizardMiscOrDetail() {
  const periodData = typeof getDataForPeriod === 'function' ? getDataForPeriod() : getMonthData(currentMonth);
  const miscTxs = periodData.filter(t => t.category === 'Прочее' && t.type === 'expense');
  if (miscTxs.length === 0) return;
  showWizardMisc(periodData);
  // Fallback if wizard didn't open (e.g. no groups formed)
  if (!document.getElementById('modal-wizard-misc').classList.contains('active')) {
    showCategoryDetail('Прочее');
  }
}

function applyWizardMisc() {
  const selects = document.querySelectorAll('.wizard-cat-select');
  let changed = 0;
  selects.forEach(sel => {
    const cat = sel.value;
    const key = sel.dataset.key;
    if (!cat || !key) return;
    // Apply to all matching transactions
    STATE.transactions.forEach(tx => {
      if (tx.category === 'Прочее' && (tx.description || '').substring(0, 25).toUpperCase().trim() === key) {
        tx.category = cat;
        changed++;
      }
    });
    // Save as rule
    STATE.customRules[key] = cat;
  });
  if (changed > 0) {
    saveState();
    toast(`Перекатегоризировано: ${changed} операций`);
    refreshCurrentView();
  }
  closeModal('modal-wizard-misc');
}

// ============================================================
//  RECALCULATE ALL RULES
// ============================================================
function recalcAllRules() {
  const rules = Object.entries(STATE.customRules || {});
  if (rules.length === 0) { toast('Нет сохранённых правил'); return; }
  if (!confirm(`Применить ${rules.length} правил ко всем операциям?\nЭто перезапишет текущие категории для совпадений.`)) return;
  let changed = 0;
  STATE.transactions.forEach(tx => {
    const key = (tx.description || '').substring(0, 30).toUpperCase();
    if (STATE.customRules[key] && tx.category !== STATE.customRules[key]) {
      tx.category = STATE.customRules[key];
      changed++;
    }
  });
  saveState();
  toast(`Перекатегоризировано: ${changed} операций`);
  refreshCurrentView();
}

// ============================================================
//  DASHBOARD EXCLUDE FILTER (category exclusion)
// ============================================================
function openDashExcludeModal() {
  if (!STATE.settings.dashExclude) STATE.settings.dashExclude = [];
  const excluded = new Set(STATE.settings.dashExclude);
  const usedCats = new Set(STATE.transactions.map(t => t.category));
  let html = '';
  for (const cat of usedCats) {
    const info = CATEGORIES[cat] || { emoji: '❓' };
    const checked = excluded.has(cat) ? 'checked' : '';
    html += `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" class="dash-excl-check" value="${cat}" ${checked} style="width:18px;height:18px;accent-color:var(--accent);">
      <span>${info.emoji} ${cat}</span>
    </label>`;
  }
  document.getElementById('dash-exclude-checks').innerHTML = html;
  document.getElementById('modal-dash-exclude').classList.add('active');
}

function setDashPreset(preset) {
  const checks = document.querySelectorAll('.dash-excl-check');
  const dailyExclude = ['Переводы', 'Перевод себе', 'Жильё', 'Кредиты', 'Коммуналка', 'Страхование'];
  const mandatoryOnly = ['Жильё', 'Кредиты', 'Коммуналка', 'Подписки', 'Страхование'];

  checks.forEach(ch => {
    if (preset === 'all') ch.checked = false;
    else if (preset === 'daily') ch.checked = dailyExclude.includes(ch.value);
    else if (preset === 'mandatory') ch.checked = !mandatoryOnly.includes(ch.value);
  });
}

function applyDashExclude() {
  const checks = document.querySelectorAll('.dash-excl-check');
  STATE.settings.dashExclude = [];
  checks.forEach(ch => { if (ch.checked) STATE.settings.dashExclude.push(ch.value); });
  saveState();
  closeModal('modal-dash-exclude');
  renderDashboard();
}

// ============================================================
//  STORAGE USAGE
// ============================================================
function getStorageUsage() {
  try {
    const data = localStorage.getItem(APP_KEY) || '';
    const bytes = new Blob([data]).size;
    const kb = (bytes / 1024).toFixed(1);
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    const pct = ((bytes / (5 * 1024 * 1024)) * 100).toFixed(1);
    const el = document.getElementById('storage-usage-info');
    if (el) {
      el.textContent = `Занято: ${kb > 1024 ? mb + ' МБ' : kb + ' КБ'} из ~5 МБ (${pct}%)`;
      if (parseFloat(pct) > 80) el.style.color = 'var(--red)';
      else if (parseFloat(pct) > 50) el.style.color = 'var(--yellow)';
    }
  } catch(e) {}
}

// ============================================================
//  TX HISTORY (track changes)
// ============================================================
function addTxHistory(tx, field, oldVal, newVal) {
  if (!tx.history) tx.history = [];
  tx.history.push({ field, from: oldVal, to: newVal, date: new Date().toISOString() });
  // Cap at 20 entries
  if (tx.history.length > 20) tx.history = tx.history.slice(-20);
}

// ============================================================
//  SMART PATTERNS (recurring transfers → auto-category)
// ============================================================
function findRecurringPatterns() {
  if (!STATE.smartPatterns) STATE.smartPatterns = [];
  const transfers = STATE.transactions.filter(t =>
    (t.type === 'income' || t.type === 'transfer') && t.category !== 'Перевод себе'
  );

  // Group by description prefix (first 20 chars)
  const groups = {};
  transfers.forEach(tx => {
    const key = (tx.description || '').substring(0, 20).toUpperCase().trim();
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  });

  const suggestions = [];
  for (const [key, txs] of Object.entries(groups)) {
    if (txs.length < 2) continue;
    // Check if amounts are within ±20%
    const amounts = txs.map(t => t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const consistent = amounts.every(a => Math.abs(a - avg) / avg < 0.2);
    if (!consistent) continue;
    // Check if already has a smart pattern
    const alreadyExists = STATE.smartPatterns.some(p => p.descKey === key);
    if (alreadyExists) continue;
    suggestions.push({
      descKey: key,
      desc: txs[0].description.substring(0, 25),
      count: txs.length,
      avgAmount: Math.round(avg),
      category: txs[0].category
    });
  }
  return suggestions;
}

function applySmartPatterns() {
  if (!STATE.smartPatterns || STATE.smartPatterns.length === 0) return 0;
  let applied = 0;
  STATE.transactions.forEach(tx => {
    const key = (tx.description || '').substring(0, 20).toUpperCase().trim();
    const pattern = STATE.smartPatterns.find(p => {
      if (p.descKey !== key) return false;
      const diff = Math.abs(tx.amount - p.avgAmount) / p.avgAmount;
      return diff < 0.2;
    });
    if (pattern && tx.category !== pattern.category) {
      tx.category = pattern.category;
      applied++;
    }
  });
  return applied;
}

function showSmartPatternSuggestions() {
  const suggestions = findRecurringPatterns();
  if (suggestions.length === 0) return;

  let catOptions = Object.entries(CATEGORIES).map(([cat, info]) =>
    `<option value="${cat}">${info.emoji} ${cat}</option>`
  ).join('');

  const html = suggestions.slice(0, 8).map((s, i) => {
    const info = CATEGORIES[s.category] || { emoji: '❓' };
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;">
        <input type="checkbox" class="pattern-check" data-idx="${i}" checked style="width:18px;height:18px;accent-color:var(--accent);">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.desc}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">×${s.count} операций · ~${formatMoney(s.avgAmount)}</div>
        </div>
        <select class="pattern-cat" data-idx="${i}" style="padding:6px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.8rem;max-width:130px;">
          ${catOptions.replace(`value="${s.category}"`, `value="${s.category}" selected`)}
        </select>
      </label>`;
  }).join('');

  document.getElementById('smart-pattern-list').innerHTML = html;
  document.getElementById('modal-smart-patterns').classList.add('active');

  // Store suggestions for apply
  window._smartSuggestions = suggestions.slice(0, 8);
}

function applySelectedPatterns() {
  const suggestions = window._smartSuggestions || [];
  let applied = 0;

  document.querySelectorAll('.pattern-check:checked').forEach(ch => {
    const idx = parseInt(ch.dataset.idx);
    const s = suggestions[idx];
    if (!s) return;

    const catSelect = document.querySelector(`.pattern-cat[data-idx="${idx}"]`);
    const category = catSelect ? catSelect.value : s.category;

    STATE.smartPatterns.push({
      descKey: s.descKey,
      category: category,
      avgAmount: s.avgAmount,
      createdAt: new Date().toISOString()
    });

    // Apply to existing transactions
    STATE.transactions.forEach(tx => {
      const key = (tx.description || '').substring(0, 20).toUpperCase().trim();
      if (key === s.descKey && tx.category !== category) {
        tx.category = category;
        applied++;
      }
    });
  });

  saveState();
  closeModal('modal-smart-patterns');
  window._smartSuggestions = null;
  if (applied > 0) {
    toast(`Применено: ${applied} операций перекатегоризировано`);
  } else {
    toast('Паттерны сохранены');
  }
  refreshCurrentView();
}

// ============================================================
//  CONTEXTUAL HINTS
// ============================================================
function showHint(text, x, y) {
  const el = document.getElementById('hint-bubble');
  if (!el) return;
  document.getElementById('hint-text').textContent = text;
  el.style.display = 'block';
  el.style.left = Math.min(x, window.innerWidth - 280) + 'px';
  el.style.top = y + 'px';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function dismissHint() {
  document.getElementById('hint-bubble').style.display = 'none';
}

function checkHints(screenName) {
  if (!STATE.settings.hints) STATE.settings.hints = {};
  if (screenName === 'dashboard' && !STATE.settings.hints.dashFilters && STATE.transactions.length > 0) {
    STATE.settings.hints.dashFilters = true;
    saveState();
    setTimeout(() => {
      const filterEl = document.getElementById('dash-filters');
      if (filterEl) {
        const rect = filterEl.getBoundingClientRect();
        showHint('Используйте фильтры, чтобы исключить переводы из аналитики', rect.left, rect.bottom + 8);
      }
    }, 1000);
  }
  if (screenName === 'transactions' && !STATE.settings.hints.txClick && STATE.transactions.length > 0) {
    STATE.settings.hints.txClick = true;
    saveState();
    setTimeout(() => {
      showHint('Нажмите на операцию, чтобы изменить категорию — правило запомнится', 20, 200);
    }, 800);
  }
}

// ============================================================
//  BUDGETS
// ============================================================
function renderBudgets() {
  if (!STATE.budgets) STATE.budgets = {};
  const container = document.getElementById('budgets-list');
  if (!container) return;
  const usedCats = new Set();
  STATE.transactions.filter(t => t.type === 'expense').forEach(t => usedCats.add(t.category));
  let html = '';
  for (const cat of [...usedCats].sort()) {
    const info = CATEGORIES[cat] || { emoji: '❓' };
    const val = STATE.budgets[cat] || '';
    html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:1.1rem;">${info.emoji}</span>
      <span style="flex:1;font-size:0.85rem;font-weight:500;">${cat}</span>
      <input type="number" placeholder="Лимит" value="${val}" min="0" step="100"
        style="width:100px;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:0.85rem;text-align:right;"
        onchange="saveBudget('${cat.replace(/'/g, "\\'")}', this.value)">
      <span style="font-size:0.75rem;color:var(--text-muted);">₽</span>
    </div>`;
  }
  if (usedCats.size === 0) html = '<div style="font-size:0.85rem;color:var(--text-muted);">Загрузите выписку, чтобы увидеть категории.</div>';
  container.innerHTML = html;
}
function saveBudget(cat, value) {
  if (!requirePro('budgets')) return;
  if (!STATE.budgets) STATE.budgets = {};
  const num = parseInt(value);
  if (num > 0) STATE.budgets[cat] = num;
  else delete STATE.budgets[cat];
  saveState();
}

// ============================================================
//  GOALS
// ============================================================
function renderGoals() {
  if (!STATE.goals) STATE.goals = [];
  const container = document.getElementById('goals-list');
  if (!container) return;
  if (STATE.goals.length === 0) {
    container.innerHTML = '<div style="font-size:0.85rem;color:var(--text-muted);">Пока нет целей. Создайте свою первую!</div>';
    return;
  }
  let html = '';
  STATE.goals.forEach((g, i) => {
    const pct = g.target > 0 ? Math.min(Math.round(g.saved / g.target * 100), 100) : 0;
    const barColor = pct >= 100 ? 'var(--green)' : 'var(--accent)';
    html += `<div style="padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:600;">${g.name}</div>
        <button onclick="deleteGoal(${i})" style="padding:2px 8px;border-radius:6px;background:var(--red-bg);color:var(--red);border:none;font-size:0.75rem;cursor:pointer;">✕</button>
      </div>
      <div style="margin:6px 0;height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width 0.5s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-muted);">
        <span>${formatMoney(g.saved)} / ${formatMoney(g.target)}</span>
        <span>${pct}%</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <input type="number" id="goal-add-${i}" placeholder="Сумма" min="0" style="flex:1;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:0.85rem;">
        <button onclick="addToGoal(${i})" style="padding:6px 12px;border-radius:6px;background:var(--green);color:white;border:none;font-weight:600;font-size:0.8rem;cursor:pointer;">+ Отложил</button>
      </div>
      ${g.deadline ? '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Цель: ' + g.deadline + '</div>' : ''}
    </div>`;
  });
  container.innerHTML = html;
}
function openAddGoal() {
  if (!requirePro('goals')) return;
  const name = prompt('Название цели (например: Отпуск, iPhone):');
  if (!name) return;
  const target = parseFloat(prompt('Целевая сумма (₽):'));
  if (!target || target <= 0) { toast('Введите корректную сумму'); return; }
  const deadline = prompt('Дедлайн (ГГГГ-ММ, необязательно):') || '';
  if (!STATE.goals) STATE.goals = [];
  STATE.goals.push({ name, target, saved: 0, deadline, createdAt: new Date().toISOString() });
  saveState();
  toast('Цель «' + name + '» создана!');
  renderGoals();
}
function addToGoal(idx) {
  const input = document.getElementById('goal-add-' + idx);
  const amount = parseFloat(input?.value);
  if (!amount || amount <= 0) { toast('Введите сумму'); return; }
  STATE.goals[idx].saved += amount;
  saveState();
  if (STATE.goals[idx].saved >= STATE.goals[idx].target) toast('🎉 Цель достигнута!');
  else toast('+' + formatMoney(amount) + ' к «' + STATE.goals[idx].name + '»');
  renderGoals();
  renderGoalDashCard();
}
function deleteGoal(idx) {
  if (!confirm('Удалить цель «' + STATE.goals[idx].name + '»?')) return;
  STATE.goals.splice(idx, 1);
  saveState();
  renderGoals();
  renderGoalDashCard();
}
function renderGoalDashCard() {
  const card = document.getElementById('goal-dash-card');
  const content = document.getElementById('goal-dash-content');
  if (!card || !content) return;
  if (!STATE.goals || STATE.goals.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  const g = STATE.goals[0];
  const pct = g.target > 0 ? Math.min(Math.round(g.saved / g.target * 100), 100) : 0;
  const months = getAvailableMonths();
  let avgSaving = 0;
  if (months.length > 0) {
    let totalSaving = 0;
    months.forEach(m => {
      const mData = getMonthData(m);
      const inc = mData.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const exp = mData.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      totalSaving += (inc - exp);
    });
    avgSaving = Math.max(0, Math.round(totalSaving / months.length));
  }
  const remaining = Math.max(0, g.target - g.saved);
  const monthsLeft = avgSaving > 0 ? Math.ceil(remaining / avgSaving) : '∞';
  content.innerHTML = '<div style="font-weight:600;margin-bottom:6px;">' + g.name + '</div>' +
    '<div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;margin-bottom:8px;"><div style="height:100%;width:' + pct + '%;background:' + (pct >= 100 ? 'var(--green)' : 'var(--accent)') + ';border-radius:5px;transition:width 0.5s;"></div></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:0.85rem;"><span>' + formatMoney(g.saved) + ' / ' + formatMoney(g.target) + '</span><span style="color:var(--text-muted);">' + pct + '%</span></div>' +
    (avgSaving > 0 ? '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">При текущем темпе (~' + formatMoney(avgSaving) + '/мес): ≈' + monthsLeft + ' мес</div>' : '');
}

// ============================================================
//  TRENDS CHARTS
// ============================================================
let trendExpChart = null;
let trendBalChart = null;
let analyticsStackedChart = null;
let analyticsDailyChart = null;

// ============================================================
//  ANALYTICS SCREEN
// ============================================================
function renderAnalytics() {
  const container = document.getElementById('analytics-content');
  if (!container) return;

  const TRANSFER_CATS = ['Переводы', 'Перевод себе'];
  const txExpenses = STATE.transactions.filter(t =>
    t.type === 'expense' && !TRANSFER_CATS.includes(t.category)
  );

  // Собираем данные по всем месяцам
  const byMonth = {};        // monthKey -> total
  const byMonthCat = {};     // cat -> { monthKey -> amount }
  const byMerchant = {};     // merchant -> { total, count, cat }
  const dailyByMonth = {};   // monthKey -> { dayStr -> amount }

  txExpenses.forEach(tx => {
    if (!tx.monthKey) return;
    byMonth[tx.monthKey] = (byMonth[tx.monthKey] || 0) + tx.amount;

    if (!byMonthCat[tx.category]) byMonthCat[tx.category] = {};
    byMonthCat[tx.category][tx.monthKey] = (byMonthCat[tx.category][tx.monthKey] || 0) + tx.amount;

    const m = tx.merchant || tx.description || '?';
    if (!byMerchant[m]) byMerchant[m] = { total: 0, count: 0, cat: tx.category };
    byMerchant[m].total += tx.amount;
    byMerchant[m].count++;

    if (!dailyByMonth[tx.monthKey]) dailyByMonth[tx.monthKey] = {};
    const day = tx.date || '';
    dailyByMonth[tx.monthKey][day] = (dailyByMonth[tx.monthKey][day] || 0) + tx.amount;
  });

  const allMonths = Object.keys(byMonth).sort();

  if (allMonths.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center;padding:40px 20px;">' +
      '<div style="font-size:3rem;margin-bottom:12px;">🔍</div>' +
      '<div style="font-weight:600;margin-bottom:8px;">Нет данных для анализа</div>' +
      '<div style="font-size:0.85rem;color:var(--text-secondary);">Загрузите выписки хотя бы за 1 месяц</div></div>';
    return;
  }

  const totalAll = Object.values(byMonth).reduce((s, v) => s + v, 0);

  // === Средние траты в день ===
  const avgDailyByMonth = allMonths.map(mk => {
    const days = Object.keys(dailyByMonth[mk] || {}).length;
    return { month: mk, avg: days > 0 ? Math.round(byMonth[mk] / days) : 0, days };
  });
  const overallDailyAvg = avgDailyByMonth.length > 0
    ? Math.round(avgDailyByMonth.reduce((s, d) => s + d.avg, 0) / avgDailyByMonth.length)
    : 0;

  // === Аномалии ===
  const anomalies = [];
  const lastMonth = allMonths[allMonths.length - 1];
  Object.entries(byMonthCat).forEach(function(entry) {
    var cat = entry[0], months = entry[1];
    var values = Object.values(months);
    if (values.length < 2) return;
    var avg = values.reduce(function(a, b) { return a + b; }, 0) / values.length;
    var lastVal = months[lastMonth] || 0;
    if (avg > 0 && lastVal > avg * 1.5 && lastVal > 1000) {
      anomalies.push({ cat: cat, lastVal: lastVal, avg: avg, ratio: lastVal / avg });
    }
  });
  anomalies.sort(function(a, b) { return b.ratio - a.ratio; });

  // === Топ мерчанты ===
  const topMerchants = Object.entries(byMerchant)
    .sort(function(a, b) { return b[1].total - a[1].total; })
    .slice(0, 15);

  // === Render HTML ===
  var html = '';

  // 1. Структура расходов (stacked bar)
  html += '<div class="card" style="padding:16px;">';
  html += '<div style="font-weight:600;margin-bottom:4px;">📊 Структура расходов по месяцам</div>';
  html += '<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:12px;">Топ категорий — как меняется доля каждой</div>';
  html += '<canvas id="analyticsStackedChart" height="220"></canvas>';
  html += '</div>';

  // 2. Средние траты в день
  html += '<div class="card" style="padding:16px;">';
  html += '<div style="font-weight:600;margin-bottom:4px;">📅 Средние траты в день</div>';
  html += '<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:12px;">Среднее: <b style="color:var(--accent);">' + formatMoney(overallDailyAvg) + '</b>/день</div>';
  html += '<canvas id="analyticsDailyChart" height="160"></canvas>';
  html += '</div>';

  // 3. Аномалии
  if (anomalies.length > 0) {
    html += '<div class="card" style="padding:16px;">';
    html += '<div style="font-weight:600;margin-bottom:4px;">⚠️ Всплески за ' + monthName(lastMonth) + '</div>';
    html += '<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:12px;">Категории, где расход &gt; 1.5× от среднего</div>';
    anomalies.slice(0, 6).forEach(function(a) {
      var pct = Math.round((a.ratio - 1) * 100);
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-bottom:6px;' +
        'background:rgba(249,115,22,0.08);border-radius:10px;cursor:pointer;" onclick="showCategoryDetail(\'' + a.cat.replace(/'/g, "\\'") + '\')">';
      html += '<div><div style="font-size:0.9rem;font-weight:500;color:#c2410c;">' + a.cat + '</div>';
      html += '<div style="font-size:0.75rem;color:#ea580c;">ср: ' + formatMoney(a.avg) + ' → сейчас: ' + formatMoney(a.lastVal) + '</div></div>';
      html += '<div style="font-size:0.9rem;font-weight:700;color:#ea580c;">+' + pct + '%</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // 4. Топ-15 мерчантов
  html += '<div class="card" style="padding:16px;">';
  html += '<div style="font-weight:600;margin-bottom:12px;">🏪 Топ-15 мерчантов за всё время</div>';
  var maxTotal = topMerchants.length > 0 ? topMerchants[0][1].total : 1;
  topMerchants.forEach(function(entry, idx) {
    var name = entry[0], data = entry[1];
    var pct = totalAll > 0 ? (data.total / totalAll * 100).toFixed(1) : 0;
    var barW = Math.max(4, data.total / maxTotal * 100);
    html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:8px;">';
    html += '<span style="font-size:0.75rem;color:var(--text-secondary);width:20px;text-align:right;">' + (idx + 1) + '</span>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:0.85rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</div>';
    html += '<div style="display:flex;align-items:center;gap:6px;">';
    html += '<div style="flex:1;background:var(--border);border-radius:4px;height:5px;">';
    html += '<div style="width:' + barW + '%;height:5px;border-radius:4px;background:var(--accent);"></div></div>';
    html += '<span style="font-size:0.65rem;color:var(--text-secondary);">' + pct + '%</span>';
    html += '</div></div>';
    html += '<div style="text-align:right;">';
    html += '<div style="font-size:0.85rem;font-weight:700;">' + formatMoney(data.total) + '</div>';
    html += '<div style="font-size:0.65rem;color:var(--text-secondary);">' + data.count + ' оп.' + '</div>';
    html += '</div></div>';
  });
  html += '</div>';

  // 5. Доходы vs Расходы
  html += '<div class="card" style="padding:16px;">';
  html += '<div style="font-weight:600;margin-bottom:4px;">💰 Доходы vs Расходы</div>';
  html += '<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:12px;">Баланс и накопления по месяцам</div>';
  html += '<canvas id="analyticsIncExpChart" height="200"></canvas>';
  // Summary stats
  var totalIncome = 0, totalExpForStat = 0;
  allMonths.forEach(function(mk) {
    var md = getMonthData(mk);
    totalIncome += md.filter(function(t) { return t.type === 'income'; }).reduce(function(s, t) { return s + t.amount; }, 0);
    totalExpForStat += byMonth[mk] || 0;
  });
  var avgSavingsRate = totalIncome > 0 ? Math.round((totalIncome - totalExpForStat) / totalIncome * 100) : 0;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px;">';
  html += '<div style="text-align:center;padding:8px;background:rgba(0,184,148,0.1);border-radius:10px;"><div style="font-size:0.65rem;color:var(--text-muted);">Доход</div><div style="font-weight:700;font-size:0.8rem;color:#00B894;">' + formatMoney(totalIncome) + '</div></div>';
  html += '<div style="text-align:center;padding:8px;background:rgba(225,112,85,0.1);border-radius:10px;"><div style="font-size:0.65rem;color:var(--text-muted);">Расход</div><div style="font-weight:700;font-size:0.8rem;color:#E17055;">' + formatMoney(totalExpForStat) + '</div></div>';
  html += '<div style="text-align:center;padding:8px;background:rgba(108,92,231,0.1);border-radius:10px;"><div style="font-size:0.65rem;color:var(--text-muted);">Сбережения</div><div style="font-weight:700;font-size:0.8rem;color:#6C5CE7;">' + avgSavingsRate + '%</div></div>';
  html += '</div>';
  html += '</div>';

  // 6. Расходы по дням недели
  html += '<div class="card" style="padding:16px;">';
  html += '<div style="font-weight:600;margin-bottom:4px;">📊 Расходы по дням недели</div>';
  html += '<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:12px;">Когда вы тратите больше всего?</div>';
  var dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  var dayTotals = [0,0,0,0,0,0,0];
  var dayCounts = [0,0,0,0,0,0,0];
  txExpenses.forEach(function(tx) {
    if (!tx.date) return;
    var d = new Date(tx.date + 'T12:00:00'); // noon to avoid TZ issues
    var dow = (d.getDay() + 6) % 7; // Monday=0
    dayTotals[dow] += tx.amount;
    dayCounts[dow]++;
  });
  var numMonths = Math.max(allMonths.length, 1);
  var dayAvgs = dayTotals.map(function(t) { return Math.round(t / numMonths); });
  var maxDayAvg = Math.max.apply(null, dayAvgs.concat([1]));
  var peakDay = dayAvgs.indexOf(maxDayAvg);
  dayNames.forEach(function(name, i) {
    var pct = Math.round(dayAvgs[i] / maxDayAvg * 100);
    var isWeekend = i >= 5;
    var barColor = isWeekend ? '#E17055' : '#00B894';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">';
    html += '<div style="width:24px;font-size:0.75rem;font-weight:600;color:' + (isWeekend ? '#E17055' : 'var(--text-primary)') + ';">' + name + '</div>';
    html += '<div style="flex:1;background:var(--border);border-radius:4px;height:18px;overflow:hidden;">';
    html += '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';opacity:' + Math.max(0.35, pct / 100) + ';border-radius:4px;"></div></div>';
    html += '<div style="font-size:0.75rem;font-weight:600;min-width:65px;text-align:right;">' + formatMoney(dayAvgs[i]) + '</div>';
    html += '</div>';
  });
  html += '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:8px;text-align:center;">Больше всего тратите: <b>' + dayNames[peakDay] + '</b> (в среднем ' + formatMoney(maxDayAvg) + '/мес)</div>';
  html += '</div>';

  // 7. Все категории (clickable grid)
  html += '<div class="card" style="padding:16px;">';
  html += '<div style="font-weight:600;margin-bottom:4px;">🧩 Все категории</div>';
  html += '<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:12px;">Нажмите на категорию для детализации</div>';
  var allCatTotals = {};
  txExpenses.forEach(function(tx) { allCatTotals[tx.category] = (allCatTotals[tx.category] || 0) + tx.amount; });
  var sortedCats = Object.entries(allCatTotals).sort(function(a, b) { return b[1] - a[1]; });
  var totalForGrid = sortedCats.reduce(function(s, e) { return s + e[1]; }, 0) || 1;
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
  sortedCats.forEach(function(entry) {
    var cat = entry[0], amount = entry[1];
    var info = CATEGORIES[cat] || { emoji: '❓', color: '#636E72' };
    var displayCat = info.displayName || cat;
    var pctVal = (amount / totalForGrid * 100);
    var escapedCat = cat.replace(/'/g, "\\'");
    html += '<div onclick="showCategoryDetail(\'' + escapedCat + '\')" style="' +
      'background:' + info.color + '15;border:1px solid ' + info.color + '30;' +
      'border-radius:10px;padding:10px 8px;cursor:pointer;' +
      'min-width:calc(33% - 4px);flex:1;' +
      'text-align:center;transition:transform 0.15s;" ontouchstart="this.style.transform=\'scale(0.96)\'" ontouchend="this.style.transform=\'scale(1)\'">';
    html += '<div style="font-size:1.3rem;">' + info.emoji + '</div>';
    html += '<div style="font-size:0.7rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:2px 0;">' + displayCat + '</div>';
    html += '<div style="font-size:0.8rem;font-weight:700;">' + formatMoney(amount) + '</div>';
    html += '<div style="font-size:0.6rem;color:var(--text-muted);">' + pctVal.toFixed(1) + '%</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '</div>';

  // 8. Сводка
  html += '<div class="card" style="padding:16px;text-align:center;">';
  html += '<div style="font-size:0.75rem;color:var(--text-secondary);">Проанализировано ' + txExpenses.length + ' расходов за ' + allMonths.length + ' мес.</div>';
  html += '</div>';

  container.innerHTML = html;

  // Render charts after DOM updated
  setTimeout(function() { renderAnalyticsCharts(byMonth, byMonthCat, dailyByMonth, allMonths); }, 50);
}

function renderAnalyticsCharts(byMonth, byMonthCat, dailyByMonth, allMonths) {
  if (!allMonths || allMonths.length === 0) return;

  var catColors = [
    '#6C5CE7', '#E17055', '#00B894', '#FDCB6E', '#0984E3',
    '#E84393', '#00CEC9', '#636E72', '#D63031', '#A29BFE',
    '#74B9FF', '#FD79A8'
  ];

  // ===== 1. Stacked bar — category share by month (top-12) =====
  var topCats = Object.entries(byMonthCat)
    .map(function(e) { return [e[0], Object.values(e[1]).reduce(function(a, b) { return a + b; }, 0)]; })
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 12)
    .map(function(e) { return e[0]; });

  var stackedCtx = document.getElementById('analyticsStackedChart');
  if (stackedCtx) {
    if (analyticsStackedChart) analyticsStackedChart.destroy();

    var datasets = topCats.map(function(cat, i) {
      return {
        label: cat,
        data: allMonths.map(function(m) {
          var monthTotal = byMonth[m] || 1;
          var catVal = (byMonthCat[cat] && byMonthCat[cat][m]) ? byMonthCat[cat][m] : 0;
          return Math.round(catVal / monthTotal * 100);
        }),
        backgroundColor: catColors[i % catColors.length],
        borderRadius: 2
      };
    });

    // «Прочее»
    var otherData = allMonths.map(function(m, mi) {
      var sum = datasets.reduce(function(s, ds) { return s + ds.data[mi]; }, 0);
      return Math.max(0, 100 - sum);
    });
    if (otherData.some(function(v) { return v > 0; })) {
      datasets.push({ label: 'Прочее', data: otherData, backgroundColor: '#b2bec3', borderRadius: 2 });
    }

    analyticsStackedChart = new Chart(stackedCtx, {
      type: 'bar',
      data: { labels: allMonths.map(function(m) { return monthName(m).replace(/\s\d{4}$/, ''); }), datasets: datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#6B7280' } },
          tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.raw + '%'; } } }
        },
        scales: {
          x: { stacked: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#6B7280' }, grid: { display: false } },
          y: { stacked: true, max: 100, ticks: { callback: function(v) { return v + '%'; }, color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#6B7280' }, grid: { color: 'rgba(128,128,128,0.1)' } }
        }
      }
    });
  }

  // ===== 2. Daily average chart =====
  var dailyCtx = document.getElementById('analyticsDailyChart');
  if (dailyCtx) {
    if (analyticsDailyChart) analyticsDailyChart.destroy();

    var avgDailyData = allMonths.map(function(mk) {
      var days = Object.keys(dailyByMonth[mk] || {}).length;
      return days > 0 ? Math.round(byMonth[mk] / days) : 0;
    });
    var overallAvg = avgDailyData.length > 0
      ? Math.round(avgDailyData.reduce(function(s, v) { return s + v; }, 0) / avgDailyData.length)
      : 0;

    var textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#6B7280';

    analyticsDailyChart = new Chart(dailyCtx, {
      type: 'bar',
      data: {
        labels: allMonths.map(function(m) { return monthName(m).replace(/\s\d{4}$/, ''); }),
        datasets: [
          {
            label: 'Ср. расход/день',
            data: avgDailyData,
            backgroundColor: avgDailyData.map(function(v) { return v > overallAvg ? 'rgba(225,112,85,0.6)' : 'rgba(0,184,148,0.6)'; }),
            borderRadius: 6
          },
          {
            label: 'Среднее',
            data: avgDailyData.map(function() { return overallAvg; }),
            type: 'line',
            borderColor: 'var(--accent)',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + formatMoney(ctx.raw); } } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function(v) { return formatMoney(v); }, color: textColor }, grid: { color: 'rgba(128,128,128,0.1)' } },
          x: { ticks: { color: textColor }, grid: { display: false } }
        }
      }
    });
  }

  // ===== 3. Income vs Expenses chart =====
  var incExpCtx = document.getElementById('analyticsIncExpChart');
  if (incExpCtx) {
    var incData = allMonths.map(function(mk) {
      var md = getMonthData(mk);
      return md.filter(function(t) { return t.type === 'income'; }).reduce(function(s, t) { return s + t.amount; }, 0);
    });
    var expData = allMonths.map(function(mk) { return byMonth[mk] || 0; });
    var savingsData = allMonths.map(function(mk, i) { return incData[i] - expData[i]; });
    var textColor2 = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#6B7280';

    new Chart(incExpCtx, {
      type: 'bar',
      data: {
        labels: allMonths.map(function(m) { return monthName(m).replace(/\s\d{4}$/, ''); }),
        datasets: [
          { label: 'Доходы', data: incData, backgroundColor: 'rgba(0,184,148,0.5)', borderRadius: 4 },
          { label: 'Расходы', data: expData, backgroundColor: 'rgba(225,112,85,0.5)', borderRadius: 4 },
          { label: 'Баланс', data: savingsData, type: 'line', borderColor: '#6C5CE7', pointBackgroundColor: '#6C5CE7', borderWidth: 2, pointRadius: 3, fill: false }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, color: textColor2 } },
          tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + formatMoney(ctx.raw); } } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function(v) { return (v / 1000) + 'k'; }, color: textColor2 }, grid: { color: 'rgba(128,128,128,0.1)' } },
          x: { ticks: { color: textColor2 }, grid: { display: false } }
        }
      }
    });
  }
}
function renderTrends() {
  const months = getAvailableMonths().slice(-12);
  if (months.length < 2) {
    const note = document.getElementById('trend-note');
    if (note) note.textContent = 'Загрузите выписки за 2+ месяцев для отображения трендов.';
    return;
  }
  const note = document.getElementById('trend-note');
  if (note) note.textContent = '';
  const labels = months.map(m => monthName(m).replace(/\s\d{4}$/, ''));
  const expenses = [], incomes = [];
  months.forEach(m => {
    const d = getMonthData(m);
    expenses.push(d.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
    incomes.push(d.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
  });
  const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => (v/1000) + 'k' } } } };
  if (trendExpChart) trendExpChart.destroy();
  const ctx1 = document.getElementById('trend-expenses-chart');
  if (ctx1) {
    trendExpChart = new Chart(ctx1, {
      type: 'line',
      data: { labels, datasets: [{ data: expenses, borderColor: '#E17055', backgroundColor: 'rgba(225,112,85,0.1)', fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: '#E17055', borderWidth: 2 }] },
      options: chartOpts
    });
  }
  if (trendBalChart) trendBalChart.destroy();
  const ctx2 = document.getElementById('trend-balance-chart');
  if (ctx2) {
    trendBalChart = new Chart(ctx2, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Доходы', data: incomes, backgroundColor: 'rgba(0,184,148,0.7)', borderRadius: 6 },
        { label: 'Расходы', data: expenses, backgroundColor: 'rgba(225,112,85,0.7)', borderRadius: 6 }
      ] },
      options: { ...chartOpts, plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
  }
}

// ============================================================
//  CSV IMPORT
// ============================================================
function parseCSV(text) {
  const firstLines = text.split('\n').slice(0, 3).join('');
  let sep = ',';
  if (firstLines.split(';').length > firstLines.split(',').length) sep = ';';
  if (firstLines.split('\t').length > firstLines.split(sep).length) sep = '\t';
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  const dateCol = header.findIndex(h => /дата|date/.test(h));
  const descCol = header.findIndex(h => /описание|desc|наименование|назначение|merchant|name/.test(h));
  const amountCol = header.findIndex(h => /сумма|amount|sum|стоимость/.test(h));
  const catCol = header.findIndex(h => /категория|category|тип/.test(h));
  const timeCol = header.findIndex(h => /время|time/.test(h));
  if (dateCol === -1 || amountCol === -1) { toast('Не найдены колонки Дата и Сумма'); return []; }
  const txs = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i], sep);
    if (row.length <= Math.max(dateCol, amountCol)) continue;
    const rawDate = row[dateCol]?.trim();
    const rawAmount = row[amountCol]?.trim();
    if (!rawDate || !rawAmount) continue;
    let date = '';
    const m1 = rawDate.match(/(\d{2})[.\/](\d{2})[.\/](\d{4})/);
    const m2 = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m1) date = m1[3] + '-' + m1[2] + '-' + m1[1];
    else if (m2) date = m2[1] + '-' + m2[2] + '-' + m2[3];
    else continue;
    const amount = Math.abs(parseFloat(rawAmount.replace(/\s/g, '').replace(',', '.')));
    if (!amount || isNaN(amount)) continue;
    const desc = descCol >= 0 ? (row[descCol]?.trim() || 'CSV') : 'CSV';
    const time = timeCol >= 0 ? (row[timeCol]?.trim() || '') : '';
    const isExpense = parseFloat(rawAmount.replace(/\s/g, '').replace(',', '.')) < 0 || rawAmount.includes('-');
    const bankCat = catCol >= 0 ? (row[catCol]?.trim() || '') : '';
    const category = categorizeTransaction(desc, bankCat);
    const monthKey = date.substring(0, 7);
    txs.push({ id: 'csv_' + date + '_' + txHash('csv', date, time, String(amount), desc), date, time, description: desc, amount, type: isExpense ? 'expense' : 'income', category, monthKey, bank: 'csv', manual: false, comment: '' });
  }
  return txs;
}
function parseCSVRow(line, sep) {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && (i === 0 || line[i-1] !== '\\')) { inQuotes = !inQuotes; continue; }
    if (ch === sep && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

// ============================================================
//  SHARE REPORT (canvas-based)
// ============================================================
async function shareReport() {
  if (!requirePro('shareReport')) return;
  trackEvent('feature_use', { feature: 'shareReport' });
  if (!currentMonth) { toast('Нет данных'); return; }
  const data = getMonthData(currentMonth);
  const income = data.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = data.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const catTotals = {};
  data.filter(t => t.type === 'expense').forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 800;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1A1B2E'; ctx.fillRect(0, 0, 600, 800);
  ctx.fillStyle = '#FFF'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Финансовый Помощник', 300, 50);
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#9CA3AF';
  ctx.fillText(monthName(currentMonth), 300, 80);
  ctx.fillStyle = '#00B894'; ctx.font = 'bold 32px sans-serif';
  ctx.fillText('+' + formatMoney(income), 300, 140);
  ctx.fillStyle = '#E17055';
  ctx.fillText('-' + formatMoney(expenses), 300, 180);
  const balance = income - expenses;
  ctx.fillStyle = balance >= 0 ? '#00B894' : '#E17055'; ctx.font = '16px sans-serif';
  ctx.fillText('Баланс: ' + (balance >= 0 ? '+' : '') + formatMoney(balance), 300, 220);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.moveTo(50, 250); ctx.lineTo(550, 250); ctx.stroke();
  ctx.fillStyle = '#FFF'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Топ расходов:', 50, 290);
  const clrs = ['#6C5CE7', '#00B894', '#FDCB6E', '#E17055', '#74B9FF'];
  topCats.forEach(([cat, amount], i) => {
    const y = 330 + i * 60;
    const info = CATEGORIES[cat] || { emoji: '?' };
    const pct = expenses > 0 ? Math.round(amount / expenses * 100) : 0;
    ctx.font = '24px sans-serif'; ctx.fillStyle = '#FFF'; ctx.fillText(info.emoji, 50, y);
    ctx.font = '16px sans-serif'; ctx.fillText(cat, 90, y - 5);
    ctx.fillStyle = '#9CA3AF'; ctx.font = '14px sans-serif';
    ctx.fillText(formatMoney(amount) + ' · ' + pct + '%', 90, y + 15);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(90, y + 22, 440, 6);
    ctx.fillStyle = clrs[i] || '#6C5CE7'; ctx.fillRect(90, y + 22, Math.round(440 * pct / 100), 6);
  });
  ctx.fillStyle = '#6C5CE7'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Создано в Финансовом Помощнике', 300, 760);
  try {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'finance_' + currentMonth + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Финансовый отчёт' });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'finance_' + currentMonth + '.png';
      a.click(); URL.revokeObjectURL(url);
      toast('Картинка сохранена');
    }
  } catch(e) { if (e.name !== 'AbortError') toast('Ошибка: ' + e.message); }
}

// ============================================================
//  MONTH NAVIGATION
// ============================================================
function changeMonth(dir) {
  // If in custom period mode, switch back to month mode first
  if (STATE.settings.periodMode === 'custom') {
    STATE.settings.periodMode = 'month';
    STATE.settings.periodStart = null;
    STATE.settings.periodEnd = null;
    saveState();
  }
  const months = getAvailableMonths();
  const idx = months.indexOf(currentMonth);
  const newIdx = idx + dir;
  if (newIdx >= 0 && newIdx < months.length) {
    // Free tier: limit to 3 most recent months
    if (!isPro() && months.length > 3 && newIdx < months.length - 3) {
      requirePro('extendedHistory');
      return;
    }
    currentMonth = months[newIdx];
    renderDashboard();
  }
}

// ============================================================
//  PERIOD PICKER
// ============================================================
function openPeriodPicker() {
  const isCustom = STATE.settings.periodMode === 'custom';
  const months = getAvailableMonths();

  let html = '';

  // Mode toggle
  html += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
  html += '<span class="filter-chip ' + (!isCustom ? 'active' : '') + '" onclick="setPeriodMode(\'month\')" style="flex:1;text-align:center;">Месяц</span>';
  html += '<span class="filter-chip ' + (isCustom ? 'active' : '') + '" onclick="setPeriodMode(\'custom\')" style="flex:1;text-align:center;">Произвольный</span>';
  html += '</div>';

  if (!isCustom) {
    // Month grid
    html += '<div class="period-grid">';
    months.forEach(function(mk) {
      var active = mk === currentMonth ? ' period-month-active' : '';
      html += '<div class="period-month-cell' + active + '" onclick="selectPeriodMonth(\'' + mk + '\')">' + monthName(mk) + '</div>';
    });
    html += '</div>';
  } else {
    // Date range inputs
    html += '<div style="display:flex;gap:12px;margin-bottom:16px;">';
    html += '<div style="flex:1;"><div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">С</div>';
    html += '<input type="date" id="period-start" value="' + (STATE.settings.periodStart || '') + '" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;"></div>';
    html += '<div style="flex:1;"><div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">По</div>';
    html += '<input type="date" id="period-end" value="' + (STATE.settings.periodEnd || '') + '" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;"></div>';
    html += '</div>';

    // Quick presets
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">';
    html += '<span class="filter-chip" onclick="setPeriodPreset(\'7d\')">7 дней</span>';
    html += '<span class="filter-chip" onclick="setPeriodPreset(\'14d\')">14 дней</span>';
    html += '<span class="filter-chip" onclick="setPeriodPreset(\'30d\')">30 дней</span>';
    html += '<span class="filter-chip" onclick="setPeriodPreset(\'90d\')">3 месяца</span>';
    html += '<span class="filter-chip" onclick="setPeriodPreset(\'salary\')">💰 До зарплаты</span>';
    html += '</div>';

    html += '<button onclick="applyCustomPeriod()" style="width:100%;padding:12px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-size:0.95rem;font-weight:600;cursor:pointer;">Применить</button>';
  }

  document.getElementById('period-picker-content').innerHTML = html;
  document.getElementById('modal-period-picker').classList.add('active');
}

function setPeriodMode(mode) {
  if (mode === 'month') {
    STATE.settings.periodMode = 'month';
    STATE.settings.periodStart = null;
    STATE.settings.periodEnd = null;
    saveState();
  } else {
    STATE.settings.periodMode = 'custom';
  }
  openPeriodPicker(); // re-render
}

function selectPeriodMonth(mk) {
  STATE.settings.periodMode = 'month';
  STATE.settings.periodStart = null;
  STATE.settings.periodEnd = null;
  currentMonth = mk;
  saveState();
  closeModal('modal-period-picker');
  renderDashboard();
}

function setPeriodPreset(preset) {
  var today = new Date();
  var start, end;
  if (preset === '7d') {
    end = today;
    start = new Date(today); start.setDate(start.getDate() - 6);
  } else if (preset === '14d') {
    end = today;
    start = new Date(today); start.setDate(start.getDate() - 13);
  } else if (preset === '30d') {
    end = today;
    start = new Date(today); start.setDate(start.getDate() - 29);
  } else if (preset === '90d') {
    end = today;
    start = new Date(today); start.setDate(start.getDate() - 89);
  } else if (preset === 'salary') {
    var salaryDate = parseInt(STATE.settings.salaryDate) || 25;
    var d = new Date(today);
    if (d.getDate() >= salaryDate) {
      start = new Date(d.getFullYear(), d.getMonth(), salaryDate);
    } else {
      start = new Date(d.getFullYear(), d.getMonth() - 1, salaryDate);
    }
    end = today;
  }
  var fmt = function(d) { return d.toISOString().substring(0, 10); };
  document.getElementById('period-start').value = fmt(start);
  document.getElementById('period-end').value = fmt(end);
}

function applyCustomPeriod() {
  var s = document.getElementById('period-start').value;
  var e = document.getElementById('period-end').value;
  if (!s || !e) { toast('Укажите обе даты'); return; }
  if (s > e) { toast('Начало должно быть раньше конца'); return; }
  STATE.settings.periodMode = 'custom';
  STATE.settings.periodStart = s;
  STATE.settings.periodEnd = e;
  saveState();
  closeModal('modal-period-picker');
  renderDashboard();
}

// ============================================================
//  PRO STATUS CARD (settings)
// ============================================================
function renderProStatus() {
  const card = document.getElementById('pro-status-card');
  if (!card) return;
  const pro = isPro();
  const plan = STATE.settings.plan || 'free';
  const trialLeft = getTrialDaysLeft();
  let html = '';
  if (plan === 'pro') {
    html = '<div style="text-align:center;padding:16px;">'
      + '<div style="font-size:2rem;margin-bottom:8px;">✨</div>'
      + '<div style="font-weight:700;font-size:1.1rem;margin-bottom:4px;">PRO активен</div>'
      + '<div style="color:var(--text-secondary);font-size:0.85rem;">Все функции разблокированы</div>'
      + '</div>';
  } else if (plan === 'trial' && trialLeft > 0) {
    html = '<div style="text-align:center;padding:16px;">'
      + '<div style="font-size:2rem;margin-bottom:8px;">🎁</div>'
      + '<div style="font-weight:700;font-size:1.1rem;margin-bottom:4px;">PRO-триал</div>'
      + '<div style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:12px;">Осталось ' + trialLeft + ' дн. — все функции доступны</div>'
      + '<div style="background:var(--bg-primary);border-radius:8px;height:6px;overflow:hidden;">'
      + '<div style="height:100%;width:' + Math.round(trialLeft / 14 * 100) + '%;background:var(--accent);border-radius:8px;transition:width 0.3s;"></div></div>'
      + '</div>';
  } else {
    html = '<div style="text-align:center;padding:16px;">'
      + '<div style="font-size:2rem;margin-bottom:8px;">⭐</div>'
      + '<div style="font-weight:700;font-size:1.1rem;margin-bottom:4px;">Бесплатный план</div>'
      + '<div style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:12px;">Разблокируйте бюджеты, цели, тренды и экспорт</div>'
      + (STATE.settings.trialStartDate
        ? '<button class="btn-primary" style="width:100%;padding:12px;font-size:0.95rem;" onclick="showProModal(\'budgets\')">Подписаться — 199 ₽/мес</button>'
        : '<button class="btn-primary" style="width:100%;padding:12px;font-size:0.95rem;background:var(--green);" onclick="startTrial()">🎁 Попробовать PRO 14 дней бесплатно</button>')
      + '</div>';
  }
  // Analytics summary
  var analytics = getAnalyticsSummary();
  if (analytics.total > 0) {
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:0.8rem;color:var(--text-muted);">'
      + '📊 Аналитика: ' + analytics.total + ' событий с ' + analytics.since
      + '</div>';
  }
  card.innerHTML = html;
  card.style.display = 'block';
}

// ============================================================
//  MONTHLY STORIES (Spotify Wrapped format)
// ============================================================
function showMonthlyStories(monthKey) {
  const mk = monthKey || currentMonth;
  if (!mk) return;

  const data = getMonthData(mk);
  if (data.length === 0) { toast('Нет данных за этот месяц'); return; }

  const income = data.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = data.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const expenseData = data.filter(t => t.type === 'expense');

  // Category breakdown
  const catTotals = {};
  for (const t of expenseData) catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const top3 = sortedCats.slice(0, 3);

  // Biggest single expense
  const biggest = expenseData.length > 0 ? expenseData.reduce((max, t) => t.amount > max.amount ? t : max, expenseData[0]) : null;

  // Comparison with prev month
  const totalTrends = calculateTotalTrends(mk);
  const saved = income - expenses;
  const savingsRate = income > 0 ? Math.round((saved / income) * 100) : 0;

  // Rank info
  const rankInfo = getRankInfo(STATE.gamification.rank);

  // Build slides
  const slides = [];
  const gradients = [
    'linear-gradient(135deg, #6C5CE7, #A29BFE)',
    'linear-gradient(135deg, #00B894, #55EFC4)',
    'linear-gradient(135deg, #E17055, #FAB1A0)',
    'linear-gradient(135deg, #0984E3, #74B9FF)',
    'linear-gradient(135deg, #FDCB6E, #F39C12)',
    'linear-gradient(135deg, #E84393, #FD79A8)'
  ];

  // Slide 1: Title
  slides.push(`<div class="story-slide" style="background:${gradients[0]};">
    <div style="font-size:3rem;">📊</div>
    <div style="font-size:1.6rem;font-weight:800;margin:8px 0;">Ваш ${monthName(mk)}</div>
    <div style="font-size:2.2rem;font-weight:800;">${formatMoney(expenses)}</div>
    <div style="font-size:0.9rem;opacity:0.8;">расходов за месяц</div>
    ${income > 0 ? `<div style="margin-top:12px;font-size:0.9rem;">Доходы: ${formatMoney(income)}</div>` : ''}
  </div>`);

  // Slide 2: Top 3 categories
  if (top3.length > 0) {
    let catHtml = top3.map(([cat, amt], i) => {
      const info = CATEGORIES[cat] || { emoji: '❓' };
      const pct = expenses > 0 ? Math.round((amt / expenses) * 100) : 0;
      const medal = ['🥇','🥈','🥉'][i];
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;${i < 2 ? 'border-bottom:1px solid rgba(255,255,255,0.2);' : ''}">
        <div style="font-size:1.5rem;">${medal}</div>
        <div style="flex:1;">
          <div style="font-weight:700;">${info.emoji} ${info.displayName || cat}</div>
          <div style="font-size:0.8rem;opacity:0.8;">${pct}% всех расходов</div>
        </div>
        <div style="font-weight:700;">${formatMoney(amt)}</div>
      </div>`;
    }).join('');
    slides.push(`<div class="story-slide" style="background:${gradients[1]};">
      <div style="font-size:1.2rem;font-weight:800;margin-bottom:12px;">🏆 ТОП-3 категории</div>
      ${catHtml}
    </div>`);
  }

  // Slide 3: Biggest expense
  if (biggest) {
    const cleanDesc = typeof cleanDescription === 'function' ? cleanDescription(biggest.description) : biggest.description;
    slides.push(`<div class="story-slide" style="background:${gradients[2]};">
      <div style="font-size:3rem;">💸</div>
      <div style="font-size:1.1rem;font-weight:700;margin:8px 0;">Самая крупная трата</div>
      <div style="font-size:1.8rem;font-weight:800;">${formatMoney(biggest.amount)}</div>
      <div style="font-size:0.9rem;opacity:0.8;margin-top:4px;">${cleanDesc}</div>
      <div style="font-size:0.8rem;opacity:0.6;margin-top:4px;">${new Date(biggest.date).toLocaleDateString('ru-RU', {day:'numeric',month:'long'})}</div>
    </div>`);
  }

  // Slide 4: Comparison with average
  if (totalTrends && totalTrends.avgExpense > 0) {
    const diff = expenses - totalTrends.avgExpense;
    const diffPct = Math.round((diff / totalTrends.avgExpense) * 100);
    const betterOrWorse = diff <= 0 ? '✅ Меньше обычного!' : '📈 Больше обычного';
    const diffText = diff <= 0 ? `На ${formatMoney(Math.abs(diff))} меньше` : `На ${formatMoney(diff)} больше`;
    slides.push(`<div class="story-slide" style="background:${gradients[3]};">
      <div style="font-size:1.1rem;font-weight:700;">Сравнение с обычным</div>
      <div style="font-size:2.5rem;font-weight:800;margin:12px 0;">${diffPct > 0 ? '+' : ''}${diffPct}%</div>
      <div style="font-size:1rem;">${betterOrWorse}</div>
      <div style="font-size:0.85rem;opacity:0.8;margin-top:8px;">${diffText}<br>Среднее: ${formatMoney(totalTrends.avgExpense)}</div>
    </div>`);
  }

  // Slide 5: Savings
  slides.push(`<div class="story-slide" style="background:${gradients[4]};">
    <div style="font-size:3rem;">${saved >= 0 ? '💰' : '⚠️'}</div>
    <div style="font-size:1.1rem;font-weight:700;margin:8px 0;">${saved >= 0 ? 'Экономия' : 'Перерасход'}</div>
    <div style="font-size:2rem;font-weight:800;">${formatMoney(Math.abs(saved))}</div>
    ${income > 0 ? `<div style="font-size:0.9rem;opacity:0.8;margin-top:8px;">${savingsRate}% от дохода ${saved >= 0 ? 'отложено' : 'не хватило'}</div>` : ''}
  </div>`);

  // Slide 6: Rank
  slides.push(`<div class="story-slide" style="background:${gradients[5]};">
    <div style="font-size:3rem;">${rankInfo.icon}</div>
    <div style="font-size:1.3rem;font-weight:800;margin:8px 0;">Ваш ранг: ${rankInfo.label}</div>
    <div style="font-size:0.9rem;opacity:0.8;">Серия: ${STATE.gamification.streak.current} мес. подряд</div>
    <div style="font-size:0.9rem;opacity:0.8;">Бейджей: ${STATE.gamification.badges.length} из ${BADGE_DEFS.length}</div>
  </div>`);

  // Render
  let currentSlide = 0;
  const totalSlides = slides.length;

  function renderSlide() {
    const dots = Array.from({length: totalSlides}, (_, i) =>
      `<div style="width:${i === currentSlide ? '16px' : '6px'};height:4px;border-radius:2px;background:${i === currentSlide ? '#fff' : 'rgba(255,255,255,0.4)'};transition:all 0.3s;"></div>`
    ).join('');

    // Extract gradient from slide and apply to container
    const slideHtml = slides[currentSlide];
    const bgMatch = slideHtml.match(/background:(linear-gradient[^;]+);/);
    const bg = bgMatch ? bgMatch[1] : gradients[currentSlide] || gradients[0];

    document.getElementById('stories-content').innerHTML = `
      <div style="position:relative;height:100%;min-height:500px;background:${bg};border-radius:20px;transition:background 0.4s;">
        <div style="display:flex;gap:3px;padding:16px 20px;position:absolute;top:0;left:0;right:0;z-index:5;">${dots}</div>
        <div style="height:100%;display:flex;align-items:center;justify-content:center;padding:48px 8px 48px;">
          ${slideHtml.replace(/style="background:[^"]*"/, 'style="background:transparent;"')}
        </div>
        <div style="position:absolute;bottom:20px;left:0;right:0;text-align:center;font-size:0.8rem;color:rgba(255,255,255,0.5);">
          ${currentSlide < totalSlides - 1 ? 'Нажмите →' : 'Нажмите, чтобы закрыть'}
        </div>
      </div>`;
  }

  // Open modal
  document.getElementById('modal-stories').classList.add('active');
  renderSlide();

  // Navigation by clicking left/right halves
  document.getElementById('stories-content').onclick = function(e) {
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width * 0.4) {
      // Right side — next
      if (currentSlide < totalSlides - 1) { currentSlide++; renderSlide(); }
      else closeModal('modal-stories');
    } else {
      // Left side — prev
      if (currentSlide > 0) { currentSlide--; renderSlide(); }
    }
  };
}

// ============================================================
//  INIT
// ============================================================
function init() {
  applyTheme();
  restoreCustomCategories();
  trackEvent('app_open');
  // Check trial expiry
  if (STATE.settings.plan === 'trial' && getTrialDaysLeft() <= 0) {
    STATE.settings.plan = 'free';
    saveState();
    setTimeout(function() { toast('PRO-триал завершён'); }, 1500);
  }
  if (STATE.transactions.length > 0) {
    const months = getAvailableMonths();
    currentMonth = months[months.length - 1];
    showScreen('dashboard');
  } else {
    showScreen('onboarding');
    // Show tutorial on first launch
    setTimeout(showTutorial, 500);
  }
}

// ============================================================
//  ONBOARDING TUTORIAL
// ============================================================
const TUTORIAL_STEPS = [
  {
    emoji: '👋',
    title: 'Привет!',
    desc: 'Это приложение покажет, куда уходят деньги. Всё работает прямо на твоём телефоне — данные никуда не отправляются. Полная приватность.'
  },
  {
    emoji: '📄',
    title: 'Шаг 1: Скачай выписку',
    desc: 'Зайди в приложение своего банка (Сбер или Тинькофф), найди раздел «Выписка» и скачай PDF за нужный месяц.<br><br><a href="#" onclick="closeTutorial();setTimeout(showBankInstructions,300);return false;" style="color:var(--accent);">📋 Подробная инструкция для каждого банка</a>'
  },
  {
    emoji: '📤',
    title: 'Шаг 2: Загрузи сюда',
    desc: 'Нажми кнопку загрузки или просто перетащи PDF-файл на экран. Приложение само разберёт все операции по категориям: продукты, транспорт, подписки и т.д.'
  },
  {
    emoji: '✏️',
    title: 'Шаг 3: Настрой под себя',
    desc: 'Нажми на любую операцию — можно изменить категорию, добавить комментарий или удалить. Приложение запомнит твой выбор для будущих выписок.'
  },
  {
    emoji: '📊',
    title: 'Готово!',
    desc: 'Дашборд покажет сводку: доходы, расходы, топ категорий. Советник подскажет, где экономить. Загружай выписки каждый месяц — приложение будет следить за трендами!'
  }
];

let tutorialStep = 0;

function showTutorial() {
  // Check if tutorial was already shown
  if (localStorage.getItem('finHelper_tutorialDone')) return;

  tutorialStep = 0;
  renderTutorialStep();
  document.getElementById('tutorial-overlay').classList.add('active');
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStep];
  const dotsHtml = TUTORIAL_STEPS.map((_, i) =>
    `<div class="dot ${i === tutorialStep ? 'active' : ''}"></div>`
  ).join('');

  document.getElementById('tutorial-dots').innerHTML = dotsHtml;
  document.getElementById('tutorial-content').innerHTML = `
    <div class="tut-emoji">${step.emoji}</div>
    <div class="tut-title">${step.title}</div>
    <div class="tut-desc">${step.desc}</div>
  `;

  const nextBtn = document.getElementById('tutorial-next');
  const prevBtn = document.getElementById('tutorial-prev');
  if (tutorialStep === TUTORIAL_STEPS.length - 1) {
    nextBtn.textContent = 'Начать!';
  } else {
    nextBtn.textContent = 'Далее →';
  }
  if (prevBtn) prevBtn.style.display = tutorialStep > 0 ? 'block' : 'none';
}

function nextTutorialStep() {
  if (tutorialStep < TUTORIAL_STEPS.length - 1) {
    tutorialStep++;
    renderTutorialStep();
  } else {
    closeTutorial();
  }
}

function prevTutorialStep() {
  if (tutorialStep > 0) {
    tutorialStep--;
    renderTutorialStep();
  }
}

function closeTutorial() {
  document.getElementById('tutorial-overlay').classList.remove('active');
}

function closeTutorialForever() {
  localStorage.setItem('finHelper_tutorialDone', '1');
  document.getElementById('tutorial-overlay').classList.remove('active');
}

// ============================================================
//  EVENT DELEGATION for transaction clicks (robust fallback)
// ============================================================
document.getElementById('tx-list')?.addEventListener('click', function(e) {
  const txItem = e.target.closest('.tx-item[data-txid]');
  if (txItem) {
    const txId = txItem.dataset.txid;
    if (txId) openRecat(txId);
  }
});

// ============================================================
//  SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.error('[SW] Registration failed:', err));
  });
}

init();
