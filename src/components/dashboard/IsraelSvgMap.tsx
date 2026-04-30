import { useState } from 'react';
import { DEMO_DISTRICTS } from '@/lib/demoData';
import { Compass, Ruler } from 'lucide-react';

// Choropleth tiers mapped to Kalpiz HSL semantic tokens.
const choroplethColors = {
  green: { fill: 'hsl(var(--success))', border: 'hsl(var(--success))', glow: 'hsl(var(--success) / 0.4)' },
  yellow: { fill: 'hsl(var(--brand-blue))', border: 'hsl(var(--brand-blue))', glow: 'hsl(var(--brand-blue) / 0.4)' },
  orange: { fill: 'hsl(var(--warning))', border: 'hsl(var(--warning))', glow: 'hsl(var(--warning) / 0.4)' },
  red: { fill: 'hsl(var(--destructive))', border: 'hsl(var(--destructive))', glow: 'hsl(var(--destructive) / 0.4)' },
};

function geo(lng: number, lat: number): [number, number] {
  return [(lng - 34.0) * 200, (33.4 - lat) * 200];
}

function pathFromCoords(coords: [number, number][]): string {
  return coords.map(([lng, lat], i) => {
    const [x, y] = geo(lng, lat);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

const districtPaths: { id: string; coords: [number, number][]; labelPos: [number, number] }[] = [
  {
    id: 'north',
    coords: [
      [35.10, 33.28], [35.20, 33.30], [35.40, 33.25], [35.62, 33.25],
      [35.80, 33.08], [35.85, 32.95], [35.80, 32.75], [35.70, 32.65],
      [35.55, 32.55], [35.45, 32.45], [35.30, 32.42], [35.10, 32.45],
      [35.00, 32.50], [34.95, 32.60], [34.95, 32.75], [35.00, 32.90],
      [35.00, 33.05], [35.05, 33.15],
    ],
    labelPos: [35.35, 32.85],
  },
  {
    id: 'haifa',
    coords: [
      [34.85, 32.90], [34.95, 32.90], [35.00, 32.90], [35.05, 33.15],
      [35.10, 33.28], [34.92, 33.10], [34.85, 32.95],
      [34.82, 32.85], [34.80, 32.75], [34.82, 32.65],
      [34.88, 32.55], [34.95, 32.50], [35.00, 32.50],
      [35.10, 32.45], [35.05, 32.38], [34.95, 32.35],
      [34.88, 32.38], [34.82, 32.42], [34.80, 32.50],
      [34.78, 32.60], [34.80, 32.75],
    ],
    labelPos: [34.95, 32.75],
  },
  {
    id: 'center',
    coords: [
      [34.82, 32.42], [34.88, 32.38], [34.95, 32.35],
      [35.05, 32.38], [35.10, 32.35], [35.15, 32.25],
      [35.20, 32.15], [35.20, 32.05], [35.15, 31.95],
      [35.05, 31.90], [34.95, 31.88], [34.85, 31.88],
      [34.80, 31.92], [34.78, 32.00], [34.75, 32.10],
      [34.75, 32.20], [34.78, 32.30], [34.80, 32.38],
    ],
    labelPos: [34.95, 32.12],
  },
  {
    id: 'tel-aviv',
    coords: [
      [34.75, 32.20], [34.78, 32.20], [34.80, 32.15],
      [34.82, 32.10], [34.82, 32.05], [34.80, 32.00],
      [34.78, 31.98], [34.75, 31.98], [34.72, 32.00],
      [34.70, 32.05], [34.70, 32.10], [34.72, 32.15],
    ],
    labelPos: [34.76, 32.08],
  },
  {
    id: 'jerusalem',
    coords: [
      [35.05, 31.90], [35.15, 31.95], [35.20, 32.00],
      [35.28, 31.95], [35.35, 31.88], [35.40, 31.80],
      [35.38, 31.70], [35.30, 31.62], [35.22, 31.58],
      [35.10, 31.60], [35.00, 31.65], [34.95, 31.72],
      [34.92, 31.80], [34.95, 31.88],
    ],
    labelPos: [35.18, 31.78],
  },
  {
    id: 'judea-samaria',
    coords: [
      [35.10, 32.45], [35.30, 32.42], [35.45, 32.45],
      [35.55, 32.40], [35.58, 32.30], [35.55, 32.15],
      [35.50, 32.00], [35.45, 31.88], [35.40, 31.80],
      [35.35, 31.88], [35.28, 31.95], [35.20, 32.00],
      [35.20, 32.05], [35.20, 32.15], [35.15, 32.25],
      [35.10, 32.35], [35.05, 32.38],
    ],
    labelPos: [35.35, 32.15],
  },
  {
    id: 'south',
    coords: [
      [34.70, 32.00], [34.72, 32.00], [34.75, 31.98],
      [34.78, 31.98], [34.80, 31.92], [34.85, 31.88],
      [34.95, 31.88], [35.00, 31.65], [35.10, 31.60],
      [35.22, 31.58], [35.30, 31.62], [35.38, 31.50],
      [35.45, 31.35], [35.48, 31.15], [35.45, 30.95],
      [35.40, 30.75], [35.35, 30.55], [35.25, 30.35],
      [35.15, 30.15], [35.00, 29.95], [34.95, 29.75],
      [34.96, 29.55], [34.95, 29.50], [34.88, 29.50],
      [34.65, 29.80], [34.50, 30.10], [34.40, 30.40],
      [34.35, 30.65], [34.32, 30.90], [34.30, 31.15],
      [34.35, 31.35], [34.42, 31.50], [34.50, 31.65],
      [34.58, 31.78], [34.65, 31.90],
    ],
    labelPos: [34.80, 30.80],
  },
];

const cityHotspots = [
  { id: 'tel-aviv', label: 'תל אביב', lng: 34.78, lat: 32.08 },
  { id: 'jerusalem', label: 'ירושלים', lng: 35.22, lat: 31.77 },
  { id: 'haifa', label: 'חיפה', lng: 34.99, lat: 32.82 },
  { id: 'beer-sheva', label: 'באר שבע', lng: 34.79, lat: 31.25 },
  { id: 'rishon', label: 'ראשון לציון', lng: 34.79, lat: 31.97 },
];

interface IsraelSvgMapProps {
  selectedDistrict: string | null;
  onDistrictClick: (districtId: string | null) => void;
  /** 0-1 intensity multiplier that pulses with the demo ticker */
  tickerPulse?: number;
}

export function IsraelSvgMap({ selectedDistrict, onDistrictClick, tickerPulse = 0 }: IsraelSvgMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const handleClick = (id: string) => {
    onDistrictClick(selectedDistrict === id ? null : id);
  };

  return (
    <div className="relative w-full rounded-xl p-3 overflow-hidden bg-slate-950/40 backdrop-blur-md border border-white/[0.06]" style={{ maxHeight: 540 }}>
      <svg viewBox="-10 -10 400 820" className="w-full h-full" style={{ maxHeight: 510 }}>
        <defs>
          {Object.entries(choroplethColors).map(([key, { glow }]) => (
            <filter key={key} id={`glow-${key}`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feFlood floodColor={glow} floodOpacity="0.5" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          ))}
          <filter id="selected-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feFlood floodColor="hsl(var(--primary))" floodOpacity="0.5" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="water" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#0c1929" />
            <line x1="0" y1="4" x2="8" y2="4" stroke="#1e3a5f" strokeWidth="0.3" opacity="0.4" />
          </pattern>
        </defs>

        {/* Mediterranean */}
        <rect x="-30" y="-30" width="170" height="860" fill="url(#water)" />
        <text x="30" y="400" fill="#1e3a5f" fontSize="14" fontWeight="300" opacity="0.4"
          transform="rotate(-90, 30, 400)" textAnchor="middle" className="select-none">הים התיכון</text>

        {/* Grid */}
        <g opacity="0.04" stroke="hsl(var(--primary))">
          {Array.from({ length: 18 }).map((_, i) => (
            <line key={`h-${i}`} x1="-10" y1={i * 50} x2="390" y2={i * 50} strokeWidth="0.5" />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`v-${i}`} x1={i * 50} y1="-10" x2={i * 50} y2="810" strokeWidth="0.5" />
          ))}
        </g>

        {/* Districts */}
        {districtPaths.map(d => {
          const info = DEMO_DISTRICTS[d.id];
          if (!info) return null;
          const colors = choroplethColors[info.color];
          const isHov = hovered === d.id;
          const isSel = selectedDistrict === d.id;
          const pct = Math.round((info.supporters / info.totalVoters) * 100);
          const [lx, ly] = geo(d.labelPos[0], d.labelPos[1]);

          // Dynamic opacity boost from ticker pulse
          const pulseBoost = tickerPulse * (info.intensity / 100) * 0.15;
          const baseOpacity = isSel ? 0.55 : isHov ? 0.4 : 0.2;

          return (
            <g key={d.id} onMouseEnter={() => setHovered(d.id)} onMouseLeave={() => setHovered(null)}
              onClick={() => handleClick(d.id)} className="cursor-pointer">
              <path d={pathFromCoords(d.coords)} fill={colors.fill}
                fillOpacity={baseOpacity + pulseBoost}
                stroke={isSel ? 'hsl(var(--primary))' : colors.border}
                strokeWidth={isSel ? 2.5 : isHov ? 2 : 0.8}
                strokeOpacity={isSel ? 1 : 0.5}
                filter={isSel ? 'url(#selected-glow)' : isHov ? `url(#glow-${info.color})` : undefined}
                className="transition-all duration-700" />
              <text x={lx} y={ly - 10} textAnchor="middle" dominantBaseline="middle"
                fill={isSel ? 'hsl(var(--primary))' : '#e2e8f0'}
                fontSize={d.id === 'south' ? 13 : isHov || isSel ? 12 : 10}
                fontWeight={isSel ? 800 : isHov ? 700 : 500}
                className="pointer-events-none select-none" direction="rtl">{info.label}</text>
              <text x={lx} y={ly + 5} textAnchor="middle" fill={colors.fill}
                fontSize={9} fontWeight={600} opacity={isHov || isSel ? 1 : 0.7}
                className="pointer-events-none select-none">{pct}% תמיכה</text>
              {(isHov || isSel) && (
                <text x={lx} y={ly + 20} textAnchor="middle" fill="#94a3b8" fontSize={8}
                  className="pointer-events-none select-none animate-fade-in">
                  {info.supporters.toLocaleString()} / {info.totalVoters.toLocaleString()}
                </text>
              )}
            </g>
          );
        })}

        {/* City radar pulses */}
        {cityHotspots.map(city => {
          const [cx, cy] = geo(city.lng, city.lat);
          const pulseRadius = 20 + tickerPulse * 6;
          return (
            <g key={city.id} className="pointer-events-none">
              {/* Outer radar ring */}
              <circle cx={cx} cy={cy} r="3" fill="none" stroke="hsl(var(--primary))" strokeWidth="1">
                <animate attributeName="r" values={`3;${pulseRadius}`} dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0" dur="2.5s" repeatCount="indefinite" />
              </circle>
              {/* Inner radar ring */}
              <circle cx={cx} cy={cy} r="3" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.8">
                <animate attributeName="r" values={`2;${pulseRadius * 0.7}`} dur="2.5s" begin="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0" dur="2.5s" begin="1.2s" repeatCount="indefinite" />
              </circle>
              {/* Center dot */}
              <circle cx={cx} cy={cy} r="3.5" fill="hsl(var(--primary))">
                <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
              </circle>
              {/* City label */}
              <text x={cx} y={cy - 14} textAnchor="middle" fill="hsl(var(--primary))"
                fontSize={9} fontWeight={700} className="select-none" direction="rtl">{city.label}</text>
            </g>
          );
        })}

        {/* Eilat */}
        {(() => {
          const [ex, ey] = geo(34.95, 29.52);
          return <text x={ex} y={ey - 5} textAnchor="middle" fill="#64748b" fontSize={7} className="select-none pointer-events-none">אילת ▾</text>;
        })()}
      </svg>

      {/* Compass */}
      <div className="absolute top-3 left-3 flex flex-col items-center gap-0.5 text-slate-500">
        <Compass className="h-5 w-5" />
        <span className="text-[8px] font-medium tracking-widest">N</span>
      </div>

      {/* Scale */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-slate-500">
        <Ruler className="h-3.5 w-3.5" />
        <div className="flex items-center gap-1">
          <div className="w-10 h-[2px] bg-slate-500 rounded" />
          <span className="text-[8px]">50 km</span>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 flex gap-3 text-[9px] text-slate-400 bg-slate-900/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/[0.06]">
        {(['green', 'yellow', 'orange', 'red'] as const).map(c => (
          <span key={c} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: choroplethColors[c].fill, boxShadow: `0 0 6px ${choroplethColors[c].glow}` }} />
            {{ green: 'תמיכה גבוהה', yellow: 'ניתן לשכנוע', orange: 'בינוני', red: 'זירת קרב' }[c]}
          </span>
        ))}
      </div>

      {/* Selected info */}
      {selectedDistrict && DEMO_DISTRICTS[selectedDistrict] && (
        <div className="absolute top-3 right-3 bg-slate-900/90 backdrop-blur-sm border border-primary/30 rounded-lg px-3 py-2 text-right animate-fade-in" dir="rtl">
          <p className="text-xs font-bold text-primary">{DEMO_DISTRICTS[selectedDistrict].label}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {DEMO_DISTRICTS[selectedDistrict].supporters.toLocaleString()} תומכים מתוך {DEMO_DISTRICTS[selectedDistrict].totalVoters.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">{DEMO_DISTRICTS[selectedDistrict].cities.join(' · ')}</p>
          <button onClick={(e) => { e.stopPropagation(); onDistrictClick(null); }}
            className="text-[9px] text-primary/60 hover:text-primary mt-1 underline">הצג הכל</button>
        </div>
      )}
    </div>
  );
}
