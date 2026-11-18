import {
  loadEnv,
  type Plugin,
  type ViteDevServer,
  type PreviewServer,
} from "vite";
import { handlerFor, nodeHandler } from "./node-handler";
import { openDatabase } from "./db";
export function localApi(): Plugin {
  const configure = (server: ViteDevServer | PreviewServer) => {
    const vars = loadEnv("development", process.cwd(), "");
    for (const key of ["APP_ORIGIN", "SETUP_TOKEN", "ORBITA_DB_PATH"])
      if (vars[key] && !process.env[key]) process.env[key] = vars[key];
    let runtime: ReturnType<typeof handlerFor> | undefined;
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/api/")) return next();
      try {
        runtime ??= openDatabase().then((db) => handlerFor(db, true));
        await nodeHandler(req, res, await runtime);
      } catch (error) {
        runtime = undefined;
        next(error);
      }
    });
  };
  return {
    name: "orbita-local-api",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
