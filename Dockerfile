# SASIST backend API — Railway production image (Python + Node/Puppeteer for HTML→PDF).
# Railway backend builds exclusively from this Dockerfile.

FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_ENV=production \
    NODE_BIN=/usr/bin/node \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Runtime: PostgreSQL client libs, barcode, poppler, Node.js 20, Chromium libs for Puppeteer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    libpq5 \
    poppler-utils \
    libzbar0 \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && node --version \
    && npm --version \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Puppeteer PDF renderer — install before full backend copy (layer cache).
COPY backend/scripts/structure_report_pdf/package.json \
     backend/scripts/structure_report_pdf/package-lock.json \
     backend/scripts/structure_report_pdf/puppeteer_pdf_shared.mjs \
     backend/scripts/structure_report_pdf/render.mjs \
     backend/scripts/structure_report_pdf/render_from_url.mjs \
     backend/scripts/structure_report_pdf/render_thumbnail.mjs \
     ./backend/scripts/structure_report_pdf/
RUN cd backend/scripts/structure_report_pdf \
    && npm ci --omit=dev \
    && test -f render.mjs \
    && test -f render_thumbnail.mjs \
    && test -d node_modules/puppeteer \
    && PROBE_PDF=/tmp/docker_render_probe.pdf \
    && printf '%s' '<!DOCTYPE html><html><head><meta charset="utf-8"/><style>@page{size:A4}body{font-family:Arial;color:#111}h1{font-size:18px}</style></head><body><h1>DTE probe</h1><p>content</p></body></html>' | node render.mjs > "$PROBE_PDF" \
    && test -s "$PROBE_PDF" \
    && BYTES=$(wc -c < "$PROBE_PDF" | tr -d ' ') \
    && test "$BYTES" -gt 500 \
    && printf '%s' '<!DOCTYPE html><html><body><h1>thumb</h1></body></html>' | node render_thumbnail.mjs > /tmp/docker_thumb_probe.png \
    && test -s /tmp/docker_thumb_probe.png \
    && echo "pdf pipeline ok bytes=$BYTES"

COPY backend ./backend
COPY run_server.py ./

# Verify paths used by structure_report_pdf_service.py at runtime.
RUN test -f backend/scripts/structure_report_pdf/render.mjs \
    && test -f backend/scripts/structure_report_pdf/render_thumbnail.mjs \
    && test -f backend/scripts/structure_report_pdf/puppeteer_pdf_shared.mjs \
    && test -f backend/scripts/structure_report_pdf/node_modules/puppeteer/package.json \
    && test -x /usr/bin/node \
    && /usr/bin/node --version

EXPOSE 8000

CMD ["python3", "run_server.py"]
