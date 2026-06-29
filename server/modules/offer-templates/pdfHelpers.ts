/**
 * Low-level helpers for the offer-letter e-sign pipeline.
 *
 *  - convertDocxToPdf / convertDocxToHtml – LibreOffice (soffice --headless)
 *  - injectSignatureIntoDocx – DOCX XML patch before LO → PDF
 *
 * PDF AcroForm flatten + signature overlay lives in `pdfFormService.ts` (`overlaySignatureOnPdf`).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import PizZip from "pizzip";
import { OFFER_ESIGN_DOCX_SIGNATURE_PX } from "../../../shared/offerSignatureLayout.js";

const execFileAsync = promisify(execFile);

const SOFFICE_TIMEOUT_MS = 30_000;

/** LibreOffice needs a real writable profile dir; never use `/tmp` as HOME on Windows. */
function envForLibreOffice(): NodeJS.ProcessEnv {
  const base = { ...process.env };
  if (process.platform === "win32") {
    const home = base.USERPROFILE || base.HOME || os.homedir();
    base.USERPROFILE = home;
    base.HOME = home;
  } else {
    base.HOME = base.HOME || "/tmp";
  }
  return base;
}

/**
 * Paths to try for the LibreOffice CLI. Order matters.
 * - `SOFFICE_PATH` / `LIBREOFFICE_SOFFICE` env (full path to soffice.exe) — use when Node’s PATH
 *   differs from your terminal (common with IDEs / services).
 * - Typical Windows install dirs (no PATH required).
 * - Finally `soffice` / `soffice.exe` on PATH.
 */
function buildSofficeCandidates(): string[] {
  const out: string[] = [];
  const fromEnv = process.env.SOFFICE_PATH?.trim() || process.env.LIBREOFFICE_SOFFICE?.trim();
  if (fromEnv) out.push(fromEnv);

  if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    out.push(
      path.join(pf, "LibreOffice", "program", "soffice.exe"),
      path.join(pf86, "LibreOffice", "program", "soffice.exe"),
      "soffice.exe",
      "soffice",
    );
  } else {
    out.push("soffice");
  }

  const seen = new Set<string>();
  return out.filter((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

async function findConvertedPdf(outDir: string, expectedBase: string): Promise<string | null> {
  const expected = path.join(outDir, `${expectedBase}.pdf`);
  try {
    await fs.access(expected);
    return expected;
  } catch {
    /* continue */
  }
  const entries = await fs.readdir(outDir);
  const pdfs = entries.filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 1) return path.join(outDir, pdfs[0]);
  return null;
}

// ---------------------------------------------------------------------------
// Task 2 — LibreOffice DOCX → PDF
// ---------------------------------------------------------------------------

/**
 * Convert a DOCX buffer to a PDF buffer using LibreOffice.
 * Requires `soffice` to be installed in the runtime environment (see Dockerfile).
 *
 * Temp files are always cleaned up, even on error.
 */
/**
 * Run soffice with given args, trying each candidate command in order.
 * Returns { stdout, stderr } or throws on failure.
 */
async function runSoffice(
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string }> {
  const execOpts = {
    timeout: SOFFICE_TIMEOUT_MS,
    windowsHide: true as const,
    env: { ...envForLibreOffice(), ...extraEnv },
  };

  let lastErr: Error | null = null;
  const candidates = buildSofficeCandidates();
  for (let i = 0; i < candidates.length; i++) {
    try {
      const r = await execFileAsync(candidates[i], args, execOpts);
      return { stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? "") };
    } catch (e: any) {
      lastErr = e;
      if (e?.code === "ENOENT" && i < candidates.length - 1) continue;
      // Attach stderr/stdout to error message for better diagnostics
      const out = [
        e?.message,
        e?.stderr ? `stderr: ${String(e.stderr).trim()}` : "",
        e?.stdout ? `stdout: ${String(e.stdout).trim()}` : "",
      ].filter(Boolean).join("\n");
      throw new Error(out);
    }
  }
  throw lastErr ?? new Error("soffice not found");
}

/**
 * Convert a DOCX buffer to a PDF buffer using LibreOffice.
 * Each conversion gets its own isolated LO user-profile directory so
 * parallel calls never conflict and an open LO GUI won't block headless.
 */
async function longTmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const tmpDir = await longTmpDir(`offer-lo-${crypto.randomUUID().slice(0, 8)}-`);
  const docxPath = path.join(tmpDir, "offer.docx");

  try {
    await fs.writeFile(docxPath, docxBuffer);

    const { stderr } = await runSoffice([
      "--headless",
      "--norestore",
      "--nofirststartwizard",
      "--nolockcheck",
      "--convert-to", "pdf",
      "--outdir", tmpDir,
      docxPath,
    ]);
    if (stderr.trim()) console.debug("[offer-lo] soffice stderr:", stderr.trim());

    const pdfPath = await findConvertedPdf(tmpDir, "offer");
    if (!pdfPath) {
      throw new Error(`soffice exited OK but produced no PDF in ${tmpDir}`);
    }

    return await fs.readFile(pdfPath);
  } catch (e: any) {
    const hint =
      process.platform === "win32" && String(e?.message ?? e).includes("ENOENT")
        ? " Set SOFFICE_PATH env to the full path of soffice.exe."
        : "";
    throw new Error(`LibreOffice DOCX→PDF conversion failed: ${e?.message ?? String(e)}${hint}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// LibreOffice DOCX → HTML (for preview)
// ---------------------------------------------------------------------------

/**
 * Convert a DOCX buffer to an HTML string using LibreOffice.
 * Images generated by LibreOffice are read and inlined as base64 data URLs
 * so the HTML fragment is self-contained (safe for dangerouslySetInnerHTML).
 *
 * Returns the <body> content + any <style> blocks from LibreOffice as a
 * single HTML string. Falls back to an empty string on failure (caller
 * should fall back to mammoth).
 */
export async function convertDocxToHtml(docxBuffer: Buffer): Promise<string> {
  const tmpDir = await longTmpDir(`offer-lo-html-${crypto.randomUUID().slice(0, 8)}-`);
  const docxPath = path.join(tmpDir, "offer.docx");

  try {
    await fs.writeFile(docxPath, docxBuffer);

    await runSoffice([
      "--headless",
      "--norestore",
      "--nofirststartwizard",
      "--nolockcheck",
      "--convert-to", "html",
      "--outdir", tmpDir,
      docxPath,
    ]);

    // Find the generated HTML file
    const entries = await fs.readdir(tmpDir);
    const htmlFile = entries.find((f) => f.toLowerCase().endsWith(".html") || f.toLowerCase().endsWith(".htm"));
    if (!htmlFile) throw new Error("LibreOffice did not produce an HTML file");

    let fullHtml = await fs.readFile(path.join(tmpDir, htmlFile), "utf-8");

    // Inline any local image references (LibreOffice writes them as separate files)
    const imgRegex = /(<img\s[^>]*src=")([^"]+)(")/gi;
    const imgReplacements: Array<[string, string]> = [];

    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(fullHtml)) !== null) {
      const src = m[2];
      if (src.startsWith("data:") || src.startsWith("http")) continue;
      const imgPath = path.resolve(tmpDir, src);
      try {
        const imgBuf = await fs.readFile(imgPath);
        const ext = path.extname(imgPath).toLowerCase().replace(".", "");
        const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        imgReplacements.push([m[0], `${m[1]}data:${mime};base64,${imgBuf.toString("base64")}${m[3]}`]);
      } catch {
        /* image file not found — leave src as-is */
      }
    }
    for (const [from, to] of imgReplacements) {
      fullHtml = fullHtml.replace(from, to);
    }

    // Extract <style> blocks
    const styleBlocks = (fullHtml.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? []).join("\n");

    // Extract <body> content
    const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : fullHtml;

    return `${styleBlocks}<div class="lo-preview">${bodyHtml}</div>`;
  } catch (e: any) {
    // Log full error (includes stderr from runSoffice) before rethrowing
    console.error("[offer-lo] HTML conversion error:", String(e?.message ?? e).slice(0, 1000));
    throw new Error(`LibreOffice HTML conversion failed: ${e?.message ?? String(e)}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// DOCX signature injection — embed image before LibreOffice conversion
// ---------------------------------------------------------------------------

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Replace the LAST <w:p> that contains any of `markers`, with start index ≥ minParagraphStart.
 * Used for merge markers so the first occurrence (e.g. under HR's image in the wrong table cell)
 * does not win over a later placeholder or signature line.
 */
function replaceLastParagraphContaining(
  docXml: string,
  markers: string[],
  replacementXml: string,
  minParagraphStart: number,
): { xml: string; placed: boolean } {
  const hits: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < docXml.length) {
    const pGt = docXml.indexOf("<w:p>", cursor);
    const pSp = docXml.indexOf("<w:p ", cursor);

    let pStart = -1;
    if (pGt === -1 && pSp === -1) break;
    else if (pGt === -1) pStart = pSp;
    else if (pSp === -1) pStart = pGt;
    else pStart = Math.min(pGt, pSp);

    const pEnd = docXml.indexOf("</w:p>", pStart);
    if (pEnd === -1) break;

    const paraXml = docXml.slice(pStart, pEnd + 6);
    if (
      pStart >= minParagraphStart &&
      markers.some((m) => m.length > 0 && paraXml.includes(m))
    ) {
      hits.push({ start: pStart, end: pEnd + 6 });
    }
    cursor = pEnd + 6;
  }

  if (hits.length === 0) return { xml: docXml, placed: false };
  const { start, end } = hits[hits.length - 1];
  return {
    xml: docXml.slice(0, start) + replacementXml + docXml.slice(end),
    placed: true,
  };
}

/** Remove leftover merge markers after injecting the image (wrong column / duplicate placeholders). */
function stripOrphanSignatureMarkers(docXml: string, sigUnicode: string): string {
  return docXml
    .split(sigUnicode)
    .join("")
    .split("{{candidate.signature}}")
    .join("")
    .split("{{signature}}")
    .join("")
    .split("ESIGN_SIGNATURE")
    .join("");
}

/**
 * Replace merge signature markers inside the LAST matching <w:p> without dropping sibling text
 * (e.g. "Zubair Javed  Signature _____" in the same table cell as {{candidate.signature}}).
 *
 * 1) If the marker sits in a single <w:r> whose visible text is only the marker → replace that run.
 * 2) Else if the marker lies inside one <w:t>…</w:t> with prefix/suffix text → close the run,
 *    inject drawing runs, reopen a run with the same w:rPr and the suffix text.
 * 3) Else return null (caller may replace the whole paragraph as a last resort).
 */
function replaceSignatureMarkersInsideLastParagraph(
  docXml: string,
  markers: string[],
  sigRunBlock: string,
  minParagraphStart: number,
): { xml: string; placed: boolean } {
  const hits: Array<{ start: number; end: number; para: string }> = [];
  let cursor = 0;
  while (cursor < docXml.length) {
    const pGt = docXml.indexOf("<w:p>", cursor);
    const pSp = docXml.indexOf("<w:p ", cursor);
    let pStart = -1;
    if (pGt === -1 && pSp === -1) break;
    else if (pGt === -1) pStart = pSp;
    else if (pSp === -1) pStart = pGt;
    else pStart = Math.min(pGt, pSp);
    const pEnd = docXml.indexOf("</w:p>", pStart);
    if (pEnd === -1) break;
    const paraXml = docXml.slice(pStart, pEnd + 6);
    if (
      pStart >= minParagraphStart &&
      markers.some((m) => m.length > 0 && paraXml.includes(m))
    ) {
      hits.push({ start: pStart, end: pEnd + 6, para: paraXml });
    }
    cursor = pEnd + 6;
  }
  if (hits.length === 0) return { xml: docXml, placed: false };

  const { start, end, para } = hits[hits.length - 1];

  let bestIdx = -1;
  let bestLen = 0;
  for (const m of markers) {
    if (!m) continue;
    const li = para.lastIndexOf(m);
    if (li > bestIdx) {
      bestIdx = li;
      bestLen = m.length;
    }
  }
  if (bestIdx === -1) return { xml: docXml, placed: false };

  const rStart = para.lastIndexOf("<w:r", bestIdx);
  const rEnd = para.indexOf("</w:r>", bestIdx);
  if (rStart === -1 || rEnd === -1 || rEnd < rStart) return { xml: docXml, placed: false };
  const runXml = para.slice(rStart, rEnd + 6);
  const markerSlice = para.slice(bestIdx, bestIdx + bestLen);
  if (!runXml.includes(markerSlice)) return { xml: docXml, placed: false };

  const textInRun = (runXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("");
  const markerNorm = markerSlice.replace(/\u200b/g, "").trim();
  const textNorm = textInRun.replace(/\u200b/g, "").trim();
  if (textNorm === markerNorm || textNorm === markerSlice.trim()) {
    const newPara = para.slice(0, rStart) + sigRunBlock + para.slice(rEnd + 6);
    return { xml: docXml.slice(0, start) + newPara + docXml.slice(end), placed: true };
  }

  const wtOpen = para.lastIndexOf("<w:t", bestIdx);
  if (wtOpen === -1 || wtOpen < rStart) return { xml: docXml, placed: false };
  const gt = para.indexOf(">", wtOpen);
  const wtClose = para.indexOf("</w:t>", bestIdx);
  if (gt === -1 || wtClose === -1 || gt >= bestIdx || wtClose < bestIdx + bestLen) {
    return { xml: docXml, placed: false };
  }

  const innerBefore = para.slice(gt + 1, bestIdx);
  const innerAfter = para.slice(bestIdx + bestLen, wtClose);
  const rPrMatch = runXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : "";

  const newPara =
    para.slice(0, rStart) +
    para.slice(rStart, gt + 1) +
    innerBefore +
    `</w:t></w:r>` +
    sigRunBlock +
    `<w:r>` +
    rPr +
    `<w:t xml:space="preserve">` +
    innerAfter +
    `</w:t></w:r>` +
    para.slice(rEnd + 6);

  return { xml: docXml.slice(0, start) + newPara + docXml.slice(end), placed: true };
}

/**
 * Scan all <w:p> elements, extract their plain-text content (all <w:t> nodes
 * concatenated), and replace the LAST paragraph whose text matches `pattern`.
 * Used for templates that use "Signature___" underscores instead of
 * the {{candidate.signature}} placeholder.
 *
 * `minParagraphStart` — ignore paragraphs beginning before this index in document.xml
 * (avoids replacing header separator lines made of underscores).
 */
function replaceParagraphByContent(
  docXml: string,
  pattern: RegExp,
  replacementXml: string,
  opts?: { minParagraphStart?: number },
): { xml: string; placed: boolean } {
  const minStart = opts?.minParagraphStart ?? 0;
  const hits: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  while (cursor < docXml.length) {
    const pGt = docXml.indexOf("<w:p>", cursor);
    const pSp = docXml.indexOf("<w:p ", cursor);

    let pStart = -1;
    if (pGt === -1 && pSp === -1) break;
    else if (pGt === -1) pStart = pSp;
    else if (pSp === -1) pStart = pGt;
    else pStart = Math.min(pGt, pSp);

    const pEnd = docXml.indexOf("</w:p>", pStart);
    if (pEnd === -1) break;

    const paraXml = docXml.slice(pStart, pEnd + 6);
    // Concatenate text content from all <w:t> nodes in this paragraph
    const textContent = (paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("");

    if (pStart >= minStart && pattern.test(textContent)) {
      hits.push({ start: pStart, end: pEnd + 6 });
    }
    cursor = pEnd + 6;
  }

  if (hits.length === 0) return { xml: docXml, placed: false };

  // Use the LAST match — most likely to be the actual signature line
  const { start, end } = hits[hits.length - 1];
  return {
    xml: docXml.slice(0, start) + replacementXml + docXml.slice(end),
    placed: true,
  };
}

/**
 * Strip mc:AlternateContent blocks that wrap complex Word-only drawing groups
 * (wpg:wgp, wps:wsp) so LibreOffice gets clean inline text instead of broken drawings.
 *
 * Pattern replaced:
 *   <mc:AlternateContent>
 *     <mc:Choice Requires="wpg|wps|...">…complex drawing…</mc:Choice>
 *     <mc:Fallback>…plain <w:t> fallback text…</mc:Fallback>
 *   </mc:AlternateContent>
 * → replaced with just the Fallback's inner content.
 *
 * This fixes "Sincerely / Yousuf Admani / COO" floating textbox groups that
 * LibreOffice renders out-of-order or not at all.
 */
function simplifyAlternateContent(docXml: string): string {
  // Match whole <mc:AlternateContent>…</mc:AlternateContent> blocks
  // that contain a <mc:Choice Requires="wpg|wps|wpg wps"> (drawing groups only)
  const acRegex = /<mc:AlternateContent\b[^>]*>([\s\S]*?)<\/mc:AlternateContent>/g;

  return docXml.replace(acRegex, (_, inner: string) => {
    // Only flatten if Choice requires word drawing features (not other content)
    if (!/<mc:Choice\b[^>]*Requires="[^"]*wp[gs]/i.test(inner)) {
      return _; // leave non-drawing AlternateContent untouched
    }

    // Extract fallback inner content
    const fallbackMatch = inner.match(/<mc:Fallback[^>]*>([\s\S]*?)<\/mc:Fallback>/);
    if (!fallbackMatch) return _; // no fallback → leave as-is

    // Return fallback content unwrapped
    return fallbackMatch[1];
  });
}

/** DrawingML inline image XML for an embedded relationship. */
function buildImageDrawingXml(relId: string, widthPx: number, heightPx: number): string {
  const cx = widthPx * 9525;  // px → EMU (1px @96dpi = 9525 EMU)
  const cy = heightPx * 9525;
  // Declare all namespaces at the top-level <w:drawing> element so LibreOffice
  // and strict XML parsers don't choke on forward-referenced prefixes.
  return (
    `<w:drawing` +
    ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"` +
    ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
    ` xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` +
    `>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="9001" name="esign_sig"/>` +
    `<wp:cNvGraphicFramePr>` +
    `<a:graphicFrameLocks noChangeAspect="1"/>` +
    `</wp:cNvGraphicFramePr>` +
    `<a:graphic>` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic>` +
    `<pic:nvPicPr>` +
    `<pic:cNvPr id="9002" name="esign_sig"/>` +
    `<pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip r:embed="${relId}"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/>` +
    `</pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>`
  );
}

/**
 * Embed the e-signature image and signed date directly into the merged DOCX XML.
 *
 * Replaces (in order):
 *   • Last paragraph with ESIGN_SIGNATURE / {{candidate.signature}} merge markers:
 *     replace with the image only (keeps sibling "Signature" / other text; no printed candidate name).
 *   • Else paragraph whose text is only "Signature____" (not "Name … Signature ___" on one line):
 *     replace with "Signature" + image.
 *   • Else underscore-only / last long underscore block heuristics (templates with no merge tag).
 *   • Else appends a signature block at the end of the body
 *   • Strips any remaining signature merge markers so wrong cells do not show junk
 *   • ESIGN_DATE is replaced in-place (marker may share a paragraph with other text)
 *
 * LibreOffice then converts the patched DOCX to PDF with the signature
 * rendered exactly at the placeholder position.
 */
export async function injectSignatureIntoDocx(
  docxBuffer: Buffer,
  signatureDataUrl: string,
  _signerName: string,
  signedDate: string,
): Promise<Buffer> {
  void _signerName;
  const base64Data = signatureDataUrl.replace(/^data:image\/[^;]+;base64,/, "");
  const sigBytes = Buffer.from(base64Data, "base64");

  const zip = new PizZip(docxBuffer);

  // ── 1. Add PNG to media folder ────────────────────────────────────────
  const imgRelId = "rIdEsignSig";
  const imgMediaPath = "word/media/esign_signature.png";
  zip.file(imgMediaPath, sigBytes);

  // ── 2. Register PNG content-type (add once if missing) ───────────────
  const ctPath = "[Content_Types].xml";
  const ctXml = zip.file(ctPath)?.asText() ?? "";
  if (!ctXml.includes('Extension="png"') && !ctXml.includes('ContentType="image/png"')) {
    zip.file(ctPath, ctXml.replace("</Types>", `<Default Extension="png" ContentType="image/png"/></Types>`));
  }

  // ── 3. Add image relationship ─────────────────────────────────────────
  const relsPath = "word/_rels/document.xml.rels";
  const relsXml = zip.file(relsPath)?.asText() ?? "";
  if (!relsXml.includes(imgRelId)) {
    const rel =
      `<Relationship Id="${imgRelId}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
      `Target="media/esign_signature.png"/>`;
    zip.file(relsPath, relsXml.replace("</Relationships>", `${rel}</Relationships>`));
  }

  // ── 4. Build replacement XML for signature paragraph ─────────────────
  const drawingXml = buildImageDrawingXml(
    imgRelId,
    OFFER_ESIGN_DOCX_SIGNATURE_PX.width,
    OFFER_ESIGN_DOCX_SIGNATURE_PX.height,
  );
  const sigImageRun = `<w:r>${drawingXml}</w:r>`;
  /** Shown when we replace an entire paragraph (marker-only / underscore line) — keeps the word "Signature". */
  /** 10pt label keeps the signature row shorter than default 11pt body text. */
  const signatureLabelRun =
    `<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">Signature </w:t></w:r>`;
  /** In-place marker swap: image only so sibling "Signature" / name lines in the same <w:p> stay intact. */
  const sigRunBlockInPlace = sigImageRun;
  /**
   * Full <w:p> replacement: label + image. `w:line` is in twentieths of a pt (twips): 320 = 16pt exact line
   * so the row does not grow like default “at least” line height beside tall inline drawings.
   */
  const sigParagraph =
    `<w:p><w:pPr>` +
    `<w:spacing w:before="0" w:after="0" w:line="320" w:lineRule="exact"/>` +
    `<w:textAlignment w:val="bottom"/>` +
    `</w:pPr>${signatureLabelRun}${sigImageRun}</w:p>`;

  // ── 5. Patch document.xml ─────────────────────────────────────────────
  let docXml = zip.file("word/document.xml")?.asText() ?? "";

  const SIG_UNICODE = "\u200B\u2063ESIGN_SIGNATURE\u2063\u200B";
  const DATE_UNICODE = "\u200B\u2063ESIGN_DATE\u2063\u200B";
  const MOUSTACHE_SIG = "{{candidate.signature}}";
  const MERGE_MARKERS_FOR_LAST_PARA = [SIG_UNICODE, MOUSTACHE_SIG, "{{signature}}", "ESIGN_SIGNATURE"];

  /** Skip header/decorative underscore lines: only consider paragraphs after "Sincerely" (or lower quarter of body). */
  const minSigParagraphStart = (() => {
    const lo = docXml.toLowerCase();
    const si = lo.indexOf("sincerely");
    if (si !== -1) return si;
    const body = lo.indexOf("<w:body>");
    if (body === -1) return Math.floor(docXml.length * 0.22);
    return body + Math.floor((docXml.length - body) * 0.22);
  })();

  // ── 5b. Inject signature image ────────────────────────────────────────
  // 1) Manual/template merge turns {{candidate.signature}} into ESIGN markers — handle those
  //    FIRST so we only replace the marker run (keeps "Signature" labels / names on the same line).
  // 2) Then underscore-only templates with no merge tag (paragraph is *only* "Signature____" etc.).
  let sigResult = replaceSignatureMarkersInsideLastParagraph(
    docXml,
    MERGE_MARKERS_FOR_LAST_PARA,
    sigRunBlockInPlace,
    minSigParagraphStart,
  );
  if (sigResult.placed) {
    console.log("[esign-inject] Strategy A1 (merge marker inside last <w:p>, preserve sibling text): HIT");
  } else {
    sigResult = replaceLastParagraphContaining(
      docXml,
      MERGE_MARKERS_FOR_LAST_PARA,
      sigParagraph,
      minSigParagraphStart,
    );
    console.log(`[esign-inject] Strategy A2 (merge marker, whole paragraph): ${sigResult.placed ? "HIT" : "miss"}`);
  }
  docXml = sigResult.xml;

  if (!sigResult.placed) {
    // Whole-paragraph replace only when the line is essentially just "Signature" + underscores
    // (not "Name … Signature ___" on one line — that would drop the name).
    sigResult = replaceParagraphByContent(
      docXml,
      /^\s*Signature[\s:]*[\s_]*_{4,}\s*$/i,
      sigParagraph,
      {
        minParagraphStart: minSigParagraphStart,
      },
    );
    console.log(`[esign-inject] Strategy B (Signature___ line only): ${sigResult.placed ? "HIT" : "miss"}`);
    docXml = sigResult.xml;
  }

  if (!sigResult.placed) {
    sigResult = replaceParagraphByContent(docXml, /^[_\s]{10,}$/, sigParagraph, {
      minParagraphStart: minSigParagraphStart,
    });
    console.log(`[esign-inject] Strategy C (underscore-only line): ${sigResult.placed ? "HIT" : "miss"}`);
    docXml = sigResult.xml;
  }

  if (!sigResult.placed) {
    sigResult = replaceParagraphByContent(docXml, /_{5,}/, sigParagraph, {
      minParagraphStart: minSigParagraphStart,
    });
    console.log(`[esign-inject] Strategy D (last long underscore block): ${sigResult.placed ? "HIT" : "miss"}`);
    docXml = sigResult.xml;
  }

  // Last resort: append before </w:body>
  if (!sigResult.placed) {
    console.log("[esign-inject] No strategy matched — appending fallback block at end of body");
    const fallbackDate =
      `<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${xmlEscape(signedDate)}</w:t></w:r>`;
    const appendBlock =
      `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="AAAAAA"/></w:pBdr>` +
      `<w:spacing w:before="200"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">Electronically signed:</w:t></w:r></w:p>` +
      sigParagraph +
      `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${fallbackDate}</w:p>`;
    docXml = docXml.replace("</w:body>", `${appendBlock}</w:body>`);
  }

  docXml = stripOrphanSignatureMarkers(docXml, SIG_UNICODE);

  // ── 5c. Replace ESIGN_DATE in-place ───────────────────────────────────
  // Do NOT replace the whole paragraph — the date placeholder often lives in
  // the same paragraph as "Printed Name:" and other text. Replacing just the
  // marker preserves surrounding content.
  const escapedDate = xmlEscape(signedDate);
  docXml = docXml
    .split(DATE_UNICODE).join(escapedDate)
    .split("ESIGN_DATE").join(escapedDate);

  zip.file("word/document.xml", docXml);

  return zip.generate({ type: "nodebuffer" });
}
