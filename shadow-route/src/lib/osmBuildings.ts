export interface OSMBuilding {
  id: number;
  footprint: [number, number][];
  height: number;
}

const DEFAULT_LEVEL_HEIGHT = 3.5;

export async function fetchBuildingsAlongRoute(coords: [number, number][], bufferDeg = 0.0005): Promise<OSMBuilding[]> {
  if (coords.length === 0) return [];
  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  const s = Math.min(...lats) - bufferDeg, n = Math.max(...lats) + bufferDeg;
  const w = Math.min(...lngs) - bufferDeg, e = Math.max(...lngs) + bufferDeg;
  const query = `[out:json][timeout:30];(way["building"](${s},${w},${n},${e}););out body;>;out skel qt;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}` });
  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const data = await res.json();
  const nodes: Record<number, [number, number]> = {};
  for (const el of data.elements) if (el.type === 'node') nodes[el.id] = [el.lon, el.lat];
  const buildings: OSMBuilding[] = [];
  for (const el of data.elements) {
    if (el.type !== 'way' || !el.tags?.building) continue;
    const footprint = (el.nodes as number[]).map((id: number) => nodes[id]).filter(Boolean) as [number, number][];
    if (footprint.length < 3) continue;
    const levels = parseInt(el.tags['building:levels'] ?? '3', 10);
    const rawHeight = parseFloat(el.tags['height'] ?? '');
    buildings.push({ id: el.id, footprint, height: isNaN(rawHeight) ? (isNaN(levels) ? 3 : levels) * DEFAULT_LEVEL_HEIGHT : rawHeight });
  }
  return buildings;
}
