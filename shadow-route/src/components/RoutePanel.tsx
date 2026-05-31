'use client';

import type { ScoredRoute } from '@/app/api/shade/route';
import { formatDistance, formatDuration } from '@/lib/routing';

interface Props {
  routes: ScoredRoute[];
  activeIdx: number;
  onSelect: (idx: number) => void;
  loading: boolean;
}

function ShadeBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'bg-blue-500' : pct >= 35 ? 'bg-yellow-400' : 'bg-orange-500';
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-10 text-right">{pct}% צל</span>
    </div>
  );
}

const ROUTE_NAMES = ['מהיר', 'מוצל', 'שמשי'];
const ROUTE_LABELS = ['⚡', '🌳', '☀️'];

export default function RoutePanel({ routes, activeIdx, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!routes.length) {
    return (
      <div className="p-4 text-gray-500 text-sm text-center">
        בחר נקודות מוצא ויעד על המפה
      </div>
    );
  }

  const shadiest = [...routes].sort((a, b) => b.shadeScore - a.shadeScore)[0];
  const sunniest = [...routes].sort((a, b) => a.shadeScore - b.shadeScore)[0];

  return (
    <div className="flex flex-col gap-2 p-3" dir="rtl">
      <p className="text-xs text-gray-500 px-1">לחץ על מסלול להצגה על המפה</p>
      {routes.map((route, idx) => {
        const isActive = idx === activeIdx;
        const isShadiest = route === shadiest;
        const isSunniest = route === sunniest && sunniest !== shadiest;
        const shadePct = Math.round(route.shadeScore * 100);

        return (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            className={`w-full text-right rounded-xl p-3 border-2 transition-all ${
              isActive
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{ROUTE_LABELS[idx] ?? '🗺️'}</span>
                <span className="font-semibold text-gray-800">{ROUTE_NAMES[idx] ?? `מסלול ${idx + 1}`}</span>
                {isShadiest && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">הכי מוצל</span>
                )}
                {isSunniest && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">הכי שמשי</span>
                )}
              </div>
              <div className="text-xs text-gray-500 flex gap-3">
                <span>{formatDistance(route.distance)}</span>
                <span>{formatDuration(route.duration)}</span>
              </div>
            </div>
            <ShadeBar score={route.shadeScore} />
            <p className="text-xs text-gray-400 mt-1">
              {shadePct >= 70 ? 'רוב המסלול בצל' : shadePct >= 35 ? 'חלקית מוצל' : 'חשיפה גבוהה לשמש'}
            </p>
          </button>
        );
      })}

      <div className="mt-2 px-1 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-500 inline-block"/> צל</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-yellow-400 inline-block"/> חלקי</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-orange-500 inline-block"/> שמש</span>
      </div>
    </div>
  );
}
