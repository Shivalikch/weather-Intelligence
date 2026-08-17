import { MVPS } from "../mvpConfig";
import { useUI } from "../store";

export default function MvpNav() {
  const active = useUI((s) => s.activeMvp);
  const setActive = useUI((s) => s.setActiveMvp);

  return (
    <nav className="sidenav" aria-label="MVP navigation">
      <div className="grp-label">Capabilities (MVPs)</div>
      {MVPS.map((m) => (
        <button
          key={m.id}
          className={`navitem raise ${active === m.id ? "active" : ""} ${m.implemented ? "" : "soon"}`}
          onClick={() => setActive(m.id)}
          data-tt={m.blurb}
          data-tt-pos="right"
          aria-current={active === m.id}
        >
          <span className="ic">{m.icon}</span>
          <span className="lbl">
            {m.name}
            <small>{m.id} · {m.task}</small>
          </span>
          <span className="tagpill">{m.implemented ? "LIVE" : "SOON"}</span>
        </button>
      ))}
    </nav>
  );
}
