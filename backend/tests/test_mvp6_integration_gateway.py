"""MVP-6 :: Integration & CDS Export Gateway -- implemented; MUST pass.

Covers the mock classified CDS export payload (GeoJSON + classification marking
+ checksum) and the dispatch receipt. No network needed (aggregates persisted
alert objects), so these are deterministic.
"""
import pytest

pytestmark = pytest.mark.mvp6


def test_status(client):
    r = client.get("/api/integration")
    assert r.status_code == 200
    body = r.json()
    assert body["mvp"] == "MVP-6"
    assert body["pws_task"] == "Task 5"
    assert any("cds" in ep.lower() for ep in body["endpoints"])


def test_cds_export_payload_preview(client):
    r = client.get("/api/integration/cds/preview")
    assert r.status_code == 200
    body = r.json()
    # Mock CDS payload destined for SIPR/JWICS.
    assert body["classification"]
    assert body["payload"]["type"] == "FeatureCollection"
    assert isinstance(body["payload"]["features"], list)
    assert body["record_count"] == len(body["payload"]["features"])
    assert len(body["sha256"]) == 64          # sha-256 hex digest
    assert body["mock"] is True
    assert "SIPRNet" in body["destination"]["enclaves"]


def test_cds_dispatch_receipt(client):
    r = client.post("/api/integration/cds/export")
    assert r.status_code == 200
    receipt = r.json()
    assert receipt["transfer_id"].startswith("CDS-")
    assert receipt["status"] == "accepted (mock)"
    assert receipt["bytes"] >= 0
    assert len(receipt["sha256"]) == 64
    assert receipt["mock"] is True
