import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Row = Record<string, unknown>;
export interface Query {
  all<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
}
export interface Database extends Query {
  transaction<T>(fn: (q: Query) => Promise<T>, mode?: "read" | "write"): Promise<T>;
  close(): Promise<void>;
}

export const schema = [
  `CREATE TABLE IF NOT EXISTS orbita_users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,name TEXT NOT NULL,emoji TEXT NOT NULL,color TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'disponible',role TEXT NOT NULL CHECK(role IN ('admin','member','viewer')),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orbita_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES orbita_users(id) ON DELETE CASCADE,expires_at BIGINT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS orbita_sessions_user ON orbita_sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS orbita_state (slot TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orbita_invites (token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member','viewer')),created_by TEXT NOT NULL REFERENCES orbita_users(id),expires_at BIGINT NOT NULL,used_at BIGINT)`,
  `CREATE TABLE IF NOT EXISTS orbita_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orbita_removed (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orbita_activity_read (user_id TEXT NOT NULL REFERENCES orbita_users(id) ON DELETE CASCADE, activity_id TEXT NOT NULL, PRIMARY KEY(user_id,activity_id))`,
];

export function statement(sql: string, params: unknown[] = []) {
  const args: (string | number | null)[] = [];
  return {
    sql: sql.replace(/\$(\d+)/g, (_, index) => {
      args.push(params[Number(index) - 1] as string | number | null);
      return "?";
    }),
    args,
  };
}

export async function openDatabase(
  filename = process.env.ORBITA_DB_PATH || ".data/orbita.sqlite",
  initialize = true,
): Promise<Database> {
  if (process.env.VERCEL)
    throw Error(
      "SQLite requiere un backend con disco persistente. No se guardarán datos en el sistema de archivos efímero de Vercel.",
    );
  let db: Database;
  const { DatabaseSync } = await import("node:sqlite");
  const path = filename === ":memory:" ? filename : resolve(filename);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path, { timeout: 5000 });
  try {
    sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
    if (initialize) for (const statement of schema) sqlite.exec(statement);
  } catch (error) {
    sqlite.close();
    throw error;
  }
  const query: Query = {
    async all<T extends Row>(sql: string, params: unknown[] = []) {
      const query = statement(sql, params);
      return sqlite.prepare(query.sql).all(...query.args) as T[];
    },
    async run(sql, params = []) {
      const query = statement(sql, params);
      sqlite.prepare(query.sql).run(...query.args);
    },
  };
  let tail = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>) => {
    const result = tail.then(fn);
    tail = result.then(() => {}, () => {});
    return result;
  };
  db = {
    all: (sql, params) => enqueue(() => query.all(sql, params)),
    run: (sql, params) => enqueue(() => query.run(sql, params)),
    transaction(fn, mode = "write") {
      return enqueue(async () => {
        sqlite.exec(mode === "read" ? "BEGIN" : "BEGIN IMMEDIATE");
        try {
          const value = await fn(query);
          sqlite.exec("COMMIT");
          return value;
        } catch (e) {
          if (sqlite.isTransaction) sqlite.exec("ROLLBACK");
          throw e;
        }
      });
    },
    async close() {
      await enqueue(async () => sqlite.close());
    },
  };
  return db;
}
