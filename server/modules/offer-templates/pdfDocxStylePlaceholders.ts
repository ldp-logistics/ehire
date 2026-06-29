/**
 * Replace literal `{{merge.key}}` strings drawn on the page (Word → PDF export).
 *
 * **Disabled by default** — white-box + Helvetica overlay rarely matches Word’s fonts/spacing
 * and often ruins layout. Only runs when `OFFER_PDF_REPLACE_LITERAL_BRACES=true`.
 *
 * Prefer: **DOCX offer templates** (native merge) or **AcroForm text fields** with canonical names.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist";

const BRACE_PLACEHOLDER = /\{\{([^{}]+)\}\}/g;

type PdfJsTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

function isTextItem(it: unknown): it is PdfJsTextItem {
  return (
    typeof it === "object" &&
    it !== null &&
    "str" in it &&
    typeof (it as PdfJsTextItem).str === "string" &&
    Array.isArray((it as PdfJsTextItem).transform) &&
    typeof (it as PdfJsTextItem).width === "number"
  );
}

/** Group text items into rough lines (same baseline) for Word-style runs. */
function clusterItemsIntoLines(items: PdfJsTextItem[]): PdfJsTextItem[][] {
  if (items.length === 0) return [];
  const buckets = new Map<number, PdfJsTextItem[]>();
  for (const it of items) {
    const yKey = Math.round(it.transform[5] / 4);
    if (!buckets.has(yKey)) buckets.set(yKey, []);
    buckets.get(yKey)!.push(it);
  }
  const lines = Array.from(buckets.values());
  for (const line of lines) {
    line.sort((a: PdfJsTextItem, b: PdfJsTextItem) => a.transform[4] - b.transform[4]);
  }
  return lines;
}

/**
 * Map a [start, end) character range in the concatenated line string to PDF user-space
 * geometry for covering the placeholder with a rectangle.
 */
function mapCharRangeToBox(
  line: PdfJsTextItem[],
  start: number,
  end: number,
): { x0: number; x1: number; baselineY: number; fontSize: number } | null {
  if (start < 0 || end <= start || !line.length) return null;
  let offset = 0;
  for (const it of line) {
    const len = it.str.length;
    const segEnd = offset + len;
    if (start < segEnd && end > offset) {
      const localStart = Math.max(0, start - offset);
      const localEnd = Math.min(len, end - offset);
      const t = it.transform;
      const xLeft = t[4] + (localStart / Math.max(len, 1)) * it.width;
      const xRight = t[4] + (localEnd / Math.max(len, 1)) * it.width;
      const fontSize = Math.max(Math.abs(t[3]) || 0, Math.abs(t[0]) || 0, it.height || 0, 8);
      return {
        x0: Math.min(xLeft, xRight),
        x1: Math.max(xLeft, xRight),
        baselineY: t[5],
        fontSize: Math.min(fontSize, 24),
      };
    }
    offset = segEnd;
  }
  return null;
}

/**
 * Walks each page, finds `{{key}}` in line-concatenated text, draws white cover + replacement.
 */
export async function replaceBracePlaceholdersInPdfBuffer(
  pdfBuffer: Buffer,
  flatValues: Record<string, string>,
): Promise<Buffer> {
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace: true,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdfJsDoc = await loadingTask.promise;

  type Op = {
    pageIndex: number;
    x0: number;
    x1: number;
    baselineY: number;
    fontSize: number;
    text: string;
  };
  const ops: Op[] = [];

  for (let pi = 1; pi <= pdfJsDoc.numPages; pi++) {
    const page = await pdfJsDoc.getPage(pi);
    const content = await page.getTextContent({ disableNormalization: false });
    const items = content.items.filter(isTextItem) as PdfJsTextItem[];
    const lines = clusterItemsIntoLines(items);

    for (const line of lines) {
      const lineStr = line.map((i) => i.str).join("");
      BRACE_PLACEHOLDER.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = BRACE_PLACEHOLDER.exec(lineStr)) !== null) {
        const key = m[1].trim();
        if (!Object.prototype.hasOwnProperty.call(flatValues, key)) {
          console.warn(`[pdf-brace] Unknown placeholder "{{${key}}}" — left unchanged`);
          continue;
        }
        const value = flatValues[key] ?? "";
        const box = mapCharRangeToBox(line, m.index, m.index + m[0].length);
        if (!box) continue;
        ops.push({
          pageIndex: pi - 1,
          x0: box.x0,
          x1: box.x1,
          baselineY: box.baselineY,
          fontSize: box.fontSize,
          text: value,
        });
      }
    }
  }

  if (ops.length === 0) {
    return pdfBuffer;
  }

  console.log(`[pdf-brace] Replacing ${ops.length} literal {{…}} placeholder(s) in PDF`);

  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const op of ops) {
    const page = pdfDoc.getPage(op.pageIndex);
    const pageW = page.getWidth();
    const pageH = page.getHeight();
    const fs = op.fontSize;
    const textW = Math.min(font.widthOfTextAtSize(op.text, fs), pageW - op.x0 - 4);
    const coverW = Math.max(op.x1 - op.x0, textW + 4, 8);
    const coverH = Math.max(fs * 1.35, 10);
    const rectX = Math.max(0, op.x0 - 1);
    const rectY = Math.max(0, Math.min(op.baselineY - fs * 0.85, pageH - coverH - 1));

    page.drawRectangle({
      x: rectX,
      y: rectY,
      width: Math.min(coverW, pageW - rectX - 2),
      height: coverH,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });

    page.drawText(op.text, {
      x: op.x0,
      y: op.baselineY,
      size: fs,
      font,
      color: rgb(0, 0, 0),
      maxWidth: pageW - op.x0 - 4,
    });
  }

  const out = await pdfDoc.save();
  return Buffer.from(out);
}
