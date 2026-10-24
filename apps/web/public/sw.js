// 간단한 오프라인 지원: 정적 파일(_next/static, 파일 이름에 해시가 있음)은 캐시 우선, 페이지와 데이터는 네트워크 우선.
// 데이터 주소에는 버전(?v=)이 붙어 데이터가 바뀌면 새로 받는다.
const CACHE = 'reborn-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const isAsset = /\/_next\/static\//.test(req.url);
  if (isAsset) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
  } else {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req).then((r) => r ?? Response.error())));
  }
});
