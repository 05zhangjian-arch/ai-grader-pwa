self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open("ai-grader-v1").then(c => c.addAll(["/", "/app.js", "/style.css", "/manifest.json"])));
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});