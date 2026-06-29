/** List / directory / pickers: legal name only (no pseudonym). */
export function formatEmployeeLegalName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = String(firstName ?? "").trim();
  const last = String(lastName ?? "").trim();
  const base = [first, last].filter(Boolean).join(" ").trim();
  return base || "—";
}

/**
 * Profile header / full display: legal first + last, optional pseudonym in parentheses.
 * Example: "Shaheer Mehmood (Alan Gilbert)"
 */
export function formatEmployeeDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  nickname: string | null | undefined,
): string {
  const first = String(firstName ?? "").trim();
  const last = String(lastName ?? "").trim();
  const base = [first, last].filter(Boolean).join(" ").trim();
  const nick = String(nickname ?? "").trim();
  if (!base && !nick) return "—";
  if (!nick) return base;
  if (!base) return nick;
  return `${base} (${nick})`;
}

/**
 * Asset Management assignee label: pseudonym (nickname) when set, else stored name or legal name.
 * Matches legacy assignments that stored office names in user_name.
 */
export function formatEmployeeAssetAssigneeName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  nickname: string | null | undefined,
  storedUserName?: string | null | undefined,
): string {
  const nick = String(nickname ?? "").trim();
  if (nick) return nick;
  const stored = String(storedUserName ?? "").trim();
  if (stored) return stored;
  const legal = formatEmployeeLegalName(firstName, lastName);
  return legal === "—" ? "Unknown" : legal;
}
