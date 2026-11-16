// Shared domain types. Money is always integer cents. Times are ISO strings (UTC) on the wire.

export type Role = 'driver' | 'officer' | 'operator_admin' | 'platform_admin';
export type SessionStatus = 'active' | 'completed' | 'expired' | 'cancelled' | 'disputed';
export type CheckResult = 'valid' | 'expired' | 'no_session' | 'wrong_area';

/** One tariff line. days use ISO numbering: 1 = Monday ... 7 = Sunday. Times are operator-local "HH:MM". */
export interface RateRule {
  days_of_week: number[];
  start_time: string;
  end_time: string; // may be "24:00"
  price_per_hour_cents: number;
  priority: number;
}

export interface RatePlan {
  id: string;
  name: string;
  currency: string;
  min_charge_cents: number;
  daily_max_cents: number | null;
  grace_minutes: number;
  rules: RateRule[];
}

export type Position = [number, number]; // [lng, lat] (GeoJSON order)
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}
export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

/** A parking area as the app needs it: shape + operator + the plan that prices it. */
export interface ParkingArea {
  id: string;
  name: string;
  level: 1 | 2 | 3;
  operator_id: string;
  operator_name: string;
  timezone: string;
  service_fee_bps: number;
  max_stay_minutes: number | null;
  /** Operator-local "HH:MM" when the area closes, or null if it never closes. */
  closing_time?: string | null;
  /** Spaces in the area, or null when the operator does not count them (streets, city zones). */
  total_spaces?: number | null;
  /** Cars parked right now (running sessions), counted live by the server. */
  occupied?: number;
  /** Free spaces right now, or null when spaces are not counted. */
  available?: number | null;
  geometry: AreaGeometry;
  plan: RatePlan;
}

export interface Vehicle {
  id: string;
  plate: string;
  plate_region: string | null;
  nickname: string | null;
  is_default: boolean;
  make?: string | null;
  model?: string | null;
  colour?: string | null;
  size_class?: SizeClass;
}

export type SizeClass = 'compact' | 'standard' | 'large';

/** Fields collected when a vehicle is added (sign-up asks for them once). */
export interface NewVehicle {
  plate: string;
  region?: string | null;
  nickname?: string | null;
  make?: string | null;
  model?: string | null;
  colour?: string | null;
  size_class?: SizeClass;
}

export interface ParkingSession {
  id: string;
  vehicle_id: string;
  plate: string;
  area_id: string;
  area_name: string;
  rate_plan_id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  fee_cents: number | null;
  service_fee_cents: number | null;
  operator_payout_cents: number | null;
  currency: string;
  max_stay_minutes: number | null;
  receipt_no: string | null;
  /** Minutes the driver said they plan to stay (optional). Drives the "time is almost up" reminder. */
  planned_minutes?: number | null;
}

export interface Citation {
  id: string;
  plate: string;
  area_name: string | null;
  reason: string;
  fine_cents: number;
  currency: string;
  issued_at: string;
  /** issued | paid | appealed | void (present on the driver and operator lists) */
  status?: string;
}

export interface PlateCheck {
  result: CheckResult;
  plate: string;
  area_name: string | null;
  started_at: string | null;
  message: string;
}

export interface NearbyVehicle {
  session_id: string;
  plate: string;
  area_name: string;
  started_at: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}
