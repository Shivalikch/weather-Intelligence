import type { Layer } from "../types";
import { CATEGORY_COLORS } from "../mvpConfig";

interface Props {
  layers: Layer[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}

export default function LayerPanel({ layers, selected, onToggle }: Props) {
  // Satellite imagery is controlled from the map itself; the panel lists the
  // data layers only.
  const dataLayers = layers.filter((l) => l.category !== "satellite");

  return (
    <div className="panel corner">
      <div className="phead">
        <h3>Layers</h3>
        <span className="sub">toggle · {selected.size} on</span>
      </div>
      <div className="pbody wrap-gap" style={{ gap: 4 }}>
        {dataLayers.map((l) => {
          const on = selected.has(l.key);
          return (
            <div
              key={l.key}
              className={`layer-row raise ${on ? "on" : ""}`}
              onClick={() => onToggle(l.key)}
              data-tt={`${l.description} (${l.unit || "n/a"}) · source: ${l.source}`}
              role="switch"
              aria-checked={on}
            >
              <span className="cat-dot" style={{ background: CATEGORY_COLORS[l.category] ?? "#999" }} />
              <span style={{ flex: 1 }}>
                <div className="lname">{l.name}</div>
                <div className="lcat">{l.category}</div>
              </span>
              <span className="sw" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
