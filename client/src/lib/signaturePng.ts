/**
 * Export signature canvas as PNG with tight bounds around ink.
 * Reduces huge transparent margins so Word/LibreOffice inline images
 * do not reserve a big white box and disturb layout.
 *
 * Output is always composited on **opaque white** (no transparent / tinted RGB background)
 * so PDF/DOCX embeds match letter paper.
 */
function toDataUrlOnWhiteBackground(canvas: HTMLCanvasElement): string {
  const w = canvas.width;
  const h = canvas.height;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const t = tmp.getContext("2d");
  if (!t) return canvas.toDataURL("image/png");
  t.fillStyle = "#ffffff";
  t.fillRect(0, 0, w, h);
  t.drawImage(canvas, 0, 0);
  return tmp.toDataURL("image/png");
}

export function canvasToTrimmedSignaturePng(source: HTMLCanvasElement): string {
  const w = source.width;
  const h = source.height;
  if (w < 2 || h < 2) return toDataUrlOnWhiteBackground(source);

  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) return toDataUrlOnWhiteBackground(source);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  const pad = 6;
  const alphaMin = 28;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = d[i + 3];
      if (a < alphaMin) continue;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      // Ignore near-white pixels (noise / anti-aliased page background)
      if (r > 248 && g > 248 && b > 248) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (minX > maxX || minY > maxY) {
    return toDataUrlOnWhiteBackground(source);
  }

  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw < 2 || ch < 2) return toDataUrlOnWhiteBackground(source);

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d");
  if (!octx) return toDataUrlOnWhiteBackground(source);

  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, cw, ch);
  octx.drawImage(source, minX, minY, cw, ch, 0, 0, cw, ch);
  return out.toDataURL("image/png");
}
