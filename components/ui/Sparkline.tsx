export function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 60;
  const h = 24;
  const coords = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / range) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" className="h-6 w-[60px] flex-none text-brand-blue">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}
