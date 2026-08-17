import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { MVPS } from "../mvpConfig";

export default function Placeholder({ mvp }: { mvp: string }) {
  const def = MVPS.find((m) => m.id === mvp)!;
  const statusQ = useQuery({ queryKey: ["mvp", mvp], queryFn: () => api.getMvpStatus(mvp) });
  const s = statusQ.data;

  return (
    <div className="fade-in wrap-gap">
      <div className="ph-hero">
        <div className="badge">{def.icon}</div>
        <div>
          <h2>{def.name}</h2>
          <span className="task">{def.id} · {def.task}</span>
        </div>
      </div>

      <div className="ph-grid">
        <div className="panel corner">
          <div className="phead"><h3>What this MVP delivers</h3><span className="sub">roadmap</span></div>
          <div className="pbody">
            <p style={{ marginTop: 0 }}>{def.blurb}</p>
            <p className="muted">{s?.message ?? "Loading status…"}</p>
            <div className="progress"><i style={{ width: "18%" }} /></div>
            <p className="legend-note">Foundation scaffolding in place · behavioural build pending.</p>
          </div>
        </div>

        <div className="panel corner">
          <div className="phead"><h3>Planned API endpoints</h3><span className="sub">contract</span></div>
          <div className="pbody">
            {statusQ.isLoading && <span className="loading"><span className="spin" /> Loading…</span>}
            {s?.planned_endpoints?.map((ep) => (
              <span className="chip" key={ep}>{ep}</span>
            ))}
            <p className="legend-note">
              This capability is wired into the same application shell as MVP-1 and shares the
              JSON/GeoJSON contract, so it integrates without reworking the viewer.
            </p>
          </div>
        </div>
      </div>

      <div className="panel corner">
        <div className="phead"><h3>Integration with the foundation</h3><span className="sub">how it plugs in</span></div>
        <div className="pbody muted">
          Consumes the shared forecast/normalization layer established by MVP-1 &amp; MVP-2 and
          publishes results through the same authenticated API. When built, this page is replaced
          by the live capability UI — no change required to the map viewer.
        </div>
      </div>
    </div>
  );
}
