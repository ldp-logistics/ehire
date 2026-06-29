/**
 * Single source of truth for candidate e-sign image size on DOCX → PDF path
 * (LibreOffice + `injectSignatureIntoDocx`) and HTML preview / legacy Puppeteer PDF.
 *
 * Kept **small** so inline drawings do not inflate line height or push manual letters to page 2.
 *
 * PDF AcroForm overlay uses `OFFER_ESIGN_PDF_SIGNATURE_PT` in `overlaySignatureOnPdf`.
 */
export const OFFER_ESIGN_DOCX_SIGNATURE_PX = {
  width: 80,
  height: 16,
} as const;

/** Last-page stamp on filled PDF forms (pdf-lib), in **points** (72 pt = 1 inch). */
export const OFFER_ESIGN_PDF_SIGNATURE_PT = {
  width: 108,
  height: 36,
} as const;
