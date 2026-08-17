import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/endpoints";
import RegionalGridMap from "../components/RegionalGridMap";
import { PARAM_COLORS } from "../mvpConfig";
import type { RegionalForecast } from "../types";
import DataSources from "../components/DataSources";

function color(k: string) {
  return PARAM_COLORS[k] ?? "#1f4468";
}
const OP_SYM: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
const SEV_COLOR: Record<string, string> = { warning: "#c0463a", watch: "#c08a2d", advisory: "#2d5c86" };
function hhmm(iso: string) {
  return (iso.split("T")[1] ?? iso).slice(0, 5);
}
function asUtc(iso: string) {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
}
function hexToRgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default function Mvp5Regional() {
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

  const fcQ = useQuery({
    queryKey: ["regional-fc", point?.lat, point?.lon],
    queryFn: () => api.getRegionalForecast(point!.lat, point!.lon),
    enabled: !!point,
    placeholderData: (p) => p,
    retry: 2,
  });
  const gridQ = useQuery({
    queryKey: ["regional-grid", point?.lat, point?.lon, parameter],
    queryFn: () => api.getRegionalGrid(point!.lat, point!.lon, parameter),
    enabled: !!point,
    placeholderData: (p) => p,
    retry: 2,
  });
  // Which Alerting-Engine rules breach under these conditions (read-only preview).
  const evalQ = useQuery({
    queryKey: ["regional-eval", point?.lat, point?.lon],
    queryFn: () => api.evaluate(point!.lat, point!.lon, false),
    enabled: !!point,
    retry: 2,
  });

  const selectedLocName = useMemo(() => {
    if (!point || !locationsQ.data) return "";
    const m = locationsQ.data.find((l) => Math.abs(l.lat - point.lat) < 1e-6 && Math.abs(l.lon - point.lon) < 1e-6);
    return m ? m.name : "";
  }, [point, locationsQ.data]);

  const fc: RegionalForecast | undefined = fcQ.data;
  const chartLayer = fc?.layers.find((l) => l.key === parameter) ?? fc?.layers[0];
  const c = color(chartLayer?.key ?? parameter);

  const chartData = useMemo(() => {
    if (!fc || !chartLayer) return [];
    return fc.times.map((t, i) => ({
      idx: i,
      label: hhmm(t),
      value: chartLayer.values[i],
      hourly: i % 4 === 0 ? chartLayer.values[i] : null, // dots only at hourly source steps
    }));
  }, [fc, chartLayer]);

  const nowIdx = useMemo(() => {
    if (!fc?.times.length) return 0;
    const now = Date.now();
    let best = 0, bd = Infinity;
    fc.times.forEach((t, i) => { const d = Math.abs(asUtc(t) - now); if (d < bd) { bd = d; best = i; } });
    return best;
  }, [fc]);

  const paramName = (k: string) => paramLayers.find((l) => l.key === k)?.name ?? k;
  const breaches = evalQ.data?.features ?? [];

  return (
    <div className="fade-in wrap-gap">
      <div className="ph-hero">
        <div className="badge">🛰️</div>
        <div>
          <h2>High-Resolution Regional Model Adapter</h2>
          <span className="task">MVP-5 · PWS T2 · 3&nbsp;km / 15-minute over the CENTCOM AOR</span>
        </div>
      </div>

      <div className="regional-top">
      {/* Capability badges + selectors */}
      <div className="panel corner">
        <div className="pbody caps-body">
          <div className="caps-badges">
            <div className="cap"><b>{fc?.grid_km ?? 3} km</b><span>Grid resolution</span></div>
            <div className="cap"><b>{fc?.step_minutes ?? 15} min</b><span>Output cadence</span></div>
            <div className="cap"><b>{fc?.horizon_hours ?? 36} h</b><span>Forecast horizon</span></div>
            <div className="cap"><b style={{ fontSize: 12.5, lineHeight: 1.25 }}>{fc?.model ?? "Convection-permitting regional (HRRR-analog, prototype)"}</b><span>Model (adapter)</span></div>
          </div>
          <div className="eval-bar" style={{ marginTop: "auto" }}>
            <select className="select raise" style={{ width: 230 }} value={selectedLocName}
              onChange={(e) => {
                const loc = locationsQ.data?.find((l) => l.name === e.target.value);
                if (loc) setPoint({ lat: loc.lat, lon: loc.lon });
              }} data-tt="Location in the AOR">
              <option value="" disabled>Select a location…</option>
              {locationsQ.data?.map((l) => (
                <option key={l.id} value={l.name}>{l.name}{l.country ? `, ${l.country}` : ""}</option>
              ))}
            </select>
            <select className="select raise" style={{ width: 220 }} value={parameter}
              onChange={(e) => setParameter(e.target.value)} data-tt="Parameter">
              {paramLayers.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 15-minute densified time-series */}
      <div className="panel corner">
        <div className="phead">
          <h3>15-minute regional forecast</h3>
          <span className="sub">{chartLayer?.name} · dots = hourly source, line = 15-min densified</span>
        </div>
        <div className="pbody">
          {fcQ.isError && <div className="empty">Load failed — is the backend running? ({String(fcQ.error)})</div>}
          {!fc && !fcQ.isError && <span className="loading"><span className="spin" /> Loading…</span>}
          {fc && chartLayer && (
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: -6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rg-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceef3" vertical={false} />
                  <XAxis dataKey="idx" tickFormatter={(i) => chartData[i as number]?.label ?? ""}
                    tick={{ fontSize: 10, fill: "#8a8f9e" }} interval="preserveStartEnd" minTickGap={44} />
                  <YAxis tick={{ fontSize: 10, fill: "#8a8f9e" }} width={44}
                    label={{ value: chartLayer.unit, angle: -90, position: "insideLeft", fontSize: 10, fill: "#8a8f9e" }} />
                  <Tooltip labelFormatter={(i) => chartData[i as number]?.label ?? ""}
                    formatter={(v: any, _n: any, item: any) =>
                      item?.dataKey === "hourly" ? [null, null] : [`${v} ${chartLayer.unit}`, chartLayer.name]} />
                  <ReferenceLine x={nowIdx} stroke="#12263a" strokeWidth={1.5} strokeDasharray="4 3"
                    label={{ value: "NOW", position: "top", fontSize: 9, fill: "#12263a", fontWeight: 700 }} />
                  <Area type="monotone" dataKey="value" stroke={c} strokeWidth={2} fill="url(#rg-grad)"
                    dot={false} isAnimationActive animationDuration={600} connectNulls />
                  {/* dots only at hourly source steps */}
                  <Line type="monotone" dataKey="hourly" stroke="none" legendType="none"
                    dot={{ r: 3, fill: c, stroke: "#fff", strokeWidth: 1 }} isAnimationActive={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="legend-note">
            The adapter densifies the hourly forecast to a 15-minute cadence (dots mark the hourly source steps).
            Production would ingest a real convection-permitting 3&nbsp;km regional ensemble.
          </p>
        </div>
      </div>
      </div>

      {/* 3km spatial grid overlaid on the map */}
      <div className="panel corner">
        <div className="phead">
          <h3>3&nbsp;km spatial grid</h3>
          <span className="sub">{gridQ.data ? `${gridQ.data.name} around ${selectedLocName || "point"}` : "loading…"}</span>
        </div>
        <div className="pbody">
          <div className="alerts-layout">
            {/* narrower map on the left */}
            <div>
              {gridQ.isError && <div className="empty">Load failed — backend running?</div>}
              {!gridQ.data && !gridQ.isError && <span className="loading"><span className="spin" /> Loading…</span>}
              {gridQ.data && <RegionalGridMap grid={gridQ.data} />}
              {gridQ.data && (
                <div className="heat-legend" style={{ marginTop: 8 }}>
                  <span>{gridQ.data.min}{gridQ.data.unit}</span>
                  <span className="heat-gradient" style={{
                    background: `linear-gradient(90deg, ${hexToRgba(color(gridQ.data.parameter), 0.35)}, ${hexToRgba(color(gridQ.data.parameter), 0.95)})`,
                  }} />
                  <span>{gridQ.data.max}{gridQ.data.unit}</span>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {gridQ.data.n}×{gridQ.data.n} @ {gridQ.data.grid_km}km · zoom to resize
                  </span>
                </div>
              )}
              <p className="legend-note">Each square is a 3&nbsp;km cell, georeferenced on the map; hover for coordinates &amp; value.</p>
            </div>

            {/* breaching Alerting-Engine rules under these conditions */}
            <div>
              <div className="grp-label" style={{ margin: "0 0 8px" }}>Breaching alerts · from the Alerting Engine</div>
              {evalQ.isFetching && <span className="loading"><span className="spin" /> Checking rules…</span>}
              {evalQ.data && evalQ.data.evaluated_rules === 0 && (
                <div className="empty">No alert rules configured — define them in the Alerting Engine (MVP-2).</div>
              )}
              {evalQ.data && (evalQ.data.evaluated_rules ?? 0) > 0 && breaches.length === 0 && (
                <div className="empty">No configured alerts are breaching under these conditions.</div>
              )}
              {breaches.map((f, i) => {
                const p: any = f.properties;
                const sev = p.severity as string;
                const why = `${paramName(p.parameter)} reaches ${p.value}${p.unit} (limit ${OP_SYM[p.operator] ?? p.operator} ${p.threshold}${p.unit})`;
                return (
                  <div className="alert-item" key={`${p.rule}-${i}`} style={{ borderLeft: `4px solid ${SEV_COLOR[sev] ?? "#c0463a"}` }}>
                    <span className={`sev-badge sev-${sev}`}>{sev}</span>
                    <span style={{ flex: 1 }}>
                      <div className="a-name">{p.rule}</div>
                      <div className="msg"><b>Why:</b> {why}</div>
                      <div className="meta">peaks around {hhmm(p.time)}</div>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <DataSources mvp="MVP-5" />
    </div>
  );
}
