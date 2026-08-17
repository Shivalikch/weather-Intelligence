import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import MapView from "../components/MapView";
import LayerPanel from "../components/LayerPanel";
import ForecastPanel from "../components/ForecastPanel";
import StatTiles, { Tile } from "../components/StatTiles";
import type { Layer } from "../types";
import DataSources from "../components/DataSources";

export default function Mvp1MapViewer() {
  const aorQ = useQuery({ queryKey: ["aor"], queryFn: api.getAor });
  const layersQ = useQuery({ queryKey: ["layers"], queryFn: api.getLayers });
  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: api.getLocations });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [satelliteOn, setSatelliteOn] = useState(false);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [seeded, setSeeded] = useState(false);

  // Seed default layers + default location once data arrives.
  useEffect(() => {
    if (seeded || !layersQ.data || !locationsQ.data) return;
    const defaults = layersQ.data.filter((l) => l.default_visible && l.category !== "satellite");
    // Also enable the AOR-critical hero parameters (heat stress + dust) so the
    // KPI tiles are populated on first paint.
    const heroKeys = ["wbgt", "dust"].filter((k) => layersQ.data!.some((l) => l.key === k));
    setSelected(new Set([...defaults.map((l) => l.key), ...heroKeys]));
    const home = locationsQ.data.find((l) => l.is_aor_default) ?? locationsQ.data[0];
    if (home) setPoint({ lat: home.lat, lon: home.lon });
    setSeeded(true);
  }, [seeded, layersQ.data, locationsQ.data]);

  const dataKeys = useMemo(
    () => Array.from(selected).filter((k) => k !== "satellite_truecolor"),
    [selected]
  );

  const forecastQ = useQuery({
    queryKey: ["forecast", point?.lat, point?.lon, dataKeys.join(",")],
    queryFn: () => api.getForecast(point!.lat, point!.lon, dataKeys),
    enabled: !!point && dataKeys.length > 0,
    // Keep the previous forecast visible while the next location loads, and
    // recover automatically if the backend was slow/late to start.
    placeholderData: (prev) => prev,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  const satelliteTemplate = useMemo(() => {
    if (!satelliteOn || !layersQ.data) return null;
    const sat = layersQ.data.find((l: Layer) => l.category === "satellite");
    return sat?.tile_url_template ?? null;
  }, [satelliteOn, layersQ.data]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const tiles = useMemo<Tile[]>(() => {
    const f = forecastQ.data;
    const val = (k: string) => {
      const l = f?.layers.find((x) => x.key === k);
      const v = l?.values?.[0];
      return v === undefined || v === null ? null : (v as number);
    };
    return [
      { k: "Temperature", value: val("temperature_2m"), unit: "°C", tone: "primary", tip: "Near-surface air temperature at the selected point" },
      { k: "Surface Wind", value: val("wind_10m"), unit: "kt", tip: "10m sustained wind — rotary-wing planning driver" },
      { k: "WBGT (heat)", value: val("wbgt"), unit: "°C", tone: "warn", tip: "Wet Bulb Globe Temp — heat-stress index" },
      { k: "Dust", value: val("dust"), unit: "µg/m³", tone: "danger", tip: "Blowing-dust proxy across the AOR" },
    ];
  }, [forecastQ.data]);

  // Which preset (if any) the current point corresponds to. Falls back to a
  // "custom" sentinel when the point came from a map click. Also drives the
  // location <select> value so the choice persists.
  const selectedLocName = useMemo(() => {
    if (!point || !locationsQ.data) return "";
    const match = locationsQ.data.find(
      (l) => Math.abs(l.lat - point.lat) < 1e-6 && Math.abs(l.lon - point.lon) < 1e-6
    );
    return match ? match.name : "__custom__";
  }, [point, locationsQ.data]);

  return (
    <div className="wrap-gap fade-in">
      <StatTiles tiles={tiles} />

      <div className="mvp1-grid">
        <div className="wrap-gap">
          <MapView
            aor={aorQ.data}
            satelliteTemplate={satelliteTemplate}
            satelliteOn={satelliteOn}
            onToggleSatellite={() => setSatelliteOn((v) => !v)}
            point={point}
            onPick={(lat, lon) => setPoint({ lat, lon })}
            locations={locationsQ.data}
          />

          {forecastQ.isLoading && (
            <div className="panel"><div className="pbody"><span className="loading"><span className="spin" /> Pulling forecast…</span></div></div>
          )}
          {forecastQ.isError && (
            <div className="panel"><div className="pbody">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <span className="muted">
                  Could not load the forecast — the API did not respond. Make sure the backend is
                  running at <code>http://127.0.0.1:8000</code> (<code>cd backend &amp;&amp; uvicorn main:app --reload</code>).
                </span>
                <button className="btn raise" onClick={() => forecastQ.refetch()} data-tt="Retry the forecast request">
                  ↻ Retry
                </button>
              </div>
            </div></div>
          )}
          {forecastQ.data && <ForecastPanel forecast={forecastQ.data} />}
          {point && dataKeys.length === 0 && (
            <div className="panel"><div className="pbody muted">Enable at least one data layer to see a forecast.</div></div>
          )}
        </div>

        <div className="wrap-gap">
          <div className="panel corner">
            <div className="phead"><h3>Location</h3><span className="sub">AOR presets</span></div>
            <div className="pbody">
              <select
                className="select raise"
                data-tt="Jump to a preset AOR location"
                value={selectedLocName}
                onChange={(e) => {
                  const loc = locationsQ.data?.find((l) => l.name === e.target.value);
                  if (loc) setPoint({ lat: loc.lat, lon: loc.lon });
                }}
              >
                <option value="" disabled>Select a location…</option>
                {selectedLocName === "__custom__" && point && (
                  <option value="__custom__" disabled>
                    Custom map point ({point.lat.toFixed(2)}, {point.lon.toFixed(2)})
                  </option>
                )}
                {locationsQ.data?.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}{l.country ? `, ${l.country}` : ""}
                  </option>
                ))}
              </select>
              {aorQ.data && (
                <p className="legend-note">
                  {aorQ.data.name}. Refresh cadences — global {aorQ.data.refresh.global_hours}h,
                  regional {aorQ.data.refresh.regional_minutes}m, high-res {aorQ.data.refresh.high_res_minutes}m.
                </p>
              )}
            </div>
          </div>

          {layersQ.data && (
            <LayerPanel layers={layersQ.data} selected={selected} onToggle={toggle} />
          )}
        </div>
      </div>
      <DataSources mvp="MVP-1" />
    </div>
  );
}
