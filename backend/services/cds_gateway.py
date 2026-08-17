"""MVP-6 :: Integration & CDS Export Gateway (PWS Task 5).

The outbound seam that packages the platform's machine-readable outputs (the
alerting engine's GeoJSON alert objects) for transfer to the classified
enclaves (SIPRNet / JWICS / C2) via a Government Cross-Domain Solution (CDS).

Everything here is a MOCK: no data leaves the unclassified enclave. It produces
the payload + a transfer receipt exactly as they would be structured for a real
CDS drop, so the integration contract is demonstrable end-to-end.

Reads the persisted alerts through data_access; no network calls (so a preview
is deterministic and safe).
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from database import data_access

CLASSIFICATION = "CUI//REL TO USA, FVEY"
SOURCE_SYSTEM = "AFCENT Weather Intelligence SaaS (Prototype)"
TRANSFER_FORMAT = "GeoJSON (RFC 7946) over accredited Cross-Domain Solution"
DESTINATION = {
    "enclaves": ["SIPRNet", "JWICS"],
    "c2_systems": ["C2 (via CDS)"],
    "cds_drop": "NIPRNet CDS ingestion point (Government-Furnished)",
}


def _features_from_alerts(limit: int) -> list[dict]:
    """Reconstruct GeoJSON features from the persisted alert objects."""
    features: list[dict] = []
    for a in data_access.list_alerts()[:limit]:
        raw = a.get("geojson")
        if raw:
            try:
                features.append(json.loads(raw))
                continue
            except (ValueError, TypeError):
                pass
        # Fallback: minimal feature from the row if no stored geometry.
        features.append({
            "type": "Feature",
            "geometry": None,
            "properties": {
                "alert_id": a.get("id"),
                "parameter": a.get("parameter"),
                "severity": a.get("severity"),
                "value": a.get("value"),
                "message": a.get("message"),
                "time": a.get("generated_at"),
            },
        })
    return features


def build_export(limit: int = 100) -> dict:
    """Assemble the classified CDS payload (mock) from current alert objects."""
    features = _features_from_alerts(limit)
    payload = {"type": "FeatureCollection", "features": features}
    sha256 = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
    return {
        "classification": CLASSIFICATION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_system": SOURCE_SYSTEM,
        "destination": DESTINATION,
        "transfer_format": TRANSFER_FORMAT,
        "record_count": len(features),
        "sha256": sha256,
        "mock": True,
        "note": ("Mock export — no data crosses the domain boundary. In production this "
                 "payload is pushed to the Government CDS drop point for SIPR/JWICS ingestion."),
        "payload": payload,
    }


def dispatch(limit: int = 100) -> dict:
    """Simulate pushing the payload through the CDS. Returns a transfer receipt."""
    export = build_export(limit)
    raw = json.dumps(export["payload"]).encode("utf-8")
    now = datetime.now(timezone.utc)
    receipt = {
        "transfer_id": "CDS-" + now.strftime("%Y%m%dT%H%M%SZ"),
        "status": "accepted (mock)",
        "classification": export["classification"],
        "destination": export["destination"],
        "transfer_format": export["transfer_format"],
        "record_count": export["record_count"],
        "bytes": len(raw),
        "sha256": export["sha256"],
        "dispatched_at": now.isoformat(),
        "mock": True,
        "note": export["note"],
    }
    data_access.audit("cds.export", f"Mock CDS dispatch {receipt['transfer_id']} ({export['record_count']} records)")
    return receipt
