/**
 * Motor de cálculo clínico — funções puras, sem I/O.
 *
 * Definições (International Continence Society, ICS):
 * - Período de 24 h: começa quando o utilizador se levanta (wakeAt) e termina
 *   quando se levanta no dia seguinte (nextWakeAt). Não se agrupa por data civil.
 * - Período nocturno (sono principal): da hora de deitar (bedAt) até à hora de
 *   levantar seguinte (nextWakeAt). A classificação usa as horas registadas,
 *   não horas fixas do relógio.
 * - Micção nocturna: micção durante o período nocturno. Distingue-se se o
 *   utilizador acordou por causa da vontade de urinar ou se já estava acordado.
 * - Primeira micção da manhã (PMM): primeira micção depois de se levantar.
 *   Conta como micção diurna (frequência), mas na definição ICS o seu volume
 *   pertence ao volume urinário nocturno da noite anterior.
 * - Volume urinário nocturno (VUN, método ICS): micções nocturnas + PMM seguinte.
 * - Volume de 24 h (método ICS): todas as micções do dia excepto a PMM que o
 *   abre, mais a PMM da manhã seguinte.
 * - NPi = VUN / volume de 24 h × 100. Valor descritivo; não é um diagnóstico.
 */
import type {
  DiaryDay,
  FluidEvent,
  HHMM,
  ISODate,
  NocturnalVolumeMethod,
  SymptomFlag,
  UrineEvent,
} from './types';
import { HOUR, firstOccurrenceAfter, localInstant } from './time';

export interface UsualTimes {
  usualBedtime: HHMM;
  usualWakeTime: HHMM;
}

/** Janela temporal de um dia do diário (instantes absolutos). */
export interface DayWindow {
  dayId: string;
  index: number;
  date: ISODate;
  wakeAt: number;
  bedAt: number;
  nextWakeAt: number;
  /** true quando a hora não foi registada e se usou a hora habitual. */
  estimated: { wake: boolean; bed: boolean; nextWake: boolean };
  /** A noite terminou na micção marcada como "primeira depois de me levantar". */
  nightEndedByFirstMorningVoid: boolean;
}

/** Janela para detectar automaticamente a primeira micção após levantar. */
export const AUTO_FIRST_VOID_WINDOW_MS = 4 * HOUR;
/** Após o último dia, até quando procurar uma PMM marcada manualmente. */
export const FINAL_MORNING_WINDOW_MS = 12 * HOUR;

// ---------------------------------------------------------------------------
// Janelas dos dias
// ---------------------------------------------------------------------------

/**
 * Calcula as janelas (levantar → deitar → levantar seguinte) de cada dia.
 * As janelas são contíguas: nextWakeAt(i) === wakeAt(i + 1).
 * Se uma micção for marcada como "primeira depois de me levantar" durante a
 * noite (p. ex. 06:55 com hora de levantar 07:00), a noite termina nessa micção.
 */
export function resolveDayWindows(
  days: DiaryDay[],
  usual: UsualTimes,
  urineEvents: UrineEvent[] = [],
): DayWindow[] {
  const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex);

  const wakeInfo = sorted.map((day, i) => {
    const explicit = day.wakeTime ?? sorted[i - 1]?.nextWakeTime ?? null;
    return { time: explicit ?? usual.usualWakeTime, estimated: explicit === null };
  });

  const windows: DayWindow[] = sorted.map((day, i) => {
    const wakeAt = localInstant(day.date, wakeInfo[i].time);
    const next = sorted[i + 1];
    let nextWakeAt: number;
    let nextEstimated: boolean;
    let bedAt = firstOccurrenceAfter(wakeAt, day.bedtime ?? usual.usualBedtime);

    if (next) {
      nextWakeAt = localInstant(next.date, wakeInfo[i + 1].time);
      nextEstimated = wakeInfo[i + 1].estimated;
    } else {
      const nextWakeTime = day.nextWakeTime ?? usual.usualWakeTime;
      nextWakeAt = firstOccurrenceAfter(bedAt, nextWakeTime);
      nextEstimated = day.nextWakeTime === null;
    }
    if (nextWakeAt <= wakeAt) nextWakeAt = firstOccurrenceAfter(wakeAt, wakeInfo[i].time);
    if (bedAt > nextWakeAt) bedAt = nextWakeAt;

    return {
      dayId: day.id,
      index: i,
      date: day.date,
      wakeAt,
      bedAt,
      nextWakeAt,
      estimated: { wake: wakeInfo[i].estimated, bed: day.bedtime === null, nextWake: nextEstimated },
      nightEndedByFirstMorningVoid: false,
    };
  });

  // Uma PMM marcada manualmente durante a noite indica a hora real de levantar.
  const flagged = urineEvents
    .filter((e) => e.kind === 'void' && e.firstMorningVoid === true && e.periodOverride !== 'night')
    .sort(byTimestamp);
  for (const w of windows) {
    const hit = flagged.find((e) => e.timestamp >= w.bedAt && e.timestamp < w.nextWakeAt);
    if (!hit) continue;
    w.nextWakeAt = hit.timestamp;
    w.estimated.nextWake = false;
    w.nightEndedByFirstMorningVoid = true;
    const next = windows[w.index + 1];
    if (next) {
      next.wakeAt = hit.timestamp;
      next.estimated.wake = false;
      if (next.bedAt < next.wakeAt) next.bedAt = next.wakeAt;
    }
  }
  return windows;
}

/** Índice do dia cuja janela contém o instante, ou null. */
export function findDayIndex(windows: DayWindow[], instant: number): number | null {
  for (const w of windows) {
    if (instant >= w.wakeAt && instant < w.nextWakeAt) return w.index;
  }
  return null;
}

export type TimelinePosition =
  | { state: 'empty' }
  | { state: 'before'; index: 0 }
  | { state: 'during'; index: number; period: 'day' | 'night' }
  | { state: 'after'; index: number };

/** Onde está um instante em relação ao diário (útil para o ecrã principal). */
export function locateInstant(windows: DayWindow[], instant: number): TimelinePosition {
  if (windows.length === 0) return { state: 'empty' };
  if (instant < windows[0].wakeAt) return { state: 'before', index: 0 };
  const index = findDayIndex(windows, instant);
  if (index === null) return { state: 'after', index: windows.length - 1 };
  return { state: 'during', index, period: instant >= windows[index].bedAt ? 'night' : 'day' };
}

// ---------------------------------------------------------------------------
// Classificação das micções
// ---------------------------------------------------------------------------

export interface ClassifiedUrineEvent {
  event: UrineEvent;
  /** Dia do diário que contém o evento; null se fora do período. */
  dayIndex: number | null;
  placement: 'before' | 'in' | 'after';
  period: 'day' | 'night';
  /** Classificação manual (override) aplicada. */
  overridden: boolean;
  /** Primeira micção depois de se levantar. */
  isFirstMorningVoid: boolean;
  /**
   * Noite cujo volume nocturno (ICS) inclui esta micção: a PMM do dia i fecha a
   * noite i − 1 (−1 = noite anterior ao início do diário).
   */
  closesNightIndex: number | null;
}

function byTimestamp(a: { timestamp: number; createdAt?: number }, b: { timestamp: number; createdAt?: number }) {
  return a.timestamp - b.timestamp || (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

export function classifyUrineEvents(windows: DayWindow[], events: UrineEvent[]): ClassifiedUrineEvent[] {
  const sorted = [...events].sort(byTimestamp);
  const first = windows[0];
  const last = windows[windows.length - 1];

  const classified: ClassifiedUrineEvent[] = sorted.map((event) => {
    const t = event.timestamp;
    let dayIndex: number | null = null;
    let placement: ClassifiedUrineEvent['placement'];
    let period: ClassifiedUrineEvent['period'];

    if (!first || t < first.wakeAt) {
      placement = 'before';
      period = 'night';
    } else if (t >= last.nextWakeAt) {
      placement = 'after';
      period = 'day';
    } else {
      dayIndex = findDayIndex(windows, t);
      placement = 'in';
      period = dayIndex !== null && t >= windows[dayIndex].bedAt ? 'night' : 'day';
    }

    let overridden = false;
    if (placement === 'in' && event.periodOverride !== 'auto' && event.periodOverride !== period) {
      period = event.periodOverride;
      overridden = true;
    }
    return { event, dayIndex, placement, period, overridden, isFirstMorningVoid: false, closesNightIndex: null };
  });

  const isCandidate = (c: ClassifiedUrineEvent) =>
    c.event.kind === 'void' && c.event.firstMorningVoid !== false && c.event.periodOverride !== 'night';

  // PMM de cada dia: marcada manualmente, ou a primeira micção nas 4 h após levantar.
  for (const w of windows) {
    const candidates = classified.filter(
      (c) => c.dayIndex === w.index && c.period === 'day' && c.event.timestamp < w.bedAt && isCandidate(c),
    );
    const chosen =
      candidates.find((c) => c.event.firstMorningVoid === true) ??
      candidates.find((c) => c.event.timestamp - w.wakeAt <= AUTO_FIRST_VOID_WINDOW_MS);
    if (chosen) {
      chosen.isFirstMorningVoid = true;
      chosen.closesNightIndex = w.index - 1;
    }
  }

  // PMM da manhã seguinte ao último dia (fecha a última noite).
  if (last) {
    const after = classified.filter((c) => c.placement === 'after' && isCandidate(c));
    const chosen =
      after.find(
        (c) => c.event.firstMorningVoid === true && c.event.timestamp - last.nextWakeAt <= FINAL_MORNING_WINDOW_MS,
      ) ?? after.find((c) => c.event.timestamp - last.nextWakeAt <= AUTO_FIRST_VOID_WINDOW_MS);
    if (chosen) {
      chosen.isFirstMorningVoid = true;
      chosen.closesNightIndex = last.index;
    }
  }
  return classified;
}

// ---------------------------------------------------------------------------
// Agrupamento por dia
// ---------------------------------------------------------------------------

export interface DayBucket {
  window: DayWindow;
  /** Micções e perdas com timestamp dentro da janela do dia. */
  urine: ClassifiedUrineEvent[];
  /** Apenas micções (kind === 'void'). */
  voids: ClassifiedUrineEvent[];
  fluids: FluidEvent[];
  /** PMM que abre este dia (pertence à noite anterior no método ICS). */
  openingFirstVoid: ClassifiedUrineEvent | null;
  /** PMM da manhã seguinte (fecha a noite deste dia). */
  closingFirstVoid: ClassifiedUrineEvent | null;
}

export function buildDayBuckets(
  windows: DayWindow[],
  classified: ClassifiedUrineEvent[],
  fluids: FluidEvent[],
): DayBucket[] {
  return windows.map((w) => {
    const urine = classified.filter((c) => c.dayIndex === w.index);
    return {
      window: w,
      urine,
      voids: urine.filter((c) => c.event.kind === 'void'),
      fluids: fluids.filter((f) => f.timestamp >= w.wakeAt && f.timestamp < w.nextWakeAt).sort(byTimestamp),
      openingFirstVoid: urine.find((c) => c.isFirstMorningVoid && c.closesNightIndex === w.index - 1) ?? null,
      closingFirstVoid: classified.find((c) => c.isFirstMorningVoid && c.closesNightIndex === w.index) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Métricas elementares (funções puras)
// ---------------------------------------------------------------------------

export interface VolumeResult {
  /** Soma dos volumes medidos (mL). */
  volumeMl: number;
  /** Micções incluídas no cálculo. */
  voidsCounted: number;
  /** Micções incluídas sem volume medido (o total pode estar subestimado). */
  unmeasured: number;
  /** false quando falta a PMM seguinte (método ICS). */
  complete: boolean;
}

function sumVolumes(voids: ClassifiedUrineEvent[], complete: boolean): VolumeResult {
  let volumeMl = 0;
  let unmeasured = 0;
  for (const v of voids) {
    if (v.event.volumeMl === null) unmeasured += 1;
    else volumeMl += v.event.volumeMl;
  }
  return { volumeMl, voidsCounted: voids.length, unmeasured, complete };
}

/** Micções incluídas no volume de 24 h. */
export function voidsIn24Hours(bucket: DayBucket, method: NocturnalVolumeMethod): ClassifiedUrineEvent[] {
  if (method === 'sleep_only') return bucket.voids;
  const own = bucket.voids.filter((v) => v !== bucket.openingFirstVoid);
  return bucket.closingFirstVoid ? [...own, bucket.closingFirstVoid] : own;
}

/** Micções incluídas no volume urinário nocturno. */
export function voidsInNocturnalVolume(bucket: DayBucket, method: NocturnalVolumeMethod): ClassifiedUrineEvent[] {
  const night = bucket.voids.filter((v) => v.period === 'night');
  if (method === 'ics' && bucket.closingFirstVoid) return [...night, bucket.closingFirstVoid];
  return night;
}

/** A. Volume urinário de 24 h. */
export function calculate24HourUrine(bucket: DayBucket, method: NocturnalVolumeMethod = 'ics'): VolumeResult {
  return sumVolumes(voidsIn24Hours(bucket, method), method === 'sleep_only' || bucket.closingFirstVoid !== null);
}

/** E. Volume urinário nocturno. */
export function calculateNocturnalUrine(bucket: DayBucket, method: NocturnalVolumeMethod = 'ics'): VolumeResult {
  return sumVolumes(
    voidsInNocturnalVolume(bucket, method),
    method === 'sleep_only' || bucket.closingFirstVoid !== null,
  );
}

/** M. Índice de produção urinária nocturna (NPi), em %. */
export function calculateNocturnalPolyuriaIndex(nocturnalMl: number, total24hMl: number): number | null {
  if (!Number.isFinite(nocturnalMl) || !Number.isFinite(total24hMl) || total24hMl <= 0) return null;
  return (nocturnalMl / total24hMl) * 100;
}

type WithVolume = { volumeMl: number | null } | ClassifiedUrineEvent;
const volumeOf = (x: WithVolume) => ('event' in x ? x.event.volumeMl : x.volumeMl);

/** G. Volume médio por micção (apenas micções com volume medido). */
export function calculateAverageVoidVolume(voids: WithVolume[]): number | null {
  const volumes = voids.map(volumeOf).filter((v): v is number => v !== null);
  if (volumes.length === 0) return null;
  return volumes.reduce((a, b) => a + b, 0) / volumes.length;
}

/** F. Volume máximo por micção. */
export function calculateMaximumVoidVolume(voids: WithVolume[]): number | null {
  const volumes = voids.map(volumeOf).filter((v): v is number => v !== null);
  return volumes.length ? Math.max(...volumes) : null;
}

/** C. Número de micções diurnas (inclui a primeira micção depois de levantar). */
export function calculateDaytimeVoids(bucket: DayBucket): number {
  return bucket.voids.filter((v) => v.period === 'day').length;
}

/** D. Número de micções nocturnas (entre deitar e levantar). */
export function calculateNocturnalVoids(bucket: DayBucket): number {
  return bucket.voids.filter((v) => v.period === 'night').length;
}

/** L. Despertares causados pela vontade de urinar. */
export function calculateNocturnalAwakenings(bucket: DayBucket): number {
  return bucket.voids.filter((v) => v.period === 'night' && v.event.awakening === 'woke_to_void').length;
}

type WithUrgency = Pick<UrineEvent, 'urgencyLevel'> | ClassifiedUrineEvent;
const urgencyOf = (x: WithUrgency) => ('event' in x ? x.event.urgencyLevel : x.urgencyLevel);

/** J. Episódios de urgência: eventos com urgência ≥ limiar. */
export function calculateUrgencyEpisodes(events: WithUrgency[], threshold = 3): number {
  return events.filter((e) => {
    const u = urgencyOf(e);
    return u !== null && u >= threshold;
  }).length;
}

/** Média do nível de urgência (0–4) nos eventos em que foi indicado. */
export function calculateMeanUrgency(events: WithUrgency[]): number | null {
  const levels = events.map(urgencyOf).filter((u): u is NonNullable<typeof u> => u !== null);
  if (levels.length === 0) return null;
  return levels.reduce<number>((a, b) => a + b, 0) / levels.length;
}

type WithLeak = Pick<UrineEvent, 'leakage' | 'kind'> | ClassifiedUrineEvent;
/** K. Episódios de perda urinária (com ou sem micção). */
export function calculateLeakageEpisodes(events: WithLeak[]): number {
  return events.filter((e) => {
    const ev = 'event' in e ? e.event : e;
    return ev.leakage || ev.kind === 'leak_only';
  }).length;
}

/** B. Ingestão total de líquidos. */
export function calculateFluidIntake(fluids: Pick<FluidEvent, 'volumeMl'>[]): number {
  return fluids.reduce((sum, f) => sum + f.volumeMl, 0);
}

/** Líquidos ingeridos nas `hours` horas antes de deitar. */
export function calculateEveningFluidIntake(fluids: FluidEvent[], window: DayWindow, hours = 3): number {
  const from = window.bedAt - hours * HOUR;
  return calculateFluidIntake(fluids.filter((f) => f.timestamp >= from && f.timestamp < window.bedAt));
}

/** Produção urinária nocturna (mL/h) = volume nocturno ÷ duração da noite. */
export function calculateNocturnalUrineProduction(nocturnalMl: number, window: DayWindow): number | null {
  const hours = (window.nextWakeAt - window.bedAt) / HOUR;
  if (hours <= 0) return null;
  return nocturnalMl / hours;
}

// ---------------------------------------------------------------------------
// Métricas diárias e resumo do período
// ---------------------------------------------------------------------------

export type DayStatus = 'upcoming' | 'in_progress' | 'awaiting_first_void' | 'complete';

export interface DayMetrics {
  index: number;
  date: ISODate;
  window: DayWindow;
  status: DayStatus;
  sleepDurationMs: number;
  fluidIntakeMl: number;
  fluidCount: number;
  caffeineDrinks: number;
  alcoholDrinks: number;
  eveningFluidIntakeMl: number;
  voidCount: number;
  daytimeVoids: number;
  nocturnalVoids: number;
  nocturnalAwakenings: number;
  nocturnalAlreadyAwake: number;
  nocturnalUnspecified: number;
  total24h: VolumeResult;
  nocturnal: VolumeResult;
  daytimeVolumeMl: number;
  npi: number | null;
  nocturnalProductionMlPerHour: number | null;
  maxVoidedVolumeMl: number | null;
  averageVoidedVolumeMl: number | null;
  meanDaytimeVoidedVolumeMl: number | null;
  meanNocturnalVoidedVolumeMl: number | null;
  urgencyEpisodes: number;
  meanUrgency: number | null;
  leakageEpisodes: number;
  unmeasuredVoids: number;
  hasOpeningFirstVoid: boolean;
  hasClosingFirstVoid: boolean;
}

export interface CalculationOptions {
  method: NocturnalVolumeMethod;
  urgencyThreshold: number;
  now: number;
}

export function dayStatus(bucket: DayBucket, method: NocturnalVolumeMethod, now: number): DayStatus {
  const w = bucket.window;
  if (now < w.wakeAt) return 'upcoming';
  if (now < w.nextWakeAt) return 'in_progress';
  if (method === 'ics' && !bucket.closingFirstVoid && now < w.nextWakeAt + AUTO_FIRST_VOID_WINDOW_MS) {
    return 'awaiting_first_void';
  }
  return 'complete';
}

export function calculateDayMetrics(bucket: DayBucket, options: CalculationOptions): DayMetrics {
  const { method, urgencyThreshold, now } = options;
  const w = bucket.window;
  const total24h = calculate24HourUrine(bucket, method);
  const nocturnal = calculateNocturnalUrine(bucket, method);
  const dayVoids = bucket.voids.filter((v) => v.period === 'day');
  const nightVoids = bucket.voids.filter((v) => v.period === 'night');

  return {
    index: w.index,
    date: w.date,
    window: w,
    status: dayStatus(bucket, method, now),
    sleepDurationMs: w.nextWakeAt - w.bedAt,
    fluidIntakeMl: calculateFluidIntake(bucket.fluids),
    fluidCount: bucket.fluids.length,
    caffeineDrinks: bucket.fluids.filter((f) => f.caffeine).length,
    alcoholDrinks: bucket.fluids.filter((f) => f.alcohol).length,
    eveningFluidIntakeMl: calculateEveningFluidIntake(bucket.fluids, w),
    voidCount: bucket.voids.length,
    daytimeVoids: calculateDaytimeVoids(bucket),
    nocturnalVoids: calculateNocturnalVoids(bucket),
    nocturnalAwakenings: calculateNocturnalAwakenings(bucket),
    nocturnalAlreadyAwake: nightVoids.filter((v) => v.event.awakening === 'already_awake').length,
    nocturnalUnspecified: nightVoids.filter((v) => v.event.awakening === null).length,
    total24h,
    nocturnal,
    daytimeVolumeMl: total24h.volumeMl - nocturnal.volumeMl,
    npi: calculateNocturnalPolyuriaIndex(nocturnal.volumeMl, total24h.volumeMl),
    nocturnalProductionMlPerHour: calculateNocturnalUrineProduction(nocturnal.volumeMl, w),
    maxVoidedVolumeMl: calculateMaximumVoidVolume(bucket.voids),
    averageVoidedVolumeMl: calculateAverageVoidVolume(bucket.voids),
    meanDaytimeVoidedVolumeMl: calculateAverageVoidVolume(dayVoids),
    meanNocturnalVoidedVolumeMl: calculateAverageVoidVolume(nightVoids),
    urgencyEpisodes: calculateUrgencyEpisodes(bucket.urine, urgencyThreshold),
    meanUrgency: calculateMeanUrgency(bucket.voids),
    leakageEpisodes: calculateLeakageEpisodes(bucket.urine),
    unmeasuredVoids: bucket.voids.filter((v) => v.event.volumeMl === null).length,
    hasOpeningFirstVoid: bucket.openingFirstVoid !== null,
    hasClosingFirstVoid: bucket.closingFirstVoid !== null,
  };
}

export interface PeriodAverages {
  nocturnalVoids: number | null;
  nocturnalAwakenings: number | null;
  daytimeVoids: number | null;
  nocturnalUrineVolumeMl: number | null;
  total24hVolumeMl: number | null;
  fluidIntakeMl: number | null;
  eveningFluidIntakeMl: number | null;
  nocturnalProductionMlPerHour: number | null;
}

export interface PeriodSummary {
  windows: DayWindow[];
  buckets: DayBucket[];
  classified: ClassifiedUrineEvent[];
  days: DayMetrics[];
  /** Dias usados nas médias: dias completos (ou, se nenhum, dias já iniciados). */
  includedDays: DayMetrics[];
  isPartial: boolean;
  averages: PeriodAverages;
  /** NPi do período = Σ volume nocturno ÷ Σ volume de 24 h × 100. */
  npi: number | null;
  averageVoidedVolumeMl: number | null;
  meanDaytimeVoidedVolumeMl: number | null;
  meanNocturnalVoidedVolumeMl: number | null;
  maxVoidedVolumeMl: number | null;
  meanUrgency: number | null;
  urgencyEpisodes: number;
  leakageEpisodes: number;
  unmeasuredVoids: number;
  incompleteNocturnalVolumeDays: number;
  outsideEvents: number;
  caffeineDrinks: number;
  alcoholDrinks: number;
  symptoms: SymptomFlag[];
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function calculatePeriodSummary(
  days: DiaryDay[],
  fluids: FluidEvent[],
  urine: UrineEvent[],
  usual: UsualTimes,
  options: CalculationOptions,
): PeriodSummary {
  const windows = resolveDayWindows(days, usual, urine);
  const classified = classifyUrineEvents(windows, urine);
  const buckets = buildDayBuckets(windows, classified, fluids);
  const metrics = buckets.map((b) => calculateDayMetrics(b, options));

  const complete = metrics.filter((m) => m.status === 'complete');
  const started = metrics.filter((m) => m.status !== 'upcoming');
  const includedDays = complete.length ? complete : started;
  const includedIdx = new Set(includedDays.map((d) => d.index));
  const includedBuckets = buckets.filter((b) => includedIdx.has(b.window.index));

  const allVoids = includedBuckets.flatMap((b) => b.voids);
  const lastIncluded = includedBuckets[includedBuckets.length - 1];
  if (lastIncluded?.closingFirstVoid && lastIncluded.closingFirstVoid.placement === 'after') {
    allVoids.push(lastIncluded.closingFirstVoid);
  }
  const allUrine = includedBuckets.flatMap((b) => b.urine);

  const sumNocturnal = includedDays.reduce((s, d) => s + d.nocturnal.volumeMl, 0);
  const sum24 = includedDays.reduce((s, d) => s + d.total24h.volumeMl, 0);

  const symptomSet = new Set<SymptomFlag>();
  for (const d of days) d.symptoms.forEach((s) => symptomSet.add(s));
  for (const u of urine) u.symptoms.forEach((s) => symptomSet.add(s));

  const pick = (fn: (d: DayMetrics) => number | null) =>
    mean(includedDays.map(fn).filter((v): v is number => v !== null));

  return {
    windows,
    buckets,
    classified,
    days: metrics,
    includedDays,
    isPartial: complete.length < metrics.length,
    averages: {
      nocturnalVoids: pick((d) => d.nocturnalVoids),
      nocturnalAwakenings: pick((d) => d.nocturnalAwakenings),
      daytimeVoids: pick((d) => d.daytimeVoids),
      nocturnalUrineVolumeMl: pick((d) => d.nocturnal.volumeMl),
      total24hVolumeMl: pick((d) => d.total24h.volumeMl),
      fluidIntakeMl: pick((d) => d.fluidIntakeMl),
      eveningFluidIntakeMl: pick((d) => d.eveningFluidIntakeMl),
      nocturnalProductionMlPerHour: pick((d) => d.nocturnalProductionMlPerHour),
    },
    npi: calculateNocturnalPolyuriaIndex(sumNocturnal, sum24),
    averageVoidedVolumeMl: calculateAverageVoidVolume(allVoids),
    meanDaytimeVoidedVolumeMl: calculateAverageVoidVolume(allVoids.filter((v) => v.period === 'day')),
    meanNocturnalVoidedVolumeMl: calculateAverageVoidVolume(
      allVoids.filter((v) => v.period === 'night' && v.placement === 'in'),
    ),
    maxVoidedVolumeMl: calculateMaximumVoidVolume(allVoids),
    meanUrgency: calculateMeanUrgency(allVoids),
    urgencyEpisodes: calculateUrgencyEpisodes(allUrine, options.urgencyThreshold),
    leakageEpisodes: calculateLeakageEpisodes(allUrine),
    unmeasuredVoids: allVoids.filter((v) => v.event.volumeMl === null).length,
    incompleteNocturnalVolumeDays: includedDays.filter((d) => !d.nocturnal.complete).length,
    outsideEvents: classified.filter((c) => c.placement !== 'in' && !c.isFirstMorningVoid).length,
    caffeineDrinks: includedDays.reduce((s, d) => s + d.caffeineDrinks, 0),
    alcoholDrinks: includedDays.reduce((s, d) => s + d.alcoholDrinks, 0),
    symptoms: [...symptomSet],
  };
}

// ---------------------------------------------------------------------------
// Distribuições horárias (gráficos)
// ---------------------------------------------------------------------------

/** Média diária de volume (mL) por hora do relógio (0–23), nos dias incluídos. */
export function hourlyDistribution(items: { timestamp: number; volumeMl: number | null }[], dayCount: number): number[] {
  const hours = new Array<number>(24).fill(0);
  if (dayCount <= 0) return hours;
  for (const item of items) {
    if (item.volumeMl === null) continue;
    hours[new Date(item.timestamp).getHours()] += item.volumeMl;
  }
  return hours.map((v) => v / dayCount);
}
