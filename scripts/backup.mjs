import { closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

const source = resolve(process.env.ORBITA_DB_PATH || ".data/orbita.sqlite");
const destination = process.argv[2] && resolve(process.argv[2]);
if (!destination) {
  throw Error("Indica un archivo de destino nuevo: pnpm db:backup /ruta/copia.sqlite");
}
const db = new DatabaseSync(source, { readOnly: true, timeout: 5000 });
try {
  mkdirSync(dirname(destination), { recursive: true });
  closeSync(openSync(destination, "wx", 0o600));
  try {
    await backup(db, destination);
    const copy = new DatabaseSync(destination, { readOnly: true });
    try {
      if (copy.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
        throw Error("SQLite encontró un error en la copia.");
      }
    } finally {
      copy.close();
    }
  } catch (error) {
    unlinkSync(destination);
    throw error;
  }
  console.log(`Copia de SQLite verificada: ${destination}`);
} finally {
  db.close();
}
