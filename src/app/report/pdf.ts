/**
 * Relatório PDF para o urologista (A4, gerado inteiramente no dispositivo).
 * Este módulo é carregado sob pedido para não pesar no arranque da aplicação.
 */
import { jsPDF } from 'jspdf';
import { autoTable, type UserOptions } from 'jspdf-autotable';
import type { ReportModel } from './model';
import { reportGeneratedText } from './model';
import { HOUR } from '../../domain/time';
import { formatNumber } from '../../domain/format';

type RGB = [number, number, number];
const INK: RGB = [28, 28, 30];
const MUTED: RGB = [90, 90, 96];
const HAIRLINE: RGB = [214, 214, 220];
const DAY: RGB = [237, 161, 0];
const NIGHT: RGB = [74, 58, 167];
const NIGHT_WASH: RGB = [236, 234, 250];
const FLUID: RGB = [42, 120, 214];
const PANEL: RGB = [244, 244, 247];

const MARGIN = 14;
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** As fontes padrão do PDF só suportam Latin-1/WinAnsi: substitui o resto. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[   ]/g, ' ')
    .replace(/−/g, '-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/→/g, '->')
    .replace(/[‘’]/g, "'")
    .replace(/./gu, (ch) => {
      const code = ch.codePointAt(0)!;
      if (code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) return ch;
      if (WIN_ANSI_EXTRAS.includes(ch)) return ch;
      return '';
    });
}

interface Ctx {
  doc: jsPDF;
  y: number;
  width: number;
  pageHeight: number;
}

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y + needed > ctx.pageHeight - 20) {
    ctx.doc.addPage();
    ctx.y = MARGIN + 4;
  }
}

function heading(ctx: Ctx, text: string) {
  ensureSpace(ctx, 20);
  ctx.y += 8;
  ctx.doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
  ctx.doc.text(pdfSafe(text), MARGIN, ctx.y);
  ctx.y += 2.5;
}

function paragraph(ctx: Ctx, text: string, options: { size?: number; color?: RGB; bold?: boolean; indent?: number } = {}) {
  const { size = 9.5, color = INK, bold = false, indent = 0 } = options;
  ctx.doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...color);
  const lines = ctx.doc.splitTextToSize(pdfSafe(text), ctx.width - indent) as string[];
  const lh = size * 0.42;
  for (const line of lines) {
    ensureSpace(ctx, lh);
    ctx.y += lh;
    ctx.doc.text(line, MARGIN + indent, ctx.y);
  }
}

const tableDefaults = (ctx: Ctx): Partial<UserOptions> => ({
  margin: { left: MARGIN, right: MARGIN, bottom: 18 },
  theme: 'grid',
  styles: {
    font: 'helvetica',
    fontSize: 8.5,
    textColor: INK,
    lineColor: HAIRLINE,
    lineWidth: 0.2,
    cellPadding: 1.6,
    overflow: 'linebreak',
  },
  headStyles: { fillColor: PANEL, textColor: INK, fontStyle: 'bold' },
  startY: ctx.y + 2,
});

function table(ctx: Ctx, options: UserOptions) {
  const safe = (rows?: unknown[][]) => rows?.map((r) => r.map((c) => (typeof c === 'string' ? pdfSafe(c) : c)));
  autoTable(ctx.doc, {
    ...tableDefaults(ctx),
    ...options,
    head: safe(options.head as unknown[][]) as UserOptions['head'],
    body: safe(options.body as unknown[][]) as UserOptions['body'],
  });
  ctx.y = lastY(ctx.doc) + 2;
}

/** Gráfico de frequência-volume: uma faixa por dia, micções para cima, bebidas para baixo. */
function timelineChart(ctx: Ctx, model: ReportModel) {
  const { doc } = ctx;
  const days = model.summary.days;
  if (!days.length) return;
  const labelW = 24;
  const plotW = ctx.width - labelW;
  const upH = 13;
  const downH = 7;
  const rowH = upH + downH + 9;

  const volumes = [
    ...model.events.filter((e) => e.volumeMl !== null).map((e) => e.volumeMl as number),
    300,
  ];
  const scaleMax = Math.ceil(Math.max(...volumes) / 100) * 100;

  heading(ctx, 'Micções e líquidos ao longo de cada dia');
  ensureSpace(ctx, 12);
  // Legenda
  const legend: [RGB, string][] = [
    [DAY, 'Micção (dia)'],
    [NIGHT, 'Micção (noite)'],
    [FLUID, 'Bebida'],
    [NIGHT_WASH, 'Período de sono'],
  ];
  let lx = MARGIN;
  ctx.y += 5;
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
  for (const [color, label] of legend) {
    doc.setFillColor(...color).rect(lx, ctx.y - 2.6, 3, 3, 'F');
    doc.text(pdfSafe(label), lx + 4.2, ctx.y);
    lx += doc.getTextWidth(pdfSafe(label)) + 11;
  }
  doc.text(pdfSafe(`Altura máxima = ${formatNumber(scaleMax)} mL`), MARGIN + ctx.width, ctx.y, { align: 'right' });
  ctx.y += 3;

  for (const d of days) {
    ensureSpace(ctx, rowH + 2);
    const top = ctx.y;
    const base = top + upH;
    const x0 = MARGIN + labelW;
    const span = d.window.nextWakeAt - d.window.wakeAt;
    const xOf = (t: number) => x0 + ((t - d.window.wakeAt) / span) * plotW;

    doc.setFillColor(...NIGHT_WASH).rect(xOf(d.window.bedAt), top, xOf(d.window.nextWakeAt) - xOf(d.window.bedAt), upH + downH, 'F');
    doc.setDrawColor(...HAIRLINE).setLineWidth(0.2).line(x0, base, x0 + plotW, base);

    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK);
    doc.text(pdfSafe(model.dayLabels[d.index] ?? `Dia ${d.index + 1}`), MARGIN, base - 1);

    const barW = 1.3;
    const bucket = model.summary.buckets[d.index];
    for (const c of bucket.voids) {
      if (c.event.volumeMl === null) {
        doc.setDrawColor(...(c.period === 'night' ? NIGHT : DAY)).setLineWidth(0.3);
        doc.circle(xOf(c.event.timestamp), base - 1.2, 0.8, 'S');
        continue;
      }
      const h = Math.max(0.6, (c.event.volumeMl / scaleMax) * upH);
      doc.setFillColor(...(c.period === 'night' ? NIGHT : DAY));
      doc.rect(xOf(c.event.timestamp) - barW / 2, base - h, barW, h, 'F');
    }
    for (const f of bucket.fluids) {
      const h = Math.max(0.6, (f.volumeMl / scaleMax) * downH);
      doc.setFillColor(...FLUID).rect(xOf(f.timestamp) - barW / 2, base + 0.3, barW, h, 'F');
    }
    // Marcas de hora a cada 3 h (hora do relógio)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...MUTED);
    const firstTick = Math.ceil(d.window.wakeAt / (3 * HOUR)) * 3 * HOUR;
    for (let t = firstTick; t < d.window.nextWakeAt; t += HOUR) {
      const date = new Date(t);
      if (date.getMinutes() !== 0 || date.getHours() % 3 !== 0) continue;
      const x = xOf(t);
      doc.setDrawColor(...HAIRLINE).line(x, base + downH, x, base + downH + 1);
      doc.text(`${String(date.getHours()).padStart(2, '0')}h`, x, base + downH + 3.6, { align: 'center' });
    }
    ctx.y = top + rowH;
  }
  paragraph(ctx, 'Círculos vazios: micção sem volume medido.', { size: 7.5, color: MUTED });
}

export function generateReportPdf(model: ReportModel): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: pdfSafe(`Diário Miccional — ${model.title}`), creator: 'Diário Miccional', subject: 'Relatório para o urologista' });
  const ctx: Ctx = {
    doc,
    y: MARGIN + 4,
    width: doc.internal.pageSize.getWidth() - MARGIN * 2,
    pageHeight: doc.internal.pageSize.getHeight(),
  };

  // Cabeçalho
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...INK);
  doc.text(pdfSafe('Diário Miccional — Relatório para o urologista'), MARGIN, ctx.y);
  ctx.y += 2;
  paragraph(ctx, model.title, { size: 11, bold: true });
  paragraph(
    ctx,
    `Período: ${model.periodLabel}  ·  ${model.numberOfDays} ${model.numberOfDays === 1 ? 'dia' : 'dias'}  ·  ${reportGeneratedText(model)}`,
    { size: 9, color: MUTED },
  );

  if (model.demo) {
    ctx.y += 3;
    doc.setFillColor(255, 236, 230).roundedRect(MARGIN, ctx.y, ctx.width, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(160, 40, 20);
    doc.text(pdfSafe('DEMO — dados fictícios de demonstração, não são dados reais.'), MARGIN + 3, ctx.y + 5.3);
    ctx.y += 8;
  }

  ctx.y += 3;
  const disclaimerLines = doc.splitTextToSize(pdfSafe(model.disclaimer), ctx.width - 6) as string[];
  const boxH = 4 + disclaimerLines.length * 4.2;
  doc.setFillColor(...PANEL).roundedRect(MARGIN, ctx.y, ctx.width, boxH, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
  doc.text(disclaimerLines, MARGIN + 3, ctx.y + 5.2);
  ctx.y += boxH + 1;

  heading(ctx, 'Resumo');
  table(ctx, {
    body: model.keyFigures.map((k) => [k.label, k.value]),
    columnStyles: { 0: { cellWidth: ctx.width * 0.65 }, 1: { halign: 'right', fontStyle: 'bold' } },
  });

  heading(ctx, 'Observações descritivas');
  for (const obs of model.observations) paragraph(ctx, `•  ${obs}`, { indent: 1 });
  if (model.symptoms.length) {
    ctx.y += 1;
    paragraph(ctx, `Sintomas assinalados pelo utilizador: ${model.symptoms.join(', ')}.`, { bold: true });
  }

  heading(ctx, 'Métricas por dia');
  table(ctx, {
    head: [['Métrica', ...model.dayLabels, 'Média*']],
    body: model.metrics.map((m) => [m.label, ...m.values, m.aggregate]),
    styles: { fontSize: 7.8, cellPadding: 1.3, lineColor: HAIRLINE, lineWidth: 0.2, textColor: INK, font: 'helvetica' },
    columnStyles: Object.fromEntries(
      [0, ...model.dayLabels.map((_, i) => i + 1), model.dayLabels.length + 1].map((col) => [
        col,
        col === 0 ? { cellWidth: 52 } : { halign: 'right' as const },
      ]),
    ),
  });
  paragraph(
    ctx,
    '* Média dos dias completos. Para o volume máximo indica-se o maior valor do período. Dias em curso não entram nas médias.',
    { size: 7.5, color: MUTED },
  );

  heading(ctx, 'Horas de sono');
  table(ctx, {
    head: [['Dia', 'Levantar', 'Deitar', 'Levantar (dia seguinte)', 'Duração da noite']],
    body: model.sleep.map((s) => [s.label, s.wake, s.bed, s.nextWake, s.duration]),
  });
  if (model.sleep.some((s) => s.estimated)) {
    paragraph(ctx, '* Hora não registada pelo utilizador; foi usada a hora habitual.', { size: 7.5, color: MUTED });
  }

  timelineChart(ctx, model);

  heading(ctx, 'Registo cronológico');
  table(ctx, {
    head: [['Data', 'Hora', 'Período', 'Tipo', 'Volume', 'Detalhes', 'Notas']],
    body: model.events.map((e) => {
      const details = [
        e.beverage,
        e.caffeine === 'Sim' ? 'cafeína' : '',
        e.alcohol === 'Sim' ? 'álcool' : '',
        e.urgency ? `urgência ${e.urgency}` : '',
        e.type === 'Micção' && e.leak === 'Sim' ? `perda${e.leakSeverity ? ` ${e.leakSeverity.toLowerCase()}` : ''}` : '',
        e.type === 'Perda' && e.leakSeverity ? e.leakSeverity : '',
        e.nightContext,
        e.firstMorningVoid ? '1.ª micção da manhã' : '',
        e.symptoms,
      ]
        .filter(Boolean)
        .join('; ');
      return [e.date, e.time, e.period, e.type, e.volumeMl === null ? '—' : `${formatNumber(e.volumeMl)} mL`, details, e.notes];
    }),
    styles: { fontSize: 7.6, cellPadding: 1.2, lineColor: HAIRLINE, lineWidth: 0.2, textColor: INK, font: 'helvetica', overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 11 },
      2: { cellWidth: 14 },
      3: { cellWidth: 14 },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 62 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && model.events[data.row.index]?.isNight) {
        data.cell.styles.fillColor = NIGHT_WASH;
      }
    },
  });
  paragraph(ctx, 'Linhas sombreadas: eventos durante o período de sono.', { size: 7.5, color: MUTED });

  if (model.notes.length) {
    heading(ctx, 'Notas e contexto');
    table(ctx, {
      body: model.notes.map((n) => [n.label, n.text]),
      columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } },
    });
  }

  heading(ctx, 'Definições e método');
  paragraph(ctx, model.methodNote, { size: 8.5 });
  paragraph(ctx, 'NPi (índice de produção urinária nocturna) = volume urinário nocturno ÷ volume urinário de 24 h × 100.', { size: 8.5 });
  paragraph(ctx, 'Micções nocturnas: micções entre a hora de deitar e a hora de levantar registadas. A primeira micção depois de levantar conta como diurna.', { size: 8.5 });
  paragraph(ctx, model.urgencyNote, { size: 8.5 });

  // Rodapé em todas as páginas
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const h = ctx.pageHeight;
    doc.setDrawColor(...HAIRLINE).setLineWidth(0.2).line(MARGIN, h - 12, MARGIN + ctx.width, h - 12);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(pdfSafe(model.disclaimer + (model.demo ? ' DEMO.' : '')), MARGIN, h - 8);
    doc.text(`${i}/${pages}`, MARGIN + ctx.width, h - 8, { align: 'right' });
  }

  return doc.output('blob');
}
