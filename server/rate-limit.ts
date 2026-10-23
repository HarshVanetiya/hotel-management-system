import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";

/**
 * Fixed-window rate limiter backed by PostgreSQL so limits hold across
 * serverless instances. A single atomic upsert increments or resets the window.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   THEN now() ELSE rate_limits.window_start END
    RETURNING count
  `);
  const count = Number(result.rows[0]?.count ?? 0);
  // Opportunistic cleanup of stale windows (~1% of calls).
  if (Math.random() < 0.01) {
    await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
  }
  if (count > limit) throw new RateLimitError();
}

export async function resetRateLimit(key: string): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limits WHERE key = ${key}`);
}
