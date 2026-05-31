import type { Feature, Polygon } from 'geojson';
import type { OSMBuilding } from './osmBuildings';
import { getShadowBearing, type SunPosition } from './sunCalc';

const MAX_SHADOW_M = 120;

function destination(lng: number, lat: number, distKm: number, bearingDeg: number): [number, number] {
  const R = 6371;
  const d = distKm / R;
  const b = bearingDeg * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lng1 = lng * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [lng2 * 180 / Math.PI, lat2 * 180 / Math.PI];
}

function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
  const cross = (o: [number,number], a: [number,number], b: [number,number]) =>
    (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower: [number,number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number,number][] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return [...lower, ...upper];
}

function pointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function buildShadowPolygon(building: OSMBuilding, sun: SunPosition): Feature<Polygon> | null {
  if (sun.altitudeDeg <= 2) return null;
  const shadowLength = Math.min(building.height * sun.shadowLengthPerMeter, MAX_SHADOW_M);
  const bearing = getShadowBearing(sun.azimuthDeg);
  const shadowVerts = building.footprint.map(([lng, lat]) =>
    destination(lng, lat, shadowLength / 1000, bearing)
  );
  const hull = convexHull([...building.footprint, ...shadowVerts]);
  if (hull.length < 3) return null;
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[...hull, hull[0]]] },
    properties: {},
  };
}

export function scoreSegmentShade(
  start: [number, number],
  end: [number, number],
  shadows: Feature<Polygon>[]
): number {
  if (shadows.length === 0) return 0;
  const dx = (end[0] - start[0]) * 111320 * Math.cos((start[1] + end[1]) / 2 * Math.PI / 180);
  const dy = (end[1] - start[1]) * 111320;
  const lengthM = Math.sqrt(dx * dx + dy * dy);
  if (lengthM < 1) return 0;
  const samples = Math.max(4, Math.ceil(lengthM / 8));
  let shadedCount = 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pt: [number, number] = [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
    ];
    for (const shadow of shadows) {
      if (pointInPolygon(pt, shadow.geometry.coordinates[0] as [number, number][])) {
        shadedCount++;
        break;
      }
    }
  }
  return shadedCount / (samples + 1);
}

export function buildShadowPolygons(buildings: OSMBuilding[], sun: SunPosition): Feature<Polygon>[] {
  return buildings
    .map(b => buildShadowPolygon(b, sun))
    .filter((p): p is Feature<Polygon> => p !== null);
}
