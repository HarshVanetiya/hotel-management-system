import { z } from "zod";
import { db } from "@/lib/db";
import { calculateStayPricing } from "@/lib/pricing";
import { isoDateSchema, moneySchema } from "@/lib/validations/common";
import { apiRoute } from "@/server/api";
import { getHotelOrThrow, parseInput } from "@/server/services/common";

const quoteSchema = z.object({
  checkInDate: isoDateSchema,
  checkOutDate: isoDateSchema,
  nightlyRate: moneySchema,
  discountAmount: moneySchema.default("0"),
});

/** Server-side price preview. The same function computes the stored totals on save. */
export const POST = apiRoute(
  async ({ actor, body }) => {
    const input = parseInput(quoteSchema, await body());
    const hotel = await getHotelOrThrow(db, actor.hotelId);
    const { cents: _cents, ...pricing } = calculateStayPricing({ ...input, taxRate: hotel.taxRate });
    return { pricing };
  },
  { permission: "reservations:view" },
);
