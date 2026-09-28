/**
 * Validação de dados introduzidos pelo utilizador.
 * - Erros bloqueiam a gravação.
 * - Avisos exigem confirmação, mas não impedem valores fisiológicos invulgares.
 */
import type { HHMM } from './types';
import { MINUTE, isValidHHMM } from './time';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export const LIMITS = {
  fluidWarnMl: 5000,
  urineWarnMl: 2000,
  absoluteMaxMl: 20000,
  futureToleranceMin: 10,
  notesMaxLength: 2000,
  titleMaxLength: 120,
  customBeverageMaxLength: 40,
  maxDiaryDays: 14,
} as const;

/** Converte o texto de um campo de volume. '' → null (não medido). */
export function parseVolumeInput(raw: string): number | null | typeof NaN {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

function validateTimestamp(timestamp: number | null | undefined, now: number, result: ValidationResult) {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) {
    result.errors.push('Indica a hora.');
    return;
  }
  if (timestamp > now + LIMITS.futureToleranceMin * MINUTE) {
    result.warnings.push('A hora indicada está no futuro.');
  }
}

export function validateFluidInput(
  input: { timestamp: number | null; volumeMl: number | null },
  now = Date.now(),
): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };
  validateTimestamp(input.timestamp, now, result);
  const v = input.volumeMl;
  if (v === null) result.errors.push('Indica o volume bebido.');
  else if (!Number.isFinite(v)) result.errors.push('O volume tem de ser um número.');
  else if (v < 0) result.errors.push('O volume não pode ser negativo.');
  else if (v > LIMITS.absoluteMaxMl) result.errors.push('O volume é demasiado elevado.');
  else if (v === 0) result.warnings.push('Volume de 0 mL. Confirma que queres registar esta bebida.');
  else if (v > LIMITS.fluidWarnMl) result.warnings.push('Volume superior a 5000 mL numa só bebida. Confirma o valor.');
  return result;
}

export function validateUrineInput(
  input: { timestamp: number | null; volumeMl: number | null; kind: 'void' | 'leak_only' },
  now = Date.now(),
): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };
  validateTimestamp(input.timestamp, now, result);
  const v = input.volumeMl;
  if (input.kind === 'leak_only') return result;
  if (v === null) return result; // não medido: permitido
  if (!Number.isFinite(v)) result.errors.push('O volume tem de ser um número.');
  else if (v < 0) result.errors.push('O volume não pode ser negativo.');
  else if (v > LIMITS.absoluteMaxMl) result.errors.push('O volume é demasiado elevado.');
  else if (v === 0) {
    result.warnings.push('Micção com 0 mL. Se não mediste o volume, deixa o campo vazio.');
  } else if (v > LIMITS.urineWarnMl) {
    result.warnings.push('Volume superior a 2000 mL numa só micção. Confirma o valor.');
  }
  return result;
}

export interface SleepTimesInput {
  wakeTime: HHMM | null;
  bedtime: HHMM | null;
  nextWakeTime: HHMM | null;
}

export function validateSleepTimes(input: SleepTimesInput): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };
  for (const [label, value] of [
    ['levantar', input.wakeTime],
    ['deitar', input.bedtime],
    ['levantar no dia seguinte', input.nextWakeTime],
  ] as const) {
    if (value !== null && !isValidHHMM(value)) result.errors.push(`Hora de ${label} inválida.`);
  }
  return result;
}

export function validateDiaryLength(days: number): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };
  if (!Number.isInteger(days) || days < 1) result.errors.push('O diário tem de ter pelo menos 1 dia.');
  else if (days > LIMITS.maxDiaryDays) result.errors.push(`Máximo de ${LIMITS.maxDiaryDays} dias por diário.`);
  return result;
}

// ---------------------------------------------------------------------------
// Sanitização de texto
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/**
 * Normaliza texto livre: remove caracteres de controlo e marcas de direcção
 * invisíveis, normaliza Unicode (NFC), limita o comprimento.
 * (O React já escapa HTML; isto protege exportações e o relatório.)
 */
export function sanitizeText(value: unknown, maxLength: number = LIMITS.notesMaxLength): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim().slice(0, maxLength);
}

/** Texto de uma só linha (títulos, nomes). */
export function sanitizeLine(value: unknown, maxLength: number): string {
  return sanitizeText(value, maxLength * 2).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
