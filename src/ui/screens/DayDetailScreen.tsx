import { useState } from 'react';
import { CONTEXT_FLAGS, SYMPTOM_FLAGS } from '../../domain/types';
import { CONTEXT_LABELS, NOTE_SUGGESTIONS, RED_FLAG_MESSAGE, SYMPTOM_LABELS } from '../../domain/labels';
import { formatMl, formatPercent } from '../../domain/format';
import { hasRedFlag } from '../../domain/observations';
import { LIMITS } from '../../domain/validation';
import { formatDuration, formatLongDate, toHHMM } from '../../domain/time';
import { useNow, usePeriodView, useStore } from '../../app/store';
import { Banner, EmptyState, ListRow, MultiChips, Section, Stat, TopBar } from '../components';
import { Timeline } from '../Timeline';
import { useEventSheets } from '../sheets/EventSheets';
import { Icon } from '../icons';

export function DayDetailScreen({ id, dayNumber }: { id: string; dayNumber: number }) {
  const { state, actions } = useStore();
  const now = useNow();
  const sheets = useEventSheets();
  const view = usePeriodView(id, now);
  const [notes, setNotes] = useState<string | null>(null);
  const index = dayNumber - 1;
  const day = view?.days[index];
  const metrics = view?.summary.days[index];

  if (!view || !day || !metrics) {
    return (
      <>
        <TopBar back={{ name: 'diary', id }} backLabel="Diário" />
        <EmptyState icon="🔍" title="Dia não encontrado" />
      </>
    );
  }
  const w = metrics.window;
  const isLast = index === view.days.length - 1;
  const redFlag = hasRedFlag([...day.symptoms, ...view.summary.buckets[index].urine.flatMap((u) => u.event.symptoms)]);
  const currentNotes = notes ?? day.notes;

  const saveNotes = async () => {
    if (notes === null || notes === day.notes) return;
    await actions.updateDay(day.id, { notes });
    setNotes(null);
    actions.showToast('Notas guardadas');
  };

  const sleepRow = (label: string, field: 'wakeTime' | 'bedtime' | 'nextWakeTime', instant: number, estimated: boolean) => (
    <li>
      <ListRow
        label={label}
        detail={
          <span className="num">
            {toHHMM(instant)}
            {estimated && <span className="sublabel">habitual</span>}
          </span>
        }
        onClick={() => sheets.openSleep({ periodId: id, dayIndex: index, field })}
      />
    </li>
  );

  return (
    <>
      <TopBar back={{ name: 'diary', id }} backLabel="Diário" />
      <h1 className="page-title">
        Dia {dayNumber} de {view.days.length}
      </h1>
      <p className="page-subtitle">{formatLongDate(day.date)}</p>

      {redFlag && (
        <Banner tone="warn" icon="alert" role="note">
          {RED_FLAG_MESSAGE}
        </Banner>
      )}

      <div className="quick-actions" style={{ marginTop: 0 }}>
        <button type="button" className="quick-action fluid" style={{ minHeight: '4.5rem' }} onClick={() => sheets.openFluid({ periodId: id })}>
          <span>+ BEBI</span>
        </button>
        <button type="button" className="quick-action urine" style={{ minHeight: '4.5rem' }} onClick={() => sheets.openUrine({ periodId: id })}>
          <span>+ URINEI</span>
        </button>
      </div>

      <Section title="Sono" footer={`Duração da noite: ${formatDuration(w.nextWakeAt - w.bedAt)}. Toca para corrigir; os eventos são reclassificados automaticamente.`}>
        <ul className="list">
          {sleepRow('Levantei-me', 'wakeTime', w.wakeAt, w.estimated.wake)}
          {sleepRow('Deitei-me', 'bedtime', w.bedAt, w.estimated.bed)}
          {sleepRow(isLast ? 'Levantei-me (manhã seguinte)' : 'Levantei-me (dia seguinte)', 'nextWakeTime', w.nextWakeAt, w.estimated.nextWake)}
        </ul>
      </Section>

      <Section title="Números do dia">
        <div className="stats">
          <Stat label="Líquidos" value={formatMl(metrics.fluidIntakeMl)} />
          <Stat label="Volume de 24 h" value={formatMl(metrics.total24h.volumeMl)} sub={metrics.total24h.complete ? undefined : 'incompleto'} />
          <Stat label="Micções diurnas" value={metrics.daytimeVoids} />
          <Stat label="Micções nocturnas" value={metrics.nocturnalVoids} night sub={`${metrics.nocturnalAwakenings} por vontade de urinar`} />
          <Stat label="Volume nocturno" value={formatMl(metrics.nocturnal.volumeMl)} night sub={metrics.nocturnal.complete ? undefined : 'falta a 1.ª micção da manhã'} />
          <Stat label="NPi" value={formatPercent(metrics.npi, 0)} sub="índice nocturno" />
        </div>
      </Section>

      <Section title="Registos">
        <Timeline view={view} dayIndex={index} />
      </Section>

      <Section title="Contexto do dia" footer="Assinala apenas o que aconteceu; a aplicação não tira conclusões sobre causas.">
        <div className="card">
          <MultiChips
            legend="Neste dia houve…"
            values={day.context}
            onChange={(context) => void actions.updateDay(day.id, { context })}
            options={CONTEXT_FLAGS.map((c) => ({ value: c, label: CONTEXT_LABELS[c] }))}
          />
        </div>
      </Section>

      <Section title="Sintomas a assinalar">
        <div className="card">
          <MultiChips
            legend="Neste dia tive…"
            layout="stack-list"
            values={day.symptoms}
            onChange={(symptoms) => void actions.updateDay(day.id, { symptoms })}
            options={SYMPTOM_FLAGS.map((s) => ({ value: s, label: SYMPTOM_LABELS[s] }))}
          />
        </div>
      </Section>

      <Section title="Notas do dia">
        <div className="card stack">
          <div className="chips">
            {NOTE_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                onClick={() => setNotes((currentNotes ? `${currentNotes.trim()}\n` : '') + s)}
              >
                <Icon name="plus" size={14} /> {s}
              </button>
            ))}
          </div>
          <label className="visually-hidden" htmlFor="day-notes">
            Notas do dia
          </label>
          <textarea
            id="day-notes"
            className="textarea"
            value={currentNotes}
            maxLength={LIMITS.notesMaxLength}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => void saveNotes()}
            placeholder="Ex.: Último café às 15:00"
          />
          {notes !== null && notes !== day.notes && (
            <button type="button" className="btn btn-primary" onClick={() => void saveNotes()}>
              Guardar notas
            </button>
          )}
        </div>
      </Section>

      {state.mode === 'demo' && <p className="section-footer center">Estás a ver dados de demonstração (DEMO).</p>}
    </>
  );
}
