# ---- builder ----
FROM python:3.12-alpine AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apk update \
    && apk add --no-cache build-base libxml2-dev libxslt-dev

COPY apps/recipe-url-importer/requirements.txt /tmp/requirements.txt
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

# ---- runtime ----
FROM python:3.12-alpine AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app/apps/recipe-url-importer/src

WORKDIR /app

RUN apk update \
    && apk add --no-cache libxml2 libxslt curl

COPY --from=builder /opt/venv /opt/venv
COPY apps/recipe-url-importer /app/apps/recipe-url-importer

EXPOSE 8000

CMD ["/opt/venv/bin/uvicorn", "recipe_url_importer.app:app", "--host", "0.0.0.0", "--port", "8000"]
