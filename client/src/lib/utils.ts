import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip script/iframe/object/form and their content so HTML can be rendered safely for job descriptions. */
export function sanitizeJobHtml(html: string): string {
  if (!html || typeof html !== "string") return ""
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
}

/** True if string looks like HTML (contains tags). */
export function isHtmlContent(s: string | null | undefined): boolean {
  return Boolean(s && typeof s === "string" && /<[a-z][\s\S]*>/i.test(s))
}
