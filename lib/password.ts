import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** A precomputed hash used to keep login timing constant for unknown emails. */
export const DUMMY_PASSWORD_HASH = "$2b$12$laHwCiQX4f1i8HHJzrE2QeAg6lhLDR6SLPIafylc/cRGJU.9ch7H.";
