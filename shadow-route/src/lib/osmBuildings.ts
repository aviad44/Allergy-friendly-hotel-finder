export interface OSMBuilding {
  id: number;
  footprint: [number, number][];
  height: number;
}

const DEFAULT_LEVEL_HEIGHT = 3.5;

export async function fetchBuildingsAlongRoute(
  coords: [number, number][],
  bufferDeg = 0.0005
): Promise<OSMBuilding[]> {
  if (coords.length === 0) return [];
  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  const s = Math.min(...lats) - bufferDeg;
  const n = Math.max(...lats) + bufferDeg;
  const w = Math.min(...lngs) - bufferDeg;
  const e = Math.max(...lngs) + bufferDeg;
  const query = `[out:json][timeout:30];(way["building"](${s},${w},${n},${e}););out body;>;out skel qt;`;
  const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  let res: Response | null = null;
  for (const url of MIRRORS) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json, */*',
          'User-Agent': 'shadow-route-app/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.ok) break;
      console.warn(`Overpass mirror ${url} returned ${res.status}, trying next`);
    } catch (err) {
      console.warn(`Overpass mirror ${url} failed:`, err);
    }
  }

  if (!res?.ok) {
    console.warn('All Overpass mirrors failed — proceeding without buildings');
    return [];
  }

  let data: { elements?: Record<string, unknown>[] };
  try {
    data = await res.json() as typeof data;
  } catch {
    console.warn('Overpass returned non-JSON response — proceeding without buildings');
    return [];
  }
  if (!Array.isArray(data?.elements)) return [];

  const nodes: Record<number, [number, number]> = {};
  for (const el of data.elements) {
    if (el['type'] === 'node') nodes[el['id'] as number] = [el['lon'] as number, el['lat'] as number];
  }
  const buildings: OSMBuilding[] = [];
  for (const el of data.elements) {
    if (el['type'] !== 'way' || !(el['tags'] as Record<string,string>)?.['building']) continue;
    const tags = el['tags'] as Record<string, string>;
    const footprint = (el['nodes'] as number[]).map(id => nodes[id]).filter(Boolean) as [number, number][];
    if (footprint.length < 3) continue;
    const levels = parseInt(tags['building:levels'] ?? '3', 10);
    const rawHeight = parseFloat(tags['height'] ?? '');
    const height = isNaN(rawHeight) ? (isNaN(levels) ? 3 : levels) * DEFAULT_LEVEL_HEIGHT : rawHeight;
    buildings.push({ id: el['id'] as number, footprint, height });
  }
  return buildings;
}
