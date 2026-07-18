// components/overview/UsageTrendChart.tsx
//
// 30-day call-volume trend. Tremor is not installed in this Tailwind v4
// project, so this is a self-contained SVG AreaChart that matches the
// Voicerely design spec: Electric Amber (#FF6B00) line + gradient fill,
// dark surface, muted axis labels (dashboard.md §1.4 / §4.4).
//
// Accepts `data` (day -> calls) so it renders dynamic quantities fetched
// from /api/calls. Falls back to an empty series while loading.

export interface TrendPoint {
  day: number;
  calls: number;
}

const W = 720;
const H = 240;
const PAD_X = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

export function UsageTrendChart({ data }: { data: TrendPoint[] }) {
  const series = data.length ? data : [{ day: 1, calls: 0 }];
  const maxCalls = Math.max(1, ...series.map((d) => d.calls));
  const n = series.length;

  const pts = series.map((d, i) => {
    const x = PAD_X + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD_X * 2));
    const y = PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) - (d.calls / maxCalls) * (H - PAD_TOP - PAD_BOTTOM);
    return { x, y };
  });

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x},${H - PAD_BOTTOM} L${pts[0].x},${H - PAD_BOTTOM} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-64"
        preserveAspectRatio="none"
        role="img"
        aria-label="Call volume over the last 30 days"
      >
        <defs>
          <linearGradient id="amberFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FF6B00" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {[0.25, 0.5, 0.75].map((g) => {
          const y = PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * g;
          return (
            <line key={g} x1={PAD_X} x2={W - PAD_X} y1={y} y2={y} stroke="#2A2A2E" strokeWidth={1} />
          );
        })}

        {/* Area + line in Electric Amber.
            vectorEffect keeps the stroke width uniform even though the SVG is
            stretched to the container width via preserveAspectRatio="none". */}
        <path d={area} fill="url(#amberFill)" />
        <path
          d={line}
          fill="none"
          stroke="#FF6B00"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* End-point marker */}
        <circle
          cx={pts[pts.length - 1].x}
          cy={pts[pts.length - 1].y}
          r={3.5}
          fill="#FF6B00"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* X-axis labels */}
      <div className="flex justify-between px-2 text-xs text-muted tabular-nums">
        {[1, 8, 15, 22, 30].map((d) => (
          <span key={d}>Day {d}</span>
        ))}
      </div>
    </div>
  );
}
