import type { AreaGeometry, ParkingArea, Position } from './types';

function inRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lng: number, lat: number, rings: Position[][]): boolean {
  if (!rings.length || !inRing(lng, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(lng, lat, rings[k])) return false; // hole
  return true;
}

export function pointInGeometry(lat: number, lng: number, g: AreaGeometry): boolean {
  if (g.type === 'Polygon') return inPolygon(lng, lat, g.coordinates);
  return g.coordinates.some((poly) => inPolygon(lng, lat, poly));
}

/** Rough size of a geometry in square degrees (only used to rank overlapping areas). */
function roughArea(g: AreaGeometry): number {
  const ringArea = (r: Position[]) => {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    return Math.abs(a / 2);
  };
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.reduce((s, p) => s + ringArea(p[0]), 0);
}

/**
 * Same rule as the SQL find_parking_area(): most specific level wins (3 before 2 before 1),
 * ties go to the smallest area.
 */
export function findArea(areas: ParkingArea[], lat: number, lng: number): ParkingArea | null {
  const hits = areas.filter((a) => pointInGeometry(lat, lng, a.geometry));
  if (!hits.length) return null;
  hits.sort((a, b) => b.level - a.level || roughArea(a.geometry) - roughArea(b.geometry));
  return hits[0];
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function geometryCenter(g: AreaGeometry): { lat: number; lng: number } {
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
  const n = ring.length - 1 || 1;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return { lat: y / n, lng: x / n };
}

/** Normalise a plate the same way the database does: upper case, letters and digits only. */
export function normalizePlate(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
