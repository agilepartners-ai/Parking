/**
 * Geometry engine for drawing parking areas. Used by the web console and the ParkPay Admin app so both
 * measure, snap, validate and repair shapes the same way, and agree with the database guard
 * (parking_area_guard / operator_check_area in supabase/migrations/20261113000006_geofence_hardening.sql).
 *
 * Coordinates are GeoJSON order: [longitude, latitude], WGS84.
 *
 * Why a local frame: every measurement a parking area needs (corner distances, angles, widths, snapping)
 * is done in metres on a flat east/north plane centred on the shape, using the WGS84 ellipsoid's radii of
 * curvature at that latitude. For anything a parking lot can be (< 5 km across) the error against the true
 * ellipsoidal distance is far below a centimetre per metre, and it is what PostGIS geography measures too.
 * Very large city zones (level 2, tens of km) use a spherical-excess area instead, where a flat plane would drift.
 */
import type { AreaGeometry, Position } from './types';

// ---- constants shared with the database guard ----------------------------------------------------------
export const AREA_LIMITS = {
  3: { minM2: 10, maxM2: 5e6 }, // parking area: at least one bay, at most 5 km²
  2: { minM2: 0, maxM2: 5e10 }, // city zone: up to 50,000 km²
} as const;
export const MAX_POINTS = 5000;
/** Phone GPS is typically good to 5-25 m. A lot narrower than this cannot be told apart from the street beside it. */
export const GPS_WIDTH_WARNING_M = 12;
/** Drawing a parking area needs street zoom: at 17 one screen pixel is about 0.9 m in Toronto. */
export const MIN_DRAW_ZOOM = { 3: 16, 2: 10 } as const;
/** Coordinates are stored to 7 decimals: about 1 cm, finer than any phone can measure. */
export const COORD_DECIMALS = 7;

const WGS84_A = 6378137;
const WGS84_E2 = 0.00669437999014;
const AUTHALIC_R = 6371007.181; // sphere with the same surface area as WGS84
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

// ---- local metric frame ---------------------------------------------------------------------------------
export interface LocalFrame { lng0: number; lat0: number; mPerDegLng: number; mPerDegLat: number }
export type XY = [number, number];

export function localFrame(lat0: number, lng0: number): LocalFrame {
  const phi = toRad(lat0);
  const s = Math.sin(phi);
  const w = Math.sqrt(1 - WGS84_E2 * s * s);
  const N = WGS84_A / w; // prime vertical radius
  const M = (WGS84_A * (1 - WGS84_E2)) / (w * w * w); // meridional radius
  return { lng0, lat0, mPerDegLng: toRad(1) * N * Math.cos(phi), mPerDegLat: toRad(1) * M };
}
export function frameFor(points: Position[]): LocalFrame {
  const b = bbox(points);
  return localFrame((b[1] + b[3]) / 2, (b[0] + b[2]) / 2);
}
export const toLocal = (f: LocalFrame, p: Position): XY => [(p[0] - f.lng0) * f.mPerDegLng, (p[1] - f.lat0) * f.mPerDegLat];
export const fromLocal = (f: LocalFrame, q: XY): Position => [f.lng0 + q[0] / f.mPerDegLng, f.lat0 + q[1] / f.mPerDegLat];

/** Ground size of one screen pixel on a 256-px Web Mercator map (Leaflet, Google Maps) at this zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392804097 * Math.cos(toRad(lat))) / 2 ** zoom;
}

// ---- small helpers ------------------------------------------------------------------------------------------
export function bbox(points: Position[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of points) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}
export const roundPos = (p: Position, dp = COORD_DECIMALS): Position => [Number(p[0].toFixed(dp)), Number(p[1].toFixed(dp))];
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const samePos = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** Ring without the repeated closing point. */
export function openRing(ring: Position[]): Position[] {
  return ring.length > 1 && samePos(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring.slice();
}
export const closeRing = (v: Position[]): Position[] => (v.length ? [...v, v[0]] : []);

export function distanceM(a: Position, b: Position): number {
  const f = localFrame((a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
  return dist(toLocal(f, a), toLocal(f, b));
}

// ---- area ---------------------------------------------------------------------------------------------------
function planarSignedArea(pts: XY[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return s / 2; // > 0 = counter-clockwise
}
/** Spherical excess (Chamberlain & Duquette), for shapes too large for a flat frame. */
function sphericalArea(v: Position[]): number {
  let s = 0;
  const n = v.length;
  for (let i = 0; i < n; i++) {
    const p1 = v[i], p2 = v[(i + 1) % n], p3 = v[(i + 2) % n];
    s += (toRad(p3[0]) - toRad(p1[0])) * Math.sin(toRad(p2[1]));
  }
  return Math.abs((s * AUTHALIC_R * AUTHALIC_R) / 2);
}
/** Area of one ring in m². */
export function ringAreaM2(ring: Position[]): number {
  const v = openRing(ring);
  if (v.length < 3) return 0;
  const b = bbox(v);
  const spanM = Math.max((b[2] - b[0]) * 111_320 * Math.cos(toRad((b[1] + b[3]) / 2)), (b[3] - b[1]) * 110_574);
  if (spanM > 20_000) return sphericalArea(v);
  const f = localFrame((b[1] + b[3]) / 2, (b[0] + b[2]) / 2);
  return Math.abs(planarSignedArea(v.map((p) => toLocal(f, p))));
}
export function geometryAreaM2(g: AreaGeometry): number {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.reduce((s, rings) => s + ringAreaM2(rings[0]) - rings.slice(1).reduce((h, r) => h + ringAreaM2(r), 0), 0);
}
export function perimeterM(v: Position[]): number {
  const o = openRing(v);
  let s = 0;
  for (let i = 0; i < o.length; i++) s += distanceM(o[i], o[(i + 1) % o.length]);
  return s;
}

// ---- self-intersection --------------------------------------------------------------------------------------
function segIntersection(p1: XY, p2: XY, p3: XY, p4: XY): XY | null {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) {
    // parallel: overlapping collinear segments count as a crossing
    if (Math.abs(cross(p1, p2, p3)) > 1e-9) return null;
    const onSeg = (a: XY, b: XY, c: XY) => Math.min(a[0], b[0]) - 1e-9 <= c[0] && c[0] <= Math.max(a[0], b[0]) + 1e-9 && Math.min(a[1], b[1]) - 1e-9 <= c[1] && c[1] <= Math.max(a[1], b[1]) + 1e-9;
    for (const c of [p3, p4]) if (onSeg(p1, p2, c)) return c;
    for (const c of [p1, p2]) if (onSeg(p3, p4, c)) return c;
    return null;
  }
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}
/** Every place where two non-neighbouring edges of the closed outline touch or cross. */
export function selfIntersections(vertices: Position[]): { edgeA: number; edgeB: number; at: Position }[] {
  const v = openRing(vertices);
  const n = v.length;
  if (n < 4) return [];
  const f = frameFor(v);
  const q = v.map((p) => toLocal(f, p));
  const boxes = q.map((a, i) => { const b = q[(i + 1) % n]; return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; });
  const out: { edgeA: number; edgeB: number; at: Position }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // first and last edge share vertex 0
      const A = boxes[i], B = boxes[j];
      if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1]) continue;
      const x = segIntersection(q[i], q[(i + 1) % n], q[j], q[(j + 1) % n]);
      if (x) { out.push({ edgeA: i, edgeB: j, at: fromLocal(f, x) }); if (out.length >= 50) return out; }
    }
  }
  return out;
}

// ---- convex hull and minimum width (rotating calipers) ------------------------------------------------------
function hull(pts: XY[]): XY[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lo: XY[] = [], up: XY[] = [];
  for (const x of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], x) <= 0) lo.pop(); lo.push(x); }
  for (let i = p.length - 1; i >= 0; i--) { const x = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], x) <= 0) up.pop(); up.push(x); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Narrowest width of the shape's convex hull in metres: how thin the lot is in its thinnest direction. */
export function minWidthM(vertices: Position[]): number {
  const v = openRing(vertices);
  if (v.length < 3) return 0;
  const f = frameFor(v);
  const h = hull(v.map((p) => toLocal(f, p)));
  if (h.length < 3) return 0;
  let best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const len = dist(a, b);
    if (len === 0) continue;
    let far = 0;
    for (const c of h) far = Math.max(far, Math.abs(cross(a, b, c)) / len);
    best = Math.min(best, far);
  }
  return best === Infinity ? 0 : best;
}

// ---- cleaning ------------------------------------------------------------------------------------------------
/**
 * Make an outline safe to store:
 * - drops points closer than `minEdgeM` to the previous one (double taps, jitter),
 * - drops points that lie on the straight line between their neighbours (within `collinearM`),
 * - orients the outer ring counter-clockwise (RFC 7946), rounds to 7 decimals.
 * Returns open vertices (no repeated closing point).
 */
export function cleanVertices(vertices: Position[], opts: { minEdgeM?: number; collinearM?: number } = {}): Position[] {
  const minEdge = opts.minEdgeM ?? 0.3;
  const collinear = opts.collinearM ?? 0.05;
  let v = openRing(vertices).map((p) => roundPos(p));
  if (v.length < 3) return v;
  const f = frameFor(v);
  let changed = true;
  while (changed && v.length >= 3) {
    changed = false;
    const q = v.map((p) => toLocal(f, p));
    const keep: Position[] = [];
    const keptXY: XY[] = [];
    // Walk once, judging each point against the last point KEPT (not the original neighbour), so removing one
    // point of a pair never also removes the other.
    for (let i = 0; i < v.length; i++) {
      const prev = keptXY.length ? keptXY[keptXY.length - 1] : q[v.length - 1];
      const cur = q[i];
      const next = i + 1 < v.length ? q[i + 1] : keptXY[0] ?? q[0];
      const tooClose = dist(prev, cur) < minEdge;
      const base = dist(prev, next);
      const offLine = base > 0 ? Math.abs(cross(prev, next, cur)) / base : dist(prev, cur);
      const between = (cur[0] - prev[0]) * (next[0] - prev[0]) + (cur[1] - prev[1]) * (next[1] - prev[1]) > 0 && dist(prev, cur) < base;
      if (tooClose || (offLine < collinear && between)) { changed = true; continue; }
      keep.push(v[i]);
      keptXY.push(cur);
    }
    if (changed) { if (keep.length < 3) return keep; v = keep; }
  }
  if (planarSignedArea(v.map((p) => toLocal(f, p))) < 0) v.reverse();
  return v;
}

/** Douglas-Peucker in metres, for imported outlines with far more points than a lot needs. */
export function simplifyVertices(vertices: Position[], toleranceM: number): Position[] {
  const v = openRing(vertices);
  if (v.length <= 4) return v;
  const f = frameFor(v);
  const q = v.map((p) => toLocal(f, p));
  // split the ring at the vertex farthest from vertex 0 so both halves are open chains
  let far = 0, k = 0;
  q.forEach((p, i) => { const d = dist(q[0], p); if (d > far) { far = d; k = i; } });
  const keep = new Uint8Array(q.length);
  keep[0] = keep[k] = 1;
  const dp = (s: number, e: number, idx: number[]) => {
    let md = 0, mi = -1;
    for (let t = s + 1; t < e; t++) {
      const a = q[idx[s]], b = q[idx[e]], c = q[idx[t]];
      const L = dist(a, b);
      const d = L === 0 ? dist(a, c) : Math.abs(cross(a, b, c)) / L;
      if (d > md) { md = d; mi = t; }
    }
    if (mi >= 0 && md > toleranceM) { keep[idx[mi]] = 1; dp(s, mi, idx); dp(mi, e, idx); }
  };
  const first = Array.from({ length: k + 1 }, (_, i) => i);
  const second = [...Array.from({ length: q.length - k }, (_, i) => k + i), 0];
  dp(0, first.length - 1, first);
  dp(0, second.length - 1, second);
  return v.filter((_, i) => keep[i]);
}

// ---- snapping ----------------------------------------------------------------------------------------------
export interface SnapTargets { vertices: Position[]; segments: [Position, Position][] }
export interface SnapResult { point: Position; kind: 'vertex' | 'edge' | 'none'; distanceM: number }

/** Every corner and edge of the given outlines, for snapping a new shape to its neighbours. */
export function snapTargets(geoms: AreaGeometry[]): SnapTargets {
  const vertices: Position[] = [];
  const segments: [Position, Position][] = [];
  for (const g of geoms) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const rings of polys) for (const r of rings) {
      const o = openRing(r);
      o.forEach((p, i) => { vertices.push(p); segments.push([p, o[(i + 1) % o.length]]); });
    }
  }
  return { vertices, segments };
}

/**
 * Snap `p` to the nearest corner within `toleranceM`, else to the nearest point on an edge within it.
 * Corners win over edges so shared corners line up exactly. The caller converts its pixel tolerance to metres
 * with metersPerPixel(), so snapping feels the same at every zoom level.
 */
export function snapPoint(p: Position, targets: SnapTargets, toleranceM: number): SnapResult {
  const f = localFrame(p[1], p[0]);
  const P = toLocal(f, p);
  let best: SnapResult = { point: p, kind: 'none', distanceM: Infinity };
  for (const v of targets.vertices) {
    const d = dist(P, toLocal(f, v));
    if (d <= toleranceM && d < best.distanceM) best = { point: v, kind: 'vertex', distanceM: d };
  }
  if (best.kind === 'vertex') return best;
  for (const [a, b] of targets.segments) {
    const A = toLocal(f, a), B = toLocal(f, b);
    const L2 = (B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((P[0] - A[0]) * (B[0] - A[0]) + (P[1] - A[1]) * (B[1] - A[1])) / L2));
    const C: XY = [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])];
    const d = dist(P, C);
    if (d <= toleranceM && d < best.distanceM) best = { point: roundPos(fromLocal(f, C)), kind: 'edge', distanceM: d };
  }
  return best.kind === 'none' ? { point: p, kind: 'none', distanceM: 0 } : best;
}

/**
 * Square corners: if the new edge prev→p is within `toleranceDeg` of being parallel or perpendicular to the
 * edge before it (prevPrev→prev), rotate it onto that direction, keeping its length.
 */
export function squareCorner(prevPrev: Position, prev: Position, p: Position, toleranceDeg = 8): Position {
  const f = localFrame(prev[1], prev[0]);
  const A = toLocal(f, prevPrev), B = toLocal(f, prev), P = toLocal(f, p);
  const base = Math.atan2(B[1] - A[1], B[0] - A[0]);
  const ang = Math.atan2(P[1] - B[1], P[0] - B[0]);
  const len = dist(B, P);
  const step = Math.PI / 2;
  const rel = ang - base;
  const k = Math.round(rel / step);
  if (Math.abs(toDeg(rel - k * step)) > toleranceDeg) return p;
  const snapped = base + k * step;
  return roundPos(fromLocal(f, [B[0] + len * Math.cos(snapped), B[1] + len * Math.sin(snapped)]));
}

// ---- shape builders ----------------------------------------------------------------------------------------
/**
 * Rectangle from three taps: a→b is one side (for example along the kerb), c sets how deep it goes.
 * Works at any rotation, so lots that are not north-aligned get square corners.
 */
export function rectangleFrom3(a: Position, b: Position, c: Position): Position[] {
  const f = localFrame(a[1], a[0]);
  const A = toLocal(f, a), B = toLocal(f, b), C = toLocal(f, c);
  const L = dist(A, B);
  if (L === 0) return [a];
  const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L; // unit normal to a→b
  const depth = (C[0] - A[0]) * nx + (C[1] - A[1]) * ny;
  const D: XY = [B[0] + nx * depth, B[1] + ny * depth];
  const E: XY = [A[0] + nx * depth, A[1] + ny * depth];
  return cleanVertices([A, B, D, E].map((x) => fromLocal(f, x)));
}
/** North-aligned rectangle from two opposite corners. */
export function rectangleFrom2(a: Position, b: Position): Position[] {
  return cleanVertices([a, [b[0], a[1]], b, [a[0], b[1]]]);
}

export function midpoints(vertices: Position[]): Position[] {
  const v = openRing(vertices);
  return v.map((p, i) => { const q = v[(i + 1) % v.length]; return roundPos([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); });
}

/** Outer ring of the first polygon, open. Other parts and holes are reported so the editor can say so. */
export function verticesOf(g: AreaGeometry | null | undefined): { vertices: Position[]; extraParts: number; holes: number } {
  if (!g) return { vertices: [], extraParts: 0, holes: 0 };
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  if (!polys.length) return { vertices: [], extraParts: 0, holes: 0 };
  return { vertices: openRing(polys[0][0] ?? []), extraParts: polys.length - 1, holes: polys.reduce((s, r) => s + r.length - 1, 0) };
}
/** Stored form: one closed, counter-clockwise, cleaned polygon rounded to 7 decimals. */
export function toPolygon(vertices: Position[]): AreaGeometry {
  return { type: 'Polygon', coordinates: [closeRing(cleanVertices(vertices))] } as AreaGeometry;
}

// ---- analysis ----------------------------------------------------------------------------------------------
export type IssueCode =
  | 'too_few_points' | 'self_intersecting' | 'area_too_small' | 'area_too_large' | 'area_too_complex' | 'bad_coordinates'
  | 'narrow_for_gps' | 'short_edge' | 'sharp_spike' | 'many_points';
export interface ShapeIssue { code: IssueCode; severity: 'error' | 'warning'; message: string; at?: Position }
export interface ShapeReport {
  vertices: number; areaM2: number; perimeterM: number; minWidthM: number;
  shortestEdgeM: number; longestEdgeM: number; sharpestAngleDeg: number;
  issues: ShapeIssue[]; valid: boolean;
}

export function fmtM2(m2: number): string {
  return m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2)} km²` : m2 >= 10_000 ? `${(m2 / 10_000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString('en-CA')} m²`;
}
export function fmtM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : m >= 10 ? `${Math.round(m)} m` : `${m.toFixed(1)} m`;
}

/** Measure an outline and list every problem, worst first. `level` 3 = parking area, 2 = city zone. */
export function analyzeShape(vertices: Position[], level: 2 | 3 = 3): ShapeReport {
  const v = openRing(vertices);
  const issues: ShapeIssue[] = [];
  const empty: ShapeReport = { vertices: v.length, areaM2: 0, perimeterM: 0, minWidthM: 0, shortestEdgeM: 0, longestEdgeM: 0, sharpestAngleDeg: 0, issues, valid: false };
  if (v.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < -180 || x > 180 || y < -90 || y > 90)) {
    issues.push({ code: 'bad_coordinates', severity: 'error', message: 'Some points are outside valid longitude and latitude.' });
    return empty;
  }
  if (v.length < 3) {
    issues.push({ code: 'too_few_points', severity: 'error', message: `An area needs at least 3 corners (${v.length} so far).` });
    return empty;
  }
  const f = frameFor(v);
  const q = v.map((p) => toLocal(f, p));
  const n = q.length;
  let shortest = Infinity, longest = 0, shortestAt = 0, sharpest = 180, sharpestAt = 0;
  for (let i = 0; i < n; i++) {
    const L = dist(q[i], q[(i + 1) % n]);
    if (L < shortest) { shortest = L; shortestAt = i; }
    if (L > longest) longest = L;
    const a = q[(i - 1 + n) % n], b = q[i], c = q[(i + 1) % n];
    const v1: XY = [a[0] - b[0], a[1] - b[1]], v2: XY = [c[0] - b[0], c[1] - b[1]];
    const den = Math.hypot(...v1) * Math.hypot(...v2);
    if (den > 0) {
      const ang = toDeg(Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / den))));
      if (ang < sharpest) { sharpest = ang; sharpestAt = i; }
    }
  }
  const area = ringAreaM2(v);
  const report: ShapeReport = {
    vertices: n, areaM2: area, perimeterM: perimeterM(v), minWidthM: minWidthM(v),
    shortestEdgeM: shortest, longestEdgeM: longest, sharpestAngleDeg: sharpest, issues, valid: true,
  };
  const x = selfIntersections(v);
  if (x.length) issues.push({ code: 'self_intersecting', severity: 'error', message: `The outline crosses itself${x.length > 1 ? ` in ${x.length} places` : ''}. Move the marked corner so the edges do not cross.`, at: x[0].at });
  const lim = AREA_LIMITS[level];
  if (area < lim.minM2) issues.push({ code: 'area_too_small', severity: 'error', message: `${fmtM2(area)} is smaller than one parking bay (${lim.minM2} m²).` });
  if (area > lim.maxM2) issues.push({ code: 'area_too_large', severity: 'error', message: level === 3 ? `${fmtM2(area)} is over the 5 km² limit for a parking area. Use a city zone for wide coverage.` : `${fmtM2(area)} is over the 50,000 km² limit.` });
  if (n > MAX_POINTS) issues.push({ code: 'area_too_complex', severity: 'error', message: `${n} corners is over the ${MAX_POINTS} limit. Simplify the outline.` });
  if (level === 3 && report.minWidthM > 0 && report.minWidthM < GPS_WIDTH_WARNING_M) issues.push({ code: 'narrow_for_gps', severity: 'warning', message: `Only ${fmtM(report.minWidthM)} wide at its narrowest. Phone GPS is often off by 5-25 m, so drivers on the street beside it may be matched to it, or miss it. Wider than ${GPS_WIDTH_WARNING_M} m is safer.` });
  if (shortest < 1) issues.push({ code: 'short_edge', severity: 'warning', message: `One edge is only ${fmtM(shortest)} long. It is probably a double tap; remove that corner.`, at: v[shortestAt] });
  if (sharpest < 10) issues.push({ code: 'sharp_spike', severity: 'warning', message: `A corner is a ${Math.round(sharpest)}° spike. Spikes are usually a misplaced point.`, at: v[sharpestAt] });
  if (level === 3 && n > 200) issues.push({ code: 'many_points', severity: 'warning', message: `${n} corners is a lot for a parking area. Simplify to make it easier to edit.` });
  report.valid = !issues.some((i) => i.severity === 'error');
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return report;
}

// ---- editor state machine (shared by the web console and the admin app) -----------------------------------
export type DrawTool = 'polygon' | 'rectangle';
export interface EditorState {
  vertices: Position[];
  closed: boolean; // true once the outline is a finished shape
  tool: DrawTool;
  pending: Position[]; // rectangle taps collected so far (0-2)
  past: { vertices: Position[]; closed: boolean }[];
  future: { vertices: Position[]; closed: boolean }[];
}
export type EditorAction =
  | { type: 'load'; vertices: Position[] }
  | { type: 'tool'; tool: DrawTool }
  | { type: 'tap'; at: Position }
  | { type: 'move'; index: number; to: Position }
  | { type: 'insert'; after: number; at: Position }
  | { type: 'remove'; index: number }
  | { type: 'close' }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' };

export const initialEditor = (vertices: Position[] = []): EditorState => ({
  vertices: openRing(vertices), closed: openRing(vertices).length >= 3, tool: 'polygon', pending: [], past: [], future: [],
});

const HISTORY = 100;
function commit(s: EditorState, vertices: Position[], closed: boolean): EditorState {
  return { ...s, vertices, closed, pending: [], past: [...s.past, { vertices: s.vertices, closed: s.closed }].slice(-HISTORY), future: [] };
}

/**
 * Pure reducer: every change goes through here, so undo/redo and the rules are identical on web and phone.
 * Snapping is applied by the caller before dispatching (it needs the map zoom).
 */
export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'load': return initialEditor(a.vertices);
    case 'tool': return { ...s, tool: a.tool, pending: [] };
    case 'tap': {
      const at = roundPos(a.at);
      if (s.closed) return s; // a finished shape is edited by dragging, not by tapping
      if (s.tool === 'rectangle') {
        const pts = [...s.pending, at];
        if (pts.length < 3) return { ...s, pending: pts };
        const rect = rectangleFrom3(pts[0], pts[1], pts[2]);
        return rect.length >= 3 ? commit(s, rect, true) : { ...s, pending: [] };
      }
      // tapping the first corner again closes the shape
      if (s.vertices.length >= 3 && distanceM(s.vertices[0], at) < 0.01) return commit(s, s.vertices, true);
      if (s.vertices.length && distanceM(s.vertices[s.vertices.length - 1], at) < 0.3) return s; // double tap
      return commit(s, [...s.vertices, at], false);
    }
    case 'move': {
      if (a.index < 0 || a.index >= s.vertices.length) return s;
      const v = s.vertices.slice();
      v[a.index] = roundPos(a.to);
      return commit(s, v, s.closed);
    }
    case 'insert': {
      const v = s.vertices.slice();
      v.splice(a.after + 1, 0, roundPos(a.at));
      return commit(s, v, s.closed);
    }
    case 'remove': {
      if (s.closed && s.vertices.length <= 3) return s; // keep a valid triangle; use clear to start over
      return commit(s, s.vertices.filter((_, i) => i !== a.index), s.closed);
    }
    case 'close': return s.vertices.length >= 3 && !s.closed ? commit(s, cleanVertices(s.vertices), true) : s;
    case 'clear': return s.vertices.length || s.pending.length ? commit({ ...s }, [], false) : s;
    case 'undo': {
      if (s.pending.length) return { ...s, pending: s.pending.slice(0, -1) };
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { ...s, ...prev, pending: [], past: s.past.slice(0, -1), future: [{ vertices: s.vertices, closed: s.closed }, ...s.future] };
    }
    case 'redo': {
      const next = s.future[0];
      if (!next) return s;
      return { ...s, ...next, pending: [], past: [...s.past, { vertices: s.vertices, closed: s.closed }], future: s.future.slice(1) };
    }
  }
}
