import { useState } from 'react';
import { LIMITS, validateDiaryLength } from '../../domain/validation';
import { addDays, formatDate, formatDayMonth, startOfWeek, toHHMM, toISODate, weekdayName } from '../../domain/time';
import { defaultPeriodTitle } from '../../data/repository';
import { useStore } from '../../app/store';
import { navigate } from '../../app/router';
import { Sheet } from '../Sheet';
import { Field, Messages } from '../components';

export function NewDiarySheet({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void | Promise<void> }) {
  const { state, actions } = useStore();
  const today = toISODate(Date.now());
  const [startDate, setStartDate] = useState(today);
  const [days, setDays] = useState(state.settings.defaultDiaryDays);
  const [title, setTitle] = useState('');
  const [wakeTime, setWakeTime] = useState(() => {
    const nowHHMM = toHHMM(Date.now());
    return nowHHMM < state.settings.usualWakeTime ? nowHHMM : state.settings.usualWakeTime;
  });
  const [saving, setSaving] = useState(false);
  const validation = validateDiaryLength(days);

  // Duas semanas a partir do primeiro dia da semana configurado.
  const weekStart = startOfWeek(today, state.settings.firstDayOfWeek);
  const grid = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));

  const create = async () => {
    if (validation.errors.length) return;
    setSaving(true);
    const period = await actions.createPeriod({
      startDate,
      numberOfDays: days,
      title,
      firstWakeTime: startDate === today ? wakeTime : null,
    });
    await onCreated?.();
    onClose();
    actions.showToast('Diário criado');
    navigate({ name: 'home' });
    return period;
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Novo diário"
      footer={
        <>
          <Messages errors={validation.errors} warnings={[]} />
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void create()} disabled={saving || validation.errors.length > 0}>
            Começar diário
          </button>
        </>
      }
    >
      <div className="form-section">
        <fieldset className="fieldset">
          <legend>Primeiro dia</legend>
          <div className="chips inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.3rem' }}>
            {grid.map((d) => (
              <label key={d} className="chip num" style={{ flexDirection: 'column', padding: '0.3rem 0', gap: 0, fontSize: '0.8125rem' }}>
                <input type="radio" name="start-date" checked={startDate === d} onChange={() => setStartDate(d)} aria-label={`${weekdayName(d)}, ${formatDate(d)}`} />
                <span aria-hidden="true">{weekdayName(d, true)}</span>
                <strong aria-hidden="true">{formatDayMonth(d).slice(0, 2)}</strong>
              </label>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: '0.5rem' }}>
            Selecionado: {weekdayName(startDate)}, {formatDate(startDate)}
            {startDate === today ? ' (hoje)' : ''}
          </p>
        </fieldset>

        {startDate === today && (
          <Field label="A que horas te levantaste hoje?" htmlFor="first-wake" hint="O primeiro período de 24 h começa a esta hora.">
            <input id="first-wake" className="input num" type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
          </Field>
        )}

        <div className="field">
          <span className="field-label" id="days-label">
            Número de dias
          </span>
          <div className="row-flex" role="group" aria-labelledby="days-label">
            <button type="button" className="btn" aria-label="Menos um dia" onClick={() => setDays((d) => Math.max(1, d - 1))}>
              −
            </button>
            <output className="num" aria-live="polite" style={{ minWidth: '5rem', textAlign: 'center', fontWeight: 700, fontSize: '1.25rem' }}>
              {days} {days === 1 ? 'dia' : 'dias'}
            </output>
            <button type="button" className="btn" aria-label="Mais um dia" onClick={() => setDays((d) => Math.min(LIMITS.maxDiaryDays, d + 1))}>
              +
            </button>
          </div>
          <span className="field-hint">O habitual são 3 dias consecutivos. Termina na manhã a seguir ao último dia.</span>
        </div>

        <Field label="Título (opcional)" htmlFor="diary-title">
          <input
            id="diary-title"
            className="input"
            value={title}
            maxLength={LIMITS.titleMaxLength}
            placeholder={defaultPeriodTitle(startDate)}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}
