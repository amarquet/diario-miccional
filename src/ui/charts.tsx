/**
 * Gráficos SVG simples, legíveis no iPhone.
 * - Barras finas (≤ 24 px), topo arredondado, grelha discreta.
 * - Tooltip ao passar o dedo/rato e ao navegar com as setas do teclado.
 * - Cada gráfico tem uma tabela equivalente ("Ver valores") — nunca só cor.
 */
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatNumber } from '../domain/format';

export type Tone = 'day' | 'night' | 'fluid';

export interface Column {
  key: string;
  axisLabel: string;
  value: number;
  tone: Tone;
  tooltipTitle: string;
  tooltipValue: string;
}

const W = 340;
const H = 186;
const M = { top: 22, right: 4, bottom: 24, left: 38 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

function niceMax(value: number): { max: number; step: number } {
  if (value <= 0) return { max: 100, step: 50 };
  const raw = value / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { max: Math.ceil(value / step) * step, step };
}

/** Barra com topo arredondado (4 px) e base recta. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

const toneClass: Record<Tone, string> = { day: 'mark-day', night: 'mark-night', fluid: 'mark-fluid' };

function useActive(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (count === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActive((a) => (a === null ? 0 : Math.min(count - 1, a + 1)));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((a) => (a === null ? count - 1 : Math.max(0, a - 1)));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };
  return { active, setActive, onKeyDown };
}

function YAxis({ max, step, unit }: { max: number; step: number; unit: string }) {
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  return (
    <g>
      {ticks.map((v) => {
        const y = M.top + PH - (v / max) * PH;
        return (
          <g key={v}>
            <line className={v === 0 ? 'axis' : 'grid'} x1={M.left} x2={W - M.right} y1={y} y2={y} />
            <text x={M.left - 6} y={y + 3.5} textAnchor="end">
              {formatNumber(v)}
            </text>
          </g>
        );
      })}
      <text x={M.left - 6} y={9} textAnchor="end">
        {unit}
      </text>
    </g>
  );
}

function Tooltip({ x, y, title, value }: { x: number; y: number; title: string; value: string }) {
  const left = Math.min(92, Math.max(8, (x / W) * 100));
  return (
    <div className="chart-tooltip" style={{ left: `${left}%`, top: `${(y / H) * 100}%` }} aria-hidden="true">
      <strong>{value}</strong>
      {title}
    </div>
  );
}

export function ColumnChart({
  columns,
  ariaLabel,
  unit = 'mL',
  bands = [],
  labelEvery = 1,
}: {
  columns: Column[];
  ariaLabel: string;
  unit?: string;
  /** Faixas sombreadas (período nocturno), em índices de coluna [from, to). */
  bands?: { from: number; to: number }[];
  labelEvery?: number;
}) {
  const { active, setActive, onKeyDown } = useActive(columns.length);
  const { max, step } = niceMax(Math.max(0, ...columns.map((c) => c.value)));
  const slot = PW / Math.max(1, columns.length);
  const barW = Math.max(2, Math.min(24, slot - 2));
  const xOf = (i: number) => M.left + i * slot + (slot - barW) / 2;
  const hOf = (v: number) => (v / max) * PH;
  const act = active !== null ? columns[active] : null;

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${ariaLabel}. Usa as setas para percorrer os valores.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {bands.map((b) => (
          <rect
            key={`${b.from}-${b.to}`}
            className="night-band"
            x={M.left + b.from * slot}
            y={M.top}
            width={(b.to - b.from) * slot}
            height={PH}
          />
        ))}
        <YAxis max={max} step={step} unit={unit} />
        {columns.map((c, i) => {
          const h = hOf(c.value);
          return (
            <g key={c.key}>
              <path className={toneClass[c.tone]} d={barPath(xOf(i), M.top + PH - h, barW, h)} opacity={active === null || active === i ? 1 : 0.55} />
              <rect
                className="hit"
                x={M.left + i * slot}
                y={M.top}
                width={slot}
                height={PH}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
              {c.axisLabel && i % labelEvery === 0 && (
                <text x={M.left + i * slot + slot / 2} y={H - 8} textAnchor="middle">
                  {c.axisLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {act && active !== null && (
        <Tooltip x={M.left + active * slot + slot / 2} y={M.top + PH - hOf(act.value)} title={act.tooltipTitle} value={act.tooltipValue} />
      )}
      <div className="visually-hidden" aria-live="polite">
        {act ? `${act.tooltipTitle}: ${act.tooltipValue}` : ''}
      </div>
    </div>
  );
}

export interface StackedDay {
  key: string;
  label: string;
  night: number;
  day: number;
}

/** Volume diurno vs nocturno por dia (colunas empilhadas com intervalo de 2 px). */
export function StackedDayChart({ days, ariaLabel }: { days: StackedDay[]; ariaLabel: string }) {
  const { active, setActive, onKeyDown } = useActive(days.length);
  const { max, step } = niceMax(Math.max(0, ...days.map((d) => d.night + d.day)));
  const slot = PW / Math.max(1, days.length);
  const barW = Math.min(44, slot * 0.5);
  const hOf = (v: number) => (v / max) * PH;
  const act = active !== null ? days[active] : null;

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${ariaLabel}. Usa as setas para percorrer os dias.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        <YAxis max={max} step={step} unit="mL" />
        {days.map((d, i) => {
          const x = M.left + i * slot + (slot - barW) / 2;
          const hn = hOf(d.night);
          const hd = hOf(d.day);
          const gap = hn > 0 && hd > 0 ? 2 : 0;
          const base = M.top + PH;
          return (
            <g key={d.key} opacity={active === null || active === i ? 1 : 0.55}>
              {hn > 0 && <rect className="mark-night" x={x} y={base - hn} width={barW} height={hn} />}
              {hd > 0 && <path className="mark-day" d={barPath(x, base - hn - gap - hd, barW, hd)} />}
              <text className="label-strong" x={x + barW / 2} y={base - hn - gap - hd - 4} textAnchor="middle">
                {formatNumber(d.night + d.day)}
              </text>
              <text x={M.left + i * slot + slot / 2} y={H - 8} textAnchor="middle">
                {d.label}
              </text>
              <rect className="hit" x={M.left + i * slot} y={M.top} width={slot} height={PH} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
            </g>
          );
        })}
      </svg>
      {act && active !== null && (
        <Tooltip
          x={M.left + active * slot + slot / 2}
          y={M.top + PH - hOf(act.night + act.day)}
          title={`${act.label}: diurno ${formatNumber(act.day)} mL`}
          value={`Nocturno ${formatNumber(act.night)} mL`}
        />
      )}
      <div className="visually-hidden" aria-live="polite">
        {act ? `${act.label}: nocturno ${act.night} mL, diurno ${act.day} mL` : ''}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { tone: Tone | 'band'; label: string }[] }) {
  const color: Record<Tone | 'band', string> = {
    day: 'var(--chart-day)',
    night: 'var(--chart-night)',
    fluid: 'var(--chart-fluid)',
    band: 'var(--night-wash)',
  };
  return (
    <div className="legend">
      {items.map((i) => (
        <span className="key" key={i.label}>
          <span className="swatch" style={{ background: color[i.tone], outline: i.tone === 'band' ? '1px solid var(--hairline)' : undefined }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  table,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  table: ReactNode;
}) {
  const id = useId();
  return (
    <figure className="card chart-card" aria-labelledby={id} style={{ margin: '0 0 0.75rem' }}>
      <h3 id={id}>{title}</h3>
      {subtitle && <p className="chart-sub">{subtitle}</p>}
      {children}
      <details className="disclosure table-toggle">
        <summary>Ver valores em tabela</summary>
        <div className="disclosure-body table-scroll">{table}</div>
      </details>
    </figure>
  );
}
