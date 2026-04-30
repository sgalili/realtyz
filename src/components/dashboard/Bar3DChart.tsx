import { useMemo } from 'react';

interface Bar3DProps {
  data: { label: string; value: number; color: string }[];
  height?: number;
}

export function Bar3DChart({ data, height = 200 }: Bar3DProps) {
  const max = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);

  return (
    <div className="flex items-end gap-3 justify-around" style={{ height }}>
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * (height - 40), 4);
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <span className="text-xs font-bold text-foreground">{d.value}</span>
            <div className="relative w-full max-w-[40px]">
              {/* 3D shadow */}
              <div
                className="absolute inset-0 rounded-t-md opacity-30"
                style={{
                  height: barH,
                  background: d.color,
                  transform: 'translate(3px, 3px)',
                  filter: 'blur(2px)',
                  bottom: 0,
                  top: 'auto',
                }}
              />
              {/* Main bar */}
              <div
                className="relative rounded-t-md transition-all duration-700 ease-out"
                style={{
                  height: barH,
                  background: `linear-gradient(180deg, ${d.color}, ${d.color}dd)`,
                  boxShadow: `inset -4px 0 8px rgba(255,255,255,0.15), inset 4px 0 8px rgba(0,0,0,0.1), 0 -2px 10px ${d.color}44`,
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}
