"""MVP-2 :: No-Code Threshold & Alerting Engine (PWS Task 3) -- implemented.

Lets planners author mission thresholds (e.g. rotary-wing wind limits, convoy
visibility minimums), evaluates them against a point forecast, and emits
machine-readable GeoJSON alert objects. The API layer stays DB-agnostic: it
calls data_access for persistence and rules_engine for evaluation.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from api.schemas import AlertOut, AlertRuleIn, AlertRuleOut, EvaluateIn
from database import data_access
from services import rules_engine

router = APIRouter(prefix="/api/alerts", tags=["MVP-2 · Alerting Engine"])


def _rule_out(row: dict) -> AlertRuleOut:
    return AlertRuleOut(
        id=row["id"],
        name=row["name"],
        mission_type=row["mission_type"] or "",
        parameter=row["parameter"],
        operator=row["operator"],
        threshold_value=row["threshold_value"],
        unit=row["unit"] or "",
        severity=row["severity"],
        notify_channel=row["notify_channel"] or "none",
        notify_within_hours=row["notify_within_hours"],
        enabled=bool(row["enabled"]),
        created_at=row["created_at"],
    )


@router.get("/rules", response_model=list[AlertRuleOut], summary="List alert rules")
def list_rules() -> list[AlertRuleOut]:
    return [_rule_out(r) for r in data_access.list_alert_rules()]


@router.post(
    "/rules",
    response_model=AlertRuleOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an alert rule",
)
def create_rule(rule: AlertRuleIn) -> AlertRuleOut:
    rule_id = data_access.create_alert_rule(
        name=rule.name,
        parameter=rule.parameter,
        operator=rule.operator,
        threshold_value=rule.threshold_value,
        unit=rule.unit,
        mission_type=rule.mission_type,
        severity=rule.severity,
        notify_channel=rule.notify_channel,
        notify_within_hours=rule.notify_within_hours,
        enabled=1 if rule.enabled else 0,
    )
    data_access.audit("alert_rule.create", f"{rule.name} ({rule.parameter} {rule.operator} {rule.threshold_value})")
    created = data_access.get_alert_rule(rule_id)
    if not created:
        raise HTTPException(status_code=500, detail="Rule was not persisted.")
    return _rule_out(created)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a rule")
def delete_rule(rule_id: int) -> None:
    if not data_access.get_alert_rule(rule_id):
        raise HTTPException(status_code=404, detail="Rule not found.")
    data_access.delete_alert_rule(rule_id)
    data_access.audit("alert_rule.delete", f"rule {rule_id}")


@router.post("/evaluate", summary="Evaluate rules at a point -> GeoJSON alerts")
def evaluate(body: EvaluateIn, persist: bool = Query(True, description="Persist breaches as alerts")) -> dict:
    """Evaluate all enabled rules against the forecast at (lat, lon).

    Returns a GeoJSON FeatureCollection of breaches. With ``persist=false`` the
    breaches are returned but not written (read-only preview).
    """
    return rules_engine.evaluate(body.lat, body.lon, persist=persist)


@router.get("", response_model=list[AlertOut], summary="List generated alerts")
def list_alerts() -> list[AlertOut]:
    return [
        AlertOut(
            id=a["id"],
            rule_id=a["rule_id"],
            generated_at=a["generated_at"],
            severity=a["severity"],
            parameter=a["parameter"] or "",
            value=a["value"],
            message=a["message"] or "",
            acknowledged=bool(a["acknowledged"]),
        )
        for a in data_access.list_alerts()
    ]
