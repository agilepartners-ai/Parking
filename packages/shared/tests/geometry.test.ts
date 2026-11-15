import { describe, expect, it } from 'vitest';
import {
  analyzeShape, cleanVertices, distanceM, editorReducer, fromLocal, geometryAreaM2, initialEditor, localFrame, metersPerPixel,
  minWidthM, rectangleFrom3, ringAreaM2, selfIntersections, simplifyVertices, snapPoint, snapTargets, squareCorner, toLocal, toPolygon,
  type Position,
} from '../src';

// Reference values from PostGIS on the live database: st_area(st_geomfromgeojson(...)::geography), WGS84 spheroid.
const LOT: Position[] = [[-79.3832, 43.6526], [-79.382, 43.6526], [-79.382, 43.6534], [-79.3832, 43.6534]];
const LOT_POSTGIS_M2 = 8604.59402668476;
const BIG: Position[] = [[-79.6, 43.5], [-79.1, 43.5], [-79.1, 43.9], [-79.6, 43.9]];
const BIG_POSTGIS_M2 = 1791231320.43561;

/** Build a shape from metre offsets around Toronto City Hall. */
const f = localFrame(43.6526, -79.3832);
const m = (pts: [number, number][]) => pts.map((p) => fromLocal(f, p));

describe('measurement matches PostGIS', () => {
  it('parking-lot area within 0.05% of the database', () => {
    expect(Math.abs(ringAreaM2(LOT) - LOT_POSTGIS_M2) / LOT_POSTGIS_M2).toBeLessThan(0.0005);
  });
  it('city-zone area within 0.5% of the database', () => {
    expect(Math.abs(ringAreaM2(BIG) - BIG_POSTGIS_M2) / BIG_POSTGIS_M2).toBeLessThan(0.005);
  });
  it('closed and open rings give the same area; holes are subtracted', () => {
    expect(ringAreaM2([...LOT, LOT[0]])).toBeCloseTo(ringAreaM2(LOT), 6);
    const hole = m([[20, 20], [40, 20], [40, 40], [20, 40]]);
    const outer = m([[0, 0], [100, 0], [100, 100], [0, 100]]);
    const g = { type: 'Polygon', coordinates: [[...outer, outer[0]], [...hole, hole[0]]] } as never;
    expect(geometryAreaM2(g)).toBeCloseTo(10000 - 400, 0);
  });
  it('local frame round-trips and measures metres', () => {
    const p = fromLocal(f, [123.4, -56.7]);
    const q = toLocal(f, p);
    expect(q[0]).toBeCloseTo(123.4, 6);
    expect(distanceM(fromLocal(f, [0, 0]), fromLocal(f, [300, 400]))).toBeCloseTo(500, 1);
  });
  it('metres per pixel at Toronto, zoom 17', () => {
    expect(metersPerPixel(43.65, 17)).toBeCloseTo(0.865, 2);
  });
});

describe('validation', () => {
  it('a 40 x 25 m lot is valid with exact numbers', () => {
    const r = analyzeShape(m([[0, 0], [40, 0], [40, 25], [0, 25]]));
    expect(r.valid).toBe(true);
    expect(r.areaM2).toBeCloseTo(1000, 0);
    expect(r.perimeterM).toBeCloseTo(130, 1);
    expect(r.minWidthM).toBeCloseTo(25, 1);
    expect(r.sharpestAngleDeg).toBeCloseTo(90, 3);
    expect(r.issues).toHaveLength(0);
  });
  it('a bow-tie is rejected and the crossing is located', () => {
    const v = m([[0, 0], [40, 40], [40, 0], [0, 40]]);
    const x = selfIntersections(v);
    expect(x).toHaveLength(1);
    const at = toLocal(f, x[0].at);
    expect(at[0]).toBeCloseTo(20, 3);
    expect(at[1]).toBeCloseTo(20, 3);
    expect(analyzeShape(v).issues[0].code).toBe('self_intersecting');
  });
  it('a 2 x 3 m shape is smaller than a bay', () => {
    expect(analyzeShape(m([[0, 0], [2, 0], [2, 3], [0, 3]])).issues.map((i) => i.code)).toContain('area_too_small');
  });
  it('over 5 km² is too large for a parking area but fine as a city zone', () => {
    const v = m([[0, 0], [3000, 0], [3000, 2000], [0, 2000]]);
    expect(analyzeShape(v, 3).valid).toBe(false);
    expect(analyzeShape(v, 2).valid).toBe(true);
  });
  it('a 6 m wide strip warns about GPS accuracy but stays valid', () => {
    const r = analyzeShape(m([[0, 0], [200, 0], [200, 6], [0, 6]]));
    expect(r.valid).toBe(true);
    expect(r.minWidthM).toBeCloseTo(6, 1);
    expect(r.issues.map((i) => i.code)).toContain('narrow_for_gps');
  });
  it('rotated strip: width is measured across, not north-south', () => {
    const k = Math.SQRT1_2;
    const strip = ([[0, 0], [100, 0], [100, 20], [0, 20]] as [number, number][]).map(([x, y]) => [x * k - y * k, x * k + y * k] as [number, number]);
    expect(minWidthM(m(strip))).toBeCloseTo(20, 1);
  });
  it('fewer than 3 corners is an error', () => {
    expect(analyzeShape(m([[0, 0], [10, 0]])).issues[0].code).toBe('too_few_points');
  });
});

describe('cleaning and simplifying', () => {
  it('drops double taps and straight-line points, orients counter-clockwise', () => {
    const v = m([[0, 0], [0, 30], [0, 30.1], [40, 30], [40, 15], [40, 0]]); // clockwise, a duplicate, a collinear point
    const c = cleanVertices(v);
    expect(c).toHaveLength(4);
    const q = c.map((p) => toLocal(f, p));
    let s = 0;
    for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a[0] * b[1] - b[0] * a[1]; }
    expect(s).toBeGreaterThan(0);
  });
  it('toPolygon closes the ring and rounds to 7 decimals', () => {
    const g = toPolygon(LOT.map(([x, y]) => [x + 1e-9, y] as Position));
    const ring = (g as { coordinates: Position[][] }).coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(String(ring[0][0]).split('.')[1].length).toBeLessThanOrEqual(7);
  });
  it('simplify keeps the corners of a noisy rectangle', () => {
    const pts: [number, number][] = [];
    for (let x = 0; x <= 100; x += 2) pts.push([x, Math.sin(x) * 0.05]);
    for (let y = 2; y <= 50; y += 2) pts.push([100, y]);
    for (let x = 98; x >= 0; x -= 2) pts.push([x, 50]);
    for (let y = 48; y > 0; y -= 2) pts.push([0, y]);
    const s = simplifyVertices(m(pts), 0.5);
    expect(s.length).toBe(4);
    expect(ringAreaM2(s)).toBeCloseTo(5000, -1);
  });
});

describe('snapping and builders', () => {
  const neighbour = toPolygon(m([[50, 0], [90, 0], [90, 30], [50, 30]]));
  const targets = snapTargets([neighbour]);
  it('snaps to a nearby corner first', () => {
    const r = snapPoint(fromLocal(f, [51.5, 1]), targets, 3);
    expect(r.kind).toBe('vertex');
    expect(distanceM(r.point, fromLocal(f, [50, 0]))).toBeLessThan(0.02);
  });
  it('then to the nearest point on an edge', () => {
    const r = snapPoint(fromLocal(f, [48.5, 15]), targets, 3);
    expect(r.kind).toBe('edge');
    const q = toLocal(f, r.point);
    expect(q[0]).toBeCloseTo(50, 1);
    expect(q[1]).toBeCloseTo(15, 1);
  });
  it('leaves far points alone', () => {
    expect(snapPoint(fromLocal(f, [20, 15]), targets, 3).kind).toBe('none');
  });
  it('three-tap rectangle has square corners at any rotation', () => {
    const r = rectangleFrom3(fromLocal(f, [0, 0]), fromLocal(f, [30, 30]), fromLocal(f, [0, 20]));
    const a = analyzeShape(r);
    expect(r).toHaveLength(4);
    expect(a.sharpestAngleDeg).toBeGreaterThan(89.9);
    expect(a.areaM2).toBeCloseTo(Math.hypot(30, 30) * (20 / Math.SQRT2), 0);
  });
  it('square corner snaps an almost-perpendicular edge', () => {
    const p = squareCorner(fromLocal(f, [0, 0]), fromLocal(f, [40, 0]), fromLocal(f, [42, 25]));
    const q = toLocal(f, p);
    expect(q[0]).toBeCloseTo(40, 1);
    expect(q[1]).toBeCloseTo(Math.hypot(2, 25), 1);
  });
});

describe('editor state machine', () => {
  const P = (x: number, y: number) => fromLocal(f, [x, y]);
  it('draws, closes by tapping the first corner, edits, undoes and redoes', () => {
    let s = initialEditor();
    for (const p of [P(0, 0), P(30, 0), P(30, 20), P(0, 20)]) s = editorReducer(s, { type: 'tap', at: p });
    expect(s.closed).toBe(false);
    s = editorReducer(s, { type: 'tap', at: s.vertices[0] });
    expect(s.closed).toBe(true);
    s = editorReducer(s, { type: 'move', index: 2, to: P(35, 25) });
    s = editorReducer(s, { type: 'insert', after: 0, at: P(15, -5) });
    expect(s.vertices).toHaveLength(5);
    s = editorReducer(s, { type: 'undo' });
    s = editorReducer(s, { type: 'undo' });
    expect(toLocal(f, s.vertices[2])[0]).toBeCloseTo(30, 1); // stored to 7 decimals, about 1 cm
    s = editorReducer(s, { type: 'redo' });
    expect(toLocal(f, s.vertices[2])[0]).toBeCloseTo(35, 1);
  });
  it('ignores a double tap and keeps a closed triangle', () => {
    let s = initialEditor();
    s = editorReducer(s, { type: 'tap', at: P(0, 0) });
    s = editorReducer(s, { type: 'tap', at: P(0.1, 0) });
    expect(s.vertices).toHaveLength(1);
    s = initialEditor([P(0, 0), P(10, 0), P(0, 10)]);
    expect(editorReducer(s, { type: 'remove', index: 0 }).vertices).toHaveLength(3);
  });
  it('rectangle tool finishes after the third tap; undo steps back one tap', () => {
    let s = editorReducer(initialEditor(), { type: 'tool', tool: 'rectangle' });
    s = editorReducer(s, { type: 'tap', at: P(0, 0) });
    s = editorReducer(s, { type: 'tap', at: P(40, 0) });
    s = editorReducer(s, { type: 'undo' });
    expect(s.pending).toHaveLength(1);
    s = editorReducer(s, { type: 'tap', at: P(40, 0) });
    s = editorReducer(s, { type: 'tap', at: P(10, 25) });
    expect(s.closed).toBe(true);
    expect(analyzeShape(s.vertices).areaM2).toBeCloseTo(1000, 0);
  });
});
