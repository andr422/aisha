// Service worker для офлайн-работы ABA-чек-листа.
// При изменении файлов приложения поднимите версию в CACHE_NAME (v1 -> v2),
// чтобы у пользователей обновился кэш.
const CACHE_NAME = "aba-checklist-v3";

// Файлы приложения, которые кэшируем для офлайна.
// Пути относительные — работают и на GitHub Pages в подкаталоге.
const APP_SHELL = [
  "./",
  "./final_fixed_aisha.html",
  "./summary_fixed_aisha.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png"
];

// Установка: кэшируем оболочку приложения.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Активация: удаляем старые версии кэша.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Обрабатываем только GET. POST к Google (отправка данных) не трогаем —
  // пусть идёт напрямую в сеть.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Запросы к внешним доменам (Google Apps Script и т.п.) — только сеть,
  // не кэшируем, чтобы не мешать отправке данных.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Для страниц приложения: сначала сеть, при сбое — кэш (network-first).
  // Так пользователь видит свежую версию при наличии интернета,
  // но приложение работает и офлайн.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./final_fixed_aisha.html")))
    );
    return;
  }

  // Для остальных ресурсов (иконки, манифест): сначала кэш (cache-first).
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
      );
    })
  );
});
