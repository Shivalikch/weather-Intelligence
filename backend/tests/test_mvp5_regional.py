"""MVP-5 :: High-Resolution Regional Model Adapter -- implemented; MUST pass.

Covers the 3 km / 15-minute regional forecast (temporal densification of the
hourly forecast) and the 3 km spatial grid. External HTTP is mocked, so the
15-minute cadence and grid are deterministic.
"""
from datetime import datetime

import pytest

pytestmark = pytest.mark.mvp5


def test_status(client):
    r = client.get("/api/regional")
    assert r.status_code == 200
    body = r.json()
    assert body["mvp"] == "MVP-5"
    assert body["pws_task"] == "Task 2"
    assert body["grid_km"] == 3
    assert body["step_minutes"] == 15


def test_high_res_regional_forecast(client, mock_external):
    r = client.get("/api/regional/forecast", params={"lat": 29.35, "lon": 47.52})
    assert r.status_code == 200
    body = r.json()
    # 3km / 15-minute cadence (PWS Task 2).
    assert body["grid_km"] == 3
    assert body["step_minutes"] == 15
    assert body["horizon_hours"] >= 1
    assert len(body["layers"]) >= 1

    times = body["times"]
    assert len(times) >= 2
    # consecutive 15-minute steps
    t0 = datetime.fromisoformat(times[0])
    t1 = datetime.fromisoformat(times[1])
    assert (t1 - t0).total_seconds() == 900
    for layer in body["layers"]:
        assert len(layer["values"]) == len(times)


def test_forecast_rejects_bad_coords(client, mock_external):
    r = client.get("/api/regional/forecast", params={"lat": 999, "lon": 0})
    assert r.status_code == 422


def test_spatial_grid(client, mock_external):
    r = client.get("/api/regional/grid", params={"lat": 29.35, "lon": 47.52, "parameter": "temperature_2m"})
    assert r.status_code == 200
    body = r.json()
    assert body["grid_km"] == 3
    assert body["parameter"] == "temperature_2m"
    assert body["n"] >= 3
    assert len(body["cells"]) == body["n"] * body["n"]
    for cell in body["cells"]:
        assert {"lat", "lon", "value", "row", "col"} <= set(cell)
    assert body["min"] <= body["max"]


def test_grid_rejects_bad_coords(client, mock_external):
    r = client.get("/api/regional/grid", params={"lat": 0, "lon": 999})
    assert r.status_code == 422
