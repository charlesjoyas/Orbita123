import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { openDatabase } from "./db.ts";
import { handlerFor, nodeHandler } from "./node-handler.ts";

const { APP_ORIGIN, ORBITA_DB_PATH, SETUP_TOKEN, HOST = "127.0.0.1", PORT = "8080" } = process.env;
const origin = new URL(APP_ORIGIN ?? "invalid:");
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
if (APP_ORIGIN !== origin.origin || (origin.protocol !== "https:" && !(loopback && origin.protocol === "http:"))) {
  throw Error("Configura APP_ORIGIN con el origen HTTPS exacto (HTTP solo en localhost).");
}
if (!ORBITA_DB_PATH || !isAbsolute(ORBITA_DB_PATH)) {
  throw Error("Configura ORBITA_DB_PATH con la ruta absoluta del archivo en el volumen persistente.");
}
const port = Number(PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("PORT no es válido.");
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
if (!(await stat(join(dist, "index.html")).catch(() => null))?.isFile()) {
  throw Error("Falta el compilado de Órbita. Ejecuta pnpm build.");
}
process.umask(0o077);
const db = await openDatabase(ORBITA_DB_PATH);
const api = await handlerFor(db);
if (!(await db.all("SELECT id FROM orbita_users LIMIT 1")).length && (!SETUP_TOKEN || SETUP_TOKEN.length < 32)) {
  await db.close();
  throw Error("Configura SETUP_TOKEN con al menos 32 caracteres aleatorios antes del primer arranque.");
}
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if (origin.protocol === "https:") res.setHeader("Strict-Transport-Security", "max-age=31536000");
  try {
    if (!req.url?.startsWith("/") || req.url.startsWith("//")) {
      res.writeHead(400).end();
      return;
    }
    const pathname = new URL(req.url, origin).pathname;
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      await nodeHandler(req, res, api);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    if (pathname === "/healthz") {
      await db.all("SELECT revision FROM orbita_state WHERE slot='main'");
      res.writeHead(200, { "Content-Type": "text/plain" }).end(req.method === "HEAD" ? undefined : "ok");
      return;
    }
    const asset = /^\/assets\/[\w.-]+\.(js|css)$/.test(pathname);
    const publicFile = /^\/(sw\.js|manifest\.webmanifest|icon\.svg|icon-(192|512)\.png)$/.test(pathname);
    if (pathname !== "/" && !asset && !publicFile) {
      res.writeHead(404).end();
      return;
    }
    const file = join(dist, pathname === "/" ? "index.html" : pathname.slice(1));
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Type", contentTypes[extname(file)]);
    res.setHeader("Content-Length", info.size);
    if (asset) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (req.method === "HEAD") res.end();
    else await pipeline(createReadStream(file), res);
  } catch (error) {
    console.error("Órbita HTTP:", error);
    if (!res.headersSent && !res.destroyed) res.writeHead(503).end();
  }
});
server.listen(port, HOST, () => console.log(`Órbita escucha en ${HOST}:${port}`));
function stop() {
  server.close(async (error) => {
    try {
      await db.close();
      if (error) throw error;
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
