// 考研日历 PWA · Service Worker v2
// 策略: 离线优先 (app.html/messages), 网络优先 (其他)
const CACHE = 'kaoyan-v2';
const ASSETS = ['./', './app.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // 只处理同源
  if (url.origin !== self.location.origin) return;

  // app.html 用"离线优先 + 后台更新"
  if (url.pathname.endsWith('/app.html') || url.pathname === '/') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(net => {
          if (net && net.status === 200) {
            const clone = net.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return net;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 其他资源: 网络优先, 失败回退缓存
  e.respondWith(
    fetch(e.request).then(net => {
      if (net && net.status === 200) {
        const clone = net.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return net;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('./app.html')))
  );
});

// 接收来自页面的通知请求 (兼容旧代码)
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE_NOTIFY') {
    const { title, body, time } = e.data;
    const delay = time - Date.now();
    if (delay > 0) {
      setTimeout(() => {
        self.registration.showNotification(title, {
          body: body,
          icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%233498db" width="100" height="100" rx="20"/><text x="50" y="68" font-size="60" text-anchor="middle" fill="white" font-family="sans-serif">📅</text></svg>',
          badge: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%233498db" width="100" height="100" rx="20"/><text x="50" y="68" font-size="60" text-anchor="middle" fill="white" font-family="sans-serif">📅</text></svg>',
          tag: 'kaoyan-' + Date.now(),
          requireInteraction: false,
        });
      }, delay);
    }
  }
});
