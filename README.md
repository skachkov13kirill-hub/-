# Финансовый Помощник

PWA для анализа личных финансов. Загрузил PDF-выписку из банка — получил аналитику. Данные не покидают устройство.

**Production:** https://skachkov13kirill-hub.github.io/-/finance/

## Возможности

- Парсинг PDF-выписок: Сбербанк (5 режимов), Тинькофф (2 режима), CSV
- Автоматическая категоризация (28 встроенных + пользовательские)
- Дашборд с аналитикой расходов (Chart.js)
- Бюджеты и цели
- Split-транзакции (разбивка на категории)
- Undo/Корзина (soft delete 30 дней)
- Backup/Import JSON
- AI-советник + Финансовое здоровье
- Правила категоризации + Smart Patterns
- Фильтры дашборда (dashExclude)
- Тёмная/светлая тема
- Офлайн-режим (PWA)

## Структура проекта

```
index.html         # HTML-структура (~610 строк)
css/
  styles.css       # Стили (~742 строки)
js/
  app.js           # Логика приложения (~4200 строк)
landing.html       # Лендинг
legal.html         # Правовая информация
manifest.json      # PWA-манифест
sw.js              # Service Worker v7
docs/
  КОНТЕКСТ_ПАРСЕРЫ_PDF_03_03_2026.md  # PDF-парсеры (5 MODE Sber, 2 Tinkoff)
  LEVEL2_1_STRATEGY.md                 # UX-стратегия (10/10 задач выполнено)
  MONETIZATION_STRATEGY.md             # Freemium-модель
```

## Стек

- **Frontend:** HTML5, CSS3, JavaScript (vanilla, без фреймворков)
- **Библиотеки:** PDF.js, Chart.js (CDN)
- **Хранение:** localStorage (данные на устройстве)
- **Деплой:** GitHub Pages (`github.com/skachkov13kirill-hub/-`, папка `finance/`)

## Деплой

```bash
cd /tmp && rm -rf deploy_repo && git clone https://github.com/skachkov13kirill-hub/-.git deploy_repo
cp index.html /tmp/deploy_repo/finance/
cp js/app.js /tmp/deploy_repo/finance/js/
cp css/styles.css /tmp/deploy_repo/finance/css/
cp sw.js /tmp/deploy_repo/finance/sw.js
cd /tmp/deploy_repo && git add finance/ && git commit -m "Update" && git push
```

**Не забыть:** обновить `CACHE_NAME` в sw.js при каждом деплое!

## Монетизация (план)

- Freemium: бесплатно (базовый) + PRO 199 руб/мес
- Точка безубыточности: 176 платящих пользователей
- Подробнее: `docs/MONETIZATION_STRATEGY.md`
