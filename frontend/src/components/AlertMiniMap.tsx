import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap, Marker, Popup, StyleSpecification } from "maplibre-gl";

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

const SEV_COLOR: Record<string, string> = {
  warning: "#c0463a",
  watch: "#c08a2d",
  advisory: "#2d5c86",
};
const OK_COLOR = "#2e9e6b";

export interface AlertMapItem {
  id: number;
  name: string;
  severity: string;
  breached: boolean;
  value: number | null;
  unit: string;
}

interface Props {
  location: { lat: number; lon: number } | null;
  items: AlertMapItem[];
}

/**
 * A small map that plots each evaluated rule as a marker ringed around the
 * evaluated location: breaching rules use their severity colour, non-breaching
 * rules are green. Hover a marker for the rule name / status / value.
 */
export default function AlertMiniMap({ location, items }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: BASE_STYLE,
      center: location ? [location.lon, location.lat] : [47.52, 29.35],
      zoom: 7,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;

    const draw = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.easeTo({ center: [location.lon, location.lat], zoom: 7, duration: 600 });

      const n = Math.max(items.length, 1);
      const radius = 0.28; // degrees
      const cosLat = Math.cos((location.lat * Math.PI) / 180) || 1;

      items.forEach((it, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const lat = location.lat + radius * Math.sin(angle);
        const lon = location.lon + (radius * Math.cos(angle)) / cosLat;
        const color = it.breached ? SEV_COLOR[it.severity] ?? "#c0463a" : OK_COLOR;

        const el = document.createElement("div");
        el.className = "alert-map-dot";
        el.style.background = color;
        el.style.boxShadow = `0 0 0 5px ${color}33`;
        el.addEventListener("mouseenter", () => {
          popupRef.current?.remove();
          const status = it.breached ? "⚠ BREACH" : "✓ clear";
          const val = it.value === null || it.value === undefined ? "" : ` · ${it.value}${it.unit}`;
          popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 12, className: "loc-popup" })
            .setLngLat([lon, lat])
            .setHTML(`<b>${it.name.replace(/</g, "&lt;")}</b><br/>${status}${val}`)
            .addTo(map);
        });
        el.addEventListener("mouseleave", () => {
          popupRef.current?.remove();
          popupRef.current = null;
        });
        markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map));
      });

      // Evaluated-location centre marker.
      const c = document.createElement("div");
      c.className = "alert-map-center";
      markersRef.current.push(new maplibregl.Marker({ element: c }).setLngLat([location.lon, location.lat]).addTo(map));
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [location, items]);

  return (
    <div className="alert-map">
      <div ref={container} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
