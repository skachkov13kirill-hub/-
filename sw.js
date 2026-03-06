// ============================================================
//  Service Worker — Финансовый Помощник PWA
//  Обеспечивает офлайн-работу и корректную работу с домашнего экрана
// ============================================================

const CACHE_NAME = 'finance-helper-v8';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './landing.html',
  './legal.html',
  './manifest.json'
];

// Внешние зависимости (CDN)
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

// Install: кешируем все основные файлы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Кешируем локальные файлы (обязательно)
      const localPromise = cache.addAll(ASSETS_TO_CACHE);
      // Кешируем CDN (по возможности, не блокируем установку)
      const cdnPromise = Promise.allSettled(
        CDN_ASSETS.map(url =>
          fetch(url).then(resp => {
            if (resp.ok) return cache.put(url, resp);
          }).catch(() => {/* CDN недоступен — не критично */})
        )
      );
      return Promise.all([localPromise, cdnPromise]);
    }).then(() => self.skipWaiting())
  );
});

// Activate: удаляем старые кеши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: стратегия Network First с fallback на кеш
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Только GET-запросы
  if (event.request.method !== 'GET') return;

  // Для навигационных запросов (HTML страницы) — всегда отдаём index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('./index.html')
      )
    );
    return;
  }

  // Для CDN ресурсов — Cache First (они редко меняются)
  if (url.hostname !== location.hostname) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // Для локальных ресурсов — Network First
  event.respondWith(
    fetch(event.request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return resp;
    }).catch(() => caches.match(event.request))
  );
});
