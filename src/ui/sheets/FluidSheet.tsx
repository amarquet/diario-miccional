import { useMemo, useState } from 'react';
import type { BeverageType, FluidEvent } from '../../domain/types';
import { BEVERAGE_TYPES } from '../../domain/types';
import { BEVERAGE_DEFAULT_FLAGS, BEVERAGE_EMOJI, BEVERAGE_LABELS, beverageLabel } from '../../domain/labels';
import { LIMITS, parseVolumeInput, sanitizeLine, validateFluidInput } from '../../domain/validation';
import { MINUTE, toHHMM } from '../../domain/time';
import { formatMl } from '../../domain/format';
import { useNow, useStore } from '../../app/store';
import { Sheet } from '../Sheet';
import { ChoiceChips, Field, Messages, Switch } from '../components';
import { TimeField, VolumeField, periodDateOptions } from '../fields';
import { Icon } from '../icons';

const PRESETS = [100, 200, 250, 330, 500];

interface QuickCombo {
  beverageType: BeverageType;
  customBeverage: string;
  volumeMl: number;
  caffeine: boolean;
  alcohol: boolean;
}

/** Até 3 combinações recentes (tipo + volume) para registo com um toque. */
function recentCombos(fluids: FluidEvent[]): QuickCombo[] {
  const seen = new Set<string>();
  const out: QuickCombo[] = [];
  for (const f of [...fluids].sort((a, b) => b.createdAt - a.createdAt)) {
    const key = `${f.beverageType}|${f.customBeverage}|${f.volumeMl}`;
    if (seen.has(key) || f.volumeMl <= 0) continue;
    seen.add(key);
    out.push({ beverageType: f.beverageType, customBeverage: f.customBeverage, volumeMl: f.volumeMl, caffeine: f.caffeine, alcohol: f.alcohol });
    if (out.length === 3) break;
  }
  if (out.length === 0) out.push({ beverageType: 'water', customBeverage: '', volumeMl: 250, caffeine: false, alcohol: false });
  return out;
}

export function FluidSheet({
  periodId,
  existing,
  template,
  onClose,
  onDuplicate,
}: {
  periodId: string;
  existing?: FluidEvent;
  template?: FluidEvent;
  onClose: () => void;
  onDuplicate: (event: FluidEvent) => void;
}) {
  const { state, actions } = useStore();
  const now = useNow(15_000);
  const period = state.data.periods.find((p) => p.id === periodId);
  const source = existing ?? template;
  const isEdit = Boolean(existing);

  const [timestamp, setTimestamp] = useState<number | null>(existing ? existing.timestamp : Math.floor(Date.now() / MINUTE) * MINUTE);
  const [beverageType, setBeverageType] = useState<BeverageType>(source?.beverageType ?? state.settings.lastBeverageType);
  const [customBeverage, setCustomBeverage] = useState(source?.customBeverage ?? '');
  const [volumeText, setVolumeText] = useState(source ? String(source.volumeMl) : '');
  const [caffeine, setCaffeine] = useState(source?.caffeine ?? BEVERAGE_DEFAULT_FLAGS[beverageType].caffeine);
  const [alcohol, setAlcohol] = useState(source?.alcohol ?? BEVERAGE_DEFAULT_FLAGS[beverageType].alcohol);
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const volume = parseVolumeInput(volumeText);
  const validation = validateFluidInput({ timestamp, volumeMl: volume }, now);
  const combos = useMemo(
    () => (isEdit ? [] : recentCombos(state.data.fluids)),
    [isEdit, state.data.fluids],
  );

  if (!period) return null;
  const dateOptions = periodDateOptions(period.startDate, period.numberOfDays);

  const chooseType = (type: BeverageType | null) => {
    if (!type) return;
    setBeverageType(type);
    setCaffeine(BEVERAGE_DEFAULT_FLAGS[type].caffeine);
    setAlcohol(BEVERAGE_DEFAULT_FLAGS[type].alcohol);
  };

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
      timestamp: timestamp!,
      volumeMl: volume as number,
      beverageType,
      customBeverage: beverageType === 'other' ? sanitizeLine(customBeverage, LIMITS.customBeverageMaxLength) : '',
      caffeine,
      alcohol,
      notes,
    };
    try {
      if (existing) {
        await actions.updateFluid(existing.id, input);
        actions.showToast('Alterações guardadas');
      } else {
        await actions.addFluid(input);
        actions.showToast(`Bebida registada · ${formatMl(input.volumeMl)}`);
      }
      onClose();
    } catch {
      setSaving(false);
      actions.showToast('Não foi possível guardar. Tenta novamente.', { tone: 'error' });
    }
  };

  const quickSave = async (combo: QuickCombo) => {
    await actions.addFluid({ diaryPeriodId: periodId, timestamp: Math.floor(Date.now() / MINUTE) * MINUTE, notes: '', ...combo });
    actions.showToast(`${beverageLabel(combo.beverageType, combo.customBeverage)} ${formatMl(combo.volumeMl)} registada às ${toHHMM(Date.now())}`);
    onClose();
  };

  const remove = async () => {
    if (!existing) return;
    onClose();
    await actions.deleteFluid(existing.id);
  };

  const shownErrors = submitted ? validation.errors : [];
  const shownWarnings = acceptWarnings ? validation.warnings : [];

  return (
    <Sheet
      open
      onClose={onClose}
      title={isEdit ? 'Editar bebida' : 'Registar bebida'}
      footer={
        <>
          <Messages errors={shownErrors} warnings={shownWarnings} />
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
        {template && !isEdit && <p className="muted small" style={{ margin: 0 }}>Cópia de um registo anterior — confirma a hora e guarda.</p>}

        {!isEdit && !template && combos.length > 0 && (
          <div className="field">
            <span className="field-label">Registo rápido (agora)</span>
            <div className="chips">
              {combos.map((c) => (
                <button
                  key={`${c.beverageType}-${c.customBeverage}-${c.volumeMl}`}
                  type="button"
                  className="chip"
                  onClick={() => void quickSave(c)}
                >
                  <span aria-hidden="true">{BEVERAGE_EMOJI[c.beverageType]}</span>
                  {beverageLabel(c.beverageType, c.customBeverage)} {formatMl(c.volumeMl)}
                </button>
              ))}
            </div>
          </div>
        )}

        <TimeField value={timestamp} onChange={setTimestamp} dateOptions={dateOptions} now={now} />

        <ChoiceChips
          legend="Bebida"
          value={beverageType}
          onChange={chooseType}
          layout="grid-3"
          options={BEVERAGE_TYPES.map((t) => ({
            value: t,
            label: BEVERAGE_LABELS[t],
            prefix: <span aria-hidden="true">{BEVERAGE_EMOJI[t]}</span>,
          }))}
        />
        {beverageType === 'other' && (
          <Field label="Nome da bebida" htmlFor="custom-beverage">
            <input
              id="custom-beverage"
              className="input"
              value={customBeverage}
              maxLength={LIMITS.customBeverageMaxLength}
              onChange={(e) => setCustomBeverage(e.target.value)}
              placeholder="Ex.: sopa, gelatina, isotónica"
            />
          </Field>
        )}

        <VolumeField legend="Volume (mL)" presets={PRESETS} text={volumeText} onTextChange={(t) => { setVolumeText(t); setAcceptWarnings(false); }} layout="grid-3" />

        <div className="card" style={{ padding: '0.25rem 1rem' }}>
          <Switch label="Contém cafeína" checked={caffeine} onChange={setCaffeine} />
          <Switch label="Contém álcool" checked={alcohol} onChange={setAlcohol} />
        </div>

        <details className="disclosure" open={Boolean(source?.notes)}>
          <summary>Notas</summary>
          <div className="disclosure-body">
            <label className="visually-hidden" htmlFor="fluid-notes">
              Notas
            </label>
            <textarea
              id="fluid-notes"
              className="textarea"
              value={notes}
              maxLength={LIMITS.notesMaxLength}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </details>
      </div>
    </Sheet>
  );
}

