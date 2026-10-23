import "server-only";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import ws from "ws";
import * as schema from "@/db/schema";

export type Database = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction — services accept either. */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

function shouldUseNeonDriver(url: string): boolean {
  const forced = process.env.DATABASE_DRIVER;
  if (forced === "neon") return true;
  if (forced === "pg") return false;
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

function createDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  if (shouldUseNeonDriver(connectionString)) {
    // The WebSocket-based Pool supports interactive transactions, which the
    // reservation and payment workflows require (the HTTP driver does not).
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString });
    globalForDb.__hmsPool = pool;
    // Both drivers expose the same PgDatabase query API; the cast unifies the
    // driver-specific result HKT so services can be written once.
    return drizzleNeon({ client: pool, schema }) as unknown as Database;
  }
  const pool = new pg.Pool({ connectionString, max: 10 });
  globalForDb.__hmsPool = pool;
  return drizzlePg({ client: pool, schema });
}

const globalForDb = globalThis as unknown as { __hmsDb?: Database; __hmsPool?: { end: () => Promise<void> } };

/** Lazily-created singleton (reused across hot reloads in development). */
export function getDb(): Database {
  if (!globalForDb.__hmsDb) globalForDb.__hmsDb = createDb();
  return globalForDb.__hmsDb;
}

/** Closes the connection pool (CLI scripts only). */
export async function closeDb(): Promise<void> {
  await globalForDb.__hmsPool?.end();
  globalForDb.__hmsDb = undefined;
  globalForDb.__hmsPool = undefined;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
