/**
 * Observações descritivas e neutras sobre o diário.
 *
 * Regras: descrever apenas os dados registados; nunca sugerir diagnósticos,
 * causas ou limiares clínicos. A interpretação cabe ao profissional de saúde.
 */
import type { PeriodSummary } from './clinical';
import type { SymptomFlag } from './types';
import { formatAverage, formatMl, formatPercent, plural } from './format';

export function buildObservations(summary: PeriodSummary, urgencyThreshold: number): string[] {
  const out: string[] = [];
  const n = summary.includedDays.length;
  if (n === 0) return out;

  const daysText = n === 1 ? 'No dia registado' : `Nos ${n} dias registados`;
  const avgNoct = summary.averages.nocturnalVoids;
  if (avgNoct !== null) {
    out.push(
      `${daysText}, a média foi de ${formatAverage(avgNoct)} ${plural(Math.round(avgNoct * 10) / 10, 'micção nocturna', 'micções nocturnas')} por noite.`,
    );
  }

  const nightVoids = summary.includedDays.reduce((s, d) => s + d.nocturnalVoids, 0);
  if (nightVoids > 0) {
    const woke = summary.includedDays.reduce((s, d) => s + d.nocturnalAwakenings, 0);
    const awake = summary.includedDays.reduce((s, d) => s + d.nocturnalAlreadyAwake, 0);
    const unspecified = nightVoids - woke - awake;
    const parts = [
      `${woke} ${plural(woke, 'registada', 'registadas')} como "acordei por causa da vontade de urinar"`,
      `${awake} como "já estava acordado"`,
    ];
    if (unspecified > 0) parts.push(`${unspecified} sem indicação`);
    out.push(`Das ${nightVoids} ${plural(nightVoids, 'micção nocturna', 'micções nocturnas')}, ${parts.join(', ')}.`);
  }

  const dayMean = summary.meanDaytimeVoidedVolumeMl;
  const nightMean = summary.meanNocturnalVoidedVolumeMl;
  if (dayMean !== null && nightMean !== null && dayMean > 0) {
    const ratio = nightMean / dayMean;
    const comparison =
      ratio < 0.9 ? 'inferiores aos' : ratio > 1.1 ? 'superiores aos' : 'semelhantes aos';
    out.push(
      `Os volumes das micções nocturnas (média ${formatMl(nightMean)}) foram ${comparison} volumes médios diurnos (${formatMl(dayMean)}).`,
    );
  }

  if (summary.npi !== null) {
    out.push(
      `O volume urinário nocturno correspondeu a ${formatPercent(summary.npi, 1)} do volume urinário de 24 horas (NPi).`,
    );
  }

  if (summary.averages.fluidIntakeMl !== null) {
    out.push(`A ingestão média de líquidos foi de ${formatMl(summary.averages.fluidIntakeMl)} por dia.`);
  }
  const evening = summary.averages.eveningFluidIntakeMl;
  if (evening !== null && evening > 0) {
    out.push(`Nas 3 horas antes de deitar, foram ingeridos em média ${formatMl(evening)}.`);
  }
  if (summary.caffeineDrinks > 0 || summary.alcoholDrinks > 0) {
    const drinks = (n: number, what: string) => `${n} ${plural(n, 'bebida', 'bebidas')} com ${what}`;
    out.push(`Registos com cafeína e álcool: ${drinks(summary.caffeineDrinks, 'cafeína')}; ${drinks(summary.alcoholDrinks, 'álcool')}.`);
  }

  if (summary.urgencyEpisodes === 0) {
    out.push(`Não foram registados episódios de urgência (nível ${urgencyThreshold} ou superior).`);
  } else {
    out.push(
      `${plural(summary.urgencyEpisodes, 'Foi registado', 'Foram registados')} ${summary.urgencyEpisodes} ${plural(summary.urgencyEpisodes, 'episódio', 'episódios')} de urgência (nível ${urgencyThreshold} ou superior).`,
    );
  }

  if (summary.leakageEpisodes === 0) {
    out.push('Não foram registados episódios de perda urinária.');
  } else {
    out.push(
      `${plural(summary.leakageEpisodes, 'Foi registado', 'Foram registados')} ${summary.leakageEpisodes} ${plural(summary.leakageEpisodes, 'episódio', 'episódios')} de perda urinária.`,
    );
  }

  if (summary.unmeasuredVoids > 0) {
    out.push(
      `${summary.unmeasuredVoids} ${plural(summary.unmeasuredVoids, 'micção não teve', 'micções não tiveram')} o volume medido; os volumes totais podem estar subestimados.`,
    );
  }
  if (summary.incompleteNocturnalVolumeDays > 0) {
    out.push(
      'Em alguns dias não foi identificada a primeira micção da manhã seguinte, pelo que o volume nocturno pode estar incompleto.',
    );
  }

  const discussable =
    (avgNoct ?? 0) >= 1 || summary.leakageEpisodes > 0 || summary.urgencyEpisodes > 0 || summary.npi !== null;
  if (discussable) out.push('Este padrão pode ser relevante para discutir com o urologista.');
  return out;
}

export const RED_FLAG_SYMPTOMS: SymptomFlag[] = ['blood', 'retention', 'fever', 'severe_pain', 'sudden_major_leak'];

export function hasRedFlag(symptoms: readonly SymptomFlag[]): boolean {
  return symptoms.some((s) => RED_FLAG_SYMPTOMS.includes(s));
}
