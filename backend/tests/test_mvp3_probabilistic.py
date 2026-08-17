"""MVP-3 :: Probabilistic & Operational-Impact Panels -- implemented; MUST pass.

Covers ensemble spread (members + monotonic percentiles) and plain-language
operational impacts with calibrated likelihood + model-bias notes. External
HTTP is mocked, so the fake forecast (dust peaking at 560 µg/m³) makes the dust
impact deterministically active.
"""
import pytest

pytestmark = pytest.mark.mvp3


def test_status(client):
    r = client.get("/api/probabilistic")
    assert r.status_code == 200
    body = r.json()
    assert body["mvp"] == "MVP-3"
    assert body["pws_task"].startswith("Task 1")


def test_ensemble_spread(client, mock_external):
    r = client.get("/api/probabilistic/ensemble", params={"lat": 29.35, "lon": 47.52})
    assert r.status_code == 200
    body = r.json()
    assert "members" in body and "percentiles" in body
    assert body["parameter"] == "temperature_2m"
    assert body["member_count"] >= 5
    assert len(body["members"]) == body["member_count"]

    pct = body["percentiles"]
    assert {"p10", "p50", "p90"} <= set(pct)
    assert len(pct["p50"]) == len(body["times"])
    # Percentiles are ordered at every step.
    for lo, mid, hi in zip(pct["p10"], pct["p50"], pct["p90"]):
        assert lo <= mid <= hi


def test_ensemble_specific_parameter(client, mock_external):
    r = client.get("/api/probabilistic/ensemble", params={"lat": 29.35, "lon": 47.52, "parameter": "wind_10m"})
    assert r.status_code == 200
    assert r.json()["parameter"] == "wind_10m"


def test_ensemble_rejects_bad_coords(client, mock_external):
    r = client.get("/api/probabilistic/ensemble", params={"lat": 999, "lon": 0})
    assert r.status_code == 422


def test_impact_plain_language(client, mock_external):
    r = client.get("/api/probabilistic/impact", params={"lat": 29.35, "lon": 47.52})
    assert r.status_code == 200
    body = r.json()
    assert "impact_text" in body and body["impact_text"]
    assert isinstance(body["impacts"], list) and len(body["impacts"]) >= 1
    for im in body["impacts"]:
        assert 0 <= im["likelihood"] <= 100
        assert im["bias_note"]          # forecaster-facing model-bias cue
        assert im["impact"]             # planner-facing plain language


def test_impact_flags_dust(client, mock_external):
    body = client.get("/api/probabilistic/impact", params={"lat": 29.35, "lon": 47.52}).json()
    dust = next((im for im in body["impacts"] if im["key"] == "blowing_dust"), None)
    assert dust is not None
    assert dust["active"] is True       # fake dust peak 560 > 300 threshold
    assert dust["likelihood"] >= 50


def test_impact_rejects_bad_coords(client, mock_external):
    r = client.get("/api/probabilistic/impact", params={"lat": 0, "lon": 999})
    assert r.status_code == 422
