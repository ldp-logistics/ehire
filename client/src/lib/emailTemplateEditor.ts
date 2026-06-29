/**
 * Notification templates are stored as strings. Many defaults are plain text with line breaks;
 * TipTap needs HTML. Detect existing HTML and otherwise convert paragraphs / newlines safely.
 */
export function bodyTemplateToEditorHtml(raw: string): string {
  const t = raw ?? "";
  if (!t.trim()) return "<p></p>";
  if (/<\s*[a-zA-Z!?/]/.test(t)) return t;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return t
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Insert a {{placeholder}} token into the end of the last paragraph (or new paragraph). */
export function appendPlaceholderToEmailHtml(html: string, token: string): string {
  const t = (html ?? "").trim();
  const visible = t.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  if (!visible) return `<p>${token} </p>`;
  const lastP = t.lastIndexOf("</p>");
  if (lastP !== -1) return `${t.slice(0, lastP)} ${token} ${t.slice(lastP)}`;
  return `${t}<p>${token} </p>`;
}
