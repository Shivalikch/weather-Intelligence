# Application API Reference

Base URL (local dev): `http://127.0.0.1:8000` — interactive docs at
`http://127.0.0.1:8000/docs` (Swagger) and `/redoc`.

All responses are JSON. The frontend calls these through the Vite dev proxy, so
in the browser they are same-origin (`/api/...`, `/health`). Every endpoint the
frontend uses is registered in one file: `frontend/src/api/endpoints.ts`.

## Meta (main.py)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + database status. |
| GET | `/api/config` | Application/AOR configuration key-values. |
| GET | `/api/external-apis` | Catalogue of external data sources (from the `external_api` table). |

Each `/api/external-apis` row carries `base_url` + `endpoint_path` (the base API
endpoint), a `comment` note, the comma-separated `mvp` list of MVPs that source
data from it, and `live` — `true` when the prototype calls that source over the
wire today, `false` when it is the documented production source for the
capability but is not yet wired to an adapter. The UI's per-MVP **Data Sources**
panel (`frontend/src/components/DataSources.tsx`) is driven entirely by this
endpoint, filtered on `mvp`.

## MVP-1 · Map-Centric Viewer (`api/route/forecast.py`) — **implemented**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/aor` | AOR name, bounding box, map centre/zoom, refresh cadences. |
| GET | `/api/layers` | Catalogue of toggleable weather/satellite layers (+ tile template for imagery). |
| GET | `/api/locations` | Preset AOR locations (Ali Al Salem AB is the default). |
| GET | `/api/forecast?lat={}&lon={}&layers={csv}` | Normalised point forecast time-series (defaults to visible layers; supports derived WBGT). |

## MVP-2 · No-Code Threshold & Alerting Engine (`api/route/alerts.py`) — **implemented**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/alerts/rules` | List alert rules. |
| POST | `/api/alerts/rules` | Create a rule (`name`, `parameter`, `operator` gt/gte/lt/lte/eq, `threshold_value`, `unit`, `severity`, `mission_type`). Returns **201**. |
| DELETE | `/api/alerts/rules/{id}` | Delete a rule. Returns **204** (404 if missing). |
| POST | `/api/alerts/evaluate` | Evaluate all enabled rules at `{lat,lon}` → **GeoJSON FeatureCollection** of breaches (also persisted). |
| GET | `/api/alerts` | List generated alerts. |

## MVP-4 · Severe-Weather Detection Packs (`api/route/severe.py`) — **implemented**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/severe` | Status + pack count. |
| GET | `/api/severe/packs` | List pre-built detection packs (dust, extreme_heat, heavy_precip, convection, fog). |
| GET | `/api/severe/detections` | Run all packs AOR-wide → **GeoJSON FeatureCollection** of detections. Optional `?lat=&lon=` for a single point. |

## MVP-3 · Probabilistic & Operational-Impact Panels (`api/route/probabilistic.py`) — **implemented**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/probabilistic` | Status. |
| GET | `/api/probabilistic/ensemble?lat=&lon=&parameter=` | Ensemble members + percentiles (p10/p25/p50/p75/p90) + deterministic line. |
| GET | `/api/probabilistic/impact?lat=&lon=` | Plain-language operational impacts with calibrated likelihood + model-bias notes. |

## MVP-5 · High-Resolution Regional Model Adapter (`api/route/regional.py`) — **implemented**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/regional` | Status (grid_km=3, step_minutes=15, horizon_hours=36). |
| GET | `/api/regional/forecast?lat=&lon=&layers=&hours=` | 3km / 15-minute densified point forecast (hourly → 15-min). |
| GET | `/api/regional/grid?lat=&lon=&parameter=&n=` | NxN 3km spatial grid of values around the point. |

## MVP-6 · Integration & CDS Export Gateway (`api/route/integration.py`) — **implemented**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/integration` | Status + classification + destination enclaves. |
| GET | `/api/integration/cds/preview?limit=` | Mock classified CDS payload: GeoJSON of alert objects + classification + SHA-256. |
| POST | `/api/integration/cds/export?limit=` | Simulate CDS dispatch → transfer receipt (id, bytes, checksum). |

## MVP-7 · AI-Native Global Prediction Engine (`api/route/model.py`) — **implemented**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/model` | Status + engine name. |
| GET | `/api/model/status` | AI-NWP engine metadata (resolution, ensemble, assimilation, GPU compute, 60+ layers). |
| GET | `/api/model/predict?lat=&lon=&parameter=` | AI-native probabilistic prediction (percentiles + skill score) — swaps behind the forecast interface. |

_All seven MVPs are implemented; there are no placeholder routers remaining._

## Example

```bash
# Health
curl http://127.0.0.1:8000/health

# Point forecast for Ali Al Salem AB with specific layers
curl "http://127.0.0.1:8000/api/forecast?lat=29.35&lon=47.52&layers=temperature_2m,wind_10m,wbgt,dust"
```
