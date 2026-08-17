import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap, Marker, Popup, StyleSpecification } from "maplibre-gl";
import { PACK_COLORS, PACK_LABEL } from "../mvpConfig";
import type { Aor, GeoFeature, Location } from "../types";

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

const OK_COLOR = "#2e9e6b";

interface Props {
  locations: Location[];
  features: GeoFeature[];
  aor?: Aor;
  focus?: { lat: number; lon: number; nonce: number } | null;
}

/**
 * AOR situational map. Each detection is a marker at its location, coloured by
 * its PACK, blinking, and labelled with the pack name (e.g. "Extreme Heat").
 * Multiple packs at one site fan out in a small ring. Clear sites are static
 * green dots with the location name.
 */
export default function SevereMap({ locations, features, aor, focus }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: BASE_STYLE,
      center: aor ? [aor.center.lon, aor.center.lat] : [47.52, 29.35],
      zoom: aor?.zoom ?? 4,
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
    if (!map || !locations.length) return;

    const draw = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      locations.forEach((loc) => {
        const dets = features.filter((f) => f.properties.location === loc.name);

        if (!dets.length) {
          // Clear site: static green dot + location name.
          const el = document.createElement("div");
          el.className = "sev-clear";
          el.innerHTML = `<span class="sev-clear-dot"></span><span class="sev-clear-lbl">${loc.name}</span>`;
          el.addEventListener("mouseenter", () => {
            popupRef.current?.remove();
            popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 12, className: "loc-popup" })
              .setLngLat([loc.lon, loc.lat])
              .setHTML(`<b>${loc.name}</b>${loc.country ? ` · ${loc.country}` : ""}<br/>✓ clear`)
              .addTo(map);
          });
          el.addEventListener("mouseleave", () => { popupRef.current?.remove(); popupRef.current = null; });
          markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat([loc.lon, loc.lat]).addTo(map));
          return;
        }

        // Affected site: one blinking pack-coloured marker per detection.
        const n = dets.length;
        const R = 0.18;
        const cosLat = Math.cos((loc.lat * Math.PI) / 180) || 1;
        dets.forEach((f, i) => {
          const pack = f.properties.pack as string;
          const color = PACK_COLORS[pack] ?? "#c0463a";
          const label = PACK_LABEL[pack] ?? f.properties.name;
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
          const lat = loc.lat + (n > 1 ? R * Math.sin(angle) : 0);
          const lon = loc.lon + (n > 1 ? (R * Math.cos(angle)) / cosLat : 0);

          const el = document.createElement("div");
          el.className = "sev-marker";
          el.style.setProperty("--pack-color", color);
          el.innerHTML = `<span class="sev-dot" style="background:${color}"></span><span class="sev-lbl">${label}</span>`;
          el.addEventListener("mouseenter", () => {
            popupRef.current?.remove();
            popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 12, className: "loc-popup" })
              .setLngLat([lon, lat])
              .setHTML(`<b>${loc.name}</b> · ${f.properties.icon ?? ""} ${f.properties.name}<br/>${f.properties.value}${f.properties.unit} · ${f.properties.hours_affected}h`)
              .addTo(map);
          });
          el.addEventListener("mouseleave", () => { popupRef.current?.remove(); popupRef.current = null; });
          markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat([lon, lat]).addTo(map));
        });
      });
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [locations, features]);

  // Fly to a clicked detection's location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), 6), duration: 800 });
  }, [focus]);

  return (
    <div className="alert-map">
      <div ref={container} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
