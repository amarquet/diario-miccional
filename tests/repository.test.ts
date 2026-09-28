import { describe, expect, it } from 'vitest';
import { DiaryRepository } from '../src/data/repository';
import { DB_VERSION, openDiarioDB } from '../src/data/db';
import { at } from './factories';

let n = 0;
const freshName = () => `test-db-${Date.now()}-${++n}`;

async function setup() {
  const name = freshName();
  const repo = await DiaryRepository.open(name);
  const { period, days } = await repo.createPeriod({ startDate: '2026-09-27', numberOfDays: 3, firstWakeTime: '07:00' });
  return { name, repo, period, days };
}

const fluidInput = (periodId: string, timestamp = at('2026-09-27', '08:00')) => ({
  diaryPeriodId: periodId,
  timestamp,
  volumeMl: 250,
  beverageType: 'water' as const,
  customBeverage: '',
  caffeine: false,
  alcohol: false,
  notes: '',
});

const urineInput = (periodId: string, timestamp = at('2026-09-27', '09:00')) => ({
  diaryPeriodId: periodId,
  kind: 'void' as const,
  timestamp,
  volumeMl: 300,
  urgencyLevel: 2 as const,
  leakage: false,
  leakageSeverity: null,
  awakening: null,
  firstMorningVoid: null,
  periodOverride: 'auto' as const,
  symptoms: [],
  notes: '',
});

describe('persistência (IndexedDB)', () => {
  it('cria um diário com dias consecutivos e título por omissão', async () => {
    const { repo, period, days } = await setup();
    expect(period.title).toBe('Diário Miccional – Setembro 2026');
    expect(period.numberOfDays).toBe(3);
    expect(days.map((d) => d.date)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29']);
    expect(days[0].wakeTime).toBe('07:00');
    repo.close();
  });

  it('adiciona, edita e elimina bebidas; desfazer repõe o registo', async () => {
    const { repo, period } = await setup();
    const f = await repo.addFluid(fluidInput(period.id));
    expect(f.id).toBeTruthy();
    const edited = await repo.updateFluid(f.id, { volumeMl: 330, beverageType: 'coffee', caffeine: true });
    expect(edited).toMatchObject({ volumeMl: 330, beverageType: 'coffee', caffeine: true, createdAt: f.createdAt });
    const removed = await repo.deleteFluid(f.id);
    expect(removed?.id).toBe(f.id);
    expect((await repo.loadAll()).fluids).toHaveLength(0);
    await repo.restoreFluid(removed!);
    expect((await repo.loadAll()).fluids).toEqual([edited]);
    repo.close();
  });

  it('adiciona, edita e elimina micções; desfazer repõe o registo', async () => {
    const { repo, period } = await setup();
    const u = await repo.addUrine(urineInput(period.id));
    await repo.updateUrine(u.id, { volumeMl: null, leakage: true, leakageSeverity: 'small' });
    const removed = await repo.deleteUrine(u.id);
    expect(removed).toMatchObject({ volumeMl: null, leakage: true, leakageSeverity: 'small' });
    expect((await repo.loadAll()).urine).toHaveLength(0);
    await repo.restoreUrine(removed!);
    expect((await repo.loadAll()).urine).toHaveLength(1);
    repo.close();
  });

  it('sanitiza texto livre (caracteres de controlo, comprimento)', async () => {
    const { repo, period } = await setup();
    const f = await repo.addFluid({ ...fluidInput(period.id), notes: '  olá\u0000‮ mundo  ', customBeverage: 'x'.repeat(200) });
    expect(f.notes).toBe('olá mundo');
    expect(f.customBeverage.length).toBeLessThanOrEqual(40);
    repo.close();
  });

  it('mantém as horas de levantar sincronizadas entre dias consecutivos', async () => {
    const { repo, period } = await setup();
    await repo.setSleepTimes(period.id, 0, { bedtime: '23:30', nextWakeTime: '06:45' });
    let days = (await repo.loadAll()).days.sort((a, b) => a.dayIndex - b.dayIndex);
    expect(days[0]).toMatchObject({ bedtime: '23:30', nextWakeTime: '06:45' });
    expect(days[1].wakeTime).toBe('06:45');
    await repo.setSleepTimes(period.id, 1, { wakeTime: '07:10' });
    days = (await repo.loadAll()).days.sort((a, b) => a.dayIndex - b.dayIndex);
    expect(days[0].nextWakeTime).toBe('07:10');
    expect(days[1].wakeTime).toBe('07:10');
    repo.close();
  });

  it('altera o número de dias sem apagar eventos', async () => {
    const { repo, period } = await setup();
    await repo.addFluid(fluidInput(period.id, at('2026-09-29', '10:00')));
    const shorter = await repo.setNumberOfDays(period.id, 2);
    expect(shorter.days).toHaveLength(2);
    expect((await repo.loadAll()).fluids).toHaveLength(1);
    const longer = await repo.setNumberOfDays(period.id, 5);
    expect(longer.days.map((d) => d.date)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
    repo.close();
  });

  it('eliminar um diário remove apenas os seus dias e eventos', async () => {
    const { repo, period } = await setup();
    const other = await repo.createPeriod({ startDate: '2026-10-10', numberOfDays: 3 });
    await repo.addFluid(fluidInput(period.id));
    await repo.addFluid(fluidInput(other.period.id));
    await repo.addUrine(urineInput(period.id));
    await repo.deletePeriod(period.id);
    const data = await repo.loadAll();
    expect(data.periods.map((p) => p.id)).toEqual([other.period.id]);
    expect(data.days.every((d) => d.diaryPeriodId === other.period.id)).toBe(true);
    expect(data.fluids).toHaveLength(1);
    expect(data.urine).toHaveLength(0);
    repo.close();
  });

  it('os dados persistem depois de fechar e reabrir a base de dados', async () => {
    const { name, repo, period } = await setup();
    await repo.addUrine(urineInput(period.id));
    await repo.saveSettings({ ...(await repo.getSettings()), urgencyScale: 'numeric', onboardingDone: true });
    repo.close();
    const reopened = await DiaryRepository.open(name);
    const data = await reopened.loadAll();
    expect(data.periods).toHaveLength(1);
    expect(data.urine).toHaveLength(1);
    expect((await reopened.getSettings()).urgencyScale).toBe('numeric');
    reopened.close();
  });

  it('esquema versionado: cria todas as stores e índices na versão actual', async () => {
    const db = await openDiarioDB(freshName());
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(['days', 'fluids', 'meta', 'periods', 'settings', 'urine']);
    const tx = db.transaction('urine');
    expect([...tx.store.indexNames].sort()).toEqual(['byPeriod', 'byTimestamp']);
    db.close();
  });

  it('definições inválidas são corrigidas para valores por omissão', async () => {
    const { repo } = await setup();
    await repo.saveSettings({ usualBedtime: 'abc', urgencyThreshold: 9 } as never);
    const s = await repo.getSettings();
    expect(s.usualBedtime).toBe('23:00');
    expect(s.urgencyThreshold).toBe(3);
    repo.close();
  });

  it('importação: "juntar" mantém registos existentes; "substituir" troca tudo', async () => {
    const { repo, period } = await setup();
    await repo.addFluid(fluidInput(period.id));
    const snapshot = await repo.loadAll();
    const extra = await DiaryRepository.open(freshName());
    const other = await extra.createPeriod({ startDate: '2026-11-01', numberOfDays: 2 });
    const otherData = await extra.loadAll();
    extra.close();

    const merged = await repo.importData({ ...otherData, periods: [...otherData.periods, ...snapshot.periods] }, 'merge');
    expect(merged.periodsAdded).toBe(1);
    expect(merged.skippedExisting).toBe(1);
    expect((await repo.loadAll()).periods).toHaveLength(2);

    await repo.importData(otherData, 'replace');
    const after = await repo.loadAll();
    expect(after.periods.map((p) => p.id)).toEqual([other.period.id]);
    expect(after.fluids).toHaveLength(0);
    repo.close();
  });

  it('apagar todos os dados mantém as definições', async () => {
    const { repo } = await setup();
    await repo.saveSettings({ ...(await repo.getSettings()), onboardingDone: true });
    await repo.clearAll();
    expect((await repo.loadAll()).periods).toHaveLength(0);
    expect((await repo.getSettings()).onboardingDone).toBe(true);
    repo.close();
  });
});
