"""MVP-4 :: Severe-Weather Detection Packs (PWS Task 4) -- implemented.

Continuous, operator-independent AOR-wide monitoring for environmental shaping
events, delivered as pre-built detection packs and machine-readable GeoJSON.
The API layer stays DB-agnostic and calls services only.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from services import severe_detection

router = APIRouter(prefix="/api/severe", tags=["MVP-4 · Severe-Weather Detection"])


@router.get("", summary="MVP-4 status")
def status() -> dict:
    packs = severe_detection.list_packs()
    return {
        "mvp": "MVP-4",
        "name": "Severe-Weather Detection Packs",
        "pws_task": "Task 4",
        "packs": len(packs),
        "detections_endpoint": "/api/severe/detections",
    }


@router.get("/packs", summary="List pre-built detection packs")
def packs() -> list[dict]:
    return severe_detection.list_packs()


@router.get("/detections", summary="AOR-wide severe-weather detections (GeoJSON)")
def detections(
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
) -> dict:
    """Run all packs across the AOR (default), or at a single point if lat/lon given."""
    if lat is not None and lon is not None:
        point = [{"name": f"{lat:.2f}, {lon:.2f}", "lat": lat, "lon": lon, "country": ""}]
        return severe_detection.detect(point)
    return severe_detection.detect()
