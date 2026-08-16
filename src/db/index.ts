import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
  db: PostgresJsDatabase<typeof schema> | undefined;
};

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalForDb.db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    const client = postgres(connectionString, {
      max: 1,
      ssl: connectionString.includes("localhost") ? false : "require",
    });
    globalForDb.conn = client;
    globalForDb.db = drizzle(client, { schema });
  }
  return globalForDb.db;
}

/**
 * Lazily-initialized Drizzle client. The connection is only created on first
 * use, so the app can build and pass CI without a live database.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
