import os
from typing import Optional

from pydantic import Field, field_validator

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    jwt_secret: str = Field(default_factory=lambda: os.getenv("JWT_SECRET", ""))
    family_name: Optional[str] = None
    family_master_key: Optional[str] = None
    uploads_bucket: Optional[str] = None
    uploads_signed_url_ttl_seconds: int = 3600
    cookie_name: str = "session"
    environment: str = "development"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url", "jwt_secret")
    @classmethod
    def _require_non_empty(cls, value: str) -> str:
        if not value:
            raise ValueError("Missing required environment configuration")
        return value

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


settings = Settings()
