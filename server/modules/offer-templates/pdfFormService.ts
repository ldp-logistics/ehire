/**
 * PDF Form (AcroForm) based offer-letter pipeline.
 *
 * New path:  PDF template (with AcroForm fields)
 *              → fillOfferPdfTemplate   (pdf-lib fills text fields)
 *              → candidate preview (filled PDF, form not yet flattened)
 *              → overlaySignatureOnPdf  (flatten + stamp e-signature)
 *              → Final signed PDF
 *
 * The legacy DOCX / mammoth / LibreOffice pipeline is unchanged and still
 * used for templates with template_type = 'docx'.
 *
 * All PDF operations use pdf-lib only — no Puppeteer or LibreOffice in this path.
 */

import { PDFDocument, PDFTextField, StandardFonts, rgb } from "pdf-lib";
import {
  buildOfferMergeStringsFromDetails,
  OFFER_MERGE_TEXT_FIELD_KEYS,
  type OfferMergeTextFieldKey,
} from "../../../shared/offerMergeFields.js";
import { OFFER_ESIGN_PDF_SIGNATURE_PT } from "../../../shared/offerSignatureLayout.js";

/** Same field names as DOCX merge placeholders (without `{{` `}}`). PDF AcroForm names must match exactly. */
export const OFFER_PDF_FIELD_NAMES = OFFER_MERGE_TEXT_FIELD_KEYS;

export type OfferPdfFieldName = OfferMergeTextFieldKey;

/**
 * Map offer + candidate rows to the same strings as `buildOfferVariables` / DOCX merge.
 */
export function buildPdfFieldValues(
  offer: Record<string, unknown>,
  candidate?: Record<string, unknown>,
): Record<string, string> {
  const merged = { ...offer, ...candidate };
  return buildOfferMergeStringsFromDetails(merged) as Record<string, string>;
}

/**
 * Map an AcroForm field name (as authored in the PDF) to the merge string from {@link buildOfferMergeStringsFromDetails}.
 * Handles common mismatches: spaces vs dots, `{{…}}` wrappers, case differences.
 */
export function resolveMergeStringForPdfFieldName(
  rawFieldName: string,
  values: Record<string, string>,
): string {
  const stripBraces = (s: string) =>
    s
      .trim()
      .replace(/^\{\{\s*/, "")
      .replace(/\s*\}\}$/, "")
      .replace(/\{\{|\}\}/g, "")
      .trim();

  const a = rawFieldName.trim();
  const b = stripBraces(a);
  for (const c of [a, b]) {
    if (Object.prototype.hasOwnProperty.call(values, c)) return values[c] ?? "";
  }

  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();

  for (const key of OFFER_MERGE_TEXT_FIELD_KEYS) {
    if (key === a || key === b) return values[key] ?? "";
    const kl = key.toLowerCase();
    if (kl === lowerA || kl === lowerB) return values[key] ?? "";
    const spaced = key.replace(/\./g, " ");
    if (spaced.toLowerCase() === lowerB || spaced.toLowerCase() === lowerA) return values[key] ?? "";
    const underscored = key.replace(/\./g, "_");
    if (underscored.toLowerCase() === lowerB || underscored.toLowerCase() === lowerA) return values[key] ?? "";
  }

  const dotted = lowerB.replace(/\s+/g, ".").replace(/_+/g, ".");
  if (Object.prototype.hasOwnProperty.call(values, dotted)) return values[dotted] ?? "";

  return "";
}

// ---------------------------------------------------------------------------
// PDF form fill (TASK 4)
// ---------------------------------------------------------------------------

/**
 * Fill AcroForm text fields in a PDF template with the provided values.
 *
 * Walks **fields present in the PDF** (not only canonical keys) so names like
 * "Applicant Name" still map to data when they match {@link resolveMergeStringForPdfFieldName}.
 *
 * - Non–text fields are left unchanged.
 * - After AcroForm fill, literal `{{merge.key}}` text (Word → PDF) is replaced by drawing over it
 *   (see {@link replaceBracePlaceholdersInPdfBuffer}).
 * - Form is NOT flattened so the candidate can still read a clean preview.
 */
export async function fillOfferPdfTemplate(
  pdfTemplateBuffer: Buffer,
  fieldValues: Record<string, string>,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfTemplateBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  if (form.hasXFA()) {
    console.warn(
      "[pdf-form] This PDF uses XFA forms. pdf-lib cannot reliably edit those; " +
        "export from Acrobat as **standard AcroForm** text fields (Tools → Prepare Form), or use Adobe/LibreOffice to rebuild.",
    );
    try {
      form.deleteXFA();
    } catch {
      /* ignore */
    }
  }

  const fields = form.getFields();
  const pdfFieldNames = fields.map((f) => f.getName());
  let textFilled = 0;
  let textSkipped = 0;

  for (const field of fields) {
    if (!(field instanceof PDFTextField)) {
      textSkipped++;
      continue;
    }
    const name = field.getName();
    const value = resolveMergeStringForPdfFieldName(name, fieldValues);
    try {
      field.setText(value);
      textFilled++;
    } catch (e) {
      console.warn(`[pdf-form] could not set text field "${name}":`, (e as Error)?.message);
    }
  }

  if (pdfFieldNames.length === 0) {
    console.warn(
      "[pdf-form] No AcroForm fields in this PDF. Typed {{…}} text from Word cannot be merged reliably — " +
        "use a .docx offer template, or add Text Field widgets in Acrobat / PDF24.",
    );
  } else {
    console.log(
      `[pdf-form] Filled ${textFilled} text field(s); ${fields.length - textFilled} non-text / skipped; raw names: ${pdfFieldNames.join(", ")}`,
    );
  }

  const bytes = await pdfDoc.save();
  let buf = Buffer.from(bytes);
  const hasNoAcroFields = pdfFieldNames.length === 0;
  const shouldReplaceLiteralBraces =
    hasNoAcroFields ||
    process.env.OFFER_PDF_REPLACE_LITERAL_BRACES === "true" ||
    process.env.OFFER_PDF_REPLACE_LITERAL_BRACES === "1";

  if (shouldReplaceLiteralBraces) {
    const { replaceBracePlaceholdersInPdfBuffer } = await import("./pdfDocxStylePlaceholders.js");
    buf = Buffer.from(await replaceBracePlaceholdersInPdfBuffer(buf, fieldValues));
    const reason = hasNoAcroFields ? "no AcroForm fields" : "env flag set";
    console.log(`[pdf-form] Ran literal brace replacement (${reason})`);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Signature overlay (TASK 5)
// ---------------------------------------------------------------------------

// Dynamically find "Signature" line Y using pdfjs-dist
async function findSignatureLineY(buf: Buffer, pageIndex: number): Promise<number | null> {
  try {
    const { getDocument } = await import("pdfjs-dist");
    const task = getDocument({ data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false });
    const doc = await task.promise;
    if (pageIndex >= doc.numPages) return null;
    const page = await doc.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const t = item as any;
      if (typeof t.str === "string" && /signature/i.test(t.str)) {
        return t.transform[5];
      }
    }
  } catch { /* fallback below */ }
  return null;
}

/**
 * Flatten all AcroForm fields (locks in filled values) and stamp the
 * candidate's drawn e-signature + date on the last page (no printed name).
 *
 * Layout (last page): signature block at ~35% of page height from bottom,
 * image size from `OFFER_ESIGN_PDF_SIGNATURE_PT`, date below the image.
 *
 * @param pdfBuffer      Buffer of the filled (unflatted) PDF
 * @param signatureDataUrl  base64 PNG data URL from the canvas signature pad
 * @param _signerName    unused (kept for call-site compatibility)
 * @param signedDate     date string, e.g. "13 April 2026"
 */
export async function overlaySignatureOnPdf(
  pdfBuffer: Buffer,
  signatureDataUrl: string,
  _signerName: string,
  signedDate: string,
): Promise<Buffer> {
  void _signerName;
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });

  // 1. Flatten form fields — locks filled values into static content
  const form = pdfDoc.getForm();
  try { form.flatten(); } catch { /* no form fields is fine */ }

  // 2. Decode signature PNG
  const base64Data = signatureDataUrl.replace(/^data:image\/[^;]+;base64,/, "");
  const sigBytes   = Uint8Array.from(Buffer.from(base64Data, "base64"));

  let sigImage;
  if (signatureDataUrl.startsWith("data:image/png")) {
    sigImage = await pdfDoc.embedPng(sigBytes);
  } else {
    sigImage = await pdfDoc.embedJpg(sigBytes);
  }

  // 3. Embed on last page
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageH = lastPage.getHeight();
  const sigLineY = await findSignatureLineY(pdfBuffer, pages.length - 1);
  const sigY = sigLineY != null ? sigLineY + 5 : pageH * 0.35;
  const sigX = 120;
  const sigW = OFFER_ESIGN_PDF_SIGNATURE_PT.width;
  const sigH = OFFER_ESIGN_PDF_SIGNATURE_PT.height;

  // Opaque white pad so transparent / legacy PNGs do not show form tint behind the stamp
  lastPage.drawRectangle({
    x: sigX,
    y: sigY,
    width: sigW,
    height: sigH,
    color: rgb(1, 1, 1),
  });
  lastPage.drawImage(sigImage, {
    x: sigX, y: sigY, width: sigW, height: sigH,
  });

  if (signedDate) {
    lastPage.drawText(signedDate, {
      x: sigX,
      y: sigY - 14,
      size: 9,
      font: fontItalic,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Utility: detect whether a buffer (or base64/URL resolved buffer) is a PDF
// ---------------------------------------------------------------------------

/** Returns true if the buffer starts with the PDF magic bytes `%PDF`. */
export function bufferIsPdf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).toString("ascii") === "%PDF";
}

/**
 * Inspect a PDF template (buffer) and return the list of AcroForm field names.
 * Used by the upload endpoint to return field names to the HR user.
 */
export async function inspectPdfFormFields(pdfBuffer: Buffer): Promise<string[]> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const form   = pdfDoc.getForm();
  return form.getFields().map((f) => f.getName());
}
