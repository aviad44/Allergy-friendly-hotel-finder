import * as turf from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import { OSMBuilding } from './osmBuildings';
import { getShadowBearing, SunPosition } from './sunCalc';

const MAX_SHADOW_M = 120;

function buildShadowPolygon(building: OSMBuilding, sun: SunPosition): Feature<Polygon> | null {
  if (sun.altitudeDeg <= 2) return null;
  const shadowLength = Math.min(building.height * sun.shadowLengthPerMeter, MAX_SHADOW_M);
  const bearing = getShadowBearing(sun.azimuthDeg);
  const shadowVerts = building.footprint.map(([lng, lat]) => {
    const dest = turf.destination(turf.point([lng, lat]), shadowLength / 1000, bearing, { units: 'kilometers' });
    return dest.geometry.coordinates as [number, number];
  });
  const allVerts = [...building.footprint, ...shadowVerts].map(p => turf.point(p));
  return turf.convex(turf.featureCollection(allVerts)) as Feature<Polygon> | null;
}

export function scoreSegmentShade(start: [number, number], end: [number, number], shadows: Feature<Polygon>[]): number {
  if (shadows.length === 0) return 0;
  const line = turf.lineString([start, end]);
  const lengthM = turf.length(line, { units: 'meters' });
  if (lengthM < 1) return 0;
  const samples = Math.max(4, Math.ceil(lengthM / 8));
  let shadedCount = 0;
  for (let i = 0; i <= samples; i++) {
    const pt = turf.along(line, (i / samples) * lengthM / 1000, { units: 'kilometers' });
    for (const shadow of shadows) {
      if (turf.booleanPointInPolygon(pt, shadow)) { shadedCount++; break; }
    }
  }
  return shadedCount / (samples + 1);
}

export function buildShadowPolygons(buildings: OSMBuilding[], sun: SunPosition): Feature<Polygon>[] {
  return buildings.map(b => buildShadowPolygon(b, sun)).filter((p): p is Feature<Polygon> => p !== null);
}
