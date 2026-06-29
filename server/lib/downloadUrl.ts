/**
 * Download a file from an http(s) URL and return as a base64 data URL.
 * Follows redirects (e.g. S3 presigned URLs). Used to persist avatars/resumes
 * so we don't rely on expiring external URLs.
 */

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

export async function downloadUrlAsDataUrl(
  url: string,
  options?: { maxBytes?: number }
): Promise<string | null> {
  const maxBytes = options?.maxBytes ?? MAX_AVATAR_BYTES;
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return null;
  }
  try {
    const res = await fetch(trimmed, {
      method: "GET",
      headers: { Accept: "image/*,*/*" },
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn("[downloadUrl] Fetch failed:", res.status, trimmed.slice(0, 80));
      return null;
    }
    const contentType = res.headers.get("Content-Type") || "image/png";
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      console.warn("[downloadUrl] Response too large:", buf.byteLength, "max", maxBytes, trimmed.slice(0, 80));
      return null;
    }
    if (buf.byteLength === 0) {
      console.warn("[downloadUrl] Empty response:", trimmed.slice(0, 80));
      return null;
    }
    const b64 = Buffer.from(buf).toString("base64");
    return `data:${contentType};base64,${b64}`;
  } catch (err) {
    console.warn("[downloadUrl] Error:", (err as Error)?.message ?? err, trimmed.slice(0, 80));
    return null;
  }
}
