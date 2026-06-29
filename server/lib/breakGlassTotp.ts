import { generateSecret, generateURI, verifySync } from "otplib";
import crypto from "crypto";
import bcrypt from "bcrypt";

const ISSUER = "LDP HRM";

export function generateTotpSecret(): string {
  return generateSecret();
}

export function buildOtpauthUrl(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const normalized = (code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const result = verifySync({ secret, token: normalized });
  return result.valid === true;
}

/** 10 one-time recovery codes (plain). Store only bcrypt hashes server-side. */
export async function generateRecoveryCodeHashes(): Promise<{ plain: string[]; hashes: string[] }> {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const p = crypto.randomBytes(5).toString("hex").toUpperCase();
    plain.push(p);
    hashes.push(await bcrypt.hash(p, 10));
  }
  return { plain, hashes };
}

export async function matchRecoveryCode(
  code: string,
  hashes: string[],
): Promise<{ index: number } | null> {
  const c = (code || "").trim().toUpperCase();
  if (c.length < 8) return null;
  for (let i = 0; i < hashes.length; i++) {
    try {
      if (await bcrypt.compare(c, hashes[i])) return { index: i };
    } catch {
      /* invalid hash row */
    }
  }
  return null;
}

export function assertStrongBreakGlassPassword(pw: string): void {
  if (pw.length < 16) throw new Error("Password must be at least 16 characters");
  if (!/[a-z]/.test(pw)) throw new Error("Password must include a lowercase letter");
  if (!/[A-Z]/.test(pw)) throw new Error("Password must include an uppercase letter");
  if (!/[0-9]/.test(pw)) throw new Error("Password must include a number");
  if (!/[^A-Za-z0-9]/.test(pw)) throw new Error("Password must include a symbol");
}
