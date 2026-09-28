import { describe, expect, it } from 'vitest';
import { BACKUP_SCHEMA_VERSION, createBackup, filterDataSet, parseBackup, serializeBackup } from '../src/data/backup';
import { buildDemoData } from '../src/data/demo';
import { DEFAULT_SETTINGS } from '../src/domain/types';
import { buildAllDataCsv, buildReportCsv, csvNumber, csvText, toCsv } from '../src/app/csv';
import { buildPeriodView } from '../src/app/store';
import { buildReportModel } from '../src/app/report/model';
import { generateReportPdf, pdfSafe } from '../src/app/report/pdf';
import { at } from './factories';

const data = buildDemoData('2026-09-23', 0);
const settings = { ...DEFAULT_SETTINGS, onboardingDone: true };
const NOW = at('2026-09-27', '12:00');

describe('cópia de segurança JSON', () => {
  it('exporta e restaura todos os dados (ida e volta)', () => {
    const backup = createBackup(data, { settings, demo: false, appVersion: '1.0.0', now: NOW });
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.data).toEqual(data);
    expect(parsed.backup.settings).toEqual(settings);
    expect(parsed.backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed.summary).toMatchObject({ periods: 1, days: 3, fluids: 19, urine: 25, demo: false });
  });

  it('marca cópias do modo de demonstração', () => {
    const parsed = parseBackup(serializeBackup(createBackup(data, { demo: true, appVersion: '1.0.0' })));
    expect(parsed.ok && parsed.summary.demo).toBe(true);
  });

  it('rejeita ficheiros inválidos sem alterar nada', () => {
    expect(parseBackup('não é json')).toEqual({ ok: false, errors: ['O ficheiro não é um JSON válido.'] });
    expect(parseBackup(JSON.stringify({ app: 'outra' })).ok).toBe(false);
    const future = createBackup(data, { demo: false, appVersion: '9' });
    expect(parseBackup(JSON.stringify({ ...future, schemaVersion: 99 })).ok).toBe(false);
  });

  it('valida campos: volumes negativos, horas e referências', () => {
    const bad = structuredClone(data);
    bad.fluids[0].volumeMl = -5;
    bad.days[0].bedtime = '25:99';
    const r = parseBackup(JSON.stringify(createBackup(bad, { demo: false, appVersion: '1' })));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/volume inválido/);
    expect(r.errors.join(' ')).toMatch(/horas de sono inválidas/);

    const orphan = structuredClone(data);
    orphan.urine[0].diaryPeriodId = 'inexistente';
    const r2 = parseBackup(JSON.stringify(createBackup(orphan, { demo: false, appVersion: '1' })));
    expect(r2.ok).toBe(false);

    const dup = structuredClone(data);
    dup.fluids[1].id = dup.fluids[0].id;
    expect(parseBackup(JSON.stringify(createBackup(dup, { demo: false, appVersion: '1' }))).ok).toBe(false);
  });

  it('sanitiza texto importado', () => {
    const dirty = structuredClone(data);
    dirty.urine[0].notes = 'nota\u0007 com ‮controlo';
    const r = parseBackup(JSON.stringify(createBackup(dirty, { demo: false, appVersion: '1' })));
    expect(r.ok && r.backup.data.urine[0].notes).toBe('nota com controlo');
  });

  it('exporta um único diário', () => {
    const subset = filterDataSet({ ...data, periods: [...data.periods, { ...data.periods[0], id: 'x' }] }, 'demo-period');
    expect(subset.periods).toHaveLength(1);
    expect(subset.urine).toHaveLength(25);
  });
});

describe('CSV', () => {
  it('usa ponto e vírgula, BOM UTF-8 e CRLF', () => {
    const csv = toCsv([
      ['a', 'b;c'],
      ['"x"', 1],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿a;"b;c"\r\n"""x""";1\r\n');
  });

  it('protege contra injecção de fórmulas', () => {
    expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvText('+351')).toBe("'+351");
    expect(csvText('@SUM')).toBe("'@SUM");
  });

  it('usa vírgula decimal', () => {
    expect(csvNumber(30.9, 1)).toBe('30,9');
    expect(csvNumber(250)).toBe('250');
    expect(csvNumber(null)).toBe('');
  });

  it('relatório CSV contém aviso, métricas e registo cronológico', () => {
    const view = buildPeriodView(data, settings, 'demo-period', NOW)!;
    const csv = buildReportCsv(buildReportModel(view, settings, { demo: true, now: NOW }));
    expect(csv).toContain('Dados de diário miccional fornecidos pelo utilizador. Não constitui diagnóstico médico.');
    expect(csv).toContain('DADOS DE DEMONSTRAÇÃO (DEMO)');
    expect(csv).toContain('Índice de produção urinária nocturna (NPi)');
    expect(csv).toMatch(/Volume urinário nocturno;570;550;490;537/);
    expect(csv).toContain('Registo cronológico');
    // 19 bebidas + 25 eventos urinários
    const eventLines = csv.split('\r\n').filter((l) => /^\d{2}\/\d{2}\/\d{4};\d{2}:\d{2};/.test(l));
    expect(eventLines).toHaveLength(44);
  });

  it('CSV completo tem uma linha por evento', () => {
    const csv = buildAllDataCsv(data, settings, NOW);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('Diário;Data;Hora');
    expect(lines).toHaveLength(1 + 44);
  });
});

describe('relatório PDF', () => {
  it('gera um PDF válido', async () => {
    const view = buildPeriodView(data, settings, 'demo-period', NOW)!;
    const blob = generateReportPdf(buildReportModel(view, settings, { demo: false, now: NOW }));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
  });

  it('remove caracteres não suportados pelas fontes do PDF', () => {
    expect(pdfSafe('nível ≥ 3 → ok 🚽')).toBe('nível >= 3 -> ok ');
    expect(pdfSafe('Micção – ção “ok”')).toBe('Micção – ção “ok”');
  });
});
