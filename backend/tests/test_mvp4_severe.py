"""MVP-4 :: Severe-Weather Detection Packs -- implemented; MUST pass.

Covers the pack catalogue and AOR-wide detection into machine-readable GeoJSON.
External HTTP is mocked (fake dust series peaks at 560 µg/m³ > the 300 pack
threshold), so dust detections are deterministic while the other packs stay
clear.
"""
import pytest

pytestmark = pytest.mark.mvp4


def test_status(client):
    r = client.get("/api/severe")
    assert r.status_code == 200
    body = r.json()
    assert body["mvp"] == "MVP-4"
    assert body["pws_task"] == "Task 4"
    assert body["packs"] >= 4


def test_packs_listed(client):
    r = client.get("/api/severe/packs")
    assert r.status_code == 200
    packs = r.json()
    keys = {p["key"] for p in packs}
    assert {"dust", "extreme_heat", "convection", "fog"} <= keys
    for p in packs:
        assert p["name"] and p["parameter"]
        assert p["operator"] in {"gt", "gte", "lt", "lte", "eq"}


def test_aor_detections_geojson(client, mock_external):
    r = client.get("/api/severe/detections")
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection"
    assert isinstance(fc["features"], list)
    assert fc["detections"] == len(fc["features"])


def test_detections_flag_dust(client, mock_external):
    fc = client.get("/api/severe/detections").json()
    dust = [f for f in fc["features"] if f["properties"]["pack"] == "dust"]
    assert len(dust) >= 1  # dust detected across the AOR preset locations
    feat = dust[0]
    assert feat["type"] == "Feature"
    assert feat["geometry"]["type"] == "Point"
    assert feat["properties"]["severity"] == "warning"
    assert feat["properties"]["value"] > 300
    assert feat["properties"]["location"]


def test_detections_single_point(client, mock_external):
    r = client.get("/api/severe/detections", params={"lat": 29.35, "lon": 47.52})
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection"
    # A single point yields at most one detection per pack.
    assert all(f["geometry"]["coordinates"] == [47.52, 29.35] for f in fc["features"])


def test_detections_rejects_bad_coords(client, mock_external):
    r = client.get("/api/severe/detections", params={"lat": 999, "lon": 0})
    assert r.status_code == 422
