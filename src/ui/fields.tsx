import { useId } from 'react';
import type { ISODate } from '../domain/types';
import {
  MINUTE,
  addDays,
  combineDateTime,
  diffDays,
  formatDayMonth,
  isValidHHMM,
  toHHMM,
  toISODate,
  weekdayName,
} from '../domain/time';

export function dateOptionLabel(date: ISODate, today: ISODate): string {
  const diff = diffDays(today, date);
  const base = `${weekdayName(date, true)}, ${formatDayMonth(date)}`;
  if (diff === 0) return `Hoje · ${base}`;
  if (diff === -1) return `Ontem · ${base}`;
  if (diff === 1) return `Amanhã · ${base}`;
  return base;
}

/** Data + hora, com atalhos "Agora", "−5 min", "−15 min". */
export function TimeField({
  value,
  onChange,
  dateOptions,
  now,
  label = 'Quando',
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  dateOptions: ISODate[];
  now: number;
  label?: string;
}) {
  const id = useId();
  const today = toISODate(now);
  const date = value !== null ? toISODate(value) : today;
  const time = value !== null ? toHHMM(value) : '';
  const options = [...new Set([...dateOptions, date, today])].sort();

  return (
    <div className="field" role="group" aria-labelledby={`${id}-label`}>
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="time-row">
        <select
          className="select"
          aria-label="Data"
          value={date}
          onChange={(e) => onChange(time ? combineDateTime(e.target.value, time) : null)}
        >
          {options.map((d) => (
            <option key={d} value={d}>
              {dateOptionLabel(d, today)}
            </option>
          ))}
        </select>
        <input
          className="input num"
          type="time"
          aria-label="Hora"
          required
          value={time}
          onChange={(e) => onChange(isValidHHMM(e.target.value) ? combineDateTime(date, e.target.value) : null)}
        />
      </div>
      <div className="chips inline" style={{ marginTop: '0.1rem' }}>
        <button type="button" className="chip" onClick={() => onChange(Math.floor(now / MINUTE) * MINUTE)}>
          Agora
        </button>
        <button type="button" className="chip" onClick={() => onChange(Math.floor(now / MINUTE) * MINUTE - 5 * MINUTE)}>
          −5 min
        </button>
        <button type="button" className="chip" onClick={() => onChange(Math.floor(now / MINUTE) * MINUTE - 15 * MINUTE)}>
          −15 min
        </button>
      </div>
    </div>
  );
}

/** Volume em mL: botões rápidos + valor livre (teclado numérico no iPhone). */
export function VolumeField({
  legend,
  presets,
  text,
  onTextChange,
  hint,
  layout = 'grid-4',
}: {
  legend: string;
  presets: number[];
  text: string;
  onTextChange: (text: string) => void;
  hint?: string;
  layout?: 'grid-4' | 'grid-3';
}) {
  const id = useId();
  const name = useId();
  return (
    <fieldset className="fieldset">
      <legend>{legend}</legend>
      <div className={`chips ${layout}`}>
        {presets.map((p) => (
          <label key={p} className="chip num">
            <input
              type="radio"
              name={name}
              checked={text === String(p)}
              onChange={() => onTextChange(String(p))}
              aria-label={`${p} mL`}
            />
            <span aria-hidden="true">{p}</span>
          </label>
        ))}
      </div>
      <div className="field" style={{ marginTop: '0.6rem' }}>
        <label className="visually-hidden" htmlFor={id}>
          Volume em mililitros
        </label>
        <div className="input-with-unit">
          <input
            id={id}
            className="input num"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="Outro volume"
            value={text}
            onChange={(e) => onTextChange(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
            aria-describedby={hint ? `${id}-hint` : undefined}
          />
          <span className="unit" aria-hidden="true">
            mL
          </span>
        </div>
        {hint && (
          <span className="field-hint" id={`${id}-hint`}>
            {hint}
          </span>
        )}
      </div>
    </fieldset>
  );
}

/** Datas disponíveis nos seletores: dias do diário ± 1. */
export function periodDateOptions(startDate: ISODate, numberOfDays: number): ISODate[] {
  return Array.from({ length: numberOfDays + 2 }, (_, i) => addDays(startDate, i - 1));
}
