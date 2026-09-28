/** Normalização das definições: qualquer valor inválido volta ao valor por omissão. */
import { BEVERAGE_TYPES, DEFAULT_SETTINGS, type Settings } from './types';
import { isValidHHMM } from './time';
import { LIMITS } from './validation';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function pick<T>(value: unknown, valid: (v: unknown) => boolean, fallback: T): T {
  return valid(value) ? (value as T) : fallback;
}

const intIn = (min: number, max: number) => (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function normalizeSettings(raw: unknown): Settings {
  const r: Obj = isObj(raw) ? raw : {};
  const rem: Obj = isObj(r.reminders) ? r.reminders : {};
  const d = DEFAULT_SETTINGS;
  return {
    onboardingDone: r.onboardingDone === true,
    language: 'pt-PT',
    volumeUnit: 'mL',
    firstDayOfWeek: pick(r.firstDayOfWeek, (v) => v === 0 || v === 1, d.firstDayOfWeek),
    defaultDiaryDays: pick(r.defaultDiaryDays, intIn(1, LIMITS.maxDiaryDays), d.defaultDiaryDays),
    usualBedtime: pick(r.usualBedtime, isValidHHMM, d.usualBedtime),
    usualWakeTime: pick(r.usualWakeTime, isValidHHMM, d.usualWakeTime),
    urgencyScale: pick(r.urgencyScale, (v) => v === 'numeric' || v === 'descriptive', d.urgencyScale),
    urgencyThreshold: pick(r.urgencyThreshold, (v) => v === 2 || v === 3, d.urgencyThreshold),
    nocturnalVolumeMethod: pick(r.nocturnalVolumeMethod, (v) => v === 'ics' || v === 'sleep_only', d.nocturnalVolumeMethod),
    reminders: {
      enabled: rem.enabled === true,
      drinkIntervalHours: pick(rem.drinkIntervalHours, intIn(1, 8), d.reminders.drinkIntervalHours),
      voidIntervalHours: pick(rem.voidIntervalHours, intIn(1, 8), d.reminders.voidIntervalHours),
      systemNotifications: rem.systemNotifications === true,
    },
    lastBeverageType: pick(r.lastBeverageType, (v) => BEVERAGE_TYPES.includes(v as never), d.lastBeverageType),
  };
}
