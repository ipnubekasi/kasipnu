/* Service worker Kas IPNU.
 * Sengaja hanya menyimpan aset statis (JS, CSS, font, ikon). Halaman dan data
 * keuangan TIDAK pernah disimpan: angka harus selalu terbaru dan bersifat privat.
 * Bila perangkat offline, pengguna melihat halaman offline yang ramah. */
const VERSION = "kas-ipnu-v1";
const STATIC_CACHE = `${VERSION}-static`;
const SHELL = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/logo-ipnu.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase dan layanan lain tidak disentuh.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
