import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import DataSources from "../components/DataSources";

export default function Mvp6Integration() {
  const previewQ = useQuery({ queryKey: ["cds-preview"], queryFn: api.getCdsPreview, retry: 2 });
  const dispatchMut = useMutation({ mutationFn: () => api.dispatchCds() });

  const ex = previewQ.data;
  const receipt = dispatchMut.data;

  const payloadJson = useMemo(
    () => (ex ? JSON.stringify(ex.payload, null, 2) : ""),
    [ex]
  );
  const shortSha = (s?: string) => (s ? `${s.slice(0, 16)}…${s.slice(-8)}` : "—");

  return (
    <div className="fade-in wrap-gap">
      <div className="ph-hero">
        <div className="badge">🔗</div>
        <div>
          <h2>Integration &amp; CDS Export Gateway</h2>
          <span className="task">MVP-6 · PWS T5 · classified-enclave boundary (SIPR / JWICS / C2)</span>
        </div>
      </div>

      {/* Classification banner (mock) */}
      {ex && <div className="cds-banner">{ex.classification} — MOCK</div>}

      {/* Transfer metadata + dispatch */}
      <div className="panel corner">
        <div className="phead"><h3>CDS transfer</h3><span className="sub">Government Cross-Domain Solution</span></div>
        <div className="pbody">
          {previewQ.isError && <div className="empty">Could not load preview — is the backend running? ({String(previewQ.error)})</div>}
          {!ex && !previewQ.isError && <span className="loading"><span className="spin" /> Building payload…</span>}
          {ex && (
            <>
              <div className="cds-meta">
                <div><span>Source system</span><b>{ex.source_system}</b></div>
                <div><span>Destination enclaves</span><b>{ex.destination.enclaves.join(" · ")}</b></div>
                <div><span>C2 systems</span><b>{ex.destination.c2_systems.join(" · ")}</b></div>
                <div><span>CDS drop point</span><b>{ex.destination.cds_drop}</b></div>
                <div><span>Transfer format</span><b>{ex.transfer_format}</b></div>
                <div><span>Records (alert objects)</span><b>{ex.record_count}</b></div>
                <div><span>SHA-256</span><b className="mono">{shortSha(ex.sha256)}</b></div>
                <div><span>Prepared</span><b>{new Date(ex.generated_at).toLocaleString()}</b></div>
              </div>

              <div className="eval-bar" style={{ marginTop: 14 }}>
                <button className="btn primary raise" onClick={() => dispatchMut.mutate()} disabled={dispatchMut.isPending}
                  data-tt="Simulate pushing the payload through the Government CDS to the classified enclave">
                  {dispatchMut.isPending ? "Dispatching…" : "▶ Dispatch to CDS (mock)"}
                </button>
                <button className="btn raise" onClick={() => previewQ.refetch()} data-tt="Rebuild the payload from current alerts">
                  ↻ Rebuild
                </button>
                <span className="legend-note" style={{ margin: 0 }}>{ex.note}</span>
              </div>

              {receipt && (
                <div className="cds-receipt">
                  <div className="cds-receipt-head">
                    <span className="ok-chip">✓ {receipt.status}</span>
                    <b className="mono">{receipt.transfer_id}</b>
                  </div>
                  <div className="cds-meta">
                    <div><span>Destination</span><b>{receipt.destination.enclaves.join(" · ")}</b></div>
                    <div><span>Records</span><b>{receipt.record_count}</b></div>
                    <div><span>Payload size</span><b>{receipt.bytes.toLocaleString()} bytes</b></div>
                    <div><span>SHA-256</span><b className="mono">{shortSha(receipt.sha256)}</b></div>
                    <div><span>Dispatched</span><b>{new Date(receipt.dispatched_at).toLocaleString()}</b></div>
                  </div>
                  <p className="legend-note" style={{ marginBottom: 0 }}>{receipt.note}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Payload inspector */}
      <div className="panel corner">
        <div className="phead">
          <h3>Payload inspector</h3>
          <span className="sub">{ex ? `GeoJSON FeatureCollection · ${ex.payload.features.length} feature(s)` : "loading…"}</span>
        </div>
        <div className="pbody">
          {ex && <pre className="json-view">{payloadJson}</pre>}
          <p className="legend-note">
            This is the exact machine-readable payload the gateway would push to the Government CDS drop point.
            It aggregates the Alerting Engine's GeoJSON alert objects; production maintains unclassified↔classified parity.
          </p>
        </div>
      </div>

      {ex && <div className="cds-banner">{ex.classification} — MOCK</div>}
      <DataSources mvp="MVP-6" />
    </div>
  );
}
