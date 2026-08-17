// Shared TypeScript types mirroring the backend response models.

export interface Health {
  status: string;
  app: string;
  version: string;
  environment: string;
  database: string;
}

export interface Aor {
  name: string;
  bbox: [number, number, number, number];
  center: { lat: number; lon: number };
  zoom: number;
  refresh: { global_hours: number; regional_minutes: number; high_res_minutes: number };
}

export interface Layer {
  key: string;
  name: string;
  category: string;
  unit: string;
  description: string;
  default_visible: boolean;
  z_index: number;
  source: string;
  tile_url_template: string | null;
}

export interface Location {
  id: number;
  name: string;
  country: string;
  lat: number;
  lon: number;
  description: string;
  is_aor_default: boolean;
}

export interface ForecastLayer {
  key: string;
  name: string;
  unit: string;
  category: string;
  values: (number | null)[];
}

export interface Forecast {
  location: { lat: number; lon: number };
  generated_at: string;
  times: string[];
  layers: ForecastLayer[];
}

export interface ExternalApi {
  name: string;
  provider: string;
  category: string;
  base_url: string;
  endpoint_path: string;
  auth_type: string;
  requires_key: boolean;
  data_format: string;
  mvp: string;
  register_url: string;
  comment: string;
  enabled: boolean;
  /** True when the prototype calls this source live; false = catalogued only. */
  live: boolean;
}

export interface Placeholder {
  mvp: string;
  name: string;
  status: string;
  pws_task: string;
  message: string;
  planned_endpoints: string[];
}

// --- MVP-2 :: Alerting engine ---
export interface AlertRule {
  id: number;
  name: string;
  mission_type: string;
  parameter: string;
  operator: string;
  threshold_value: number;
  unit: string;
  severity: string;
  notify_channel: string;
  notify_within_hours: number;
  enabled: boolean;
  created_at: string;
}

export interface NewAlertRule {
  name: string;
  parameter: string;
  operator: string;
  threshold_value: number;
  unit?: string;
  mission_type?: string;
  severity?: string;
  notify_channel?: string;
  notify_within_hours?: number;
  enabled?: boolean;
}

export interface Alert {
  id: number;
  rule_id: number | null;
  generated_at: string;
  severity: string;
  parameter: string;
  value: number | null;
  message: string;
  acknowledged: boolean;
}

export interface GeoFeature {
  type: string;
  geometry: { type: string; coordinates: number[] };
  properties: Record<string, any>;
}

export interface TimelineRule {
  rule_id: number;
  name: string;
  parameter: string;
  unit: string;
  operator: string;
  threshold: number;
  severity: string;
  values: (number | null)[];
  breaches: boolean[];
  breach_count: number;
  notify_channel: string;
  notify_within_hours: number;
  notify_due: boolean;
  notify_at: string | null;
  notify_message: string | null;
}

export interface AlertTimeline {
  times: string[];
  rules: TimelineRule[];
}

export interface FeatureCollection {
  type: string;
  generated_at?: string;
  location?: { lat: number; lon: number };
  evaluated_rules?: number;
  breaches?: number;
  detections?: number;
  times?: string[];
  features: GeoFeature[];
  timeline?: AlertTimeline;
}

// --- MVP-3 :: Probabilistic & operational-impact panels ---
export interface Ensemble {
  location: { lat: number; lon: number };
  generated_at: string;
  parameter: string;
  name: string;
  unit: string;
  times: string[];
  member_count: number;
  members: (number | null)[][];
  percentiles: Record<string, (number | null)[]>;
  deterministic: (number | null)[];
}

export interface OperationalImpact {
  key: string;
  name: string;
  parameter: string;
  unit: string;
  severity: string;
  active: boolean;
  likelihood: number;
  peak_value: number | null;
  when: string | null;
  impact: string;
  bias_note: string;
}

export interface ImpactResponse {
  location: { lat: number; lon: number };
  generated_at: string;
  impact_text: string;
  impacts: OperationalImpact[];
}

// --- MVP-7 :: AI-native global prediction engine ---
export interface ModelStatus {
  engine: string;
  model_family: string;
  status: string;
  resolution_km: number;
  regional_resolution_km: number;
  ensemble_members: number;
  refresh_hours: number;
  horizon_hours: number;
  data_layers: number;
  assimilation: string[];
  merged_precipitation: string;
  probabilistic: boolean;
  compute: string;
  source: string;
  note: string;
  generated_at: string;
}
export interface Prediction extends Ensemble {
  engine: string;
  model_family: string;
  resolution_km: number;
  skill_score: number;
}

// --- MVP-6 :: Integration & CDS export gateway ---
export interface CdsDestination {
  enclaves: string[];
  c2_systems: string[];
  cds_drop: string;
}
export interface CdsExport {
  classification: string;
  generated_at: string;
  source_system: string;
  destination: CdsDestination;
  transfer_format: string;
  record_count: number;
  sha256: string;
  mock: boolean;
  note: string;
  payload: FeatureCollection;
}
export interface CdsReceipt {
  transfer_id: string;
  status: string;
  classification: string;
  destination: CdsDestination;
  transfer_format: string;
  record_count: number;
  bytes: number;
  sha256: string;
  dispatched_at: string;
  mock: boolean;
  note: string;
}

// --- MVP-5 :: High-resolution regional adapter ---
export interface RegionalLayer {
  key: string;
  name: string;
  unit: string;
  category: string;
  values: (number | null)[];
}
export interface RegionalForecast {
  location: { lat: number; lon: number };
  generated_at: string;
  grid_km: number;
  step_minutes: number;
  horizon_hours: number;
  requested_hours: number;
  model: string;
  source: string;
  times: string[];
  layers: RegionalLayer[];
}
export interface GridCell {
  row: number;
  col: number;
  lat: number;
  lon: number;
  value: number;
}
export interface RegionalGrid {
  parameter: string;
  name: string;
  unit: string;
  grid_km: number;
  n: number;
  center: { lat: number; lon: number };
  at_time: string | null;
  min: number;
  max: number;
  cells: GridCell[];
}

// --- MVP-4 :: Severe-weather detection packs ---
export interface DetectionPack {
  key: string;
  name: string;
  icon: string;
  parameter: string;
  operator: string;
  threshold: number;
  unit: string;
  severity: string;
  description: string;
}
