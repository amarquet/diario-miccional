/**
 * Camada de persistência: todas as operações de leitura/escrita em IndexedDB.
 * Não contém lógica de apresentação nem cálculos clínicos.
 */
import type {
  DataSet,
  DiaryDay,
  DiaryPeriod,
  FluidEvent,
  HHMM,
  ISODate,
  Settings,
  UrineEvent,
} from '../domain/types';
import { normalizeSettings } from '../domain/settings';
import { addDays, parseISODate, monthName } from '../domain/time';
import { LIMITS, sanitizeLine, sanitizeText } from '../domain/validation';
import { openDiarioDB, type DiarioDB } from './db';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function defaultPeriodTitle(startDate: ISODate): string {
  const { y, m } = parseISODate(startDate);
  const month = monthName(m);
  return `Diário Miccional – ${month.charAt(0).toUpperCase()}${month.slice(1)} ${y}`;
}

/** Definições guardadas, validadas e completadas com os valores por omissão. */
export const mergeSettings = (stored: unknown): Settings => normalizeSettings(stored);

export interface CreatePeriodInput {
  startDate: ISODate;
  numberOfDays: number;
  title?: string;
  notes?: string;
  firstWakeTime?: HHMM | null;
}

export type FluidInput = Omit<FluidEvent, 'id' | 'createdAt' | 'updatedAt'>;
export type UrineInput = Omit<UrineEvent, 'id' | 'createdAt' | 'updatedAt'>;
export type SleepPatch = Partial<Pick<DiaryDay, 'wakeTime' | 'bedtime' | 'nextWakeTime'>>;
export type DayPatch = Partial<Pick<DiaryDay, 'context' | 'symptoms' | 'notes'>>;

export interface ImportReport {
  periodsAdded: number;
  daysAdded: number;
  fluidsAdded: number;
  urineAdded: number;
  skippedExisting: number;
}

const ALL_STORES = ['periods', 'days', 'fluids', 'urine'] as const;

export class DiaryRepository {
  private constructor(
    private readonly db: DiarioDB,
    readonly dbName: string,
    private readonly now: () => number = Date.now,
  ) {}

  static async open(dbName?: string, now?: () => number): Promise<DiaryRepository> {
    const db = await openDiarioDB(dbName);
    return new DiaryRepository(db, dbName ?? db.name, now);
  }

  close(): void {
    this.db.close();
  }

  // ------------------------------------------------------------------ settings
  async getSettings(): Promise<Settings> {
    const row = await this.db.get('settings', 'app');
    return mergeSettings(row?.value);
  }

  async saveSettings(settings: Settings): Promise<Settings> {
    const merged = mergeSettings(settings);
    await this.db.put('settings', { key: 'app', value: merged });
    return merged;
  }

  // ---------------------------------------------------------------------- load
  async loadAll(): Promise<DataSet> {
    const tx = this.db.transaction([...ALL_STORES], 'readonly');
    const [periods, days, fluids, urine] = await Promise.all([
      tx.objectStore('periods').getAll(),
      tx.objectStore('days').getAll(),
      tx.objectStore('fluids').getAll(),
      tx.objectStore('urine').getAll(),
    ]);
    await tx.done;
    return { periods, days, fluids, urine };
  }

  async getPeriodData(periodId: string): Promise<DataSet> {
    const tx = this.db.transaction([...ALL_STORES], 'readonly');
    const [period, days, fluids, urine] = await Promise.all([
      tx.objectStore('periods').get(periodId),
      tx.objectStore('days').index('byPeriod').getAll(periodId),
      tx.objectStore('fluids').index('byPeriod').getAll(periodId),
      tx.objectStore('urine').index('byPeriod').getAll(periodId),
    ]);
    await tx.done;
    return { periods: period ? [period] : [], days, fluids, urine };
  }

  // ------------------------------------------------------------------- periods
  async createPeriod(input: CreatePeriodInput): Promise<{ period: DiaryPeriod; days: DiaryDay[] }> {
    const now = this.now();
    const numberOfDays = Math.min(Math.max(1, Math.round(input.numberOfDays)), LIMITS.maxDiaryDays);
    const period: DiaryPeriod = {
      id: newId(),
      title: sanitizeLine(input.title, LIMITS.titleMaxLength) || defaultPeriodTitle(input.startDate),
      startDate: input.startDate,
      numberOfDays,
      createdAt: now,
      updatedAt: now,
      notes: sanitizeText(input.notes ?? ''),
    };
    const days = Array.from({ length: numberOfDays }, (_, i) =>
      this.makeDay(period.id, i, addDays(input.startDate, i), i === 0 ? (input.firstWakeTime ?? null) : null),
    );
    const tx = this.db.transaction(['periods', 'days'], 'readwrite');
    await Promise.all([tx.objectStore('periods').put(period), ...days.map((d) => tx.objectStore('days').put(d)), tx.done]);
    return { period, days };
  }

  private makeDay(periodId: string, index: number, date: ISODate, wakeTime: HHMM | null): DiaryDay {
    return {
      id: newId(),
      diaryPeriodId: periodId,
      dayIndex: index,
      date,
      wakeTime,
      bedtime: null,
      nextWakeTime: null,
      context: [],
      symptoms: [],
      notes: '',
      updatedAt: this.now(),
    };
  }

  async updatePeriod(id: string, patch: Partial<Pick<DiaryPeriod, 'title' | 'notes'>>): Promise<DiaryPeriod> {
    const tx = this.db.transaction('periods', 'readwrite');
    const current = await tx.store.get(id);
    if (!current) throw new Error('Diário não encontrado.');
    const updated: DiaryPeriod = {
      ...current,
      ...(patch.title !== undefined
        ? { title: sanitizeLine(patch.title, LIMITS.titleMaxLength) || current.title }
        : {}),
      ...(patch.notes !== undefined ? { notes: sanitizeText(patch.notes) } : {}),
      updatedAt: this.now(),
    };
    await tx.store.put(updated);
    await tx.done;
    return updated;
  }

  /** Altera a duração do diário. Os eventos nunca são apagados. */
  async setNumberOfDays(id: string, numberOfDays: number): Promise<{ period: DiaryPeriod; days: DiaryDay[] }> {
    const n = Math.min(Math.max(1, Math.round(numberOfDays)), LIMITS.maxDiaryDays);
    const tx = this.db.transaction(['periods', 'days'], 'readwrite');
    const period = await tx.objectStore('periods').get(id);
    if (!period) throw new Error('Diário não encontrado.');
    const days = (await tx.objectStore('days').index('byPeriod').getAll(id)).sort((a, b) => a.dayIndex - b.dayIndex);
    const ops: Promise<unknown>[] = [];
    if (n > days.length) {
      for (let i = days.length; i < n; i++) {
        const prev = days[i - 1];
        const day = this.makeDay(id, i, addDays(period.startDate, i), prev?.nextWakeTime ?? null);
        days.push(day);
        ops.push(tx.objectStore('days').put(day));
      }
    } else {
      for (const d of days.splice(n)) ops.push(tx.objectStore('days').delete(d.id));
    }
    const updated = { ...period, numberOfDays: n, updatedAt: this.now() };
    ops.push(tx.objectStore('periods').put(updated));
    await Promise.all([...ops, tx.done]);
    return { period: updated, days };
  }

  /** Elimina um diário e todos os seus dias e eventos. */
  async deletePeriod(id: string): Promise<void> {
    const tx = this.db.transaction([...ALL_STORES], 'readwrite');
    const ops: Promise<unknown>[] = [tx.objectStore('periods').delete(id)];
    for (const store of ['days', 'fluids', 'urine'] as const) {
      const keys = await tx.objectStore(store).index('byPeriod').getAllKeys(id);
      for (const key of keys) ops.push(tx.objectStore(store).delete(key));
    }
    await Promise.all([...ops, tx.done]);
  }

  // ---------------------------------------------------------------------- days
  async updateDay(id: string, patch: DayPatch): Promise<DiaryDay> {
    const tx = this.db.transaction('days', 'readwrite');
    const current = await tx.store.get(id);
    if (!current) throw new Error('Dia não encontrado.');
    const updated: DiaryDay = {
      ...current,
      ...(patch.context ? { context: [...new Set(patch.context)] } : {}),
      ...(patch.symptoms ? { symptoms: [...new Set(patch.symptoms)] } : {}),
      ...(patch.notes !== undefined ? { notes: sanitizeText(patch.notes) } : {}),
      updatedAt: this.now(),
    };
    await tx.store.put(updated);
    await tx.done;
    return updated;
  }

  /**
   * Altera horas de sono mantendo os dias consecutivos coerentes:
   * a hora de levantar do dia i + 1 é a mesma que "levantar no dia seguinte" do dia i.
   */
  async setSleepTimes(periodId: string, dayIndex: number, patch: SleepPatch): Promise<DiaryDay[]> {
    const tx = this.db.transaction('days', 'readwrite');
    const days = (await tx.store.index('byPeriod').getAll(periodId)).sort((a, b) => a.dayIndex - b.dayIndex);
    const day = days.find((d) => d.dayIndex === dayIndex);
    if (!day) throw new Error('Dia não encontrado.');
    const changed = new Map<string, DiaryDay>();
    const touch = (d: DiaryDay, p: Partial<DiaryDay>) => {
      const base = changed.get(d.id) ?? d;
      changed.set(d.id, { ...base, ...p, updatedAt: this.now() });
    };
    const prev = days.find((d) => d.dayIndex === dayIndex - 1);
    const next = days.find((d) => d.dayIndex === dayIndex + 1);
    if ('wakeTime' in patch) {
      touch(day, { wakeTime: patch.wakeTime ?? null });
      if (prev) touch(prev, { nextWakeTime: patch.wakeTime ?? null });
    }
    if ('bedtime' in patch) touch(day, { bedtime: patch.bedtime ?? null });
    if ('nextWakeTime' in patch) {
      touch(day, { nextWakeTime: patch.nextWakeTime ?? null });
      if (next) touch(next, { wakeTime: patch.nextWakeTime ?? null });
    }
    await Promise.all([...[...changed.values()].map((d) => tx.store.put(d)), tx.done]);
    return [...changed.values()];
  }

  // -------------------------------------------------------------------- events
  async addFluid(input: FluidInput): Promise<FluidEvent> {
    const now = this.now();
    const record: FluidEvent = {
      ...input,
      customBeverage: sanitizeLine(input.customBeverage, LIMITS.customBeverageMaxLength),
      notes: sanitizeText(input.notes),
      id: newId(),
      createdAt: now,
      updatedAt: now,
    };
    await this.db.put('fluids', record);
    return record;
  }

  async updateFluid(id: string, patch: Partial<FluidInput>): Promise<FluidEvent> {
    const tx = this.db.transaction('fluids', 'readwrite');
    const current = await tx.store.get(id);
    if (!current) throw new Error('Evento não encontrado.');
    const updated: FluidEvent = { ...current, ...patch, id, updatedAt: this.now() };
    updated.customBeverage = sanitizeLine(updated.customBeverage, LIMITS.customBeverageMaxLength);
    updated.notes = sanitizeText(updated.notes);
    await tx.store.put(updated);
    await tx.done;
    return updated;
  }

  async deleteFluid(id: string): Promise<FluidEvent | undefined> {
    const tx = this.db.transaction('fluids', 'readwrite');
    const current = await tx.store.get(id);
    if (current) await tx.store.delete(id);
    await tx.done;
    return current;
  }

  /** Repõe um registo (desfazer eliminação). */
  async restoreFluid(record: FluidEvent): Promise<void> {
    await this.db.put('fluids', record);
  }

  async addUrine(input: UrineInput): Promise<UrineEvent> {
    const now = this.now();
    const record: UrineEvent = {
      ...input,
      symptoms: [...new Set(input.symptoms)],
      notes: sanitizeText(input.notes),
      id: newId(),
      createdAt: now,
      updatedAt: now,
    };
    await this.db.put('urine', record);
    return record;
  }

  async updateUrine(id: string, patch: Partial<UrineInput>): Promise<UrineEvent> {
    const tx = this.db.transaction('urine', 'readwrite');
    const current = await tx.store.get(id);
    if (!current) throw new Error('Evento não encontrado.');
    const updated: UrineEvent = { ...current, ...patch, id, updatedAt: this.now() };
    updated.notes = sanitizeText(updated.notes);
    updated.symptoms = [...new Set(updated.symptoms)];
    await tx.store.put(updated);
    await tx.done;
    return updated;
  }

  async deleteUrine(id: string): Promise<UrineEvent | undefined> {
    const tx = this.db.transaction('urine', 'readwrite');
    const current = await tx.store.get(id);
    if (current) await tx.store.delete(id);
    await tx.done;
    return current;
  }

  async restoreUrine(record: UrineEvent): Promise<void> {
    await this.db.put('urine', record);
  }

  // -------------------------------------------------------------------- backup
  async exportData(): Promise<DataSet> {
    return this.loadAll();
  }

  /**
   * Importa dados já validados.
   * - 'merge': acrescenta registos novos; registos com o mesmo id são mantidos.
   * - 'replace': substitui todos os dados (tudo numa só transacção).
   */
  async importData(data: DataSet, mode: 'merge' | 'replace'): Promise<ImportReport> {
    const tx = this.db.transaction([...ALL_STORES], 'readwrite');
    const report: ImportReport = { periodsAdded: 0, daysAdded: 0, fluidsAdded: 0, urineAdded: 0, skippedExisting: 0 };
    if (mode === 'replace') {
      await Promise.all(ALL_STORES.map((s) => tx.objectStore(s).clear()));
    }
    const plan: [(typeof ALL_STORES)[number], keyof ImportReport][] = [
      ['periods', 'periodsAdded'],
      ['days', 'daysAdded'],
      ['fluids', 'fluidsAdded'],
      ['urine', 'urineAdded'],
    ];
    for (const [store, counter] of plan) {
      const os = tx.objectStore(store);
      for (const record of data[store]) {
        if (mode === 'merge' && (await os.getKey(record.id)) !== undefined) {
          report.skippedExisting += 1;
          continue;
        }
        await os.put(record as never);
        report[counter] += 1;
      }
    }
    await tx.done;
    return report;
  }

  /** Apaga todos os dados do diário (as definições são mantidas, excepto se indicado). */
  async clearAll(includeSettings = false): Promise<void> {
    const stores = includeSettings ? ([...ALL_STORES, 'settings', 'meta'] as const) : ALL_STORES;
    const tx = this.db.transaction([...stores], 'readwrite');
    await Promise.all([...stores.map((s) => tx.objectStore(s).clear()), tx.done]);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put('meta', { key, value });
  }
}
