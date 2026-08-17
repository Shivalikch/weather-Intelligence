"""All SQL for the application lives here.

Rules enforced by this module (see README):
  * Every statement is a module-level constant string using ``?`` placeholders.
  * User / caller values are ALWAYS passed as bound parameters -- never
    concatenated into SQL -- which prevents SQL injection.
  * Callers (routes, services) import functions from here; they never import a
    database driver or write SQL themselves.

This module talks to the engine only through database.py primitives.
"""
from __future__ import annotations

from pathlib import Path

from database import database as db

_SCHEMA_FILE = Path(__file__).resolve().parent / "schema.sql"

# ===========================================================================
# SQL statements (constants, parameterised).
# ===========================================================================
SQL_CONFIG_SELECT_ALL = "SELECT config_key, config_value FROM config;"
SQL_CONFIG_SELECT_ONE = "SELECT config_value FROM config WHERE config_key = ?;"
SQL_CONFIG_INSERT = (
    "INSERT OR REPLACE INTO config (config_key, config_value, description) "
    "VALUES (?, ?, ?);"
)

SQL_EXTAPI_SELECT_ALL = (
    "SELECT id, name, provider, category, base_url, endpoint_path, http_method, "
    "auth_type, requires_key, api_key_env, data_format, mvp, register_url, "
    "comment, enabled FROM external_api ORDER BY category, name;"
)
SQL_EXTAPI_SELECT_ENABLED = (
    "SELECT id, name, provider, category, base_url, endpoint_path, http_method, "
    "auth_type, requires_key, api_key_env, data_format, mvp, register_url, "
    "comment, enabled FROM external_api WHERE enabled = 1 ORDER BY category, name;"
)
SQL_EXTAPI_SELECT_ONE = (
    "SELECT id, name, provider, category, base_url, endpoint_path, http_method, "
    "auth_type, requires_key, api_key_env, data_format, mvp, register_url, "
    "comment, enabled FROM external_api WHERE name = ?;"
)
SQL_EXTAPI_INSERT = (
    "INSERT INTO external_api (name, provider, category, base_url, endpoint_path, "
    "http_method, auth_type, requires_key, api_key_env, data_format, mvp, "
    "register_url, comment, enabled) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);"
)
SQL_EXTAPI_UPDATE_MVP = "UPDATE external_api SET mvp = ? WHERE name = ?;"

SQL_LAYER_SELECT_ENABLED = (
    "SELECT layer_key, name, category, external_api_name, source_field, unit, "
    "description, default_visible, z_index FROM weather_layer "
    "WHERE enabled = 1 ORDER BY z_index;"
)
SQL_LAYER_SELECT_ONE = (
    "SELECT layer_key, name, category, external_api_name, source_field, unit, "
    "description, default_visible, z_index FROM weather_layer WHERE layer_key = ?;"
)
SQL_LAYER_INSERT = (
    "INSERT INTO weather_layer (layer_key, name, category, external_api_name, "
    "source_field, unit, description, default_visible, z_index, enabled) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);"
)

SQL_LOCATION_SELECT_ALL = (
    "SELECT id, name, country, lat, lon, description, is_aor_default "
    "FROM location ORDER BY is_aor_default DESC, name;"
)
SQL_LOCATION_SELECT_DEFAULT = (
    "SELECT id, name, country, lat, lon, description, is_aor_default "
    "FROM location WHERE is_aor_default = 1 LIMIT 1;"
)
SQL_LOCATION_INSERT = (
    "INSERT INTO location (name, country, lat, lon, description, is_aor_default) "
    "VALUES (?, ?, ?, ?, ?, ?);"
)

_ALERTRULE_COLS = (
    "id, name, mission_type, parameter, operator, threshold_value, unit, "
    "severity, geometry_geojson, notify_channel, notify_within_hours, enabled, created_at"
)
SQL_ALERTRULE_SELECT_ALL = (
    f"SELECT {_ALERTRULE_COLS} FROM alert_rule ORDER BY created_at DESC;"
)
SQL_ALERTRULE_SELECT_ONE = (
    f"SELECT {_ALERTRULE_COLS} FROM alert_rule WHERE id = ?;"
)
SQL_ALERTRULE_INSERT = (
    "INSERT INTO alert_rule (name, mission_type, parameter, operator, "
    "threshold_value, unit, severity, geometry_geojson, notify_channel, "
    "notify_within_hours, enabled) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);"
)
SQL_ALERTRULE_TABLE_INFO = "PRAGMA table_info(alert_rule);"
SQL_ALERTRULE_DELETE = "DELETE FROM alert_rule WHERE id = ?;"
SQL_ALERT_SELECT_ALL = (
    "SELECT id, rule_id, generated_at, severity, parameter, value, message, "
    "geojson, acknowledged FROM alert ORDER BY generated_at DESC;"
)
SQL_ALERT_INSERT = (
    "INSERT INTO alert (rule_id, severity, parameter, value, message, geojson) "
    "VALUES (?, ?, ?, ?, ?, ?);"
)

SQL_AUDIT_INSERT = "INSERT INTO audit_log (actor, action, detail) VALUES (?, ?, ?);"
SQL_COUNT_CONFIG = "SELECT COUNT(*) AS n FROM config;"


# ===========================================================================
# Schema / seed lifecycle.
# ===========================================================================
def init_db() -> None:
    """Create tables (idempotent), migrate, and seed reference data on first run."""
    db.run_script(_SCHEMA_FILE.read_text(encoding="utf-8"))
    _migrate()
    if not _is_seeded():
        _seed_reference_data()


def _migrate() -> None:
    """Additive migrations for databases created before newer columns existed."""
    cols = {r["name"] for r in db.fetch_all(SQL_ALERTRULE_TABLE_INFO)}
    if "notify_channel" not in cols:
        db.execute("ALTER TABLE alert_rule ADD COLUMN notify_channel TEXT NOT NULL DEFAULT 'none';")
    if "notify_within_hours" not in cols:
        db.execute("ALTER TABLE alert_rule ADD COLUMN notify_within_hours INTEGER NOT NULL DEFAULT 6;")
    # Reference data is only inserted on first run, so realign the MVP mapping of
    # the two live sources for databases seeded before it was corrected.
    # Idempotent: re-running writes the same values.
    for _name, _mvp in _EXTERNAL_API_MVP_FIXES:
        db.execute(SQL_EXTAPI_UPDATE_MVP, (_mvp, _name))


def _is_seeded() -> bool:
    row = db.fetch_one(SQL_COUNT_CONFIG)
    return bool(row and row.get("n", 0) > 0)


def _seed_reference_data() -> None:
    db.execute_many(SQL_CONFIG_INSERT, _CONFIG_SEED)
    db.execute_many(SQL_EXTAPI_INSERT, _EXTERNAL_API_SEED)
    db.execute_many(SQL_LAYER_INSERT, _LAYER_SEED)
    db.execute_many(SQL_LOCATION_INSERT, _LOCATION_SEED)
    audit("seed", "Reference data seeded (config, external_api, weather_layer, location).")


# ===========================================================================
# Read/write helpers used by the API layer.
# ===========================================================================
def healthcheck() -> bool:
    return db.healthcheck()


def get_config() -> dict:
    rows = db.fetch_all(SQL_CONFIG_SELECT_ALL)
    return {r["config_key"]: r["config_value"] for r in rows}


def get_config_value(key: str) -> str | None:
    row = db.fetch_one(SQL_CONFIG_SELECT_ONE, (key,))
    return row["config_value"] if row else None


def list_external_apis(enabled_only: bool = False) -> list[dict]:
    sql = SQL_EXTAPI_SELECT_ENABLED if enabled_only else SQL_EXTAPI_SELECT_ALL
    return db.fetch_all(sql)


def get_external_api(name: str) -> dict | None:
    return db.fetch_one(SQL_EXTAPI_SELECT_ONE, (name,))


def list_layers() -> list[dict]:
    return db.fetch_all(SQL_LAYER_SELECT_ENABLED)


def get_layer(layer_key: str) -> dict | None:
    return db.fetch_one(SQL_LAYER_SELECT_ONE, (layer_key,))


def list_locations() -> list[dict]:
    return db.fetch_all(SQL_LOCATION_SELECT_ALL)


def get_default_location() -> dict | None:
    return db.fetch_one(SQL_LOCATION_SELECT_DEFAULT)


# --- MVP-2 :: Alerting engine (schema-backed) ---
def list_alert_rules() -> list[dict]:
    return db.fetch_all(SQL_ALERTRULE_SELECT_ALL)


def get_alert_rule(rule_id: int) -> dict | None:
    return db.fetch_one(SQL_ALERTRULE_SELECT_ONE, (rule_id,))


def create_alert_rule(
    name: str,
    parameter: str,
    operator: str,
    threshold_value: float,
    unit: str = "",
    mission_type: str = "",
    severity: str = "advisory",
    geometry_geojson: str = "",
    notify_channel: str = "none",
    notify_within_hours: int = 6,
    enabled: int = 1,
) -> int:
    return db.execute(
        SQL_ALERTRULE_INSERT,
        (name, mission_type, parameter, operator, threshold_value, unit,
         severity, geometry_geojson, notify_channel, notify_within_hours, enabled),
    )


def delete_alert_rule(rule_id: int) -> None:
    db.execute(SQL_ALERTRULE_DELETE, (rule_id,))


def list_alerts() -> list[dict]:
    return db.fetch_all(SQL_ALERT_SELECT_ALL)


def create_alert(
    rule_id: int | None,
    severity: str,
    parameter: str,
    value: float | None,
    message: str,
    geojson: str = "",
) -> int:
    return db.execute(
        SQL_ALERT_INSERT,
        (rule_id, severity, parameter, value, message, geojson),
    )


def audit(action: str, detail: str = "", actor: str = "system") -> None:
    db.execute(SQL_AUDIT_INSERT, (actor, action, detail))


# ===========================================================================
# Seed data (constants). AOR = USCENTCOM Area of Responsibility.
# ===========================================================================
_CONFIG_SEED = [
    ("app_name", "AFCENT Weather Intelligence SaaS (Prototype)", "Display name"),
    ("app_version", "0.1.0", "Prototype version"),
    ("aor_name", "USCENTCOM Area of Responsibility", "Operating region"),
    ("aor_bbox", "[20.0,-5.0,80.0,40.0]", "AOR bounding box [minLon,minLat,maxLon,maxLat]"),
    ("map_center_lat", "29.35", "Default map centre latitude (Ali Al Salem AB)"),
    ("map_center_lon", "47.52", "Default map centre longitude"),
    ("map_zoom", "5", "Default map zoom"),
    ("refresh_global_hours", "6", "Global model refresh cadence (PWS Task 1)"),
    ("refresh_regional_minutes", "60", "Regional refresh cadence"),
    ("refresh_high_res_minutes", "15", "High-res 3km output cadence (PWS Task 2)"),
]

# (name, provider, category, base_url, endpoint_path, method, auth_type,
#  requires_key, api_key_env, data_format, mvp, register_url, comment, enabled)
_EXTERNAL_API_SEED = [
    # NOTE: the mvp column lists every MVP whose service actually resolves layers
    # against this source at runtime (all of them route through
    # external_client.fetch_point_forecast), not just the MVP that introduced it.
    ("open_meteo_forecast", "Open-Meteo", "forecast",
     "https://api.open-meteo.com", "/v1/forecast", "GET", "open", 0, "",
     "json", "MVP-1,MVP-2,MVP-3,MVP-4,MVP-5,MVP-7", "",
     "Key-less global forecast incl. the Middle East AOR. Supplies the core "
     "wind / temperature / humidity / visibility / precipitation series.", 1),
    ("open_meteo_air_quality", "Open-Meteo", "air_quality",
     "https://air-quality-api.open-meteo.com", "/v1/air-quality", "GET", "open", 0, "",
     "json", "MVP-1,MVP-2,MVP-4", "",
     "Dust / PM / aerosol; key-less (supports AOR dust monitoring). Reached by "
     "the dust layer, the dust-storm rule preset and the blowing-dust pack.", 1),
    # (mvp values for these two rows are realigned by _migrate via
    #  _EXTERNAL_API_MVP_FIXES below - keep the two in sync.)
    ("open_meteo_marine", "Open-Meteo", "marine",
     "https://marine-api.open-meteo.com", "/v1/marine", "GET", "open", 0, "",
     "json", "MVP-4", "", "Wave height / sea-state; key-less.", 1),
    ("open_meteo_flood", "Open-Meteo", "flood",
     "https://flood-api.open-meteo.com", "/v1/flood", "GET", "open", 0, "",
     "json", "MVP-1", "", "River discharge / flood index; key-less.", 1),
    ("open_meteo_ensemble", "Open-Meteo", "forecast",
     "https://ensemble-api.open-meteo.com", "/v1/ensemble", "GET", "open", 0, "",
     "json", "MVP-3", "", "Probabilistic ensemble members; key-less.", 1),
    ("nws_alerts", "NOAA / NWS", "alerts",
     "https://api.weather.gov", "/alerts/active", "GET", "open", 0, "",
     "geojson", "MVP-2", "",
     "Official alert schema reference (US coverage); no key.", 1),
    ("nasa_gibs_wmts", "NASA GIBS", "satellite",
     "https://gibs.earthdata.nasa.gov", "/wmts/epsg3857/best", "GET", "open", 0, "",
     "wmts", "MVP-1", "",
     "Satellite imagery basemap tiles (WMTS); no key.", 1),
    ("noaa_gfs", "NOAA (AWS Open Data)", "forecast",
     "https://noaa-gfs-bdp-pds.s3.amazonaws.com", "", "GET", "open", 0, "",
     "grib2", "MVP-1,MVP-3", "", "Global NWP GRIB2 via AWS Open Data.", 1),
    ("noaa_gefs", "NOAA (AWS Open Data)", "forecast",
     "https://noaa-gefs-pds.s3.amazonaws.com", "", "GET", "open", 0, "",
     "grib2", "MVP-3", "", "Global ensemble (probabilistic) GRIB2.", 1),
    ("ecmwf_open_data", "ECMWF", "forecast",
     "https://data.ecmwf.int", "/forecasts", "GET", "open", 0, "",
     "grib2", "MVP-1,MVP-7", "", "Open IFS / AIFS AI model reference.", 1),
    ("noaa_hrrr", "NOAA (AWS Open Data)", "forecast",
     "https://noaa-hrrr-bdp-pds.s3.amazonaws.com", "", "GET", "open", 0, "",
     "grib2", "MVP-5", "", "3km convection-permitting (CONUS) analog.", 1),
    ("nasa_gpm_imerg", "NASA GPM", "precip",
     "https://gpm1.gesdisc.eosdis.nasa.gov", "", "GET", "registration", 1,
     "NASA_EARTHDATA_TOKEN", "netcdf", "MVP-1,MVP-4",
     "https://urs.earthdata.nasa.gov/users/new",
     "Multi-satellite merged precipitation; free Earthdata login.", 1),
    ("copernicus_cams", "Copernicus CAMS", "air_quality",
     "https://ads.atmosphere.copernicus.eu", "/api", "GET", "registration", 1,
     "COPERNICUS_CDS_KEY", "netcdf", "MVP-4",
     "https://ads.atmosphere.copernicus.eu/user/register",
     "Dust / aerosol forecasts; free ADS account.", 1),
    ("openaq", "OpenAQ", "air_quality",
     "https://api.openaq.org", "/v3/latest", "GET", "registration", 1,
     "OPENAQ_API_KEY", "json", "MVP-1",
     "https://explore.openaq.org/register",
     "Ground air-quality; free API key (v3).", 1),
    ("copernicus_marine", "Copernicus Marine", "marine",
     "https://data.marine.copernicus.eu", "", "GET", "registration", 1,
     "COPERNICUS_CDS_KEY", "netcdf", "MVP-4",
     "https://data.marine.copernicus.eu/register",
     "Sea state / waves / currents; free account.", 1),
    ("era5_cds", "Copernicus CDS", "reanalysis",
     "https://cds.climate.copernicus.eu", "/api", "GET", "registration", 1,
     "COPERNICUS_CDS_KEY", "netcdf", "MVP-3",
     "https://cds.climate.copernicus.eu/user/register",
     "ERA5 reanalysis history for baselines / back-testing.", 1),
    ("nasa_power", "NASA POWER", "forecast",
     "https://power.larc.nasa.gov", "/api/temporal/hourly/point", "GET", "open", 0, "",
     "json", "MVP-1", "", "Meteorology & solar parameters; no key.", 1),
    ("noaa_goes", "NOAA (AWS Open Data)", "satellite",
     "https://noaa-goes16.s3.amazonaws.com", "", "GET", "open", 0, "",
     "netcdf", "MVP-1,MVP-4", "", "Geostationary satellite (clouds/convection).", 1),
]

# Rows whose mvp mapping must be realigned on databases that were seeded before
# the mapping was corrected. Values MUST match _EXTERNAL_API_SEED above.
_EXTERNAL_API_MVP_FIXES = [
    ("open_meteo_forecast", "MVP-1,MVP-2,MVP-3,MVP-4,MVP-5,MVP-7"),
    ("open_meteo_air_quality", "MVP-1,MVP-2,MVP-4"),
]

# (layer_key, name, category, external_api_name, source_field, unit,
#  description, default_visible, z_index)
_LAYER_SEED = [
    ("temperature_2m", "Air Temperature (2m)", "core", "open_meteo_forecast",
     "temperature_2m", "°C", "Near-surface air temperature.", 1, 10),
    ("relative_humidity_2m", "Relative Humidity", "core", "open_meteo_forecast",
     "relative_humidity_2m", "%", "Near-surface relative humidity.", 0, 11),
    ("wbgt", "Wet Bulb Globe Temp (derived)", "derived", "",
     "", "°C", "Heat-stress index derived from temperature & humidity.", 0, 12),
    ("visibility", "Visibility", "core", "open_meteo_forecast",
     "visibility", "m", "Horizontal visibility.", 0, 13),
    ("surface_pressure", "Surface Pressure", "core", "open_meteo_forecast",
     "surface_pressure", "hPa", "Mean sea-level / surface pressure.", 0, 14),
    ("wind_10m", "Surface Wind (10m)", "wind", "open_meteo_forecast",
     "wind_speed_10m", "kt", "10m sustained wind speed.", 1, 20),
    ("wind_gusts_10m", "Wind Gusts", "wind", "open_meteo_forecast",
     "wind_gusts_10m", "kt", "10m wind gusts.", 0, 21),
    ("precipitation", "Precipitation", "precip", "open_meteo_forecast",
     "precipitation", "mm", "Total precipitation.", 1, 30),
    ("cloud_cover", "Cloud Cover", "clouds", "open_meteo_forecast",
     "cloud_cover", "%", "Total cloud cover.", 0, 40),
    ("dust", "Dust / Aerosol", "air_quality", "open_meteo_air_quality",
     "dust", "µg/m³", "Blowing-dust proxy for the AOR (PWS Task 4).", 0, 50),
    ("pm10", "Particulate Matter (PM10)", "air_quality", "open_meteo_air_quality",
     "pm10", "µg/m³", "Coarse particulate matter.", 0, 51),
    ("satellite_truecolor", "Satellite (True Color)", "satellite", "nasa_gibs_wmts",
     "MODIS_Terra_CorrectedReflectance_TrueColor", "tiles",
     "Daily true-colour satellite imagery.", 0, 5),
]

# (name, country, lat, lon, description, is_aor_default)
_LOCATION_SEED = [
    ("Ali Al Salem AB", "Kuwait", 29.3467, 47.5206,
     "Primary place of performance (386 AEW).", 1),
    ("Al Udeid AB", "Qatar", 25.1173, 51.3149, "Major AFCENT hub.", 0),
    ("Prince Sultan AB", "Saudi Arabia", 24.0627, 47.5805, "Arabian Peninsula.", 0),
    ("Baghdad", "Iraq", 33.3152, 44.3661, "Northern AOR.", 0),
    ("Camp Lemonnier", "Djibouti", 11.5472, 43.1594, "East Africa.", 0),
    ("Bagram", "Afghanistan", 34.9460, 69.2650, "South Asia.", 0),
]
