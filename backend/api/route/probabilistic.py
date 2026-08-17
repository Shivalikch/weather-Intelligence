"""MVP-3 :: Probabilistic & Operational-Impact Panels (PWS Task 1) -- implemented.

Exposes an ensemble spread (uncertainty) and plain-language operational impacts
for a point. DB-agnostic; delegates to services.probabilistic.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from services import probabilistic

router = APIRouter(prefix="/api/probabilistic", tags=["MVP-3 · Probabilistic Panels"])


@router.get("", summary="MVP-3 status")
def status() -> dict:
    return {
        "mvp": "MVP-3",
        "name": "Probabilistic & Operational-Impact Panels",
        "pws_task": "Task 1 (probabilistic)",
        "endpoints": ["/api/probabilistic/ensemble", "/api/probabilistic/impact"],
    }


@router.get("/ensemble", summary="Ensemble spread (members + percentiles)")
def ensemble(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    parameter: str = Query("temperature_2m", description="Layer key to spread"),
) -> dict:
    return probabilistic.ensemble(lat, lon, parameter)


@router.get("/impact", summary="Plain-language operational impacts + likelihood")
def impact(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict:
    return probabilistic.impact(lat, lon)
