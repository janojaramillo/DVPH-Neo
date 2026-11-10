/* DVPH Neo · service worker
   - Precarga la app (index.html con íconos y manifiesto incrustados).
   - Navegación: red primero con tiempo límite de 3 s; sin red → copia guardada.
   - Fuentes y demás recursos: copia guardada primero, se refresca en segundo plano.
   Para publicar cambios: suba ambos archivos y cambie VERSION. */
const VERSION = 'dvph-neo-v1.0.0';
const CORE = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Una por una: si una falla, no se cae toda la instalación.
    await Promise.all(CORE.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch (e) { /* sin red: se completará en la próxima visita */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function fromNetworkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([fetch(request), timeout(3000)]);
    if (res && res.ok) {
      cache.put('./index.html', res.clone());
      return res;
    }
    throw new Error('bad status');
  } catch (e) {
    return (await cache.match(request, { ignoreSearch: true }))
      || (await cache.match('./index.html'))
      || (await cache.match('./'))
      || new Response('<!doctype html><meta charset="utf-8"><title>DVPH Neo</title><body style="font-family:system-ui;padding:24px">Sin conexión y sin copia guardada. Abra la app una vez con internet.</body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(event.request);
  const net = fetch(event.request).then((res) => {
    // Guarda respuestas válidas y opacas (fuentes de Google sin CORS).
    if (res && (res.ok || res.type === 'opaque')) cache.put(event.request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { event.waitUntil(net); return cached; }
  const res = await net;
  return res || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (req.mode === 'navigate') {
    event.respondWith(fromNetworkFirst(req));
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (sameOrigin || fonts) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
