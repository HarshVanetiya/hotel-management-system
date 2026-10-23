import { config } from "dotenv";

// Mirror Next.js precedence for scripts: .env.local overrides .env.
config({ path: [".env.local", ".env"], quiet: true });
