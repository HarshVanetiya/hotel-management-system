# Hotel Management System

An internal hotel operations application for reception, housekeeping and management staff: rooms and room types, reservations with database-enforced availability, guests, check-in and check-out, payments with an append-only ledger, additional charges, housekeeping, reports, staff accounts and an audit log.

**Stack:** Next.js 16 (App Router, Route Handlers, Server Components) · TypeScript (strict) · React 19 · Tailwind CSS 4 · shadcn/ui (Radix) · Lucide · Neon PostgreSQL · Drizzle ORM and Drizzle Kit · Zod 4 · React Hook Form · Auth.js v5 (credentials) · Recharts · date-fns · Sonner · Vitest.

---

## Contents

1. [Quick start (local)](#quick-start-local)
2. [Neon database setup](#neon-database-setup)
3. [Environment variables](#environment-variables)
4. [Database migrations](#database-migrations)
5. [Initial administrator](#initial-administrator)
6. [Demo data (development only)](#demo-data-development-only)
7. [Commands](#commands)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Architecture](#architecture)
11. [Database schema](#database-schema)
12. [Business rules](#business-rules)
13. [Roles and permissions](#roles-and-permissions)
14. [Metrics and report definitions](#metrics-and-report-definitions)
15. [Security](#security)
16. [Known limitations](#known-limitations)

---

## Quick start (local)

Requirements: **Node.js 20.9+** (22 recommended), npm, and a PostgreSQL 15+ database. Use Neon, or a local PostgreSQL for development and tests.

```bash
git clone <this repo> && cd hotel-management-system
npm install
cp .env.example .env.local          # then fill in DATABASE_URL and AUTH_SECRET
npx auth secret                      # or: openssl rand -base64 33  → AUTH_SECRET
npm run db:migrate                   # create tables, constraints, triggers
npm run setup:admin -- --email you@yourhotel.com --name "Your Name" --hotel-name "Your Hotel"
npm run dev                          # http://localhost:3000
```

Optional demo data (development only):

```bash
ALLOW_DEMO_SEED=true npm run db:seed
```

## Neon database setup

1. Create a project at [console.neon.tech](https://console.neon.tech). Pick the region closest to where you deploy.
2. Create a database (for example `hotel`).
3. In **Connection details**, copy two connection strings:
   - The **pooled** string (host contains `-pooler`), which goes in `DATABASE_URL`. The app uses it at runtime.
   - The **direct** string, which goes in `DATABASE_URL_UNPOOLED`. Migrations use it.
4. Keep `?sslmode=require` on both.
5. The availability migration runs `CREATE EXTENSION IF NOT EXISTS btree_gist`. `btree_gist` is supported on Neon and needs no manual step. If your role cannot create extensions, ask the database owner to run that statement once.
6. For isolated testing you can create a Neon **branch**, for example `hms_test`. Its database name must contain `test`.

**Driver selection:** for hosts ending in `.neon.tech`, the app uses `@neondatabase/serverless` with its WebSocket `Pool`. That driver supports the interactive transactions the booking and payment workflows rely on (Neon's HTTP driver does not). Any other host uses `node-postgres`. You can override this with `DATABASE_DRIVER=neon|pg`.

## Environment variables

See [`.env.example`](.env.example). **Never commit real values.** `.env*` files are git-ignored except the example.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Runtime connection string (Neon pooled) |
| `DATABASE_URL_UNPOOLED` | recommended | Direct connection used by `db:migrate` |
| `DATABASE_DRIVER` | no | Force `neon` or `pg` |
| `AUTH_SECRET` | yes | Encrypts session JWTs (32+ random bytes) |
| `AUTH_TRUST_HOST` | behind proxies | `true` when deployed behind a trusted proxy (Vercel sets this automatically) |
| `TEST_DATABASE_URL` | for tests | Isolated database; its name **must contain `test`** |
| `ALLOW_DEMO_SEED` | dev only | Must be `true` for `db:seed` to run |
| `INITIAL_ADMIN_PASSWORD` | optional | Non-interactive password for `setup:admin` (CI/deploy); unset it afterwards |

Secrets are only read on the server: `lib/db.ts` and `lib/auth.ts` are `server-only` modules, and no variable uses the `NEXT_PUBLIC_` prefix.

## Database migrations

The schema lives in `db/schema/`. SQL migrations live in `db/migrations/` and are committed.

```bash
npm run db:generate   # after editing db/schema/*: generate a new SQL migration (drizzle-kit)
npm run db:migrate    # apply pending migrations (uses DATABASE_URL_UNPOOLED ?? DATABASE_URL)
npm run db:studio     # optional: browse data with Drizzle Studio
```

`0001_availability_constraints.sql` is a **custom migration**, because Drizzle's schema DSL cannot express these objects. It adds:

- the `btree_gist` extension and the `reservations_no_overlap` exclusion constraint
- triggers that forbid deleting payments, charges, reservations and audit logs
- triggers that keep payment and charge amounts immutable (only voiding is allowed)
- a trigger that makes audit log rows immutable

To add another hand-written migration, run `npx drizzle-kit generate --custom --name <name>`.

## Initial administrator

There is **no default account or password**. Create the first administrator with:

```bash
npm run setup:admin -- --email admin@yourhotel.com --name "Full Name" \
  --hotel-name "Your Hotel" --timezone Asia/Kolkata --currency INR
```

- The password is prompted for and hidden. Non-interactively, set `INITIAL_ADMIN_PASSWORD` for that one command.
- Passwords must be 12–72 bytes and contain letters and numbers.
- If no hotel exists, the script creates one with the given name, timezone and currency. You can edit everything else later under **Settings**.
- The script refuses to run if an active admin already exists, unless you pass `--additional`.
- After that, administrators create all other staff accounts in the app (**Staff**).

## Demo data (development only)

```bash
ALLOW_DEMO_SEED=true npm run db:seed            # into an empty hotel
ALLOW_DEMO_SEED=true npm run db:seed -- --reset # replace operational data, keep hotel + staff
```

The seed creates:

- 4 room types and 20 rooms, with one room under maintenance and one out of service
- 36 obviously synthetic guests (`@example.test` addresses, "Sample/Demo/Placeholder" surnames)
- about 240 reservations spread from 30 days ago to 3 weeks ahead, in every status
- payments, refunds-ready deposits, additional charges and housekeeping tasks

That is enough for the dashboard, calendar, reports and front desk to show meaningful data.

The seed refuses to run when `NODE_ENV=production` or when `ALLOW_DEMO_SEED` is not `true`. Demo staff accounts (`*.demo@example.test`) get **random passwords**, printed once to your terminal. The seed creates a demo admin only if no admin exists.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle Kit |
| `npm run setup:admin` | Create the hotel and first administrator |
| `npm run db:seed` | Development demo data |

## Testing

```bash
# A local PostgreSQL works well, e.g.:
createdb hms_test
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hms_test   # or put it in .env.local
npm test
```

- The test suite **refuses to run** unless the database name contains `test` and `NODE_ENV` is not `production`. It migrates the test database, then truncates all tables before each test. Never point it at real data.
- Tests call the service layer directly against real PostgreSQL. This means the exclusion constraint, row locks, triggers and transactions are exercised as they are in production.

The suite has 84 tests. Coverage includes:

- date validation and adjacent (non-overlapping) stays
- overlapping reservations, and cancelled or no-show reservations releasing inventory
- room capacity and maintenance blocking
- **concurrent booking attempts** (six simultaneous requests: exactly one succeeds) and concurrent room moves
- server-side price and tax calculation, including ignoring client totals
- partial payments, balances, overpayment and refunds
- **duplicate payment submissions** (sequential and concurrent with the same idempotency key)
- voids and database immutability of payments
- check-in and check-out rules, including unpaid-balance acknowledgement and dirty or occupied rooms
- housekeeping restrictions (occupied and maintenance rooms never become available; only supervisors can inspect)
- unauthorized role access and cross-hotel isolation
- protection of the last administrator
- dashboard and report figures computed from real data

The CI workflow in `.github/workflows/ci.yml` runs lint, type-check, tests (with a PostgreSQL service container) and the production build.

## Deployment

**Vercel and Neon** is the recommended setup:

1. Push the repository to GitHub and import it in Vercel. The framework preset is Next.js.
2. Add the environment variables (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`) for Production and Preview. Neon's Vercel integration can provision them per branch.
3. Run migrations against the production database from CI or your machine before (or as part of) each deploy:
   ```bash
   DATABASE_URL_UNPOOLED="<neon direct url>" npm run db:migrate
   ```
4. Create the first admin once with `npm run setup:admin` pointed at the production `DATABASE_URL`.
5. **Do not** run `db:seed` against production.

Any Node.js 20.9+ host that runs `next start` works too (Docker, Fly.io, Render, and so on). Set `AUTH_TRUST_HOST=true` behind a reverse proxy, and serve over HTTPS so session cookies are marked `Secure`.

## Architecture

```
app/
  (app)/…            authenticated pages (Server Components) behind the role-aware shell
  (print)/…          print views (payment receipt) without app chrome
  login/             sign-in page + server action
  api/…              Route Handlers (JSON) used by client components
components/ui/       shadcn/ui components (Radix primitives)
components/app/      shared app components (page header, status badges, pagination, money…)
features/…           feature-specific client components (forms, dialogs, charts, calendar)
db/schema/           Drizzle schema (enums, tables, relations)
db/migrations/       generated + custom SQL migrations
lib/                 db, auth, permissions, pricing, reservation rules, validation (Zod), utils
server/              actor/session, API wrapper, audit, rate limiting
server/services/     business logic: one module per domain; all DB access goes through here
scripts/             migrate, setup-admin, seed
tests/               unit + integration tests (Vitest)
proxy.ts             optimistic auth redirect (Next 16 "proxy", formerly middleware)
```

Request flow:

- **Pages** are Server Components. They call `requirePageActor(permission)` and then service functions directly.
- **Mutations** go from client components through `fetch` to Route Handlers. Each handler is wrapped by `apiRoute()`, which handles authentication, a coarse permission gate, a same-origin check, an optional rate limit and error mapping, and then calls a service.
- **Services** take `(actor, input)`. Each one re-checks permissions, validates input with Zod, scopes every query to the actor's hotel, runs multi-step work in a transaction and writes the audit log in the same transaction.

Cache Components and Partial Prerendering are **disabled** on purpose. Every page shows live, per-user operational data, so all routes render at request time.

## Database schema

| Table | Notes |
|---|---|
| `hotels` | Name, contact, `currency`, IANA `timezone`, check-in/out times, `tax_rate`, enabled payment methods. Every operational table carries `hotel_id`, so multi-hotel support is possible later. |
| `users` | Staff. `role` (admin/receptionist/housekeeping), `active`, bcrypt `password_hash`, `session_version` (bumped to revoke sessions). Unique on `lower(email)`. |
| `room_types` | `capacity`, `base_price` NUMERIC(12,2), `amenities`. Unique name per hotel. |
| `rooms` | Unique `(hotel_id, room_number)`. `operational_status` (in_service / maintenance / out_of_service) is **separate** from `housekeeping_status` (dirty / cleaning / clean / inspected). Rooms are archived, never deleted. |
| `guests` | Contact details, optional ID type and reference (no document images), notes. |
| `reservations` | Hotel-local `check_in_date` / `check_out_date` (DATE), guests, status, monetary snapshot (`nightly_rate`, `subtotal`, `discount_amount`, `tax_rate`, `tax_amount`, `total_amount`, all NUMERIC), lifecycle timestamps, cancellation reason. CHECK constraints guard dates, counts and amounts. **Exclusion constraint** prevents overlaps. |
| `reservation_status_history` | Every status transition, with user and note. |
| `payments` | Append-only ledger. `kind` (payment/refund), positive `amount`, `method`, `status` (completed/voided), `refund_of_payment_id`, unique `idempotency_key`, `received_by`, `paid_at`. Triggers block deletes and edits other than voiding. |
| `additional_charges` | Description, quantity, unit price, total (CHECK: total = unit × qty). Voidable, never deletable. |
| `housekeeping_tasks` | Room, type, status, priority, assignee, due/completed times. |
| `audit_logs` | User, action, entity, JSON metadata. Immutable (triggers). |
| `rate_limits` | Fixed-window counters shared across server instances. |

Deletion policy: foreign keys use `ON DELETE RESTRICT`. The only exception is a task's assignee, which is set to null. Financial and operational history is kept by voiding, cancelling or archiving.

**Money** is stored as `NUMERIC(12,2)` and handled in code as integer minor units (`lib/utils/money.ts`). Tax is computed with half-up rounding to 2 decimals using integer basis-point arithmetic, so no floating-point value ever touches stored amounts.

**Dates:** check-in and check-out are hotel-local calendar dates stored as `DATE` and handled as `yyyy-MM-dd` strings, never converted through UTC. "Today" is always computed in the hotel's timezone (`todayInTimezone`). Timestamps (payments, check-ins, audit) are stored as `timestamptz` and displayed in the hotel timezone.

## Business rules

### Availability and double-booking

A stay occupies the nights `[check_in, check_out)`. A booking from 25 to 28 October holds the nights of the 25th, 26th and 27th, so another booking can start on the 28th. Two stays overlap when `existingCheckIn < requestedCheckOut AND existingCheckOut > requestedCheckIn`.

| Status | Holds the room? |
|---|---|
| Pending | **Yes** (tentative hold) |
| Confirmed | **Yes** |
| Checked in | **Yes** |
| Checked out | No (guest has left; the room needs cleaning but can be sold) |
| Cancelled | No |
| No show | No |

Integrity is enforced in three layers:

1. **Server-side checks:** the dates are valid, the check-in date is not in the past, the room is in service, and adults plus children do not exceed the room type's capacity. These checks run when creating a booking and again whenever dates, room or guest count change.
2. **Row lock:** inside the booking transaction the room row is locked with `SELECT … FOR UPDATE`, which serialises concurrent requests for the same room. The overlap query then runs and returns a clear error naming the conflicting reservation.
3. **Database guarantee:** the exclusion constraint `EXCLUDE USING gist (room_id WITH =, daterange(check_in_date, check_out_date, '[)') WITH &&) WHERE status IN ('pending','confirmed','checked_in')` makes overlapping blocking reservations impossible, even if application code is bypassed. Violations (`23P01`) become a 409 response with a readable message.

### Pricing

The server always computes totals; client-supplied totals are ignored:

- `subtotal = nightly_rate × nights`
- discount must not exceed the subtotal
- `tax = round_half_up((subtotal − discount) × tax_rate%)`
- `total = subtotal − discount + tax`

The nightly rate defaults to the room type's base price and staff may override it. Moving a booking to a room of another type without an explicit rate re-prices it at the new type's base rate. The tax rate is snapshotted on the reservation. The form shows a live quote from `POST /api/reservations/quote`, which uses the same function.

**Balance** = room total (waived for cancelled and no-show) + active charges − completed payments + completed refunds. A negative balance is a credit due to the guest. Fees for cancellations or no-shows are posted as additional charges.

### Reservation lifecycle

- `pending → confirmed | checked_in | cancelled | no_show`
- `confirmed → checked_in | cancelled | no_show`
- `checked_in → checked_out`
- `checked_out`, `cancelled` and `no_show` are terminal.

Every transition is recorded in `reservation_status_history` and in the audit log.

- **Check-in** is allowed from the arrival date until the day before departure, when:
  - the room is in service
  - the room is *clean* or *inspected*
  - no other guest is still checked in to that room (for example, an overdue departure)

  Early check-in requires amending the dates first.
- **Check-out:**
  - shows the final folio: room total, charges, payments, refunds and balance
  - with an unpaid balance, refuses to complete unless staff explicitly acknowledge it; the acknowledgement is audited
  - marks the room *dirty* and creates a check-out cleaning task, at high priority if someone arrives in that room today
- **No-show** can be recorded on or after the arrival date and releases the room.
- **Cancellation** requires a reason and is only possible before check-in. Payments are kept, so any amount paid becomes a refundable credit.
- **Editing:**
  - pending and confirmed bookings can change everything
  - in-house guests can change only the departure date (which must be after today), guest counts, rate, discount and requests
  - availability and pricing are re-checked on every edit

### Payments

- Multiple and partial payments are allowed, but a single payment may not exceed the outstanding balance.
- The payment method must be enabled in Settings.
- Refunds are separate ledger rows linked to the original payment, and can never exceed the refundable remainder.
- **Voiding** is for entries recorded in error and is admin-only. The row stays, marked voided with a reason.
- **Duplicate submissions:** each payment form generates an idempotency key when it opens. Repeating the request returns the original payment (`duplicate: true`). Reusing a key with different data returns 409. A unique index plus conflict handling covers concurrent double-clicks.
- The reservation row is locked while a payment is recorded, so concurrent payments cannot overshoot the balance.
- No card numbers, CVVs or other credentials are collected. Only an optional external reference (terminal slip, UPI ID) is stored. There is no live payment gateway.

### Housekeeping

- Cleaning status (`dirty → cleaning → clean → inspected`) is independent of operational status.
- Occupancy is **derived** from checked-in reservations and never stored as a flag. Housekeeping updates therefore cannot make an occupied or maintenance room sellable.
- Marking a room **inspected** (ready for arrival) requires a supervisor (admin or receptionist), and is rejected while the room is occupied or not in service.
- Housekeeping staff see and act only on tasks assigned to them or unassigned. Starting an unassigned task claims it. Completing a cleaning task marks the room clean.
- A room with a guest checked in cannot be put into maintenance. Taking a room out of service lists the upcoming bookings that must be moved.

## Roles and permissions

Permissions are defined once in `lib/permissions.ts`. They are enforced in **services** (every function), in **Route Handlers** (coarse gate) and in **pages** (`requirePageActor`). Navigation only mirrors them.

| Capability | Admin | Receptionist | Housekeeping |
|---|:-:|:-:|:-:|
| Dashboard, front desk, reservations, calendar, guests | ✓ | ✓ | |
| Guest identification details | ✓ | ✓ | |
| Record payments, refunds, post charges | ✓ | ✓ | |
| Void payments / charges | ✓ | | |
| Change room operational status (maintenance) | ✓ | ✓ | |
| Create/edit rooms and room types, base rates | ✓ | | |
| Housekeeping board and cleaning status | ✓ | ✓ | ✓ (no guest names) |
| Mark rooms inspected, create/assign tasks | ✓ | ✓ | |
| Reports and CSV export | ✓ | | |
| Staff, settings, audit log | ✓ | | |

On every request the user is re-read from the database, so deactivation, role changes and password resets take effect immediately. Changes to role, active status or password also bump `session_version`, which invalidates existing JWTs.

## Metrics and report definitions

All dates are **hotel-local business dates** in the configured timezone.

**Dashboard**

| Metric | Definition |
|---|---|
| Occupancy tonight | Rooms with a pending, confirmed or checked-in reservation covering tonight (plus any guest still checked in), divided by rooms in service |
| Available tonight | In-service rooms with no such reservation |
| Occupied now | Rooms with a checked-in reservation |
| Maintenance | Rooms not in service |
| Arrivals today | Reservations with today's check-in date that are not cancelled or no-show |
| Departures today | Check-out date today, in house or checked out |
| Collected today | Completed payments minus completed refunds with `paid_at` today (voided entries excluded) |
| Balances due | Positive balances of in-house and checked-out stays. Unpaid amounts on future bookings are shown separately because they are not yet payable. |
| Occupancy chart | Room-nights on the books per night for the last 14 and next 7 nights, divided by rooms *currently* in service. Room status history is not versioned. |
| Cash chart | Net collected per day for the last 14 days |

**Reports** (date-filtered, CSV export, max 1 year per run)

- **Occupancy:** rooms sold per night, occupancy %, ADR, RevPAR and room revenue (net of discount, before tax, spread evenly over the stay's nights).
- **Revenue:** separates **cash collected** (payments by method minus refunds, by payment date) from **revenue earned** (room revenue for nights actually stayed by checked-in or checked-out guests, plus charges posted that day). Deposits for future stays are collected but not yet earned, which is why the two differ.
- **Reservations:** bookings *created* in the period, and booked value (room totals including tax, not cancelled). Booked is not the same as collected.
- **Cancellations and no-shows:** cancellations by cancellation date, and no-shows by arrival date, with lost room value.
- **Outstanding balances:** point-in-time list of reservations that owe money, arriving up to the end date.
- **Room utilization:** nights sold and room revenue per room within the period.

CSV exports are admin-only, rate-limited, audited and served with `no-store`. Cells starting with `= + - @` are prefixed with `'` to prevent spreadsheet formula injection.

## Security

- **Passwords:** bcrypt (cost 12), 12–72 bytes. Login uses constant-time checks, including for unknown emails.
- **Sessions:** Auth.js JWT in an `HttpOnly`, `SameSite=Lax` cookie, marked `Secure` over HTTPS. Sessions last 12 hours and are revalidated against the database on every request.
- **Login rate limiting:** 5 attempts per email and 30 per IP per 15 minutes. Limits are stored in PostgreSQL so they hold across serverless instances. Payments, refunds, staff administration and exports are also rate-limited per user.
- **Authorization:** every service checks permissions and scopes queries to the actor's hotel, which prevents IDOR-style access to other hotels' records. Housekeeping never receives guest names or financial data.
- **Mutating API requests** must be JSON, and cross-origin `Origin` headers are rejected (on top of SameSite cookies).
- **Input:** all untrusted input is validated with Zod on the server. All SQL goes through Drizzle's parameterised builder, or `sql` templates with bound parameters.
- **Errors:** clients get generic 500 responses with a reference id; full errors are logged on the server only.
- **Audit log:** reservations, check-in and check-out, cancellations, no-shows, payments, refunds, voids, charges, room and rate changes, settings, staff changes, logins and exports are logged. Credential-like keys are stripped from metadata, and audit rows are immutable.
- **Data handling:** guest ID references are optional, no document images are stored, and no card data is collected.
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`. Pages are marked `noindex`.

## Known limitations

- **Single hotel per deployment.** The schema carries `hotel_id` everywhere and users belong to a hotel, but there is no hotel switcher or cross-hotel administration UI.
- **Maintenance blocking is not date-ranged.** It is a room status rather than a scheduled block. Upcoming reservations in a room taken out of service are listed so staff can move them, but are not moved automatically.
- **Occupancy history:** occupancy percentages use the *current* count of in-service rooms, because room status history is not versioned.
- **Calendar moves keep the stay length.** To change the length of a stay, edit the reservation.
- **No live payment gateway**, by design. No email or SMS notifications, no channel manager, and no self-service password reset (an admin resets passwords).
- **Rate limiting** uses a fixed window in PostgreSQL. For very high traffic, consider a dedicated store.
