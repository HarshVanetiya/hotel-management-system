import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Applies SQL migrations in db/migrations. Prefer Neon's *direct* (unpooled)
 * connection string for DDL: set DATABASE_URL_UNPOOLED, otherwise
 * DATABASE_URL is used.
 */
export async function runMigrations(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "db/migrations" });
  } finally {
    await pool.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  await runMigrations(url);
  console.log("Migrations applied.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
