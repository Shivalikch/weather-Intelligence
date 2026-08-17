"""Outbound calls to external weather data sources.

The definitions of WHERE to call (base URL, path, auth, format) are NOT
hard-coded here -- they are read from the ``external_api`` table via
data_access. This module only knows HOW to call and how to normalise the
response into the shape the API layer returns.

MVP-1 uses only key-less sources (Open-Meteo, NASA GIBS), so the prototype
runs with no registration.
"""
from __future__ import annotations

import math
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx

from database import data_access

_HTTP_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
_USER_AGENT = "AFCENT-Weatherman-Prototype/0.1 (contact: prototype@example.mil)"
_RETRIES = 3          # transient throttling / SSL-handshake timeouts recover on retry
_CACHE_TTL = 120.0    # seconds; dedups concurrent/repeat identical fetches

# Which external_api rows can supply point time-series for MVP-1.
_POINT_SOURCES = {"open_meteo_forecast", "open_meteo_air_quality"}

# Sources this prototype actually calls over the wire today. Every other row in
# the external_api catalogue is the documented production source for that
# capability (see the architecture doc) but is not yet wired to a live adapter.
# Exposed so the UI can label a source "live" vs "catalogued" honestly.
LIVE_SOURCES = _POINT_SOURCES | {"nasa_gibs_wmts"}

# Small in-process response cache (the free Open-Meteo tier throttles bursts).
_CACHE: dict[tuple, tuple[float, dict]] = {}
_CACHE_LOCK = threading.Lock()


class ExternalDataError(RuntimeError):
    """Raised when an external source cannot be reached or returns bad data."""


def _cache_key(url: str, params: dict) -> tuple:
    return (url, tuple(sorted((k, str(v)) for k, v in params.items())))


def _http_get_json(url: str, params: dict) -> dict:
    """GET + parse JSON, with a TTL cache and retry/backoff. Mocked in tests."""
    key = _cache_key(url, params)
    now = time.time()
    with _CACHE_LOCK:
        hit = _CACHE.get(key)
        if hit and now - hit[0] < _CACHE_TTL:
            return hit[1]

    last_exc: Exception | None = None
    for attempt in range(_RETRIES):
        try:
            with httpx.Client(timeout=_HTTP_TIMEOUT, headers={"User-Agent": _USER_AGENT}) as client:
                resp = client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
            with _CACHE_LOCK:
                _CACHE[key] = (time.time(), data)
            return data
        except httpx.HTTPError as exc:  # pragma: no cover - network failure path
            last_exc = exc
            if attempt < _RETRIES - 1:
                time.sleep(0.5 * (attempt + 1))  # 0.5s, 1.0s backoff
    raise ExternalDataError(f"External source failed after {_RETRIES} tries: {url} ({last_exc})") from last_exc


# ---------------------------------------------------------------------------
# Derived parameters.
# ---------------------------------------------------------------------------
def _wbgt(temp_c: float | None, rh_pct: float | None) -> float | None:
    """Simplified shade WBGT (Australian BoM approximation).

    WBGT ~= 0.567*T + 0.393*e + 3.94, with vapour pressure e derived from RH.
    """
    if temp_c is None or rh_pct is None:
        return None
    e = (rh_pct / 100.0) * 6.105 * math.exp(17.27 * temp_c / (237.7 + temp_c))
    return round(0.567 * temp_c + 0.393 * e + 3.94, 1)


# ---------------------------------------------------------------------------
# Public: point forecast (MVP-1).
# ---------------------------------------------------------------------------
def fetch_point_forecast(lat: float, lon: float, layer_keys: list[str],
                         forecast_days: int = 2) -> dict:
    """Return a normalised multi-layer point forecast for the given location.

    Shape:
        {
          "location": {"lat": .., "lon": ..},
          "generated_at": "<iso>",
          "times": ["<iso>", ...],
          "layers": [
            {"key","name","unit","category","values":[...]}, ...
          ]
        }
    """
    requested = _resolve_layers(layer_keys)

    # Group the source-backed layers by their external_api definition.
    groups: dict[str, list[dict]] = {}
    derived: list[dict] = []
    for layer in requested:
        api_name = layer.get("external_api_name") or ""
        if layer["category"] == "derived" or not api_name:
            derived.append(layer)
        elif api_name in _POINT_SOURCES:
            groups.setdefault(api_name, []).append(layer)
        # satellite / non-point layers are ignored for point forecasts.

    times: list[str] = []
    values_by_field: dict[str, list] = {}

    for api_name, layers in groups.items():
        api = data_access.get_external_api(api_name)
        if not api:
            continue
        fields = [l["source_field"] for l in layers if l["source_field"]]
        if not fields:
            continue
        payload = _call_open_meteo(api, lat, lon, fields, forecast_days)
        hourly = payload.get("hourly", {})
        if not times and "time" in hourly:
            times = hourly["time"]
        for field in fields:
            if field in hourly:
                values_by_field[field] = hourly[field]

    # Emit ONLY the layers the caller explicitly requested (preserve order).
    # Dependency layers pulled in for derived params (e.g. temperature/humidity
    # for WBGT) are used for computation but are NOT returned unless they were
    # themselves requested -- otherwise disabling a toggle would leave its card.
    out_layers = []
    seen_out: set[str] = set()
    for key in layer_keys:
        if key in seen_out:
            continue
        seen_out.add(key)
        layer = data_access.get_layer(key)
        if not layer:
            continue
        if layer["category"] == "derived" and layer["layer_key"] == "wbgt":
            temps = values_by_field.get("temperature_2m")
            rhs = values_by_field.get("relative_humidity_2m")
            if temps and rhs:
                vals = [_wbgt(t, r) for t, r in zip(temps, rhs)]
                out_layers.append(_layer_out(layer, vals))
            continue
        field = layer.get("source_field")
        if field and field in values_by_field:
            out_layers.append(_layer_out(layer, values_by_field[field]))

    return {
        "location": {"lat": lat, "lon": lon},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "times": times,
        "layers": out_layers,
    }


def _resolve_layers(layer_keys: list[str]) -> list[dict]:
    """Resolve requested keys to layer rows; auto-add WBGT dependencies."""
    resolved: list[dict] = []
    seen: set[str] = set()

    def _add(key: str):
        if key in seen:
            return
        row = data_access.get_layer(key)
        if row:
            resolved.append(row)
            seen.add(key)

    for key in layer_keys:
        _add(key)
        # WBGT needs temperature + humidity fetched even if not displayed.
        if key == "wbgt":
            _add("temperature_2m")
            _add("relative_humidity_2m")
    return resolved


def _call_open_meteo(api: dict, lat: float, lon: float, fields: list[str],
                     forecast_days: int) -> dict:
    url = api["base_url"] + api["endpoint_path"]
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(fields),
        "wind_speed_unit": "kn",
        "timezone": "UTC",
        "forecast_days": forecast_days,
    }
    return _http_get_json(url, params)


def _layer_out(layer: dict, values: list) -> dict:
    return {
        "key": layer["layer_key"],
        "name": layer["name"],
        "unit": layer["unit"],
        "category": layer["category"],
        "values": values,
    }


# ---------------------------------------------------------------------------
# Public: satellite tile template (MVP-1 map basemap overlays).
# ---------------------------------------------------------------------------
def build_tile_template(layer: dict) -> str | None:
    """Build a {z}/{x}/{y} WMTS tile template for a satellite layer, or None."""
    if layer["category"] != "satellite":
        return None
    api = data_access.get_external_api(layer.get("external_api_name") or "")
    if not api or api["data_format"] != "wmts":
        return None
    product = layer["source_field"]
    day = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    # GIBS REST WMTS template (MapLibre fills {z}/{x}/{y}).
    return (
        f"{api['base_url']}{api['endpoint_path']}/{product}/default/{day}/"
        "GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg"
    )
