const CACHE = "orbita-v3";
const ASSET =
  /^(\/assets\/|\/icon(?:-\d+)?\.(?:svg|png)$|\/manifest\.webmanifest$)/;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("/", { cache: "reload" });
      if (!response.ok) throw new Error("No se pudo descargar la aplicación");
      const html = await response.clone().text();
      // No sustituir la aplicación offline por una pantalla de inicio de sesión.
      if (!/id=["']root["']/.test(html)) throw new Error("Sesión requerida");
      const cache = await caches.open(CACHE);
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^"#]+)"/g),
      ].map((m) => m[1]);
      await cache.addAll([
        "/icon.svg",
        "/icon-192.png",
        "/icon-512.png",
        "/manifest.webmanifest",
        ...assets,
      ]);
      await cache.put("/", response);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("orbita-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  )
    return;
  const navigation = event.request.mode === "navigate";
  if (!navigation && !ASSET.test(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          if (navigation) {
            const html = await response.clone().text();
            if (/id=["']root["']/.test(html))
              await cache.put("/", response.clone());
          } else await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return (
          (await cache.match(navigation ? "/" : event.request)) ||
          Response.error()
        );
      }
    })(),
  );
});
