/**
 * Esquema IndexedDB com versões e migrações.
 *
 * Para alterar o esquema: incrementar DB_VERSION e acrescentar uma entrada em
 * MIGRATIONS. Cada migração corre uma única vez, por ordem, dentro da
 * transacção de upgrade, preservando os dados existentes.
 */
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { DiaryDay, DiaryPeriod, FluidEvent, UrineEvent } from '../domain/types';

export const DB_NAME = 'diario-miccional';
export const DEMO_DB_NAME = 'diario-miccional-demo';
export const DB_VERSION = 1;

export interface KeyValue {
  key: string;
  value: unknown;
}

export interface DiarioSchema extends DBSchema {
  periods: { key: string; value: DiaryPeriod; indexes: { byCreatedAt: number } };
  days: { key: string; value: DiaryDay; indexes: { byPeriod: string } };
  fluids: { key: string; value: FluidEvent; indexes: { byPeriod: string; byTimestamp: number } };
  urine: { key: string; value: UrineEvent; indexes: { byPeriod: string; byTimestamp: number } };
  settings: { key: string; value: KeyValue };
  meta: { key: string; value: KeyValue };
}

export type DiarioDB = IDBPDatabase<DiarioSchema>;
type UpgradeTx = IDBPTransaction<DiarioSchema, ('periods' | 'days' | 'fluids' | 'urine' | 'settings' | 'meta')[], 'versionchange'>;

export const MIGRATIONS: Record<number, (db: DiarioDB, tx: UpgradeTx) => void> = {
  1: (db) => {
    const periods = db.createObjectStore('periods', { keyPath: 'id' });
    periods.createIndex('byCreatedAt', 'createdAt');
    const days = db.createObjectStore('days', { keyPath: 'id' });
    days.createIndex('byPeriod', 'diaryPeriodId');
    const fluids = db.createObjectStore('fluids', { keyPath: 'id' });
    fluids.createIndex('byPeriod', 'diaryPeriodId');
    fluids.createIndex('byTimestamp', 'timestamp');
    const urine = db.createObjectStore('urine', { keyPath: 'id' });
    urine.createIndex('byPeriod', 'diaryPeriodId');
    urine.createIndex('byTimestamp', 'timestamp');
    db.createObjectStore('settings', { keyPath: 'key' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
};

export async function openDiarioDB(name: string = DB_NAME, version: number = DB_VERSION): Promise<DiarioDB> {
  const db = await openDB<DiarioSchema>(name, version, {
    upgrade(database, oldVersion, newVersion, transaction) {
      const target = newVersion ?? version;
      for (let v = oldVersion + 1; v <= target; v++) {
        MIGRATIONS[v]?.(database, transaction as UpgradeTx);
      }
    },
    blocked() {
      // Outra janela ainda tem a versão antiga aberta; o upgrade continua quando fechar.
    },
  });
  db.addEventListener('versionchange', () => db.close());
  return db;
}

/** Pede ao navegador armazenamento persistente (reduz o risco de remoção automática). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* sem suporte */
  }
  return false;
}
