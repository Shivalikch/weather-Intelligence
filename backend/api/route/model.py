"""MVP-7 :: AI-Native Global Prediction Engine (PWS Task 1, full) -- implemented.

Exposes the AI-NWP engine metadata and a probabilistic prediction that swaps in
behind the platform's forecast interface. DB-agnostic; delegates to
services.ai_engine.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from services import ai_engine

router = APIRouter(prefix="/api/model", tags=["MVP-7 · AI-Native Global Engine"])


@router.get("", summary="MVP-7 status")
def status_root() -> dict:
    return {
        "mvp": "MVP-7",
        "name": "AI-Native Global Prediction Engine",
        "pws_task": "Task 1 (full)",
        "engine": ai_engine.ENGINE,
        "endpoints": ["/api/model/status", "/api/model/predict"],
    }


@router.get("/status", summary="AI-NWP engine metadata")
def status() -> dict:
    return ai_engine.status()


@router.get("/predict", summary="AI-native probabilistic point prediction")
def predict(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    parameter: str = Query("temperature_2m"),
) -> dict:
    return ai_engine.predict(lat, lon, parameter)
