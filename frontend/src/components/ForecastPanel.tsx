import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Forecast, ForecastLayer } from "../types";
import { CATEGORY_COLORS } from "../mvpConfig";

function hour(iso: string) {
  const t = iso.split("T")[1] ?? iso;
  return t.slice(0, 5);
}

function asUtc(iso: string) {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
}

const HOVER_CURSOR = { stroke: "#8a8f9e", strokeWidth: 1, strokeDasharray: "3 3" };

// ---------------------------------------------------------------------------
// Master chart tooltip: shows every layer's real value + unit at the hovered
// time (the chart itself plots normalised values so the series are comparable).
// ---------------------------------------------------------------------------
function MasterTooltip(props: any) {
  const { active, payload, label, data, unitMap, nameMap } = props;
  if (!active || !payload || !payload.length) return null;
  const row = data[label as number];
  return (
    <div className="master-tt">
      <div className="mtt-time">{row?.label}</div>
      {payload.map((p: any) => {
        const raw = row?.[`${p.dataKey}_raw`];
        return (
          <div className="mtt-row" key={p.dataKey}>
            <span className="mtt-dot" style={{ background: p.color }} />
            {nameMap[p.dataKey]}:{" "}
            <b>
              {raw === null || raw === undefined ? "—" : Number(raw).toFixed(1)} {unitMap[p.dataKey]}
            </b>
          </div>
        );
      })}
    </div>
  );
}

function MasterChart({
  layers,
  times,
  nowIdx,
}: {
  layers: ForecastLayer[];
  times: string[];
  nowIdx: number;
}) {
  const { data, unitMap, nameMap } = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    layers.forEach((l) => {
      const nums = l.values.filter((v): v is number => v !== null);
      ranges[l.key] = {
        min: nums.length ? Math.min(...nums) : 0,
        max: nums.length ? Math.max(...nums) : 1,
      };
    });
    const rows = times.map((t, i) => {
      const row: any = { idx: i, label: hour(t) };
      layers.forEach((l) => {
        const v = l.values[i];
        const { min, max } = ranges[l.key];
        row[l.key] = v === null ? null : max === min ? 0.5 : (v - min) / (max - min);
        row[`${l.key}_raw`] = v;
      });
      return row;
    });
    return {
      data: rows,
      unitMap: Object.fromEntries(layers.map((l) => [l.key, l.unit])),
      nameMap: Object.fromEntries(layers.map((l) => [l.key, l.name])),
    };
  }, [layers, times]);

  return (
    <div className="master-chart">
      <div className="grp-label" style={{ margin: "0 0 8px" }}>
        Master forecast — all selected layers (relative scale · hover to compare)
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 12, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eceef3" vertical={false} />
            <XAxis
              dataKey="idx"
              tickFormatter={(i) => data[i as number]?.label ?? ""}
              tick={{ fontSize: 10, fill: "#8a8f9e" }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis hide domain={[0, 1]} />
            <Tooltip
              cursor={{ stroke: "#12263a", strokeWidth: 1.2, strokeDasharray: "3 3" }}
              content={<MasterTooltip data={data} unitMap={unitMap} nameMap={nameMap} />}
            />
            <ReferenceLine
              x={nowIdx}
              stroke="#12263a"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: "NOW", position: "top", fontSize: 9, fill: "#12263a", fontWeight: 700 }}
            />
            {layers.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={CATEGORY_COLORS[l.category] ?? "#1f4468"}
                strokeWidth={2}
                dot={false}
                isAnimationActive
                animationDuration={500}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One chart card per parameter (Current Reading).
// ---------------------------------------------------------------------------
function MiniChart({
  layer,
  times,
  nowIdx,
}: {
  layer: ForecastLayer;
  times: string[];
  nowIdx: number;
}) {
  const color = CATEGORY_COLORS[layer.category] ?? "#1f4468";
  const data = times.map((t, i) => ({ idx: i, label: hour(t), value: layer.values[i] }));
  const current = layer.values[nowIdx] ?? layer.values[0];
  const gradId = `grad-${layer.key}`;

  return (
    <div className="chart-card raise" data-tt={`${layer.name} — ${layer.unit}. Dashed line = NOW; hover for values.`}>
      <div className="cc-head">
        <span className="cat-dot" style={{ background: color }} />
        <span className="cc-name">{layer.name}</span>
        <span className="cc-val" style={{ color }}>
          {current === null || current === undefined ? "—" : Number(current).toFixed(1)}
          <span className="cc-unit">{layer.unit}</span>
        </span>
      </div>
      <div style={{ width: "100%", height: 118 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eceef3" vertical={false} />
            <XAxis
              dataKey="idx"
              tickFormatter={(i) => data[i as number]?.label ?? ""}
              tick={{ fontSize: 9, fill: "#8a8f9e" }}
              interval="preserveStartEnd"
              minTickGap={26}
            />
            <YAxis tick={{ fontSize: 9, fill: "#8a8f9e" }} width={30} />
            <Tooltip
              cursor={HOVER_CURSOR}
              labelFormatter={(i) => data[i as number]?.label ?? ""}
              formatter={(v) => [`${v} ${layer.unit}`, layer.name]}
            />
            <ReferenceLine
              x={nowIdx}
              stroke="#12263a"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: "NOW", position: "top", fontSize: 9, fill: "#12263a", fontWeight: 700 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              isAnimationActive
              animationDuration={600}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ForecastPanel({ forecast }: { forecast: Forecast }) {
  const times = forecast.times;
  const numeric = forecast.layers.filter((l) => l.values.some((v) => v !== null));

  // Index of the forecast time-step closest to 'now' (for the NOW line).
  const nowIdx = useMemo(() => {
    if (!times.length) return 0;
    const now = Date.now();
    let best = 0;
    let bestDelta = Infinity;
    times.forEach((t, i) => {
      const d = Math.abs(asUtc(t) - now);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    });
    return best;
  }, [times]);

  if (!numeric.length) return null;

  return (
    <div className="panel corner">
      <div className="phead">
        <h3>Point Forecast</h3>
        <span className="sub">
          {forecast.location.lat.toFixed(2)}, {forecast.location.lon.toFixed(2)}
        </span>
        <span className="sub" style={{ marginLeft: "auto" }}>
          {numeric.length} reading{numeric.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="pbody">
        <MasterChart layers={numeric} times={times} nowIdx={nowIdx} />

        <div className="grp-label" style={{ margin: "4px 0 10px" }}>Current readings</div>
        <div className="chart-grid">
          {numeric.map((l) => (
            <MiniChart key={l.key} layer={l} times={times} nowIdx={nowIdx} />
          ))}
        </div>
      </div>
    </div>
  );
}
