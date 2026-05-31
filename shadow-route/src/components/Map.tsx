'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, useMapEvents, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ScoredRoute } from '@/app/api/shade/route';
import type { Feature, Polygon as GeoPolygon } from 'geojson';

function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length < 2) return;
    const bounds = L.latLngBounds(coords.map(c => [c[1], c[0]] as [number, number]));
    map.fitBounds(bounds, { padding: [60, 60] });
  }, [coords, map]);
  return null;
}

function shadeToColor(score: number): string {
  if (score >= 0.7) return '#3b82f6';
  if (score >= 0.35) return '#eab308';
  return '#f97316';
}

function ClickHandler({ onMapClick }: { onMapClick: (lngLat: [number, number]) => void }) {
  useMapEvents({ click(e) { onMapClick([e.latlng.lng, e.latlng.lat]); } });
  return null;
}

interface Props {
  routes: ScoredRoute[];
  activeRouteIdx: number;
  start: [number, number] | null;
  end: [number, number] | null;
  shadows: Feature<GeoPolygon>[];
  onMapClick: (lngLat: [number, number]) => void;
}

export default function Map({ routes, activeRouteIdx, start, end, shadows, onMapClick }: Props) {
  const activeRoute = routes[activeRouteIdx];
  const inactiveRoutes = routes.filter((_, i) => i !== activeRouteIdx);

  return (
    <MapContainer center={[32.0853, 34.7818]} zoom={14} className="w-full h-full" zoomControl={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler onMapClick={onMapClick} />
      {activeRoute && <FitBounds coords={activeRoute.coordinates} />}
      {shadows.map((shadow, i) => {
        if (shadow.geometry.type !== 'Polygon') return null;
        const positions = shadow.geometry.coordinates[0].map(c => [c[1], c[0]] as [number, number]);
        return <Polygon key={i} positions={positions} pathOptions={{ color: '#1e40af', fillColor: '#3b82f6', fillOpacity: 0.18, weight: 0 }} />;
      })}
      {inactiveRoutes.map((route, i) => (
        <Polyline key={`inactive-${i}`} positions={route.coordinates.map(c => [c[1], c[0]] as [number, number])} pathOptions={{ color: '#94a3b8', weight: 4, opacity: 0.5 }} />
      ))}
      {activeRoute?.coordinates.slice(0, -1).map((coord, i) => {
        const next = activeRoute.coordinates[i + 1];
        const score = activeRoute.segmentScores[i] ?? 0;
        return <Polyline key={`seg-${i}`} positions={[[coord[1], coord[0]], [next[1], next[0]]]} pathOptions={{ color: shadeToColor(score), weight: 6, opacity: 0.9 }} />;
      })}
      {start && <CircleMarker center={[start[1], start[0]]} radius={10} pathOptions={{ color: '#fff', fillColor: '#22c55e', fillOpacity: 1, weight: 3 }}><Tooltip permanent direction="top" offset={[0, -12]}>מוצא</Tooltip></CircleMarker>}
      {end && <CircleMarker center={[end[1], end[0]]} radius={10} pathOptions={{ color: '#fff', fillColor: '#ef4444', fillOpacity: 1, weight: 3 }}><Tooltip permanent direction="top" offset={[0, -12]}>יעד</Tooltip></CircleMarker>}
    </MapContainer>
  );
}
