/** Refuses to run destructive tests against anything that is not clearly a test database. */
export function assertTestDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Integration tests need an isolated PostgreSQL database.");
  }
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run tests: database "${name}" does not look like a test database (name must contain "test").`);
  }
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run tests with NODE_ENV=production.");
  return url;
}
