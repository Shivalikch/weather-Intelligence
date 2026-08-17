// Shared MVP catalogue used by the nav and the placeholder pages.
export interface MvpDef {
  id: string;
  code: string;
  name: string;
  task: string;
  icon: string;
  implemented: boolean;
  blurb: string;
}

export const MVPS: MvpDef[] = [
  { id: "MVP-1", code: "1", name: "Map-Centric Viewer", task: "PWS T1", icon: "🗺️", implemented: true,
    blurb: "Interactive CENTCOM-AOR map with toggleable weather & satellite layers." },
  { id: "MVP-2", code: "2", name: "Alerting Engine", task: "PWS T3", icon: "🔔", implemented: true,
    blurb: "No-code threshold builder emitting machine-readable GeoJSON alerts." },
  { id: "MVP-3", code: "3", name: "Probabilistic Panels", task: "PWS T1", icon: "📈", implemented: true,
    blurb: "Ensemble spread with plain-language impact & model-bias cues." },
  { id: "MVP-4", code: "4", name: "Severe-Weather Packs", task: "PWS T4", icon: "🌪️", implemented: true,
    blurb: "Pre-built AOR detections: dust, extreme heat, convection, fog." },
  { id: "MVP-5", code: "5", name: "Regional Adapter", task: "PWS T2", icon: "🛰️", implemented: true,
    blurb: "3km / 15-minute high-resolution regional model ingestion." },
  { id: "MVP-6", code: "6", name: "CDS Export Gateway", task: "PWS T5", icon: "🔗", implemented: true,
    blurb: "Integration + mock CDS export to SIPR/JWICS/C2 enclaves." },
  { id: "MVP-7", code: "7", name: "AI-Native Engine", task: "PWS T1", icon: "🧠", implemented: true,
    blurb: "Real AI-NWP global model with independent assimilation (GPU)." },
];

// MVP-3 probabilistic panels: a colour per forecast parameter (layer key).
export const PARAM_COLORS: Record<string, string> = {
  temperature_2m: "#c0463a",
  wbgt: "#8c4a2f",
  relative_humidity_2m: "#2f8f8f",
  wind_10m: "#2e78c0",
  wind_gusts_10m: "#2e6fb0",
  precipitation: "#2e9e6b",
  cloud_cover: "#8a8f9e",
  visibility: "#5b6d8c",
  surface_pressure: "#5e6641",
  dust: "#c98a2d",
  pm10: "#b8860b",
};

// MVP-4 severe-weather packs: a distinct colour + short label per pack.
export const PACK_COLORS: Record<string, string> = {
  dust: "#c98a2d",
  extreme_heat: "#c0463a",
  heavy_precip: "#2e78c0",
  convection: "#1f4468",
  fog: "#6b7a90",
};
export const PACK_LABEL: Record<string, string> = {
  dust: "Dust",
  extreme_heat: "Extreme Heat",
  heavy_precip: "Heavy Rain",
  convection: "Thunderstorm",
  fog: "Fog",
};

// Category -> accent colour for layer chips / dots.
export const CATEGORY_COLORS: Record<string, string> = {
  core: "#2d5c86",
  wind: "#2e78c0",
  precip: "#2e9e6b",
  clouds: "#8a8f9e",
  air_quality: "#c08a2d",
  derived: "#2f8f8f",
  satellite: "#1f2a44",
};
