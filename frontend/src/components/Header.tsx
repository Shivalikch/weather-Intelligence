import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";

export default function Header() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.getHealth,
    refetchInterval: 30_000,
  });

  const up = health?.database === "up";

  return (
    <header className="topbar">
      <div className="wordmark" data-tt="Prototype build · demonstration only">
        Prototype
      </div>
      <div className="divider" />
      <div className="mission">
        <b>AFCENT Weather Intelligence</b>
        <span>USCENTCOM · Command Weather Console</span>
      </div>
      <div className="spacer" />
      <div
        className="status-chip raise"
        data-tt={up ? "Backend & database online" : "Backend unreachable — start the API"}
      >
        <span className={`dot ${up ? "" : "down"}`} />
        {up ? "SYSTEMS NOMINAL" : "OFFLINE"}
        {health?.version ? ` · v${health.version}` : ""}
      </div>
    </header>
  );
}
