import { useState } from 'react';
import { locateInstant } from '../../domain/clinical';
import { DISCLAIMER, RED_FLAG_MESSAGE } from '../../domain/labels';
import { hasRedFlag } from '../../domain/observations';
import { formatAverage, formatMl, plural } from '../../domain/format';
import { HOUR, formatDate, formatLongDate, toHHMM } from '../../domain/time';
import { latestPeriod, useNow, usePeriodView, useStore } from '../../app/store';
import { navigate } from '../../app/router';
import { REMINDER_TEXT, dueReminders, useSystemReminderNotifications } from '../../app/reminders';
import { Banner, EmptyState, Section, Stat } from '../components';
import { Icon } from '../icons';
import { Timeline } from '../Timeline';
import { useEventSheets } from '../sheets/EventSheets';
import { NewDiarySheet } from '../sheets/NewDiarySheet';

export function HomeScreen() {
  const { state, actions } = useStore();
  const now = useNow();
  const sheets = useEventSheets();
  const [newDiaryOpen, setNewDiaryOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [dismissedReminders, setDismissedReminders] = useState<string>('');

  const period = latestPeriod(state.data.periods);
  const view = usePeriodView(period?.id, now);
  const windows = view?.summary.windows ?? [];

  useSystemReminderNotifications(
    view ? { now, windows, fluids: view.fluids, urine: view.urine, settings: state.settings.reminders } : null,
  );

  if (!period || !view || windows.length === 0) {
    return (
      <>
        <h1 className="page-title">Diário Miccional</h1>
        <div className="card">
          <EmptyState icon="🗒️" title="Ainda não tens nenhum diário">
            <p className="muted">Regista durante 3 dias o que bebes e quando urinas.</p>
            <div className="stack" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setNewDiaryOpen(true)}>
                Começar diário
              </button>
              {state.mode === 'real' && (
                <button type="button" className="btn btn-block" onClick={() => void actions.enterDemo()}>
                  Explorar com dados de demonstração
                </button>
              )}
            </div>
          </EmptyState>
        </div>
        {newDiaryOpen && <NewDiarySheet onClose={() => setNewDiaryOpen(false)} />}
      </>
    );
  }

  const pos = locateInstant(windows, now);
  const currentIndex = pos.state === 'during' ? pos.index : pos.state === 'after' ? windows.length - 1 : 0;
  const shownIndex = Math.min(selectedDay ?? currentIndex, windows.length - 1);
  const w = windows[shownIndex];
  const metrics = view.summary.days[shownIndex];
  const bucket = view.summary.buckets[shownIndex];
  const day = view.days[shownIndex];
  const n = windows.length;
  const isCurrent = shownIndex === currentIndex && pos.state === 'during';
  const lastMetrics = view.summary.days[n - 1];

  const urineToday = bucket.voids.reduce((s, v) => s + (v.event.volumeMl ?? 0), 0);
  const dayRedFlag = hasRedFlag([...day.symptoms, ...bucket.urine.flatMap((u) => u.event.symptoms)]);

  // Botões de sono contextuais
  const sleepTargetIndex = pos.state === 'during' ? pos.index : n - 1;
  const sw = windows[sleepTargetIndex];
  const sDay = view.days[sleepTargetIndex];
  const showBedtime = pos.state === 'during' && sDay.bedtime === null && now >= sw.wakeAt + 2 * HOUR;
  const inNight = pos.state === 'during' && pos.period === 'night';
  const showWake =
    (pos.state === 'during' && ((inNight && sw.estimated.nextWake) || (!inNight && sw.estimated.wake && now - sw.wakeAt < 4 * HOUR))) ||
    (pos.state === 'after' && sw.estimated.nextWake && now - sw.nextWakeAt < 6 * HOUR);

  const setBedtimeNow = async () => {
    await actions.setSleepTimes(period.id, sleepTargetIndex, { bedtime: toHHMM(now) });
    actions.showToast(`Hora de deitar: ${toHHMM(now)}`, {
      actionLabel: 'Alterar',
      onAction: () => sheets.openSleep({ periodId: period.id, dayIndex: sleepTargetIndex, field: 'bedtime' }),
    });
  };
  const setWakeNow = async () => {
    const field = inNight || pos.state === 'after' ? 'nextWakeTime' : 'wakeTime';
    await actions.setSleepTimes(period.id, sleepTargetIndex, { [field]: toHHMM(now) });
    actions.showToast(`Hora de levantar: ${toHHMM(now)}`, {
      actionLabel: 'Alterar',
      onAction: () => sheets.openSleep({ periodId: period.id, dayIndex: sleepTargetIndex, field }),
    });
  };

  const reminders = isCurrent
    ? dueReminders({ now, windows, fluids: view.fluids, urine: view.urine, settings: state.settings.reminders })
    : [];
  const reminderKey = `${reminders.join(',')}@${Math.max(0, ...view.fluids.map((f) => f.timestamp), ...view.urine.map((u) => u.timestamp))}`;

  const title =
    pos.state === 'before' && selectedDay === null
      ? `Começa a ${formatDate(windows[0].date)}`
      : pos.state === 'after' && selectedDay === null
        ? 'Diário concluído'
        : `Dia ${shownIndex + 1} de ${n}`;

  const prevNight = shownIndex > 0 ? view.summary.days[shownIndex - 1] : null;

  return (
    <>
      <header className="day-header">
        <div className="eyebrow">
          {period.title} {state.mode === 'demo' && <span className="badge demo">DEMO</span>}
        </div>
        <h1 className="day-title">{title}</h1>
        <div className="date">
          {formatLongDate(w.date)}
          {isCurrent && inNight && ' · noite'}
        </div>
        <div className="progress" aria-hidden="true">
          {view.summary.days.map((d) => (
            <span
              key={d.index}
              className={d.status === 'complete' ? 'done' : d.index === currentIndex && pos.state === 'during' ? 'current' : ''}
            />
          ))}
        </div>
        {n > 1 && (
          <nav className="day-switcher" aria-label="Escolher dia">
            {windows.map((win) => (
              <button
                key={win.index}
                type="button"
                aria-current={win.index === shownIndex ? 'true' : undefined}
                onClick={() => setSelectedDay(win.index === currentIndex ? null : win.index)}
              >
                Dia {win.index + 1}
                {win.index === currentIndex && pos.state === 'during' ? ' · hoje' : ''}
              </button>
            ))}
          </nav>
        )}
      </header>

      {pos.state === 'before' && (
        <Banner title="O diário ainda não começou">
          Começa a {formatDate(windows[0].date)} às {toHHMM(windows[0].wakeAt)}. Registos antes disso não entram nos cálculos.
        </Banner>
      )}

      {pos.state === 'after' && lastMetrics.status === 'awaiting_first_void' && (
        <Banner
          tone="night"
          icon="sun"
          title="Último passo"
          actions={
            <button type="button" className="btn btn-primary" onClick={() => sheets.openUrine({ periodId: period.id })}>
              + Urinei
            </button>
          }
        >
          Regista a primeira micção desta manhã — entra no volume da última noite.
        </Banner>
      )}

      {pos.state === 'after' && lastMetrics.status === 'complete' && (
        <Banner
          icon="check"
          title="Diário concluído"
          actions={
            <>
              <button type="button" className="btn btn-primary" onClick={() => navigate({ name: 'summary', id: period.id })}>
                Ver resumo
              </button>
              <button type="button" className="btn" onClick={() => navigate({ name: 'report', id: period.id })}>
                Relatório para o urologista
              </button>
              <button type="button" className="btn" onClick={() => setNewDiaryOpen(true)}>
                Novo diário
              </button>
            </>
          }
        >
          Obrigado pelos registos. Leva o relatório à consulta.
        </Banner>
      )}

      {isCurrent && !inNight && w.estimated.wake && now - w.wakeAt >= 4 * HOUR && (
        <Banner
          icon="sun"
          title="A que horas te levantaste hoje?"
          actions={
            <button type="button" className="btn" onClick={() => sheets.openSleep({ periodId: period.id, dayIndex: shownIndex, field: 'wakeTime' })}>
              Indicar hora
            </button>
          }
        >
          Está a ser usada a hora habitual ({toHHMM(w.wakeAt)}).
        </Banner>
      )}

      {dayRedFlag && (
        <Banner tone="warn" icon="alert" role="note">
          {RED_FLAG_MESSAGE}
        </Banner>
      )}

      {reminders.length > 0 && dismissedReminders !== reminderKey && (
        <Banner
          icon="bell"
          role="status"
          actions={
            <button type="button" className="btn btn-plain" onClick={() => setDismissedReminders(reminderKey)}>
              Dispensar
            </button>
          }
        >
          {reminders.map((r) => (
            <div key={r}>{REMINDER_TEXT[r]}</div>
          ))}
        </Banner>
      )}

      <div className="quick-actions">
        <button type="button" className="quick-action fluid" onClick={() => sheets.openFluid({ periodId: period.id })}>
          <span className="qa-icon">
            <Icon name="drop" size={24} />
          </span>
          <span>
            + BEBI
            <small>Registar bebida</small>
          </span>
        </button>
        <button type="button" className="quick-action urine" onClick={() => sheets.openUrine({ periodId: period.id })}>
          <span className="qa-icon">
            <Icon name="toilet" size={24} />
          </span>
          <span>
            + URINEI
            <small>Registar micção</small>
          </span>
        </button>
      </div>

      <div className="secondary-actions">
        {showBedtime && (
          <button type="button" className="pill night" onClick={() => void setBedtimeNow()}>
            <Icon name="moon" size={18} /> Vou deitar-me
          </button>
        )}
        {showWake && (
          <button type="button" className="pill" onClick={() => void setWakeNow()}>
            <Icon name="sun" size={18} /> Levantei-me
          </button>
        )}
        <button type="button" className="pill" onClick={() => sheets.openUrine({ periodId: period.id, kind: 'leak_only' })}>
          <Icon name="leak" size={18} /> Perda
        </button>
        <button type="button" className="pill" onClick={() => navigate({ name: 'day', id: period.id, dayNumber: shownIndex + 1 })}>
          <Icon name="note" size={18} /> Sono, notas e contexto
        </button>
      </div>

      <Section title={isCurrent ? 'Hoje' : `Dia ${shownIndex + 1}`}>
        <div className="stats four">
          <Stat label="Líquidos" value={formatMl(metrics.fluidIntakeMl).replace(/ mL$/, '')} unit="mL" sub={`${metrics.fluidCount} ${plural(metrics.fluidCount, 'bebida', 'bebidas')}`} />
          <Stat label="Urina" value={formatMl(urineToday).replace(/ mL$/, '')} unit="mL" sub={metrics.unmeasuredVoids ? `${metrics.unmeasuredVoids} sem volume` : 'volume medido'} />
          <Stat label="Micções" value={metrics.voidCount} sub={`${metrics.daytimeVoids} ${plural(metrics.daytimeVoids, 'diurna', 'diurnas')}`} />
          <Stat
            label="Micções nocturnas"
            value={metrics.nocturnalVoids}
            night
            sub={`${metrics.nocturnalAwakenings} por vontade de urinar`}
          />
        </div>
        {prevNight && (
          <p className="section-footer">
            <Icon name="moon" size={14} /> Noite anterior: {prevNight.nocturnalVoids}{' '}
            {plural(prevNight.nocturnalVoids, 'micção nocturna', 'micções nocturnas')} ({prevNight.nocturnalAwakenings} por vontade de
            urinar) · volume nocturno {formatMl(prevNight.nocturnal.volumeMl)}
            {!prevNight.nocturnal.complete && ' (incompleto)'}.
          </p>
        )}
      </Section>

      <Section
        title="Registos"
        footer={
          <a href={`#/diarios/${period.id}/dia/${shownIndex + 1}`}>Ver dia completo, sono e notas</a>
        }
      >
        <Timeline view={view} dayIndex={shownIndex} />
      </Section>

      {view.summary.days.some((d) => d.status === 'complete') && pos.state !== 'after' && (
        <Section title="Até agora">
          <div className="card">
            <dl className="kv">
              <dt>Média de micções nocturnas</dt>
              <dd>{formatAverage(view.summary.averages.nocturnalVoids)}</dd>
              <dt>Média de líquidos por dia</dt>
              <dd>{formatMl(view.summary.averages.fluidIntakeMl)}</dd>
            </dl>
            <button type="button" className="btn btn-plain" style={{ marginTop: '0.5rem' }} onClick={() => navigate({ name: 'summary', id: period.id })}>
              Ver resumo completo <Icon name="chevron" size={16} />
            </button>
          </div>
        </Section>
      )}

      <p className="section-footer center">{DISCLAIMER}</p>
      {newDiaryOpen && <NewDiarySheet onClose={() => setNewDiaryOpen(false)} />}
    </>
  );
}
