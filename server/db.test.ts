import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { openDatabase } from "./db";

describe("SQLite como única base de datos", () => {
  it("conserva los datos al cerrar y volver a abrir el archivo", async () => {
    const directory = mkdtempSync(join(tmpdir(), "orbita-sqlite-"));
    const file = join(directory, "persistencia.sqlite");
    try {
      const db = await openDatabase(file);
      await db.run(
        "INSERT INTO orbita_limits(key,attempts,expires_at) VALUES($1,$2,$3)",
        ["persistencia", 3, 999999],
      );
      await db.close();
      const reopened = await openDatabase(file);
      try {
        const rows = await reopened.all(
          "SELECT attempts FROM orbita_limits WHERE key=$1",
          ["persistencia"],
        );
        expect(rows[0].attempts).toBe(3);
      } finally {
        await reopened.close();
      }
    } finally {
      for (const path of [file, file + "-wal", file + "-shm"])
        if (existsSync(path)) unlinkSync(path);
      rmdirSync(directory);
    }
  });
  it("revierte completamente una transacción que falla", async () => {
    const db = await openDatabase(":memory:");
    try {
      await expect(
        db.transaction(async (q) => {
          await q.run(
            "INSERT INTO orbita_limits(key,attempts,expires_at) VALUES($1,$2,$3)",
            ["rollback", 1, 999999],
          );
          throw Error("cancelar");
        }),
      ).rejects.toThrow("cancelar");
      expect(
        await db.all("SELECT * FROM orbita_limits WHERE key=$1", ["rollback"]),
      ).toEqual([]);
    } finally {
      await db.close();
    }
  });
  it("aísla escrituras de otras peticiones durante un rollback", async () => {
    const db = await openDatabase(":memory:");
    let pause!: () => void;
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => { pause = resolve; });
    const waiting = new Promise<void>((resolve) => { resume = resolve; });
    try {
      const initial = db.transaction(async (q) => {
        await q.run("INSERT INTO orbita_limits VALUES('rollback',1,0)");
        pause();
        await waiting;
        throw Error("cancelar");
      });
      await paused;
      const failed = expect(initial).rejects.toThrow("cancelar");
      const independent = db.run("INSERT INTO orbita_limits VALUES('independiente',1,0)");
      resume();
      await failed;
      await independent;
      expect(await db.all("SELECT key FROM orbita_limits")).toEqual([{ key: "independiente" }]);
    } finally {
      await db.close();
    }
  });
});
