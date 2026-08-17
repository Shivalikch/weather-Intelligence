import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import EnsembleFanChart from "../components/EnsembleFanChart";
import { PARAM_COLORS } from "../mvpConfig";
import type { Layer } from "../types";
import DataSources from "../components/DataSources";

const DEFAULT_PARAMS = ["temperature_2m", "wind_10m", "wbgt", "dust"];

function color(key: string) {
  return PARAM_COLORS[key] ?? "#1f4468";
}
function asUtc(iso: string) {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
}

/** Checkbox multi-select dropdown for parameters. */
function ParamMultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: Layer[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="ms" ref={ref}>
      <button className="select raise ms-btn" onClick={() => setOpen((o) => !o)}
        data-tt="Choose parameters to compare (multi-select)">
        Parameters ({selected.size}) ▾
      </button>
      {open && (
        <div className="ms-panel">
          {options.map((o) => (
            <label key={o.key} className="ms-opt">
              <input type="checkbox" checked={selected.has(o.key)} onChange={() => onToggle(o.key)} />
              <span className="cat-dot" style={{ background: color(o.key) }} />
              {o.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Mvp3Probabilistic() {
  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: api.getLocations });
  const layersQ = useQuery({ queryKey: ["layers"], queryFn: api.getLayers });

  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);

  // Seed default location + 4 default parameters once.
  useEffect(() => {
    if (seeded || !locationsQ.data || !layersQ.data) return;
    const home = locationsQ.data.find((l) => l.is_aor_default) ?? locationsQ.data[0];
    if (home) setPoint({ lat: home.lat, lon: home.lon });
    const want = DEFAULT_PARAMS.filter((k) => layersQ.data!.some((l) => l.key === k));
    setSelected(new Set(want));
    setSeeded(true);
  }, [seeded, locationsQ.data, layersQ.data]);

  const paramLayers = useMemo(
    () => (layersQ.data ?? []).filter((l) => l.category !== "satellite"),
    [layersQ.data]
  );
  const selectedOrdered = useMemo(
    () => paramLayers.filter((l) => selected.has(l.key)).map((l) => l.key),
    [paramLayers, selected]
  );

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const selectedLocName = useMemo(() => {
    if (!point || !locationsQ.data) return "";
    const m = locationsQ.data.find((l) => Math.abs(l.lat - point.lat) < 1e-6 && Math.abs(l.lon - point.lon) < 1e-6);
    return m ? m.name : "";
  }, [point, locationsQ.data]);

  // One ensemble query per selected parameter.
  const ensembleResults = useQueries({
    queries: selectedOrdered.map((pk) => ({
      queryKey: ["ensemble", point?.lat, point?.lon, pk],
      queryFn: () => api.getEnsemble(point!.lat, point!.lon, pk),
      enabled: !!point,
      placeholderData: (prev: any) => prev,
      retry: 2,
    })),
  });

  const impactQ = useQuery({
    queryKey: ["impact", point?.lat, point?.lon],
    queryFn: () => api.getImpact(point!.lat, point!.lon),
    enabled: !!point,
    retry: 2,
  });
  const impacts = impactQ.data?.impacts ?? [];

  const layerName = (k: string) => paramLayers.find((l) => l.key === k)?.name ?? k;

  // Enlarge a card into a modal.
  const [modalParam, setModalParam] = useState<string | null>(null);
  const modalIdx = modalParam ? selectedOrdered.indexOf(modalParam) : -1;
  const modalData = modalIdx >= 0 ? ensembleResults[modalIdx]?.data : undefined;
  useEffect(() => {
    if (!modalParam) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModalParam(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalParam]);
  // Close if the enlarged parameter was deselected.
  useEffect(() => {
    if (modalParam && !selected.has(modalParam)) setModalParam(null);
  }, [modalParam, selected]);

  return (
    <div className="fade-in wrap-gap">
      <div className="ph-hero">
        <div className="badge">📈</div>
        <div>
          <h2>Probabilistic &amp; Operational-Impact Panels</h2>
          <span className="task">MVP-3 · PWS T1 · ensemble spread + decision-quality impacts</span>
        </div>
      </div>

      {/* Controls */}
      <div className="panel corner ctrl-panel">
        <div className="pbody">
          <div className="eval-bar">
            <select className="select raise" style={{ width: 230 }} value={selectedLocName}
              onChange={(e) => {
                const loc = locationsQ.data?.find((l) => l.name === e.target.value);
                if (loc) setPoint({ lat: loc.lat, lon: loc.lon });
              }} data-tt="Location to analyse">
              <option value="" disabled>Select a location…</option>
              {locationsQ.data?.map((l) => (
                <option key={l.id} value={l.name}>{l.name}{l.country ? `, ${l.country}` : ""}</option>
              ))}
            </select>

            <ParamMultiSelect options={paramLayers} selected={selected} onToggle={toggle} />

            {/* selected chips beside the dropdown */}
            <div className="ms-chips">
              {selectedOrdered.map((k) => (
                <span key={k} className="ms-chip" style={{ borderColor: color(k), color: color(k) }}>
                  <i className="cat-dot" style={{ background: color(k) }} />
                  {layerName(k)}
                  <button onClick={() => toggle(k)} data-tt="Remove" aria-label={`Remove ${layerName(k)}`}>×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ensemble spread — one card per selected parameter */}
      <div className="panel corner">
        <div className="phead">
          <h3>Ensemble spread</h3>
          <span className="sub">{selectedOrdered.length} parameter(s) · uncertainty grows with lead time</span>
        </div>
        <div className="pbody">
          {selectedOrdered.length === 0 && (
            <div className="empty">Select at least one parameter from the dropdown above.</div>
          )}
          <div className="ens-grid">
            {selectedOrdered.map((pk, i) => {
              const c = color(pk);
              const res = ensembleResults[i];
              const data = res?.data;
              const nowVal = (() => {
                if (!data?.times?.length) return null;
                const now = Date.now();
                let best = 0, bd = Infinity;
                data.times.forEach((t, j) => { const d = Math.abs(asUtc(t) - now); if (d < bd) { bd = d; best = j; } });
                return data.percentiles?.p50?.[best];
              })();
              return (
                <div className="chart-card" key={pk} onClick={() => setModalParam(pk)}
                  data-tt="Click to enlarge">
                  <div className="cc-head">
                    <span className="cat-dot" style={{ background: c }} />
                    <span className="cc-name">{layerName(pk)}</span>
                    <span className="cc-val" style={{ color: c, fontSize: 15 }}>
                      {nowVal == null ? "—" : Number(nowVal).toFixed(1)}
                      <span className="cc-unit">{data?.unit}</span>
                    </span>
                  </div>
                  {res?.isError && <div className="empty">Load failed — backend running?</div>}
                  {!data && !res?.isError && <span className="loading"><span className="spin" /> Loading…</span>}
                  {data && <EnsembleFanChart data={data} height={200} />}
                  {/* per-card legend, coloured to this parameter */}
                  <div className="ens-legend" style={{ ["--c" as any]: c }}>
                    <span><i className="l-line" /> Median (P50)</span>
                    <span><i className="l-band" /> P10–P90 spread</span>
                    <span><i className="l-dash" /> Deterministic</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="legend-note">
            Bands are the ensemble's calibrated uncertainty (wider = lower confidence). Prototype spread is derived
            from the deterministic forecast; production would ingest GEFS / ECMWF-AIFS members.
          </p>
        </div>
      </div>

      {/* Operational impact */}
      <div className="panel corner">
        <div className="phead"><h3>Operational impact</h3><span className="sub">decision-quality · plain language</span></div>
        <div className="pbody">
          {impactQ.data && (
            <div className={`impact-headline ${impacts.some((i) => i.active) ? "hot" : ""}`}>
              {impactQ.data.impact_text}
            </div>
          )}
          <div className="grp-label" style={{ margin: "12px 0 8px" }}>Impact assessment (most likely first)</div>
          {impactQ.isFetching && <span className="loading"><span className="spin" /> Assessing…</span>}
          <div className="chart-grid">
            {impacts.map((im) => (
              <div className={`chart-card impact-card ${im.active ? "active" : ""}`} key={im.key}
                data-tt={`${im.parameter} peak ${im.peak_value}${im.unit}`}>
                <div className="cc-head">
                  <span className={`sev-badge sev-${im.severity}`}>{im.severity}</span>
                  <span className="cc-name">{im.name}</span>
                  <span className="impact-status" style={{ color: im.active ? "var(--danger)" : "var(--ok)" }}>
                    {im.active ? "ACTIVE" : "benign"}
                  </span>
                </div>
                <div className="like-row">
                  <div className="like-bar"><i style={{ width: `${im.likelihood}%`, background: im.active ? "var(--danger)" : "var(--warn)" }} /></div>
                  <span className="like-pct">{im.likelihood}%</span>
                </div>
                <p className="impact-text">{im.impact}</p>
                <p className="bias-note" data-tt="Forecaster-facing model-bias cue">⚑ {im.bias_note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Enlarged ensemble modal */}
      {modalParam && (
        <div className="modal-backdrop" onClick={() => setModalParam(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="cat-dot" style={{ background: color(modalParam) }} />
              <h3>{layerName(modalParam)}</h3>
              {modalData && <span className="cc-val" style={{ color: color(modalParam) }}>{modalData.unit}</span>}
              <button className="modal-close" onClick={() => setModalParam(null)} aria-label="Close" data-tt="Close (Esc)">×</button>
            </div>
            {modalData ? (
              <>
                <EnsembleFanChart data={modalData} height={440} />
                <div className="ens-legend" style={{ ["--c" as any]: color(modalParam), marginTop: 8 }}>
                  <span><i className="l-line" /> Median (P50)</span>
                  <span><i className="l-band" /> P10–P90 spread</span>
                  <span><i className="l-dash" /> Deterministic</span>
                </div>
              </>
            ) : (
              <span className="loading"><span className="spin" /> Loading…</span>
            )}
          </div>
        </div>
      )}
      <DataSources mvp="MVP-3" />
    </div>
  );
}
