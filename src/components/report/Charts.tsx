// Charts follow the dataviz skill: single-series magnitude → one validated hue, no legend box,
// thin marks (≤24px bars, 4px rounded data-end, square at the baseline), same-ramp track,
// hairline solid grid, hover layer on every mark, and a table view for the trend chart.

import { useEffect, useId, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { clsx } from "clsx";
import { useTheme } from "@/lib/theme";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Resolve chart tokens to concrete colors (SVG presentation attributes don't resolve var()). */
export function useChartColors() {
  const { theme } = useTheme();
  const [c, setC] = useState(() => read());
  function read() {
    return {
      series: cssVar("--vh-chart-1") || "#0369a1",
      grid: cssVar("--vh-chart-grid") || "#e7eff5",
      axis: cssVar("--vh-muted-fg") || "#475569",
      surface: cssVar("--vh-surface") || "#ffffff",
      text: cssVar("--vh-fg-strong") || "#082f49",
    };
  }
  useEffect(() => setC(read()), [theme]);
  return c;
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  valueLabel?: string;
  hint?: string;
}

/** Horizontal bar list: label · bar · value. Values are text tokens, the bar carries magnitude. */
export function BarList({ rows, max, label }: { rows: BarRow[]; max: number; label: string }) {
  const id = useId();
  return (
    <ul className="space-y-3" aria-label={label}>
      {rows.map((r) => {
        const pct = Math.max(0, Math.min(100, (r.value / max) * 100));
        return (
          <li key={r.key} className="group relative" tabIndex={r.hint ? 0 : undefined} aria-describedby={r.hint ? `${id}-${r.key}` : undefined}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-fg-strong">{r.label}</span>
              <span className="font-semibold tabular-nums text-fg">{r.valueLabel ?? r.value}</span>
            </div>
            <div className="h-2.5 w-full rounded-r-[4px] bg-chart-track" aria-hidden="true">
              <div className="h-full rounded-r-[4px] bg-chart-1 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
            </div>
            {r.hint && (
              <div
                id={`${id}-${r.key}`}
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden max-w-xs rounded-lg border border-border-soft bg-surface px-3 py-2 text-xs text-fg shadow-pop group-hover:block group-focus-visible:block"
              >
                {r.hint}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Inline meter for dense tables (8px, rounded ends, same-ramp track). */
export function MiniMeter({ value, max = 100, label }: { value: number | null; max?: number; label: string }) {
  if (value === null || value === undefined) return <span className="text-sm text-muted-fg">—</span>;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2.5" title={`${label}: ${Math.round(value)}`}>
      <span className="w-8 text-right text-sm font-bold tabular-nums text-fg-strong">{Math.round(value)}</span>
      <div className="h-2 w-20 rounded-full bg-chart-track" aria-hidden="true">
        <div className="h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Hero number with a thin ring meter. */
export function ScoreRing({ value, label, sublabel, size = 132 }: { value: number; label: string; sublabel?: string; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--vh-chart-track)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--vh-chart-1)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} className="transition-[stroke-dasharray] duration-700 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-extrabold tabular-nums text-fg-strong">{Math.round(value)}</span>
          <span className="text-xs font-semibold text-muted-fg">/ 100</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-bold text-fg-strong">{label}</p>
      {sublabel && <p className="text-xs text-muted-fg">{sublabel}</p>}
    </div>
  );
}

export interface TrendPoint {
  id: string;
  date: string;
  label: string;
  value: number;
  role: string;
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="font-bold text-fg-strong">{p.label}</p>
      <p className="text-muted-fg">{p.role}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-fg-strong">{p.value} / 100</p>
    </div>
  );
}

/** Overall score across sessions: one series, one axis (0–100), crosshair tooltip, table view. */
export function TrendChart({ points, title }: { points: TrendPoint[]; title: string }) {
  const c = useChartColors();
  const [table, setTable] = useState(false);
  const data = useMemo(() => points, [points]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-fg-strong">{title}</h3>
        <button type="button" onClick={() => setTable((t) => !t)} className="rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-soft" aria-pressed={table}>
          {table ? "Show chart" : "View as table"}
        </button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto rounded-lg border border-border-soft">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted-fg">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 text-right font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-border-soft">
                  <td className="px-3 py-2">{p.label}</td>
                  <td className="px-3 py-2">{p.role}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-56 w-full" role="img" aria-label={`${title}: ${data.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />
              <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: c.axis, fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: c.axis, strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={c.series}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 4, fill: c.series, stroke: c.surface, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: c.series, stroke: c.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={clsx("rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-fg-strong", className)}>{children}</span>;
}
