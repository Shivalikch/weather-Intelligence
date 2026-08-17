import { useEffect, useRef, useState } from "react";

export interface Tile {
  k: string;
  value: number | null;
  unit: string;
  tone?: "primary" | "warn" | "danger";
  tip?: string;
}

/** Animated count-up for a single value (data-driven micro-animation). */
function useCountUp(target: number | null, duration = 700) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (target === null || Number.isNaN(target)) {
      setDisplay(0);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    // Safety net: requestAnimationFrame is paused while the tab is hidden/not
    // composited, so guarantee the final value lands via a timer too.
    const safety = window.setTimeout(() => setDisplay(target), duration + 80);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      window.clearTimeout(safety);
    };
  }, [target, duration]);
  return display;
}

function TileView({ tile }: { tile: Tile }) {
  const v = useCountUp(tile.value);
  const shown = tile.value === null ? "—" : v.toFixed(tile.value % 1 === 0 ? 0 : 1);
  return (
    <div className={`tile raise ${tile.tone ?? ""}`} data-tt={tile.tip ?? tile.k}>
      <div className="accent" />
      <div className="k">{tile.k}</div>
      <div className="v">
        {shown}
        <span className="u">{tile.unit}</span>
      </div>
    </div>
  );
}

export default function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <TileView key={t.k} tile={t} />
      ))}
    </div>
  );
}
