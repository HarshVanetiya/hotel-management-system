import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { assertTestDatabase } from "./guard";

export default async function setup() {
  config({ path: [".env.local", ".env"], quiet: true });
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL);
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "db/migrations" });
  } finally {
    await pool.end();
  }
}
