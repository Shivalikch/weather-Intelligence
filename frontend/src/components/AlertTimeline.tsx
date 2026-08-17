import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AlertTimeline as Timeline, TimelineRule } from "../types";

const SEV_COLOR: Record<string, string> = {
  warning: "#c0463a",
  watch: "#c08a2d",
  advisory: "#2d5c86",
};
const OK_COLOR = "#2e9e6b";
const OP_SYM: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
const LINE_COLOR = "#2e78c0";
const NOTIFY_LABEL: Record<string, string> = { page: "📟 Page", call: "📞 Call", email: "✉ Email" };

function hour(iso: string) {
  const t = iso.split("T")[1] ?? iso;
  return t.slice(0, 5);
}
function asUtc(iso: string) {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
}

function RuleTimelineCard({
  rule,
  times,
  nowIdx,
}: {
  rule: TimelineRule;
  times: string[];
  nowIdx: number;
}) {
  const sevColor = SEV_COLOR[rule.severity] ?? "#c0463a";
  const data = times.map((t, i) => ({
    idx: i,
    label: hour(t),
    value: rule.values[i],
    breach: rule.breaches[i],
  }));
  const opSym = OP_SYM[rule.operator] ?? rule.operator;

  // Custom dot: highlight the steps where the rule is breaching.
  const renderDot = (props: any) => {
    const { cx, cy, index, payload } = props;
    if (payload?.breach && cx != null && cy != null) {
      return <circle key={index} cx={cx} cy={cy} r={3.6} fill={sevColor} stroke="#fff" strokeWidth={1} />;
    }
    return <g key={index} />;
  };

  return (
    <div className="chart-card">
      <div className="cc-head">
        <span className={`sev-badge sev-${rule.severity}`}>{rule.severity}</span>
        <span className="cc-name">{rule.name}</span>
        <span className="cc-val" style={{ color: rule.breach_count ? sevColor : OK_COLOR, fontSize: 13 }}>
          {rule.breach_count ? `${rule.breach_count} breach${rule.breach_count === 1 ? "" : "es"}` : "clear"}
        </span>
      </div>
      <div className="cc-sub">
        {rule.parameter} {opSym} {rule.threshold}
        {rule.unit}
      </div>
      {rule.notify_due && (
        <div className="notify-chip" data-tt={rule.notify_message ?? "Mock notification dispatched"}>
          {NOTIFY_LABEL[rule.notify_channel] ?? "Notify"} dispatched · breach ≤{rule.notify_within_hours}h · mock
        </div>
      )}
      <div style={{ width: "100%", height: 132 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 14, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eceef3" vertical={false} />
            <XAxis
              dataKey="idx"
              tickFormatter={(i) => data[i as number]?.label ?? ""}
              tick={{ fontSize: 9, fill: "#8a8f9e" }}
              interval="preserveStartEnd"
              minTickGap={26}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#8a8f9e" }}
              width={30}
              domain={[
                (min: number) => Math.min(min, rule.threshold),
                (max: number) => Math.max(max, rule.threshold),
              ]}
            />
            <Tooltip
              cursor={{ stroke: "#8a8f9e", strokeWidth: 1, strokeDasharray: "3 3" }}
              labelFormatter={(i) => data[i as number]?.label ?? ""}
              formatter={(v: any, _n: any, item: any) => [
                `${v} ${rule.unit}${item?.payload?.breach ? "  ⚠ breach" : ""}`,
                rule.parameter,
              ]}
            />
            {/* threshold line */}
            <ReferenceLine
              y={rule.threshold}
              stroke={sevColor}
              strokeWidth={1.4}
              strokeDasharray="5 3"
              label={{ value: `${opSym}${rule.threshold}`, position: "right", fontSize: 9, fill: sevColor }}
            />
            {/* NOW line */}
            <ReferenceLine
              x={nowIdx}
              stroke="#12263a"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: "NOW", position: "top", fontSize: 9, fill: "#12263a", fontWeight: 700 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE_COLOR}
              strokeWidth={2}
              dot={renderDot}
              isAnimationActive
              animationDuration={550}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AlertTimeline({ timeline }: { timeline: Timeline }) {
  const { times, rules } = timeline;

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

  if (!rules.length) return null;

  return (
    <div className="chart-grid">
      {rules.map((r) => (
        <RuleTimelineCard key={r.rule_id} rule={r} times={times} nowIdx={nowIdx} />
      ))}
    </div>
  );
}
