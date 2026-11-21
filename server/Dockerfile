# CaseCraft backend (FastAPI + uvicorn)
# Build konteksti — loyiha ildizi (content/ ham kerak):  docker build -f server/Dockerfile .
ARG PYTHON_VERSION=3.13

# ---------------------------------------------------------------- deps: kutubxonalar alohida qatlamda (kesh uchun)
FROM python:${PYTHON_VERSION}-slim AS deps
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app/server
COPY server/requirements.txt .
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install -r requirements.txt

# ---------------------------------------------------------------- test: CI va `docker compose run` uchun
FROM deps AS test
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY content /app/content
COPY server /app/server
CMD ["pytest", "-q", "--ignore=tests/test_tts_live.py"]

# ---------------------------------------------------------------- runtime: kichik, root bo'lmagan foydalanuvchi
FROM python:${PYTHON_VERSION}-slim AS runtime
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    ROOT_PATH=""
RUN groupadd --system app && useradd --system --gid app --home /app app
WORKDIR /app/server
COPY --from=deps /opt/venv /opt/venv
COPY content /app/content
COPY server/app ./app
COPY server/prompts ./prompts
COPY server/fixtures ./fixtures
COPY server/scripts ./scripts
RUN mkdir -p cache logs && chown -R app:app cache logs
USER app
EXPOSE 8000
VOLUME ["/app/server/cache", "/app/server/logs"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health', timeout=4)" || exit 1
# Sessiyalar xotirada saqlanadi — faqat 1 ta worker. ROOT_PATH: reverse proxy prefiksi (masalan /api).
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*' --root-path \"${ROOT_PATH}\""]
