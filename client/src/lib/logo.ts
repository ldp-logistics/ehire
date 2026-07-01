/**
 * Company logo as inline SVG data URL.
 * We keep one canonical source so logo always renders even when static image files are missing.
 */
const LDP_WORDMARK_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="320" viewBox="0 0 1400 320" role="img" aria-label="LDP Logistics">
    <rect width="1400" height="320" fill="#090D16"/>
    <text x="70" y="212" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="128" font-weight="900" fill="#F1F3F5">LDPLogistics</text>
    <circle cx="1090" cy="192" r="11" fill="#E72031"/>
  </svg>`
)}`;

const LDP_COMPACT_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="320" viewBox="0 0 820 320" role="img" aria-label="LDP">
    <rect width="820" height="320" fill="#090D16"/>
    <text x="64" y="232" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="220" font-weight="900" fill="#F1F3F5" letter-spacing="2">LDP</text>
    <rect x="670" y="190" width="54" height="54" rx="8" ry="8" fill="#E72031"/>
  </svg>`
)}`;

export const LOGO_LIGHT = LDP_WORDMARK_SVG;
export const LOGO_DARK = LDP_WORDMARK_SVG;
export const LOGO_COMPACT = LDP_COMPACT_SVG;

/** Default/fallback (e.g. favicon) */
export const LOGO_URL = LOGO_DARK;
