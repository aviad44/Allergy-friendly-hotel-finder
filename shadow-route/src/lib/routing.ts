export type TravelMode = 'foot-walking' | 'cycling-regular';

export interface RawRoute {
  coordinates: [number, number][];
  distance: number;
  duration: number;
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

export async function fetchAlternativeRoutes(start: [number, number], end: [number, number], mode: TravelMode): Promise<RawRoute[]> {
  const profile = mode === 'foot-walking' ? 'foot' : 'bike';
  const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const res = await fetch(`${OSRM_BASE}/${profile}/${coords}?alternatives=true&geometries=geojson&overview=full`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`שגיאת ניתוב: ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`ניתוב: ${data.message ?? data.code}`);
  return (data.routes as any[]).map(r => ({ coordinates: r.geometry.coordinates as [number, number][], distance: r.distance as number, duration: r.duration as number }));
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} מ'` : `${(meters / 1000).toFixed(1)} ק"מ`;
}

export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  return min < 60 ? `${min} דק'` : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} שע'`;
}
