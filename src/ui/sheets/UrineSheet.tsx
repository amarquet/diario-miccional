import { useMemo, useState } from 'react';
import type {
  Awakening,
  LeakageSeverity,
  PeriodOverride,
  SymptomFlag,
  UrgencyLevel,
  UrineEvent,
  UrineEventKind,
} from '../../domain/types';
import { LEAKAGE_SEVERITIES, SYMPTOM_FLAGS } from '../../domain/types';
import {
  AWAKENING_LABELS,
  LEAKAGE_LABELS,
  RED_FLAG_MESSAGE,
  SYMPTOM_LABELS,
  URGENCY_DESCRIPTIVE_LABELS,
  URGENCY_LEVELS,
  URGENCY_SHORT_LABELS,
} from '../../domain/labels';
import { classifyUrineEvents, locateInstant, resolveDayWindows } from '../../domain/clinical';
import { LIMITS, parseVolumeInput, validateUrineInput } from '../../domain/validation';
import { hasRedFlag } from '../../domain/observations';
import { MINUTE, toHHMM } from '../../domain/time';
import { formatMl } from '../../domain/format';
import { useNow, useStore } from '../../app/store';
import { Sheet } from '../Sheet';
import { Banner, ChoiceChips, Messages, MultiChips, Segmented } from '../components';
import { TimeField, VolumeField, periodDateOptions } from '../fields';
import { Icon } from '../icons';

const PRESETS = [50, 100, 150, 200, 250, 300, 400, 500];

export function UrineSheet({
  periodId,
  existing,
  template,
  initialKind,
  onClose,
  onDuplicate,
}: {
  periodId: string;
  existing?: UrineEvent;
  template?: UrineEvent;
  initialKind?: UrineEventKind;
  onClose: () => void;
  onDuplicate: (event: UrineEvent) => void;
}) {
  const { state, actions } = useStore();
  const now = useNow(15_000);
  const { settings } = state;
  const period = state.data.periods.find((p) => p.id === periodId);
  const source = existing ?? template;
  const isEdit = Boolean(existing);

  const [kind, setKind] = useState<UrineEventKind>(source?.kind ?? initialKind ?? 'void');
  const [timestamp, setTimestamp] = useState<number | null>(existing ? existing.timestamp : Math.floor(Date.now() / MINUTE) * MINUTE);
  const [volumeText, setVolumeText] = useState(source?.volumeMl != null ? String(source.volumeMl) : '');
  const [urgency, setUrgency] = useState<UrgencyLevel | null>(source?.urgencyLevel ?? null);
  const [leakage, setLeakage] = useState(source?.leakage ?? false);
  const [leakageSeverity, setLeakageSeverity] = useState<LeakageSeverity | null>(source?.leakageSeverity ?? null);
  const [awakening, setAwakening] = useState<Awakening | null>(source?.awakening ?? null);
  const [firstMorningVoid, setFirstMorningVoid] = useState<boolean | null>(existing ? existing.firstMorningVoid : null);
  const [periodOverride, setPeriodOverride] = useState<PeriodOverride>(existing?.periodOverride ?? 'auto');
  const [symptoms, setSymptoms] = useState<SymptomFlag[]>(source?.symptoms ?? []);
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const volume = kind === 'leak_only' ? null : parseVolumeInput(volumeText);
  const validation = validateUrineInput({ timestamp, volumeMl: volume, kind }, now);

  // Classificação em tempo real com o motor clínico (mesmas regras dos cálculos).
  const classification = useMemo(() => {
    if (timestamp === null) return null;
    const days = state.data.days.filter((d) => d.diaryPeriodId === periodId);
    const others = state.data.urine.filter((u) => u.diaryPeriodId === periodId && u.id !== existing?.id);
    const baseWindows = resolveDayWindows(days, settings, others);
    const position = locateInstant(baseWindows, timestamp);
    const draft: UrineEvent = {
      id: '__draft__',
      diaryPeriodId: periodId,
      kind,
      timestamp,
      volumeMl: volume,
      urgencyLevel: urgency,
      leakage,
      leakageSeverity,
      awakening,
      firstMorningVoid,
      periodOverride,
      symptoms,
      notes: '',
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    const all = [...others, draft];
    const classified = classifyUrineEvents(resolveDayWindows(days, settings, all), all).find((c) => c.event.id === '__draft__');
    const inNightWindow = position.state === 'during' && position.period === 'night';
    const nearWake =
      position.state === 'during' && position.period === 'day' && timestamp - baseWindows[position.index].wakeAt < 4 * 60 * MINUTE;
    return { position, classified, inNightWindow, nearWake };
  }, [timestamp, state.data.days, state.data.urine, settings, periodId, existing, kind, volume, urgency, leakage, leakageSeverity, awakening, firstMorningVoid, periodOverride, symptoms]);

  if (!period) return null;
  const dateOptions = periodDateOptions(period.startDate, period.numberOfDays);
  const isVoid = kind === 'void';
  const autoFmv = classification?.classified?.isFirstMorningVoid ?? false;
  const fmvChecked = firstMorningVoid === true || (firstMorningVoid === null && autoFmv);
  const effectivePeriod = classification?.classified?.period;
  const outside = classification?.position.state === 'before' || (classification?.position.state === 'after' && !autoFmv);
  const showNight =
    isVoid && classification?.classified?.placement === 'in' && effectivePeriod === 'night' && firstMorningVoid !== true;

  const save = async () => {
    setSubmitted(true);
    if (validation.errors.length) return;
    if (validation.warnings.length && !acceptWarnings) {
      setAcceptWarnings(true);
      return;
    }
    setSaving(true);
    const input = {
      diaryPeriodId: periodId,
      kind,
      timestamp: timestamp!,
      volumeMl: volume,
      urgencyLevel: urgency,
      leakage: kind === 'leak_only' ? true : leakage,
      leakageSeverity: kind === 'leak_only' || leakage ? leakageSeverity : null,
      awakening: isVoid && effectivePeriod === 'night' ? awakening : null,
      firstMorningVoid: isVoid ? firstMorningVoid : null,
      periodOverride,
      symptoms,
      notes,
    };
    try {
      if (existing) {
        await actions.updateUrine(existing.id, input);
        actions.showToast('Alterações guardadas');
      } else {
        await actions.addUrine(input);
        actions.showToast(
          kind === 'leak_only' ? 'Perda registada' : `Micção registada${volume !== null ? ` · ${formatMl(volume)}` : ''}`,
        );
      }
      onClose();
    } catch {
      setSaving(false);
      actions.showToast('Não foi possível guardar. Tenta novamente.', { tone: 'error' });
    }
  };

  const remove = async () => {
    if (!existing) return;
    onClose();
    await actions.deleteUrine(existing.id);
  };

  const urgencyOptions = URGENCY_LEVELS.map((level) =>
    settings.urgencyScale === 'numeric'
      ? {
          value: level,
          label: (
            <>
              <strong className="num">{level}</strong>
              <br />
              <span className="small">{URGENCY_SHORT_LABELS[level]}</span>
            </>
          ),
        }
      : { value: level, label: URGENCY_DESCRIPTIVE_LABELS[level] },
  );

  const periodBadge =
    classification?.classified && !outside ? (
      effectivePeriod === 'night' ? (
        <span className="badge night">
          <Icon name="moon" size={12} /> Noite
        </span>
      ) : (
        <span className="badge">
          <Icon name="sun" size={12} /> Dia
        </span>
      )
    ) : null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={isEdit ? (isVoid ? 'Editar micção' : 'Editar perda') : isVoid ? 'Registar micção' : 'Registar perda'}
      headerAction={periodBadge}
      footer={
        <>
          <Messages errors={submitted ? validation.errors : []} warnings={acceptWarnings ? validation.warnings : []} />
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={save} disabled={saving}>
            {acceptWarnings && validation.warnings.length ? 'Guardar mesmo assim' : isEdit ? 'Guardar alterações' : 'Guardar'}
          </button>
          {isEdit && existing && (
            <div className="row-flex" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-plain" onClick={() => onDuplicate(existing)}>
                <Icon name="copy" size={18} /> Duplicar
              </button>
              <button type="button" className="btn btn-plain" style={{ color: 'var(--danger)' }} onClick={remove}>
                <Icon name="trash" size={18} /> Eliminar
              </button>
            </div>
          )}
        </>
      }
    >
      <div className="form-section">
        <Segmented
          label="Tipo de registo"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'void', label: 'Micção' },
            { value: 'leak_only', label: 'Só perda (sem micção)' },
          ]}
        />
        {template && !isEdit && <p className="muted small" style={{ margin: 0 }}>Cópia de um registo anterior — confirma a hora e guarda.</p>}

        <TimeField value={timestamp} onChange={setTimestamp} dateOptions={dateOptions} now={now} />
        {outside && timestamp !== null && (
          <p className="field-hint" style={{ marginTop: '-0.6rem' }}>
            Esta hora está fora do período do diário e não entra nos cálculos.
          </p>
        )}

        {isVoid && (
          <VolumeField
            legend="Volume urinado (mL)"
            presets={PRESETS}
            text={volumeText}
            onTextChange={(t) => {
              setVolumeText(t);
              setAcceptWarnings(false);
            }}
            hint="Se não mediste, deixa em branco."
          />
        )}

        {showNight && (
          <div className="banner night" style={{ margin: 0, display: 'block' }}>
            <ChoiceChips
              legend="Durante a noite"
              value={awakening}
              onChange={setAwakening}
              allowDeselect
              layout="stack-list"
              options={[
                { value: 'woke_to_void', label: AWAKENING_LABELS.woke_to_void },
                { value: 'already_awake', label: AWAKENING_LABELS.already_awake },
              ]}
            />
          </div>
        )}

        {isVoid && (classification?.inNightWindow || classification?.nearWake || fmvChecked) && (
          <label className="switch-row card" style={{ padding: '0.5rem 1rem' }}>
            <span>
              Primeira micção depois de me levantar
              {firstMorningVoid === null && autoFmv && <span className="sublabel">Detetada automaticamente</span>}
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={fmvChecked}
              onChange={(e) => setFirstMorningVoid(e.target.checked)}
            />
          </label>
        )}

        <ChoiceChips
          legend={settings.urgencyScale === 'numeric' ? 'Urgência (0–4)' : 'Urgência — conseguias adiar?'}
          value={urgency}
          onChange={setUrgency}
          allowDeselect
          layout={settings.urgencyScale === 'numeric' ? 'grid-3' : 'stack-list'}
          options={urgencyOptions}
        />

        {isVoid ? (
          <ChoiceChips
            legend="Perda urinária"
            value={leakage ? 'yes' : 'no'}
            onChange={(v) => {
              setLeakage(v === 'yes');
              if (v !== 'yes') setLeakageSeverity(null);
            }}
            layout="inline"
            options={[
              { value: 'no', label: 'Não' },
              { value: 'yes', label: 'Sim' },
            ]}
          />
        ) : null}
        {(leakage || !isVoid) && (
          <ChoiceChips
            legend="Quantidade da perda"
            value={leakageSeverity}
            onChange={setLeakageSeverity}
            allowDeselect
            layout="inline"
            options={LEAKAGE_SEVERITIES.map((s) => ({ value: s, label: LEAKAGE_LABELS[s] }))}
          />
        )}

        <details className="disclosure" open={Boolean(source?.notes || source?.symptoms.length || existing?.periodOverride !== undefined && existing.periodOverride !== 'auto')}>
          <summary>Mais opções</summary>
          <div className="disclosure-body">
            <MultiChips
              legend="Sintomas a assinalar"
              layout="stack-list"
              values={symptoms}
              onChange={setSymptoms}
              options={SYMPTOM_FLAGS.map((s) => ({ value: s, label: SYMPTOM_LABELS[s] }))}
            />
            {hasRedFlag(symptoms) && (
              <Banner tone="warn" icon="alert" role="note">
                {RED_FLAG_MESSAGE}
              </Banner>
            )}
            {isVoid && (
              <div className="field">
                <span className="field-label" id="override-label">
                  Classificação dia/noite
                </span>
                <Segmented
                  label="Classificação dia/noite"
                  value={periodOverride}
                  onChange={setPeriodOverride}
                  options={[
                    { value: 'auto', label: 'Automática' },
                    { value: 'day', label: 'Dia' },
                    { value: 'night', label: 'Noite' },
                  ]}
                />
                <span className="field-hint">
                  Automática: usa as horas de deitar e levantar registadas
                  {timestamp !== null ? ` (${toHHMM(timestamp)} → ${classification?.inNightWindow ? 'noite' : 'dia'})` : ''}.
                </span>
              </div>
            )}
            <div className="field">
              <label className="field-label" htmlFor="urine-notes">
                Notas
              </label>
              <textarea
                id="urine-notes"
                className="textarea"
                value={notes}
                maxLength={LIMITS.notesMaxLength}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
        </details>
      </div>
    </Sheet>
  );
}
