import { createApi } from "../server/api.ts";
import { waitUntil } from "@vercel/functions";
import { openTurso } from "../server/turso.ts";
import { VERCEL_REQUEST_BYTES } from "../src/data/validation.ts";

let runtime: Promise<ReturnType<typeof createApi>> | undefined;
async function initialize() {
  const origin = process.env.APP_ORIGIN;
  const url = new URL(origin ?? "invalid:");
  if (url.protocol !== "https:" || url.origin !== origin)
    throw Error("Configura APP_ORIGIN con el origen HTTPS exacto de Órbita.");
  const db = await openTurso();
  return createApi(db, { origin, maxRequestBytes: VERCEL_REQUEST_BYTES, background: waitUntil });
}

async function handle(request: Request): Promise<Response> {
  try {
    runtime ??= initialize().catch((error) => {
      runtime = undefined;
      throw error;
    });
    const api = await runtime;
    return await api(request);
  } catch {
    return Response.json(
      { error: "No se pudo iniciar la API. Revisa la configuración de Órbita y Turso." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT };
