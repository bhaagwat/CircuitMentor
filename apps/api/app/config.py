"""CircuitMentor API — configuration via environment variables."""

import warnings
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://circuitmentor:circuitmentor@localhost:5432/circuitmentor"

    # Auth
    JWT_SECRET: str = "change-me-to-a-random-secret-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Google OAuth
    google_client_id: str = "placeholder-client-id"
    google_client_secret: str = "placeholder-client-secret"
    google_redirect_uri: str = "http://localhost:5173/v1/auth/google/callback"
    web_url: str = "http://localhost:5173"
    cookie_secure: bool = False

    # AI Mentor (OpenRouter / Anthropic)
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    anthropic_api_key: str = ""
    mentor_model: str = "anthropic/claude-3.5-haiku"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174,http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    model_config = {
        "env_file": [".env", "apps/api/.env"],
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()

if settings.JWT_SECRET == "change-me-to-a-random-secret-in-production":
    if settings.cookie_secure:
        raise ValueError(
            "CRITICAL: JWT_SECRET must be changed from the default in production (cookie_secure=True)."
        )
    warnings.warn(
        "JWT_SECRET is using the insecure default value. Set a strong secret in .env before deploying to production.",
        stacklevel=2,
    )
