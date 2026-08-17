-- ===========================================================================
-- AFCENT Weather Intelligence SaaS - Prototype :: database schema
--
-- Portable DDL kept deliberately close to ANSI SQL so it can be migrated to
-- MS SQL Server / Oracle / PostgreSQL with minimal edits. Only database.py
-- knows the concrete engine; this file is executed by data_access.init_db().
-- ===========================================================================

-- --- Application configuration (key/value) ---------------------------------
CREATE TABLE IF NOT EXISTS config (
    config_key   TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    description  TEXT
);

-- --- External data sources -------------------------------------------------
-- Every outbound call this application makes to fetch weather/satellite data
-- is DEFINED here (not hard-coded). Services read a row, then build the call.
CREATE TABLE IF NOT EXISTS external_api (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,       -- logical key used in code
    provider      TEXT NOT NULL,              -- owning organisation
    category      TEXT NOT NULL,              -- forecast | satellite | air_quality | marine | flood | alerts | reanalysis
    base_url      TEXT NOT NULL,
    endpoint_path TEXT NOT NULL DEFAULT '',
    http_method   TEXT NOT NULL DEFAULT 'GET',
    auth_type     TEXT NOT NULL DEFAULT 'open',   -- open | registration | private
    requires_key  INTEGER NOT NULL DEFAULT 0,     -- 0/1
    api_key_env   TEXT DEFAULT '',                -- name of .env var holding the key
    data_format   TEXT NOT NULL DEFAULT 'json',   -- json | geojson | grib2 | netcdf | wmts
    mvp           TEXT NOT NULL DEFAULT '',       -- MVP(s) that consume it
    register_url  TEXT DEFAULT '',                -- where to register (if needed)
    comment       TEXT DEFAULT '',
    enabled       INTEGER NOT NULL DEFAULT 1
);

-- --- Map / weather layers (MVP-1) ------------------------------------------
CREATE TABLE IF NOT EXISTS weather_layer (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    layer_key         TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    category          TEXT NOT NULL,          -- core | clouds | wind | precip | air_quality | satellite | derived
    external_api_name TEXT DEFAULT '',        -- FK -> external_api.name (logical)
    source_field      TEXT DEFAULT '',        -- variable name at the source
    unit              TEXT DEFAULT '',
    description       TEXT DEFAULT '',
    default_visible   INTEGER NOT NULL DEFAULT 0,
    z_index           INTEGER NOT NULL DEFAULT 0,
    enabled           INTEGER NOT NULL DEFAULT 1
);

-- --- Areas of interest / preset locations (MVP-1) --------------------------
CREATE TABLE IF NOT EXISTS location (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    country        TEXT DEFAULT '',
    lat            REAL NOT NULL,
    lon            REAL NOT NULL,
    description    TEXT DEFAULT '',
    is_aor_default INTEGER NOT NULL DEFAULT 0
);

-- --- Alert rules (MVP-2 - schema present for forward integration) ----------
CREATE TABLE IF NOT EXISTS alert_rule (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    mission_type    TEXT DEFAULT '',
    parameter       TEXT NOT NULL,
    operator        TEXT NOT NULL,          -- gt | lt | gte | lte | eq
    threshold_value REAL NOT NULL,
    unit            TEXT DEFAULT '',
    severity        TEXT NOT NULL DEFAULT 'advisory',   -- advisory | watch | warning
    geometry_geojson TEXT DEFAULT '',
    notify_channel  TEXT NOT NULL DEFAULT 'none',        -- none | page | call | email (mock)
    notify_within_hours INTEGER NOT NULL DEFAULT 6,      -- notify if a breach falls in the next N hours
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Generated alerts (MVP-2 / MVP-4 - schema present) ---------------------
CREATE TABLE IF NOT EXISTS alert (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id      INTEGER,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    severity     TEXT NOT NULL DEFAULT 'advisory',
    parameter    TEXT DEFAULT '',
    value        REAL,
    message      TEXT DEFAULT '',
    geojson      TEXT DEFAULT '',
    acknowledged INTEGER NOT NULL DEFAULT 0
);

-- --- Audit trail -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ts     TEXT NOT NULL DEFAULT (datetime('now')),
    actor  TEXT DEFAULT 'system',
    action TEXT NOT NULL,
    detail TEXT DEFAULT ''
);
