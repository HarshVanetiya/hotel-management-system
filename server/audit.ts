import "server-only";
import { auditLogs } from "@/db/schema";
import type { DbExecutor } from "@/lib/db";
import type { Actor } from "./actor";

const FORBIDDEN_KEYS = /pass(word)?|secret|token|cvv|card_?number|pan/i;

/** Removes any credential-like keys defensively before persisting. */
function sanitize(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? sanitize(v as Record<string, unknown>) : v;
  }
  return out;
}

export async function writeAudit(
  tx: DbExecutor,
  actor: Pick<Actor, "id" | "hotelId"> | null,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    hotelId?: string;
  },
): Promise<void> {
  await tx.insert(auditLogs).values({
    hotelId: entry.hotelId ?? actor?.hotelId ?? null,
    userId: actor?.id ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: sanitize(entry.metadata ?? {}),
  });
}
