"""Application configuration via pydantic-settings."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    app_name: str = "CodeLens"
    app_version: str = "1.0.0"
    app_env: str = "development"
    app_secret_key: str = "change-me-in-production"
    debug: bool = False

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_max_tokens: int = 4096
    openai_temperature: float = 0.1

    # GitHub
    github_token: str = ""
    github_api_base: str = "https://api.github.com"

    # Database (supports postgresql+asyncpg:// or sqlite+aiosqlite://)
    database_url: str = "sqlite+aiosqlite:///./codelens_local.db"

    # Redis (set to "memory://" to use in-memory fallback without Redis)
    redis_url: str = "redis://localhost:6379/0"

    @property
    def use_sqlite(self) -> bool:
        return "sqlite" in self.database_url

    @property
    def use_memory_cache(self) -> bool:
        return self.redis_url.startswith("memory://")

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Rate Limiting
    rate_limit_per_hour: int = 10

    # Cache
    cache_ttl_seconds: int = 86400  # 24 hours

    # Server
    api_base_url: str = "http://localhost:8000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
