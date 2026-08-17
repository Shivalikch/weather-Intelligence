import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PARAM_COLORS } from "../mvpConfig";
import type { Ensemble } from "../types";

function hour(iso: string) {
  return (iso.split("T")[1] ?? iso).slice(0, 5);
}
function asUtc(iso: string) {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
}

export default function EnsembleFanChart({ data, height = 260 }: { data: Ensemble; height?: number }) {
  const color = PARAM_COLORS[data.parameter] ?? "#1f4468";
  const p = data.percentiles;

  const rows = useMemo(
    () =>
      data.times.map((t, i) => ({
        idx: i,
        label: hour(t),
        p10: p.p10?.[i] ?? null,
        // stacked band segments (invisible base + visible thickness)
        band10_90: p.p10?.[i] != null && p.p90?.[i] != null ? (p.p90[i] as number) - (p.p10[i] as number) : null,
        p25: p.p25?.[i] ?? null,
        band25_75: p.p25?.[i] != null && p.p75?.[i] != null ? (p.p75[i] as number) - (p.p25[i] as number) : null,
        p50: p.p50?.[i] ?? null,
        p90: p.p90?.[i] ?? null,
        det: data.deterministic?.[i] ?? null,
      })),
    [data]
  );

  const nowIdx = useMemo(() => {
    if (!data.times.length) return 0;
    const now = Date.now();
    let best = 0;
    let bd = Infinity;
    data.times.forEach((t, i) => {
      const d = Math.abs(asUtc(t) - now);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }, [data.times]);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 12, right: 16, left: -6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eceef3" vertical={false} />
          <XAxis dataKey="idx" tickFormatter={(i) => rows[i as number]?.label ?? ""}
            tick={{ fontSize: 10, fill: "#8a8f9e" }} interval="preserveStartEnd" minTickGap={40} />
          <YAxis tick={{ fontSize: 10, fill: "#8a8f9e" }} width={44}
            label={{ value: data.unit, angle: -90, position: "insideLeft", fontSize: 10, fill: "#8a8f9e" }} />
          <Tooltip
            labelFormatter={(i) => rows[i as number]?.label ?? ""}
            formatter={(v: any, name: any) => {
              const label: Record<string, string> = { p50: "median", det: "deterministic", band10_90: "", band25_75: "" };
              if (name === "band10_90" || name === "band25_75" || name === "p10" || name === "p25") return [undefined as any, undefined as any];
              return [`${v} ${data.unit}`, label[name] ?? name];
            }}
          />
          {/* outer band p10..p90 */}
          <Area dataKey="p10" stackId="a" stroke="none" fill="none" isAnimationActive={false} />
          <Area dataKey="band10_90" stackId="a" stroke="none" fill={color} fillOpacity={0.14} isAnimationActive animationDuration={500} name="band10_90" />
          {/* inner band p25..p75 */}
          <Area dataKey="p25" stackId="b" stroke="none" fill="none" isAnimationActive={false} />
          <Area dataKey="band25_75" stackId="b" stroke="none" fill={color} fillOpacity={0.24} isAnimationActive animationDuration={500} name="band25_75" />
          {/* median + deterministic */}
          <Line dataKey="p50" stroke={color} strokeWidth={2.4} dot={false} name="p50" isAnimationActive animationDuration={600} />
          <Line dataKey="det" stroke="#6b7080" strokeWidth={1.4} strokeDasharray="4 3" dot={false} name="det" isAnimationActive={false} />
          <ReferenceLine x={nowIdx} stroke="#12263a" strokeWidth={1.5} strokeDasharray="4 3"
            label={{ value: "NOW", position: "top", fontSize: 9, fill: "#12263a", fontWeight: 700 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
