import { describe, expect, it } from 'vitest';
import { parseHash, routeToHash, type Route } from '../src/app/router';
import { buildReminderCalendar, dueReminders, planCalendarReminders, reminderDueTimes } from '../src/app/reminders';
import { resolveDayWindows, calculatePeriodSummary } from '../src/domain/clinical';
import { buildObservations } from '../src/domain/observations';
import { formatAverage, formatMl, formatNumber, formatPercent } from '../src/domain/format';
import {
  addDays,
  firstOccurrenceAfter,
  formatDate,
  formatDuration,
  resolveTimeNear,
  startOfWeek,
  toHHMM,
} from '../src/domain/time';
import { parseVolumeInput, validateFluidInput, validateUrineInput } from '../src/domain/validation';
import { normalizeSettings } from '../src/domain/settings';
import { buildDemoData } from '../src/data/demo';
import { DEFAULT_SETTINGS } from '../src/domain/types';
import { USUAL, at, makeDays } from './factories';

describe('tempo e datas', () => {
  it('formata datas DD/MM/AAAA e horas 24 h', () => {
    expect(formatDate('2026-09-27')).toBe('27/09/2026');
    expect(toHHMM(at('2026-09-27', '23:05'))).toBe('23:05');
    expect(formatDuration(7.5 * 3_600_000)).toBe('7 h 30 min');
  });

  it('soma dias atravessando meses e anos', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('primeira ocorrência de uma hora depois de um instante', () => {
    expect(firstOccurrenceAfter(at('2026-09-27', '07:00'), '23:30')).toBe(at('2026-09-27', '23:30'));
    expect(firstOccurrenceAfter(at('2026-09-27', '23:30'), '07:00')).toBe(at('2026-09-28', '07:00'));
  });

  it('registo às 00:10 de algo às 23:55 fica no dia anterior', () => {
    expect(resolveTimeNear(at('2026-09-28', '00:10'), '23:55', 'past')).toBe(at('2026-09-27', '23:55'));
    expect(resolveTimeNear(at('2026-09-28', '10:00'), '10:20', 'past')).toBe(at('2026-09-28', '10:20'));
    expect(resolveTimeNear(at('2026-09-28', '01:00'), '23:00', 'nearest')).toBe(at('2026-09-27', '23:00'));
  });

  it('início da semana respeita a definição', () => {
    expect(startOfWeek('2026-09-27', 1)).toBe('2026-09-21'); // segunda
    expect(startOfWeek('2026-09-27', 0)).toBe('2026-09-27'); // domingo
  });
});

describe('formatação pt-PT', () => {
  it('vírgula decimal e espaço de milhares a partir de 10 000', () => {
    expect(formatNumber(1250)).toBe('1250');
    expect(formatNumber(12500)).toBe('12 500');
    expect(formatNumber(30.94, 1)).toBe('30,9');
    expect(formatMl(250)).toBe('250 mL');
    expect(formatPercent(null)).toBe('—');
    expect(formatAverage(5 / 3)).toBe('1,7');
    expect(formatAverage(2)).toBe('2');
  });
});

describe('validação', () => {
  const now = at('2026-09-27', '12:00');
  it('volume negativo é inválido; hora em falta é inválida', () => {
    expect(validateFluidInput({ timestamp: now, volumeMl: -1 }, now).errors).toHaveLength(1);
    expect(validateUrineInput({ timestamp: null, volumeMl: 200, kind: 'void' }, now).errors).toEqual(['Indica a hora.']);
  });
  it('líquidos > 5000 mL e urina > 2000 mL geram aviso, não erro', () => {
    const f = validateFluidInput({ timestamp: now, volumeMl: 5500 }, now);
    expect(f.errors).toHaveLength(0);
    expect(f.warnings).toHaveLength(1);
    const u = validateUrineInput({ timestamp: now, volumeMl: 2100, kind: 'void' }, now);
    expect(u.errors).toHaveLength(0);
    expect(u.warnings).toHaveLength(1);
  });
  it('micção com 0 mL gera aviso; sem volume é permitido', () => {
    expect(validateUrineInput({ timestamp: now, volumeMl: 0, kind: 'void' }, now).warnings).toHaveLength(1);
    expect(validateUrineInput({ timestamp: now, volumeMl: null, kind: 'void' }, now)).toEqual({ errors: [], warnings: [] });
  });
  it('lê vírgula decimal e rejeita texto', () => {
    expect(parseVolumeInput('250')).toBe(250);
    expect(parseVolumeInput('250,5')).toBe(250.5);
    expect(parseVolumeInput('')).toBeNull();
    expect(Number.isNaN(parseVolumeInput('abc'))).toBe(true);
  });
  it('definições importadas inválidas voltam ao valor por omissão', () => {
    expect(normalizeSettings({ usualWakeTime: '7h', defaultDiaryDays: 99 })).toMatchObject({
      usualWakeTime: '07:00',
      defaultDiaryDays: 3,
    });
  });
});

describe('observações descritivas (sem diagnóstico)', () => {
  const data = buildDemoData('2026-09-23', 0);
  const summary = calculatePeriodSummary(data.days, data.fluids, data.urine, USUAL, {
    method: 'ics',
    urgencyThreshold: 3,
    now: at('2026-09-27', '12:00'),
  });
  const obs = buildObservations(summary, 3);

  it('descreve os dados de forma neutra', () => {
    expect(obs[0]).toBe('Nos 3 dias registados, a média foi de 1,7 micções nocturnas por noite.');
    expect(obs).toContain('Os volumes das micções nocturnas (média 140 mL) foram inferiores aos volumes médios diurnos (242 mL).');
    expect(obs).toContain('Foi registado 1 episódio de perda urinária.');
    expect(obs).toContain('Foram registados 4 episódios de urgência (nível 3 ou superior).');
    expect(obs[obs.length - 1]).toBe('Este padrão pode ser relevante para discutir com o urologista.');
  });

  it('nunca produz linguagem diagnóstica', () => {
    const text = obs.join(' ').toLowerCase();
    for (const forbidden of ['bexiga hiperativa', 'hiperactiva', 'hipertrofia', 'próstata', 'poliúria nocturna', 'diagnóstico', 'tem ', 'sofre']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('sem perdas: frase neutra', () => {
    const noLeaks = { ...data, urine: data.urine.map((u) => ({ ...u, leakage: false, leakageSeverity: null })) };
    const s = calculatePeriodSummary(noLeaks.days, noLeaks.fluids, noLeaks.urine, USUAL, {
      method: 'ics',
      urgencyThreshold: 3,
      now: at('2026-09-27', '12:00'),
    });
    expect(buildObservations(s, 3)).toContain('Não foram registados episódios de perda urinária.');
  });
});

describe('lembretes', () => {
  const days = makeDays('2026-09-27', [{ wakeTime: '07:00', bedtime: '23:00', nextWakeTime: '07:00' }]);
  const windows = resolveDayWindows(days, USUAL);
  const settings = { ...DEFAULT_SETTINGS.reminders, enabled: true, drinkIntervalHours: 3, voidIntervalHours: 4 };

  it('lembra de registar bebida/micção após o intervalo, só de dia', () => {
    const input = { windows, settings, fluids: [{ timestamp: at('2026-09-27', '08:00') }], urine: [{ timestamp: at('2026-09-27', '09:00') }] };
    expect(dueReminders({ ...input, now: at('2026-09-27', '10:30') })).toEqual([]);
    expect(dueReminders({ ...input, now: at('2026-09-27', '11:30') })).toEqual(['drink']);
    expect(dueReminders({ ...input, now: at('2026-09-27', '13:10') })).toEqual(['drink', 'void']);
    expect(dueReminders({ ...input, now: at('2026-09-28', '02:00') })).toEqual([]); // noite
    expect(reminderDueTimes({ ...input, now: at('2026-09-27', '10:00'), settings: { ...settings, enabled: false } })).toEqual({ drink: null, void: null });
  });

  it('calendário .ics válido, local, sem dados de saúde', () => {
    const ics = buildReminderCalendar(
      { id: 'p1', title: 'x', startDate: '2026-09-27', numberOfDays: 1, createdAt: 0, updatedAt: 0, notes: 'segredo clínico' },
      planCalendarReminders(windows, 3),
      at('2026-09-27', '06:00'),
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('DTSTART:20260927T070000');
    expect(ics).not.toContain('segredo');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});

describe('encaminhamento (URLs sem dados de saúde)', () => {
  it('ida e volta entre hash e rota', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'diaries' },
      { name: 'diary', id: 'abc-123' },
      { name: 'day', id: 'abc-123', dayNumber: 2 },
      { name: 'summary', id: null },
      { name: 'report', id: 'abc-123' },
      { name: 'settings', section: 'privacy' },
    ];
    for (const r of routes) expect(parseHash(routeToHash(r))).toEqual(r);
  });
  it('ignora identificadores suspeitos', () => {
    expect(parseHash('#/diarios/<script>')).toEqual({ name: 'diaries' });
    expect(parseHash('#/qualquer')).toEqual({ name: 'home' });
  });
});
