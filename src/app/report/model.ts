/**
 * Modelo do relatório para o urologista. É a única fonte usada pelo ecrã de
 * relatório, pelo PDF e pelo CSV, para que os números coincidam sempre.
 */
import type { DayMetrics, PeriodSummary } from '../../domain/clinical';
import type { Settings } from '../../domain/types';
import {
  AWAKENING_SHORT_LABELS,
  BEVERAGE_LABELS,
  CONTEXT_LABELS,
  LEAKAGE_LABELS,
  NPI_LABEL,
  REPORT_DISCLAIMER,
  SYMPTOM_LABELS,
  URGENCY_SHORT_LABELS,
  beverageLabel,
} from '../../domain/labels';
import { formatAverage, formatMl, formatNumber, formatPercent } from '../../domain/format';
import { formatDate, formatDateTime, formatDayMonth, formatDuration, toHHMM } from '../../domain/time';
import { buildObservations } from '../../domain/observations';
import type { PeriodView } from '../store';

export interface ReportMetricRow {
  label: string;
  /** Valores formatados por dia. */
  values: string[];
  /** Valores numéricos por dia (para CSV). */
  raw: (number | null)[];
  aggregate: string;
  aggregateRaw: number | null;
  decimals: number;
}

export interface ReportSleepRow {
  label: string;
  wake: string;
  bed: string;
  nextWake: string;
  duration: string;
  estimated: boolean;
}

export interface ReportEvent {
  timestamp: number;
  date: string;
  time: string;
  day: string;
  period: string;
  type: 'Bebida' | 'Micção' | 'Perda';
  volumeMl: number | null;
  beverage: string;
  caffeine: string;
  alcohol: string;
  urgencyLevel: number | null;
  urgency: string;
  leak: string;
  leakSeverity: string;
  nightContext: string;
  firstMorningVoid: string;
  symptoms: string;
  notes: string;
  isNight: boolean;
}

export interface ReportModel {
  title: string;
  periodLabel: string;
  numberOfDays: number;
  generatedAt: number;
  demo: boolean;
  disclaimer: string;
  methodNote: string;
  urgencyNote: string;
  summary: PeriodSummary;
  keyFigures: { label: string; value: string }[];
  observations: string[];
  dayLabels: string[];
  metrics: ReportMetricRow[];
  sleep: ReportSleepRow[];
  events: ReportEvent[];
  notes: { label: string; text: string }[];
  symptoms: string[];
}

export function dayLabel(index: number, date: string): string {
  return `Dia ${index + 1} (${formatDayMonth(date)})`;
}

export function methodNote(settings: Settings): string {
  return settings.nocturnalVolumeMethod === 'ics'
    ? 'Volume nocturno: micções entre deitar e levantar mais a primeira micção depois de levantar (definição ICS). Volume de 24 h: da micção seguinte à primeira da manhã até à primeira micção da manhã seguinte, inclusive.'
    : 'Volume nocturno: apenas micções entre deitar e levantar. Volume de 24 h: de levantar a levantar.';
}

function metricRow(
  label: string,
  days: DayMetrics[],
  pick: (d: DayMetrics) => number | null,
  format: (v: number | null) => string,
  aggregateRaw: number | null,
  decimals = 0,
): ReportMetricRow {
  const raw = days.map(pick);
  return { label, values: raw.map(format), raw, aggregate: format(aggregateRaw), aggregateRaw, decimals };
}

const count = (v: number | null) => (v === null ? '—' : formatAverage(v));
const ml = (v: number | null) => formatMl(v);
const pct = (v: number | null) => formatPercent(v, 1);
const mlh = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 0)} mL/h`);

export function buildReportModel(view: PeriodView, settings: Settings, options: { demo: boolean; now: number }): ReportModel {
  const { period, days, summary } = view;
  const s = summary;
  const dm = s.days;
  const first = days[0]?.date ?? period.startDate;
  const last = days[days.length - 1]?.date ?? period.startDate;
  const thr = settings.urgencyThreshold;
  const mean = (fn: (d: DayMetrics) => number | null) => {
    const vals = s.includedDays.map(fn).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const metrics: ReportMetricRow[] = [
    metricRow('Líquidos ingeridos', dm, (d) => d.fluidIntakeMl, ml, s.averages.fluidIntakeMl),
    metricRow('Líquidos nas 3 h antes de deitar', dm, (d) => d.eveningFluidIntakeMl, ml, s.averages.eveningFluidIntakeMl),
    metricRow('Volume urinário de 24 h', dm, (d) => d.total24h.volumeMl, ml, s.averages.total24hVolumeMl),
    metricRow('Micções diurnas', dm, (d) => d.daytimeVoids, count, s.averages.daytimeVoids, 1),
    metricRow('Micções nocturnas', dm, (d) => d.nocturnalVoids, count, s.averages.nocturnalVoids, 1),
    metricRow('— acordou pela vontade de urinar', dm, (d) => d.nocturnalAwakenings, count, s.averages.nocturnalAwakenings, 1),
    metricRow('— já estava acordado', dm, (d) => d.nocturnalAlreadyAwake, count, mean((d) => d.nocturnalAlreadyAwake), 1),
    metricRow('Volume urinário nocturno', dm, (d) => d.nocturnal.volumeMl, ml, s.averages.nocturnalUrineVolumeMl),
    metricRow(NPI_LABEL, dm, (d) => d.npi, pct, s.npi, 1),
    metricRow('Produção urinária nocturna', dm, (d) => d.nocturnalProductionMlPerHour, mlh, s.averages.nocturnalProductionMlPerHour),
    metricRow('Volume máximo por micção', dm, (d) => d.maxVoidedVolumeMl, ml, s.maxVoidedVolumeMl),
    metricRow('Volume médio por micção', dm, (d) => d.averageVoidedVolumeMl, ml, s.averageVoidedVolumeMl),
    metricRow('Volume médio diurno por micção', dm, (d) => d.meanDaytimeVoidedVolumeMl, ml, s.meanDaytimeVoidedVolumeMl),
    metricRow('Volume médio nocturno por micção', dm, (d) => d.meanNocturnalVoidedVolumeMl, ml, s.meanNocturnalVoidedVolumeMl),
    metricRow(`Episódios de urgência (nível ${thr}+)`, dm, (d) => d.urgencyEpisodes, count, mean((d) => d.urgencyEpisodes), 1),
    metricRow('Episódios de perda urinária', dm, (d) => d.leakageEpisodes, count, mean((d) => d.leakageEpisodes), 1),
  ];

  const sleep: ReportSleepRow[] = dm.map((d) => ({
    label: dayLabel(d.index, d.date),
    wake: toHHMM(d.window.wakeAt) + (d.window.estimated.wake ? '*' : ''),
    bed: toHHMM(d.window.bedAt) + (d.window.estimated.bed ? '*' : ''),
    nextWake: toHHMM(d.window.nextWakeAt) + (d.window.estimated.nextWake ? '*' : ''),
    duration: formatDuration(d.window.nextWakeAt - d.window.bedAt),
    estimated: d.window.estimated.wake || d.window.estimated.bed || d.window.estimated.nextWake,
  }));

  const dayOf = (dayIndex: number | null) =>
    dayIndex === null ? 'Fora do período' : dayLabel(dayIndex, dm[dayIndex].date);

  const events: ReportEvent[] = [];
  for (const f of view.fluids) {
    const di = s.windows.findIndex((w) => f.timestamp >= w.wakeAt && f.timestamp < w.nextWakeAt);
    const night = di >= 0 && f.timestamp >= s.windows[di].bedAt;
    events.push({
      timestamp: f.timestamp,
      date: formatDate(f.timestamp),
      time: toHHMM(f.timestamp),
      day: dayOf(di >= 0 ? di : null),
      period: di < 0 ? '—' : night ? 'Noite' : 'Dia',
      type: 'Bebida',
      volumeMl: f.volumeMl,
      beverage: beverageLabel(f.beverageType, f.customBeverage) || BEVERAGE_LABELS[f.beverageType],
      caffeine: f.caffeine ? 'Sim' : 'Não',
      alcohol: f.alcohol ? 'Sim' : 'Não',
      urgencyLevel: null,
      urgency: '',
      leak: '',
      leakSeverity: '',
      nightContext: '',
      firstMorningVoid: '',
      symptoms: '',
      notes: f.notes,
      isNight: night,
    });
  }
  for (const c of s.classified) {
    const u = c.event;
    const leak = u.kind === 'leak_only' || u.leakage;
    events.push({
      timestamp: u.timestamp,
      date: formatDate(u.timestamp),
      time: toHHMM(u.timestamp),
      day: c.placement === 'after' && c.isFirstMorningVoid ? 'Manhã seguinte ao último dia' : dayOf(c.dayIndex),
      period: c.placement !== 'in' ? (c.isFirstMorningVoid ? 'Dia' : '—') : c.period === 'night' ? 'Noite' : 'Dia',
      type: u.kind === 'leak_only' ? 'Perda' : 'Micção',
      volumeMl: u.kind === 'leak_only' ? null : u.volumeMl,
      beverage: '',
      caffeine: '',
      alcohol: '',
      urgencyLevel: u.urgencyLevel,
      urgency: u.urgencyLevel === null ? '' : `${u.urgencyLevel} · ${URGENCY_SHORT_LABELS[u.urgencyLevel]}`,
      leak: leak ? 'Sim' : 'Não',
      leakSeverity: u.leakageSeverity ? LEAKAGE_LABELS[u.leakageSeverity] : '',
      nightContext: c.period === 'night' && u.awakening ? AWAKENING_SHORT_LABELS[u.awakening] : '',
      firstMorningVoid: c.isFirstMorningVoid ? 'Sim' : '',
      symptoms: u.symptoms.map((x) => SYMPTOM_LABELS[x]).join(', '),
      notes: u.notes,
      isNight: c.placement === 'in' && c.period === 'night',
    });
  }
  events.sort((a, b) => a.timestamp - b.timestamp);

  const notes: { label: string; text: string }[] = [];
  if (period.notes) notes.push({ label: 'Notas do diário', text: period.notes });
  for (const d of days) {
    const parts: string[] = [];
    if (d.context.length) parts.push(`Contexto: ${d.context.map((c) => CONTEXT_LABELS[c]).join(', ')}.`);
    if (d.symptoms.length) parts.push(`Sintomas: ${d.symptoms.map((x) => SYMPTOM_LABELS[x]).join(', ')}.`);
    if (d.notes) parts.push(d.notes);
    if (parts.length) notes.push({ label: dayLabel(d.dayIndex, d.date), text: parts.join(' ') });
  }

  const keyFigures = [
    { label: 'Média de micções nocturnas', value: count(s.averages.nocturnalVoids) },
    { label: '— das quais acordou pela vontade de urinar', value: count(s.averages.nocturnalAwakenings) },
    { label: 'Média de volume urinário nocturno', value: ml(s.averages.nocturnalUrineVolumeMl) },
    { label: 'Média de volume urinário em 24 h', value: ml(s.averages.total24hVolumeMl) },
    { label: NPI_LABEL, value: pct(s.npi) },
    { label: 'Média de volume por micção', value: ml(s.averageVoidedVolumeMl) },
    { label: 'Maior volume urinário', value: ml(s.maxVoidedVolumeMl) },
    { label: 'Média de líquidos ingeridos', value: ml(s.averages.fluidIntakeMl) },
    { label: 'Média de urgência (0–4)', value: s.meanUrgency === null ? '—' : formatNumber(s.meanUrgency, 1) },
    { label: `Episódios de urgência (nível ${thr}+)`, value: String(s.urgencyEpisodes) },
    { label: 'Número de episódios de perda', value: String(s.leakageEpisodes) },
  ];

  return {
    title: period.title,
    periodLabel: first === last ? formatDate(first) : `${formatDate(first)} – ${formatDate(last)}`,
    numberOfDays: days.length,
    generatedAt: options.now,
    demo: options.demo,
    disclaimer: REPORT_DISCLAIMER,
    methodNote: methodNote(settings),
    urgencyNote: `Urgência registada numa escala de 0 (sem urgência) a 4 (muito forte / difícil de adiar). Episódio de urgência = nível ${thr} ou superior.`,
    summary: s,
    keyFigures,
    observations: buildObservations(s, thr),
    dayLabels: dm.map((d) => dayLabel(d.index, d.date)),
    metrics,
    sleep,
    events,
    notes,
    symptoms: s.symptoms.map((x) => SYMPTOM_LABELS[x]),
  };
}

export function reportGeneratedText(model: ReportModel): string {
  return `Gerado em ${formatDateTime(model.generatedAt)}`;
}

