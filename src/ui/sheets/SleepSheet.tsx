import { useState } from 'react';
import type { HHMM } from '../../domain/types';
import { isValidHHMM, toHHMM } from '../../domain/time';
import { useStore } from '../../app/store';
import { Sheet } from '../Sheet';
import { Field } from '../components';

export type SleepField = 'wakeTime' | 'bedtime' | 'nextWakeTime';

const TITLES: Record<SleepField, string> = {
  wakeTime: 'Hora a que me levantei',
  bedtime: 'Hora a que me deitei',
  nextWakeTime: 'Hora a que me levantei (manhã seguinte)',
};

export function SleepSheet({
  periodId,
  dayIndex,
  field,
  defaultNow,
  onClose,
}: {
  periodId: string;
  dayIndex: number;
  field: SleepField;
  defaultNow?: boolean;
  onClose: () => void;
}) {
  const { state, actions } = useStore();
  const day = state.data.days.find((d) => d.diaryPeriodId === periodId && d.dayIndex === dayIndex);
  const usual = field === 'bedtime' ? state.settings.usualBedtime : state.settings.usualWakeTime;
  const current = day?.[field] ?? null;
  const [value, setValue] = useState<HHMM>(defaultNow ? toHHMM(Date.now()) : (current ?? usual));
  if (!day) return null;

  const save = async (next: HHMM | null) => {
    await actions.setSleepTimes(periodId, dayIndex, { [field]: next });
    actions.showToast(next ? `${TITLES[field]}: ${next}` : 'A usar a hora habitual');
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={TITLES[field]}
      footer={
        <>
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            disabled={!isValidHHMM(value)}
            onClick={() => void save(value)}
          >
            Guardar
          </button>
          {current !== null && (
            <button type="button" className="btn btn-plain btn-block" onClick={() => void save(null)}>
              Não sei · usar hora habitual ({usual})
            </button>
          )}
        </>
      }
    >
      <div className="form-section">
        <Field
          label="Hora"
          htmlFor="sleep-time"
          hint={
            field === 'bedtime'
              ? 'Se te deitaste depois da meia-noite, indica a hora na mesma (p. ex. 00:30).'
              : 'A hora a que te levantaste para iniciar o dia.'
          }
        >
          <input
            id="sleep-time"
            className="input num"
            type="time"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </Field>
        <div className="chips inline">
          <button type="button" className="chip" onClick={() => setValue(toHHMM(Date.now()))}>
            Agora
          </button>
          <button type="button" className="chip" onClick={() => setValue(usual)}>
            Hora habitual ({usual})
          </button>
        </div>
      </div>
    </Sheet>
  );
}
