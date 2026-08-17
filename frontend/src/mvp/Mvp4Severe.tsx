import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import SevereMap from "../components/SevereMap";
import { PACK_COLORS } from "../mvpConfig";
import type { GeoFeature } from "../types";
import DataSources from "../components/DataSources";

const OP_SYM: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
const SEV_RANK: Record<string, number> = { warning: 3, watch: 2, advisory: 1 };

function fmtTime(iso: string) {
  return (iso.split("T")[1] ?? "").slice(0, 5);
}
function asUtc(iso: string) {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
}

/** Green-zone timeline: breach spans in the pack colour, clear spans green;
 *  tells when the severity is expected to end. */
function DetectionTimelineBar({
  times,
  breaches,
  packColor,
}: {
  times: string[];
  breaches: boolean[];
  packColor: string;
}) {
  const nowIdx = useMemo(() => {
    if (!times.length) return 0;
    const now = Date.now();
    let best = 0;
    let bd = Infinity;
    times.forEach((t, i) => {
      const d = Math.abs(asUtc(t) - now);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }, [times]);

  const clears = useMemo(() => {
    let i = nowIdx;
    while (i < breaches.length && !breaches[i]) i++;
    if (i >= breaches.length) return { text: "no active breach ahead", color: "var(--ok)" };
    let j = i;
    while (j < breaches.length && breaches[j]) j++;
    if (j >= breaches.length) return { text: "persists beyond forecast", color: "var(--danger)" };
    return { text: `clears ~ ${fmtTime(times[j])}`, color: "var(--ok)" };
  }, [breaches, nowIdx, times]);

  const nowPct = times.length > 1 ? (nowIdx / (times.length - 1)) * 100 : 0;

  return (
    <div className="tl-wrap" data-tt="Green = clear, colour = active severity. Vertical line = NOW.">
      <div className="tl-bar">
        {breaches.map((b, i) => (
          <span key={i} className="tl-seg" style={{ background: b ? packColor : "var(--ok)" }} />
        ))}
        <span className="tl-now" style={{ left: `${nowPct}%` }} />
      </div>
      <div className="tl-legend">
        <span>{fmtTime(times[0])}</span>
        <span className="tl-ends" style={{ color: clears.color }}>🟢 {clears.text}</span>
        <span>{fmtTime(times[times.length - 1])}</span>
      </div>
    </div>
  );
}

export default function Mvp4Severe() {
  const aorQ = useQuery({ queryKey: ["aor"], queryFn: api.getAor });
  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: api.getLocations });
  const packsQ = useQuery({ queryKey: ["severe-packs"], queryFn: api.getSeverePacks });
  const scanQ = useQuery({ queryKey: ["severe-detections"], queryFn: () => api.scanSevere(), retry: 2 });

  const features: GeoFeature[] = scanQ.data?.features ?? [];
  const times = scanQ.data?.times ?? [];
  const sorted = useMemo(
    () => [...features].sort((a, b) => (SEV_RANK[b.properties.severity] ?? 0) - (SEV_RANK[a.properties.severity] ?? 0)),
    [features]
  );
  const worstRank = useMemo(
    () => features.reduce((acc, f) => Math.max(acc, SEV_RANK[f.properties.severity] ?? 0), 0),
    [features]
  );
  const affectedSites = new Set(features.map((f) => f.properties.location)).size;

  // Clicking a detection card flies the situational map to that location.
  const [focus, setFocus] = useState<{ lat: number; lon: number; nonce: number } | null>(null);

  return (
    <div className="fade-in wrap-gap">
      <div className="ph-hero">
        <div className="badge">🌪️</div>
        <div>
          <h2>Severe-Weather Detection Packs</h2>
          <span className="task">MVP-4 · PWS T4 · AOR-wide automated monitoring</span>
        </div>
      </div>

      {/* Scan bar */}
      <div className="panel corner">
        <div className="pbody">
          <div className="eval-bar">
            <button className="btn primary raise" onClick={() => scanQ.refetch()} disabled={scanQ.isFetching}
              data-tt="Run all detection packs across the CENTCOM AOR against the live forecast">
              {scanQ.isFetching ? "Scanning…" : "▶ Scan AOR"}
            </button>
            {scanQ.data && (
              <span className="eval-summary">
                <b>{scanQ.data.detections}</b> detection(s) across <b>{affectedSites}</b> site(s).
              </span>
            )}
            {scanQ.isError && <span className="empty">Scan failed — is the backend running? ({String(scanQ.error)})</span>}
          </div>
        </div>
      </div>

      {/* Detections list + AOR map */}
      <div className="panel corner">
        <div className="phead"><h3>AOR detections</h3><span className="sub">worst first · GeoJSON</span></div>
        <div className="pbody">
          <div className="alerts-layout">
            <div>
              <div className="grp-label" style={{ margin: "0 0 8px" }}>Active detections</div>
              {scanQ.isFetching && <span className="loading"><span className="spin" /> Scanning AOR…</span>}
              {!scanQ.isFetching && sorted.length === 0 && (
                <div className="empty">No severe conditions detected across the AOR right now.</div>
              )}
              {sorted.map((f, i) => {
                const p = f.properties;
                const [lon, lat] = f.geometry.coordinates;
                const packColor = PACK_COLORS[p.pack] ?? "#c0463a";
                const isWorst = (SEV_RANK[p.severity] ?? 0) === worstRank;
                return (
                  <div
                    className={`alert-item det-card ${isWorst ? "blink-pack" : ""}`}
                    key={`${p.location}-${p.pack}-${i}`}
                    onClick={() => setFocus({ lat, lon, nonce: Date.now() })}
                    data-tt="Click to locate this detection on the situational map"
                    style={{
                      ["--pack-color" as any]: packColor,
                      ["--in-delay" as any]: `${i * 60}ms`,
                      borderLeft: `4px solid ${packColor}`,
                      background: `${packColor}0d`,
                    }}
                  >
                    <div className="det-site">
                      <span className={`sev-badge sev-${p.severity}`}>{p.severity}</span>
                      <div className="det-site-name">{p.location}</div>
                      {p.country && <div className="det-site-meta">{p.country}</div>}
                      <div className="det-site-coords">{lat.toFixed(2)}, {lon.toFixed(2)}</div>
                    </div>
                    <span style={{ flex: 1 }}>
                      <div className="a-name" style={{ color: packColor }}>{p.icon} {p.name}</div>
                      <div className="msg">
                        {p.parameter} peak {p.value}{p.unit} ({OP_SYM[p.operator] ?? p.operator} {p.threshold}{p.unit}) · {p.hours_affected}h
                      </div>
                      {times.length > 0 && Array.isArray(p.breaches) && (
                        <DetectionTimelineBar times={times} breaches={p.breaches} packColor={packColor} />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="grp-label" style={{ margin: "0 0 8px" }}>AOR situational map</div>
              <SevereMap locations={locationsQ.data ?? []} features={features} aor={aorQ.data} focus={focus} />
              <div className="map-legend">
                <span><i className="legend-dot" style={{ background: "#2e9e6b" }} /> Clear</span>
                {packsQ.data?.map((pk) => (
                  <span key={pk.key}>
                    <i className="legend-dot" style={{ background: PACK_COLORS[pk.key] ?? "#c0463a" }} /> {pk.name.replace(/\s*\(.*\)/, "")}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pre-built pack catalogue */}
      <div className="panel corner">
        <div className="phead"><h3>Detection packs</h3><span className="sub">{packsQ.data?.length ?? 0} pre-built</span></div>
        <div className="pbody">
          <div className="chart-grid">
            {packsQ.data?.map((pack) => {
              const c = PACK_COLORS[pack.key] ?? "#c0463a";
              return (
                <div className="chart-card" key={pack.key} data-tt={pack.description}
                  style={{ borderLeft: `4px solid ${c}`, background: `${c}0d` }}>
                  <div className="cc-head">
                    <span style={{ fontSize: 18 }}>{pack.icon}</span>
                    <span className="cc-name" style={{ color: c }}>{pack.name}</span>
                    <span className={`sev-badge sev-${pack.severity}`}>{pack.severity}</span>
                  </div>
                  <div className="cc-sub">
                    {pack.parameter} {OP_SYM[pack.operator] ?? pack.operator} {pack.threshold}{pack.unit}
                  </div>
                  <p className="legend-note" style={{ margin: "4px 0 0" }}>{pack.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <DataSources mvp="MVP-4" />
    </div>
  );
}
