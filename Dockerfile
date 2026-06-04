# SASIST backend API — use when Railway builder is DOCKERFILE (optional; default is Nixpacks + nixpacks.toml).
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    poppler-utils \
    libzbar0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY run_server.py ./

EXPOSE 8000

CMD ["python", "run_server.py"]
