"""MVP-4 :: Severe-Weather Detection Packs (PWS Task 4).

Pre-built, operator-independent detections that scan the CENTCOM AOR for
environmental shaping events (blowing dust, extreme heat, heavy precipitation,
convective wind, fog). Each pack is a threshold over a forecast parameter; the
engine runs every pack at each preset AOR location and emits GeoJSON detection
features.

Reads locations through data_access; fetches forecasts through
services.external_client (so the DB and network boundaries stay clean).
"""
from __future__ import annotations

from datetime import datetime, timezone

from database import data_access
from services import external_client

_OPS = {
    "gt": lambda v, t: v > t,
    "gte": lambda v, t: v >= t,
    "lt": lambda v, t: v < t,
    "lte": lambda v, t: v <= t,
    "eq": lambda v, t: v == t,
}
_SYM = {"gt": ">", "gte": "≥", "lt": "<", "lte": "≤", "eq": "="}

# Pre-built detection packs. Thresholds are prototype defaults tuned for the
# AOR; they map to PWS Task 4 environmental shaping events.
PACKS: list[dict] = [
    {
        "key": "dust", "name": "Blowing Dust & Sand", "icon": "🌪️",
        "parameter": "dust", "operator": "gt", "threshold": 300, "unit": "µg/m³",
        "severity": "warning",
        "description": "Airborne dust/sand concentration degrading visibility and air ops.",
    },
    {
        "key": "extreme_heat", "name": "Extreme Heat (WBGT)", "icon": "🌡️",
        "parameter": "wbgt", "operator": "gt", "threshold": 32, "unit": "°C",
        "severity": "warning",
        "description": "Heat-stress index above the black-flag work/rest threshold.",
    },
    {
        "key": "heavy_precip", "name": "Heavy Precipitation", "icon": "🌧️",
        "parameter": "precipitation", "operator": "gt", "threshold": 10, "unit": "mm",
        "severity": "watch",
        "description": "Intense rainfall risking flash flooding and reduced trafficability.",
    },
    {
        "key": "convection", "name": "Thunderstorms / Convective Wind", "icon": "⛈️",
        "parameter": "wind_gusts_10m", "operator": "gt", "threshold": 35, "unit": "kt",
        "severity": "warning",
        "description": "Convective wind gusts indicative of thunderstorm activity.",
    },
    {
        "key": "fog", "name": "Fog / Low Visibility", "icon": "🌫️",
        "parameter": "visibility", "operator": "lt", "threshold": 1000, "unit": "m",
        "severity": "watch",
        "description": "Visibility below approach/landing minimums.",
    },
]


def list_packs() -> list[dict]:
    return PACKS


def detect(locations: list[dict] | None = None) -> dict:
    """Run every pack at each location; return a GeoJSON FeatureCollection."""
    if locations is None:
        locations = data_access.list_locations()

    params = sorted({p["parameter"] for p in PACKS})
    features: list[dict] = []
    shared_times: list[str] = []

    for loc in locations:
        forecast = external_client.fetch_point_forecast(loc["lat"], loc["lon"], params)
        times = forecast.get("times", [])
        if not shared_times:
            shared_times = times
        series = {layer["key"]: layer["values"] for layer in forecast["layers"]}

        for pack in PACKS:
            values = series.get(pack["parameter"])
            if not values:
                continue
            op = _OPS[pack["operator"]]
            # Full breach flag per step (drives the green-zone timeline) + hits.
            flags = [bool(v is not None and op(v, pack["threshold"])) for v in values]
            hits = [(i, values[i]) for i, fl in enumerate(flags) if fl]
            if not hits:
                continue
            # Peak = worst value in the direction of the operator.
            if pack["operator"] in ("gt", "gte"):
                _, peak_v = max(hits, key=lambda x: x[1])
            else:
                _, peak_v = min(hits, key=lambda x: x[1])
            first_i = hits[0][0]
            when = times[first_i] if first_i < len(times) else None
            features.append(_feature(pack, loc, peak_v, when, sum(flags), flags))

    return {
        "type": "FeatureCollection",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "detections": len(features),
        "times": shared_times,
        "features": features,
    }


def _feature(pack: dict, loc: dict, value: float, when: str | None, hours: int,
             breaches: list[bool]) -> dict:
    sym = _SYM.get(pack["operator"], pack["operator"])
    message = (
        f"{pack['name']} at {loc['name']}: {pack['parameter']} peak {round(value, 1)}"
        f"{pack['unit']} ({sym} {pack['threshold']}{pack['unit']}) over {hours}h"
    )
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [loc["lon"], loc["lat"]]},
        "properties": {
            "pack": pack["key"],
            "name": pack["name"],
            "icon": pack["icon"],
            "severity": pack["severity"],
            "location": loc["name"],
            "country": loc.get("country", ""),
            "parameter": pack["parameter"],
            "operator": pack["operator"],
            "threshold": pack["threshold"],
            "value": round(value, 1),
            "unit": pack["unit"],
            "time": when,
            "hours_affected": hours,
            "breaches": breaches,
            "message": message,
        },
    }
