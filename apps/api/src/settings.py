from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    family_name: Optional[str] = None
    family_master_key: Optional[str] = None
    uploads_bucket: Optional[str] = None
    uploads_signed_url_ttl_seconds: int = 3600
    cookie_name: str = "session"
    environment: str = "development"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


settings = Settings()  # type: ignore[arg-type]
