/**
 * Utilitários de data/hora — funções puras, sem dependências.
 *
 * Todas as conversões usam o fuso horário local do dispositivo. As somas de
 * dias são feitas sobre a data civil (e não somando 24 h), para que a mudança
 * da hora (DST) nunca desloque uma data.
 */
import type { HHMM, ISODate } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidHHMM(value: unknown): value is HHMM {
  return typeof value === 'string' && HHMM_RE.test(value);
}

export function parseHHMM(value: HHMM): { h: number; m: number } {
  const match = HHMM_RE.exec(value);
  if (!match) throw new Error(`Hora inválida: ${value}`);
  return { h: Number(match[1]), m: Number(match[2]) };
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function parseISODate(value: ISODate): { y: number; m: number; d: number } {
  const match = ISO_DATE_RE.exec(value);
  if (!match) throw new Error(`Data inválida: ${value}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Data civil local de um instante. */
export function toISODate(instant: number | Date): ISODate {
  const d = instant instanceof Date ? instant : new Date(instant);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Hora local "HH:MM" de um instante. */
export function toHHMM(instant: number | Date): HHMM {
  const d = instant instanceof Date ? instant : new Date(instant);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Soma dias a uma data civil (independente de DST). */
export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = parseISODate(date);
  const probe = new Date(Date.UTC(y, m - 1, d + days));
  return `${probe.getUTCFullYear()}-${pad2(probe.getUTCMonth() + 1)}-${pad2(probe.getUTCDate())}`;
}

/** Diferença em dias civis (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/**
 * Instante correspondente a uma data e hora locais.
 * Horas inexistentes (salto da hora na Primavera) avançam para a hora válida
 * seguinte; horas ambíguas (Outono) resolvem para a primeira ocorrência.
 */
export function localInstant(date: ISODate, time: HHMM): number {
  const { y, m, d } = parseISODate(date);
  const { h, m: min } = parseHHMM(time);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

/** Primeira ocorrência da hora `time` estritamente depois de `instant`. */
export function firstOccurrenceAfter(instant: number, time: HHMM): number {
  const date = toISODate(instant);
  const sameDay = localInstant(date, time);
  if (sameDay > instant) return sameDay;
  let candidate = localInstant(addDays(date, 1), time);
  // Salvaguarda para horas inexistentes perto de DST.
  if (candidate <= instant) candidate = localInstant(addDays(date, 2), time);
  return candidate;
}

/**
 * Converte uma hora "HH:MM" num instante perto de uma referência.
 * - 'past': a ocorrência mais recente, tolerando até `futureToleranceMin`
 *   minutos no futuro (para registar algo que acabou de acontecer).
 * - 'nearest': a ocorrência mais próxima da referência (edição de eventos).
 */
export function resolveTimeNear(
  reference: number,
  time: HHMM,
  mode: 'past' | 'nearest' = 'past',
  futureToleranceMin = 30,
): number {
  const date = toISODate(reference);
  const candidates = [-1, 0, 1].map((offset) => localInstant(addDays(date, offset), time));
  if (mode === 'nearest') {
    return candidates.reduce((best, c) => (Math.abs(c - reference) < Math.abs(best - reference) ? c : best));
  }
  const limit = reference + futureToleranceMin * MINUTE;
  const valid = candidates.filter((c) => c <= limit);
  return valid.length ? Math.max(...valid) : candidates[0];
}

/** Combina uma data civil e hora num instante (para formulários). */
export function combineDateTime(date: ISODate, time: HHMM): number {
  return localInstant(date, time);
}

export function hoursBetween(a: number, b: number): number {
  return (b - a) / HOUR;
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function weekdayOf(date: ISODate): number {
  const { y, m, d } = parseISODate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayName(date: ISODate, short = false): string {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[weekdayOf(date)];
}

export function monthName(month1to12: number): string {
  return MONTHS[month1to12 - 1];
}

/** "27/09/2026" */
export function formatDate(date: ISODate | number): string {
  const iso = typeof date === 'number' ? toISODate(date) : date;
  const { y, m, d } = parseISODate(iso);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

/** "27/09" */
export function formatDayMonth(date: ISODate | number): string {
  const iso = typeof date === 'number' ? toISODate(date) : date;
  const { m, d } = parseISODate(iso);
  return `${pad2(d)}/${pad2(m)}`;
}

/** "domingo, 27/09/2026" */
export function formatLongDate(date: ISODate): string {
  return `${weekdayName(date)}, ${formatDate(date)}`;
}

/** "27/09/2026 23:30" */
export function formatDateTime(instant: number): string {
  return `${formatDate(instant)} ${toHHMM(instant)}`;
}

/** "7 h 30 min" */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / MINUTE));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${pad2(m)} min`;
}

/** Primeiro dia da semana (0 = domingo, 1 = segunda) que contém `date`. */
export function startOfWeek(date: ISODate, firstDayOfWeek: 0 | 1): ISODate {
  const wd = weekdayOf(date);
  const offset = (wd - firstDayOfWeek + 7) % 7;
  return addDays(date, -offset);
}
