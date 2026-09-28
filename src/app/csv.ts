/**
 * Exportação CSV legível no Excel (pt-PT) e no Google Sheets:
 * separador ";", vírgula decimal, UTF-8 com BOM, quebras de linha CRLF.
 * Texto introduzido pelo utilizador é protegido contra injecção de fórmulas.
 */
import type { DataSet, Settings } from '../domain/types';
import { buildPeriodView } from './store';
import { buildReportModel, type ReportEvent, type ReportModel } from './report/model';
import { formatDateTime } from '../domain/time';

export type CsvCell = string | number | null | undefined;

const BOM = '﻿';
const SEP = ';';

/** Número com vírgula decimal, sem separador de milhares. */
export function csvNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return (decimals === 0 ? String(Math.round(value)) : value.toFixed(decimals)).replace('.', ',');
}

/** Escapa uma célula de texto (aspas, separadores, fórmulas). */
export function csvText(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = String(value).replace(/ /g, ' ');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: CsvCell[][]): string {
  return BOM + rows.map((row) => row.map((cell) => (typeof cell === 'number' ? csvNumber(cell) : csvText(cell))).join(SEP)).join('\r\n') + '\r\n';
}

const EVENT_HEADER = [
  'Data',
  'Hora',
  'Dia do diário',
  'Período',
  'Tipo',
  'Volume (mL)',
  'Bebida',
  'Cafeína',
  'Álcool',
  'Urgência (0–4)',
  'Urgência',
  'Perda',
  'Gravidade da perda',
  'Contexto nocturno',
  'Primeira micção da manhã',
  'Sintomas',
  'Notas',
];

function eventRow(e: ReportEvent): CsvCell[] {
  return [
    e.date,
    e.time,
    e.day,
    e.period,
    e.type,
    csvNumber(e.volumeMl),
    e.beverage,
    e.caffeine,
    e.alcohol,
    e.urgencyLevel === null ? '' : String(e.urgencyLevel),
    e.urgency.replace(/^\d · /, ''),
    e.leak,
    e.leakSeverity,
    e.nightContext,
    e.firstMorningVoid,
    e.symptoms,
    e.notes,
  ];
}

/** CSV do relatório de um diário: resumo, métricas por dia, sono, registo cronológico e notas. */
export function buildReportCsv(model: ReportModel): string {
  const rows: CsvCell[][] = [
    ['Diário Miccional — Relatório para o urologista'],
    ['Diário', model.title],
    ['Período', model.periodLabel],
    ['Número de dias', String(model.numberOfDays)],
    ['Gerado em', formatDateTime(model.generatedAt)],
    ...(model.demo ? [['Atenção', 'DADOS DE DEMONSTRAÇÃO (DEMO)']] : []),
    ['Aviso', model.disclaimer],
    ['Método', model.methodNote],
    ['Urgência', model.urgencyNote],
    [],
    ['Resumo'],
    ...model.keyFigures.map((k) => [k.label, k.value]),
    [],
    ['Métrica', ...model.dayLabels, 'Média do período*'],
    ...model.metrics.map((m) => {
      const cell = (v: number | null) => csvNumber(v, m.decimals === 1 && v !== null && !Number.isInteger(v) ? 1 : 0);
      return [m.label, ...m.raw.map(cell), cell(m.aggregateRaw)];
    }),
    ['* Para o volume máximo por micção indica-se o maior valor do período.'],
    [],
    ['Sono', 'Levantar', 'Deitar', 'Levantar no dia seguinte', 'Duração da noite'],
    ...model.sleep.map((r) => [r.label, r.wake, r.bed, r.nextWake, r.duration]),
    ...(model.sleep.some((r) => r.estimated) ? [['* Hora não registada; foi usada a hora habitual.']] : []),
    [],
    ['Observações descritivas'],
    ...model.observations.map((o) => [o]),
    [],
    ['Registo cronológico'],
    EVENT_HEADER,
    ...model.events.map(eventRow),
  ];
  if (model.notes.length) {
    rows.push([], ['Notas e contexto']);
    for (const n of model.notes) rows.push([n.label, n.text]);
  }
  return toCsv(rows);
}

/** CSV com todos os eventos de todos os diários. */
export function buildAllDataCsv(data: DataSet, settings: Settings, now = Date.now()): string {
  const rows: CsvCell[][] = [['Diário', ...EVENT_HEADER]];
  const periods = [...data.periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const p of periods) {
    const view = buildPeriodView(data, settings, p.id, now);
    if (!view) continue;
    const model = buildReportModel(view, settings, { demo: false, now });
    for (const e of model.events) rows.push([p.title, ...eventRow(e)]);
  }
  return toCsv(rows);
}
