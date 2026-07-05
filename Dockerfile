# SASIST backend API — Railway production image (Python + Node/Puppeteer for HTML→PDF).
# Railway builder: DOCKERFILE (see railway.json). Nixpacks is not used when DOCKERFILE is set.

FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_ENV=production

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
     ./backend/scripts/structure_report_pdf/
RUN cd backend/scripts/structure_report_pdf \
    && npm ci --omit=dev \
    && test -f render.mjs \
    && test -d node_modules/puppeteer \
    && node -e "import('puppeteer').then(() => console.log('puppeteer ok')).catch(e => { console.error(e); process.exit(1); })"

COPY backend ./backend
COPY run_server.py ./

# Verify paths used by structure_report_pdf_service.py at runtime.
RUN test -f backend/scripts/structure_report_pdf/render.mjs \
    && test -f backend/scripts/structure_report_pdf/node_modules/puppeteer/package.json \
    && which node

EXPOSE 8000

CMD ["python3", "run_server.py"]
