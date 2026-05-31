export interface OSMBuilding {
  id: number;
  footprint: [number, number][]; // [lng, lat] pairs
  height: number; // meters
}

const DEFAULT_LEVEL_HEIGHT = 3.5; // meters per floor

export async function fetchBuildingsAlongRoute(
  coords: [number, number][],
  bufferDeg = 0.0005 // ~55m
): Promise<OSMBuilding[]> {
  if (coords.length === 0) return [];

  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  const s = Math.min(...lats) - bufferDeg;
  const n = Math.max(...lats) + bufferDeg;
  const w = Math.min(...lngs) - bufferDeg;
  const e = Math.max(...lngs) + bufferDeg;

  const query = `[out:json][timeout:30];(way["building"](${s},${w},${n},${e}););out body;>;out skel qt;`;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json, */*',
        'User-Agent': 'shadow-route-app/1.0',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) {
      console.warn(`Overpass returned ${res.status} — skipping buildings`);
      return [];
    }

    const data = await res.json();
    const nodes: Record<number, [number, number]> = {};
    for (const el of data.elements) {
      if (el.type === 'node') nodes[el.id] = [el.lon, el.lat];
    }

    const buildings: OSMBuilding[] = [];
    for (const el of data.elements) {
      if (el.type !== 'way' || !el.tags?.building) continue;
      const footprint = (el.nodes as number[])
        .map(id => nodes[id])
        .filter(Boolean) as [number, number][];
      if (footprint.length < 3) continue;

      const levels = parseInt(el.tags['building:levels'] ?? '3', 10);
      const rawHeight = parseFloat(el.tags['height'] ?? '');
      const height = isNaN(rawHeight)
        ? (isNaN(levels) ? 3 : levels) * DEFAULT_LEVEL_HEIGHT
        : rawHeight;

      buildings.push({ id: el.id, footprint, height });
    }

    return buildings;
  } catch (err) {
    console.warn('Overpass fetch failed — skipping buildings:', err);
    return [];
  }
}
