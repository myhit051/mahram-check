var CACHE_NAME = "mahram-check-v1";
var STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/data.js",
  "/js/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Install: cache static assets
self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Cache First for static, Network First for API
self.addEventListener("fetch", function(e) {
  var url = new URL(e.request.url);

  // API calls: Network First
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return new Response(JSON.stringify({
          mahram: null,
          type: "ไม่สามารถระบุได้",
          reason: "ไม่มีการเชื่อมต่ออินเทอร์เน็ต — ลองใช้คำค้นหาที่ตรงกับฐานข้อมูล"
        }), { headers: { "Content-Type": "application/json" } });
      })
    );
    return;
  }

  // Static assets: Cache First
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        // Cache new requests
        if (response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      });
    }).catch(function() {
      // Offline fallback for navigation
      if (e.request.mode === "navigate") {
        return caches.match("/index.html");
      }
    })
  );
});
