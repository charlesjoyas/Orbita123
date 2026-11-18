import { openDatabase } from "../server/db.ts";
process.umask(0o077);
const db = process.argv.includes("--turso")
  ? await (await import("../server/turso.ts")).openTurso()
  : await openDatabase();
await db.close();
process.stdout.write("Base de datos de Órbita preparada.\n");
