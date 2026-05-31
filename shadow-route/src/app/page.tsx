'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import RoutePanel from '@/components/RoutePanel';
import TimeControl from '@/components/TimeControl';
import type { ScoredRoute } from './api/shade/route';
import { fetchAlternativeRoutes, type TravelMode } from '@/lib/routing';
import type { Feature, Polygon } from 'geojson';

// Mapbox cannot run during SSR
const Map = dynamic(() => import('@/components/Map'), { ssr: false });
const SearchBox = dynamic(() => import('@/components/SearchBox'), { ssr: false });

export default function Home() {
  const [start, setStart] = useState<[number, number] | null>(null);
  const [end, setEnd] = useState<[number, number] | null>(null);
  const [startName, setStartName] = useState('');
  const [endName, setEndName] = useState('');
  const [clickMode, setClickMode] = useState<'start' | 'end'>('start');

  const [time, setTime] = useState<Date>(new Date());
  const [mode, setMode] = useState<TravelMode>('foot-walking');
  const [preference, setPreference] = useState<'shade' | 'sun'>('shade');

  const [routes, setRoutes] = useState<ScoredRoute[]>([]);
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);
  const [shadows, setShadows] = useState<Feature<Polygon>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMapClick = useCallback((lngLat: [number, number]) => {
    if (clickMode === 'start') {
      setStart(lngLat);
      setStartName(`${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`);
      setClickMode('end');
    } else {
      setEnd(lngLat);
      setEndName(`${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`);
    }
  }, [clickMode]);

  const findRoutes = useCallback(async () => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    setRoutes([]);

    try {
      const rawRoutes = await fetchAlternativeRoutes(start, end, mode);

      const res = await fetch('/api/shade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routes: rawRoutes,
          time: time.toISOString(),
          includeShadows: true,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const scored: ScoredRoute[] = data.scored;

      const shadiest = [...scored].sort((a, b) => b.shadeScore - a.shadeScore)[0];
      const sunniest = [...scored].sort((a, b) => a.shadeScore - b.shadeScore)[0];
      const fastest = [...scored].sort((a, b) => a.duration - b.duration)[0];
      // deduplicate while preserving order: fastest, shadiest, sunniest
      const ordered = [fastest, shadiest, sunniest].filter(
        (r, i, arr) => arr.indexOf(r) === i
      );

      setRoutes(ordered);
      setShadows(data.scored[0]?.shadowPolygons ?? []);
      const preferredRoute = preference === 'sun' ? sunniest : shadiest;
      setActiveRouteIdx(Math.max(0, ordered.indexOf(preferredRoute)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }, [start, end, mode, time]);

  const canSearch = start !== null && end !== null && !loading;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50" dir="rtl">
      {/* Sidebar */}
      <aside className="w-80 flex flex-col shadow-xl bg-white z-10 overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b bg-gradient-to-l from-blue-600 to-blue-800">
          <h1 className="text-xl font-bold text-white">🌳 ניווט בצל</h1>
          <p className="text-blue-100 text-xs mt-0.5">מסלולים מוצלים לרגל ואופניים</p>
        </div>

        {/* Search inputs */}
        <div className="p-3 flex flex-col gap-2 border-b">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">נקודת מוצא</label>
            <SearchBox
              placeholder="חפש כתובת..."
              onResult={(lngLat, name) => { setStart(lngLat); setStartName(name); }}
            />
            {startName && <p className="text-xs text-green-600 mt-1 truncate">✓ {startName}</p>}
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">יעד</label>
            <SearchBox
              placeholder="חפש יעד..."
              onResult={(lngLat, name) => { setEnd(lngLat); setEndName(name); }}
            />
            {endName && <p className="text-xs text-red-500 mt-1 truncate">✓ {endName}</p>}
          </div>

          {/* Click mode toggle */}
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setClickMode('start')}
              className={`flex-1 rounded-lg py-1.5 border font-medium ${clickMode === 'start' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'}`}
            >
              📍 לחץ למוצא
            </button>
            <button
              onClick={() => setClickMode('end')}
              className={`flex-1 rounded-lg py-1.5 border font-medium ${clickMode === 'end' ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500'}`}
            >
              🏁 לחץ ליעד
            </button>
          </div>
        </div>

        {/* Mode & time */}
        <div className="p-3 border-b flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('foot-walking')}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${mode === 'foot-walking' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
            >
              🚶 רגל
            </button>
            <button
              onClick={() => setMode('cycling-regular')}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${mode === 'cycling-regular' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
            >
              🚲 אופניים
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPreference('shade')}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${preference === 'shade' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
            >
              🌳 העדף צל
            </button>
            <button
              onClick={() => setPreference('sun')}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${preference === 'sun' ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : 'border-gray-200 text-gray-600'}`}
            >
              ☀️ העדף שמש
            </button>
          </div>
          <TimeControl date={time} onChange={setTime} />
        </div>

        {/* Search button */}
        <div className="p-3 border-b">
          <button
            onClick={findRoutes}
            disabled={!canSearch}
            className="w-full py-2.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '⏳ מחפש מסלולים...' : '🔍 מצא מסלולים מוצלים'}
          </button>
          {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
        </div>

        {/* Routes list */}
        <RoutePanel
          routes={routes}
          activeIdx={activeRouteIdx}
          onSelect={setActiveRouteIdx}
          loading={loading}
        />
      </aside>

      {/* Map */}
      <main className="flex-1 relative">
        <Map
          routes={routes}
          activeRouteIdx={activeRouteIdx}
          start={start}
          end={end}
          shadows={shadows}
          onMapClick={handleMapClick}
        />

        {/* Legend overlay */}
        <div className="absolute bottom-6 left-4 bg-white/90 backdrop-blur-sm rounded-xl p-3 shadow text-xs" dir="rtl">
          <p className="font-semibold text-gray-700 mb-1.5">אגדה</p>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2"><span className="w-8 h-2 rounded bg-blue-500 inline-block"/> צל ({'>'}70%)</span>
            <span className="flex items-center gap-2"><span className="w-8 h-2 rounded bg-yellow-400 inline-block"/> חלקי (35-70%)</span>
            <span className="flex items-center gap-2"><span className="w-8 h-2 rounded bg-orange-500 inline-block"/> שמש ({'<'}35%)</span>
          </div>
          <p className="text-gray-400 mt-2 text-[10px]">הצללה מבוססת על גובה בניינים + מיקום שמש</p>
        </div>
      </main>
    </div>
  );
}
