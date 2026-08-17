"""Shared pytest fixtures.

Tests run against an isolated temporary SQLite database (never the dev DB) and
mock the outbound HTTP call at the ``services.external_client._http_get_json``
boundary, so the suite is fully deterministic and needs no internet.
"""
from __future__ import annotations

import os
import pathlib
import sys
import tempfile

# --- isolate the test database BEFORE config/database are imported ----------
_TEST_DB = pathlib.Path(tempfile.gettempdir()) / "weatherman_test.db"
os.environ["DB_PATH"] = str(_TEST_DB)

# Make the backend/ package root importable (belt-and-braces with pytest).
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """A TestClient bound to a freshly-seeded temporary database."""
    if _TEST_DB.exists():
        _TEST_DB.unlink()
    from main import app  # imported here so env is already set

    with TestClient(app) as test_client:
        yield test_client


def fake_open_meteo(url: str, params: dict) -> dict:
    """Deterministic stand-in for an Open-Meteo response.

    Echoes whatever hourly fields were requested, with realistic AOR values
    (hot, dusty, breezy) so derived params like WBGT compute sensibly.
    """
    fields = [f for f in str(params.get("hourly", "")).split(",") if f]
    times = ["2026-07-29T00:00", "2026-07-29T01:00", "2026-07-29T02:00"]
    sample = {
        "temperature_2m": [41.2, 42.0, 40.5],
        "relative_humidity_2m": [18.0, 17.0, 20.0],
        "wind_speed_10m": [12.0, 15.0, 22.0],
        "wind_gusts_10m": [20.0, 25.0, 33.0],
        "precipitation": [0.0, 0.0, 0.1],
        "cloud_cover": [10.0, 5.0, 0.0],
        "visibility": [24000.0, 20000.0, 9000.0],
        "surface_pressure": [1008.0, 1007.0, 1006.0],
        "dust": [120.0, 240.0, 560.0],
        "pm10": [80.0, 140.0, 300.0],
    }
    hourly: dict = {"time": times}
    for field in fields:
        hourly[field] = sample.get(field, [1.0, 2.0, 3.0])
    return {"hourly": hourly}


@pytest.fixture
def mock_external(monkeypatch):
    """Patch the external HTTP boundary with the deterministic fake."""
    import services.external_client as ec

    monkeypatch.setattr(ec, "_http_get_json", fake_open_meteo)
    return fake_open_meteo
