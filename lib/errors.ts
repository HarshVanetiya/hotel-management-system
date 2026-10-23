/**
 * Application errors carry a safe, user-facing message and an HTTP status.
 * Anything that is not an AppError is treated as internal: it is logged on
 * the server and clients only see a generic message.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 422, "validation_error", details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You must be signed in.") {
    super(message, 401, "unauthenticated");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Record") {
    super(`${entity} not found.`, 404, "not_found");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, "conflict", details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please wait and try again.") {
    super(message, 429, "rate_limited");
  }
}

/** PostgreSQL error helpers (node-postgres and Neon expose `code`). */
export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  // Drizzle may wrap driver errors in `cause`.
  for (let i = 0; i < 3 && current && typeof current === "object"; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  let current: unknown = err;
  for (let i = 0; i < 3 && current && typeof current === "object"; i++) {
    const c = (current as { constraint?: unknown }).constraint;
    if (typeof c === "string") return c;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_EXCLUSION_VIOLATION = "23P01";
export const PG_CHECK_VIOLATION = "23514";
export const PG_FK_VIOLATION = "23503";
