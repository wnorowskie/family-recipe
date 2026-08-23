from fastapi.responses import JSONResponse


class ApiError(Exception):
    """Raised from a dependency or handler when we want the canonical
    `{error: {code, message}}` envelope returned. Mapped to a JSONResponse
    by the global exception handler in main.py.

    Why not just `raise HTTPException(detail=...)`: FastAPI's default
    serialization for HTTPException is `{"detail": ...}`, which doesn't
    match the documented contract. The /v1 SPA in #36 keys off
    `error.code`, so dependencies need a way to signal the same envelope
    that handler-returned `unauthorized()`/`bad_request()` etc. produce.
    """

    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


def validation_error(message: str = "Invalid input") -> JSONResponse:
    return error_response("VALIDATION_ERROR", message, 400)


def bad_request(message: str = "Bad request") -> JSONResponse:
    return error_response("BAD_REQUEST", message, 400)


def unauthorized(message: str = "Unauthorized") -> JSONResponse:
    return error_response("UNAUTHORIZED", message, 401)


def invalid_credentials(message: str = "Invalid credentials") -> JSONResponse:
    return error_response("INVALID_CREDENTIALS", message, 401)


def forbidden(message: str = "Forbidden") -> JSONResponse:
    return error_response("FORBIDDEN", message, 403)


def not_found(message: str = "Not found") -> JSONResponse:
    return error_response("NOT_FOUND", message, 404)


def conflict(message: str = "Conflict") -> JSONResponse:
    return error_response("CONFLICT", message, 409)


def too_many_photos(message: str = "Too many photos") -> JSONResponse:
    """400 — caller exceeded the per-post photo count cap.

    Dedicated code so the frontend can key off `TOO_MANY_PHOTOS` (matches the
    Next handler in src/app/api/posts/[postId]/route.ts) rather than the
    generic VALIDATION_ERROR bucket.
    """
    return error_response("TOO_MANY_PHOTOS", message, 400)


def unsupported_file_type(message: str = "Unsupported file type") -> JSONResponse:
    """400 — uploaded file's MIME type is not in the allowlist.

    Dedicated code so the frontend can key off `UNSUPPORTED_FILE_TYPE` (matches
    the Next handler) rather than the generic VALIDATION_ERROR bucket.
    """
    return error_response("UNSUPPORTED_FILE_TYPE", message, 400)


def file_too_large(message: str = "File is too large") -> JSONResponse:
    """400 — single uploaded file (or aggregate payload) exceeded the size cap.

    Matches the Next handler in src/app/api/posts/route.ts which returns
    `FILE_TOO_LARGE` at 400 (not 413) so the frontend keys off a single code.
    Used for per-file caps (10MB posts / 5MB avatar) and the aggregate
    request-size guard from the migration plan (50MB total per post).
    """
    return error_response("FILE_TOO_LARGE", message, 400)


def invalid_tag(message: str = "One or more tags are not available") -> JSONResponse:
    """400 — one or more requested tag names did not resolve to a Tag row.

    Dedicated code so the frontend can key off `INVALID_TAG` (matches the Next
    handler) rather than the generic VALIDATION_ERROR bucket.
    """
    return error_response("INVALID_TAG", message, 400)


def rate_limited(
    message: str = "Too many requests. Please try again later.",
    *,
    retry_after_seconds: int | None = None,
) -> JSONResponse:
    """429 with the standard envelope plus a `Retry-After` header.

    Per the migration plan (Rate Limits & Abuse Protections), every 429
    must carry `Retry-After` in seconds. Callers compute the value via
    the per-endpoint limiter (see src/rate_limit.py); a `None` here
    means we couldn't, in which case we still return 429 but omit the
    header rather than fabricate a value.
    """
    headers = (
        {"Retry-After": str(retry_after_seconds)}
        if retry_after_seconds is not None
        else None
    )
    return JSONResponse(
        status_code=429,
        content={"error": {"code": "RATE_LIMITED", "message": message}},
        headers=headers,
    )


def internal_error(message: str = "Internal server error") -> JSONResponse:
    return error_response("INTERNAL_ERROR", message, 500)
