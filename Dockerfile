# Stage 1: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies (include devDependencies for build)
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000 \
    # LibreOffice writes its user profile here; /tmp is always writable by all users
    HOME=/tmp

# LibreOffice (headless) + Java runtime + fonts for DOCX→PDF
# font-noto covers Latin, Arabic, Urdu and many other scripts
# font-carlito + Croscore: metric-compatible with Calibri / Arial / Times / Cambria (Word defaults)
# ttf-liberation: Liberation Sans/Serif for Segoe UI / Georgia / Verdana-style substitutions
# For identical fonts to Windows, authors should enable "Embed fonts in the file" in Word.
RUN apk add --no-cache \
    libreoffice \
    openjdk11-jre \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    font-noto \
    font-carlito \
    font-croscore \
  && printf '%s\n' \
      '<?xml version="1.0"?>' \
      '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">' \
      '<fontconfig>' \
      '  <alias><family>Calibri</family><prefer><family>Carlito</family></prefer></alias>' \
      '  <alias><family>Calibri Light</family><prefer><family>Carlito</family></prefer></alias>' \
      '  <alias><family>Arial</family><prefer><family>Arimo</family></prefer></alias>' \
      '  <alias><family>Times New Roman</family><prefer><family>Tinos</family></prefer></alias>' \
      '  <alias><family>Cambria</family><prefer><family>Caladea</family></prefer></alias>' \
      '  <alias><family>Cambria Math</family><prefer><family>Caladea</family></prefer></alias>' \
      '  <alias><family>Segoe UI</family><prefer><family>Liberation Sans</family></prefer></alias>' \
      '  <alias><family>Georgia</family><prefer><family>Liberation Serif</family></prefer></alias>' \
      '  <alias><family>Verdana</family><prefer><family>Liberation Sans</family></prefer></alias>' \
      '</fontconfig>' \
      > /etc/fonts/conf.d/30-word-fonts-to-croscore.conf \
  && fc-cache -f

# Runtime user
RUN addgroup -g 1001 -S appuser \
  && adduser -u 1001 -S -h /home/appuser appuser -G appuser \
  && mkdir -p /home/appuser \
  && chown appuser:appuser /home/appuser

# Production dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Own app files
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5000) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
