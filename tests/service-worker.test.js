import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it, expect, vi } from "vitest";
const source = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
function worker(fetchImpl) {
  const events = {};
  const items = new Map();
  const cache = {
    put: vi.fn(async (key, value) =>
      items.set(typeof key === "string" ? key : key.url, value),
    ),
    match: vi.fn(async (key) =>
      items.get(typeof key === "string" ? key : key.url),
    ),
    addAll: vi.fn(async () => {}),
  };
  const deleted = [];
  const self = {
    location: { origin: "https://orbita.test" },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => []), openWindow: vi.fn() },
    registration: { showNotification: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
    addEventListener: (name, fn) => (events[name] = fn),
  };
  vm.runInNewContext(source, {
    self,
    caches: {
      open: async () => cache,
      keys: async () => ["another-app", "orbita-v1", "orbita-v2", "orbita-v3", "orbita-v4", "orbita-v5"],
      delete: async (key) => deleted.push(key),
    },
    fetch: fetchImpl,
    URL,
    Response,
  });
  return { events, items, cache, deleted, self };
}
describe("Caché offline", () => {
  it("no reemplaza la aplicación offline por la página de inicio de sesión", async () => {
    const w = worker(async () => new Response("<h1>Inicia sesión</h1>"));
    let install;
    w.events.install({ waitUntil: (p) => (install = p) });
    await expect(install).rejects.toThrow("Sesión requerida");
    expect(w.cache.put).not.toHaveBeenCalled();
  });
  it("devuelve la aplicación guardada cuando falla la red", async () => {
    const w = worker(async () => {
      throw Error("offline");
    });
    w.items.set("/", new Response('<div id="root">Tu tablero</div>'));
    let response;
    w.events.fetch({
      request: { method: "GET", url: "https://orbita.test/", mode: "navigate" },
      respondWith: (p) => (response = p),
    });
    expect(await (await response).text()).toContain("Tu tablero");
  });
  it("un recurso ausente produce una respuesta válida de error, no undefined", async () => {
    const w = worker(async () => {
      throw Error("offline");
    });
    let response;
    w.events.fetch({
      request: {
        method: "GET",
        url: "https://orbita.test/assets/missing.js",
        mode: "cors",
      },
      respondWith: (p) => (response = p),
    });
    expect((await response).type).toBe("error");
  });
  it("conserva los cachés que pertenecen a otras aplicaciones", async () => {
    const w = worker(vi.fn());
    let activation;
    w.events.activate({ waitUntil: (p) => (activation = p) });
    await activation;
    expect(w.deleted).toEqual(["orbita-v1", "orbita-v2", "orbita-v3", "orbita-v4"]);
  });
  it("nunca intercepta la API, incluso al navegar directamente a una ruta protegida", () => {
    const w = worker(vi.fn());
    const respondWith = vi.fn();
    w.events.fetch({
      request: { method: "GET", url: "https://orbita.test/api/state", mode: "navigate" },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });
  it("mantiene la página de demostración fuera de la caché del tablero real", () => {
    const w = worker(vi.fn());
    const respondWith = vi.fn();
    w.events.fetch({
      request: { method: "GET", url: "https://orbita.test/design.html?tema=oscuro", mode: "navigate" },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });
});

it("muestra el aviso y abre la tarea en el mismo origen", async () => {
  const w = worker(vi.fn());
  let work;
  w.events.push({
    data: { json: () => ({ taskId: "task/42", tag: "assignment-1" }) },
    waitUntil: (promise) => (work = promise),
  });
  await work;
  const [title, notification] = w.self.registration.showNotification.mock.calls[0];
  expect(title).toBe("Órbita");
  expect(notification.data.taskId).toBe("task/42");
  const close = vi.fn();
  w.events.notificationclick({
    notification: { ...notification, close },
    waitUntil: (promise) => (work = promise),
  });
  await work;
  expect(close).toHaveBeenCalled();
  expect(w.self.clients.openWindow).toHaveBeenCalledWith("https://orbita.test/?task=task%2F42");
});
