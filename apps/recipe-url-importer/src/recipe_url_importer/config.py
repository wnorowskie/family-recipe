from __future__ import annotations

from typing import List, Set

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from . import __version__


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_prefix="IMPORTER_", case_sensitive=False)

    service_name: str = Field(default="recipe-url-importer")
    service_version: str = Field(default=__version__)
    git_sha: str = Field(default="dev")

    max_html_bytes: int = Field(default=3_000_000)
    fetch_timeout_seconds: float = Field(default=8.0)
    connect_timeout_seconds: float = Field(default=2.0)
    read_timeout_seconds: float = Field(default=5.0)
    redirect_limit: int = Field(default=3)
    user_agent: str = Field(default=f"recipe-url-importer/{__version__}")

    enable_headless: bool = Field(default=False)
    headless_allowlist_domains: List[str] = Field(default_factory=list)
    headless_max_render_ms: int = Field(default=6000)
    importer_strategy_order: str = Field(default="jsonld,microdata,heuristic,headless")

    cache_ttl_seconds: int = Field(default=604_800)  # 7 days

    rate_limit_ip_per_min: int = Field(default=20)
    rate_limit_domain_per_min: int = Field(default=60)

    block_internal_suffixes: bool = Field(default=False)
    blocked_suffixes: List[str] = Field(default_factory=lambda: [".local", ".internal", ".corp"])
    blocked_hostnames: Set[str] = Field(
        default_factory=lambda: {"localhost", "metadata.google.internal", "169.254.169.254"}
    )

    allowed_schemes: Set[str] = Field(default_factory=lambda: {"http", "https"})
    allowed_ports: Set[int] = Field(default_factory=lambda: {80, 443})

    robots_enforcement_enabled: bool = Field(default=False)

    @field_validator("headless_allowlist_domains", mode="before")
    @classmethod
    def split_headless_allowlist(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.lower() for item in (part.strip() for part in value.split(",")) if item]
        return [item.lower() for item in value]
