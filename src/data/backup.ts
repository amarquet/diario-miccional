/**
 * Cópia de segurança em JSON: criação, validação e migração de versões.
 * Os dados importados são validados campo a campo antes de qualquer escrita.
 */
import type {
  DataSet,
  DiaryDay,
  DiaryPeriod,
  FluidEvent,
  Settings,
  UrineEvent,
} from '../domain/types';
import {
  BEVERAGE_TYPES,
  CONTEXT_FLAGS,
  LEAKAGE_SEVERITIES,
  SYMPTOM_FLAGS,
} from '../domain/types';
import { isValidHHMM, isValidISODate } from '../domain/time';
import { LIMITS, sanitizeLine, sanitizeText } from '../domain/validation';
import { mergeSettings } from './repository';

export const BACKUP_APP_ID = 'diario-miccional';
export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  /** true quando exportado do modo de demonstração. */
  demo: boolean;
  settings?: Settings;
  data: DataSet;
}

export function createBackup(
  data: DataSet,
  options: { settings?: Settings; demo: boolean; appVersion: string; now?: number },
): BackupFile {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: options.appVersion,
    exportedAt: new Date(options.now ?? Date.now()).toISOString(),
    demo: options.demo,
    ...(options.settings ? { settings: options.settings } : {}),
    data,
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

/** Subconjunto de dados de um só diário. */
export function filterDataSet(data: DataSet, periodId: string): DataSet {
  return {
    periods: data.periods.filter((p) => p.id === periodId),
    days: data.days.filter((d) => d.diaryPeriodId === periodId),
    fluids: data.fluids.filter((f) => f.diaryPeriodId === periodId),
    urine: data.urine.filter((u) => u.diaryPeriodId === periodId),
  };
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

export interface BackupSummary {
  periods: number;
  days: number;
  fluids: number;
  urine: number;
  exportedAt: string;
  demo: boolean;
  titles: string[];
}

export type ParseBackupResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isId = (v: unknown): v is string => isStr(v) && v.length > 0 && v.length <= 100;

class Collector {
  errors: string[] = [];
  check(condition: boolean, message: string): boolean {
    if (!condition && this.errors.length < 50) this.errors.push(message);
    return condition;
  }
}

function hhmmOrNull(v: unknown): boolean {
  return v === null || isValidHHMM(v);
}

function flagList<T extends string>(v: unknown, allowed: readonly T[]): v is T[] {
  return Array.isArray(v) && v.every((x) => allowed.includes(x as T));
}

function parsePeriod(raw: unknown, i: number, c: Collector): DiaryPeriod | null {
  const where = `Diário n.º ${i + 1}`;
  if (!c.check(isObj(raw), `${where}: formato inválido.`)) return null;
  const r = raw as Obj;
  const ok =
    c.check(isId(r.id), `${where}: identificador inválido.`) &&
    c.check(isValidISODate(r.startDate), `${where}: data de início inválida.`) &&
    c.check(
      isNum(r.numberOfDays) && Number.isInteger(r.numberOfDays) && r.numberOfDays >= 1 && r.numberOfDays <= LIMITS.maxDiaryDays,
      `${where}: número de dias inválido.`,
    ) &&
    c.check(isNum(r.createdAt) && isNum(r.updatedAt), `${where}: datas de registo inválidas.`);
  if (!ok) return null;
  return {
    id: r.id as string,
    title: sanitizeLine(r.title, LIMITS.titleMaxLength) || 'Diário Miccional',
    startDate: r.startDate as string,
    numberOfDays: r.numberOfDays as number,
    createdAt: r.createdAt as number,
    updatedAt: r.updatedAt as number,
    notes: sanitizeText(r.notes),
  };
}

function parseDay(raw: unknown, i: number, c: Collector): DiaryDay | null {
  const where = `Dia n.º ${i + 1}`;
  if (!c.check(isObj(raw), `${where}: formato inválido.`)) return null;
  const r = raw as Obj;
  const ok =
    c.check(isId(r.id) && isId(r.diaryPeriodId), `${where}: identificador inválido.`) &&
    c.check(isNum(r.dayIndex) && Number.isInteger(r.dayIndex) && r.dayIndex >= 0, `${where}: índice inválido.`) &&
    c.check(isValidISODate(r.date), `${where}: data inválida.`) &&
    c.check(
      hhmmOrNull(r.wakeTime) && hhmmOrNull(r.bedtime) && hhmmOrNull(r.nextWakeTime),
      `${where}: horas de sono inválidas.`,
    ) &&
    c.check(flagList(r.context ?? [], CONTEXT_FLAGS), `${where}: contexto inválido.`) &&
    c.check(flagList(r.symptoms ?? [], SYMPTOM_FLAGS), `${where}: sintomas inválidos.`);
  if (!ok) return null;
  return {
    id: r.id as string,
    diaryPeriodId: r.diaryPeriodId as string,
    dayIndex: r.dayIndex as number,
    date: r.date as string,
    wakeTime: (r.wakeTime as string | null) ?? null,
    bedtime: (r.bedtime as string | null) ?? null,
    nextWakeTime: (r.nextWakeTime as string | null) ?? null,
    context: [...new Set((r.context ?? []) as DiaryDay['context'])],
    symptoms: [...new Set((r.symptoms ?? []) as DiaryDay['symptoms'])],
    notes: sanitizeText(r.notes),
    updatedAt: isNum(r.updatedAt) ? r.updatedAt : 0,
  };
}

function parseFluid(raw: unknown, i: number, c: Collector): FluidEvent | null {
  const where = `Bebida n.º ${i + 1}`;
  if (!c.check(isObj(raw), `${where}: formato inválido.`)) return null;
  const r = raw as Obj;
  const ok =
    c.check(isId(r.id) && isId(r.diaryPeriodId), `${where}: identificador inválido.`) &&
    c.check(isNum(r.timestamp), `${where}: hora inválida.`) &&
    c.check(isNum(r.volumeMl) && r.volumeMl >= 0 && r.volumeMl <= LIMITS.absoluteMaxMl, `${where}: volume inválido.`) &&
    c.check(BEVERAGE_TYPES.includes(r.beverageType as never), `${where}: tipo de bebida inválido.`);
  if (!ok) return null;
  return {
    id: r.id as string,
    diaryPeriodId: r.diaryPeriodId as string,
    timestamp: r.timestamp as number,
    volumeMl: r.volumeMl as number,
    beverageType: r.beverageType as FluidEvent['beverageType'],
    customBeverage: sanitizeLine(r.customBeverage, LIMITS.customBeverageMaxLength),
    caffeine: r.caffeine === true,
    alcohol: r.alcohol === true,
    notes: sanitizeText(r.notes),
    createdAt: isNum(r.createdAt) ? r.createdAt : (r.timestamp as number),
    updatedAt: isNum(r.updatedAt) ? r.updatedAt : (r.timestamp as number),
  };
}

function parseUrine(raw: unknown, i: number, c: Collector): UrineEvent | null {
  const where = `Micção n.º ${i + 1}`;
  if (!c.check(isObj(raw), `${where}: formato inválido.`)) return null;
  const r = raw as Obj;
  const urgencyOk = r.urgencyLevel === null || r.urgencyLevel === undefined || [0, 1, 2, 3, 4].includes(r.urgencyLevel as number);
  const ok =
    c.check(isId(r.id) && isId(r.diaryPeriodId), `${where}: identificador inválido.`) &&
    c.check(r.kind === 'void' || r.kind === 'leak_only', `${where}: tipo inválido.`) &&
    c.check(isNum(r.timestamp), `${where}: hora inválida.`) &&
    c.check(
      r.volumeMl === null || (isNum(r.volumeMl) && r.volumeMl >= 0 && r.volumeMl <= LIMITS.absoluteMaxMl),
      `${where}: volume inválido.`,
    ) &&
    c.check(urgencyOk, `${where}: urgência inválida.`) &&
    c.check(
      r.leakageSeverity === null || r.leakageSeverity === undefined || LEAKAGE_SEVERITIES.includes(r.leakageSeverity as never),
      `${where}: gravidade da perda inválida.`,
    ) &&
    c.check(
      r.awakening === null || r.awakening === undefined || r.awakening === 'woke_to_void' || r.awakening === 'already_awake',
      `${where}: contexto nocturno inválido.`,
    ) &&
    c.check(
      r.periodOverride === undefined || ['auto', 'day', 'night'].includes(r.periodOverride as string),
      `${where}: classificação inválida.`,
    ) &&
    c.check(flagList(r.symptoms ?? [], SYMPTOM_FLAGS), `${where}: sintomas inválidos.`);
  if (!ok) return null;
  const leakage = r.leakage === true;
  return {
    id: r.id as string,
    diaryPeriodId: r.diaryPeriodId as string,
    kind: r.kind as UrineEvent['kind'],
    timestamp: r.timestamp as number,
    volumeMl: (r.volumeMl as number | null) ?? null,
    urgencyLevel: (r.urgencyLevel as UrineEvent['urgencyLevel']) ?? null,
    leakage,
    leakageSeverity: leakage ? ((r.leakageSeverity as UrineEvent['leakageSeverity']) ?? null) : null,
    awakening: (r.awakening as UrineEvent['awakening']) ?? null,
    firstMorningVoid: typeof r.firstMorningVoid === 'boolean' ? r.firstMorningVoid : null,
    periodOverride: (r.periodOverride as UrineEvent['periodOverride']) ?? 'auto',
    symptoms: [...new Set((r.symptoms ?? []) as UrineEvent['symptoms'])],
    notes: sanitizeText(r.notes),
    createdAt: isNum(r.createdAt) ? r.createdAt : (r.timestamp as number),
    updatedAt: isNum(r.updatedAt) ? r.updatedAt : (r.timestamp as number),
  };
}

/** Converte cópias de versões antigas para o esquema actual. */
export function migrateBackup(raw: Obj): Obj {
  const version = isNum(raw.schemaVersion) ? raw.schemaVersion : 1;
  // Versão 1 é a actual. Futuras migrações: if (version < 2) { ... }
  return { ...raw, schemaVersion: Math.max(version, 1) };
}

export function parseBackup(text: string): ParseBackupResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, errors: ['O ficheiro é demasiado grande.'] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['O ficheiro não é um JSON válido.'] };
  }
  if (!isObj(json) || json.app !== BACKUP_APP_ID) {
    return { ok: false, errors: ['Este ficheiro não é uma cópia de segurança do Diário Miccional.'] };
  }
  if (isNum(json.schemaVersion) && json.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: ['Esta cópia foi criada por uma versão mais recente da aplicação. Atualiza a aplicação e tenta de novo.'],
    };
  }
  const migrated = migrateBackup(json);
  const data = migrated.data;
  if (!isObj(data)) return { ok: false, errors: ['A cópia não contém dados.'] };
  const c = new Collector();
  for (const key of ['periods', 'days', 'fluids', 'urine'] as const) {
    c.check(Array.isArray(data[key]), `Secção "${key}" em falta ou inválida.`);
  }
  if (c.errors.length) return { ok: false, errors: c.errors };

  const periods = (data.periods as unknown[]).map((r, i) => parsePeriod(r, i, c));
  const days = (data.days as unknown[]).map((r, i) => parseDay(r, i, c));
  const fluids = (data.fluids as unknown[]).map((r, i) => parseFluid(r, i, c));
  const urine = (data.urine as unknown[]).map((r, i) => parseUrine(r, i, c));
  if (c.errors.length) return { ok: false, errors: c.errors };

  const dataSet: DataSet = {
    periods: periods as DiaryPeriod[],
    days: days as DiaryDay[],
    fluids: fluids as FluidEvent[],
    urine: urine as UrineEvent[],
  };

  // Integridade: identificadores únicos e referências a diários existentes.
  const periodIds = new Set(dataSet.periods.map((p) => p.id));
  c.check(periodIds.size === dataSet.periods.length, 'Existem diários com identificadores repetidos.');
  for (const key of ['days', 'fluids', 'urine'] as const) {
    const ids = new Set<string>();
    for (const record of dataSet[key]) {
      c.check(!ids.has(record.id), 'Existem registos com identificadores repetidos.');
      ids.add(record.id);
      c.check(periodIds.has(record.diaryPeriodId), 'Existem registos associados a um diário inexistente.');
    }
  }
  if (c.errors.length) return { ok: false, errors: [...new Set(c.errors)] };

  const backup: BackupFile = {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: isStr(migrated.appVersion) ? migrated.appVersion : 'desconhecida',
    exportedAt: isStr(migrated.exportedAt) ? migrated.exportedAt : '',
    demo: migrated.demo === true,
    ...(isObj(migrated.settings) ? { settings: mergeSettings(migrated.settings) } : {}),
    data: dataSet,
  };
  return {
    ok: true,
    backup,
    summary: {
      periods: dataSet.periods.length,
      days: dataSet.days.length,
      fluids: dataSet.fluids.length,
      urine: dataSet.urine.length,
      exportedAt: backup.exportedAt,
      demo: backup.demo,
      titles: dataSet.periods.map((p) => p.title),
    },
  };
}
