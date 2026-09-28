/**
 * Dados de demonstração. São gravados numa base de dados separada
 * (DEMO_DB_NAME), por isso nunca se misturam com os dados reais.
 */
import type { BeverageType, DataSet, DiaryDay, FluidEvent, UrgencyLevel, UrineEvent } from '../domain/types';
import { BEVERAGE_DEFAULT_FLAGS } from '../domain/labels';
import { addDays, localInstant } from '../domain/time';

export const DEMO_TITLE = 'DEMO – Diário de demonstração';

type FluidSpec = [day: number, time: string, type: BeverageType, ml: number];
type VoidSpec = [
  day: number,
  time: string,
  ml: number | null,
  urgency: UrgencyLevel,
  extra?: Partial<Pick<UrineEvent, 'awakening' | 'leakage' | 'leakageSeverity' | 'notes' | 'kind'>>,
];

// Dia 0 = primeiro dia. As horas depois da meia-noite usam o dia seguinte.
const FLUIDS: FluidSpec[] = [
  [0, '07:15', 'water', 300], [0, '10:30', 'coffee', 150], [0, '13:00', 'water', 330],
  [0, '16:00', 'tea', 250], [0, '20:00', 'water', 250], [0, '20:15', 'alcohol', 150], [0, '22:30', 'tea', 200],
  [1, '07:30', 'water', 250], [1, '09:00', 'coffee', 50], [1, '12:30', 'water', 330], [1, '15:30', 'water', 250],
  [1, '19:30', 'soft_drink', 330], [1, '21:00', 'water', 200],
  [2, '07:30', 'water', 300], [2, '08:30', 'coffee', 150], [2, '12:00', 'water', 500], [2, '16:00', 'juice', 250],
  [2, '19:00', 'water', 250], [2, '22:00', 'tea', 200],
];

const VOIDS: VoidSpec[] = [
  [0, '07:05', 320, 1], [0, '08:10', 250, 1], [0, '11:05', 220, 2], [0, '14:30', 200, 1],
  [0, '17:40', 260, 3], [0, '21:30', 230, 1], [0, '23:20', 180, 0],
  [1, '01:20', 120, 2, { awakening: 'woke_to_void' }],
  [1, '05:40', 150, 2, { awakening: 'woke_to_void' }],
  [1, '07:10', 300, 2], [1, '09:45', 210, 1], [1, '13:10', 240, 3, { leakage: true, leakageSeverity: 'small' }],
  [1, '16:20', 230, 1], [1, '20:30', 250, 1], [1, '22:45', 200, 0],
  [2, '02:10', 180, 2, { awakening: 'woke_to_void' }],
  [2, '04:30', 90, 0, { awakening: 'already_awake' }],
  [2, '06:50', 280, 2], [2, '10:00', 230, 1], [2, '13:30', 260, 1], [2, '17:00', 210, 3],
  [2, '20:00', 240, 1], [2, '23:10', 190, 0],
  [3, '03:15', 160, 3, { awakening: 'woke_to_void' }],
  [3, '07:20', 330, 2],
];

const SLEEP: Pick<DiaryDay, 'wakeTime' | 'bedtime' | 'nextWakeTime'>[] = [
  { wakeTime: '07:00', bedtime: '23:30', nextWakeTime: '07:00' },
  { wakeTime: '07:00', bedtime: '23:00', nextWakeTime: '06:45' },
  { wakeTime: '06:45', bedtime: '23:45', nextWakeTime: '07:15' },
];

/** Constrói um diário de 3 dias já concluído, a começar em `startDate`. */
export function buildDemoData(startDate: string, now = Date.now()): DataSet {
  const periodId = 'demo-period';
  const days: DiaryDay[] = SLEEP.map((s, i) => ({
    id: `demo-day-${i + 1}`,
    diaryPeriodId: periodId,
    dayIndex: i,
    date: addDays(startDate, i),
    ...s,
    context: i === 0 ? ['alcohol', 'caffeine'] : i === 2 ? ['exercise', 'caffeine'] : ['caffeine'],
    symptoms: [],
    notes: i === 0 ? 'Bebi vinho ao jantar' : i === 1 ? 'Dormi mal' : 'Treino intenso',
    updatedAt: now,
  }));

  const at = (day: number, time: string) => localInstant(addDays(startDate, day), time);

  const fluids: FluidEvent[] = FLUIDS.map(([day, time, type, ml], i) => ({
    id: `demo-fluid-${i + 1}`,
    diaryPeriodId: periodId,
    timestamp: at(day, time),
    volumeMl: ml,
    beverageType: type,
    customBeverage: '',
    ...BEVERAGE_DEFAULT_FLAGS[type],
    notes: '',
    createdAt: now,
    updatedAt: now,
  }));

  const urine: UrineEvent[] = VOIDS.map(([day, time, ml, urgency, extra], i) => ({
    id: `demo-urine-${i + 1}`,
    diaryPeriodId: periodId,
    kind: extra?.kind ?? 'void',
    timestamp: at(day, time),
    volumeMl: ml,
    urgencyLevel: urgency,
    leakage: extra?.leakage ?? false,
    leakageSeverity: extra?.leakageSeverity ?? null,
    awakening: extra?.awakening ?? null,
    firstMorningVoid: null,
    periodOverride: 'auto',
    symptoms: [],
    notes: extra?.notes ?? '',
    createdAt: now,
    updatedAt: now,
  }));

  return {
    periods: [
      {
        id: periodId,
        title: DEMO_TITLE,
        startDate,
        numberOfDays: 3,
        createdAt: now,
        updatedAt: now,
        notes: 'Dados fictícios para explorar a aplicação.',
      },
    ],
    days,
    fluids,
    urine,
  };
}
