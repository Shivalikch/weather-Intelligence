"""MVP-2 :: the no-code threshold / alerting engine.

Evaluates user-defined threshold rules against a point forecast and emits
machine-readable GeoJSON alert objects (PWS Task 3). It also returns a per-rule
**timeline** (the parameter's values across the forecast horizon with a breach
flag at each step) so the UI can visualise how each rule plays out over time.

The engine reads rules and persists generated alerts through data_access only;
it fetches forecast data through services.external_client.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from database import data_access
from services import external_client

# Supported comparison operators and their human-readable symbols.
_OPS = {
    "gt": (lambda v, t: v > t, ">"),
    "gte": (lambda v, t: v >= t, "≥"),
    "lt": (lambda v, t: v < t, "<"),
    "lte": (lambda v, t: v <= t, "≤"),
    "eq": (lambda v, t: v == t, "="),
}

VALID_OPERATORS = set(_OPS)

# Mock notification channels (no real page/call/email is sent).
_CHANNEL_LABEL = {"page": "📟 Page", "call": "📞 Automated call", "email": "✉ Email"}


def _breaches(value: float, operator: str, threshold: float) -> bool:
    fn = _OPS.get(operator)
    return bool(fn and fn[0](value, threshold))


def _parse_utc(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)


def evaluate(lat: float, lon: float, persist: bool = True) -> dict:
    """Evaluate all enabled rules at a location; return GeoJSON (+ timeline).

    When ``persist`` is False the breaches are returned but NOT written as
    alerts (used by read-only views such as the regional adapter).

    Returns a GeoJSON FeatureCollection (one feature per rule breach — first
    breaching step) augmented with:
      * evaluated_rules / breaches counts
      * a ``timeline`` object: {times, rules:[{..., values, breaches}]}
    """
    rules = [r for r in data_access.list_alert_rules() if r["enabled"]]
    features: list[dict] = []
    timeline_rules: list[dict] = []
    if not rules:
        return _collection(features, lat, lon, 0, {"times": [], "rules": []})

    # Fetch the union of parameters referenced by the active rules, once.
    params = sorted({r["parameter"] for r in rules})
    forecast = external_client.fetch_point_forecast(lat, lon, params)
    times = forecast.get("times", [])
    series = {layer["key"]: layer for layer in forecast["layers"]}
    now = datetime.now(timezone.utc)

    for rule in rules:
        layer = series.get(rule["parameter"])
        values = layer["values"] if layer else []

        # Breach flag at every step (for the timeline) + first breach (alert).
        breach_flags: list[bool] = []
        first_breach = None
        for i, value in enumerate(values):
            hit = value is not None and _breaches(value, rule["operator"], rule["threshold_value"])
            breach_flags.append(bool(hit))
            if hit and first_breach is None:
                first_breach = i

        if first_breach is not None:
            value = values[first_breach]
            when = times[first_breach] if first_breach < len(times) else None
            feature = _feature(rule, value, when, lat, lon)
            if persist:
                data_access.create_alert(
                    rule_id=rule["id"],
                    severity=rule["severity"],
                    parameter=rule["parameter"],
                    value=value,
                    message=feature["properties"]["message"],
                    geojson=json.dumps(feature),
                )
            features.append(feature)

        # Mock notification: fire if a breach falls within the lead-time window.
        channel = rule.get("notify_channel") or "none"
        within = int(rule.get("notify_within_hours") or 6)
        notify_due = False
        notify_at = None
        notify_message = None
        if channel != "none":
            horizon = now + timedelta(hours=within)
            for i, hit in enumerate(breach_flags):
                if hit and i < len(times) and now <= _parse_utc(times[i]) <= horizon:
                    notify_due = True
                    notify_at = times[i]
                    break
            if notify_due:
                label = _CHANNEL_LABEL.get(channel, channel)
                notify_message = (
                    f"{label} dispatched (mock) — '{rule['name']}' breaches within {within}h"
                )
                data_access.audit("notify.mock", notify_message)

        timeline_rules.append({
            "rule_id": rule["id"],
            "name": rule["name"],
            "parameter": rule["parameter"],
            "unit": rule.get("unit") or "",
            "operator": rule["operator"],
            "threshold": rule["threshold_value"],
            "severity": rule["severity"],
            "values": values,
            "breaches": breach_flags,
            "breach_count": sum(breach_flags),
            "notify_channel": channel,
            "notify_within_hours": within,
            "notify_due": notify_due,
            "notify_at": notify_at,
            "notify_message": notify_message,
        })

    return _collection(features, lat, lon, len(rules), {"times": times, "rules": timeline_rules})


def _feature(rule: dict, value: float, when: str | None, lat: float, lon: float) -> dict:
    symbol = _OPS.get(rule["operator"], (None, rule["operator"]))[1]
    unit = rule.get("unit") or ""
    message = (
        f"{rule['name']}: {rule['parameter']} {value}{unit} {symbol} "
        f"{rule['threshold_value']}{unit}"
        + (f" at {when}" if when else "")
        + f" ({rule['severity']})"
    )
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "rule_id": rule["id"],
            "rule": rule["name"],
            "mission_type": rule.get("mission_type") or "",
            "parameter": rule["parameter"],
            "operator": rule["operator"],
            "threshold": rule["threshold_value"],
            "unit": unit,
            "value": value,
            "severity": rule["severity"],
            "time": when,
            "message": message,
        },
    }


def _collection(features: list[dict], lat: float, lon: float, evaluated_rules: int,
                timeline: dict) -> dict:
    return {
        "type": "FeatureCollection",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "location": {"lat": lat, "lon": lon},
        "evaluated_rules": evaluated_rules,
        "breaches": len(features),
        "features": features,
        "timeline": timeline,
    }
