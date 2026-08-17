"""MVP-6 :: Integration & CDS Export Gateway (PWS Task 5) -- implemented.

Packages the platform's machine-readable alert objects into a (mock) classified
payload for transfer to SIPR/JWICS/C2 through a Government Cross-Domain Solution.
DB-agnostic; delegates to services.cds_gateway.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from services import cds_gateway

router = APIRouter(prefix="/api/integration", tags=["MVP-6 · CDS Export Gateway"])


@router.get("", summary="MVP-6 status")
def status() -> dict:
    return {
        "mvp": "MVP-6",
        "name": "Integration & CDS Export Gateway",
        "pws_task": "Task 5",
        "classification": cds_gateway.CLASSIFICATION,
        "destination": cds_gateway.DESTINATION,
        "endpoints": ["/api/integration/cds/preview", "/api/integration/cds/export"],
    }


@router.get("/cds/preview", summary="Preview the classified CDS export payload (mock)")
def cds_preview(limit: int = Query(100, ge=1, le=500)) -> dict:
    return cds_gateway.build_export(limit)


@router.post("/cds/export", summary="Dispatch the payload to the CDS (mock) -> receipt")
def cds_export(limit: int = Query(100, ge=1, le=500)) -> dict:
    return cds_gateway.dispatch(limit)
