"""MVP-7 :: AI-Native Global Prediction Engine -- implemented; MUST pass.

Covers the AI-NWP engine metadata and a probabilistic prediction that reuses the
platform's ensemble interface. External HTTP is mocked, so the prediction is
deterministic.
"""
import pytest

pytestmark = pytest.mark.mvp7


def test_status_root(client):
    r = client.get("/api/model")
    assert r.status_code == 200
    body = r.json()
    assert body["mvp"] == "MVP-7"
    assert body["pws_task"].startswith("Task 1")
    assert body["engine"]


def test_model_status_reports_backend(client):
    r = client.get("/api/model/status")
    assert r.status_code == 200
    body = r.json()
    assert body["engine"]              # e.g. GraphCast / AIFS / FourCastNet class
    assert body["resolution_km"]
    assert body["ensemble_members"] >= 1
    assert isinstance(body["assimilation"], list) and len(body["assimilation"]) >= 1
    assert body["compute"]
    assert body["data_layers"] >= 60    # PWS Task 1 minimum


def test_predict(client, mock_external):
    r = client.get("/api/model/predict", params={"lat": 29.35, "lon": 47.52})
    assert r.status_code == 200
    body = r.json()
    assert body["engine"]
    assert body["parameter"] == "temperature_2m"
    assert "percentiles" in body and "p50" in body["percentiles"]
    assert len(body["times"]) > 0
    assert 0.0 <= body["skill_score"] <= 1.0


def test_predict_rejects_bad_coords(client, mock_external):
    r = client.get("/api/model/predict", params={"lat": 0, "lon": 999})
    assert r.status_code == 422
