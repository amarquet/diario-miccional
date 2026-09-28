import { useState } from 'react';
import { locateInstant } from '../../domain/clinical';
import { formatDate, formatDayMonth } from '../../domain/time';
import { buildPeriodView, useNow, useStore } from '../../app/store';
import { navigate } from '../../app/router';
import { EmptyState, ListRow } from '../components';
import { Icon } from '../icons';
import { NewDiarySheet } from '../sheets/NewDiarySheet';

export function periodStatusText(state: ReturnType<typeof locateInstant>, n: number, completeAll: boolean): string {
  if (state.state === 'before') return 'Agendado';
  if (state.state === 'during') return `Em curso · Dia ${state.index + 1} de ${n}`;
  return completeAll ? 'Concluído' : 'A aguardar a primeira micção da manhã';
}

export function DiariesScreen() {
  const { state } = useStore();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const periods = [...state.data.periods].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <h1 className="page-title">Diários</h1>
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setOpen(true)} style={{ marginBottom: '1rem' }}>
        <Icon name="plus" /> Novo diário
      </button>

      {periods.length === 0 ? (
        <div className="card">
          <EmptyState icon="📘" title="Sem diários">
            <p className="muted">Cria o primeiro diário para começar a registar.</p>
          </EmptyState>
        </div>
      ) : (
        <ul className="list" aria-label="Diários">
          {periods.map((p) => {
            const view = buildPeriodView(state.data, state.settings, p.id, now);
            const windows = view?.summary.windows ?? [];
            const status = periodStatusText(
              locateInstant(windows, now),
              windows.length,
              view?.summary.days.every((d) => d.status === 'complete') ?? false,
            );
            const last = view?.days[view.days.length - 1]?.date ?? p.startDate;
            return (
              <li key={p.id}>
                <ListRow
                  onClick={() => navigate({ name: 'diary', id: p.id })}
                  label={
                    <>
                      {p.title} {state.mode === 'demo' && <span className="badge demo">DEMO</span>}
                    </>
                  }
                  sublabel={`${formatDayMonth(p.startDate)} – ${formatDate(last)} · ${p.numberOfDays} ${p.numberOfDays === 1 ? 'dia' : 'dias'} · ${status}`}
                />
              </li>
            );
          })}
        </ul>
      )}
      {open && <NewDiarySheet onClose={() => setOpen(false)} />}
    </>
  );
}
