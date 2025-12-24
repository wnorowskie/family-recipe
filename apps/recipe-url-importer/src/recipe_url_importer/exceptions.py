from __future__ import annotations

from fastapi import status


class ImporterError(Exception):
    def __init__(self, *, code: str, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class FetchTimeoutError(ImporterError):
    def __init__(self, message: str = "Upstream fetch timed out"):
        super().__init__(code="FETCH_TIMEOUT", message=message, status_code=status.HTTP_408_REQUEST_TIMEOUT)


class ContentTooLargeError(ImporterError):
    def __init__(self, message: str = "Content too large"):
        super().__init__(code="CONTENT_TOO_LARGE", message=message, status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)


class BlockedHostError(ImporterError):
    def __init__(self, message: str = "Host is blocked"):
        super().__init__(code="BLOCKED_HOST", message=message, status_code=status.HTTP_400_BAD_REQUEST)


class InvalidUrlError(ImporterError):
    def __init__(self, message: str = "Invalid URL"):
        super().__init__(code="INVALID_URL", message=message, status_code=status.HTTP_400_BAD_REQUEST)


class UpstreamFetchFailed(ImporterError):
    def __init__(self, message: str = "Upstream fetch failed"):
        super().__init__(code="UPSTREAM_FETCH_FAILED", message=message, status_code=status.HTTP_502_BAD_GATEWAY)


class ParseFailed(ImporterError):
    def __init__(self, message: str = "Parsing failed"):
        super().__init__(code="PARSE_FAILED", message=message, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
