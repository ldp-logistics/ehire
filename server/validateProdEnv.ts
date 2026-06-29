/**
 * Side-effect import from index-prod.ts before ./app loads.
 * Ensures production never runs with a missing or default JWT_SECRET.
 */
import { config } from "dotenv";

config();

/** Must match the fallback in AuthService / auth.routes */
const DEFAULT_JWT_SECRET = "your-secret-key-change-in-production";

if (process.env.NODE_ENV === "production") {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret === DEFAULT_JWT_SECRET) {
    console.error(
      "[FATAL] JWT_SECRET must be set to a strong random value in production (not the default placeholder).",
    );
    process.exit(1);
  }
}
