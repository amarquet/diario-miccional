import type { DiaryDay, FluidEvent, UrineEvent } from '../src/domain/types';
import { addDays, localInstant } from '../src/domain/time';

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;

export const PERIOD_ID = 'p1';

export function makeDays(
  startDate: string,
  sleep: { wakeTime?: string | null; bedtime?: string | null; nextWakeTime?: string | null }[],
): DiaryDay[] {
  return sleep.map((s, i) => ({
    id: `day-${i}`,
    diaryPeriodId: PERIOD_ID,
    dayIndex: i,
    date: addDays(startDate, i),
    wakeTime: s.wakeTime ?? null,
    bedtime: s.bedtime ?? null,
    nextWakeTime: s.nextWakeTime ?? null,
    context: [],
    symptoms: [],
    notes: '',
    updatedAt: 0,
  }));
}

/** Instante local: at('2026-09-27', '23:30'). */
export const at = (date: string, time: string) => localInstant(date, time);

export function makeVoid(timestamp: number, volumeMl: number | null, extra: Partial<UrineEvent> = {}): UrineEvent {
  return {
    id: id('u'),
    diaryPeriodId: PERIOD_ID,
    kind: 'void',
    timestamp,
    volumeMl,
    urgencyLevel: null,
    leakage: false,
    leakageSeverity: null,
    awakening: null,
    firstMorningVoid: null,
    periodOverride: 'auto',
    symptoms: [],
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
}

export function makeFluid(timestamp: number, volumeMl: number, extra: Partial<FluidEvent> = {}): FluidEvent {
  return {
    id: id('f'),
    diaryPeriodId: PERIOD_ID,
    timestamp,
    volumeMl,
    beverageType: 'water',
    customBeverage: '',
    caffeine: false,
    alcohol: false,
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
}

export const USUAL = { usualBedtime: '23:00', usualWakeTime: '07:00' };
