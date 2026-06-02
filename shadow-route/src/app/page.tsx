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

      {/* ── Floating search card ── */}
      <div className="absolute top-0 left-0 right-0 z-[600] p-3">
        <div className="bg-white/96 backdrop-blur-xl rounded-2xl shadow-2xl p-3 max-w-sm mx-auto border border-white/60">

          {/* Title + mode toggles */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-xl shadow-md">🌳</div>
              <div>
                <p className="font-bold text-gray-800 text-sm leading-snug">ניווט בצל</p>
                <p className="text-gray-400 text-[10px] leading-snug">מסלולים לרגל ואופניים · ישראל</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-px">
                <button onClick={() => setMode('foot-walking')}
                  className={`px-2.5 py-1 rounded-md text-base transition-all ${mode === 'foot-walking' ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}>🚶</button>
                <button onClick={() => setMode('cycling-regular')}
                  className={`px-2.5 py-1 rounded-md text-base transition-all ${mode === 'cycling-regular' ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}>🚲</button>
              </div>
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-px">
                <button onClick={() => setPreference('shade')}
                  className={`px-2.5 py-1 rounded-md text-base transition-all ${preference === 'shade' ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}>🌳</button>
                <button onClick={() => setPreference('sun')}
                  className={`px-2.5 py-1 rounded-md text-base transition-all ${preference === 'sun' ? 'bg-white shadow text-yellow-500' : 'text-gray-400'}`}>☀️</button>
              </div>
            </div>
          </div>

          {/* Origin input */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setClickMode('start')}
              className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${clickMode === 'start' ? 'border-green-500 bg-green-500' : 'border-green-400 bg-white'}`}>
              <div className={`w-2 h-2 rounded-full ${clickMode === 'start' ? 'bg-white' : 'bg-green-400'}`} />
            </button>
            <div className="flex-1">
              <SearchBox placeholder="נקודת מוצא..."
                onResult={(ll, name) => { setStart(ll); setStartName(name); setClickMode('end'); }} />
            </div>
          </div>

          {/* Destination input */}
          <div className="flex items-center gap-2 mb-2.5">
            <button onClick={() => setClickMode('end')}
              className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${clickMode === 'end' ? 'border-red-500 bg-red-500' : 'border-red-400 bg-white'}`}>
              <div className={`w-2 h-2 rounded-full ${clickMode === 'end' ? 'bg-white' : 'bg-red-400'}`} />
            </button>
            <div className="flex-1">
              <SearchBox placeholder="יעד..."
                onResult={(ll, name) => { setEnd(ll); setEndName(name); }} />
            </div>
          </div>

          {/* Confirmed selections */}
          {(startName || endName) && (
            <div className="bg-gray-50 rounded-xl px-2.5 py-2 mb-2.5 flex flex-col gap-1 text-xs">
              {startName && <span className="text-green-700 truncate">📍 {startName.split(',').slice(0, 2).join(',').trim()}</span>}
              {endName && <span className="text-red-600 truncate">🏁 {endName.split(',').slice(0, 2).join(',').trim()}</span>}
            </div>
          )}

          {/* Time + Search */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 overflow-hidden">
              <TimeControl date={time} onChange={setTime} />
            </div>
            <button onClick={findRoutes} disabled={!canSearch}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-sm px-4 py-2 rounded-xl transition-all shadow-md">
              {loading ? '⏳' : '🔍 חפש'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div
        className="absolute left-3 z-[400] bg-white/92 backdrop-blur-sm rounded-xl px-2.5 py-2 shadow-lg text-xs transition-all duration-300"
        style={{ bottom: showSheet ? 'calc(42dvh + 10px)' : '10px' }}
        dir="rtl"
      >
        <p className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">מסלול</p>
        <div className="flex flex-col gap-1 text-gray-700">
          <span className="flex items-center gap-1.5"><span className="w-5 h-2 rounded-full bg-blue-500 inline-block" />צל</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-2 rounded-full bg-yellow-400 inline-block" />חלקי</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-2 rounded-full bg-orange-500 inline-block" />שמש</span>
        </div>
      </div>

      {/* ── Bottom sheet (results) ── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[500] transition-transform duration-300 ease-out"
        style={{ transform: showSheet ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Inner card — relative so the ✕ button positions within it */}
        <div className="relative bg-white rounded-t-3xl shadow-2xl" style={{ maxHeight: '42dvh' }}>

          {/* Header */}
          <div className="flex items-center justify-center pt-3 pb-2 px-12">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>
          <button
            onClick={() => setSheetOpen(false)}
            aria-label="סגור"
            className="absolute top-2.5 left-4 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm transition-all z-10"
          >✕</button>

          {/* Scrollable content */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(42dvh - 44px)' }}>
            {error && (
              <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
                {error}
              </div>
            )}
            <RoutePanel
              routes={routes}
              activeIdx={activeRouteIdx}
              onSelect={setActiveRouteIdx}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
