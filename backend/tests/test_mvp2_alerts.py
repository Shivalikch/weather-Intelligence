"""MVP-2 :: No-Code Threshold & Alerting Engine -- implemented; MUST pass.

Covers the full engine contract: author a rule, list rules, reject bad input,
evaluate rules against a forecast into machine-readable GeoJSON, detect a real
breach & persist the alert, and delete rules. External HTTP is mocked so the
suite is deterministic (fake dust series peaks at 560 µg/m³; wind at 22 kt).
"""
import pytest

pytestmark = pytest.mark.mvp2


def test_create_rule_returns_201_with_id(client):
    payload = {
        "name": "Rotary-wing wind limit",
        "parameter": "wind_10m",
        "operator": "gt",
        "threshold_value": 25,
        "unit": "kt",
        "severity": "warning",
        "mission_type": "rotary_wing",
    }
    r = client.post("/api/alerts/rules", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["id"] > 0
    assert body["name"] == payload["name"]
    assert body["operator"] == "gt"
    assert body["enabled"] is True


def test_rules_are_listable(client):
    r = client.get("/api/alerts/rules")
    assert r.status_code == 200
    rules = r.json()
    assert isinstance(rules, list)
    assert any(x["name"] == "Rotary-wing wind limit" for x in rules)


def test_create_rule_rejects_bad_operator(client):
    r = client.post(
        "/api/alerts/rules",
        json={"name": "bad", "parameter": "wind_10m", "operator": "between", "threshold_value": 5},
    )
    assert r.status_code == 422


def test_evaluate_returns_geojson_collection(client, mock_external):
    r = client.post("/api/alerts/evaluate", json={"lat": 29.35, "lon": 47.52})
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection"
    assert isinstance(fc["features"], list)
    assert "evaluated_rules" in fc


def test_evaluate_detects_breach_and_persists_alert(client, mock_external):
    # Fake dust series peaks at 560 µg/m³; threshold 500 => breach.
    client.post(
        "/api/alerts/rules",
        json={"name": "Dust storm", "parameter": "dust", "operator": "gt",
              "threshold_value": 500, "unit": "µg/m³", "severity": "warning"},
    )
    fc = client.post("/api/alerts/evaluate", json={"lat": 29.35, "lon": 47.52}).json()
    dust = [f for f in fc["features"] if f["properties"]["parameter"] == "dust"]
    assert len(dust) >= 1
    feat = dust[0]
    assert feat["type"] == "Feature"
    assert feat["geometry"]["type"] == "Point"
    assert feat["geometry"]["coordinates"] == [47.52, 29.35]
    assert feat["properties"]["severity"] == "warning"
    assert feat["properties"]["value"] > 500

    # The generated alert is persisted and listable.
    alerts = client.get("/api/alerts").json()
    assert isinstance(alerts, list)
    assert any(a["parameter"] == "dust" and a["severity"] == "warning" for a in alerts)


def test_evaluate_no_feature_for_impossible_threshold(client, mock_external):
    client.post(
        "/api/alerts/rules",
        json={"name": "Impossible dust", "parameter": "dust", "operator": "gt",
              "threshold_value": 100000, "unit": "µg/m³", "severity": "advisory"},
    )
    fc = client.post("/api/alerts/evaluate", json={"lat": 29.35, "lon": 47.52}).json()
    assert not any(f["properties"]["rule"] == "Impossible dust" for f in fc["features"])


def test_delete_rule(client):
    created = client.post(
        "/api/alerts/rules",
        json={"name": "temp-to-delete", "parameter": "temperature_2m", "operator": "gt",
              "threshold_value": 60, "unit": "°C", "severity": "advisory"},
    ).json()
    d = client.delete(f"/api/alerts/rules/{created['id']}")
    assert d.status_code == 204
    rules = client.get("/api/alerts/rules").json()
    assert not any(x["id"] == created["id"] for x in rules)


def test_delete_missing_rule_returns_404(client):
    assert client.delete("/api/alerts/rules/999999").status_code == 404


def test_evaluate_rejects_bad_coords(client, mock_external):
    r = client.post("/api/alerts/evaluate", json={"lat": 999, "lon": 0})
    assert r.status_code == 422
