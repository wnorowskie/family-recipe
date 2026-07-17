# ---- builder ----
# python:3.12-slim (Debian/glibc), not alpine: prisma-client-py's query engine
# is a prebuilt binary that is reliable on glibc but fiddly on musl (openssl /
# libc variants). The importer image can stay alpine because it doesn't use
# Prisma; this service does. See apps/api/CLAUDE.md.
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # venv on PATH so `prisma generate` can find the `prisma-client-py`
    # generator executable it shells out to (installed into /opt/venv/bin by the
    # prisma pip package). Without this the generate step fails with
    # "prisma-client-py: not found".
    PATH="/opt/venv/bin:$PATH" \
    # Engine binaries land in a fixed dir (default is a $HOME cache that
    # wouldn't survive the copy into the runtime stage). Copied to runtime below.
    PRISMA_BINARY_CACHE_DIR=/opt/prisma-engines

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt /tmp/requirements.txt
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

# Generate the Python Prisma client into the venv's site-packages and fetch the
# query engine. Without this the image builds but the container crashes on
# import with "Client has not been generated yet": the client is gitignored, so
# a clean checkout (CI / Docker) has no pre-generated copy. Must use the Python
# CLI targeting the clientPy generator — `npx prisma generate` mismatches the
# engine version prisma-client-py 0.15.0 expects (apps/api/CLAUDE.md), and the
# schema also declares a prisma-client-js generator we must not run here. The
# placeholder DATABASE_URL only satisfies the datasource block; generate never
# connects.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY prisma /app/prisma
RUN /opt/venv/bin/python -m prisma py fetch \
    && /opt/venv/bin/python -m prisma generate \
        --schema /app/prisma/schema.postgres.prisma --generator clientPy

# ---- runtime ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app \
    PRISMA_BINARY_CACHE_DIR=/opt/prisma-engines

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /opt/prisma-engines /opt/prisma-engines
COPY prisma /app/prisma
COPY apps/api /app/apps/api

EXPOSE 8000

CMD ["/opt/venv/bin/uvicorn", "apps.api.src.main:app", "--host", "0.0.0.0", "--port", "8000"]
