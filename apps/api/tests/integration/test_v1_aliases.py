"""Routing-invariant tests for the /v1 alias dual-include (issue #179).

Per the migration plan, every resource router must be reachable under both
its native prefix AND `/v1/<prefix>` — except `auth.router`, which is the
legacy session-cookie path and is deliberately NOT aliased into `/v1/auth`
(that namespace is owned by `auth_v1.router`'s token+refresh flow).

Rather than GET every endpoint at both paths (which would require auth
fixtures + per-handler DB mocks for ~25 routes), these tests assert the
**routing invariant** directly against `app.routes`. Catches the regression
where someone adds a new router to the legacy include but forgets the v1
include — the exact failure mode the dual-include pattern is meant to
prevent.
"""

from __future__ import annotations

import pytest
from starlette.routing import Route

from src.main import app

# Paths owned exclusively by `auth_v1.router` — these exist under `/v1/...`
# but have NO un-prefixed twin. They are NOT bugs.
V1_ONLY_PATHS: frozenset[str] = frozenset(
    {
        "/v1/auth/refresh",
        "/v1/auth/session",
        # /v1/notifications/* (issue #182) is Bearer-token only — never had a
        # cookie-auth Next twin behind FastAPI, so no unprefixed alias.
        "/v1/notifications",
        "/v1/notifications/mark-read",
        "/v1/notifications/unread-count",
    }
)

# Paths owned exclusively by the legacy `auth.router` — these exist
# unprefixed but have NO `/v1/...` twin. `/v1/auth/*` is owned by the
# token-flow router (auth_v1) and is a deliberate behavioural divergence,
# not a path alias. See main.py for the rationale.
LEGACY_ONLY_PATHS: frozenset[str] = frozenset(
    {
        "/auth/login",
        "/auth/logout",
        "/auth/me",
        "/auth/signup",
    }
)

# Paths registered automatically by FastAPI (Swagger UI, ReDoc, the
# OpenAPI JSON itself). Framework-owned, not application routes.
FRAMEWORK_PATHS: frozenset[str] = frozenset(
    {
        "/docs",
        "/docs/oauth2-redirect",
        "/redoc",
        "/openapi.json",
    }
)


def _route_paths() -> set[str]:
    return {r.path for r in app.routes if isinstance(r, Route)}


def test_every_legacy_path_has_a_v1_twin():
    """A path like `/posts` must have `/v1/posts` registered; vice-versa too.

    Excludes the documented one-way paths above.
    """
    paths = _route_paths()
    v1_paths = {p for p in paths if p.startswith("/v1/")}
    legacy_paths = {p for p in paths if not p.startswith("/v1/")}

    # Every legacy path → v1 twin
    missing_v1: list[str] = []
    for legacy in legacy_paths - LEGACY_ONLY_PATHS - FRAMEWORK_PATHS:
        if f"/v1{legacy}" not in v1_paths:
            missing_v1.append(legacy)

    assert not missing_v1, (
        "Legacy paths missing a /v1 twin (router added to legacy include but "
        f"not to the dual-include loop in main.py): {missing_v1}"
    )

    # Every v1 path → legacy twin (catches the inverse: someone added a
    # router only to the v1 side without aliasing it)
    missing_legacy: list[str] = []
    for v1 in v1_paths - V1_ONLY_PATHS:
        if v1.removeprefix("/v1") not in legacy_paths:
            missing_legacy.append(v1)

    assert not missing_legacy, (
        "v1 paths missing a legacy alias (the alias-during-rollout invariant "
        f"is broken — these will 404 on the unprefixed path): {missing_legacy}"
    )


@pytest.mark.parametrize(
    "legacy_path,v1_path",
    [
        ("/health", "/v1/health"),
        ("/posts", "/v1/posts"),
        ("/timeline", "/v1/timeline"),
        ("/me/profile", "/v1/me/profile"),
        ("/profile/posts", "/v1/profile/posts"),
        ("/family/members", "/v1/family/members"),
        ("/tags", "/v1/tags"),
        ("/recipes", "/v1/recipes"),
        ("/reactions", "/v1/reactions"),
    ],
)
def test_alias_pair_resolves_to_the_same_handler(legacy_path: str, v1_path: str):
    """Both routes for a representative endpoint must call the same handler.

    Picks one path per dual-included router. If a router is ever added that
    accidentally rebinds to a different handler at the /v1 path (e.g. someone
    monkey-patches and forgets to revert), this catches it before the route
    silently behaves differently from its alias.
    """
    by_path: dict[str, set[object]] = {}
    for route in app.routes:
        if isinstance(route, Route):
            by_path.setdefault(route.path, set()).add(route.endpoint)

    legacy_handlers = by_path.get(legacy_path)
    v1_handlers = by_path.get(v1_path)

    assert legacy_handlers, f"legacy path {legacy_path} not registered"
    assert v1_handlers, f"v1 path {v1_path} not registered"
    assert legacy_handlers == v1_handlers, (
        f"alias pair {legacy_path} / {v1_path} resolves to different handlers: "
        f"legacy={legacy_handlers}, v1={v1_handlers}"
    )


def test_auth_v1_namespace_is_not_aliased_under_legacy_path():
    """The token-flow /v1/auth/* endpoints must NOT exist at /auth/*."""
    paths = _route_paths()
    for v1_path in V1_ONLY_PATHS:
        legacy_twin = v1_path.removeprefix("/v1")
        assert legacy_twin not in paths, (
            f"{v1_path} (token-flow auth) was accidentally aliased to {legacy_twin}; "
            "this would shadow the legacy session-cookie auth handler."
        )
