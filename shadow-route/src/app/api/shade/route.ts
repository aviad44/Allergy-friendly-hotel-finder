import { NextRequest, NextResponse } from 'next/server';
import { fetchBuildingsAlongRoute } from '@/lib/osmBuildings';
import { buildShadowPolygons, scoreSegmentShade } from '@/lib/shadowCalc';
import { getSunPosition } from '@/lib/sunCalc';
import type { Feature, Polygon } from 'geojson';

export interface ScoredRoute {
  coordinates: [number, number][];
  distance: number;
  duration: number;
  shadeScore: number;
  segmentScores: number[];
  shadowPolygons?: Feature<Polygon>[];
}

export interface ShadeRequest {
  routes: { coordinates: [number, number][]; distance: number; duration: number }[];
  time: string;
  includeShadows?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body: ShadeRequest = await req.json();
    const { routes, time, includeShadows = false } = body;
    if (!routes?.length) return NextResponse.json({ error: 'No routes provided' }, { status: 400 });

    const date = new Date(time);
    const midCoord = routes[0].coordinates[Math.floor(routes[0].coordinates.length / 2)];
    const sun = getSunPosition(midCoord[1], midCoord[0], date);

    if (sun.altitudeDeg <= 0) {
      const scored: ScoredRoute[] = routes.map(r => ({
        ...r,
        shadeScore: 1,
        segmentScores: r.coordinates.slice(0, -1).map(() => 1),
      }));
      return NextResponse.json({ scored, sun, night: true });
    }

    const allCoords = routes.flatMap(r => r.coordinates);
    const buildings = await fetchBuildingsAlongRoute(allCoords);
    const shadows = buildShadowPolygons(buildings, sun);

    const scored: ScoredRoute[] = routes.map(route => {
      const { coordinates, distance, duration } = route;
      const segmentScores: number[] = [];
      let totalWeightedShade = 0;
      let totalLength = 0;

      for (let i = 0; i < coordinates.length - 1; i++) {
        const start = coordinates[i] as [number, number];
        const end = coordinates[i + 1] as [number, number];
        const score = scoreSegmentShade(start, end, shadows);
        segmentScores.push(score);
        const dx = (end[0] - start[0]) * 111000 * Math.cos((start[1] + end[1]) / 2 * Math.PI / 180);
        const dy = (end[1] - start[1]) * 111000;
        const len = Math.sqrt(dx * dx + dy * dy);
        totalWeightedShade += score * len;
        totalLength += len;
      }

      return {
        coordinates, distance, duration,
        shadeScore: totalLength > 0 ? totalWeightedShade / totalLength : 0,
        segmentScores,
        ...(includeShadows ? { shadowPolygons: shadows } : {}),
      };
    });

    return NextResponse.json({ scored, sun, night: false });
  } catch (err) {
    console.error('[shade]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
