import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import AlertMiniMap, { AlertMapItem } from "../components/AlertMiniMap";
import AlertTimeline from "../components/AlertTimeline";
import type { FeatureCollection, NewAlertRule } from "../types";
import DataSources from "../components/DataSources";

const OPERATORS: { v: string; label: string }[] = [
  { v: "gt", label: "greater than (>)" },
  { v: "gte", label: "at least (≥)" },
  { v: "lt", label: "less than (<)" },
  { v: "lte", label: "at most (≤)" },
  { v: "eq", label: "equals (=)" },
];
const SEVERITIES = ["advisory", "watch", "warning"];
const OP_SYM: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
const NOTIFY_CHANNELS: { v: string; label: string }[] = [
  { v: "none", label: "None" },
  { v: "page", label: "📟 Page" },
  { v: "call", label: "📞 Automated call" },
  { v: "email", label: "✉ Email" },
];
const NOTIFY_LABEL: Record<string, string> = {
  none: "—", page: "📟 Page", call: "📞 Call", email: "✉ Email",
};

// No-code mission presets (one-click starting points a planner can tweak).
const PRESETS: (NewAlertRule & { icon: string })[] = [
  { icon: "🚁", name: "Rotary-wing wind limit", parameter: "wind_10m", operator: "gt", threshold_value: 25, unit: "kt", severity: "warning", mission_type: "rotary_wing", notify_channel: "page", notify_within_hours: 3 },
  { icon: "🚚", name: "Convoy visibility minimum", parameter: "visibility", operator: "lt", threshold_value: 3000, unit: "m", severity: "watch", mission_type: "ground_convoy", notify_channel: "call", notify_within_hours: 6 },
  { icon: "🌡️", name: "Extreme heat (WBGT)", parameter: "wbgt", operator: "gt", threshold_value: 32, unit: "°C", severity: "warning", mission_type: "ground_ops", notify_channel: "email", notify_within_hours: 12 },
  { icon: "🌪️", name: "Dust storm", parameter: "dust", operator: "gt", threshold_value: 500, unit: "µg/m³", severity: "warning", mission_type: "flight_ops", notify_channel: "page", notify_within_hours: 6 },
];

const emptyForm: NewAlertRule = {
  name: "", parameter: "wind_10m", operator: "gt", threshold_value: 25,
  unit: "kt", severity: "warning", mission_type: "",
  notify_channel: "none", notify_within_hours: 6,
};

export default function Mvp2Alerting() {
  const qc = useQueryClient();
  const layersQ = useQuery({ queryKey: ["layers"], queryFn: api.getLayers });
  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: api.getLocations });
  const rulesQ = useQuery({ queryKey: ["rules"], queryFn: api.listRules });
  const alertsQ = useQuery({ queryKey: ["alerts"], queryFn: api.listAlerts });

  const [form, setForm] = useState<NewAlertRule>(emptyForm);
  const [evalResult, setEvalResult] = useState<FeatureCollection | null>(null);
  const [locName, setLocName] = useState<string>("");

  const dataLayers = useMemo(
    () => (layersQ.data ?? []).filter((l) => l.category !== "satellite"),
    [layersQ.data]
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rules"] });
    qc.invalidateQueries({ queryKey: ["alerts"] });
  };

  const createMut = useMutation({
    mutationFn: (r: NewAlertRule) => api.createRule(r),
    onSuccess: () => { invalidate(); setForm(emptyForm); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteRule(id),
    onSuccess: invalidate,
  });
  const evalMut = useMutation({
    mutationFn: ({ lat, lon }: { lat: number; lon: number }) => api.evaluate(lat, lon),
    onSuccess: (fc) => { setEvalResult(fc); qc.invalidateQueries({ queryKey: ["alerts"] }); },
  });

  const applyPreset = (p: NewAlertRule) => setForm({ ...p });

  const onParameterChange = (key: string) => {
    const layer = dataLayers.find((l) => l.key === key);
    setForm((f) => ({ ...f, parameter: key, unit: layer?.unit ?? f.unit }));
  };

  const submit = () => {
    if (!form.name.trim()) return;
    createMut.mutate(form);
  };

  const runEvaluate = () => {
    const loc = locationsQ.data?.find((l) => l.name === locName)
      ?? locationsQ.data?.find((l) => l.is_aor_default)
      ?? locationsQ.data?.[0];
    if (loc) evalMut.mutate({ lat: loc.lat, lon: loc.lon });
  };

  const rules = rulesQ.data ?? [];
  const alerts = alertsQ.data ?? [];

  // Per-rule breach status at the last-evaluated location, for the alert map.
  const evalLocation = evalResult?.location ?? null;
  const evalItems = useMemo<AlertMapItem[]>(() => {
    if (!evalResult) return [];
    const byRule = new Map<number, any>();
    (evalResult.features ?? []).forEach((f) => byRule.set(f.properties.rule_id, f.properties));
    return rules
      .filter((r) => r.enabled)
      .map((r) => {
        const p = byRule.get(r.id);
        return {
          id: r.id,
          name: r.name,
          severity: r.severity,
          breached: byRule.has(r.id),
          value: p ? p.value : null,
          unit: r.unit,
        };
      });
  }, [evalResult, rules]);

  // Highest criticality first (warning > watch > advisory), newest within each.
  const sortedAlerts = useMemo(() => {
    const rank: Record<string, number> = { warning: 3, watch: 2, advisory: 1 };
    return [...alerts].sort((a, b) => {
      const s = (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
      return s !== 0 ? s : (b.generated_at || "").localeCompare(a.generated_at || "");
    });
  }, [alerts]);

  return (
    <div className="fade-in wrap-gap">
      <div className="ph-hero">
        <div className="badge">🔔</div>
        <div>
          <h2>No-Code Threshold &amp; Alerting Engine</h2>
          <span className="task">MVP-2 · PWS T3 · machine-readable GeoJSON alerts</span>
        </div>
      </div>

      <div className="mvp2-grid">
        {/* Rule builder */}
        <div className="panel corner">
          <div className="phead"><h3>Build a rule</h3><span className="sub">no-code</span></div>
          <div className="pbody">
            <div className="presets">
              {PRESETS.map((p) => (
                <button key={p.name} className="preset-btn raise" onClick={() => applyPreset(p)}
                  data-tt={`Preset: ${p.parameter} ${OP_SYM[p.operator]} ${p.threshold_value}${p.unit}`}>
                  <span>{p.icon}</span>{p.name}
                </button>
              ))}
            </div>

            <div className="form-grid">
              <div className="field full">
                <label>Rule name</label>
                <input value={form.name} placeholder="e.g. Rotary-wing wind limit"
                  onChange={(e) => setForm({ ...form, name: e.target.value })} data-tt="A recognisable name for this rule" />
              </div>
              <div className="field">
                <label>Parameter</label>
                <select value={form.parameter} onChange={(e) => onParameterChange(e.target.value)}
                  data-tt="Weather parameter to monitor">
                  {dataLayers.map((l) => (
                    <option key={l.key} value={l.key}>{l.name} ({l.unit})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Condition</label>
                <select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}
                  data-tt="Comparison operator">
                  {OPERATORS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Threshold</label>
                <input type="number" value={form.threshold_value}
                  onChange={(e) => setForm({ ...form, threshold_value: Number(e.target.value) })}
                  data-tt="Value the parameter is compared against" />
              </div>
              <div className="field">
                <label>Unit</label>
                <input value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  data-tt="Unit of measure (auto-filled from the parameter)" />
              </div>
              <div className="field">
                <label>Severity</label>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  data-tt="How serious a breach of this rule is">
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Mission type</label>
                <input value={form.mission_type ?? ""} placeholder="optional"
                  onChange={(e) => setForm({ ...form, mission_type: e.target.value })}
                  data-tt="Optional mission/platform tag" />
              </div>
              <div className="field">
                <label>Notification (mock)</label>
                <select value={form.notify_channel ?? "none"}
                  onChange={(e) => setForm({ ...form, notify_channel: e.target.value })}
                  data-tt="How to notify on breach — page, automated call, or email. All mock.">
                  {NOTIFY_CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Notify if breach within (hrs)</label>
                <input type="number" min={1} max={48} value={form.notify_within_hours ?? 6}
                  disabled={(form.notify_channel ?? "none") === "none"}
                  onChange={(e) => setForm({ ...form, notify_within_hours: Number(e.target.value) })}
                  data-tt="Fire the notification if a breach is forecast within this many hours from now" />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn primary raise" onClick={submit} disabled={createMut.isPending || !form.name.trim()}
                data-tt="Save this rule to the alerting engine">
                {createMut.isPending ? "Adding…" : "＋ Add rule"}
              </button>
              {createMut.isError && <span className="empty">Failed: {String(createMut.error)}</span>}
            </div>
          </div>
        </div>

        {/* Active rules */}
        <div className="panel corner">
          <div className="phead"><h3>Active rules</h3><span className="sub">{rules.length} configured</span></div>
          <div className="pbody">
            {rulesQ.isLoading && <span className="loading"><span className="spin" /> Loading…</span>}
            {!rulesQ.isLoading && rules.length === 0 && (
              <div className="empty">No rules yet — use a preset or build one on the left.</div>
            )}
            {rules.map((r) => (
              <div className="rule-row" key={r.id}>
                <span className={`sev-badge sev-${r.severity}`}>{r.severity}</span>
                <span style={{ flex: 1 }}>
                  <div className="rname">{r.name}</div>
                  <div className="rdef">
                    {r.parameter} {OP_SYM[r.operator] ?? r.operator} {r.threshold_value}{r.unit}
                    {r.notify_channel && r.notify_channel !== "none" && (
                      <> · {NOTIFY_LABEL[r.notify_channel]} ≤{r.notify_within_hours}h</>
                    )}
                  </div>
                </span>
                <button className="icon-btn raise" onClick={() => deleteMut.mutate(r.id)}
                  data-tt="Delete this rule" aria-label={`Delete ${r.name}`}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Evaluate + alerts console */}
      <div className="panel corner">
        <div className="phead"><h3>Evaluate &amp; alerts</h3><span className="sub">machine-readable GeoJSON</span></div>
        <div className="pbody">
          <div className="eval-bar">
            <select className="select raise" style={{ width: 240 }} value={locName}
              onChange={(e) => setLocName(e.target.value)} data-tt="Location to evaluate the rules at">
              <option value="">Default — Ali Al Salem AB</option>
              {locationsQ.data?.map((l) => (
                <option key={l.id} value={l.name}>{l.name}{l.country ? `, ${l.country}` : ""}</option>
              ))}
            </select>
            <button className="btn primary raise" onClick={runEvaluate} disabled={evalMut.isPending || rules.length === 0}
              data-tt="Run all active rules against the live forecast at this location">
              {evalMut.isPending ? "Evaluating…" : "▶ Evaluate now"}
            </button>
            {evalResult && (
              <span className="eval-summary">
                Evaluated <b>{evalResult.evaluated_rules}</b> rule(s) → <b>{evalResult.breaches}</b> breach(es).
              </span>
            )}
            {rules.length === 0 && <span className="empty">Add a rule first.</span>}
          </div>

          {/* Rule timeline — how each rule plays out over the forecast horizon */}
          {evalResult?.timeline && evalResult.timeline.rules.length > 0 && (
            <>
              <div className="grp-label" style={{ margin: "16px 0 8px" }}>
                Rule timeline — value vs threshold over the forecast (breaches marked, NOW dashed)
              </div>
              <AlertTimeline timeline={evalResult.timeline} />
            </>
          )}

          <div className="alerts-layout" style={{ marginTop: 16 }}>
            {/* Alerts console (animated) */}
            <div>
              <div className="grp-label" style={{ margin: "0 0 8px" }}>Generated alerts</div>
              {alertsQ.isLoading && <span className="loading"><span className="spin" /> Loading…</span>}
              {!alertsQ.isLoading && alerts.length === 0 && (
                <div className="empty">No alerts yet. Evaluate active rules to generate machine-readable alerts.</div>
              )}
              {sortedAlerts.slice(0, 30).map((a, idx) => {
                const name = a.message.split(":")[0];
                const detail = a.message.slice(name.length + 1).trim();
                return (
                  <div
                    className={`alert-item ${a.severity === "warning" ? "blink-warning" : ""}`}
                    key={a.id}
                    style={{ ["--in-delay" as any]: `${idx * 70}ms` }}
                  >
                    <span className={`sev-badge sev-${a.severity}`}>{a.severity}</span>
                    <span style={{ flex: 1 }}>
                      <div className="a-name"><span className="a-name-hl">{name}</span></div>
                      <div className="msg">{detail}</div>
                      <div className="meta">{a.parameter} · {new Date(a.generated_at + "Z").toLocaleString()}</div>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Alert map */}
            <div>
              <div className="grp-label" style={{ margin: "0 0 8px" }}>Alert map</div>
              {evalLocation ? (
                <AlertMiniMap location={evalLocation} items={evalItems} />
              ) : (
                <div className="alert-map-placeholder">
                  Run <b>Evaluate&nbsp;now</b> to plot each rule around the location — breaching
                  rules glow in their severity colour, clear rules stay green.
                </div>
              )}
              <div className="map-legend">
                <span><i className="legend-dot" style={{ background: "#2e9e6b" }} /> Clear</span>
                <span><i className="legend-dot" style={{ background: "#c08a2d" }} /> Watch</span>
                <span><i className="legend-dot" style={{ background: "#c0463a" }} /> Warning</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <DataSources mvp="MVP-2" />
    </div>
  );
}
