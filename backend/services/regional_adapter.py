"""MVP-5 :: High-Resolution Regional Model Adapter (PWS Task 2).

Adapts the platform's forecast into a **3 km grid / 15-minute cadence** product
over the CENTCOM AOR, with a 36-hour horizon. Production would ingest a real
convection-permitting regional ensemble (HRRR-analog); the prototype adapter
densifies the deterministic hourly forecast to 15-minute steps (temporal
downscaling) and produces a smooth 3 km spatial grid, so the adapter contract
and UI are demonstrable end-to-end.

Reads layers/locations through data_access; fetches through external_client.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from database import data_access
from services import external_client

GRID_KM = 3
STEP_MINUTES = 15
HORIZON_HOURS = 36
MODEL_NAME = "Convection-permitting regional (HRRR-analog, prototype)"
SOURCE = "noaa_hrrr"


def _interp_15min(times: list[str], values: list, hours: int) -> tuple[list[str], list]:
    """Linearly densify hourly values to 15-minute steps over `hours`."""
    if len(times) < 2:
        return list(times), list(values)
    dts = [datetime.fromisoformat(t) for t in times]
    n_intervals = min(hours, len(dts) - 1)

    out_t: list[str] = []
    out_v: list = []
    for i in range(n_intervals):
        v0, v1 = values[i], values[i + 1]
        for step in range(4):  # :00 :15 :30 :45
            tt = dts[i] + timedelta(minutes=STEP_MINUTES * step)
            out_t.append(tt.strftime("%Y-%m-%dT%H:%M"))
            if v0 is None or v1 is None:
                out_v.append(None)
            else:
                out_v.append(round(v0 + (v1 - v0) * (step / 4.0), 2))
    # closing point of the horizon
    out_t.append(dts[n_intervals].strftime("%Y-%m-%dT%H:%M"))
    out_v.append(values[n_intervals])
    return out_t, out_v


def high_res_forecast(lat: float, lon: float, layer_keys: list[str] | None = None,
                      hours: int = HORIZON_HOURS) -> dict:
    if not layer_keys:
        layer_keys = [r["layer_key"] for r in data_access.list_layers() if r["default_visible"]]

    forecast = external_client.fetch_point_forecast(lat, lon, layer_keys, forecast_days=2)
    hourly_times = forecast.get("times", [])

    times15: list[str] = []
    out_layers = []
    for layer in forecast["layers"]:
        t15, v15 = _interp_15min(hourly_times, layer["values"], hours)
        if not times15:
            times15 = t15
        out_layers.append({
            "key": layer["key"],
            "name": layer["name"],
            "unit": layer["unit"],
            "category": layer["category"],
            "values": v15,
        })

    covered = min(hours, max(len(hourly_times) - 1, 0))
    return {
        "location": {"lat": lat, "lon": lon},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "grid_km": GRID_KM,
        "step_minutes": STEP_MINUTES,
        "horizon_hours": covered,
        "requested_hours": hours,
        "model": MODEL_NAME,
        "source": SOURCE,
        "times": times15,
        "layers": out_layers,
    }


def spatial_grid(lat: float, lon: float, parameter: str = "temperature_2m", n: int = 5) -> dict:
    layer_row = data_access.get_layer(parameter)
    name = layer_row["name"] if layer_row else parameter
    unit = layer_row["unit"] if layer_row else ""

    forecast = external_client.fetch_point_forecast(lat, lon, [parameter])
    layer = next((l for l in forecast["layers"] if l["key"] == parameter), None)
    times = forecast.get("times", [])
    values = layer["values"] if layer else []

    # Centre value at the step closest to now.
    now = datetime.now(timezone.utc)
    idx, best = 0, None
    for i, t in enumerate(times):
        d = abs((datetime.fromisoformat(t).replace(tzinfo=timezone.utc) - now).total_seconds())
        if best is None or d < best:
            best, idx = d, i
    center = values[idx] if values and values[idx] is not None else 0.0

    deg = GRID_KM / 111.0
    cos_lat = math.cos(math.radians(lat)) or 1.0
    half = n // 2

    cells = []
    vmin = vmax = None
    for iy in range(n):
        for ix in range(n):
            dx, dy = ix - half, iy - half
            plat = round(lat + dy * deg, 4)
            plon = round(lon + (dx * deg) / cos_lat, 4)
            # deterministic smooth 3km field around the centre value
            v = round(center + 0.35 * dx - 0.22 * dy + 0.06 * (dx * dy) + 0.15 * math.sin(dx + dy), 1)
            cells.append({"row": iy, "col": ix, "lat": plat, "lon": plon, "value": v})
            vmin = v if vmin is None else min(vmin, v)
            vmax = v if vmax is None else max(vmax, v)

    return {
        "parameter": parameter,
        "name": name,
        "unit": unit,
        "grid_km": GRID_KM,
        "n": n,
        "center": {"lat": lat, "lon": lon},
        "at_time": times[idx] if times else None,
        "min": vmin,
        "max": vmax,
        "cells": cells,
    }
