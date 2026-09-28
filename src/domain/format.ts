/**
 * Formatação numérica pt-PT (vírgula decimal; espaço como separador de
 * milhares a partir de 10 000). Implementação própria, determinística e
 * compatível com as fontes padrão do PDF (usa NBSP U+00A0).
 */
const NBSP = ' ';

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, frac] = fixed.split('.');
  const grouped = intPart.length > 4 ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) : intPart;
  const sign = value < 0 && Number(fixed) !== 0 ? '−' : '';
  return `${sign}${grouped}${frac ? `,${frac}` : ''}`;
}

/** "250 mL" (ou "—" quando não há valor). */
export function formatMl(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, decimals)}${NBSP}mL`;
}

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, decimals)}${NBSP}%`;
}

/** Valor médio com uma casa decimal, sem casas quando é inteiro ("2" / "1,7"). */
export function formatAverage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? formatNumber(rounded, 0) : formatNumber(rounded, 1);
}

/** Plural simples: plural(2, 'micção', 'micções'). */
export function plural(count: number, singular: string, pluralForm: string): string {
  return Math.abs(count) === 1 ? singular : pluralForm;
}
