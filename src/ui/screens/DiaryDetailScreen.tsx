import { useState } from 'react';
import { locateInstant } from '../../domain/clinical';
import { formatMl } from '../../domain/format';
import { LIMITS, sanitizeLine } from '../../domain/validation';
import { formatDate, formatLongDate, toHHMM } from '../../domain/time';
import { useNow, usePeriodView, useStore } from '../../app/store';
import { navigate } from '../../app/router';
import { createBackup, filterDataSet, serializeBackup } from '../../data/backup';
import { buildPeriodView } from '../../app/store';
import { buildReportModel } from '../../app/report/model';
import { buildReportCsv } from '../../app/csv';
import { buildReminderCalendar, planCalendarReminders } from '../../app/reminders';
import { datedFilename, saveFile } from '../../app/platform';
import { EmptyState, Field, ListRow, Section, TopBar } from '../components';
import { Sheet, useConfirm } from '../Sheet';
import { periodStatusText } from './DiariesScreen';

export function DiaryDetailScreen({ id }: { id: string }) {
  const { state, actions } = useStore();
  const confirm = useConfirm();
  const now = useNow();
  const view = usePeriodView(id, now);
  const [renameOpen, setRenameOpen] = useState(false);
  const [lengthOpen, setLengthOpen] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  if (!view) {
    return (
      <>
        <TopBar back={{ name: 'diaries' }} backLabel="Diários" />
        <EmptyState icon="🔍" title="Diário não encontrado" />
      </>
    );
  }
  const { period, summary } = view;
  const pos = locateInstant(summary.windows, now);
  const status = periodStatusText(pos, summary.windows.length, summary.days.every((d) => d.status === 'complete'));
  const demo = state.mode === 'demo';
  const prefix = demo ? 'DEMO-diario-miccional' : 'diario-miccional';

  const exportJson = async () => {
    const backup = createBackup(filterDataSet(state.data, id), { demo, appVersion: __APP_VERSION__, settings: state.settings });
    await saveFile(new Blob([serializeBackup(backup)], { type: 'application/json' }), datedFilename(prefix, 'json'));
  };
  const exportCsv = async () => {
    const v = buildPeriodView(state.data, state.settings, id, Date.now());
    if (!v) return;
    const csv = buildReportCsv(buildReportModel(v, state.settings, { demo, now: Date.now() }));
    await saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), datedFilename(prefix, 'csv'));
  };
  const exportCalendar = async () => {
    const ics = buildReminderCalendar(period, planCalendarReminders(summary.windows, state.settings.reminders.drinkIntervalHours));
    await saveFile(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), datedFilename('lembretes-diario-miccional', 'ics'));
  };
  const remove = async () => {
    const ok = await confirm({
      title: 'Eliminar este diário?',
      message: (
        <p>
          Serão eliminados permanentemente o diário «{period.title}» e todos os seus registos. Esta ação não pode ser desfeita.
          Se quiseres, exporta primeiro uma cópia.
        </p>
      ),
      confirmLabel: 'Eliminar diário',
      destructive: true,
    });
    if (!ok) return;
    await actions.deletePeriod(id);
    actions.showToast('Diário eliminado');
    navigate({ name: 'diaries' }, { replace: true });
  };

  return (
    <>
      <TopBar back={{ name: 'diaries' }} backLabel="Diários" />
      <h1 className="page-title">
        {period.title} {demo && <span className="badge demo">DEMO</span>}
      </h1>
      <p className="page-subtitle">
        {status} · {view.days.length} {view.days.length === 1 ? 'dia' : 'dias'}
      </p>

      <Section title="Dias">
        <ul className="list">
          {summary.days.map((d) => (
            <li key={d.index}>
              <ListRow
                onClick={() => navigate({ name: 'day', id, dayNumber: d.index + 1 })}
                label={`Dia ${d.index + 1} · ${formatLongDate(d.date)}`}
                sublabel={
                  d.status === 'upcoming'
                    ? 'Ainda não começou'
                    : `Levantar ${toHHMM(d.window.wakeAt)}${d.window.estimated.wake ? '*' : ''} · Deitar ${toHHMM(d.window.bedAt)}${d.window.estimated.bed ? '*' : ''} · ${d.nocturnalVoids} nocturnas · ${formatMl(d.fluidIntakeMl)} bebidos`
                }
              />
            </li>
          ))}
        </ul>
      </Section>
      <p className="section-footer" style={{ marginTop: '-1rem' }}>
        * Hora habitual (não registada).
      </p>

      <Section title="Resumo e relatório">
        <ul className="list">
          <li>
            <ListRow icon="chart" label="Resumo do diário" onClick={() => navigate({ name: 'summary', id })} />
          </li>
          <li>
            <ListRow icon="doc" label="Gerar relatório para o urologista" onClick={() => navigate({ name: 'report', id })} />
          </li>
        </ul>
      </Section>

      <Section title="Notas do diário">
        <div className="card stack">
          <label className="visually-hidden" htmlFor="period-notes">
            Notas do diário
          </label>
          <textarea
            id="period-notes"
            className="textarea"
            value={notes ?? period.notes}
            maxLength={LIMITS.notesMaxLength}
            placeholder="Ex.: medicação habitual, motivo do diário, perguntas para o médico"
            onChange={(e) => setNotes(e.target.value)}
          />
          {notes !== null && notes !== period.notes && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await actions.updatePeriod(id, { notes });
                setNotes(null);
                actions.showToast('Notas guardadas');
              }}
            >
              Guardar notas
            </button>
          )}
        </div>
      </Section>

      <Section title="Gerir" footer="As exportações são guardadas no teu dispositivo. Nada é enviado para servidores.">
        <ul className="list">
          <li>
            <ListRow icon="note" label="Mudar o nome" onClick={() => setRenameOpen(true)} />
          </li>
          <li>
            <ListRow icon="calendar" label="Alterar número de dias" detail={`${period.numberOfDays}`} onClick={() => setLengthOpen(true)} />
          </li>
          <li>
            <ListRow icon="download" label="Exportar este diário (JSON)" onClick={() => void exportJson()} />
          </li>
          <li>
            <ListRow icon="download" label="Exportar este diário (CSV)" onClick={() => void exportCsv()} />
          </li>
          <li>
            <ListRow icon="bell" label="Lembretes no calendário (.ics)" sublabel="Adiciona alertas ao calendário do dispositivo" onClick={() => void exportCalendar()} />
          </li>
          <li>
            <ListRow icon="trash" label="Eliminar diário" danger onClick={() => void remove()} />
          </li>
        </ul>
      </Section>

      {renameOpen && <RenameSheet current={period.title} onClose={() => setRenameOpen(false)} onSave={(t) => actions.updatePeriod(id, { title: t })} />}
      {lengthOpen && (
        <LengthSheet
          current={period.numberOfDays}
          startDate={period.startDate}
          onClose={() => setLengthOpen(false)}
          onSave={async (n) => {
            if (n < period.numberOfDays) {
              const ok = await confirm({
                title: 'Reduzir o diário?',
                message: <p>Os registos dos dias removidos não são apagados, mas ficam fora do período e deixam de contar nos cálculos.</p>,
                confirmLabel: 'Reduzir',
              });
              if (!ok) return;
            }
            await actions.setNumberOfDays(id, n);
            setLengthOpen(false);
          }}
        />
      )}
    </>
  );
}

function RenameSheet({ current, onClose, onSave }: { current: string; onClose: () => void; onSave: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState(current);
  const clean = sanitizeLine(title, LIMITS.titleMaxLength);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Mudar o nome"
      footer={
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={!clean}
          onClick={async () => {
            await onSave(clean);
            onClose();
          }}
        >
          Guardar
        </button>
      }
    >
      <Field label="Título" htmlFor="rename-title">
        <input id="rename-title" className="input" value={title} maxLength={LIMITS.titleMaxLength} onChange={(e) => setTitle(e.target.value)} />
      </Field>
    </Sheet>
  );
}

function LengthSheet({
  current,
  startDate,
  onClose,
  onSave,
}: {
  current: number;
  startDate: string;
  onClose: () => void;
  onSave: (n: number) => Promise<void>;
}) {
  const [n, setN] = useState(current);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Número de dias"
      footer={
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void onSave(n)}>
          Guardar
        </button>
      }
    >
      <div className="row-flex" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn" aria-label="Menos um dia" onClick={() => setN((v) => Math.max(1, v - 1))}>
          −
        </button>
        <output className="num" aria-live="polite" style={{ minWidth: '6rem', textAlign: 'center', fontWeight: 700, fontSize: '1.4rem' }}>
          {n} {n === 1 ? 'dia' : 'dias'}
        </output>
        <button type="button" className="btn" aria-label="Mais um dia" onClick={() => setN((v) => Math.min(LIMITS.maxDiaryDays, v + 1))}>
          +
        </button>
      </div>
      <p className="muted center small">Início: {formatDate(startDate)}</p>
    </Sheet>
  );
}
