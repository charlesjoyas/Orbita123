import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "./db";
import { createApi, prepareDatabase } from "./api.ts";
import { MAX_REQUEST_BYTES } from "../src/data/validation.ts";
export async function handlerFor(db: Database, localSetup = false) {
  await prepareDatabase(db);
  return createApi(db, { localSetup });
}
export async function nodeHandler(
  req: IncomingMessage,
  res: ServerResponse,
  api: ReturnType<typeof createApi>,
) {
  try {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const origin = process.env.APP_ORIGIN || `http://${req.headers.host || "localhost"}`;
    let body: string | undefined;
    if (!["GET", "HEAD"].includes(req.method || "GET")) {
      const tooLarge = () => {
        res.writeHead(413, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Connection: "close",
        }).end(JSON.stringify({ error: "La solicitud es demasiado grande. Usa enlaces para archivos grandes." }));
        req.resume();
      };
      if (Number(req.headers["content-length"]) > MAX_REQUEST_BYTES) {
        tooLarge();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += Buffer.byteLength(chunk);
        if (size > MAX_REQUEST_BYTES) {
          tooLarge();
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    const request = new Request(
      origin + (req.url || "/"),
      { method: req.method, headers, body },
    );
    const response = await api(request);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(
      "Órbita:",
      error instanceof Error ? error.message : "Error de servidor",
    );
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        error:
          "El servidor no está configurado. Revisa la conexión con la base de datos.",
      }),
    );
  }
}
