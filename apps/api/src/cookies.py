"""Cookie helpers for the v1 token-auth endpoints.

Why a dedicated module: cookie attributes (Secure, SameSite, Domain) vary by
environment and need to stay consistent across set/clear paths. Also lets
us flip refresh+csrf cookies in lockstep without per-handler boilerplate.
"""
from __future__ import annotations

from typing import Literal

from fastapi import Response

from .settings import settings

SameSite = Literal["lax", "strict", "none"]


def _samesite() -> SameSite:
    raw = settings.refresh_cookie_samesite.lower()
    if raw not in ("lax", "strict", "none"):
        return "lax"
    return raw  # type: ignore[return-value]


def set_refresh_cookie(response: Response, value: str, max_age_seconds: int) -> None:
    response.set_cookie(
        settings.refresh_cookie_name,
        value,
        max_age=max_age_seconds,
        httponly=True,
        secure=settings.is_production or _samesite() == "none",
        samesite=_samesite(),
        domain=settings.refresh_cookie_domain,
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.refresh_cookie_name,
        httponly=True,
        secure=settings.is_production or _samesite() == "none",
        samesite=_samesite(),
        domain=settings.refresh_cookie_domain,
        path="/",
    )


def set_csrf_cookie(response: Response, value: str, max_age_seconds: int) -> None:
    # Non-HttpOnly so the SPA can read it and echo as `X-CSRF-Token`.
    response.set_cookie(
        settings.csrf_cookie_name,
        value,
        max_age=max_age_seconds,
        httponly=False,
        secure=settings.is_production or _samesite() == "none",
        samesite=_samesite(),
        domain=settings.refresh_cookie_domain,
        path="/",
    )


def clear_csrf_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.csrf_cookie_name,
        httponly=False,
        secure=settings.is_production or _samesite() == "none",
        samesite=_samesite(),
        domain=settings.refresh_cookie_domain,
        path="/",
    )
