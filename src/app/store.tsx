/**
 * Camada de aplicação: estado em memória + acções que persistem em IndexedDB.
 * A interface nunca acede directamente à base de dados.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DataSet, DiaryPeriod, FluidEvent, Settings, UrineEvent } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { calculatePeriodSummary, type PeriodSummary } from '../domain/clinical';
import { addDays, toISODate } from '../domain/time';
import { DB_NAME, DEMO_DB_NAME, requestPersistentStorage } from '../data/db';
import {
  DiaryRepository,
  type CreatePeriodInput,
  type DayPatch,
  type FluidInput,
  type ImportReport,
  type SleepPatch,
  type UrineInput,
} from '../data/repository';
import { buildDemoData } from '../data/demo';
import { devLog } from './platform';

export type AppMode = 'real' | 'demo';
const MODE_KEY = 'diario-miccional:modo';

export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  tone?: 'default' | 'error';
}

interface StoreState {
  status: 'loading' | 'ready' | 'error';
  errorMessage: string | null;
  mode: AppMode;
  settings: Settings;
  data: DataSet;
}

export interface StoreActions {
  updateSettings(patch: Partial<Settings>): Promise<void>;
  createPeriod(input: CreatePeriodInput): Promise<DiaryPeriod>;
  updatePeriod(id: string, patch: Partial<Pick<DiaryPeriod, 'title' | 'notes'>>): Promise<void>;
  setNumberOfDays(id: string, numberOfDays: number): Promise<void>;
  deletePeriod(id: string): Promise<void>;
  updateDay(id: string, patch: DayPatch): Promise<void>;
  setSleepTimes(periodId: string, dayIndex: number, patch: SleepPatch): Promise<void>;
  addFluid(input: FluidInput): Promise<FluidEvent>;
  updateFluid(id: string, patch: Partial<FluidInput>): Promise<void>;
  deleteFluid(id: string): Promise<void>;
  addUrine(input: UrineInput): Promise<UrineEvent>;
  updateUrine(id: string, patch: Partial<UrineInput>): Promise<void>;
  deleteUrine(id: string): Promise<void>;
  importData(data: DataSet, mode: 'merge' | 'replace'): Promise<ImportReport>;
  clearAllData(): Promise<void>;
  enterDemo(): Promise<void>;
  exitDemo(): Promise<void>;
  resetDemo(): Promise<void>;
  showToast(message: string, options?: Omit<ToastState, 'id' | 'message'>): void;
  dismissToast(): void;
}

interface StoreContextValue {
  state: StoreState;
  actions: StoreActions;
  toast: ToastState | null;
}

const EMPTY: DataSet = { periods: [], days: [], fluids: [], urine: [] };
const StoreContext = createContext<StoreContextValue | null>(null);

function readMode(): AppMode {
  try {
    return sessionStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'real';
  } catch {
    return 'real';
  }
}

function writeMode(mode: AppMode) {
  try {
    if (mode === 'demo') sessionStorage.setItem(MODE_KEY, 'demo');
    else sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

const replaceById = <T extends { id: string }>(list: T[], item: T) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
};

async function seedDemo(repo: DiaryRepository) {
  const data = await repo.loadAll();
  if (data.periods.length === 0) {
    const start = addDays(toISODate(Date.now()), -4);
    await repo.importData(buildDemoData(start), 'replace');
    const settings = await repo.getSettings();
    await repo.saveSettings({ ...settings, onboardingDone: true });
  }
}

export interface StoreProviderProps {
  children: ReactNode;
  /** Nomes das bases de dados (injectáveis nos testes). */
  dbNames?: { real: string; demo: string };
}

export function StoreProvider({ children, dbNames = { real: DB_NAME, demo: DEMO_DB_NAME } }: StoreProviderProps) {
  const [state, setState] = useState<StoreState>({
    status: 'loading',
    errorMessage: null,
    mode: 'real',
    settings: DEFAULT_SETTINGS,
    data: EMPTY,
  });
  const [toast, setToast] = useState<ToastState | null>(null);
  const repoRef = useRef<DiaryRepository | null>(null);
  const toastSeq = useRef(0);

  const load = useCallback(
    async (mode: AppMode) => {
      repoRef.current?.close();
      repoRef.current = null;
      try {
        const repo = await DiaryRepository.open(mode === 'demo' ? dbNames.demo : dbNames.real);
        if (mode === 'demo') await seedDemo(repo);
        const [settings, data] = await Promise.all([repo.getSettings(), repo.loadAll()]);
        repoRef.current = repo;
        writeMode(mode);
        setState({ status: 'ready', errorMessage: null, mode, settings, data });
      } catch (error) {
        devLog('Falha ao abrir a base de dados', error);
        setState((s) => ({
          ...s,
          status: 'error',
          errorMessage:
            'Não foi possível abrir o armazenamento local. Verifica se o navegador não está em navegação privada.',
        }));
      }
    },
    [dbNames.demo, dbNames.real],
  );

  useEffect(() => {
    void load(readMode());
    return () => repoRef.current?.close();
  }, [load]);

  const repo = () => {
    if (!repoRef.current) throw new Error('Armazenamento indisponível.');
    return repoRef.current;
  };

  const actions = useMemo<StoreActions>(() => {
    const patchData = (fn: (d: DataSet) => DataSet) => setState((s) => ({ ...s, data: fn(s.data) }));

    const showToast: StoreActions['showToast'] = (message, options = {}) => {
      toastSeq.current += 1;
      setToast({ id: toastSeq.current, message, ...options });
    };

    return {
      showToast,
      dismissToast: () => setToast(null),

      async updateSettings(patch) {
        const current = await repo().getSettings();
        const saved = await repo().saveSettings({ ...current, ...patch });
        setState((s) => ({ ...s, settings: saved }));
      },

      async createPeriod(input) {
        const { period, days } = await repo().createPeriod(input);
        patchData((d) => ({ ...d, periods: [...d.periods, period], days: [...d.days, ...days] }));
        void requestPersistentStorage();
        return period;
      },

      async updatePeriod(id, patch) {
        const period = await repo().updatePeriod(id, patch);
        patchData((d) => ({ ...d, periods: replaceById(d.periods, period) }));
      },

      async setNumberOfDays(id, n) {
        const { period, days } = await repo().setNumberOfDays(id, n);
        patchData((d) => ({
          ...d,
          periods: replaceById(d.periods, period),
          days: [...d.days.filter((x) => x.diaryPeriodId !== id), ...days],
        }));
      },

      async deletePeriod(id) {
        await repo().deletePeriod(id);
        patchData((d) => ({
          periods: d.periods.filter((p) => p.id !== id),
          days: d.days.filter((x) => x.diaryPeriodId !== id),
          fluids: d.fluids.filter((x) => x.diaryPeriodId !== id),
          urine: d.urine.filter((x) => x.diaryPeriodId !== id),
        }));
      },

      async updateDay(id, patch) {
        const day = await repo().updateDay(id, patch);
        patchData((d) => ({ ...d, days: replaceById(d.days, day) }));
      },

      async setSleepTimes(periodId, dayIndex, patch) {
        const changed = await repo().setSleepTimes(periodId, dayIndex, patch);
        patchData((d) => ({ ...d, days: changed.reduce(replaceById, d.days) }));
      },

      async addFluid(input) {
        const record = await repo().addFluid(input);
        patchData((d) => ({ ...d, fluids: [...d.fluids, record] }));
        if (input.beverageType !== state.settings.lastBeverageType) {
          const saved = await repo().saveSettings({ ...(await repo().getSettings()), lastBeverageType: input.beverageType });
          setState((s) => ({ ...s, settings: saved }));
        }
        return record;
      },

      async updateFluid(id, patch) {
        const record = await repo().updateFluid(id, patch);
        patchData((d) => ({ ...d, fluids: replaceById(d.fluids, record) }));
      },

      async deleteFluid(id) {
        const removed = await repo().deleteFluid(id);
        if (!removed) return;
        patchData((d) => ({ ...d, fluids: d.fluids.filter((f) => f.id !== id) }));
        showToast('Evento eliminado', {
          actionLabel: 'Desfazer',
          onAction: async () => {
            await repo().restoreFluid(removed);
            patchData((d) => ({ ...d, fluids: replaceById(d.fluids, removed) }));
            showToast('Evento reposto');
          },
        });
      },

      async addUrine(input) {
        const record = await repo().addUrine(input);
        patchData((d) => ({ ...d, urine: [...d.urine, record] }));
        return record;
      },

      async updateUrine(id, patch) {
        const record = await repo().updateUrine(id, patch);
        patchData((d) => ({ ...d, urine: replaceById(d.urine, record) }));
      },

      async deleteUrine(id) {
        const removed = await repo().deleteUrine(id);
        if (!removed) return;
        patchData((d) => ({ ...d, urine: d.urine.filter((u) => u.id !== id) }));
        showToast('Evento eliminado', {
          actionLabel: 'Desfazer',
          onAction: async () => {
            await repo().restoreUrine(removed);
            patchData((d) => ({ ...d, urine: replaceById(d.urine, removed) }));
            showToast('Evento reposto');
          },
        });
      },

      async importData(data, mode) {
        const report = await repo().importData(data, mode);
        const fresh = await repo().loadAll();
        setState((s) => ({ ...s, data: fresh }));
        return report;
      },

      async clearAllData() {
        await repo().clearAll(false);
        setState((s) => ({ ...s, data: EMPTY }));
      },

      async enterDemo() {
        setState((s) => ({ ...s, status: 'loading' }));
        await load('demo');
      },

      async exitDemo() {
        setState((s) => ({ ...s, status: 'loading' }));
        await load('real');
      },

      async resetDemo() {
        await repo().clearAll(true);
        setState((s) => ({ ...s, status: 'loading' }));
        await load('demo');
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, state.settings.lastBeverageType]);

  const value = useMemo(() => ({ state, actions, toast }), [state, actions, toast]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore fora de StoreProvider');
  return ctx;
}

/** Hora actual, actualizada periodicamente (para o "dia actual" e lembretes). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

/** Diário mais recente (o "diário actual"). */
export function latestPeriod(periods: DiaryPeriod[]): DiaryPeriod | null {
  return periods.reduce<DiaryPeriod | null>((best, p) => (!best || p.createdAt > best.createdAt ? p : best), null);
}

export interface PeriodView {
  period: DiaryPeriod;
  days: DataSet['days'];
  fluids: FluidEvent[];
  urine: UrineEvent[];
  summary: PeriodSummary;
}

export function buildPeriodView(data: DataSet, settings: Settings, periodId: string, now: number): PeriodView | null {
  const period = data.periods.find((p) => p.id === periodId);
  if (!period) return null;
  const days = data.days.filter((d) => d.diaryPeriodId === periodId).sort((a, b) => a.dayIndex - b.dayIndex);
  const fluids = data.fluids.filter((f) => f.diaryPeriodId === periodId).sort((a, b) => a.timestamp - b.timestamp);
  const urine = data.urine.filter((u) => u.diaryPeriodId === periodId).sort((a, b) => a.timestamp - b.timestamp);
  const summary = calculatePeriodSummary(days, fluids, urine, settings, {
    method: settings.nocturnalVolumeMethod,
    urgencyThreshold: settings.urgencyThreshold,
    now,
  });
  return { period, days, fluids, urine, summary };
}

export function usePeriodView(periodId: string | null | undefined, now: number): PeriodView | null {
  const { state } = useStore();
  const minute = Math.floor(now / 60_000);
  return useMemo(
    () => (periodId ? buildPeriodView(state.data, state.settings, periodId, minute * 60_000) : null),
    [periodId, state.data, state.settings, minute],
  );
}
