"""Application entry point.

Houses cross-cutting meta endpoints (health, config, external-api catalogue)
and mounts one router per MVP group from api/route/. All persistence goes
through data_access; this module imports no database driver.

Run locally:
    cd backend
    uvicorn main:app --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.route import (
    alerts,
    forecast,
    integration,
    model,
    probabilistic,
    regional,
    severe,
)
from api.schemas import ExternalApiOut, HealthResponse
from config import settings
from database import data_access
from services import external_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create schema + seed reference data on first run.
    data_access.init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Prototype API for the AFCENT Weather Intelligence SaaS. "
        "MVP-1 (Map-Centric Viewer) is implemented; MVP-2..7 are wired-in placeholders."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# One router per MVP group.
app.include_router(forecast.router)        # MVP-1
app.include_router(alerts.router)          # MVP-2
app.include_router(probabilistic.router)   # MVP-3
app.include_router(severe.router)          # MVP-4
app.include_router(regional.router)        # MVP-5
app.include_router(integration.router)     # MVP-6
app.include_router(model.router)           # MVP-7


# ---------------------------------------------------------------------------
# Meta / cross-cutting endpoints.
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["Meta"])
def health() -> HealthResponse:
    db_ok = data_access.healthcheck()
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
        database="up" if db_ok else "down",
    )


@app.get("/api/config", tags=["Meta"])
def get_config() -> dict:
    return data_access.get_config()


@app.get("/api/external-apis", response_model=list[ExternalApiOut], tags=["Meta"])
def list_external_apis() -> list[ExternalApiOut]:
    return [
        ExternalApiOut(
            name=r["name"],
            provider=r["provider"],
            category=r["category"],
            base_url=r["base_url"] or "",
            endpoint_path=r["endpoint_path"] or "",
            auth_type=r["auth_type"],
            requires_key=bool(r["requires_key"]),
            data_format=r["data_format"],
            mvp=r["mvp"],
            register_url=r["register_url"] or "",
            comment=r["comment"] or "",
            enabled=bool(r["enabled"]),
            live=r["name"] in external_client.LIVE_SOURCES,
        )
        for r in data_access.list_external_apis()
    ]
