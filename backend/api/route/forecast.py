"""MVP-1 :: Map-Centric METOC Viewer endpoints.

Serves everything the foundation map viewer needs: the AOR definition, the
catalogue of toggleable weather/satellite layers, preset locations, and the
point forecast time-series. The API layer never touches the database driver --
it goes through data_access -- and never calls external sources directly --
it goes through services.external_client.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query

from api.schemas import ForecastResponse, LayerOut, LocationOut
from database import data_access
from services import external_client

router = APIRouter(prefix="/api", tags=["MVP-1 · Map-Centric Viewer"])


@router.get("/aor", summary="Area of Responsibility definition")
def get_aor() -> dict:
    cfg = data_access.get_config()
    try:
        bbox = json.loads(cfg.get("aor_bbox", "[]"))
    except json.JSONDecodeError:
        bbox = []
    return {
        "name": cfg.get("aor_name", "USCENTCOM Area of Responsibility"),
        "bbox": bbox,
        "center": {
            "lat": float(cfg.get("map_center_lat", "29.35")),
            "lon": float(cfg.get("map_center_lon", "47.52")),
        },
        "zoom": int(cfg.get("map_zoom", "5")),
        "refresh": {
            "global_hours": int(cfg.get("refresh_global_hours", "6")),
            "regional_minutes": int(cfg.get("refresh_regional_minutes", "60")),
            "high_res_minutes": int(cfg.get("refresh_high_res_minutes", "15")),
        },
    }


@router.get("/layers", response_model=list[LayerOut], summary="Available map layers")
def list_layers() -> list[LayerOut]:
    out: list[LayerOut] = []
    for row in data_access.list_layers():
        out.append(
            LayerOut(
                key=row["layer_key"],
                name=row["name"],
                category=row["category"],
                unit=row["unit"],
                description=row["description"],
                default_visible=bool(row["default_visible"]),
                z_index=row["z_index"],
                source=row["external_api_name"] or "derived",
                tile_url_template=external_client.build_tile_template(row),
            )
        )
    return out


@router.get("/locations", response_model=list[LocationOut], summary="Preset AOR locations")
def list_locations() -> list[LocationOut]:
    return [
        LocationOut(
            id=row["id"],
            name=row["name"],
            country=row["country"],
            lat=row["lat"],
            lon=row["lon"],
            description=row["description"],
            is_aor_default=bool(row["is_aor_default"]),
        )
        for row in data_access.list_locations()
    ]


@router.get("/forecast", response_model=ForecastResponse, summary="Point forecast time-series")
def get_forecast(
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude"),
    layers: str | None = Query(
        None, description="Comma-separated layer keys; defaults to the visible layers."
    ),
) -> ForecastResponse:
    if layers:
        layer_keys = [k.strip() for k in layers.split(",") if k.strip()]
    else:
        layer_keys = [
            row["layer_key"] for row in data_access.list_layers()
            if row["default_visible"]
        ]

    if not layer_keys:
        raise HTTPException(status_code=400, detail="No layers requested or available.")

    result = external_client.fetch_point_forecast(lat, lon, layer_keys)
    if not result["layers"]:
        raise HTTPException(
            status_code=502,
            detail="No forecast data returned for the requested layers.",
        )
    return ForecastResponse(**result)
