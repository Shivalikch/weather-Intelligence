// ===========================================================================
// SINGLE SOURCE OF TRUTH for every backend endpoint the frontend calls.
//
// Per project convention, ALL API endpoints live in this one file. Components
// import the typed helpers below; they never build URLs themselves.
// ===========================================================================
import type {
  Alert,
  AlertRule,
  Aor,
  CdsExport,
  CdsReceipt,
  DetectionPack,
  Ensemble,
  ExternalApi,
  FeatureCollection,
  Forecast,
  Health,
  ImpactResponse,
  Layer,
  Location,
  ModelStatus,
  NewAlertRule,
  Placeholder,
  Prediction,
  RegionalForecast,
  RegionalGrid,
} from "../types";

// Empty base => same-origin (served through the Vite dev proxy).
const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

/** Central endpoint registry. Keep every path here. */
export const ENDPOINTS = {
  health: () => `${BASE}/health`,
  config: () => `${BASE}/api/config`,
  externalApis: () => `${BASE}/api/external-apis`,

  // MVP-1 :: Map-Centric Viewer
  aor: () => `${BASE}/api/aor`,
  layers: () => `${BASE}/api/layers`,
  locations: () => `${BASE}/api/locations`,
  forecast: (lat: number, lon: number, layers?: string[]) => {
    const p = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (layers && layers.length) p.set("layers", layers.join(","));
    return `${BASE}/api/forecast?${p.toString()}`;
  },

  // MVP-2 :: Alerting engine
  alertRules: () => `${BASE}/api/alerts/rules`,
  alertRule: (id: number) => `${BASE}/api/alerts/rules/${id}`,
  alerts: () => `${BASE}/api/alerts`,
  evaluate: (persist = true) =>
    persist ? `${BASE}/api/alerts/evaluate` : `${BASE}/api/alerts/evaluate?persist=false`,

  // MVP-4 :: Severe-weather detection
  severePacks: () => `${BASE}/api/severe/packs`,
  severeDetections: (lat?: number, lon?: number) => {
    if (lat != null && lon != null) {
      const p = new URLSearchParams({ lat: String(lat), lon: String(lon) });
      return `${BASE}/api/severe/detections?${p.toString()}`;
    }
    return `${BASE}/api/severe/detections`;
  },

  // MVP-3 :: Probabilistic panels
  ensemble: (lat: number, lon: number, parameter?: string) => {
    const p = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (parameter) p.set("parameter", parameter);
    return `${BASE}/api/probabilistic/ensemble?${p.toString()}`;
  },
  impact: (lat: number, lon: number) => {
    const p = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    return `${BASE}/api/probabilistic/impact?${p.toString()}`;
  },

  // MVP-5 :: Regional adapter
  regionalForecast: (lat: number, lon: number, layers?: string[], hours?: number) => {
    const p = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (layers && layers.length) p.set("layers", layers.join(","));
    if (hours) p.set("hours", String(hours));
    return `${BASE}/api/regional/forecast?${p.toString()}`;
  },
  regionalGrid: (lat: number, lon: number, parameter?: string, n?: number) => {
    const p = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (parameter) p.set("parameter", parameter);
    if (n) p.set("n", String(n));
    return `${BASE}/api/regional/grid?${p.toString()}`;
  },

  // MVP-6 :: CDS export gateway
  cdsPreview: () => `${BASE}/api/integration/cds/preview`,
  cdsExport: () => `${BASE}/api/integration/cds/export`,

  // MVP-7 :: AI-native engine
  modelStatus: () => `${BASE}/api/model/status`,
  modelPredict: (lat: number, lon: number, parameter?: string) => {
    const p = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (parameter) p.set("parameter", parameter);
    return `${BASE}/api/model/predict?${p.toString()}`;
  },

  // All seven MVPs are implemented; no placeholder routes remain.
  mvp: {} as Record<string, () => string>,
} as const;

// --- fetch helper ----------------------------------------------------------
async function raise(res: Response): Promise<never> {
  let detail = res.statusText;
  try {
    detail = (await res.json())?.detail ?? detail;
  } catch {
    /* ignore */
  }
  throw new Error(`${res.status}: ${detail}`);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return raise(res);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return raise(res);
  return (await res.json()) as T;
}

async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 204) await raise(res);
}

// --- typed API surface -----------------------------------------------------
export const api = {
  getHealth: () => getJson<Health>(ENDPOINTS.health()),
  getConfig: () => getJson<Record<string, string>>(ENDPOINTS.config()),
  getExternalApis: () => getJson<ExternalApi[]>(ENDPOINTS.externalApis()),

  getAor: () => getJson<Aor>(ENDPOINTS.aor()),
  getLayers: () => getJson<Layer[]>(ENDPOINTS.layers()),
  getLocations: () => getJson<Location[]>(ENDPOINTS.locations()),
  getForecast: (lat: number, lon: number, layers?: string[]) =>
    getJson<Forecast>(ENDPOINTS.forecast(lat, lon, layers)),

  // MVP-2 :: Alerting engine
  listRules: () => getJson<AlertRule[]>(ENDPOINTS.alertRules()),
  createRule: (rule: NewAlertRule) => postJson<AlertRule>(ENDPOINTS.alertRules(), rule),
  deleteRule: (id: number) => del(ENDPOINTS.alertRule(id)),
  listAlerts: () => getJson<Alert[]>(ENDPOINTS.alerts()),
  evaluate: (lat: number, lon: number, persist = true) =>
    postJson<FeatureCollection>(ENDPOINTS.evaluate(persist), { lat, lon }),

  // MVP-3 :: Probabilistic panels
  getEnsemble: (lat: number, lon: number, parameter?: string) =>
    getJson<Ensemble>(ENDPOINTS.ensemble(lat, lon, parameter)),
  getImpact: (lat: number, lon: number) =>
    getJson<ImpactResponse>(ENDPOINTS.impact(lat, lon)),

  // MVP-4 :: Severe-weather detection
  getSeverePacks: () => getJson<DetectionPack[]>(ENDPOINTS.severePacks()),
  scanSevere: (lat?: number, lon?: number) =>
    getJson<FeatureCollection>(ENDPOINTS.severeDetections(lat, lon)),

  // MVP-5 :: Regional adapter
  getRegionalForecast: (lat: number, lon: number, layers?: string[], hours?: number) =>
    getJson<RegionalForecast>(ENDPOINTS.regionalForecast(lat, lon, layers, hours)),
  getRegionalGrid: (lat: number, lon: number, parameter?: string, n?: number) =>
    getJson<RegionalGrid>(ENDPOINTS.regionalGrid(lat, lon, parameter, n)),

  // MVP-6 :: CDS export gateway
  getCdsPreview: () => getJson<CdsExport>(ENDPOINTS.cdsPreview()),
  dispatchCds: () => postJson<CdsReceipt>(ENDPOINTS.cdsExport(), {}),

  // MVP-7 :: AI-native engine
  getModelStatus: () => getJson<ModelStatus>(ENDPOINTS.modelStatus()),
  getPrediction: (lat: number, lon: number, parameter?: string) =>
    getJson<Prediction>(ENDPOINTS.modelPredict(lat, lon, parameter)),

  getMvpStatus: (mvp: string) => getJson<Placeholder>(ENDPOINTS.mvp[mvp]()),
};
