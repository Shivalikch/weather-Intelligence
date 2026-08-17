"""MVP-3 :: Probabilistic & Operational-Impact panels (PWS Task 1).

Turns the deterministic point forecast into:
  * a calibrated **ensemble** (synthetic members + percentiles) that conveys
    forecast uncertainty / spread, and
  * plain-language **operational impacts** with a calibrated likelihood and a
    model-bias note — written for both general planners and expert forecasters.

Prototype note: production would ingest a real ensemble (GEFS / ECMWF AIFS);
here we generate a calibrated spread around the deterministic forecast so the
capability and UI are demonstrable end-to-end. Fetches go through
services.external_client; no database driver is imported.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timezone

from database import data_access
from services import external_client

# Per-layer 1-sigma spread model: (absolute base, relative fraction, growth/step).
# Uncertainty grows with lead time. Keyed by layer_key.
_SPREAD: dict[str, tuple[float, float, float]] = {
    "temperature_2m": (0.6, 0.00, 0.05),
    "wbgt": (0.6, 0.00, 0.05),
    "relative_humidity_2m": (3.0, 0.00, 0.04),
    "wind_10m": (1.0, 0.10, 0.06),
    "wind_gusts_10m": (1.5, 0.12, 0.06),
    "precipitation": (0.2, 0.60, 0.05),
    "cloud_cover": (5.0, 0.00, 0.04),
    "visibility": (200.0, 0.10, 0.05),
    "surface_pressure": (0.5, 0.00, 0.03),
    "dust": (10.0, 0.20, 0.05),
    "pm10": (5.0, 0.20, 0.05),
}
_NONNEG = {
    "wind_10m", "wind_gusts_10m", "precipitation", "cloud_cover", "visibility",
    "relative_humidity_2m", "dust", "pm10",
}


def _phi(x: float) -> float:
    """Standard normal CDF."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _percentile(sorted_vals: list[float], p: float):
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def _sigma(parameter: str, value: float, step: int) -> float:
    base, rel, growth = _SPREAD.get(parameter, (1.0, 0.08, 0.06))
    return max((base + rel * abs(value)) * (1.0 + growth * step), 1e-6)


def _clamp(parameter: str, x: float) -> float:
    if parameter in _NONNEG and x < 0:
        x = 0.0
    if parameter == "relative_humidity_2m" and x > 100:
        x = 100.0
    if parameter == "cloud_cover" and x > 100:
        x = 100.0
    return x


# ---------------------------------------------------------------------------
# Ensemble.
# ---------------------------------------------------------------------------
def ensemble(lat: float, lon: float, parameter: str = "temperature_2m",
             members: int = 20) -> dict:
    layer_row = data_access.get_layer(parameter)
    name = layer_row["name"] if layer_row else parameter
    unit = layer_row["unit"] if layer_row else ""

    forecast = external_client.fetch_point_forecast(lat, lon, [parameter])
    layer = next((l for l in forecast["layers"] if l["key"] == parameter), None)
    times = forecast.get("times", [])
    values = layer["values"] if layer else []

    # Deterministic seed so the same location/parameter yields the same spread.
    seed = int(abs(lat * 1000) + abs(lon * 1000)) + sum(ord(c) for c in parameter)
    rng = random.Random(seed)

    mem: list[list] = []
    for _ in range(members):
        row = []
        for i, v in enumerate(values):
            if v is None:
                row.append(None)
                continue
            x = _clamp(parameter, v + rng.gauss(0, _sigma(parameter, v, i)))
            row.append(round(x, 2))
        mem.append(row)

    pcts: dict[str, list] = {k: [] for k in ("p10", "p25", "p50", "p75", "p90")}
    for i in range(len(times)):
        col = sorted(mem[m][i] for m in range(members) if mem[m][i] is not None)
        for key, p in (("p10", 10), ("p25", 25), ("p50", 50), ("p75", 75), ("p90", 90)):
            val = _percentile(col, p)
            pcts[key].append(round(val, 2) if val is not None else None)

    return {
        "location": {"lat": lat, "lon": lon},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "parameter": parameter,
        "name": name,
        "unit": unit,
        "times": times,
        "member_count": members,
        "members": mem,
        "percentiles": pcts,
        "deterministic": values,
    }


# ---------------------------------------------------------------------------
# Operational impacts.
# ---------------------------------------------------------------------------
_OPS = {"gt": lambda v, t: v > t, "gte": lambda v, t: v >= t,
        "lt": lambda v, t: v < t, "lte": lambda v, t: v <= t}

_IMPACT_RULES = [
    {"key": "extreme_heat", "name": "Extreme heat (WBGT)", "parameter": "wbgt",
     "operator": "gt", "threshold": 32, "unit": "°C", "severity": "warning",
     "impact": "Enforce black-flag work/rest cycles; heat-casualty risk elevated.",
     "bias_note": "AI-NWP can under-represent peak WBGT in low-wind, high-insolation conditions."},
    {"key": "rotary_wing_wind", "name": "Rotary-wing wind", "parameter": "wind_10m",
     "operator": "gt", "threshold": 25, "unit": "kt", "severity": "warning",
     "impact": "Rotary-wing ops may exceed crosswind limits; expect holds/diverts.",
     "bias_note": "Ensembles tend to under-forecast peak gusts in convective regimes."},
    {"key": "convoy_visibility", "name": "Convoy visibility", "parameter": "visibility",
     "operator": "lt", "threshold": 3000, "unit": "m", "severity": "watch",
     "impact": "Reduced visibility for ground convoys; increase spacing, slow tempo.",
     "bias_note": "Visibility skill drops in dust; treat low-vis probability as a floor."},
    {"key": "blowing_dust", "name": "Blowing dust", "parameter": "dust",
     "operator": "gt", "threshold": 300, "unit": "µg/m³", "severity": "warning",
     "impact": "Degraded visibility & air quality; sortie generation at risk.",
     "bias_note": "Dust magnitude is highly uncertain; treat as watch until confirmed."},
    {"key": "heavy_precip", "name": "Heavy precipitation", "parameter": "precipitation",
     "operator": "gt", "threshold": 10, "unit": "mm", "severity": "watch",
     "impact": "Flash-flood & trafficability risk in wadis; protect low-lying assets.",
     "bias_note": "Convective totals are spiky; ensemble mean smooths true peaks."},
]


def impact(lat: float, lon: float) -> dict:
    params = sorted({r["parameter"] for r in _IMPACT_RULES})
    forecast = external_client.fetch_point_forecast(lat, lon, params)
    times = forecast.get("times", [])
    series = {l["key"]: l["values"] for l in forecast["layers"]}

    impacts = []
    for r in _IMPACT_RULES:
        vals = series.get(r["parameter"])
        if not vals:
            continue
        clean = [(i, v) for i, v in enumerate(vals) if v is not None]
        if not clean:
            continue
        if r["operator"] in ("gt", "gte"):
            peak_i, peak_v = max(clean, key=lambda x: x[1])
        else:
            peak_i, peak_v = min(clean, key=lambda x: x[1])

        sigma = _sigma(r["parameter"], peak_v, peak_i)
        z = (r["threshold"] - peak_v) / sigma
        like = (1.0 - _phi(z)) if r["operator"] in ("gt", "gte") else _phi(z)
        likelihood = round(max(0.0, min(100.0, like * 100.0)))
        active = _OPS[r["operator"]](peak_v, r["threshold"])

        impacts.append({
            "key": r["key"],
            "name": r["name"],
            "parameter": r["parameter"],
            "unit": r["unit"],
            "severity": r["severity"],
            "active": active,
            "likelihood": likelihood,
            "peak_value": round(peak_v, 1),
            "when": times[peak_i] if peak_i < len(times) else None,
            "impact": r["impact"],
            "bias_note": r["bias_note"],
        })

    impacts.sort(key=lambda x: (x["active"], x["likelihood"]), reverse=True)
    active_ones = [im for im in impacts if im["active"]]
    if active_ones:
        top = active_ones[0]
        impact_text = (
            f"⚠ {top['name']}: {top['impact']} "
            f"(~{int(top['likelihood'])}% likely, peak {top['peak_value']}{top['unit']})"
        )
    else:
        impact_text = "No significant operational impacts forecast in the next 48 h."

    return {
        "location": {"lat": lat, "lon": lon},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "impact_text": impact_text,
        "impacts": impacts,
    }
