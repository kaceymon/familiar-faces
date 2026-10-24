// Familiar Faces service worker: everything the game needs is cached on install, so it also plays offline / as an app.
const VERSION = "ff-v5";
const FILES = [
  "./", "./index.html", "./game.js", "./manifest.webmanifest",
  "./assets/screen.jpg", "./assets/faces.webp", "./assets/combos.webp", "./assets/settings.webp", "./assets/ribbon.webp",
  "./assets/Inter-ExtraBold.ttf", "./assets/Inter-SemiBold.ttf",
  "./assets/fd_drop.wav", "./assets/fd_merge.wav", "./assets/fd_big.wav", "./assets/fd_over.wav", "./assets/fd_start.wav", "./assets/fd_click.wav",
  "./assets/icon-192.png", "./assets/icon-512.png", "./assets/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // network first (a new version shows up at once), the cache when offline. "no-cache" asks GitHub every time
  // (a cheap 304 when nothing changed) instead of trusting the browser's 10-minute copy.
  const sameOrigin = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    fetch(sameOrigin ? new Request(e.request, { cache: "no-cache" }) : e.request).then((res) => {
      if (res && res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
