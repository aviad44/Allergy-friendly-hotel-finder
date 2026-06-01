'use client';

import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import RoutePanel from '@/components/RoutePanel';
import TimeControl from '@/components/TimeControl';
import type { ScoredRoute } from './api/shade/route';
import { fetchAlternativeRoutes, type TravelMode } from '@/lib/routing';
import type { Feature, Polygon } from 'geojson';

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

  const mapRef = useRef<HTMLDivElement>(null);

  const scrollToMap = () => mapRef.current?.scrollIntoView({ behavior: 'smooth' });

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
      const ordered = [fastest, shadiest, sunniest].filter(
        (r, i, arr) => arr.indexOf(r) === i
      );

      setRoutes(ordered);
      setShadows(data.scored[0]?.shadowPolygons ?? []);
      const preferredRoute = preference === 'sun' ? sunniest : shadiest;
      setActiveRouteIdx(Math.max(0, ordered.indexOf(preferredRoute)));

      // scroll to map so user sees the route drawn
      setTimeout(scrollToMap, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }, [start, end, mode, time, preference]);

  const canSearch = start !== null && end !== null && !loading;

  return (
    /* On mobile: single column, map pinned at top. On desktop: two columns side-by-side */
    <div className="flex flex-col md:flex-row bg-gray-50" style={{ height: '100dvh' }} dir="rtl">

      {/* ── MAP ── top on mobile (order-1), left column on desktop (order-2 in RTL) */}
      <main
        ref={mapRef}
        className="order-1 md:order-2 relative shrink-0 md:shrink md:flex-1"
        style={{ height: '52dvh' }}
      >
        <Map
          routes={routes}
          activeRouteIdx={activeRouteIdx}
          start={start}
          end={end}
          shadows={shadows}
          onMapClick={handleMapClick}
        />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-xl p-2.5 shadow text-xs z-[400]" dir="rtl">
          <p className="font-semibold text-gray-700 mb-1">אגדה</p>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5"><span className="w-5 h-1.5 rounded bg-blue-500 inline-block" /> צל</span>
            <span className="flex items-center gap-1.5"><span className="w-5 h-1.5 rounded bg-yellow-400 inline-block" /> חלקי</span>
            <span className="flex items-center gap-1.5"><span className="w-5 h-1.5 rounded bg-orange-500 inline-block" /> שמש</span>
          </div>
        </div>
      </main>

      {/* ── SIDEBAR ── scrollable bottom panel on mobile (order-2), right column on desktop (order-1 in RTL) */}
      <aside
        className="order-2 md:order-1 md:w-80 md:flex-none flex flex-col bg-white shadow-xl z-10 overflow-y-auto min-h-0 flex-1"
      >
        {/* Header */}
        <div className="p-3 border-b bg-gradient-to-l from-blue-600 to-blue-800 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white">🌳 ניווט בצל</h1>
              <p className="text-blue-100 text-xs">מסלולים מוצלים לרגל ואופניים</p>
            </div>
            {/* Show-map button visible only on mobile */}
            <button
              onClick={scrollToMap}
              className="md:hidden text-white bg-white/20 rounded-lg px-2 py-1 text-xs font-medium"
            >
              🗺️ מפה
            </button>
          </div>
        </div>

        {/* Search inputs */}
        <div className="p-3 flex flex-col gap-2 border-b shrink-0">
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

        {/* Mode, preference & time */}
        <div className="p-3 border-b flex flex-col gap-2 shrink-0">
          <div className="flex gap-2">
            <button onClick={() => setMode('foot-walking')}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${mode === 'foot-walking' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
              🚶 רגל
            </button>
            <button onClick={() => setMode('cycling-regular')}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${mode === 'cycling-regular' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
              🚲 אופניים
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPreference('shade')}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${preference === 'shade' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
              🌳 העדף צל
            </button>
            <button onClick={() => setPreference('sun')}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${preference === 'sun' ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : 'border-gray-200 text-gray-600'}`}>
              ☀️ העדף שמש
            </button>
          </div>
          <TimeControl date={time} onChange={setTime} />
        </div>

        {/* Search button */}
        <div className="p-3 border-b shrink-0">
          <button
            onClick={findRoutes}
            disabled={!canSearch}
            className="w-full py-2.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '⏳ מחפש מסלולים...' : '🔍 מצא מסלולים מוצלים'}
          </button>
          {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
        </div>

        {/* Routes */}
        <RoutePanel
          routes={routes}
          activeIdx={activeRouteIdx}
          onSelect={(idx) => { setActiveRouteIdx(idx); scrollToMap(); }}
          loading={loading}
        />
      </aside>
    </div>
  );
}
