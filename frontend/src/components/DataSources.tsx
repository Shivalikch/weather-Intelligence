import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import type { ExternalApi } from "../types";

/**
 * Per-MVP data-source panel.
 *
 * Lists the base API endpoint each MVP sources its data from, with a one-line
 * note — mirroring the "Public Data Sources to Power the Demo" table in the
 * architecture document.
 *
 * The rows are NOT hard-coded here: they come from the `external_api` table via
 * /api/external-apis and are filtered on that table's `mvp` column, so the panel
 * stays correct if a source is added, retargeted or disabled in the seed data.
 *
 * `live` distinguishes sources the prototype actually calls over the wire today
 * from those catalogued as the production source for that capability.
 */
export default function DataSources({ mvp }: { mvp: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["external-apis"],
    queryFn: api.getExternalApis,
    staleTime: 5 * 60_000,
  });

  const rows: ExternalApi[] = (data ?? [])
    .filter((a) => a.enabled)
    // `mvp` is a comma-separated list, e.g. "MVP-1,MVP-3" — match whole tokens
    // so MVP-1 never matches a hypothetical MVP-10.
    .filter((a) => a.mvp.split(",").map((m) => m.trim()).includes(mvp))
    // Live sources first, then alphabetically by provider.
    .sort((a, b) =>
      a.live === b.live ? a.provider.localeCompare(b.provider) : a.live ? -1 : 1
    );

  return (
    <section className="panel corner ds-panel" aria-label={`Data sources for ${mvp}`}>
      <div className="phead">
        <h3>Data Sources</h3>
        <span className="sub">Base endpoints powering {mvp}</span>
      </div>
      <div className="pbody">
        {isLoading && (
          <div className="loading">
            <span className="spin" /> Loading source catalogue…
          </div>
        )}
        {isError && <div className="empty">Source catalogue unavailable — is the API running?</div>}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="empty">
            No external source is registered against {mvp}; this capability is derived from
            data already ingested by the earlier MVPs.
          </div>
        )}

        {rows.length > 0 && (
          <div className="ds-list">
            {rows.map((a) => (
              <div className="ds-row" key={a.name}>
                <div className="ds-main">
                  <div className="ds-top">
                    <b className="ds-provider">{a.provider}</b>
                    <span className={`ds-chip ${a.live ? "live" : "cat"}`}>
                      {a.live ? "LIVE" : "CATALOGUED"}
                    </span>
                    <span className={`ds-chip ${a.requires_key ? "key" : "free"}`}>
                      {a.requires_key ? "Free reg." : "No key"}
                    </span>
                    <span className="ds-chip fmt">{a.data_format.toUpperCase()}</span>
                  </div>
                  <code className="ds-url" title={`${a.base_url}${a.endpoint_path}`}>
                    {a.base_url}
                    <span className="ds-path">{a.endpoint_path || "/"}</span>
                  </code>
                  <div className="ds-note">{a.comment}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {rows.some((a) => !a.live) && (
          <p className="ds-foot">
            <b>LIVE</b> sources are called over the wire by this prototype.{" "}
            <b>CATALOGUED</b> sources are the documented production source for this
            capability; the value shown is derived from the live sources until that
            adapter is wired.
          </p>
        )}
      </div>
    </section>
  );
}
