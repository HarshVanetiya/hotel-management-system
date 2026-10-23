/**
 * Creates the hotel (if none exists) and the first administrator account.
 *
 *   npm run setup:admin -- --email you@hotel.com --name "Your Name" \
 *     [--hotel-name "Hotel Name"] [--timezone Asia/Kolkata] [--currency INR] [--additional]
 *
 * The password is prompted for interactively (hidden), or read from the
 * INITIAL_ADMIN_PASSWORD environment variable for non-interactive deploys.
 * No default password exists. Refuses to run if an active admin already
 * exists unless --additional is passed.
 */
import "./load-env";
import { parseArgs } from "node:util";
import readline from "node:readline";
import { and, eq, sql } from "drizzle-orm";
import { hotels, users } from "@/db/schema";
import { closeDb, getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { isValidTimeZone } from "@/lib/utils/dates";
import { createStaffSchema } from "@/lib/validations/staff";
import { writeAudit } from "@/server/audit";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => {
      if (s.startsWith(question)) out.output.write(s);
      else out.output.write("*".repeat(s.length));
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      "hotel-name": { type: "string" },
      timezone: { type: "string", default: "Asia/Kolkata" },
      currency: { type: "string", default: "INR" },
      additional: { type: "boolean", default: false },
    },
  });
  if (!values.email || !values.name) {
    throw new Error('Usage: npm run setup:admin -- --email admin@yourhotel.com --name "Full Name" [--hotel-name "..."]');
  }
  if (!isValidTimeZone(values.timezone!)) throw new Error(`Unknown timezone: ${values.timezone}`);

  let password = process.env.INITIAL_ADMIN_PASSWORD ?? "";
  if (!password) {
    if (!process.stdin.isTTY) throw new Error("No TTY: set INITIAL_ADMIN_PASSWORD to provide the password non-interactively.");
    password = await promptHidden("Admin password (min 12 chars, letters + numbers): ");
    const confirm = await promptHidden("Repeat password: ");
    if (password !== confirm) throw new Error("Passwords do not match.");
  }
  const input = createStaffSchema.parse({ name: values.name, email: values.email, role: "admin", password });

  const db = getDb();
  try {
    let hotel = await db.query.hotels.findFirst();
    if (!hotel) {
      [hotel] = await db
        .insert(hotels)
        .values({
          name: values["hotel-name"] ?? "My Hotel",
          timezone: values.timezone!,
          currency: values.currency!.toUpperCase(),
        })
        .returning();
      console.log(`Created hotel "${hotel.name}" (${hotel.timezone}, ${hotel.currency}). Edit details in Settings.`);
    }
    const existingAdmin = await db.query.users.findFirst({
      where: and(eq(users.hotelId, hotel.id), eq(users.role, "admin"), eq(users.active, true)),
    });
    if (existingAdmin && !values.additional) {
      throw new Error("An active administrator already exists. Pass --additional to create another one.");
    }
    const taken = await db.query.users.findFirst({ where: eq(sql`lower(${users.email})`, input.email) });
    if (taken) throw new Error("A user with this email already exists.");

    const [admin] = await db
      .insert(users)
      .values({ hotelId: hotel.id, name: input.name, email: input.email, role: "admin", passwordHash: await hashPassword(input.password) })
      .returning();
    await writeAudit(db, null, {
      hotelId: hotel.id,
      action: "staff.created",
      entityType: "user",
      entityId: admin.id,
      metadata: { email: admin.email, role: "admin", source: "setup-admin script" },
    });
    console.log(`Administrator ${admin.email} created. Sign in at /login.`);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
