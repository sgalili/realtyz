import { useEffect, useRef } from 'react';

interface LivePulseProps {
  value?: number; // 0-100 intensity
  label?: string;
}

export function LivePulse({ value = 50, label = 'פעילות חיה' }: LivePulseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resolve CSS variable to a real color the Canvas API can use
    const rootStyles = getComputedStyle(document.documentElement);
    const primaryHSL = rootStyles.getPropertyValue('--primary').trim(); // e.g. "48 96% 53%"
    const [pH, pS, pL] = primaryHSL.split(/\s+/);
    const primaryColor = `hsl(${pH}, ${pS}, ${pL})`;
    const primaryAlpha = (a: number) => `hsla(${pH}, ${pS}, ${pL}, ${a})`;

    const w = canvas.width;
    const h = canvas.height;
    const amplitude = (value / 100) * (h / 3);
    
    const draw = () => {
      offsetRef.current += 0.03;
      ctx.clearRect(0, 0, w, h);

      // Gradient line
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, primaryAlpha(0.2));
      grad.addColorStop(0.5, primaryColor);
      grad.addColorStop(1, primaryAlpha(0.2));

      ctx.beginPath();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';

      for (let x = 0; x < w; x++) {
        const y = h / 2 + 
          Math.sin((x / w) * 4 * Math.PI + offsetRef.current) * amplitude * 0.6 +
          Math.sin((x / w) * 7 * Math.PI + offsetRef.current * 1.5) * amplitude * 0.3 +
          Math.sin((x / w) * 11 * Math.PI + offsetRef.current * 0.7) * amplitude * 0.1;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Glow
      ctx.beginPath();
      ctx.strokeStyle = primaryAlpha(0.15);
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      for (let x = 0; x < w; x++) {
        const y = h / 2 + 
          Math.sin((x / w) * 4 * Math.PI + offsetRef.current) * amplitude * 0.6 +
          Math.sin((x / w) * 7 * Math.PI + offsetRef.current * 1.5) * amplitude * 0.3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">חי</span>
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={80}
        className="w-full h-[80px] rounded-lg bg-muted/30"
      />
    </div>
  );
}
