"""MVP-1 :: Map-Centric METOC Viewer -- implemented; these MUST pass.

Covers the full foundation contract the frontend map viewer depends on:
meta/health, external-api catalogue, AOR definition, layer catalogue,
preset locations, and the point-forecast time-series (incl. derived WBGT).
"""
import pytest

pytestmark = pytest.mark.mvp1


# --- meta / health ---------------------------------------------------------
def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["database"] == "up"
    assert body["version"]


def test_config_seeded(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    cfg = r.json()
    assert cfg["aor_name"]
    assert "aor_bbox" in cfg
    # PWS cadences are surfaced for the UI.
    assert cfg["refresh_high_res_minutes"] == "15"


def test_external_apis_catalogue(client):
    r = client.get("/api/external-apis")
    assert r.status_code == 200
    apis = r.json()
    names = {a["name"] for a in apis}
    # MVP-1 key-less sources must be present.
    assert {"open_meteo_forecast", "nasa_gibs_wmts"} <= names
    # Registration-based sources must carry a register URL.
    for a in apis:
        if a["auth_type"] == "registration":
            assert a["requires_key"] is True
            assert a["register_url"].startswith("http")


# --- AOR / layers / locations ----------------------------------------------
def test_aor_definition(client):
    r = client.get("/api/aor")
    assert r.status_code == 200
    aor = r.json()
    assert len(aor["bbox"]) == 4
    assert "lat" in aor["center"] and "lon" in aor["center"]
    assert aor["refresh"]["high_res_minutes"] == 15


def test_layers_catalogue(client):
    r = client.get("/api/layers")
    assert r.status_code == 200
    layers = r.json()
    keys = {l["key"] for l in layers}
    assert {"temperature_2m", "wind_10m", "precipitation", "wbgt"} <= keys
    # At least one default-visible layer for first paint.
    assert any(l["default_visible"] for l in layers)
    # Satellite layer exposes a {z}/{x}/{y} tile template; data layers do not.
    sat = next(l for l in layers if l["key"] == "satellite_truecolor")
    assert sat["tile_url_template"] and "{z}" in sat["tile_url_template"]
    temp = next(l for l in layers if l["key"] == "temperature_2m")
    assert temp["tile_url_template"] is None


def test_locations_default_is_aor(client):
    r = client.get("/api/locations")
    assert r.status_code == 200
    locs = r.json()
    defaults = [l for l in locs if l["is_aor_default"]]
    assert len(defaults) == 1
    assert defaults[0]["name"] == "Ali Al Salem AB"


# --- forecast --------------------------------------------------------------
def test_forecast_default_layers(client, mock_external):
    r = client.get("/api/forecast", params={"lat": 29.35, "lon": 47.52})
    assert r.status_code == 200
    body = r.json()
    assert body["location"]["lat"] == 29.35
    assert len(body["times"]) == 3
    keys = {l["key"] for l in body["layers"]}
    # Defaults are the visible layers.
    assert {"temperature_2m", "wind_10m", "precipitation"} <= keys
    for layer in body["layers"]:
        assert len(layer["values"]) == len(body["times"])


def test_forecast_specific_layer_dust(client, mock_external):
    r = client.get("/api/forecast", params={"lat": 29.35, "lon": 47.52, "layers": "dust"})
    assert r.status_code == 200
    layers = r.json()["layers"]
    dust = next(l for l in layers if l["key"] == "dust")
    assert dust["unit"] == "µg/m³"
    assert dust["values"] == [120.0, 240.0, 560.0]


def test_forecast_derived_wbgt(client, mock_external):
    r = client.get("/api/forecast", params={"lat": 29.35, "lon": 47.52, "layers": "wbgt"})
    assert r.status_code == 200
    layers = {l["key"]: l for l in r.json()["layers"]}
    assert "wbgt" in layers
    # WBGT is derived and finite for the hot/dry sample.
    vals = layers["wbgt"]["values"]
    assert all(v is not None for v in vals)
    assert 20 < vals[0] < 60


def test_forecast_multi_source_grouping(client, mock_external):
    # temperature_2m (forecast source) + dust (air-quality source) => two groups.
    r = client.get(
        "/api/forecast",
        params={"lat": 29.35, "lon": 47.52, "layers": "temperature_2m,dust"},
    )
    assert r.status_code == 200
    keys = {l["key"] for l in r.json()["layers"]}
    assert {"temperature_2m", "dust"} <= keys


def test_forecast_rejects_bad_latitude(client, mock_external):
    r = client.get("/api/forecast", params={"lat": 999, "lon": 47.52})
    assert r.status_code == 422  # FastAPI query validation


def test_forecast_unknown_layer_returns_502(client, mock_external):
    r = client.get("/api/forecast", params={"lat": 29.35, "lon": 47.52, "layers": "does_not_exist"})
    assert r.status_code == 502
