/** Cronologia de um dia do diário: levantar → dia → noite → levantar. */
import type { ClassifiedUrineEvent } from '../domain/clinical';
import type { FluidEvent } from '../domain/types';
import {
  AWAKENING_SHORT_LABELS,
  BEVERAGE_EMOJI,
  LEAKAGE_LABELS,
  SYMPTOM_LABELS,
  URGENCY_SHORT_LABELS,
  beverageLabel,
} from '../domain/labels';
import { formatMl } from '../domain/format';
import { toHHMM } from '../domain/time';
import { useStore, type PeriodView } from '../app/store';
import { useEventSheets } from './sheets/EventSheets';

type Row =
  | { type: 'fluid'; t: number; fluid: FluidEvent }
  | { type: 'urine'; t: number; c: ClassifiedUrineEvent }
  | { type: 'marker'; t: number; label: string; icon: string };

export function Timeline({ view, dayIndex }: { view: PeriodView; dayIndex: number }) {
  const { state } = useStore();
  const sheets = useEventSheets();
  const { summary } = view;
  const bucket = summary.buckets[dayIndex];
  if (!bucket) return null;
  const w = bucket.window;
  const isLast = dayIndex === summary.windows.length - 1;
  const threshold = state.settings.urgencyThreshold;

  const now = Date.now();
  const rows: Row[] = [
    { type: 'marker', t: w.wakeAt, icon: '☀️', label: w.estimated.wake ? 'Levantar (hora habitual, não registada)' : 'Levantou-se' },
    ...bucket.fluids.map((fluid) => ({ type: 'fluid' as const, t: fluid.timestamp, fluid })),
    ...bucket.urine.map((c) => ({ type: 'urine' as const, t: c.event.timestamp, c })),
  ];
  if (!w.estimated.bed || now >= w.bedAt || rows.some((r) => r.t >= w.bedAt)) {
    rows.push({ type: 'marker', t: w.bedAt, icon: '🌙', label: w.estimated.bed ? 'Deitar (hora habitual, não registada)' : 'Deitou-se' });
  }
  // Eventos antes do início (1.º dia) e na manhã seguinte ao último dia.
  if (dayIndex === 0) {
    for (const c of summary.classified.filter((x) => x.placement === 'before')) rows.push({ type: 'urine', t: c.event.timestamp, c });
    for (const f of view.fluids.filter((f) => f.timestamp < w.wakeAt)) rows.push({ type: 'fluid', t: f.timestamp, fluid: f });
  }
  if (isLast) {
    if (now >= w.nextWakeAt || summary.classified.some((x) => x.placement === 'after')) {
      rows.push({
        type: 'marker',
        t: w.nextWakeAt,
        icon: '☀️',
        label: w.estimated.nextWake ? 'Levantar (hora habitual, não registada)' : 'Levantou-se — fim do diário',
      });
    }
    for (const c of summary.classified.filter((x) => x.placement === 'after')) rows.push({ type: 'urine', t: c.event.timestamp, c });
    for (const f of view.fluids.filter((f) => f.timestamp >= w.nextWakeAt)) rows.push({ type: 'fluid', t: f.timestamp, fluid: f });
  } else if (now >= w.nextWakeAt) {
    rows.push({ type: 'marker', t: w.nextWakeAt, icon: '☀️', label: 'Levantou-se (dia seguinte)' });
  }

  const order = (r: Row) => (r.type === 'marker' ? (r.icon === '🌙' ? 0 : r.t === w.wakeAt ? -1 : 1) : 0);
  rows.sort((a, b) => a.t - b.t || order(a) - order(b));

  const hasEvents = rows.some((r) => r.type !== 'marker');

  return (
    <ul className="timeline" aria-label="Registos do dia">
      {rows.map((r) => {
        const inNight = r.t >= w.bedAt && r.t < w.nextWakeAt;
        const outside = r.t < w.wakeAt || (r.t >= w.nextWakeAt && r.type !== 'marker' && !(r.type === 'urine' && r.c.isFirstMorningVoid));
        const cls = [inNight && 'tl-night', outside && 'tl-outside'].filter(Boolean).join(' ') || undefined;

        if (r.type === 'marker') {
          return (
            <li key={`m-${r.t}-${r.icon}`} className={r.icon === '🌙' ? 'tl-night' : undefined}>
              <div className="tl-marker">
                <span className="tl-time">{toHHMM(r.t)}</span>
                <span aria-hidden="true">{r.icon}</span>
                <span>
                  {r.label}
                  {r.icon === '🌙' && <span className="visually-hidden"> — início do período nocturno</span>}
                </span>
              </div>
            </li>
          );
        }

        if (r.type === 'fluid') {
          const f = r.fluid;
          const label = beverageLabel(f.beverageType, f.customBeverage);
          return (
            <li key={f.id} className={cls}>
              <button type="button" className="tl-item" onClick={() => sheets.openFluid({ periodId: f.diaryPeriodId, existing: f })}>
                <span className="tl-time">{toHHMM(f.timestamp)}</span>
                <span className="tl-icon fluid" aria-hidden="true">
                  {BEVERAGE_EMOJI[f.beverageType]}
                </span>
                <span className="tl-main">
                  <span className="tl-title">{label}</span>
                  {(f.caffeine || f.alcohol || inNight || outside) && (
                    <span className="tl-tags">
                      {inNight && <span className="tl-tag">Noite</span>}
                      {f.caffeine && <span className="tl-tag">Cafeína</span>}
                      {f.alcohol && <span className="tl-tag">Álcool</span>}
                      {outside && <span className="tl-tag">Fora do período</span>}
                    </span>
                  )}
                </span>
                <span className="tl-volume">{formatMl(f.volumeMl)}</span>
                <span className="visually-hidden">. Editar.</span>
              </button>
            </li>
          );
        }

        const c = r.c;
        const u = c.event;
        const tags: { text: string; tone?: 'warn' | 'danger' }[] = [];
        if (c.placement === 'in' && c.period === 'night') tags.push({ text: 'Nocturna' });
        if (c.overridden) tags.push({ text: c.period === 'night' ? 'Marcada como noite' : 'Marcada como dia' });
        if (c.isFirstMorningVoid) tags.push({ text: '1.ª micção da manhã' });
        if (u.awakening && c.period === 'night') tags.push({ text: AWAKENING_SHORT_LABELS[u.awakening] });
        if (u.urgencyLevel !== null) {
          tags.push({ text: `Urgência ${URGENCY_SHORT_LABELS[u.urgencyLevel].toLowerCase()}`, tone: u.urgencyLevel >= threshold ? 'warn' : undefined });
        }
        if (u.kind === 'void' && u.leakage) {
          tags.push({ text: `Perda${u.leakageSeverity ? ` ${LEAKAGE_LABELS[u.leakageSeverity].toLowerCase()}` : ''}`, tone: 'danger' });
        }
        if (u.kind === 'leak_only' && u.leakageSeverity) tags.push({ text: LEAKAGE_LABELS[u.leakageSeverity], tone: 'danger' });
        for (const s of u.symptoms) tags.push({ text: SYMPTOM_LABELS[s], tone: 'danger' });
        if (outside) tags.push({ text: 'Fora do período' });

        return (
          <li key={u.id} className={cls}>
            <button type="button" className="tl-item" onClick={() => sheets.openUrine({ periodId: u.diaryPeriodId, existing: u })}>
              <span className="tl-time">{toHHMM(u.timestamp)}</span>
              <span className="tl-icon urine" aria-hidden="true">
                {u.kind === 'leak_only' ? '💦' : '🚽'}
              </span>
              <span className="tl-main">
                <span className="tl-title">{u.kind === 'leak_only' ? 'Perda urinária' : 'Micção'}</span>
                {tags.length > 0 && (
                  <span className="tl-tags">
                    {tags.map((t) => (
                      <span key={t.text} className={`tl-tag${t.tone ? ` ${t.tone}` : ''}`}>
                        {t.text}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="tl-volume">{u.kind === 'leak_only' ? '' : u.volumeMl === null ? 'sem vol.' : formatMl(u.volumeMl)}</span>
              <span className="visually-hidden">. Editar.</span>
            </button>
          </li>
        );
      })}
      {!hasEvents && (
        <li className="tl-empty">Ainda não há registos neste dia. Usa os botões acima para registar.</li>
      )}
    </ul>
  );
}
