import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import EnsembleFanChart from "../components/EnsembleFanChart";
import DataSources from "../components/DataSources";

export default function Mvp7Model() {
  const statusQ = useQuery({ queryKey: ["model-status"], queryFn: api.getModelStatus, retry: 2 });
  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: api.getLocations });
  const layersQ = useQuery({ queryKey: ["layers"], queryFn: api.getLayers });

  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [parameter, setParameter] = useState("temperature_2m");

  useEffect(() => {
    if (point || !locationsQ.data) return;
    const home = locationsQ.data.find((l) => l.is_aor_default) ?? locationsQ.data[0];
    if (home) setPoint({ lat: home.lat, lon: home.lon });
  }, [point, locationsQ.data]);

  const paramLayers = useMemo(
    () => (layersQ.data ?? []).filter((l) => l.category !== "satellite"),
    [layersQ.data]
  );

  const predictQ = useQuery({
    queryKey: ["model-predict", point?.lat, point?.lon, parameter],
    queryFn: () => api.getPrediction(point!.lat, point!.lon, parameter),
    enabled: !!point,
    placeholderData: (p) => p,
    retry: 2,
  });

  const selectedLocName = useMemo(() => {
    if (!point || !locationsQ.data) return "";
    const m = locationsQ.data.find((l) => Math.abs(l.lat - point.lat) < 1e-6 && Math.abs(l.lon - point.lon) < 1e-6);
    return m ? m.name : "";
  }, [point, locationsQ.data]);

  const s = statusQ.data;
  const pred = predictQ.data;

  return (
    <div className="fade-in wrap-gap">
      <div className="ph-hero">
        <div className="badge">🧠</div>
        <div>
          <h2>AI-Native Global Prediction Engine</h2>
          <span className="task">MVP-7 · PWS T1 · probabilistic global model, swaps behind the forecast interface</span>
        </div>
      </div>

      {/* Engine status */}
      <div className="panel corner">
        <div className="phead"><h3>Engine status</h3><span className="sub">AI-NWP</span></div>
        <div className="pbody">
          {statusQ.isError && <div className="empty">Could not load engine status — is the backend running?</div>}
          {!s && !statusQ.isError && <span className="loading"><span className="spin" /> Loading…</span>}
          {s && (
            <>
              <div className="engine-head">
                <span className="dot" /> <b>{s.engine}</b>
                <span className="engine-online">{s.status.toUpperCase()}</span>
              </div>
              <div className="engine-metrics">
                <div className="cap"><b>{s.resolution_km} km</b><span>Global resolution</span></div>
                <div className="cap"><b>{s.regional_resolution_km} km</b><span>Regional resolution</span></div>
                <div className="cap"><b>{s.ensemble_members}</b><span>Ensemble members</span></div>
                <div className="cap"><b>{s.refresh_hours} h</b><span>Refresh cadence</span></div>
                <div className="cap"><b>{s.horizon_hours} h</b><span>Forecast horizon</span></div>
                <div className="cap"><b>{s.data_layers}+</b><span>Data layers</span></div>
              </div>
              <div className="grp-label" style={{ margin: "14px 0 6px" }}>Independent data assimilation</div>
              <ul className="tick-list">
                {s.assimilation.map((a) => <li key={a}>{a}</li>)}
                <li>{s.merged_precipitation}</li>
              </ul>
              <p className="legend-note"><b>Compute:</b> {s.compute}</p>
              <p className="legend-note" style={{ marginTop: 4 }}>{s.note}</p>
            </>
          )}
        </div>
      </div>

      {/* AI-native prediction */}
      <div className="panel corner">
        <div className="phead">
          <h3>AI-native prediction</h3>
          <span className="sub">probabilistic · swaps behind the forecast interface</span>
        </div>
        <div className="pbody">
          <div className="eval-bar">
            <select className="select raise" style={{ width: 230 }} value={selectedLocName}
              onChange={(e) => {
                const loc = locationsQ.data?.find((l) => l.name === e.target.value);
                if (loc) setPoint({ lat: loc.lat, lon: loc.lon });
              }} data-tt="Location to predict">
              <option value="" disabled>Select a location…</option>
              {locationsQ.data?.map((l) => (
                <option key={l.id} value={l.name}>{l.name}{l.country ? `, ${l.country}` : ""}</option>
              ))}
            </select>
            <select className="select raise" style={{ width: 220 }} value={parameter}
              onChange={(e) => setParameter(e.target.value)} data-tt="Parameter">
              {paramLayers.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
            </select>
            {pred && (
              <span className="skill-badge" data-tt="Illustrative model-skill / confidence score">
                Model skill {Math.round(pred.skill_score * 100)}%
              </span>
            )}
          </div>

          {predictQ.isError && <div className="empty">Prediction failed — backend running? ({String(predictQ.error)})</div>}
          {!pred && !predictQ.isError && <span className="loading"><span className="spin" /> Running inference…</span>}
          {pred && (
            <div style={{ marginTop: 10 }}>
              <EnsembleFanChart data={pred} height={280} />
              <div className="map-legend" style={{ marginTop: 8 }}>
                <span><i className="legend-dash" /> Deterministic</span>
                <span className="muted">{pred.member_count}-member ensemble · {pred.resolution_km}km · {pred.engine}</span>
              </div>
            </div>
          )}
          <p className="legend-note">
            This prediction is served through the same probabilistic interface as MVP-3 — in production the proprietary
            AI-NWP model (GPU) replaces the reference behind this endpoint with no change to the UI.
          </p>
        </div>
      </div>
      <DataSources mvp="MVP-7" />
    </div>
  );
}
