# IDrive — single-container build.
#   docker build -t idrive .
#   docker run -p 8000:8000 -v idrive-data:/app/data idrive
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# deps first for layer caching; dev-only extras live in requirements-dev.txt
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# database + uploads live on a volume
ENV DATABASE_URL=sqlite+aiosqlite:////app/data/idrive.db \
    ENVIRONMENT=production \
    CORS_ORIGINS=
RUN mkdir -p /app/data && \
    useradd --system --uid 10001 --home /app idrive && \
    chown -R idrive:idrive /app
USER idrive
VOLUME ["/app/data"]

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=3)"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
