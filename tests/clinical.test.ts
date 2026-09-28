import { describe, expect, it } from 'vitest';
import {
  buildDayBuckets,
  calculate24HourUrine,
  calculateAverageVoidVolume,
  calculateDayMetrics,
  calculateDaytimeVoids,
  calculateFluidIntake,
  calculateLeakageEpisodes,
  calculateMaximumVoidVolume,
  calculateMeanUrgency,
  calculateNocturnalAwakenings,
  calculateNocturnalPolyuriaIndex,
  calculateNocturnalUrine,
  calculateNocturnalUrineProduction,
  calculateNocturnalVoids,
  calculatePeriodSummary,
  calculateUrgencyEpisodes,
  classifyUrineEvents,
  hourlyDistribution,
  locateInstant,
  resolveDayWindows,
  type DayBucket,
} from '../src/domain/clinical';
import { HOUR } from '../src/domain/time';
import { buildDemoData } from '../src/data/demo';
import { USUAL, at, makeDays, makeFluid, makeVoid } from './factories';

function bucketsFor(days: ReturnType<typeof makeDays>, voids: ReturnType<typeof makeVoid>[], fluids = [] as ReturnType<typeof makeFluid>[]) {
  const windows = resolveDayWindows(days, USUAL, voids);
  const classified = classifyUrineEvents(windows, voids);
  return { windows, classified, buckets: buildDayBuckets(windows, classified, fluids) };
}

const periodOf = (classified: ReturnType<typeof classifyUrineEvents>, id: string) =>
  classified.find((c) => c.event.id === id)!;

describe('janelas dos dias (levantar → deitar → levantar)', () => {
  it('trata correctamente uma noite que atravessa a meia-noite (23:30 → 07:00)', () => {
    const days = makeDays('2026-09-27', [{ wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' }]);
    const [w] = resolveDayWindows(days, USUAL);
    expect(w.wakeAt).toBe(at('2026-09-27', '07:00'));
    expect(w.bedAt).toBe(at('2026-09-27', '23:30'));
    expect(w.nextWakeAt).toBe(at('2026-09-28', '07:00'));
  });

  it('coloca uma hora de deitar depois da meia-noite no dia civil seguinte', () => {
    const days = makeDays('2026-09-27', [{ wakeTime: '08:00', bedtime: '01:15', nextWakeTime: '09:00' }]);
    const [w] = resolveDayWindows(days, USUAL);
    expect(w.bedAt).toBe(at('2026-09-28', '01:15'));
    expect(w.nextWakeAt).toBe(at('2026-09-28', '09:00'));
  });

  it('usa as horas habituais quando não há registo e marca-as como estimadas', () => {
    const days = makeDays('2026-09-27', [{}, {}]);
    const [w0, w1] = resolveDayWindows(days, USUAL);
    expect(w0.wakeAt).toBe(at('2026-09-27', '07:00'));
    expect(w0.bedAt).toBe(at('2026-09-27', '23:00'));
    expect(w0.estimated).toEqual({ wake: true, bed: true, nextWake: true });
    expect(w0.nextWakeAt).toBe(w1.wakeAt);
  });

  it('mantém as janelas contíguas entre dias consecutivos', () => {
    const days = makeDays('2026-09-27', [
      { wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '06:30' },
      { wakeTime: null, bedtime: '22:45', nextWakeTime: '07:10' },
      { wakeTime: '07:10', bedtime: '00:20', nextWakeTime: '08:00' },
    ]);
    const ws = resolveDayWindows(days, USUAL);
    expect(ws[1].wakeAt).toBe(at('2026-09-28', '06:30')); // herdado de nextWakeTime do dia anterior
    expect(ws[0].nextWakeAt).toBe(ws[1].wakeAt);
    expect(ws[1].nextWakeAt).toBe(ws[2].wakeAt);
    expect(ws[2].bedAt).toBe(at('2026-09-30', '00:20'));
    expect(ws[2].nextWakeAt).toBe(at('2026-09-30', '08:00'));
  });
});

describe('classificação diurna/nocturna', () => {
  const days = makeDays('2026-09-27', [
    { wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' },
    { wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' },
  ]);

  it('23:30 → 07:00: 01:30 e 05:30 são nocturnas; 07:30 é diurna', () => {
    const v1 = makeVoid(at('2026-09-28', '01:30'), 150);
    const v2 = makeVoid(at('2026-09-28', '05:30'), 150);
    const v3 = makeVoid(at('2026-09-28', '07:30'), 300);
    const { classified } = bucketsFor(days, [v1, v2, v3]);
    expect(periodOf(classified, v1.id).period).toBe('night');
    expect(periodOf(classified, v2.id).period).toBe('night');
    expect(periodOf(classified, v3.id).period).toBe('day');
    expect(periodOf(classified, v1.id).dayIndex).toBe(0);
    expect(periodOf(classified, v3.id).dayIndex).toBe(1);
  });

  it('01:20 e 06:00 são nocturnas (exemplo do enunciado)', () => {
    const a = makeVoid(at('2026-09-28', '01:20'), 120);
    const b = makeVoid(at('2026-09-28', '06:00'), 150);
    const { classified } = bucketsFor(days, [a, b]);
    expect(periodOf(classified, a.id).period).toBe('night');
    expect(periodOf(classified, b.id).period).toBe('night');
  });

  it('usa as horas registadas e não horas fixas do relógio', () => {
    const late = makeDays('2026-09-27', [{ wakeTime: '09:00', bedtime: '01:00', nextWakeTime: '09:00' }]);
    const beforeBed = makeVoid(at('2026-09-28', '00:30'), 200);
    const earlyMorning = makeVoid(at('2026-09-28', '08:00'), 200);
    const { classified } = bucketsFor(late, [beforeBed, earlyMorning]);
    expect(periodOf(classified, beforeBed.id).period).toBe('day');
    expect(periodOf(classified, earlyMorning.id).period).toBe('night');
  });

  it('respeita a classificação manual (override)', () => {
    const forcedDay = makeVoid(at('2026-09-28', '01:30'), 100, { periodOverride: 'day' });
    const forcedNight = makeVoid(at('2026-09-27', '22:00'), 100, { periodOverride: 'night' });
    const { classified } = bucketsFor(days, [forcedDay, forcedNight]);
    expect(periodOf(classified, forcedDay.id)).toMatchObject({ period: 'day', overridden: true });
    expect(periodOf(classified, forcedNight.id)).toMatchObject({ period: 'night', overridden: true });
  });

  it('meia-noite: 23:59 e 00:01 pertencem à mesma noite', () => {
    const a = makeVoid(at('2026-09-27', '23:59'), 100);
    const b = makeVoid(at('2026-09-28', '00:01'), 100);
    const { classified } = bucketsFor(days, [a, b]);
    expect(periodOf(classified, a.id)).toMatchObject({ dayIndex: 0, period: 'night' });
    expect(periodOf(classified, b.id)).toMatchObject({ dayIndex: 0, period: 'night' });
  });

  it('assinala eventos fora do período do diário', () => {
    const before = makeVoid(at('2026-09-27', '05:00'), 100);
    const after = makeVoid(at('2026-09-29', '20:00'), 100);
    const { classified } = bucketsFor(days, [before, after]);
    expect(periodOf(classified, before.id).placement).toBe('before');
    expect(periodOf(classified, after.id).placement).toBe('after');
    expect(periodOf(classified, after.id).isFirstMorningVoid).toBe(false);
  });

  it('localiza o instante actual no diário', () => {
    const ws = resolveDayWindows(days, USUAL);
    expect(locateInstant(ws, at('2026-09-27', '06:00'))).toEqual({ state: 'before', index: 0 });
    expect(locateInstant(ws, at('2026-09-27', '12:00'))).toEqual({ state: 'during', index: 0, period: 'day' });
    expect(locateInstant(ws, at('2026-09-28', '03:00'))).toEqual({ state: 'during', index: 0, period: 'night' });
    expect(locateInstant(ws, at('2026-09-28', '07:00'))).toEqual({ state: 'during', index: 1, period: 'day' });
    expect(locateInstant(ws, at('2026-09-29', '07:00'))).toEqual({ state: 'after', index: 1 });
  });
});

describe('primeira micção da manhã (PMM)', () => {
  const days = makeDays('2026-09-27', [
    { wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' },
    { wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' },
  ]);

  it('detecta automaticamente a primeira micção depois de levantar', () => {
    const fmv = makeVoid(at('2026-09-28', '07:10'), 300);
    const later = makeVoid(at('2026-09-28', '09:00'), 200);
    const { classified, buckets } = bucketsFor(days, [later, fmv]);
    expect(periodOf(classified, fmv.id)).toMatchObject({ isFirstMorningVoid: true, closesNightIndex: 0, period: 'day' });
    expect(periodOf(classified, later.id).isFirstMorningVoid).toBe(false);
    expect(buckets[0].closingFirstVoid?.event.id).toBe(fmv.id);
    expect(buckets[1].openingFirstVoid?.event.id).toBe(fmv.id);
  });

  it('não assume PMM se a primeira micção for mais de 4 h depois de levantar', () => {
    const late = makeVoid(at('2026-09-28', '11:30'), 300);
    const { classified } = bucketsFor(days, [late]);
    expect(periodOf(classified, late.id).isFirstMorningVoid).toBe(false);
  });

  it('uma PMM marcada antes da hora de levantar termina a noite nesse momento', () => {
    const fmv = makeVoid(at('2026-09-28', '06:50'), 320, { firstMorningVoid: true });
    const { windows, classified } = bucketsFor(days, [fmv]);
    expect(windows[0].nextWakeAt).toBe(fmv.timestamp);
    expect(windows[1].wakeAt).toBe(fmv.timestamp);
    expect(windows[0].nightEndedByFirstMorningVoid).toBe(true);
    expect(periodOf(classified, fmv.id)).toMatchObject({ period: 'day', isFirstMorningVoid: true, dayIndex: 1 });
  });

  it('respeita "não é a primeira micção" marcado pelo utilizador', () => {
    const notFmv = makeVoid(at('2026-09-28', '07:05'), 100, { firstMorningVoid: false });
    const fmv = makeVoid(at('2026-09-28', '07:40'), 300);
    const { classified } = bucketsFor(days, [notFmv, fmv]);
    expect(periodOf(classified, notFmv.id).isFirstMorningVoid).toBe(false);
    expect(periodOf(classified, fmv.id).isFirstMorningVoid).toBe(true);
  });

  it('identifica a PMM da manhã a seguir ao último dia', () => {
    const final = makeVoid(at('2026-09-29', '07:20'), 330);
    const { classified, buckets } = bucketsFor(days, [final]);
    expect(periodOf(classified, final.id)).toMatchObject({ placement: 'after', isFirstMorningVoid: true, closesNightIndex: 1 });
    expect(buckets[1].closingFirstVoid?.event.id).toBe(final.id);
  });
});

describe('volumes de 24 h e nocturno', () => {
  // Dia 1: levantar 07:00, deitar 23:30, levantar 07:00
  const days = makeDays('2026-09-27', [
    { wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' },
    { wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' },
  ]);
  const openingFmv = makeVoid(at('2026-09-27', '07:05'), 350);
  const d1 = makeVoid(at('2026-09-27', '11:00'), 250);
  const d2 = makeVoid(at('2026-09-27', '16:00'), 300);
  const d3 = makeVoid(at('2026-09-27', '22:00'), 200);
  const n1 = makeVoid(at('2026-09-28', '01:20'), 120, { awakening: 'woke_to_void' });
  const n2 = makeVoid(at('2026-09-28', '05:40'), 150, { awakening: 'already_awake' });
  const closingFmv = makeVoid(at('2026-09-28', '07:10'), 330);
  const unmeasured = makeVoid(at('2026-09-27', '19:00'), null);
  const all = [openingFmv, d1, d2, d3, n1, n2, closingFmv, unmeasured];

  const getBucket = (): DayBucket => bucketsFor(days, all).buckets[0];

  it('ICS: 24 h exclui a PMM que abre o dia e inclui a PMM seguinte', () => {
    const r = calculate24HourUrine(getBucket(), 'ics');
    expect(r.volumeMl).toBe(250 + 300 + 200 + 120 + 150 + 330);
    expect(r.unmeasured).toBe(1);
    expect(r.complete).toBe(true);
  });

  it('ICS: volume nocturno = micções nocturnas + PMM seguinte', () => {
    const r = calculateNocturnalUrine(getBucket(), 'ics');
    expect(r.volumeMl).toBe(120 + 150 + 330);
    expect(r.voidsCounted).toBe(3);
  });

  it('método "apenas sono": 24 h de levantar a levantar, nocturno só durante o sono', () => {
    expect(calculate24HourUrine(getBucket(), 'sleep_only').volumeMl).toBe(350 + 250 + 300 + 200 + 120 + 150);
    expect(calculateNocturnalUrine(getBucket(), 'sleep_only').volumeMl).toBe(270);
  });

  it('volume incompleto quando falta a PMM seguinte', () => {
    const { buckets } = bucketsFor(days, [openingFmv, d1, n1]);
    expect(calculateNocturnalUrine(buckets[0], 'ics').complete).toBe(false);
    expect(calculate24HourUrine(buckets[0], 'ics').complete).toBe(false);
  });

  it('contagens: micções diurnas incluem a PMM; nocturnas distinguem o contexto', () => {
    const b = getBucket();
    expect(calculateDaytimeVoids(b)).toBe(5); // PMM + 3 diurnas + não medida
    expect(calculateNocturnalVoids(b)).toBe(2);
    expect(calculateNocturnalAwakenings(b)).toBe(1);
  });

  it('produção urinária nocturna em mL/h', () => {
    const b = getBucket();
    const nocturnal = calculateNocturnalUrine(b, 'ics').volumeMl;
    expect(calculateNocturnalUrineProduction(nocturnal, b.window)).toBeCloseTo(600 / 7.5, 6);
  });
});

describe('funções elementares', () => {
  it('NPi = volume nocturno / volume 24 h × 100', () => {
    expect(calculateNocturnalPolyuriaIndex(600, 1800)).toBeCloseTo(33.333, 3);
    expect(calculateNocturnalPolyuriaIndex(0, 1500)).toBe(0);
    expect(calculateNocturnalPolyuriaIndex(300, 0)).toBeNull();
    expect(calculateNocturnalPolyuriaIndex(Number.NaN, 100)).toBeNull();
  });

  it('volume médio e máximo ignoram micções sem volume medido', () => {
    const voids = [{ volumeMl: 200 }, { volumeMl: null }, { volumeMl: 400 }, { volumeMl: 0 }];
    expect(calculateAverageVoidVolume(voids)).toBe(200);
    expect(calculateMaximumVoidVolume(voids)).toBe(400);
    expect(calculateAverageVoidVolume([{ volumeMl: null }])).toBeNull();
    expect(calculateMaximumVoidVolume([])).toBeNull();
  });

  it('episódios de urgência usam o limiar configurado', () => {
    const events = [0, 1, 2, 3, 4, null].map((u) => ({ urgencyLevel: u as 0 | 1 | 2 | 3 | 4 | null }));
    expect(calculateUrgencyEpisodes(events, 3)).toBe(2);
    expect(calculateUrgencyEpisodes(events, 2)).toBe(3);
    expect(calculateMeanUrgency(events)).toBe(2);
    expect(calculateMeanUrgency([{ urgencyLevel: null }])).toBeNull();
  });

  it('perdas incluem micções com perda e perdas sem micção', () => {
    expect(
      calculateLeakageEpisodes([
        { leakage: true, kind: 'void' },
        { leakage: false, kind: 'void' },
        { leakage: false, kind: 'leak_only' },
      ]),
    ).toBe(2);
  });

  it('perdas sem micção não contam como micção', () => {
    const days = makeDays('2026-09-27', [{ wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' }]);
    const leak = makeVoid(at('2026-09-27', '15:00'), null, { kind: 'leak_only' });
    const v = makeVoid(at('2026-09-27', '16:00'), 200);
    const { buckets } = bucketsFor(days, [leak, v]);
    expect(buckets[0].voids).toHaveLength(1);
    expect(calculateLeakageEpisodes(buckets[0].urine)).toBe(1);
  });

  it('ingestão total de líquidos', () => {
    expect(calculateFluidIntake([{ volumeMl: 250 }, { volumeMl: 330 }, { volumeMl: 0 }])).toBe(580);
  });

  it('distribuição horária média', () => {
    const items = [
      { timestamp: at('2026-09-27', '08:10'), volumeMl: 200 },
      { timestamp: at('2026-09-28', '08:50'), volumeMl: 100 },
      { timestamp: at('2026-09-28', '02:00'), volumeMl: null },
    ];
    const h = hourlyDistribution(items, 2);
    expect(h).toHaveLength(24);
    expect(h[8]).toBe(150);
    expect(h[2]).toBe(0);
  });
});

describe('mudança da hora (Europe/Lisbon)', () => {
  it('Primavera (29/03/2026): a noite 23:30 → 07:00 dura 6,5 h', () => {
    const days = makeDays('2026-03-28', [{ wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' }]);
    const v = makeVoid(at('2026-03-29', '03:30'), 300);
    const fmv = makeVoid(at('2026-03-29', '07:10'), 350);
    const { windows, classified, buckets } = bucketsFor(days, [v, fmv]);
    const w = windows[0];
    expect((w.nextWakeAt - w.bedAt) / HOUR).toBe(6.5);
    expect((w.nextWakeAt - w.wakeAt) / HOUR).toBe(23);
    expect(periodOf(classified, v.id).period).toBe('night');
    const m = calculateDayMetrics(buckets[0], { method: 'ics', urgencyThreshold: 3, now: at('2026-04-01', '12:00') });
    expect(m.nocturnalProductionMlPerHour).toBeCloseTo(650 / 6.5, 6);
  });

  it('Outono (25/10/2026): a noite 23:30 → 07:00 dura 8,5 h e 01:30 (repetida) é nocturna', () => {
    const days = makeDays('2026-10-24', [{ wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' }]);
    const firstOneThirty = at('2026-10-25', '01:30');
    const secondOneThirty = firstOneThirty + HOUR; // 01:30 WET, depois de recuar a hora
    const a = makeVoid(firstOneThirty, 100);
    const b = makeVoid(secondOneThirty, 100);
    const { windows, classified } = bucketsFor(days, [a, b]);
    expect((windows[0].nextWakeAt - windows[0].bedAt) / HOUR).toBe(8.5);
    expect((windows[0].nextWakeAt - windows[0].wakeAt) / HOUR).toBe(25);
    expect(periodOf(classified, a.id).period).toBe('night');
    expect(periodOf(classified, b.id).period).toBe('night');
    expect(new Date(b.timestamp).getHours()).toBe(1);
  });

  it('diário que atravessa a mudança da hora mantém datas civis correctas', () => {
    const days = makeDays('2026-03-28', [{}, {}, {}]);
    expect(days.map((d) => d.date)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
    const ws = resolveDayWindows(days, USUAL);
    expect(ws.map((w) => new Date(w.wakeAt).getHours())).toEqual([7, 7, 7]);
  });

  it('transição de ano (31/12 → 01/01)', () => {
    const days = makeDays('2026-12-31', [{ wakeTime: '08:00', bedtime: '00:30', nextWakeTime: '09:00' }]);
    const v = makeVoid(at('2027-01-01', '04:00'), 200);
    const { windows, classified } = bucketsFor(days, [v]);
    expect(windows[0].bedAt).toBe(at('2027-01-01', '00:30'));
    expect(periodOf(classified, v.id)).toMatchObject({ dayIndex: 0, period: 'night' });
  });
});

describe('resumo de vários dias (dados de demonstração, 3 dias)', () => {
  const data = buildDemoData('2026-09-23', 0);
  const now = at('2026-09-27', '12:00');
  const summary = calculatePeriodSummary(data.days, data.fluids, data.urine, USUAL, {
    method: 'ics',
    urgencyThreshold: 3,
    now,
  });

  it('todos os dias estão completos', () => {
    expect(summary.days.map((d) => d.status)).toEqual(['complete', 'complete', 'complete']);
    expect(summary.isPartial).toBe(false);
  });

  it('dia 1 do exemplo: 23:30 deitar, 01:20 e 05:40 nocturnas, 07:00 levantar', () => {
    const d = summary.days[0];
    expect(d.nocturnalVoids).toBe(2);
    expect(d.nocturnalAwakenings).toBe(2);
    expect(d.daytimeVoids).toBe(7);
    expect(d.nocturnal.volumeMl).toBe(570); // 120 + 150 + PMM 300
    expect(d.total24h.volumeMl).toBe(1910);
    expect(d.npi).toBeCloseTo((570 / 1910) * 100, 6);
    expect(d.fluidIntakeMl).toBe(1630);
    expect(d.eveningFluidIntakeMl).toBe(200);
    expect(d.maxVoidedVolumeMl).toBe(320);
    expect(d.meanNocturnalVoidedVolumeMl).toBe(135);
    expect(d.urgencyEpisodes).toBe(1);
    expect(d.leakageEpisodes).toBe(0);
    expect(d.nocturnalProductionMlPerHour).toBeCloseTo(76, 6);
  });

  it('dias 2 e 3', () => {
    const [, d2, d3] = summary.days;
    expect(d2).toMatchObject({ nocturnalVoids: 2, nocturnalAwakenings: 1, nocturnalAlreadyAwake: 1, leakageEpisodes: 1 });
    expect(d2.nocturnal.volumeMl).toBe(550);
    expect(d2.total24h.volumeMl).toBe(1680);
    expect(d2.fluidIntakeMl).toBe(1410);
    expect(d3.nocturnal.volumeMl).toBe(490);
    expect(d3.total24h.volumeMl).toBe(1620);
    expect(d3.urgencyEpisodes).toBe(2);
    expect(d3.hasClosingFirstVoid).toBe(true);
  });

  it('médias e totais do período', () => {
    expect(summary.averages.nocturnalVoids).toBeCloseTo(5 / 3, 6);
    expect(summary.averages.nocturnalAwakenings).toBeCloseTo(4 / 3, 6);
    expect(summary.averages.nocturnalUrineVolumeMl).toBeCloseTo(1610 / 3, 6);
    expect(summary.averages.total24hVolumeMl).toBeCloseTo(5210 / 3, 6);
    expect(summary.averages.fluidIntakeMl).toBeCloseTo(4690 / 3, 6);
    expect(summary.npi).toBeCloseTo((1610 / 5210) * 100, 6);
    expect(summary.averageVoidedVolumeMl).toBeCloseTo(5530 / 25, 6);
    expect(summary.meanNocturnalVoidedVolumeMl).toBe(140);
    expect(summary.meanDaytimeVoidedVolumeMl).toBeCloseTo(241.5, 6);
    expect(summary.maxVoidedVolumeMl).toBe(330);
    expect(summary.urgencyEpisodes).toBe(4);
    expect(summary.leakageEpisodes).toBe(1);
    expect(summary.meanUrgency).toBeCloseTo(36 / 25, 6);
    expect(summary.outsideEvents).toBe(0);
  });

  it('diário em curso: médias usam apenas dias iniciados e o estado é parcial', () => {
    const partial = calculatePeriodSummary(data.days, data.fluids, data.urine, USUAL, {
      method: 'ics',
      urgencyThreshold: 3,
      now: at('2026-09-24', '12:00'),
    });
    expect(partial.days.map((d) => d.status)).toEqual(['complete', 'in_progress', 'upcoming']);
    expect(partial.includedDays).toHaveLength(1);
    expect(partial.isPartial).toBe(true);
  });

  it('aguarda a PMM depois do fim da última noite', () => {
    const noFinal = data.urine.filter((u) => u.id !== 'demo-urine-25');
    const s = calculatePeriodSummary(data.days, data.fluids, noFinal, USUAL, {
      method: 'ics',
      urgencyThreshold: 3,
      now: at('2026-09-26', '07:30'),
    });
    expect(s.days[2].status).toBe('awaiting_first_void');
  });
});
