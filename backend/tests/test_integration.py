"""Whole-application integration tests.

These verify that all seven MVPs are wired into ONE application and that the
foundation (MVP-1) works end-to-end through the real stack
(route -> data_access -> database, and route -> external_client). Cross-MVP data
flows (e.g. MVP-2 alert -> MVP-6 CDS export) are exercised here too, as are the
architectural guardrails: no DB driver under api/, and every ingesting MVP
keeping a live source in the external_api catalogue.
"""
import pytest

pytestmark = pytest.mark.integration

# Every MVP's root endpoint that must resolve in the single running app.
MVP_ROOTS = {
    "MVP-1": "/api/aor",
    "MVP-2": "/api/alerts",
    "MVP-3": "/api/probabilistic",
    "MVP-4": "/api/severe",
    "MVP-5": "/api/regional",
    "MVP-6": "/api/integration",
    "MVP-7": "/api/model",
}


def test_app_boots_and_is_healthy(client):
    assert client.get("/health").json()["status"] == "ok"


@pytest.mark.parametrize("mvp,path", list(MVP_ROOTS.items()))
def test_all_mvps_mounted(client, mvp, path):
    """All 7 MVP routers respond in the same application."""
    r = client.get(path)
    assert r.status_code == 200, f"{mvp} root {path} did not resolve"


def test_openapi_exposes_every_mvp(client):
    schema = client.get("/openapi.json").json()
    tag_blob = " ".join(
        t.get("name", "") for path in schema["paths"].values()
        for op in path.values() for t in [{"name": x} for x in op.get("tags", [])]
    )
    for n in range(1, 8):
        assert f"MVP-{n}" in tag_blob


def test_reference_data_seeded(client):
    apis = client.get("/api/external-apis").json()
    layers = client.get("/api/layers").json()
    assert len(apis) >= 15         # curated public-source catalogue
    assert len(layers) >= 10       # curated layer catalogue


def test_external_api_catalogue_exposes_base_endpoint(client):
    """The UI's per-MVP Data Sources panel needs a usable base endpoint + note."""
    for a in client.get("/api/external-apis").json():
        assert a["base_url"].startswith("https://"), a["name"]
        assert a["comment"].strip(), f"{a['name']} has no explanatory note"
        assert isinstance(a["live"], bool)


def test_every_mvp_reports_its_data_sources(client):
    """Each MVP that ingests external data resolves >=1 catalogue row.

    MVP-6 (CDS export) is excluded: it packages the other MVPs' outputs and
    deliberately has no upstream source of its own.
    """
    apis = client.get("/api/external-apis").json()
    for n in (1, 2, 3, 4, 5, 7):
        mvp = f"MVP-{n}"
        rows = [a for a in apis
                if mvp in [m.strip() for m in a["mvp"].split(",")] and a["enabled"]]
        assert rows, f"{mvp} has no external source mapped"
        # every ingesting MVP must resolve at least one source it actually calls
        assert any(a["live"] for a in rows), f"{mvp} has no LIVE source"

    mvp6 = [a for a in apis if "MVP-6" in [m.strip() for m in a["mvp"].split(",")]]
    assert mvp6 == [], "MVP-6 should have no upstream source of its own"


def test_mvp1_end_to_end_flow(client, mock_external):
    """AOR -> default location -> layers -> point forecast, as the UI does it."""
    aor = client.get("/api/aor").json()
    assert aor["center"]["lat"]

    loc = next(l for l in client.get("/api/locations").json() if l["is_aor_default"])

    visible = [l["key"] for l in client.get("/api/layers").json() if l["default_visible"]]
    assert visible

    fc = client.get(
        "/api/forecast",
        params={"lat": loc["lat"], "lon": loc["lon"], "layers": ",".join(visible)},
    ).json()
    returned = {l["key"] for l in fc["layers"]}
    assert set(visible) <= returned
    assert len(fc["times"]) > 0


def test_database_technology_isolated_from_api_layer():
    """Architectural guardrail: nothing under api/ imports a DB driver or SQL."""
    import pathlib

    api_dir = pathlib.Path(__file__).resolve().parent.parent / "api"
    offenders = []
    for py in api_dir.rglob("*.py"):
        text = py.read_text(encoding="utf-8").lower()
        if "import sqlite3" in text or "pyodbc" in text or "cx_oracle" in text:
            offenders.append(py.name)
    assert not offenders, f"API layer must not import a DB driver: {offenders}"


# --- cross-MVP flow: MVP-2 alert -> MVP-6 CDS export -----------------------
def test_alert_flows_into_cds_export(client, mock_external):
    """MVP-2 generates a GeoJSON alert; MVP-6 packages it for CDS export."""
    client.post("/api/alerts/rules", json={
        "name": "CDS dust test", "parameter": "dust",
        "operator": "gt", "threshold_value": 300, "unit": "ug/m3", "severity": "warning",
    })
    ev = client.post("/api/alerts/evaluate", json={"lat": 29.35, "lon": 47.52})
    assert ev.status_code == 200  # persists the dust breach as an alert (fake dust 560 > 300)

    export = client.get("/api/integration/cds/preview")
    assert export.status_code == 200
    body = export.json()
    assert body["classification"]
    assert body["payload"]["type"] == "FeatureCollection"
    # the dust alert we just generated is packaged for the classified enclave
    assert any(f["properties"].get("parameter") == "dust" for f in body["payload"]["features"])
