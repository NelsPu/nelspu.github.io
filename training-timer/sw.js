const CACHE_PREFIX = "training-timer-";
const CACHE = `${CACHE_PREFIX}v28`;
const APP_SHELL = new URL("./", self.location).href;
const ASSETS = ["./", "./styles.css?v=28", "./action-icons.css?v=28", "./plan-editor.css?v=28", "./app.mjs?v=28", "./timer-core.mjs?v=28", "./particle-sphere.css?v=28", "./particle-sphere.mjs?v=28", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match(APP_SHELL)))
  );
});
