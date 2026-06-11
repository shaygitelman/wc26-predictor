from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/wc26"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30

    # Google OAuth
    google_client_id: str = ""

    # App
    app_env: str = "development"
    cors_origins: list[str] = ["http://localhost:3000"]

    # Admin
    admin_key: str = "change-me-admin"

    # Cron (same value must be set in Vercel + Render)
    cron_secret: str = ""

    # API-Football (api-sports.io)
    apifootball_key: str = ""

    # Sentry error monitoring
    sentry_dsn:     str = ""
    sentry_release: str = ""   # set to git commit SHA for Sentry release tracking (e.g. RENDER_GIT_COMMIT)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()
