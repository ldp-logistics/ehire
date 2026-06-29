import { OfferTemplateRepository, type OfferTemplateRow } from "./OfferTemplateRepository.js";
import { uploadFileToSharePoint, isSharePointAvatarConfigured, getAvatarContentBySharingUrl } from "../../lib/sharepoint.js";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import mammoth from "mammoth";
import { OFFER_ESIGN_DOCX_SIGNATURE_PX } from "../../../shared/offerSignatureLayout.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

/**
 * Maps common Word paragraph/character styles → HTML so Mammoth preserves structure closer to Word.
 * Without these, many templates collapse to plain &lt;p&gt; and lose headings/lists/quotes.
 */
const OFFER_DOCX_STYLE_MAP: string[] = [
  "p[style-name='Title'] => h1.title:fresh",
  "p[style-name='Subtitle'] => h2.subtitle:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='Heading 7'] => h6:fresh",
  "p[style-name='Heading 8'] => h6:fresh",
  "p[style-name='Heading 9'] => h6:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote.intense-quote:fresh",
  "p[style-name='List Paragraph'] => p.list-paragraph:fresh",
  "p[style-name='Caption'] => p.caption:fresh",
  "p[style-name='No Spacing'] => p.no-spacing:fresh",
  "p[style-name='Body Text'] => p.body-text:fresh",
  "p[style-name='Body Text 2'] => p.body-text-2:fresh",
  "p[style-name='Body Text 3'] => p.body-text-3:fresh",
  "r[style-name='Intense Emphasis'] => strong",
  "r[style-name='Strong'] => strong",
  "b => strong",
  "i => em",
  "u => u",
  // Preserve Word table structure explicitly (mammoth may otherwise skip borders/cells)
  "table => table",
  "tr => tr",
  "td => td",
  "th => th",
];

/** Injected as a <style> block when returning HTML for the browser signing preview. */
const OFFER_PREVIEW_CSS = `
  .offer-preview, .offer-preview * { box-sizing: border-box; }
  .offer-preview {
    font-family: Calibri, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #000;
  }
  .offer-preview p { margin: 6px 0; }
  .offer-preview strong { font-weight: bold; }
  .offer-preview em { font-style: italic; }
  .offer-preview h1 { font-size: 18pt; margin: 12px 0 6px; }
  .offer-preview h2 { font-size: 14pt; margin: 10px 0 5px; }
  .offer-preview h3 { font-size: 12pt; margin: 8px 0 4px; }
  .offer-preview h4, .offer-preview h5, .offer-preview h6 { font-size: 11pt; margin: 6px 0 3px; }
  .offer-preview ul, .offer-preview ol { margin: 0 0 8px 0; padding-left: 24px; }
  .offer-preview li { margin: 2px 0; }
  .offer-preview table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  .offer-preview td, .offer-preview th { border: 1px solid #000; padding: 6px 10px; vertical-align: top; }
  .offer-preview th { background: #f2f2f2; font-weight: bold; }
  .offer-preview blockquote { margin: 8px 0 8px 24px; padding-left: 12px; border-left: 3px solid #ccc; color: #333; }
  .offer-preview img { max-width: 100%; height: auto; }
`;

/** Word-style print CSS for Puppeteer PDF (Calibri stack matches default Word 2007+). */
const OFFER_PDF_PRINT_CSS = `
  @page { margin: 72px 72px 72px 72px; size: A4; }
  .offer-docx-root {
    font-family: Calibri, 'Calibri Light', 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.15;
    color: #000;
    word-wrap: break-word;
    /* Word tab stops / aligned runs collapse in HTML unless whitespace is preserved */
    white-space: pre-wrap;
    tab-size: 10;
    -moz-tab-size: 10;
  }
  .offer-docx-root h1.title { font-size: 28pt; font-weight: normal; margin: 0 0 12pt 0; line-height: 1.2; }
  .offer-docx-root h2.subtitle { font-size: 14pt; color: #404040; margin: 0 0 14pt 0; font-weight: normal; }
  .offer-docx-root h1 { font-size: 16pt; font-weight: bold; margin: 12pt 0 6pt 0; page-break-after: avoid; }
  .offer-docx-root h2 { font-size: 13pt; font-weight: bold; margin: 10pt 0 6pt 0; page-break-after: avoid; }
  .offer-docx-root h3 { font-size: 12pt; font-weight: bold; margin: 8pt 0 4pt 0; page-break-after: avoid; }
  .offer-docx-root h4 { font-size: 11pt; font-weight: bold; margin: 8pt 0 4pt 0; page-break-after: avoid; }
  .offer-docx-root h5, .offer-docx-root h6 { font-size: 11pt; font-weight: bold; margin: 6pt 0 3pt 0; page-break-after: avoid; }
  .offer-docx-root p { margin: 0 0 8pt 0; }
  .offer-docx-root p.no-spacing { margin: 0; }
  .offer-docx-root p.list-paragraph { margin: 0 0 4pt 0; }
  .offer-docx-root p.caption { font-size: 9pt; font-style: italic; color: #404040; margin: 6pt 0; }
  .offer-docx-root blockquote, .offer-docx-root blockquote.intense-quote {
    margin: 8pt 0 8pt 36pt;
    padding-left: 12pt;
    border-left: 3px solid #ccc;
    color: #333;
  }
  .offer-docx-root blockquote.intense-quote { border-left-color: #4472c4; color: #2e5090; }
  .offer-docx-root ul, .offer-docx-root ol { margin: 0 0 8pt 0; padding-left: 36pt; }
  .offer-docx-root li { margin: 0 0 4pt 0; }
  .offer-docx-root ul ul, .offer-docx-root ol ol, .offer-docx-root ul ol, .offer-docx-root ol ul { margin-top: 4pt; margin-bottom: 4pt; }
  .offer-docx-root table { border-collapse: collapse; width: 100%; margin: 8pt 0; page-break-inside: auto; }
  .offer-docx-root tr { page-break-inside: avoid; page-break-after: auto; }
  .offer-docx-root th, .offer-docx-root td {
    border: 1px solid #bfbfbf;
    padding: 4pt 8pt;
    vertical-align: top;
    font-size: 11pt;
  }
  .offer-docx-root th { background: #f2f2f2; font-weight: bold; }
  .offer-docx-root img { max-width: 100%; height: auto; }
  .offer-docx-root strong { font-weight: bold; }
  .offer-docx-root em { font-style: italic; }
`;

/** Unique markers injected into DOCX during merge — later replaced in HTML with actual content. */
const SIGNATURE_MARKER = "\u200B\u2063ESIGN_SIGNATURE\u2063\u200B";
const SIGNATURE_DATE_MARKER = "\u200B\u2063ESIGN_DATE\u2063\u200B";

/** All recognized signature placeholder names (template authors can use any of these). */
export const SIGNATURE_PLACEHOLDERS = [
  "candidate.signature", "signature", "applicant.signature", "esign.signature",
];
export const SIGNATURE_DATE_PLACEHOLDERS = [
  "signature.date", "signature_date", "esign.date", "signing_date",
];

/** Max decoded DOCX size for offer templates (upload + merge). */
const MAX_OFFER_TEMPLATE_DOCX_BYTES = 5 * 1024 * 1024;

function assertDocxBase64WithinLimit(docxBase64: string): void {
  const buf = Buffer.from(docxBase64, "base64");
  if (buf.length > MAX_OFFER_TEMPLATE_DOCX_BYTES) {
    throw Object.assign(
      new Error(`DOCX must be at most ${MAX_OFFER_TEMPLATE_DOCX_BYTES / (1024 * 1024)} MB`),
      { status: 400 },
    );
  }
}

export class OfferTemplateService {
  private repo = new OfferTemplateRepository();

  async list(includeInactive = false) {
    return this.repo.list(includeInactive);
  }

  async getById(id: string) {
    const row = await this.repo.getById(id);
    if (!row) throw Object.assign(new Error("Template not found"), { status: 404 });
    return row;
  }

  async create(d: {
    name: string;
    description?: string | null;
    docxBase64?: string;
    docxFilename?: string;
    pdfBase64?: string;
    pdfFilename?: string;
    createdBy: string | null;
  }) {
    if (!d.name?.trim()) throw Object.assign(new Error("Name is required"), { status: 400 });
    const hasDocx = !!d.docxBase64?.length;
    const hasPdf = !!d.pdfBase64?.length;
    if (!hasDocx && !hasPdf) {
      throw Object.assign(new Error("Either a DOCX or a PDF form template file is required"), { status: 400 });
    }
    if (hasDocx && hasPdf) {
      throw Object.assign(new Error("Provide either DOCX or PDF in one step — not both"), { status: 400 });
    }

    if (hasPdf) {
      const MAX_PDF_BYTES = 10 * 1024 * 1024;
      const buf = Buffer.from(d.pdfBase64!, "base64");
      if (buf.length > MAX_PDF_BYTES) {
        throw Object.assign(new Error("PDF must be at most 10 MB"), { status: 400 });
      }
      if (buf.slice(0, 4).toString("ascii") !== "%PDF") {
        throw Object.assign(new Error("Uploaded file is not a valid PDF"), { status: 400 });
      }
      const { inspectPdfFormFields } = await import("./pdfFormService.js");
      const placeholders = await inspectPdfFormFields(buf);
      const safeName = (d.pdfFilename || "template.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
      const pdfUrl = await this.promoteToSharePoint(d.pdfBase64!, safeName, "Recruitment/OfferTemplates", PDF_MIME);
      return this.repo.create({
        name: d.name.trim(),
        description: d.description?.trim() || null,
        docxData: null,
        docxFilename: "(PDF form)",
        placeholders,
        createdBy: d.createdBy,
        templateType: "pdf_form",
        pdfTemplateUrl: pdfUrl,
      });
    }

    assertDocxBase64WithinLimit(d.docxBase64!);
    const docxBuf = Buffer.from(d.docxBase64!, "base64");
    const looksZip = docxBuf.length >= 2 && docxBuf[0] === 0x50 && docxBuf[1] === 0x4b; // PK — Office Open XML
    if (!looksZip) {
      throw Object.assign(new Error("Uploaded file is not a valid .docx (must be a ZIP / Office Open XML document)."), {
        status: 400,
      });
    }
    const placeholders = this.extractPlaceholders(d.docxBase64!);
    const docxData = await this.promoteToSharePoint(
      d.docxBase64!,
      d.docxFilename || "template.docx",
      "Recruitment/OfferTemplates",
    );
    return this.repo.create({
      name: d.name.trim(),
      description: d.description?.trim() || null,
      docxData,
      docxFilename: d.docxFilename || "template.docx",
      placeholders,
      createdBy: d.createdBy,
    });
  }

  async update(id: string, d: { name?: string; description?: string | null; docxBase64?: string; docxFilename?: string; isActive?: boolean }) {
    let placeholders: string[] | undefined;
    let docxData: string | undefined;
    if (d.docxBase64) {
      assertDocxBase64WithinLimit(d.docxBase64);
      const ubuf = Buffer.from(d.docxBase64, "base64");
      if (!(ubuf.length >= 2 && ubuf[0] === 0x50 && ubuf[1] === 0x4b)) {
        throw Object.assign(new Error("Uploaded file is not a valid .docx (Office Open XML)."), { status: 400 });
      }
      placeholders = this.extractPlaceholders(d.docxBase64);
      docxData = await this.promoteToSharePoint(d.docxBase64, d.docxFilename || "template.docx", "Recruitment/OfferTemplates");
    }
    const result = await this.repo.update(id, {
      name: d.name?.trim(),
      description: d.description !== undefined ? (d.description?.trim() || null) : undefined,
      docxData,
      docxFilename: d.docxFilename,
      placeholders,
      isActive: d.isActive,
    });
    if (!result) throw Object.assign(new Error("Template not found"), { status: 404 });
    return result;
  }

  async delete(id: string) {
    const ok = await this.repo.delete(id);
    if (!ok) throw Object.assign(new Error("Template not found"), { status: 404 });
  }

  /**
   * Store an AcroForm PDF as the PDF template for an existing offer template record.
   * Sets template_type = 'pdf_form' and saves the URL/base64.
   */
  async storePdfTemplate(id: string, pdfBase64: string, pdfFilename: string) {
    const existing = await this.getById(id); // throws 404 if not found
    const MAX_PDF_BYTES = 10 * 1024 * 1024;
    const buf = Buffer.from(pdfBase64, "base64");
    if (buf.length > MAX_PDF_BYTES) {
      throw Object.assign(new Error("PDF must be at most 10 MB"), { status: 400 });
    }
    const safeName = pdfFilename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    if (safeName.toLowerCase().endsWith(".docx")) {
      throw Object.assign(new Error("This endpoint accepts PDF form templates only — upload the .docx via template create/update instead."), {
        status: 400,
      });
    }
    const pdfUrl = await this.promoteToSharePoint(pdfBase64, safeName, "Recruitment/OfferTemplates", PDF_MIME);
    const result = await this.repo.setPdfTemplate(id, pdfUrl);
    if (!result) throw Object.assign(new Error("Template not found"), { status: 404 });
    console.log("[offer-templates] PDF form template stored for template %s (%d bytes)", existing.id, buf.length);
    return result;
  }

  /**
   * Upload merged offer artifact (DOCX or PDF) under Recruitment/OfferLettersMerged.
   * Uses correct MIME/filename so SharePoint serves bytes the browser can open.
   */
  async uploadMergedOfferArtifact(base64: string, offerId: string): Promise<string> {
    const buf = Buffer.from(base64, "base64");
    const isPdf = buf.length >= 4 && buf.slice(0, 4).toString("ascii") === "%PDF";
    const fileName = isPdf ? `offer-${offerId}-merged.pdf` : `offer-${offerId}-merged.docx`;
    const mime = isPdf ? "application/pdf" : DOCX_MIME;
    return this.promoteToSharePoint(base64, fileName, "Recruitment/OfferLettersMerged", mime);
  }

  /** @deprecated Use uploadMergedOfferArtifact — kept for callers that only merge DOCX. */
  async uploadMergedDocx(base64: string, offerId: string): Promise<string> {
    return this.uploadMergedOfferArtifact(base64, offerId);
  }

  /**
   * Resolve template DOCX content to a Buffer.
   * If docx_data is a SharePoint URL → download it; if base64 → decode it.
   */
  async resolveDocxBuffer(docxData: string): Promise<Buffer> {
    if (docxData.startsWith("http://") || docxData.startsWith("https://")) {
      const result = await getAvatarContentBySharingUrl(docxData);
      if (result) return result.buffer;
      const res = await fetch(docxData);
      if (!res.ok) throw new Error("Failed to download template from SharePoint");
      return Buffer.from(await res.arrayBuffer());
    }
    return Buffer.from(docxData, "base64");
  }

  /**
   * Try to upload base64 content to SharePoint. Returns SharePoint URL on success,
   * or falls back to the raw base64 string (stored in DB) if not configured.
   */
  private async promoteToSharePoint(
    base64: string,
    fileName: string,
    subfolder: string,
    mimeType: string = DOCX_MIME,
  ): Promise<string> {
    if (!isSharePointAvatarConfigured()) return base64;
    try {
      const buf = Buffer.from(base64, "base64");
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
      const url = await uploadFileToSharePoint(subfolder, safeName, buf, mimeType);
      if (url) return url;
    } catch (e) {
      console.warn("[offer-templates] SharePoint upload failed, falling back to base64:", (e as Error)?.message);
    }
    return base64;
  }

  /** Merge variables into a DOCX template, return base64 of merged DOCX. */
  mergeTemplateFromBuffer(buf: Buffer, variables: Record<string, unknown>): string {
    const zip = new PizZip(buf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      /** Manual HR docs may include optional tags not in merge data — avoid hard fail. */
      nullGetter() {
        return "";
      },
    });

    const flat = this.flattenVariables(variables);
    const hasSigMarker = SIGNATURE_PLACEHOLDERS.some((key) => {
      const v = flat[key];
      return (
        typeof v === "string" &&
        v !== "" &&
        (v.includes("\u2063ESIGN_SIGNATURE") || v.includes("ESIGN_SIGNATURE"))
      );
    });
    if (!hasSigMarker) {
      for (const key of SIGNATURE_PLACEHOLDERS) {
        flat[key] = "";
      }
    }
    const sigDateVal = flat["candidate.signature_date"];
    const hasDateMarker =
      typeof sigDateVal === "string" &&
      sigDateVal !== "" &&
      (sigDateVal.includes("\u2063ESIGN_DATE") || sigDateVal.includes("ESIGN_DATE"));
    if (!hasDateMarker) {
      flat["candidate.signature_date"] = "";
    }
    doc.render(flat);

    const out = doc.getZip().generate({ type: "nodebuffer" });
    return out.toString("base64");
  }

  /** Merge variables into a DOCX template (base64 or SharePoint URL), return base64 of merged DOCX. */
  async mergeTemplate(docxData: string | null, variables: Record<string, unknown>): Promise<string> {
    if (docxData == null || docxData === "") {
      throw Object.assign(new Error("This template has no Word document to merge"), { status: 400 });
    }
    const buf = await this.resolveDocxBuffer(docxData);
    return this.mergeTemplateFromBuffer(buf, variables);
  }

  /**
   * HR preview for pdf_form templates: fill the AcroForm with sample/merge variables and embed in HTML.
   */
  async previewPdfFormFilledHtml(template: OfferTemplateRow, variables: Record<string, unknown>): Promise<string> {
    if (!template.pdf_template_url) {
      throw Object.assign(new Error("No PDF template attached"), { status: 400 });
    }
    const { buildOfferMergeStringsFromDetails } = await import("../../../shared/offerMergeFields.js");
    const { fillOfferPdfTemplate } = await import("./pdfFormService.js");
    const templateBuf = await this.resolveDocxBuffer(template.pdf_template_url);
    const fieldValues = buildOfferMergeStringsFromDetails(variables as Record<string, unknown>) as Record<string, string>;
    const filled = await fillOfferPdfTemplate(templateBuf, fieldValues);
    const b64 = filled.toString("base64");
    return (
      `<div class="pdf-form-preview" style="min-height:420px;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;background:#f8f8f8">` +
      `<iframe title="PDF preview" src="data:application/pdf;base64,${b64}" width="100%" height="520" style="border:0;display:block"/>` +
      `</div>`
    );
  }

  /** Convert DOCX (base64 or URL) → raw HTML fragment (no wrapping styles). */
  async docxToHtml(docxData: string): Promise<string> {
    const buf = await this.resolveDocxBuffer(docxData);
    const result = await mammoth.convertToHtml({
      buffer: buf,
      ignoreEmptyParagraphs: false,
      convertImage: mammoth.images.imgElement((image: any) =>
        image.read("base64").then((imageBase64: string) => ({
          src: `data:${image.contentType};base64,${imageBase64}`,
        })),
      ),
      styleMap: OFFER_DOCX_STYLE_MAP,
    } as any);
    return result.value;
  }

  /**
   * Returns a browser-ready HTML string for the candidate-facing signing page.
   * Primary: LibreOffice HTML (faithful Word layout + inlined images).
   * Fallback: mammoth + OFFER_PREVIEW_CSS.
   */
  async docxToPreviewHtml(docxData: string): Promise<string> {
    try {
      const { convertDocxToHtml } = await import("./pdfHelpers.js");
      const docxBuffer = await this.resolveDocxBuffer(docxData);
      return await convertDocxToHtml(docxBuffer);
    } catch (e) {
      console.warn("[offer-html] LibreOffice HTML failed, falling back to mammoth:", (e as Error)?.message);
      const html = await this.docxToHtml(docxData);
      return `<style>${OFFER_PREVIEW_CSS}</style><div class="offer-preview">${html}</div>`;
    }
  }

  /**
   * Convert DOCX buffer → PDF buffer via Puppeteer (Chrome headless).
   * Renders the DOCX as HTML then prints to PDF for high-fidelity output.
   */
  async docxToPdf(docxData: string): Promise<Buffer> {
    const html = await this.docxToHtml(docxData);
    return this.htmlToPdf(html);
  }

  /**
   * PDF for candidate preview / email: handles both pdf_form and docx templates.
   *
   * pdf_form: the filled PDF is returned directly (already has form values).
   * docx:     LibreOffice converts the DOCX, with ESIGN markers stripped to
   *           render clean underscore lines. Falls back to mammoth+Puppeteer.
   */
  async docxToUnsignedOfferPdf(docxData: string): Promise<Buffer> {
    // ── PDF Form: return the already-filled PDF directly ────────────────────
    try {
      const docxBuffer = await this.resolveDocxBuffer(docxData);
      const { bufferIsPdf } = await import("./pdfFormService.js");
      if (bufferIsPdf(docxBuffer)) {
        console.log("[offer-pdf] Unsigned PDF form preview (%d bytes)", docxBuffer.length);
        return docxBuffer;
      }
    } catch {
      // not a PDF or resolve failed — fall through to DOCX path
    }

    // ── DOCX path ────────────────────────────────────────────────────────────
    try {
      const { convertDocxToPdf } = await import("./pdfHelpers.js");
      const docxBuffer = await this.resolveDocxBuffer(docxData);

      // Strip ESIGN markers from the DOCX XML before conversion so they
      // render as clean underscore lines (same visual as the original template).
      const zip = await import("pizzip").then((m) => new m.default(docxBuffer));
      let docXml = zip.file("word/document.xml")?.asText() ?? "";
      docXml = docXml
        .split(SIGNATURE_MARKER).join("_".repeat(28))
        .split(SIGNATURE_DATE_MARKER).join("_".repeat(16))
        .split("ESIGN_SIGNATURE").join("_".repeat(28))
        .split("ESIGN_DATE").join("_".repeat(16));
      zip.file("word/document.xml", docXml);
      const cleanDocx = zip.generate({ type: "nodebuffer" });
      const pdf = await convertDocxToPdf(cleanDocx);
      console.log("[offer-pdf] Unsigned offer PDF via LibreOffice (%d bytes)", pdf.length);
      return pdf;
    } catch (e) {
      console.warn("[offer-pdf] LibreOffice unsigned PDF failed, falling back to Puppeteer:", (e as Error)?.message);
      let html = await this.docxToHtml(docxData);
      html = html.replaceAll(SIGNATURE_MARKER, "_".repeat(28));
      html = html.replaceAll(SIGNATURE_DATE_MARKER, "_".repeat(16));
      return this.htmlToPdf(html);
    }
  }

  /** Render HTML string to a PDF buffer via Puppeteer. */
  async htmlToPdf(html: string): Promise<Buffer> {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      const wrappedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${OFFER_PDF_PRINT_CSS}</style></head><body><div class="offer-docx-root">${html}</div></body></html>`;
      await page.setContent(wrappedHtml, { waitUntil: "networkidle0" });
      const pdfBuf = await page.pdf({ format: "A4", printBackground: true });
      return Buffer.from(pdfBuf);
    } finally {
      await browser.close();
    }
  }

  /**
   * Convert DOCX to HTML and substitute signature markers/placeholders with a preview box.
   * Used for the HR/admin offer-template preview page.
   *
   * Primary: LibreOffice HTML export (faithful Word layout).
   * Fallback: mammoth + OFFER_PREVIEW_CSS.
   */
  async docxToHtmlWithSignaturePreview(docxData: string): Promise<string> {
    const signatureBox =
      `<span data-sig-placeholder style="display:inline-block;min-width:${OFFER_ESIGN_DOCX_SIGNATURE_PX.width}px;min-height:${OFFER_ESIGN_DOCX_SIGNATURE_PX.height}px;` +
      `border-bottom:2px solid #555;vertical-align:bottom;padding:4px 8px;` +
      `color:#999;font-style:italic;font-size:11px;background:#fafafa;">[Sign here]</span>`;
    const datePlaceholder =
      `<span style="display:inline-block;min-width:120px;border-bottom:2px solid #555;` +
      `vertical-align:bottom;padding:4px 8px;color:#999;font-style:italic;font-size:11px;">[Date]</span>`;

    const replaceSigMarkers = (html: string) =>
      html
        .replaceAll(SIGNATURE_MARKER, signatureBox)
        .replaceAll(SIGNATURE_DATE_MARKER, datePlaceholder)
        .replace(/ESIGN_SIGNATURE/g, signatureBox)
        .replace(/ESIGN_DATE/g, datePlaceholder)
        .replace(/(Signature\s*_{3,})/gi, signatureBox);

    try {
      const { convertDocxToHtml } = await import("./pdfHelpers.js");
      const docxBuffer = await this.resolveDocxBuffer(docxData);
      const loHtml = await convertDocxToHtml(docxBuffer);
      return replaceSigMarkers(loHtml);
    } catch (e) {
      console.warn("[offer-html] LibreOffice HTML failed, falling back to mammoth:", (e as Error)?.message);
      const html = await this.docxToHtml(docxData);
      return `<style>${OFFER_PREVIEW_CSS}</style><div class="offer-preview">${replaceSigMarkers(html)}</div>`;
    }
  }

  /**
   * Generate a signed PDF.
   *
   * Primary path  → LibreOffice (soffice --headless) converts the DOCX to a
   *   faithful PDF, then pdf-lib overlays the signature image + label.
   *   Result: pixel-perfect Word layout with the e-signature stamped on the
   *   last page.
   *
   * Fallback path → original Puppeteer pipeline (mammoth HTML + signature
   *   injection) used when LibreOffice is unavailable or throws.
   *
   * The function signature is intentionally kept backward-compatible so no
   * callers need to change.
   */
  async generateSignedPdf(
    mergedDocxData: string,
    signatureDataUrl: string,
    signerName = "",
    signedDate?: string,
  ): Promise<Buffer> {
    const today = new Date().toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
    const dateStr = signedDate ?? today;

    // ── PDF Form path: merged_document_url contains a filled AcroForm PDF ───
    // Detected by the %PDF magic bytes after resolving the URL / base64.
    try {
      const docxBuffer = await this.resolveDocxBuffer(mergedDocxData);
      const { bufferIsPdf, overlaySignatureOnPdf } = await import("./pdfFormService.js");
      if (bufferIsPdf(docxBuffer)) {
        console.log("[offer-pdf] Detected filled PDF form — using pdf-lib signature overlay");
        const signed = await overlaySignatureOnPdf(docxBuffer, signatureDataUrl, signerName, dateStr);
        console.log("[offer-pdf] Signed PDF via pdf-lib form overlay (%d bytes)", signed.length);
        return signed;
      }
    } catch (e) {
      console.warn("[offer-pdf] PDF form detection/overlay failed:", (e as Error)?.message);
      // fall through to DOCX pipeline
    }

    // ── DOCX path: merged buffer → inject signature into merged DOCX → PDF ───
    // mergedDocxData must already be the post–docxtemplater merge from mergeOfferTemplate,
    // not the raw template.
    try {
      const { injectSignatureIntoDocx, convertDocxToPdf } = await import("./pdfHelpers.js");
      const docxBuffer = await this.resolveDocxBuffer(mergedDocxData);
      if (process.env.OFFER_DEBUG_MERGE === "1" || process.env.OFFER_DEBUG_MERGE === "true") {
        console.log("[ESigns] merged document buffer bytes:", docxBuffer.length);
        try {
          const zip = new PizZip(docxBuffer);
          const xml = zip.file("word/document.xml")?.asText() ?? "";
          const unresolved = (xml.match(/\{\{[^}]+\}\}/g) ?? []).slice(0, 20);
          if (unresolved.length) {
            console.warn("[ESigns] merged DOCX still contains placeholders (merge may have been skipped):", unresolved);
          }
        } catch {
          /* not a zip — not a normal merged DOCX */
        }
      }
      const patchedDocx = await injectSignatureIntoDocx(docxBuffer, signatureDataUrl, signerName, dateStr);
      const pdf = await convertDocxToPdf(patchedDocx);
      console.log("[offer-pdf] Signed PDF via LibreOffice + DOCX injection (%d bytes)", pdf.length);
      return pdf;
    } catch (e) {
      console.warn(
        "[offer-pdf] LibreOffice pipeline failed, falling back to Puppeteer:",
        (e as Error)?.message,
      );
      return this._generateSignedPdfLegacy(mergedDocxData, signatureDataUrl);
    }
  }

  /**
   * Legacy Puppeteer-based signed PDF (mammoth HTML → signature injection → headless print).
   * Kept as the fallback when LibreOffice is not available.
   */
  private async _generateSignedPdfLegacy(
    mergedDocxData: string,
    signatureDataUrl: string,
  ): Promise<Buffer> {
    let html = await this.docxToHtml(mergedDocxData);

    const today = new Date().toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });

    if (signatureDataUrl) {
      const sigImgHtml =
        `<img src="${signatureDataUrl}" style="height:${OFFER_ESIGN_DOCX_SIGNATURE_PX.height}px;` +
        `max-width:${OFFER_ESIGN_DOCX_SIGNATURE_PX.width}px;display:inline-block;vertical-align:bottom;margin:0;" alt="Signature" />`;

      let placed = false;

      // Prefer explicit "Signature___" line (usually candidate column) before merge markers,
      // so HTML preview matches DOCX inject order and avoids stacking under HR's block.
      const sigLineMatches = Array.from(html.matchAll(/Signature\s*_{3,}/gi));
      if (sigLineMatches.length > 0) {
        const last = sigLineMatches[sigLineMatches.length - 1];
        if (last.index !== undefined) {
          html =
            html.slice(0, last.index) + sigImgHtml + html.slice(last.index + last[0].length);
          placed = true;
        }
      }

      if (!placed && html.includes(SIGNATURE_MARKER)) {
        const lastIdx = html.lastIndexOf(SIGNATURE_MARKER);
        if (lastIdx !== -1) {
          html =
            html.slice(0, lastIdx) +
            sigImgHtml +
            html.slice(lastIdx + SIGNATURE_MARKER.length);
          placed = true;
        }
      }

      // Last long underscore block in the document
      if (!placed) {
        const rx = /(?<![a-zA-Z0-9])_{5,}(?![a-zA-Z0-9])/g;
        const matches: RegExpExecArray[] = [];
        let m: RegExpExecArray | null;
        while ((m = rx.exec(html)) !== null) matches.push(m);
        if (matches.length > 0) {
          const last = matches[matches.length - 1];
          html = html.slice(0, last.index) + sigImgHtml + html.slice(last.index + last[0].length);
          placed = true;
        }
      }

      html = html.replaceAll(SIGNATURE_MARKER, "");

      if (!placed) {
        html += `<div style="margin-top:24px;border-top:1px solid #ddd;padding-top:12px;">`
          + `<p style="font-size:10px;color:#888;margin:0 0 4px;">Electronically signed on ${today}</p>`
          + sigImgHtml
          + `</div>`;
      }
    }

    html = html.replaceAll(SIGNATURE_DATE_MARKER, today);

    return this.htmlToPdf(html);
  }

  /** Extract {{placeholder}} tags from a DOCX file (base64). */
  extractPlaceholders(docxBase64: string): string[] {
    try {
      const buf = Buffer.from(docxBase64, "base64");
      const zip = new PizZip(buf);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
      });
      const text = doc.getFullText();
      const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
      const unique = Array.from(new Set(matches.map((m) => m.replace(/^\{\{|\}\}$/g, "").trim())));
      return unique;
    } catch {
      return [];
    }
  }

  /** Flatten nested object: { offer: { salary: 100 } } → { "offer.salary": 100 } */
  private flattenVariables(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === "object" && !Array.isArray(val)) {
        Object.assign(result, this.flattenVariables(val as Record<string, unknown>, path));
      } else {
        result[path] = val ?? "";
      }
    }
    return result;
  }
}
