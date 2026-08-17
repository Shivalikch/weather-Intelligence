"""Central application settings loaded from the .env file.

Only configuration lives here -- no database driver logic (that is isolated in
database/database.py) and no HTTP logic. Import ``settings`` anywhere you need
a value.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# backend/ directory (this file's parent).
BACKEND_DIR = Path(__file__).resolve().parent

# Load backend/.env once, at import time.
load_dotenv(BACKEND_DIR / ".env")


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "AFCENT Weather Intelligence SaaS (Prototype)")
    app_version: str = os.getenv("APP_VERSION", "0.1.0")
    app_env: str = os.getenv("APP_ENV", "local")
    api_host: str = os.getenv("API_HOST", "127.0.0.1")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    cors_origins: list[str] = field(
        default_factory=lambda: _csv(
            os.getenv("CORS_ORIGINS", "http://localhost:5173")
        )
    )

    # --- database (consumed only by database/database.py) ---
    db_engine: str = os.getenv("DB_ENGINE", "sqlite")
    db_name: str = os.getenv("DB_NAME", "weatherman.db")
    db_path: str = os.getenv("DB_PATH", "weatherman.db")
    db_host: str = os.getenv("DB_HOST", "")
    db_port: str = os.getenv("DB_PORT", "")
    db_user: str = os.getenv("DB_USER", "")
    db_password: str = os.getenv("DB_PASSWORD", "")

    @property
    def sqlite_file(self) -> Path:
        """Absolute path to the sqlite file (relative paths resolve to backend/)."""
        p = Path(self.db_path)
        return p if p.is_absolute() else (BACKEND_DIR / p)


settings = Settings()
