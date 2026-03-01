# КОНТЕКСТ: Finance Helper — для нового чата Claude

**Владелец:** Кирилл
**Дата обновления:** 1 марта 2026

---

## ЧТО ЭТО

**Finance Helper** — самостоятельное PWA-приложение "Финансовый Помощник" для учёта личных финансов.
Основная функция: загрузи банковскую выписку (PDF или CSV) → получи автоматический разбор расходов, аналитику, советы.

Возможности:
- Парсинг банковских выписок (PDF Сбербанк, Тинькофф, CSV)
- Автоматическая категоризация транзакций (18 категорий + пользовательские правила)
- Дашборд с аналитикой: donut-чарт, топ-категории, советник, health score
- Календарь расходов, shock-факты, streak без трат
- Система целей накопления и бюджетов
- Детектор подписок и регулярных платежей
- PRO-модель с feature flags (trial 14 дней)
- Тёмная/светлая тема, адаптация под мобильные (от 320px)

Стек: чистый JS, CSS Variables, Chart.js, pdf.js, localStorage. Один HTML-файл, без серверной части.

## ИНФРАСТРУКТУРА

| Что | Где |
|-----|-----|
| GitHub репо | github.com/skachkov13kirill-hub/- (Public) |
| Рабочий URL | https://skachkov13kirill-hub.github.io/-/finance/ |
| Код | папка `finance/` в репо `-` |
| Локальная копия | PROJECT_2_FINANCE_HELPER/ |

## ТЕКУЩИЙ СТАТУС — ВСЁ РАБОТАЕТ ✅

- GitHub Pages включены (Branch: main, / root) ✅
- PWA доступна по URL ✅
- Service Worker кэширует приложение (кэш v5) ✅
- Репо Public (для GitHub Pages) ✅
- Все данные хранятся локально в localStorage ✅

## АРХИТЕКТУРА

Приложение полностью автономное:
- Нет бэкенда, нет базы данных, нет внешних API
- Данные хранятся в localStorage браузера (~1.2 МБ на ~3000 транзакций)
- Внешние CDN-зависимости: pdf.js (парсинг PDF), Chart.js (графики), Google Fonts (Inter, JetBrains Mono)
- Опциональная Яндекс.Метрика для аналитики

## СТРУКТУРА РЕПО

```
- /
  ├── finance/          ← Finance Helper PWA
  │   ├── index.html    ← основной файл (~4862 строки)
  │   ├── manifest.json
  │   ├── sw.js
  │   └── assets/
  └── README.md
```

## КЛЮЧЕВЫЕ ФУНКЦИИ КОДА

**Навигация** (экраны):
- Dashboard (renderDashboard) — главный экран
- Transactions (renderTransactions) — список операций
- Trends (renderTrends) — графики
- Profile (renderProfile) — настройки, PRO, экспорт

**Парсеры:**
- parseSberPDF() — Сбербанк PDF
- parseTinkoff() — Тинькофф PDF
- parseCSV() — универсальный CSV

**Категоризация:**
- CATEGORIES — 18 категорий с паттернами
- categorize() — автоматическая
- renderRules() — пользовательские правила

**Уникальные фичи:**
- isPro() / showProModal() / startTrial() — монетизация
- findSubscriptions() / findRecurringPatterns() — подписки
- renderAdvisor() — 5 типов советов
- renderHealth() — health score 0-100
- renderCalendar() — календарь расходов
- renderShock() — shock-факты
- renderStreak() — дни без трат
- getDebts() / renderDebtsSection() — долги
- renderGoals() / addToGoal() — цели накопления
- renderTrash() — корзина (soft delete 30 дней)
- showTutorial() / TUTORIAL_STEPS — онбординг
- showHint() / checkHints() — подсказки
- showWizardMisc() — визард для «Прочее»
- findMatchedTransfer() — сопоставление переводов

**Состояние (STATE):**
- STATE.transactions — массив транзакций
- STATE.rules — пользовательские правила категорий
- STATE.budgets — бюджеты по категориям
- STATE.goals — цели накопления
- STATE.debts — долги
- STATE.trash — корзина

## ДОКУМЕНТАЦИЯ

- `PROJECT_2_FINANCE_HELPER/docs/MONETIZATION_STRATEGY.md` — стратегия монетизации и юнит-экономика
- `PROJECT_2_FINANCE_HELPER/docs/LEVEL2_STRATEGY.md` — план Level 2 (8 задач, ~15-20 часов)
- `PROJECT_2_FINANCE_HELPER/docs/LEVEL2_1_STRATEGY.md` — план Level 2.1 UX-революция (~25 часов)
- `PROJECT_2_FINANCE_HELPER/docs/PROMPT_NEW_CHAT.md` — контекст для нового чата

## ВАЖНЫЕ ПРАВИЛА ДЛЯ РАБОТЫ

- ⚠️ **Не пересоздавай файлы целиком** — только точечные правки через Edit
- ⚠️ **Проверяй JS-синтаксис** после правок
- ⚠️ Все данные на устройстве пользователя — никакого серверного хранения

## ЗАДАЧИ

1. Реализовать Level 2.1 (UX-революция, приоритет A)
2. Реализовать Level 2 (бюджеты, тренды, бэкап)
3. Доработки Finance Helper по фидбеку
