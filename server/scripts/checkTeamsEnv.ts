import { config } from "dotenv";
config();

import { isTeamsIntegrationConfigured, teamsConfig } from "../config/teams.js";

async function main() {
  console.log("TEAMS_GRAPH_ENABLED:", teamsConfig.enabled);
  console.log("isTeamsIntegrationConfigured:", isTeamsIntegrationConfigured());
  console.log("Organizer:", teamsConfig.organizerEmail || "(missing)");
  console.log("APP_URL:", process.env.APP_URL || "(missing)");

  if (!isTeamsIntegrationConfigured()) {
    process.exit(1);
  }

  const body = new URLSearchParams({
    client_id: teamsConfig.clientId,
    client_secret: teamsConfig.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${teamsConfig.tenantId}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    console.error("Graph token FAILED:", tokenRes.status, tokenText.slice(0, 300));
    process.exit(1);
  }
  console.log("Graph app token: OK");

  const token = (JSON.parse(tokenText) as { access_token: string }).access_token;
  const userRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(teamsConfig.organizerEmail)}/calendar`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (userRes.ok) {
    console.log("Organizer calendar access: OK");
  } else {
    console.error("Organizer calendar FAILED:", userRes.status, (await userRes.text()).slice(0, 400));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
