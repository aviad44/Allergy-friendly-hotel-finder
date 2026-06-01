'use client';

import { useState, useCallback } from 'react';
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
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleMapClick = useCallback((lngLat: [number, number]) => {
    if (clickMode === 'start') {
      setStart(lngLat);
      setStartName(`${lngLat[1].toFixed(4)}, ${lngLat[0].toFixed(4)}`);
      setClickMode('end');
    } else {
      setEnd(lngLat);
      setEndName(`${lngLat[1].toFixed(4)}, ${lngLat[0].toFixed(4)}`);
    }
  }, [clickMode]);

  const findRoutes = useCallback(async () => {
    if (!start || !end) return;
    setLoading(true);
    setSheetOpen(true);
    setError(null);
    setRoutes([]);

    try {
      const rawRoutes = await fetchAlternativeRoutes(start, end, mode);

      const res = await fetch('/api/shade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: rawRoutes, time: time.toISOString(), includeShadows: true }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const scored: ScoredRoute[] = data.scored;
      const shadiest = [...scored].sort((a, b) => b.shadeScore - a.shadeScore)[0];
      const sunniest = [...scored].sort((a, b) => a.shadeScore - b.shadeScore)[0];
      const fastest = [...scored].sort((a, b) => a.duration - b.duration)[0];
      const ordered = [fastest, shadiest, sunniest].filter((r, i, arr) => arr.indexOf(r) === i);

      setRoutes(ordered);
      setShadows(data.scored[0]?.shadowPolygons ?? []);
      const preferred = preference === 'sun' ? sunniest : shadiest;
      setActiveRouteIdx(Math.max(0, ordered.indexOf(preferred)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }, [start, end, mode, time, preference]);

  const canSearch = start !== null && end !== null && !loading;
  const showSheet = sheetOpen && (loading || routes.length > 0 || !!error);

  return (
    <div className="relative overflow-hidden" style={{ height: '100dvh', width: '100vw' }} dir="rtl">

      {/* ── Full-screen map ── */}
      <div className="absolute inset-0 z-0">
        <Map
          routes={routes}
          activeRouteIdx={activeRouteIdx}
          start={start}
          end={end}
          shadows={shadows}
          onMapClick={handleMapClick}
        />
      </div>

      {/* ── Floating search panel (top) ── */}
      <div className="absolute top-0 left-0 right-0 z-[500] p-3 pointer-events-none">
        <div
          className="bg-white/96 backdrop-blur-md rounded-2xl shadow-2xl p-3 pointer-events-auto w-full max-w-md mx-auto"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          {/* Logo row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌳</span>
              <div>
                <p className="font-bold text-gray-800 text-base leading-tight">ניווט בצל</p>
                <p className="text-gray-400 text-[11px] leading-tight">מסלולים מוצלים לרגל ואופניים</p>
              </div>
            </div>
            {/* Mode + preference chips */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => setMode('foot-walking')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${mode === 'foot-walking' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                🚶
              </button>
              <button onClick={() => setMode('cycling-regular')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${mode === 'cycling-regular' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                🚲
              </button>
              <div className="w-px h-4 bg-gray-200" />
              <button onClick={() => setPreference('shade')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${preference === 'shade' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-500 border-gray-200'}`}>
                🌳
              </button>
              <button onClick={() => setPreference('sun')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${preference === 'sun' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : 'bg-white text-gray-500 border-gray-200'}`}>
                ☀️
              </button>
            </div>
          </div>

          {/* Search inputs */}
          <div className="flex flex-col gap-2 mb-2">
            <div className="flex items-center gap-2">
              <button onClick={() => setClickMode('start')}
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 transition-all ${clickMode === 'start' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}
                title="לחץ על המפה להגדרת מוצא">
                📍
              </button>
              <div className="flex-1">
                <SearchBox
                  placeholder="נקודת מוצא..."
                  onResult={(ll, name) => { setStart(ll); setStartName(name); setClickMode('end'); }}
                />
              </div>
            </div>

            {/* Divider line */}
            <div className="flex items-center gap-2 px-1">
              <div className="mr-[30px] border-r-2 border-dashed border-gray-300 h-3" />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setClickMode('end')}
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 transition-all ${clickMode === 'end' ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}`}
                title="לחץ על המפה להגדרת יעד">
                🏁
              </button>
              <div className="flex-1">
                <SearchBox
                  placeholder="יעד..."
                  onResult={(ll, name) => { setEnd(ll); setEndName(name); }}
                />
              </div>
            </div>
          </div>

          {/* Confirmations */}
          {(startName || endName) && (
            <div className="flex gap-3 text-xs mb-2 px-1">
              {startName && <span className="text-green-600 truncate flex-1">✓ {startName.split(',')[0]}</span>}
              {endName && <span className="text-red-500 truncate flex-1">✓ {endName.split(',')[0]}</span>}
            </div>
          )}

          {/* Time + Search button row */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <TimeControl date={time} onChange={setTime} />
            </div>
            <button
              onClick={findRoutes}
              disabled={!canSearch}
              className="shrink-0 px-4 py-2 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {loading ? '⏳' : '🔍 חפש'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Map legend (bottom-left, above bottom sheet) ── */}
      <div
        className="absolute left-3 z-[400] bg-white/90 backdrop-blur-sm rounded-xl p-2.5 shadow text-xs transition-all duration-300"
        style={{ bottom: showSheet ? 'calc(42dvh + 12px)' : '12px' }}
        dir="rtl"
      >
        <p className="font-semibold text-gray-600 mb-1 text-[11px]">צבעי מסלול</p>
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5"><span className="w-5 h-2 rounded bg-blue-500 inline-block" /> צל</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-2 rounded bg-yellow-400 inline-block" /> חלקי</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-2 rounded bg-orange-500 inline-block" /> שמש</span>
        </div>
      </div>

      {/* ── Bottom sheet (results) ── */}
      <div
        className="absolute left-0 right-0 bottom-0 z-[500] transition-transform duration-300 ease-out"
        style={{ transform: showSheet ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div
          className="bg-white rounded-t-3xl shadow-2xl overflow-y-auto w-full max-w-md mx-auto"
          style={{ maxHeight: '42dvh' }}
        >
          {/* Drag handle + close */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto" />
          </div>
          <button
            onClick={() => setSheetOpen(false)}
            className="absolute top-3 left-4 text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>

          {error && <p className="text-red-500 text-sm text-center px-4 pb-3">{error}</p>}

          <RoutePanel
            routes={routes}
            activeIdx={activeRouteIdx}
            onSelect={setActiveRouteIdx}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
