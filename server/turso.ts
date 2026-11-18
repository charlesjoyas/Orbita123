import { createClient } from "@libsql/client/web";
import { schema, statement, type Database, type Query, type Row } from "./db.ts";
import { prepareDatabase } from "./api.ts";

function asQuery(connection: Pick<ReturnType<typeof createClient>, "execute">): Query {
  return {
    async all<T extends Row>(sql: string, params?: unknown[]) {
      const result = await connection.execute(statement(sql, params));
      return result.rows as unknown as T[];
    },
    async run(sql, params) {
      await connection.execute(statement(sql, params));
    },
  };
}

export async function openTurso(
  url = process.env.TURSO_DATABASE_URL,
  authToken = process.env.TURSO_AUTH_TOKEN,
): Promise<Database> {
  if (!url || !authToken) throw Error("Configura TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.");
  const endpoint = new URL(url.replace(/^libsql:/, "https:"));
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw Error("La conexión de Turso debe usar HTTPS.");

  const client = createClient({ url: endpoint.href, authToken });
  const db: Database = {
    ...asQuery(client),
    async transaction(fn, mode = "write") {
      const transaction = await client.transaction(mode);
      try {
        const result = await fn(asQuery(transaction));
        await transaction.commit();
        return result;
      } catch (error) {
        if (!transaction.closed) await transaction.rollback().catch(() => {});
        throw error;
      } finally {
        if (!transaction.closed) transaction.close();
      }
    },
    async close() {
      client.close();
    },
  };
  try {
    await client.batch(schema, "write");
    await prepareDatabase(db);
    return db;
  } catch (error) {
    client.close();
    throw error;
  }
}
