"""MVP-5 :: High-Resolution Regional Model Adapter (PWS Task 2) -- implemented.

Exposes a 3 km / 15-minute regional product over the CENTCOM AOR. DB-agnostic;
delegates to services.regional_adapter.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from services import regional_adapter as ra

router = APIRouter(prefix="/api/regional", tags=["MVP-5 · Regional Model Adapter"])


@router.get("", summary="MVP-5 status")
def status() -> dict:
    return {
        "mvp": "MVP-5",
        "name": "High-Resolution Regional Model Adapter",
        "pws_task": "Task 2",
        "grid_km": ra.GRID_KM,
        "step_minutes": ra.STEP_MINUTES,
        "horizon_hours": ra.HORIZON_HOURS,
        "model": ra.MODEL_NAME,
        "endpoints": ["/api/regional/forecast", "/api/regional/grid"],
    }


@router.get("/forecast", summary="3km / 15-minute regional point forecast")
def forecast(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    layers: str | None = Query(None, description="Comma-separated layer keys"),
    hours: int = Query(ra.HORIZON_HOURS, ge=1, le=48),
) -> dict:
    layer_keys = [k.strip() for k in layers.split(",") if k.strip()] if layers else None
    return ra.high_res_forecast(lat, lon, layer_keys, hours)


@router.get("/grid", summary="3km spatial grid around a point")
def grid(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    parameter: str = Query("temperature_2m"),
    n: int = Query(5, ge=3, le=9),
) -> dict:
    return ra.spatial_grid(lat, lon, parameter, n)
