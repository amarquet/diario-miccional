/**
 * Modelo de dados do Diário Miccional.
 *
 * Convenções:
 * - ISODate: data civil local "AAAA-MM-DD".
 * - HHMM: hora local "HH:MM" (24 h).
 * - timestamp: instante absoluto em milissegundos (epoch). A hora local é
 *   sempre derivada do fuso horário do dispositivo, o que torna os cálculos
 *   robustos à mudança da hora (DST).
 * - Os eventos não guardam o dia do diário a que pertencem: o dia é derivado
 *   do timestamp e das horas de deitar/levantar. Assim, corrigir a hora de
 *   deitar reclassifica automaticamente os eventos, sem dados desatualizados.
 */

export type ISODate = string;
export type HHMM = string;

export interface DiaryPeriod {
  id: string;
  title: string;
  startDate: ISODate;
  numberOfDays: number;
  createdAt: number;
  updatedAt: number;
  notes: string;
}

export const CONTEXT_FLAGS = [
  'alcohol',
  'caffeine',
  'exercise',
  'hot_day',
  'medication',
  'poor_sleep',
] as const;
export type ContextFlag = (typeof CONTEXT_FLAGS)[number];

export const SYMPTOM_FLAGS = [
  'blood',
  'retention',
  'fever',
  'severe_pain',
  'sudden_major_leak',
] as const;
export type SymptomFlag = (typeof SYMPTOM_FLAGS)[number];

export interface DiaryDay {
  id: string;
  diaryPeriodId: string;
  /** 0 = primeiro dia do diário. */
  dayIndex: number;
  date: ISODate;
  /** Hora a que se levantou em `date` (início do período de 24 h). */
  wakeTime: HHMM | null;
  /** Hora a que se deitou (pode ser depois da meia-noite). */
  bedtime: HHMM | null;
  /** Hora a que se levantou na manhã seguinte (fim da noite). */
  nextWakeTime: HHMM | null;
  context: ContextFlag[];
  symptoms: SymptomFlag[];
  notes: string;
  updatedAt: number;
}

export const BEVERAGE_TYPES = [
  'water',
  'coffee',
  'tea',
  'milk',
  'soft_drink',
  'alcohol',
  'energy_drink',
  'juice',
  'other',
] as const;
export type BeverageType = (typeof BEVERAGE_TYPES)[number];

export interface FluidEvent {
  id: string;
  diaryPeriodId: string;
  timestamp: number;
  volumeMl: number;
  beverageType: BeverageType;
  /** Nome livre quando beverageType === 'other'. */
  customBeverage: string;
  caffeine: boolean;
  alcohol: boolean;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type UrgencyLevel = 0 | 1 | 2 | 3 | 4;
export const LEAKAGE_SEVERITIES = ['small', 'moderate', 'large'] as const;
export type LeakageSeverity = (typeof LEAKAGE_SEVERITIES)[number];
/** Contexto de uma micção nocturna. */
export type Awakening = 'woke_to_void' | 'already_awake';
/** Classificação manual quando a automática é ambígua. */
export type PeriodOverride = 'auto' | 'day' | 'night';
/** 'void' = micção; 'leak_only' = perda urinária sem micção. */
export type UrineEventKind = 'void' | 'leak_only';

export interface UrineEvent {
  id: string;
  diaryPeriodId: string;
  kind: UrineEventKind;
  timestamp: number;
  /** null = volume não medido. */
  volumeMl: number | null;
  urgencyLevel: UrgencyLevel | null;
  leakage: boolean;
  leakageSeverity: LeakageSeverity | null;
  awakening: Awakening | null;
  /** true/false = indicado pelo utilizador; null = detecção automática. */
  firstMorningVoid: boolean | null;
  periodOverride: PeriodOverride;
  symptoms: SymptomFlag[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type UrgencyScale = 'numeric' | 'descriptive';
/**
 * 'ics' — definição da International Continence Society: o volume nocturno
 *         inclui a primeira micção depois de se levantar, e o volume de 24 h
 *         vai da micção seguinte à primeira da manhã até à primeira micção da
 *         manhã seguinte (inclusive).
 * 'sleep_only' — apenas as micções entre deitar e levantar; 24 h = de
 *         levantar a levantar.
 */
export type NocturnalVolumeMethod = 'ics' | 'sleep_only';

export interface ReminderSettings {
  enabled: boolean;
  /** Mostrar lembrete se não houver bebida registada há X horas (período diurno). */
  drinkIntervalHours: number;
  /** Mostrar lembrete se não houver micção registada há X horas (período diurno). */
  voidIntervalHours: number;
  /** Usar notificações do sistema (quando suportado e autorizado). */
  systemNotifications: boolean;
}

export interface Settings {
  onboardingDone: boolean;
  language: 'pt-PT';
  volumeUnit: 'mL';
  firstDayOfWeek: 0 | 1;
  defaultDiaryDays: number;
  usualBedtime: HHMM;
  usualWakeTime: HHMM;
  urgencyScale: UrgencyScale;
  /** Nível mínimo (0–4) contado como episódio de urgência. */
  urgencyThreshold: 2 | 3;
  nocturnalVolumeMethod: NocturnalVolumeMethod;
  reminders: ReminderSettings;
  lastBeverageType: BeverageType;
}

export const DEFAULT_SETTINGS: Settings = {
  onboardingDone: false,
  language: 'pt-PT',
  volumeUnit: 'mL',
  firstDayOfWeek: 1,
  defaultDiaryDays: 3,
  usualBedtime: '23:00',
  usualWakeTime: '07:00',
  urgencyScale: 'descriptive',
  urgencyThreshold: 3,
  nocturnalVolumeMethod: 'ics',
  reminders: {
    enabled: false,
    drinkIntervalHours: 3,
    voidIntervalHours: 4,
    systemNotifications: false,
  },
  lastBeverageType: 'water',
};

/** Conjunto completo de dados (usado para cópias de segurança). */
export interface DataSet {
  periods: DiaryPeriod[];
  days: DiaryDay[];
  fluids: FluidEvent[];
  urine: UrineEvent[];
}
