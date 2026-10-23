import "server-only";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { hotels } from "@/db/schema";
import type { DbExecutor } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { todayInTimezone } from "@/lib/utils/dates";

/** Validates untrusted input, converting Zod issues into a field-error map. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const first = result.error.issues[0];
    throw new ValidationError(first ? first.message : "Invalid input.", { fieldErrors });
  }
  return result.data;
}

export async function getHotelOrThrow(tx: DbExecutor, hotelId: string) {
  const hotel = await tx.query.hotels.findFirst({ where: eq(hotels.id, hotelId) });
  if (!hotel) throw new NotFoundError("Hotel");
  return hotel;
}

export function hotelToday(hotel: { timezone: string }): string {
  return todayInTimezone(hotel.timezone);
}

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function paginated<T>(rows: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Escapes LIKE wildcards in user search input. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}
