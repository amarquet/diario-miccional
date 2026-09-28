/**
 * Controlador das folhas de registo: qualquer ecrã pode abrir
 * "+ Bebi", "+ Urinei" ou editar horas de sono, sem duplicar estado.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FluidEvent, UrineEvent, UrineEventKind } from '../../domain/types';
import { FluidSheet } from './FluidSheet';
import { UrineSheet } from './UrineSheet';
import { SleepSheet, type SleepField } from './SleepSheet';

type FluidRequest = { periodId: string; existing?: FluidEvent; template?: FluidEvent };
type UrineRequest = { periodId: string; existing?: UrineEvent; template?: UrineEvent; kind?: UrineEventKind };
type SleepRequest = { periodId: string; dayIndex: number; field: SleepField; defaultNow?: boolean };

interface EventSheetsApi {
  openFluid(request: FluidRequest): void;
  openUrine(request: UrineRequest): void;
  openSleep(request: SleepRequest): void;
}

const Ctx = createContext<EventSheetsApi | null>(null);

export function EventSheetsProvider({ children }: { children: ReactNode }) {
  const [fluid, setFluid] = useState<(FluidRequest & { key: number }) | null>(null);
  const [urine, setUrine] = useState<(UrineRequest & { key: number }) | null>(null);
  const [sleep, setSleep] = useState<(SleepRequest & { key: number }) | null>(null);

  const openFluid = useCallback((r: FluidRequest) => setFluid({ ...r, key: Date.now() }), []);
  const openUrine = useCallback((r: UrineRequest) => setUrine({ ...r, key: Date.now() }), []);
  const openSleep = useCallback((r: SleepRequest) => setSleep({ ...r, key: Date.now() }), []);
  const api = useMemo(() => ({ openFluid, openUrine, openSleep }), [openFluid, openUrine, openSleep]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {fluid && (
        <FluidSheet
          key={fluid.key}
          periodId={fluid.periodId}
          existing={fluid.existing}
          template={fluid.template}
          onClose={() => setFluid(null)}
          onDuplicate={(event) => setFluid({ periodId: event.diaryPeriodId, template: event, key: Date.now() })}
        />
      )}
      {urine && (
        <UrineSheet
          key={urine.key}
          periodId={urine.periodId}
          existing={urine.existing}
          template={urine.template}
          initialKind={urine.kind}
          onClose={() => setUrine(null)}
          onDuplicate={(event) => setUrine({ periodId: event.diaryPeriodId, template: event, key: Date.now() })}
        />
      )}
      {sleep && (
        <SleepSheet
          key={sleep.key}
          periodId={sleep.periodId}
          dayIndex={sleep.dayIndex}
          field={sleep.field}
          defaultNow={sleep.defaultNow}
          onClose={() => setSleep(null)}
        />
      )}
    </Ctx.Provider>
  );
}

export function useEventSheets(): EventSheetsApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useEventSheets fora de EventSheetsProvider');
  return api;
}
