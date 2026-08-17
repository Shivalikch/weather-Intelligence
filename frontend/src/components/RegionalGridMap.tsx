import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap, Popup, StyleSpecification } from "maplibre-gl";
import { PARAM_COLORS } from "../mvpConfig";
import type { RegionalGrid } from "../types";

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

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const ch = (x: number) => Math.round(x).toString(16).padStart(2, "0");
  return `#${ch(ar + (br - ar) * t)}${ch(ag + (bg - ag) * t)}${ch(ab + (bb - ab) * t)}`;
}

/** GeoJSON of 3km cell squares built from the grid's cell centres. */
function toGeoJSON(grid: RegionalGrid) {
  const halfLat = grid.grid_km / 2 / 111.0;
  const cosLat = Math.cos((grid.center.lat * Math.PI) / 180) || 1;
  const halfLon = grid.grid_km / 2 / (111.0 * cosLat);
  return {
    type: "FeatureCollection",
    features: grid.cells.map((c) => ({
      type: "Feature",
      properties: { value: c.value, lat: c.lat, lon: c.lon },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [c.lon - halfLon, c.lat - halfLat],
          [c.lon + halfLon, c.lat - halfLat],
          [c.lon + halfLon, c.lat + halfLat],
          [c.lon - halfLon, c.lat + halfLat],
          [c.lon - halfLon, c.lat - halfLat],
        ]],
      },
    })),
  } as any;
}

export default function RegionalGridMap({ grid }: { grid: RegionalGrid }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<Popup | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: BASE_STYLE,
      center: [grid.center.lon, grid.center.lat],
      zoom: 9,
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
    if (!map) return;
    const color = PARAM_COLORS[grid.parameter] ?? "#1f4468";
    const light = mixHex(color, "#ffffff", 0.72);
    const data = toGeoJSON(grid);

    const draw = () => {
      const fillColor: any =
        grid.max > grid.min
          ? ["interpolate", ["linear"], ["get", "value"], grid.min, light, grid.max, color]
          : color;

      if (map.getSource("grid")) {
        (map.getSource("grid") as maplibregl.GeoJSONSource).setData(data);
        map.setPaintProperty("grid-fill", "fill-color", fillColor);
      } else {
        map.addSource("grid", { type: "geojson", data });
        map.addLayer({
          id: "grid-fill", type: "fill", source: "grid",
          paint: { "fill-color": fillColor, "fill-opacity": 0.55 },
        });
        map.addLayer({
          id: "grid-line", type: "line", source: "grid",
          paint: { "line-color": color, "line-width": 0.6, "line-opacity": 0.35 },
        });
        map.on("mousemove", "grid-fill", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f) return;
          const p: any = f.properties;
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 6, className: "loc-popup" })
            .setLngLat(e.lngLat)
            .setHTML(`<b>${p.value}${grid.unit}</b><br/>${p.lat}, ${p.lon}`)
            .addTo(map);
        });
        map.on("mouseleave", "grid-fill", () => {
          map.getCanvas().style.cursor = "";
          popupRef.current?.remove();
          popupRef.current = null;
        });
      }

      // Fit the whole grid in view.
      const halfLat = grid.grid_km / 2 / 111.0;
      const cosLat = Math.cos((grid.center.lat * Math.PI) / 180) || 1;
      const halfLon = grid.grid_km / 2 / (111.0 * cosLat);
      let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
      grid.cells.forEach((c) => {
        minLon = Math.min(minLon, c.lon - halfLon); maxLon = Math.max(maxLon, c.lon + halfLon);
        minLat = Math.min(minLat, c.lat - halfLat); maxLat = Math.max(maxLat, c.lat + halfLat);
      });
      map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 36, duration: 600, maxZoom: 11 });
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [grid]);

  return (
    <div className="alert-map">
      <div ref={container} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
