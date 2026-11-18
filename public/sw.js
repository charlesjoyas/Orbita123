const CACHE = "orbita-v4";
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
self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    payload = null;
  }
  event.waitUntil(self.registration.showNotification("Órbita", {
    body: payload?.test
      ? "Los avisos funcionan en este dispositivo."
      : "Te asignaron una tarea. Abre Órbita para verla.",
    icon: "/icon-192.png",
    tag: typeof payload?.tag === "string" ? payload.tag : undefined,
    data: { taskId: typeof payload?.taskId === "string" ? payload.taskId : undefined },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL("/", self.location.origin);
  const taskId = event.notification.data?.taskId;
  if (typeof taskId === "string") url.searchParams.set("task", taskId);
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = clients.find((client) => client.url === url.href);
    if (open) await open.focus();
    else await self.clients.openWindow(url.href);
  })());
});
