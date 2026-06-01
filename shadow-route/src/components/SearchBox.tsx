'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  placeholder: string;
  onResult: (lngLat: [number, number], name: string) => void;
}

export default function SearchBox({ placeholder, onResult }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&countrycodes=il&accept-language=he`, { headers: { 'Accept-Language': 'he' } });
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setOpen(true);
    } catch { setResults([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const select = (r: NominatimResult) => {
    setQuery(r.display_name.split(',')[0]);
    setOpen(false);
    setResults([]);
    onResult([parseFloat(r.lon), parseFloat(r.lat)], r.display_name);
  };

  return (
    <div className="relative">
      <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-blue-400">
        <span className="text-gray-400 ml-1">🔍</span>
        <input value={query} onChange={e => setQuery(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder={placeholder} className="flex-1 text-sm outline-none bg-transparent" dir="auto" />
        {loading && <span className="text-xs text-gray-400">...</span>}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {results.map(r => <li key={r.place_id} onMouseDown={() => select(r)} className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0" dir="auto">{r.display_name}</li>)}
        </ul>
      )}
    </div>
  );
}
