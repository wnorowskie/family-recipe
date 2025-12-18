from fastapi.responses import JSONResponse


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


def invalid_credentials() -> JSONResponse:
    return error_response("INVALID_CREDENTIALS", "Invalid credentials", 401)


def forbidden(message: str = "Forbidden") -> JSONResponse:
    return error_response("FORBIDDEN", message, 403)


def not_found(message: str = "Not found") -> JSONResponse:
    return error_response("NOT_FOUND", message, 404)


def conflict(message: str = "Conflict") -> JSONResponse:
    return error_response("CONFLICT", message, 409)


def internal_error(message: str = "Internal server error") -> JSONResponse:
    return error_response("INTERNAL_ERROR", message, 500)
