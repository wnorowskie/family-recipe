from __future__ import annotations

import logging
import time
import uuid
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status

from . import __version__
from .cache.memory_cache import MemoryCache
from .config import Settings
from .exceptions import ImporterError, ParseFailed
from .models import ErrorResponse, ParseRequest, ParseResponse, RecipeDraft
from .parse.pipeline import run_pipeline
from .rate_limit.backstop import BackstopRateLimiter
from .utils.logging import configure_logging, log_json

configure_logging()
logger = logging.getLogger("recipe_url_importer")


_settings = Settings()


def get_settings() -> Settings:
    return _settings


settings = _settings
cache = MemoryCache[dict](settings.cache_ttl_seconds)
rate_limiter = BackstopRateLimiter(settings.rate_limit_ip_per_min, settings.rate_limit_domain_per_min)

app = FastAPI(
    title="Recipe URL Importer",
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    correlation_id = request.headers.get("x-correlation-id")
    request.state.request_id = request_id
    start = time.perf_counter()
    response: Response | None = None
    error: str | None = None
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as exc:
        error = exc.__class__.__name__
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log_json(
            logger,
            "request_complete",
            {
                "service": settings.service_name,
                "version": settings.service_version,
                "request_id": request_id,
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code if response else None,
                "duration_ms": round(duration_ms, 2),
                "error": error,
            },
        )


@app.exception_handler(ImporterError)
async def importer_exception_handler(request: Request, exc: ImporterError):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    payload = {"request_id": request_id, "code": exc.code, "message": exc.message}
    return Response(
        content=ErrorResponse(**payload).model_dump_json(),
        media_type="application/json",
        status_code=exc.status_code,
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        code = "RATE_LIMITED"
    elif exc.status_code >= 500:
        code = "PARSE_FAILED"
    else:
        code = "INVALID_URL"
    payload = {"request_id": request_id, "code": code, "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail)}
    return Response(
        content=ErrorResponse(**payload).model_dump_json(),
        media_type="application/json",
        status_code=exc.status_code,
    )


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/version")
async def version():
    return {"service": settings.service_name, "version": settings.service_version, "git_sha": settings.git_sha}


@app.post("/v1/parse", response_model=ParseResponse)
async def parse_recipe(
    request: Request,
    payload: ParseRequest,
    config: Settings = Depends(get_settings),
):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    client_ip = request.client.host if request.client else "unknown"
    start_total = time.perf_counter()
    url_host = urlsplit(str(payload.url)).hostname or "unknown"
    if not rate_limiter.check(client_ip, url_host):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

    try:
        result = await run_pipeline(str(payload.url), config, cache, request_id)
    except ImporterError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("pipeline_error", exc_info=exc)
        raise ParseFailed() from exc

    recipe = RecipeDraft.model_validate(result.recipe_response["recipe"])
    response_payload = ParseResponse(
        request_id=request_id,
        recipe=recipe,
        confidence=result.recipe_response["confidence"],
        warnings=result.recipe_response["warnings"],
        missing_fields=result.recipe_response["missing_fields"],
    )

    total_ms = (time.perf_counter() - start_total) * 1000
    parse_ms = max(0.0, total_ms - result.fetch_timing_ms)
    log_json(
        logger,
        "parse_complete",
        {
            "service": settings.service_name,
            "version": settings.service_version,
            "request_id": request_id,
            "correlation_id": request.headers.get("x-correlation-id"),
            "domain": result.domain,
            "strategy": result.strategy,
            "confidence": response_payload.confidence,
            "status": "success" if not response_payload.missing_fields else "partial",
            "headless_used": result.strategy.startswith("headless"),
            "timing_ms_total": round(total_ms, 2),
            "timing_ms_fetch": round(result.fetch_timing_ms, 2),
            "timing_ms_parse": round(parse_ms, 2),
            "warnings_count": len(response_payload.warnings),
            "missing_fields": response_payload.missing_fields,
            "http_status_upstream": result.upstream_status,
        },
    )

    return response_payload
