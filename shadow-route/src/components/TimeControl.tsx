'use client';

interface Props { date: Date; onChange: (d: Date) => void; }

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TimeControl({ date, onChange }: Props) {
  return (
    <div className="flex items-center gap-2" dir="rtl">
      <span className="text-sm text-gray-600 whitespace-nowrap">זמן חישוב:</span>
      <input type="datetime-local" value={toLocalInput(date)} onChange={e => onChange(new Date(e.target.value))} className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400" />
      <button onClick={() => onChange(new Date())} className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap">עכשיו</button>
    </div>
  );
}
