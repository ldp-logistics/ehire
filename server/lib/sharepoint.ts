/**
 * SharePoint upload for avatars and documents (employee docs, recruitment, tentative).
 *
 * --- Env (your names) ---
 *   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
 *   SHAREPOINT_SITE_ID, SHAREPOINT_DRIVE_ID
 *   SHAREPOINT_FOLDER_PATH (default: EmployeeAvatars) — base folder on the drive; all uploads go under this.
 *
 * --- Azure app ---
 *   Application permission: Sites.ReadWrite.All + admin consent.
 *
 * --- Folder structure (under SHAREPOINT_FOLDER_PATH) ---
 *   Avatars:                  {base}/{employeeId}.{ext}
 *   Employee documents:       {base}/EmployeeDocuments/{employeeId}/{fileName}
 *   Recruitment resumes:      {base}/Recruitment/Resumes/{fileName}
 *   Offer letters:            {base}/Recruitment/OfferLetters/{fileName}
 *   Tentative portal docs:     {base}/Recruitment/TentativeDocs/{fileName}
 *   Asset invoices (PDFs):     {base}/AssetManagement/Invoices/{fileName}
 *   Support ticket attachments:{base}/AssetManagement/TicketAttachments/{fileName}
 *   Leave supporting docs:     {base}/Leave/SupportingDocuments/{fileName}
 *   Company branding (profile banner): {base}/CompanyBranding/{fileName}
 *
 * --- Sharing link (stable, viewable URL stored in DB) ---
 *   type: "view", scope: "organization"
 *   → Anyone in the tenant can open the link; read-only. No anonymous access.
 *
 * --- Flow ---
 *   FreshTeam (or client) → we get base64 data URL → parseDataUrl → uploadFileToSharePoint
 *   → create sharing link → store that HTTPS URL in file_url. View: we redirect to URL or serve from it.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

function env(key: string, fallback = ""): string {
  const v = process.env[key];
  const s = typeof v === "string" ? v.trim() : "";
  return s || fallback;
}

const tenantId = () => env("MS_TENANT_ID") || env("AZURE_TENANT_ID");
const clientId = () => env("MS_CLIENT_ID") || env("AZURE_CLIENT_ID");
const clientSecret = () => env("MS_CLIENT_SECRET") || env("AZURE_CLIENT_SECRET");
const siteId = () => env("SHAREPOINT_SITE_ID");
const driveId = () => env("SHAREPOINT_DRIVE_ID");
const folderPath = () => env("SHAREPOINT_FOLDER_PATH", "EmployeeAvatars").replace(/^\/+|\/+$/g, "");

export function isSharePointAvatarConfigured(): boolean {
  return !!(tenantId() && clientId() && clientSecret() && siteId() && driveId());
}

export function getMissingSharePointEnvVars(): string[] {
  const missing: string[] = [];
  if (!tenantId()) missing.push("MS_TENANT_ID");
  if (!clientId()) missing.push("MS_CLIENT_ID");
  if (!clientSecret()) missing.push("MS_CLIENT_SECRET");
  if (!siteId()) missing.push("SHAREPOINT_SITE_ID");
  if (!driveId()) missing.push("SHAREPOINT_DRIVE_ID");
  return missing;
}

// Reuse token until ~5 min before expiry so avatar requests don't each call Microsoft login
let tokenCache: { token: string; expiresAt: number } | null = null;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return tokenCache.token;
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId()}/oauth2/v2.0/token`,
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
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresIn = (data.expires_in ?? 3599) * 1000; // default ~1 hour in ms
  tokenCache = { token: data.access_token, expiresAt: Date.now() + expiresIn };
  return tokenCache.token;
}

async function createSharingLink(token: string, fileId: string): Promise<string> {
  const url = `${GRAPH}/sites/${siteId()}/drives/${driveId()}/items/${fileId}/createLink`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "view", scope: "organization" }),
  });
  if (res.status !== 200 && res.status !== 201) throw new Error(`createLink: ${res.status}`);
  const json = (await res.json()) as { link?: { webUrl?: string } };
  return json.link?.webUrl ?? "";
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/gif": "gif", "image/webp": "webp",
    "application/pdf": "pdf",
  };
  return map[mime.split(";")[0].trim().toLowerCase()] || "png";
}

/**
 * Upload a file to SharePoint under a subfolder (e.g. Recruitment/Resumes, Recruitment/OfferLetters).
 * Returns sharing URL or null if not configured. Use for resumes, offer letters, tentative docs, employee docs.
 */
export async function uploadFileToSharePoint(
  subfolder: string,
  fileName: string,
  fileBytes: Buffer,
  mimeType: string
): Promise<string | null> {
  if (!isSharePointAvatarConfigured()) return null;

  const token = await getToken();
  const site = siteId();
  const drive = driveId();
  const base = folderPath();
  const pathSeg = base ? `${base}/${subfolder}/${fileName}` : `${subfolder}/${fileName}`;

  const uploadUrl = `${GRAPH}/sites/${site}/drives/${drive}/root:/${pathSeg}:/content`;
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
    },
    body: fileBytes,
  });
  if (!putRes.ok) throw new Error(`Upload: ${putRes.status} ${await putRes.text()}`);

  const fileData = (await putRes.json()) as { id: string; webUrl?: string };
  try {
    const link = await createSharingLink(token, fileData.id);
    if (link) return link;
  } catch {
    // fallback
  }
  return fileData.webUrl ?? null;
}

/**
 * Upload file to SharePoint, create sharing link, return URL. Returns null if not configured.
 */
export async function uploadAvatarToSharePoint(
  employeeId: string,
  fileBytes: Buffer,
  mimeType: string
): Promise<string | null> {
  if (!isSharePointAvatarConfigured()) return null;

  const token = await getToken();
  const site = siteId();
  const drive = driveId();
  const folder = folderPath();
  const filename = `${employeeId}.${extFromMime(mimeType)}`;
  const itemPath = folder ? `${folder}/${filename}` : filename;

  const uploadUrl = `${GRAPH}/sites/${site}/drives/${drive}/root:/${itemPath}:/content`;
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
    },
    body: fileBytes,
  });
  if (!putRes.ok) throw new Error(`Upload: ${putRes.status} ${await putRes.text()}`);

  const fileData = (await putRes.json()) as { id: string; webUrl?: string };
  try {
    const link = await createSharingLink(token, fileData.id);
    if (link) return link;
  } catch {
    // fallback to webUrl if createLink fails
  }
  return fileData.webUrl ?? null;
}

/**
 * Encode a sharing URL for Graph /shares/ API.
 * See https://learn.microsoft.com/en-us/graph/api/shares-get#encoding-sharing-urls
 */
function encodeSharingUrl(sharingUrl: string): string {
  const base64 = Buffer.from(sharingUrl, "utf8").toString("base64");
  const base64url = base64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  return "u!" + base64url;
}

/**
 * Fetch file content from a SharePoint/OneDrive sharing link using Graph API.
 * Use when avatar in DB is a sharing URL (e.g. https://....sharepoint.com/:i:/s/...).
 * Returns null if not configured, URL is not SharePoint, or fetch fails.
 */
export async function getAvatarContentBySharingUrl(
  sharingUrl: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const url = sharingUrl.trim();
  if (!url.startsWith("https://") && !url.startsWith("http://")) return null;
  const isSharePoint = /sharepoint\.com|onedrive\.live\.com/i.test(url);
  if (!isSharePoint || !isSharePointAvatarConfigured()) return null;

  try {
    const token = await getToken();
    const encoded = encodeSharingUrl(url);
    const contentUrl = `${GRAPH}/shares/${encoded}/driveItem/content`;
    const res = await fetch(contentUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: "redeemSharingLinkIfNecessary",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("Content-Type") || "image/png";
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/**
 * Parse data URL to buffer + contentType. Returns null if invalid.
 */
export function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const s = dataUrl.trim();
  if (!s.startsWith("data:") || !s.includes(";base64,")) return null;
  const i = s.indexOf(";base64,");
  const contentType = s.slice(5, i).trim() || "image/png";
  const b64 = s.slice(i + 8).replace(/\s/g, "");
  try {
    return { buffer: Buffer.from(b64, "base64"), contentType };
  } catch {
    return null;
  }
}
