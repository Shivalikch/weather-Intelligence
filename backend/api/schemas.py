"""Pydantic response/request models shared by the route modules."""
from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    environment: str
    database: str


class ExternalApiOut(BaseModel):
    name: str
    provider: str
    category: str
    base_url: str
    endpoint_path: str
    auth_type: str
    requires_key: bool
    data_format: str
    mvp: str
    register_url: str
    comment: str
    enabled: bool
    # True when the prototype actually calls this source over the wire today;
    # False means it is the documented production source, not yet wired.
    live: bool


class LayerOut(BaseModel):
    key: str
    name: str
    category: str
    unit: str
    description: str
    default_visible: bool
    z_index: int
    source: str
    tile_url_template: str | None = None


class LocationOut(BaseModel):
    id: int
    name: str
    country: str
    lat: float
    lon: float
    description: str
    is_aor_default: bool


class ForecastLayer(BaseModel):
    key: str
    name: str
    unit: str
    category: str
    values: list[float | None]


class ForecastResponse(BaseModel):
    location: dict
    generated_at: str
    times: list[str]
    layers: list[ForecastLayer]


class PlaceholderResponse(BaseModel):
    """Uniform contract returned by not-yet-built MVP endpoints."""
    mvp: str
    name: str
    status: str = "placeholder"
    pws_task: str
    message: str
    planned_endpoints: list[str] = []


# --- MVP-2 :: Alerting engine ---------------------------------------------
from typing import Literal  # noqa: E402

Operator = Literal["gt", "gte", "lt", "lte", "eq"]
Severity = Literal["advisory", "watch", "warning"]
NotifyChannel = Literal["none", "page", "call", "email"]


class AlertRuleIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    parameter: str = Field(..., description="Layer key, e.g. wind_10m, wbgt, dust")
    operator: Operator
    threshold_value: float
    unit: str = ""
    mission_type: str = ""
    severity: Severity = "advisory"
    notify_channel: NotifyChannel = "none"
    notify_within_hours: int = Field(6, ge=1, le=48)
    enabled: bool = True


class AlertRuleOut(BaseModel):
    id: int
    name: str
    mission_type: str
    parameter: str
    operator: str
    threshold_value: float
    unit: str
    severity: str
    notify_channel: str
    notify_within_hours: int
    enabled: bool
    created_at: str


class EvaluateIn(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class AlertOut(BaseModel):
    id: int
    rule_id: int | None
    generated_at: str
    severity: str
    parameter: str
    value: float | None
    message: str
    acknowledged: bool
