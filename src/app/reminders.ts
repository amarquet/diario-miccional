/**
 * Lembretes locais e opcionais.
 *
 * - No ecrã: aviso discreto quando passa demasiado tempo sem registos.
 * - Notificações do sistema: só enquanto a aplicação está aberta ou em segundo
 *   plano recente (limitação dos navegadores; o iOS não permite agendar
 *   notificações sem servidor de push — que não usamos por privacidade).
 * - Calendário (.ics): lembretes agendados no próprio calendário do
 *   dispositivo, 100 % offline. Contêm apenas texto genérico, nunca dados.
 */
import { useEffect } from 'react';
import type { DayWindow } from '../domain/clinical';
import { locateInstant } from '../domain/clinical';
import type { DiaryPeriod, FluidEvent, ReminderSettings, UrineEvent } from '../domain/types';
import { HOUR, MINUTE } from '../domain/time';
import { REMINDER_DRINK, REMINDER_VOID } from '../domain/labels';

export type ReminderKind = 'drink' | 'void';

export interface ReminderInput {
  now: number;
  windows: DayWindow[];
  fluids: Pick<FluidEvent, 'timestamp'>[];
  urine: Pick<UrineEvent, 'timestamp'>[];
  settings: ReminderSettings;
}

/** Quando cada lembrete fica devido (ou null se não aplicável). */
export function reminderDueTimes(input: ReminderInput): Record<ReminderKind, number | null> {
  const none = { drink: null, void: null };
  if (!input.settings.enabled) return none;
  const pos = locateInstant(input.windows, input.now);
  if (pos.state !== 'during' || pos.period !== 'day') return none;
  const w = input.windows[pos.index];
  const last = (items: { timestamp: number }[]) =>
    items.reduce((max, i) => (i.timestamp >= w.wakeAt && i.timestamp <= input.now ? Math.max(max, i.timestamp) : max), w.wakeAt);
  const due = (from: number, hours: number) => {
    const t = from + hours * HOUR;
    return t < w.bedAt ? t : null;
  };
  return {
    drink: due(last(input.fluids), input.settings.drinkIntervalHours),
    void: due(last(input.urine), input.settings.voidIntervalHours),
  };
}

export function dueReminders(input: ReminderInput): ReminderKind[] {
  const times = reminderDueTimes(input);
  return (['drink', 'void'] as const).filter((k) => times[k] !== null && input.now >= times[k]!);
}

export const REMINDER_TEXT: Record<ReminderKind, string> = { drink: REMINDER_DRINK, void: REMINDER_VOID };

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

async function showSystemNotification(kind: ReminderKind) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const options: NotificationOptions = { body: REMINDER_TEXT[kind], tag: `lembrete-${kind}`, lang: 'pt-PT' };
  if (reg) await reg.showNotification('Diário Miccional', options);
  else new Notification('Diário Miccional', options);
}

/** Agenda notificações do sistema enquanto a página existir. */
export function useSystemReminderNotifications(input: ReminderInput | null): void {
  const times = input ? reminderDueTimes(input) : null;
  const enabled = input?.settings.enabled && input.settings.systemNotifications;
  const drinkAt = times?.drink ?? null;
  const voidAt = times?.void ?? null;
  useEffect(() => {
    if (!enabled) return;
    const timers: number[] = [];
    for (const [kind, at] of [['drink', drinkAt], ['void', voidAt]] as const) {
      if (at === null) continue;
      const delay = at - Date.now();
      if (delay < 0 || delay > 12 * HOUR) continue;
      timers.push(
        window.setTimeout(() => {
          if (document.visibilityState === 'hidden') void showSystemNotification(kind);
        }, delay),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [enabled, drinkAt, voidAt]);
}

// ---------------------------------------------------------------------------
// Calendário (.ics)
// ---------------------------------------------------------------------------

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Dobra linhas com mais de 75 octetos (RFC 5545). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (size + len > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += len;
  }
  out.push(current);
  return out.join('\r\n ');
}

const icsLocal = (instant: number) => {
  const d = new Date(instant);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
};
const icsUtc = (instant: number) => new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export interface CalendarReminder {
  at: number;
  title: string;
  description: string;
}

export function planCalendarReminders(windows: DayWindow[], intervalHours: number): CalendarReminder[] {
  const out: CalendarReminder[] = [];
  const step = Math.max(1, intervalHours) * HOUR;
  windows.forEach((w, i) => {
    out.push({
      at: w.wakeAt,
      title: `Diário Miccional · Dia ${i + 1}`,
      description: 'Regista a hora a que te levantaste e a primeira micção da manhã.',
    });
    for (let t = w.wakeAt + step; t <= w.bedAt - 45 * MINUTE; t += step) {
      out.push({ at: t, title: 'Diário Miccional', description: `${REMINDER_DRINK} ${REMINDER_VOID}` });
    }
    out.push({
      at: w.bedAt - 15 * MINUTE,
      title: 'Diário Miccional · Antes de deitar',
      description: 'Regista a hora de deitar. Se acordares para urinar durante a noite, regista também.',
    });
  });
  const last = windows[windows.length - 1];
  if (last) {
    out.push({
      at: last.nextWakeAt,
      title: 'Diário Miccional · Último passo',
      description: 'Regista a hora a que te levantaste e a primeira micção desta manhã.',
    });
  }
  return out;
}

export function buildReminderCalendar(period: DiaryPeriod, reminders: CalendarReminder[], now = Date.now()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Diario Miccional//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Diário Miccional',
  ];
  reminders.forEach((r, i) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${period.id}-${i}@diario-miccional.local`,
      `DTSTAMP:${icsUtc(now)}`,
      `DTSTART:${icsLocal(r.at)}`,
      `DTEND:${icsLocal(r.at + 5 * MINUTE)}`,
      `SUMMARY:${icsEscape(r.title)}`,
      `DESCRIPTION:${icsEscape(r.description)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(r.description)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

