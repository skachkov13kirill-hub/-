// ═══════════════════════════════════════════════════════════════
// FAMILY.JS — Семейный бюджет
// PDF-парсер Сбербанка, категоризация, bucket-система, рендеринг
// ═══════════════════════════════════════════════════════════════

// ── CATEGORY PATTERNS (22 categories, 170+ patterns) ──
var CATEGORY_PATTERNS = [
  { category: 'Здоровье', patterns: [
    'YAKOB-ART','YAKOB','TOP GUN','TOPGUN','CMRT','STOMATOLOG','СТОМАТОЛОГ',
    'APTEKA','АПТЕКА','ZHIVIKA','GORZDRAV','RIGLA','BEAUTY',
    'САЛОН','КРАСОТ','SPA','МАССАЖ','КЛИНИКА','MED','DOCTOR',
    'SPBAPT','APTECHNOE','TSMRT','RDK','ATRIBEAUTE',
    'OH MY NAILS','NAILS','MUMINOVA','RODIONOV',
    'LOGINOVA','ЛОГИНОВА','ЮЛИЯ ИЛЬИНИЧНА','K. YULIA','ТРЕНЕР','TRAINER',
    'MC DEVYATKINO','МЕДИЦИНСКИЙ','ПОЛИКЛИНИКА','АНАЛИЗ','ЛАБОРАТОР',
    'INVITRO','HELIX','ГЕМОТЕСТ','KRASIVO','ПАРИКМАХЕР','BARBER',
    'МАНИКЮР','ПЕДИКЮР','КОСМЕТОЛОГ','СТРИЖКА'
  ]},
  { category: 'Детские товары', patterns: [
    'DETSKIY MIR','ДЕТСКИЙ МИР','ДОЧКИ-СЫНОЧКИ','DOCHKI',
    'VOTONYA','VOTONIA','КОРАБЛИК','KORABLIK','ДЕТКИ',
    'MOTHERCARE','CHICCO','ИГРУШКИ','TOYS'
  ]},
  { category: 'Продукты', patterns: [
    'MAGNIT','МАГНИТ','LENTA','ЛЕНТА','DIKSI','ДИКСИ','PEREKRESTOK',
    'ПЕРЕКРЁСТОК','ПЕРЕКРЕСТОК','PYATEROCHKA','ПЯТЁРОЧКА','ПЯТЕРОЧКА','5KA',
    'SAMOKAT','САМОКАТ','LAVKA','ЛАВКА','VKUSVILL','ВКУСВИЛЛ',
    'SPAR','PRISMA','ASHAN','АШАН','OKEY','О\'КЕЙ','METRO',
    'SUPERMARKET','ПРОДУКТЫ','ГИПЕРМАРКЕТ',
    'MAGAZIN','MURINO TRC NEBO','NEBO','DIXY','REAL',
    'OREKHI-FRUKTY','KRASNOE&BELOE','KRASNOE','WINELAB','VV_',
    'ФЕРМЕР','РЫНОК','MYASNOV','МЯСНОВ',
    'ULYBKA RADUGI','УЛЫБКА РАДУГИ','BIKO','СЕМИШАГОФФ',
    'TRC NEBO','PISKAREVSKAYA','MEGA PARNAS','МЕГА ПАРНАС',
    'CHEFMARKET','ШЕФ МАРКЕТ'
  ]},
  { category: 'Рестораны/кафе', patterns: [
    'MR BLACK','DO.BRO','ДОБРО','COFFEE','КОФЕ','CHAJHONA','ЧАЙХОНА',
    'BULOCH','БУЛОЧ','BBQ','MASE','QSR','РЕСТОРАН','КАФЕ','БУРГЕР',
    'KFC','МАКДОНАЛЬДС','MCDONALD','ТЕРЕМОК','TEREMOK','SUBWAY',
    'ШОКОЛАДНИЦА','STARBUCKS','BUSHE','БУШЕ','ПИЦЦА','PIZZA',
    'СУШИ','SUSHI','BURGER','БУРГЕР КИНГ',
    'CHAIKHONA','CHAIHONA','GRADUSY','HOTKITCHENSPB','UZHINDOMA',
    'BAR','БАР','PIZZAHUB','YUMAMART','KINOBAR',
    'PEKARNYA','ПЕКАРНЯ','CHEBUREKMI','ЧЕБУРЕК',
    'TEKSTURA','ETYUD','GAVSHINSKAYA','KAFE','CAFE',
    'STOLOVAYA','СТОЛОВАЯ','ФАСТФУД','FASTFOOD',
    'CHAJKHONA','RESTORAN','BALKAN','V CHASHCHE','FUDTRAK',
    'NOVOE DEVYATKINO','MISTOLOVO','SHAVERMA','ШАВЕРМА','ШАШЛЫК',
    'DZHUDOS','ДЖУДОС','HOTKITCHEN','ПИЦЦЕРИЯ','PIZZERIA',
    'KHLEBNIK','ХЛЕБНИК','EVRAZIYA','ЕВРАЗИЯ','GRADUSI','ГРАДУСЫ',
    'IZBA','ИЗБА','SBERCHAEVYE','ЧАЕВЫЕ'
  ]},
  { category: 'Маркетплейсы', patterns: [
    'WILDBERRIES','ВАЙЛДБЕРРИЗ','WB','OZON','ОЗОН','NESP',
    'YANDEX DOSTAVKA','ALIEXPRESS','LAMODA','MEGAMARKET',
    'СБЕРМЕГАМАРКЕТ','ЯНДЕКС МАРКЕТ','YANDEX MARKET'
  ]},
  { category: 'Доставка еды', patterns: [
    'UZHIN DOMA','УЖИН ДОМА','YANDEX EDA','ЯНДЕКС ЕДА','YANDEX.EDA',
    'DELIVERY CLUB','ДЕЛИВЕРИ','SBERMARKET','СБЕРМАРКЕТ','ЯНДЕКС ЛАВКА',
    'CDEK','СДЭК','BOXBERRY','ПОЧТА','POST','ДОСТАВКА','DELIVERY',
    'DPD','PICKPOINT','ПУНКТ ВЫДАЧИ','ПВЗ'
  ]},
  { category: 'Такси', patterns: [
    'YANDEX GO','ЯНДЕКС ГО','YANDEX.GO','TAXI','ТАКСИ',
    'UBER','CITYMOBIL','СИТИМОБИЛ','MAXIM','МАКСИМ','YANDEX*','ROGOZHINA'
  ]},
  { category: 'Авто', patterns: [
    'LUKOIL','ЛУКОЙЛ','GAZPROM','ГАЗПРОМ','ROSNEFT','РОСНЕФТЬ',
    'BENZIN','БЕНЗИН','АЗС','SHELL','PARKING','ПАРКОВКА',
    'ZSD','ЗСД','AVTODOR','АВТОДОР','АВТОМОЙКА','МОЙКА',
    'СТО','АВТОСЕРВИС','MAXIMUM','МАКСИМУМ',
    'AZS ','MOYKA','TROFIMOV','11149','11160',
    'ТОПЛИВО','FUEL','ЗАПРАВКА','NEFTMAGISTRAL','ТНК','BP ',
    'GPNBONUS','GPN BONUS','ГАЗПРОМНЕФТЬ',
    'KAD2','КАД2','KAD ','NOVOE KACHESTVO DOROG','NKDOR','ПЛАТОН',
    'ШИНОМОНТАЖ','АВТОЗАПЧАСТИ','EXIST','AUTODOC',
    'M11','М11','OSSP_M11','SEVERNAYA MAGISTRAL'
  ]},
  { category: 'Дом/Хозтовары', patterns: [
    'GALAMART','ГАЛАМАРТ','FIX PRICE','ФИКС ПРАЙС','FIXPRICE',
    'ДОМОВОЙ','ХОЗТОВАРЫ','ПОСУДА','ПОРЯДОК','ЛЕОНАРДО',
    'FAMILIA','ФАМИЛИЯ','КРАСНАЯ ЦЕНА','СВЕТОФОР'
  ]},
  { category: 'Табак', patterns: [
    'TABAK','ТАБАК','TABAKO','СИГАРЕТ','VAPE','IQOS','SMOKE','СИГАРЫ','ТАБАЧНАЯ'
  ]},
  { category: 'Коммунальные', patterns: [
    'ЖКХ','GIS_ZKH','GIS ZKH','GIS-ZKH','КОММУНАЛЬН','ТСЖ','УК ',
    'ИНТЕРНЕТ','РОСТЕЛЕКОМ','ROSTELEKOM','BEELINE','БИЛАЙН',
    'MTS','МТС','MEGAFON','МЕГАФОН','TELE2','ТЕЛЕ2',
    'DOM.RU','ДОМА.РУ','ЭТАЖИ',
    'KABINET-ZHITELYA','ETAZHI','PITER-LEND','UK PITER','BERI ZARYAD',
    'ЭЛЕКТРИЧЕСТВО','ОТОПЛЕНИЕ','ВОДОСНАБЖ','ТКО','КАПРЕМОНТ',
    'EPR_GIS','ЕИРЦ','ЕРКЦ'
  ]},
  { category: 'Развлечения', patterns: [
    'КИНО','CINEMA','ТЕАТР','КОНЦЕРТ','STEAM','PLAYSTATION',
    'МУЗЕЙ','БОУЛИНГ','КВЕСТ','КАРТИНГ','ПАРК',
    'OTELLO','ARENA','TVEL-SPORT','TROYA-LYUKS','GRACHEV','SHTUMF',
    'БИЛЕТ','TICKET','АТТРАКЦИОН','РАЗВЛЕЧ',
    'DDX','КАРО','KARO','ФОРМУЛА КИНО','МИРАЖ','MIRAGE',
    'URBANFIT','ФИТНЕС','FITNESS','GYM ','СПОРТЗАЛ','ТРЕНАЖЕР',
    'XXI VEK','XXI ВЕК','ПЛАНЕТА КИНО'
  ]},
  { category: 'Путешествия', patterns: [
    'ОТЕЛЬ','HOTEL','АВИА','AEROFLOT','АЭРОФЛОТ','S7',
    'ПОБЕДА','POBEDA','РЖД','RZD','BOOKING','AIRBNB',
    'OSTROVOK','ОСТРОВОК','TUTU','ТУТУ','ХОСТЕЛ','HOSTEL',
    'САНАТОРИЙ','КУРОРТ','TRAVEL',
    'КОМФОРТ БУКИНГ','BRONEVIK','БРОНЕВИК','SUTOCHNO','СУТОЧНО'
  ]},
  { category: 'Книги', patterns: [
    'BUKVOED','БУКВОЕД','ЧИТАЙ-ГОРОД','CHITAI','КНИГА','BOOK',
    'ЛИТРЕС','LITRES','БИБЛИОТЕКА','LIBRARY','ЛАБИРИНТ'
  ]},
  { category: 'Одежда', patterns: [
    'ZARA','H&M','HM ','UNIQLO','ОДЕЖДА','ОБУВЬ','ADIDAS','NIKE',
    'СПОРТМАСТЕР','SPORTMASTER','DECATHLON','ДЕКАТЛОН',
    'KARI','КАРИ','GLORIA JEANS','BEFREE','БИФРИ',
    'RESERVED','MASSIMO','BERSHKA','PULL&BEAR','ОСТИН','OSTIN',
    'GASUITS','SOMIASLEEP','БЕЛЬЕ','INTIMISSIMI','CALZEDONIA',
    'HENDERSON','MANGO','ТВОЕ','ТВОЁ','LC WAIKIKI'
  ]},
  { category: 'Подписки', patterns: [
    'ПОДПИСКА','PLUS','ПЛЮС','PRIME','VPN','NETFLIX','SPOTIFY',
    'YOUTUBE','KINOPOISK','КИНОПОИСК','IVI','OKKO','YANDEX PLUS',
    'SBSCR','МОМЕНТАЛЬНЫЕ',
    'SUBSCRIBE','PREMIUM','МУЗЫКА','MUSIC','ОБЛАКО','CLOUD',
    'T-BUNDLE','BUNDLE','СЕРВИСЫ ЯНДЕКСА','YANDEX SERVICES'
  ]},
  { category: 'Цветы/Подарки', patterns: [
    'BOUQUET','БУКЕТ','ЦВЕТЫ','FLOWERS','ФЛОРИСТ','FLORIST',
    'ПОДАРОК','GIFT','СУВЕНИР','ОТКРЫТКА'
  ]},
  { category: 'Образование', patterns: [
    'КУРС','COURSE','ШКОЛА','SCHOOL','ОБУЧЕН','УРОК',
    'РЕПЕТИТОР','TUTOR','УНИВЕРСИТЕТ','ЛЕКЦИЯ','СЕМИНАР',
    'SKILLBOX','НЕТОЛОГИЯ','GEEKBRAINS','COURSERA','UDEMY',
    'DISTANT-COLLEGE','ОНЛАЙН ШКОЛА','ВЕБИНАР','МАСТЕР-КЛАСС',
    'ДЕТСКИЙ САД','KINDERGARTEN','ОБРАЗОВАНИЕ','EDUCATION'
  ]}
];

// ── BUCKET PATTERNS ──
var BUCKET_PATTERNS = {
  business: [
    'AVITO','АВИТО','YANDEX BUSINESS','ЯНДЕКС БИЗНЕС',
    'VK РЕКЛАМА','DOMCLICK','ДОМКЛИК','YCLIENTS',
    'НАЛОГ','NALOG','ФНС','ГОСУСЛУГИ',
    'ИНГОССТРАХ','INGOSSTRAKH','СТРАХОВ'
  ],
  transit: [
    'T-BANK','TBANK','Т-БАНК','TINKOFF','ТИНЬКОФФ',
    'NETMONET','НЕТМОНЕТ','АЛЬФА-БАНК','ALFA-BANK','MAPP_SBERBANK',
    'НАЛИЧНЫЕ','CASH','ATM','БАНКОМАТ','ВЫДАЧА НАЛИЧНЫХ',
    'ВОЗВРАТ','REFUND','КЭШБЭК','CASHBACK',
    'КОМИССИЯ','COMMISSION','ОБСЛУЖИВАНИЕ КАРТЫ',
    'DOLYAME','ДОЛЯМИ','PODELI','ПОДЕЛИ',
    'HALVA','ХАЛВА','SPLIT','СПЛИТ','BRANCH'
  ],
  unassigned: [
    'LEROY','LERUA','ЛЕРУА','ЛЕМАНА','LEMANPRO','LEMANA PRO','LEMANAPROG',
    'PETROVICH','ПЕТРОВИЧ','AFONYA','АФОНЯ','ASKONA','АСКОНА',
    'IKEA','ИКЕА','HOFF','ХОФФ','OBI','ОБИ','CASTORAMA','МАКСИДОМ',
    'TACHKA','ТАЧКА'
  ]
};
var EXCLUSION_PATTERNS = [].concat(BUCKET_PATTERNS.business, BUCKET_PATTERNS.transit, BUCKET_PATTERNS.unassigned);

var BUCKET_META = {
  unassigned: { name: 'Нераспределённые', icon: '\u2753', color: '#F59E0B' },
  business:   { name: 'Бизнес',           icon: '\uD83D\uDCBC', color: '#8B5CF6' },
  transit:    { name: 'Транзит',           icon: '\uD83D\uDD04', color: '#6B7280' },
  family:     { name: 'Семья',             icon: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67', color: '#10B981' }
};

var TRANSFER_PATTERNS = [
  'ПЕРЕВОД','TRANSFER','P2P','CARD2CARD','СБП','SBP','C2C',
  'KOPILKA','КОПИЛКА','KARTA-VKLAD','КАРТА-ВКЛАД',
  'SBERBANK ONL@IN','ПО ДОГОВОРУ','ДОГОВОР КРЕДИТА',
  'НОМЕРУ ТЕЛЕФОНА','"T-БАНК"','GCUP'
];
var TRAINER_PATTERNS = ['LOGINOVA','ЛОГИНОВА','ТРЕНЕР','TRAINER','ЮЛИЯ ИЛЬИНИЧНА','K. YULIA'];
var EXCLUDE_PHONES = ['+79111763164','79111763164','89111763164'];
var LARGE_AMOUNT_THRESHOLD = 40000;

var CATEGORY_ICONS = {
  'Здоровье':'\uD83D\uDC8A','Детские товары':'\uD83E\uDDF8','Продукты':'\uD83D\uDED2',
  'Рестораны/кафе':'\uD83C\uDF7D','Маркетплейсы':'\uD83D\uDCE6','Доставка еды':'\uD83D\uDE9A',
  'Такси':'\uD83D\uDE95','Авто':'\uD83D\uDE97','Дом/Хозтовары':'\uD83C\uDFE0',
  'Табак':'\uD83D\uDEAC','Коммунальные':'\uD83D\uDCA1','Развлечения':'\uD83C\uDFAD',
  'Путешествия':'\u2708\uFE0F','Книги':'\uD83D\uDCDA','Одежда':'\uD83D\uDC54',
  'Подписки':'\uD83D\uDCF1','Цветы/Подарки':'\uD83D\uDC90','Образование':'\uD83C\uDF93',
  'Прочее':'\uD83D\uDCCB'
};

var DEFAULT_NORMS = {
  'Рестораны/кафе': { monthly_avg: 64481 },
  'Продукты': { monthly_avg: 53972 },
  'Здоровье': { monthly_avg: 45307 },
  'Коммунальные': { monthly_avg: 17338 },
  'Развлечения': { monthly_avg: 13818 },
  'Авто': { monthly_avg: 10618 },
  'Маркетплейсы': { monthly_avg: 9255 },
  'Такси': { monthly_avg: 7836 },
  'Путешествия': { monthly_avg: 4769 },
  'Детские товары': { monthly_avg: 3990 },
  'Подписки': { monthly_avg: 3787 },
  'Табак': { monthly_avg: 3289 },
  'Одежда': { monthly_avg: 2189 },
  'Книги': { monthly_avg: 1754 },
  'Дом/Хозтовары': { monthly_avg: 1466 },
  'Образование': { monthly_avg: 1430 },
  'Доставка еды': { monthly_avg: 1352 },
  'Цветы/Подарки': { monthly_avg: 918 }
};

// ═══════════════════════════════════════════════════════════════
// FAMILY STATE
// ═══════════════════════════════════════════════════════════════
var familyLocal = { transactions: [], excluded: [] };
var familyRules = {};
var familySubtab = 'categories';
var familyMonthFilter = '';
var familyOwnerFilter = 'all';
var familyPending = [];

function loadFamilyLocal() {
  try {
    var raw = localStorage.getItem('dresscode_family_v1');
    if (raw) familyLocal = JSON.parse(raw);
  } catch(e) {}
  try {
    var r = localStorage.getItem('dresscode_family_rules');
    if (r) familyRules = JSON.parse(r);
  } catch(e) {}
}
function saveFamilyLocal() {
  try { localStorage.setItem('dresscode_family_v1', JSON.stringify(familyLocal)); } catch(e) {}
}
function saveFamilyRules() {
  try { localStorage.setItem('dresscode_family_rules', JSON.stringify(familyRules)); } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// DATA HELPERS
// ═══════════════════════════════════════════════════════════════
function famNormalizeDate(dateStr) {
  if (!dateStr) return '';
  var str = String(dateStr).trim();
  if (str.indexOf('T') >= 0) {
    var d = new Date(str);
    if (!isNaN(d)) {
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }
  }
  if (str.indexOf('.') >= 0) {
    var parts = str.split('.');
    if (parts.length >= 3) {
      var y = parts[2].split(' ')[0];
      if (y.length === 2) y = '20' + y;
      return y + '-' + parts[1].padStart(2,'0') + '-' + parts[0].padStart(2,'0');
    }
  }
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) return str.split('T')[0];
  return str;
}

function famGetMonthKey(dateStr) {
  if (!dateStr) return null;
  var nd = famNormalizeDate(dateStr);
  if (nd.match(/^\d{4}-\d{2}/)) return nd.substring(0,7);
  var parts = String(dateStr).split('.');
  if (parts.length >= 3) {
    var y = parseInt(parts[2]); if (y < 100) y += 2000;
    return y + '-' + parts[1].padStart(2,'0');
  }
  return null;
}

function famTxKey(tx) {
  var date = famNormalizeDate(String(tx.date || ''));
  var amount = Math.abs(parseFloat(tx.amount) || 0);
  var desc = String(tx.description || '').substring(0,25).toUpperCase();
  return date + '|' + amount + '|' + desc;
}

function getAllFamilyTx() {
  var cloud = state.familyTx || [];
  var local = familyLocal.transactions || [];
  var seen = {};
  var result = [];
  cloud.forEach(function(tx) {
    var key = famTxKey(tx);
    if (!seen[key]) {
      seen[key] = true;
      if (!tx.category) tx.category = categorize(tx.description, tx.merchant);
      if (!tx.monthKey) tx.monthKey = famGetMonthKey(tx.date);
      result.push(tx);
    }
  });
  local.forEach(function(tx) {
    var key = famTxKey(tx);
    if (!seen[key]) { seen[key] = true; result.push(tx); }
  });
  return result;
}

function getAllFamilyExcluded() {
  var cloud = state.familyExcluded || [];
  var local = familyLocal.excluded || [];
  var seen = {};
  var result = [];
  cloud.concat(local).forEach(function(tx) {
    var key = famTxKey(tx);
    if (!seen[key]) { seen[key] = true; result.push(tx); }
  });
  return result;
}

function getFilteredFamilyTx() {
  var all = getAllFamilyTx();
  var now = new Date();
  var currentMK = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  var filterMonth = familyMonthFilter || currentMK;

  return all.filter(function(tx) {
    var mk = tx.monthKey || famGetMonthKey(tx.date);
    if (mk !== filterMonth) return false;
    if (familyOwnerFilter !== 'all' && tx.owner && tx.owner !== familyOwnerFilter) return false;
    return true;
  });
}

function getAvailableMonths() {
  var all = getAllFamilyTx().concat(getAllFamilyExcluded());
  var months = {};
  all.forEach(function(tx) {
    var mk = tx.monthKey || famGetMonthKey(tx.date);
    if (mk) months[mk] = true;
  });
  var now = new Date();
  var currentMK = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  months[currentMK] = true;
  return Object.keys(months).sort().reverse();
}

// ═══════════════════════════════════════════════════════════════
// CATEGORIZATION
// ═══════════════════════════════════════════════════════════════
function categorize(desc, merchant) {
  if (!desc && !merchant) return 'Прочее';
  var checkText = (merchant || desc || '').toUpperCase().trim();
  for (var rule in familyRules) {
    if (checkText.indexOf(rule) >= 0 || rule.indexOf(checkText) >= 0) return familyRules[rule];
  }
  var upper = (desc || '').toUpperCase();
  for (var i = 0; i < CATEGORY_PATTERNS.length; i++) {
    var cat = CATEGORY_PATTERNS[i];
    for (var j = 0; j < cat.patterns.length; j++) {
      if (upper.indexOf(cat.patterns[j].toUpperCase()) >= 0) return cat.category;
    }
  }
  return 'Прочее';
}

function isTransfer(desc) {
  var upper = (desc || '').toUpperCase();
  for (var i = 0; i < TRANSFER_PATTERNS.length; i++) {
    if (upper.indexOf(TRANSFER_PATTERNS[i].toUpperCase()) >= 0) return true;
  }
  return false;
}

function isTrainer(desc) {
  var upper = (desc || '').toUpperCase();
  for (var i = 0; i < TRAINER_PATTERNS.length; i++) {
    if (upper.indexOf(TRAINER_PATTERNS[i].toUpperCase()) >= 0) return true;
  }
  return false;
}

function shouldExclude(desc, amount) {
  var upper = (desc || '').toUpperCase();
  if (isTransfer(desc)) {
    if (isTrainer(desc)) return { exclude: false };
    return { exclude: true, reason: 'transfer', bucket: 'transit' };
  }
  if (amount > LARGE_AMOUNT_THRESHOLD) {
    return { exclude: true, reason: 'large_amount', bucket: 'unassigned' };
  }
  for (var i = 0; i < EXCLUSION_PATTERNS.length; i++) {
    if (upper.indexOf(EXCLUSION_PATTERNS[i].toUpperCase()) >= 0) {
      return { exclude: true, reason: 'pattern', bucket: getBucketForPattern(EXCLUSION_PATTERNS[i]) };
    }
  }
  for (var i = 0; i < EXCLUDE_PHONES.length; i++) {
    if (desc && desc.indexOf(EXCLUDE_PHONES[i]) >= 0) {
      return { exclude: true, reason: 'phone', bucket: 'transit' };
    }
  }
  return { exclude: false };
}

function getBucketForPattern(pattern) {
  var p = pattern.toUpperCase();
  for (var bucket in BUCKET_PATTERNS) {
    var pats = BUCKET_PATTERNS[bucket];
    for (var i = 0; i < pats.length; i++) {
      if (pats[i].toUpperCase() === p) return bucket;
    }
  }
  return 'unassigned';
}

function extractMerchant(desc) {
  if (!desc) return 'Неизвестно';
  var clean = desc.replace(/^(ИП|ООО|АО|ПАО)\s+/i, '')
                  .replace(/\s+(RUS|RU|RUSSIA|MOSKVA|MOSCOW|SPB)\.?\s*$/i, '')
                  .replace(/\s+\d{5,}.*$/, '')
                  .replace(/\.\s*Операция по.*$/i, '');
  return (clean.substring(0,40).trim()) || desc.substring(0,30);
}

// ═══════════════════════════════════════════════════════════════
// PDF PARSER
// ═══════════════════════════════════════════════════════════════
function parseFamilyPDF(file) {
  return file.arrayBuffer().then(function(buf) {
    return pdfjsLib.getDocument({ data: buf }).promise;
  }).then(function(pdf) {
    var pages = [];
    for (var i = 1; i <= pdf.numPages; i++) pages.push(i);
    return pages.reduce(function(chain, pageNum) {
      return chain.then(function(text) {
        return pdf.getPage(pageNum).then(function(page) {
          return page.getTextContent().then(function(content) {
            return text + content.items.map(function(it) { return it.str; }).join(' ') + '\n';
          });
        });
      });
    }, Promise.resolve(''));
  }).then(function(text) {
    if (text.indexOf('кредитной карты') >= 0 || text.indexOf('КРЕДИТНОЙ КАРТЫ') >= 0) {
      return parseSberCreditText(text, file.name);
    }
    return parseSberDebitText(text, file.name);
  });
}

function parseSberCreditText(text, filename) {
  var transactions = [];
  var excluded = [];
  var owner = 'Unknown';
  if (text.toUpperCase().indexOf('СКАЧКОВА АЛ') >= 0) owner = 'Алёна';
  else if (text.toUpperCase().indexOf('СКАЧКОВ КИРИЛЛ') >= 0) owner = 'Кирилл';

  var txPattern = /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+([А-Яа-яёЁA-Za-z,\s]+?)\s+([\+\-]?[\d\s]+,\d{2})\s+([\d\s]+,\d{2})\s+\d{2}\.\d{2}\.\d{4}\s+\d+\s+(.+?)(?=\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}|Продолжение|Дата формирования|ПАО Сбербанк|$)/gs;
  var match;
  while ((match = txPattern.exec(text)) !== null) {
    var date = match[1];
    var amountStr = match[4].replace(/\s/g, '').replace(',', '.');
    var description = match[6].replace(/\s+/g, ' ').trim();
    var isIncome = amountStr.indexOf('+') >= 0;
    var amount = Math.abs(parseFloat(amountStr.replace('+','').replace('-','')));
    if (isIncome || amount <= 0) continue;
    var exclusion = shouldExclude(description, amount);
    if (exclusion.exclude) {
      excluded.push({ date: date, description: description.substring(0,100), merchant: extractMerchant(description),
        amount: amount, reason: exclusion.reason, bucket: exclusion.bucket || 'unassigned',
        monthKey: famGetMonthKey(date), owner: owner, source: filename + ' (кредитная)' });
      continue;
    }
    transactions.push({ date: date, description: description.substring(0,100), merchant: extractMerchant(description),
      amount: amount, category: categorize(description), monthKey: famGetMonthKey(date),
      owner: owner, source: filename + ' (кредитная)' });
  }

  if (transactions.length === 0 && excluded.length === 0) {
    var lines = text.split(/(?=\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/);
    for (var li = 0; li < lines.length; li++) {
      var block = lines[li];
      var hm = block.match(/^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(.+?)\s+([\d\s]+,\d{2})\s+([\d\s]+,\d{2})/);
      if (!hm) continue;
      var dt = hm[1];
      var as = hm[4].replace(/\s/g,'').replace(',','.');
      var am = Math.abs(parseFloat(as));
      var dm = block.match(/\d{2}\.\d{2}\.\d{4}\s+\d+\s+(.+?)(?:Операция по карте|$)/s);
      var dsc = dm ? dm[1].replace(/\s+/g,' ').trim() : hm[3];
      if (am <= 0) continue;
      var ex = shouldExclude(dsc, am);
      if (ex.exclude) {
        excluded.push({ date: dt, description: dsc.substring(0,100), merchant: extractMerchant(dsc),
          amount: am, reason: ex.reason, bucket: ex.bucket || 'unassigned',
          monthKey: famGetMonthKey(dt), owner: owner, source: filename });
      } else {
        transactions.push({ date: dt, description: dsc.substring(0,100), merchant: extractMerchant(dsc),
          amount: am, category: categorize(dsc), monthKey: famGetMonthKey(dt),
          owner: owner, source: filename });
      }
    }
  }
  console.log('Кредитная выписка: ' + transactions.length + ' транзакций, ' + excluded.length + ' исключено');
  return { transactions: transactions, excluded: excluded };
}

function parseSberDebitText(text, filename) {
  var transactions = [];
  var excluded = [];
  var owner = 'Unknown';
  if (text.toUpperCase().indexOf('СКАЧКОВА АЛ') >= 0) owner = 'Алёна';
  else if (text.toUpperCase().indexOf('СКАЧКОВ КИРИЛЛ') >= 0) owner = 'Кирилл';

  var txPattern = /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(\d+)\s+(.+?)\s+([\+\-]?[\d\s]+[,\.]\d{2})\s+([\d\s]+[,\.]\d{2})/g;
  var match;
  while ((match = txPattern.exec(text)) !== null) {
    var date = match[1];
    var amountStr = match[5].replace(/\s/g,'').replace(',','.');
    var isIncome = amountStr.indexOf('+') >= 0;
    var amount = Math.abs(parseFloat(amountStr.replace('+','').replace('-','')));
    if (isIncome || amount <= 0) continue;
    var afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 500);
    var descMatch = afterMatch.match(/\d{2}\.\d{2}\.\d{4}\s+(.+?)(?=\d{2}\.\d{2}\.\d{4}|\n\n|$)/s);
    var description = descMatch ? descMatch[1].replace(/\s+/g,' ').trim() : match[4];
    var exclusion = shouldExclude(description, amount);
    if (exclusion.exclude) {
      excluded.push({ date: date, description: description.substring(0,100), merchant: extractMerchant(description),
        amount: amount, reason: exclusion.reason, bucket: exclusion.bucket || 'unassigned',
        monthKey: famGetMonthKey(date), owner: owner, source: filename });
    } else {
      transactions.push({ date: date, description: description.substring(0,100), merchant: extractMerchant(description),
        amount: amount, category: categorize(description), monthKey: famGetMonthKey(date),
        owner: owner, source: filename });
    }
  }
  console.log('Дебетовая выписка: ' + transactions.length + ' транзакций, ' + excluded.length + ' исключено');
  return { transactions: transactions, excluded: excluded };
}

// ═══════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════
function renderFamilyTab() {
  renderFamilyBudget();
  updateFamilyMonthFilter();
  switch (familySubtab) {
    case 'categories': renderFamilyCategories(); break;
    case 'transactions': renderFamilyTransactions(); break;
    case 'distribution': renderFamilyDistribution(); break;
    default: renderFamilyCategories();
  }
}

function renderFamilyBudget() {
  var el = document.getElementById('familyBudgetBar');
  if (!el) return;
  var now = new Date();
  var cm = now.getMonth() + 1;
  var yr = now.getFullYear();
  var currentMK = yr + '-' + String(cm).padStart(2,'0');
  var allTx = getAllFamilyTx();
  var monthTx = allTx.filter(function(tx) {
    return (tx.monthKey || famGetMonthKey(tx.date)) === currentMK;
  });
  var spent = 0;
  monthTx.forEach(function(tx) { spent += Math.abs(parseFloat(tx.amount) || 0); });
  var budget = parseFloat(state.settings['расходы_семья']) || 300000;
  var pct = Math.min(100, Math.round(spent / budget * 100));
  var daysInMonth = new Date(yr, cm, 0).getDate();
  var today = now.getDate();
  var daysLeft = daysInMonth - today;
  var dailyActual = today > 0 ? Math.round(spent / today) : 0;
  var dailyBudget = daysInMonth > 0 ? Math.round(budget / daysInMonth) : 0;
  var progressColor = pct > 100 ? 'var(--red)' : pct > 75 ? 'var(--orange)' : 'var(--green)';
  var tempoOk = dailyActual <= dailyBudget;

  var html = '<div class="fam-budget-progress">';
  html += '<div class="fam-budget-label"><span>Потрачено в ' + MONTH_NAMES[cm] + '</span>';
  html += '<span>' + fmt(spent) + ' из ' + fmtShort(budget) + '</span></div>';
  html += '<div class="progress-bg"><div class="progress-fg" style="width:' + Math.min(pct,100) + '%;background:' + progressColor + ';">' + pct + '%</div></div>';
  html += '<div class="fam-budget-meta">';
  html += '<span style="color:' + (tempoOk ? 'var(--green)' : 'var(--red)') + ';">' + fmtShort(dailyActual) + '/день</span>';
  html += '<span>Норма: ' + fmtShort(dailyBudget) + '/день</span>';
  html += '<span>' + daysLeft + ' дн. осталось</span>';
  html += '</div></div>';
  el.innerHTML = html;
}

function updateFamilyMonthFilter() {
  var sel = document.getElementById('famMonthFilter');
  if (!sel) return;
  var months = getAvailableMonths();
  var now = new Date();
  var currentMK = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  if (!familyMonthFilter) familyMonthFilter = currentMK;
  sel.innerHTML = months.map(function(mk) {
    var parts = mk.split('-');
    var name = MONTH_NAMES_CAP[parseInt(parts[1])] + ' ' + parts[0];
    return '<option value="' + mk + '"' + (mk === familyMonthFilter ? ' selected' : '') + '>' + name + '</option>';
  }).join('');
}

function renderFamilyCategories() {
  var el = document.getElementById('familyContent');
  if (!el) return;
  var txs = getFilteredFamilyTx();
  var catTotals = {};
  txs.forEach(function(tx) {
    var cat = tx.category || 'Прочее';
    catTotals[cat] = (catTotals[cat] || 0) + Math.abs(parseFloat(tx.amount) || 0);
  });
  var sorted = Object.keys(catTotals).sort(function(a,b) { return catTotals[b] - catTotals[a]; });
  var totalSpent = sorted.reduce(function(s,c) { return s + catTotals[c]; }, 0);

  var html = '<div class="fam-total-bar">' + fmt(totalSpent) + ' за месяц (' + txs.length + ' операций)</div>';
  html += '<div class="fam-cat-grid">';
  sorted.forEach(function(cat) {
    var spent = catTotals[cat];
    var norm = DEFAULT_NORMS[cat] ? DEFAULT_NORMS[cat].monthly_avg : 0;
    var pct = norm > 0 ? Math.min(200, Math.round(spent / norm * 100)) : 0;
    var barW = Math.min(100, pct);
    var barColor = pct > 100 ? 'var(--red)' : pct > 75 ? 'var(--orange)' : 'var(--green)';
    var icon = CATEGORY_ICONS[cat] || '\uD83D\uDCCB';

    html += '<div class="fam-cat-card">';
    html += '<div class="fam-cat-top"><span class="fam-cat-icon">' + icon + '</span>';
    html += '<span class="fam-cat-name">' + cat + '</span>';
    html += '<span class="fam-cat-amount">' + fmtShort(spent) + '</span></div>';
    if (norm > 0) {
      html += '<div class="fam-cat-bar"><div class="fam-cat-bar-fill" style="width:' + barW + '%;background:' + barColor + ';"></div></div>';
      html += '<div class="fam-cat-norm">' + pct + '% от нормы ' + fmtShort(norm) + '/мес</div>';
    }
    html += '</div>';
  });
  if (sorted.length === 0) {
    html += '<div class="fam-empty">Нет данных за выбранный период</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderFamilyTransactions() {
  var el = document.getElementById('familyContent');
  if (!el) return;
  var txs = getFilteredFamilyTx();
  txs.sort(function(a,b) {
    var da = famNormalizeDate(a.date);
    var db = famNormalizeDate(b.date);
    return db.localeCompare(da);
  });

  var html = '<div class="fam-tx-header">' + txs.length + ' операций</div>';
  html += '<div class="fam-tx-list">';
  txs.forEach(function(tx) {
    var icon = CATEGORY_ICONS[tx.category] || '\uD83D\uDCCB';
    var dateStr = formatDate(famNormalizeDate(tx.date));
    var merchant = tx.merchant || extractMerchant(tx.description) || tx.description || '';
    if (merchant.length > 30) merchant = merchant.substring(0,28) + '...';
    html += '<div class="fam-tx-row">';
    html += '<div class="fam-tx-icon">' + icon + '</div>';
    html += '<div class="fam-tx-info">';
    html += '<div class="fam-tx-desc">' + merchant + '</div>';
    html += '<div class="fam-tx-meta">' + dateStr;
    if (tx.category) html += ' \u00b7 ' + tx.category;
    if (tx.owner && tx.owner !== 'Unknown') html += ' \u00b7 ' + tx.owner;
    html += '</div></div>';
    html += '<div class="fam-tx-amount">\u2212' + fmtShort(Math.abs(parseFloat(tx.amount) || 0)) + '</div>';
    html += '</div>';
  });
  if (txs.length === 0) {
    html += '<div class="fam-empty">Нет операций за выбранный период</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderFamilyDistribution() {
  var el = document.getElementById('familyContent');
  if (!el) return;
  var excl = getAllFamilyExcluded();
  var filterMonth = familyMonthFilter || '';

  if (filterMonth) {
    excl = excl.filter(function(tx) {
      return (tx.monthKey || famGetMonthKey(tx.date)) === filterMonth;
    });
  }

  var buckets = {};
  excl.forEach(function(tx) {
    var b = tx.bucket || 'unassigned';
    if (!buckets[b]) buckets[b] = { items: [], total: 0 };
    buckets[b].items.push(tx);
    buckets[b].total += Math.abs(parseFloat(tx.amount) || 0);
  });

  var html = '<div class="fam-tx-header">' + excl.length + ' исключённых операций</div>';
  var bucketOrder = ['business','transit','unassigned'];
  bucketOrder.forEach(function(bk) {
    var data = buckets[bk];
    if (!data || data.items.length === 0) return;
    var meta = BUCKET_META[bk] || {};
    html += '<div class="fam-bucket">';
    html += '<div class="fam-bucket-header" style="border-left:3px solid ' + (meta.color || '#999') + ';">';
    html += '<span>' + (meta.icon || '') + ' ' + (meta.name || bk) + ' (' + data.items.length + ')</span>';
    html += '<span style="font-weight:700;">' + fmtShort(data.total) + '</span></div>';
    data.items.slice(0,5).forEach(function(tx) {
      html += '<div class="fam-tx-row fam-tx-row-sm">';
      html += '<div class="fam-tx-info"><div class="fam-tx-desc">' + (tx.merchant || tx.description || '') + '</div>';
      html += '<div class="fam-tx-meta">' + formatDate(famNormalizeDate(tx.date)) + ' \u00b7 ' + (tx.reason || '') + '</div></div>';
      html += '<div class="fam-tx-amount">' + fmtShort(Math.abs(parseFloat(tx.amount)||0)) + '</div></div>';
    });
    if (data.items.length > 5) {
      html += '<div class="fam-tx-meta" style="text-align:center;padding:8px;">... ещё ' + (data.items.length - 5) + '</div>';
    }
    html += '</div>';
  });
  if (excl.length === 0) {
    html += '<div class="fam-empty">Нет исключённых операций</div>';
  }
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// SUB-TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════
function switchFamilySubtab(name, btn) {
  familySubtab = name;
  document.querySelectorAll('.fam-subtab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderFamilyTab();
}

function applyFamilyFilters() {
  var sel = document.getElementById('famMonthFilter');
  var own = document.getElementById('famOwnerFilter');
  if (sel) familyMonthFilter = sel.value;
  if (own) familyOwnerFilter = own.value;
  renderFamilyTab();
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD
// ═══════════════════════════════════════════════════════════════
function openFamilyUpload() {
  var overlay = getOverlay('familyUploadOverlay');
  var panel = overlay.querySelector('.overlay-panel');
  panel.innerHTML = '<div class="overlay-handle"></div>'
    + '<div style="padding:20px;">'
    + '<div style="font-size:16px;font-weight:700;margin-bottom:12px;">\uD83D\uDCE4 Загрузить выписки</div>'
    + '<div style="font-size:13px;color:var(--text-2);margin-bottom:16px;">PDF выписки Сбербанка (кредитные + дебетовые)</div>'
    + '<input type="file" id="familyFileInput" accept=".pdf" multiple '
    + 'style="font-size:13px;margin-bottom:12px;width:100%;">'
    + '<button onclick="handleFamilyUpload()" class="fam-btn-upload">Загрузить и разобрать</button>'
    + '<div id="familyUploadStatus" style="margin-top:12px;"></div>'
    + '</div>'
    + '<div class="overlay-close" onclick="closeOverlay(\'familyUploadOverlay\')">Закрыть</div>';
  showOverlay('familyUploadOverlay');
}

function handleFamilyUpload() {
  var input = document.getElementById('familyFileInput');
  if (!input || !input.files || input.files.length === 0) {
    showToast('Выберите PDF файлы');
    return;
  }
  var statusEl = document.getElementById('familyUploadStatus');
  statusEl.innerHTML = '<div class="loading-box"><div class="spinner"></div><p>Разбор PDF...</p></div>';

  var files = Array.from(input.files);
  var totalTx = 0;
  var totalExcl = 0;

  var chain = Promise.resolve();
  files.forEach(function(file) {
    chain = chain.then(function() {
      return parseFamilyPDF(file).then(function(result) {
        result.transactions.forEach(function(tx) {
          var key = famTxKey(tx);
          var isDup = familyLocal.transactions.some(function(lt) { return famTxKey(lt) === key; });
          if (!isDup) { familyLocal.transactions.push(tx); totalTx++; }
        });
        result.excluded.forEach(function(tx) {
          var key = famTxKey(tx);
          var isDup = familyLocal.excluded.some(function(lt) { return famTxKey(lt) === key; });
          if (!isDup) { familyLocal.excluded.push(tx); totalExcl++; }
        });
      });
    });
  });

  chain.then(function() {
    saveFamilyLocal();
    statusEl.innerHTML = '<div style="background:var(--green-light);color:#065F46;padding:14px;border-radius:var(--r-sm);font-size:13px;font-weight:600;">'
      + '\u2705 Добавлено: ' + totalTx + ' операций, ' + totalExcl + ' исключено'
      + '</div>';
    renderFamilyTab();
    renderOverview(); // обновить мини-карточку семьи
    showToast('PDF разобран: +' + totalTx + ' операций');
  }).catch(function(err) {
    statusEl.innerHTML = '<div class="error-box">\u274C Ошибка: ' + err.message + '</div>';
    console.error('PDF parse error:', err);
  });
}

function syncFamily() {
  showToast('Синхронизация...');
  fetchJSONP(API_FAMILY + '?type=transactions').then(function(resp) {
    if (resp && resp.success && resp.data) {
      state.familyTx = resp.data;
      saveCache(state);
      renderFamilyTab();
      renderOverview();
      showToast('Данные обновлены из облака');
    }
  }).catch(function() {
    showToast('Ошибка синхронизации');
  });
}

// Init on load
loadFamilyLocal();
