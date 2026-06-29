/**
 * Quick check: token + drive access. Same .env as migration.
 * Run: npm run db:test-sharepoint
 */

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

const GRAPH = "https://graph.microsoft.com/v1.0";
const env = (k: string, f = "") => (typeof process.env[k] === "string" ? process.env[k]!.trim() : "") || f;
const tenant = () => env("MS_TENANT_ID") || env("AZURE_TENANT_ID");
const clientId = () => env("MS_CLIENT_ID") || env("AZURE_CLIENT_ID");
const clientSecret = () => env("MS_CLIENT_SECRET") || env("AZURE_CLIENT_SECRET");
const siteId = () => env("SHAREPOINT_SITE_ID");
const driveId = () => env("SHAREPOINT_DRIVE_ID");

async function main() {
  if (!tenant() || !clientId() || !clientSecret() || !siteId() || !driveId()) {
    console.error("Missing .env: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, SHAREPOINT_SITE_ID, SHAREPOINT_DRIVE_ID");
    process.exitCode = 1;
    return;
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId(),
        client_secret: clientSecret(),
        scope: "https://graph.microsoft.com/.default",
      }).toString(),
    }
  );
  if (!tokenRes.ok) {
    console.error("Token failed:", tokenRes.status, await tokenRes.text());
    process.exitCode = 1;
    return;
  }
  const token = (await tokenRes.json()).access_token;

  const parts = token.split(".");
  if (parts.length >= 2) {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const roles = payload.roles as string[] | undefined;
    console.log("Token roles:", roles?.length ? roles.join(", ") : "(none – add Sites.ReadWrite.All + admin consent)");
    if (!roles?.length) {
      process.exitCode = 1;
      return;
    }
  }

  const driveRes = await fetch(
    `${GRAPH}/sites/${siteId()}/drives/${driveId()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (driveRes.ok) {
    console.log("Drive access: OK");
  } else {
    console.error("Drive access:", driveRes.status, await driveRes.text());
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
