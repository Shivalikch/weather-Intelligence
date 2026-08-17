import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap, Marker, Popup, StyleSpecification } from "maplibre-gl";
import type { Aor, Location } from "../types";

// Key-less light "matte" basemap (CARTO Positron raster tiles + OSM data).
// The raster tiles already carry town/city labels for context.
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

interface Props {
  aor?: Aor;
  satelliteTemplate: string | null; // GIBS tile template when satellite layer is on
  satelliteOn: boolean;
  onToggleSatellite: () => void;
  point: { lat: number; lon: number } | null;
  onPick: (lat: number, lon: number) => void;
  locations?: Location[];
}

export default function MapView({
  aor,
  satelliteTemplate,
  satelliteOn,
  onToggleSatellite,
  point,
  onPick,
  locations,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const locMarkersRef = useRef<Marker[]>([]);
  const hoverPopupRef = useRef<Popup | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  // Create the map once.
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: BASE_STYLE,
      center: aor ? [aor.center.lon, aor.center.lat] : [47.52, 29.35],
      zoom: aor?.zoom ?? 5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("click", (e) => pickRef.current(e.lngLat.lat, e.lngLat.lng));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentre when the AOR arrives.
  useEffect(() => {
    if (mapRef.current && aor) {
      mapRef.current.jumpTo({ center: [aor.center.lon, aor.center.lat], zoom: aor.zoom });
    }
  }, [aor]);

  // Toggle the satellite raster overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("gibs")) map.removeLayer("gibs");
      if (map.getSource("gibs")) map.removeSource("gibs");
      if (satelliteTemplate) {
        map.addSource("gibs", { type: "raster", tiles: [satelliteTemplate], tileSize: 256 });
        map.addLayer({ id: "gibs", type: "raster", source: "gibs", paint: { "raster-opacity": 0.85 } });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [satelliteTemplate]);

  // Labeled markers for the preset AOR locations (important towns/bases).
  // Always-on labels; hover shows a name/coords popup; click selects it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !locations) return;
    const build = () => {
      locMarkersRef.current.forEach((m) => m.remove());
      locMarkersRef.current = [];
      locations.forEach((loc) => {
        const el = document.createElement("div");
        el.className = "loc-marker";
        const label = loc.name.replace(/</g, "&lt;");
        el.innerHTML = `<span class="loc-dot"></span><span class="loc-label">${label}</span>`;
        el.addEventListener("mouseenter", () => {
          hoverPopupRef.current?.remove();
          hoverPopupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
            className: "loc-popup",
          })
            .setLngLat([loc.lon, loc.lat])
            .setHTML(
              `<b>${label}</b><br/>${loc.country || ""}<br/>${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`
            )
            .addTo(map);
        });
        el.addEventListener("mouseleave", () => {
          hoverPopupRef.current?.remove();
          hoverPopupRef.current = null;
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          pickRef.current(loc.lat, loc.lon);
        });
        const m = new maplibregl.Marker({ element: el, anchor: "left" })
          .setLngLat([loc.lon, loc.lat])
          .addTo(map);
        locMarkersRef.current.push(m);
      });
    };
    // DOM markers don't need the style loaded — add them immediately.
    build();
    return () => {
      locMarkersRef.current.forEach((m) => m.remove());
      locMarkersRef.current = [];
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
    };
  }, [locations]);

  // Keep a marker on the selected point.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!point) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#1f4468;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)";
      markerRef.current = new maplibregl.Marker({ element: el });
    }
    markerRef.current.setLngLat([point.lon, point.lat]).addTo(map);
  }, [point]);

  // If the selected point is off-screen (e.g. jumped to a distant preset),
  // fly back to it so the marker is always in view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;
    const run = () => {
      if (!map.getBounds().contains([point.lon, point.lat])) {
        map.flyTo({ center: [point.lon, point.lat], duration: 900 });
      }
    };
    if (map.isStyleLoaded()) run();
    else map.once("load", run);
  }, [point]);

  // Manual homing: recenter the map on the currently selected location.
  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (point) {
      map.flyTo({ center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), aor?.zoom ?? 5), duration: 900 });
    } else if (aor) {
      map.flyTo({ center: [aor.center.lon, aor.center.lat], zoom: aor.zoom, duration: 900 });
    }
  };

  return (
    <div className="map-wrap corner">
      <div className="map-overlay-tl">
        <span
          className="map-badge"
          data-tt="Click anywhere on the map to pull a point forecast"
          data-tt-pos="bottom"
        >
          📍 Click map to sample
        </span>
        <button
          className={`map-badge raise ${satelliteOn ? "active" : ""}`}
          onClick={onToggleSatellite}
          data-tt="Toggle the NASA GIBS satellite imagery overlay"
          data-tt-pos="bottom"
        >
          🛰️ Satellite {satelliteOn ? "on" : "off"}
        </button>
        <button
          className="map-badge raise"
          onClick={recenter}
          data-tt="Recenter the map on the selected location"
          data-tt-pos="bottom"
        >
          ⌖ Recenter
        </button>
      </div>
      <div ref={container} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
