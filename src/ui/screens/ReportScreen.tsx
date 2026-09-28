import { useEffect, useMemo, useState } from 'react';
import { useNow, usePeriodView, useStore } from '../../app/store';
import { buildReportModel, reportGeneratedText } from '../../app/report/model';
import { buildReportCsv } from '../../app/csv';
import { datedFilename, saveFile } from '../../app/platform';
import { Banner, EmptyState, Section, TopBar } from '../components';
import { Icon } from '../icons';

type PdfModule = typeof import('../../app/report/pdf');

export function ReportScreen({ id }: { id: string }) {
  const { state, actions } = useStore();
  const now = useNow(60_000);
  const view = usePeriodView(id, now);
  const [pdf, setPdf] = useState<PdfModule | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = state.mode === 'demo';

  // Pré-carrega o gerador de PDF para que a partilha no iPhone siga o toque do utilizador.
  useEffect(() => {
    let alive = true;
    import('../../app/report/pdf').then((m) => alive && setPdf(m)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const model = useMemo(
    () => (view ? buildReportModel(view, state.settings, { demo, now }) : null),
    [view, state.settings, demo, now],
  );

  if (!view || !model) {
    return (
      <>
        <TopBar back={{ name: 'diaries' }} backLabel="Diários" />
        <EmptyState icon="🔍" title="Diário não encontrado" />
      </>
    );
  }

  const prefix = `${demo ? 'DEMO-' : ''}relatorio-diario-miccional`;
  const downloadPdf = async () => {
    if (!pdf) return;
    setBusy(true);
    try {
      const blob = pdf.generateReportPdf(buildReportModel(view, state.settings, { demo, now: Date.now() }));
      await saveFile(blob, datedFilename(prefix, 'pdf'));
    } catch {
      actions.showToast('Não foi possível gerar o PDF.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const downloadCsv = async () => {
    const csv = buildReportCsv(buildReportModel(view, state.settings, { demo, now: Date.now() }));
    await saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), datedFilename(prefix, 'csv'));
  };

  return (
    <>
      <TopBar back={{ name: 'summary', id }} backLabel="Resumo" />
      <h1 className="page-title">Relatório para o urologista</h1>

      <div className="stack no-print" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void downloadPdf()} disabled={!pdf || busy}>
          <Icon name="download" /> {pdf ? (busy ? 'A gerar PDF…' : 'Transferir PDF') : 'A preparar PDF…'}
        </button>
        <div className="row-flex">
          <button type="button" className="btn" style={{ flex: 1 }} onClick={() => void downloadCsv()}>
            <Icon name="download" size={18} /> CSV
          </button>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={() => window.print()}>
            <Icon name="doc" size={18} /> Imprimir
          </button>
        </div>
        <p className="section-footer" style={{ margin: 0 }}>
          O relatório é criado no teu dispositivo. Tu decides com quem o partilhas.
        </p>
      </div>

      <article aria-label="Pré-visualização do relatório">
        <div className="card">
          <h2 className="h2" style={{ marginBottom: '0.25rem' }}>
            {model.title} {model.demo && <span className="badge demo">DEMO</span>}
          </h2>
          <dl className="kv">
            <dt>Período</dt>
            <dd>{model.periodLabel}</dd>
            <dt>Número de dias</dt>
            <dd>{model.numberOfDays}</dd>
          </dl>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {reportGeneratedText(model)}
          </p>
        </div>

        <Banner icon="info">
          <strong>{model.disclaimer}</strong>
        </Banner>

        {model.symptoms.length > 0 && (
          <Banner tone="warn" icon="alert">
            Sintomas assinalados: {model.symptoms.join(', ')}.
          </Banner>
        )}

        <Section title="Resumo">
          <div className="card">
            <dl className="kv">
              {model.keyFigures.map((k) => (
                <div key={k.label} style={{ display: 'contents' }}>
                  <dt>{k.label}</dt>
                  <dd>{k.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>

        <Section title="Observações descritivas">
          <div className="card">
            <ul className="observations">
              {model.observations.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        </Section>

        <Section title="Métricas por dia" footer="* Média dos dias completos; para o volume máximo indica-se o maior valor do período.">
          <div className="card table-scroll" style={{ margin: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Métrica</th>
                  {model.dayLabels.map((l) => (
                    <th key={l}>{l}</th>
                  ))}
                  <th>Média*</th>
                </tr>
              </thead>
              <tbody>
                {model.metrics.map((m) => (
                  <tr key={m.label}>
                    <td>{m.label}</td>
                    {m.values.map((v, i) => (
                      <td key={i}>{v}</td>
                    ))}
                    <td>
                      <strong>{m.aggregate}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Horas de sono" footer={model.sleep.some((s) => s.estimated) ? '* Hora não registada; foi usada a hora habitual.' : undefined}>
          <div className="card table-scroll" style={{ margin: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Levantar</th>
                  <th>Deitar</th>
                  <th>Levantar (seg.)</th>
                  <th>Noite</th>
                </tr>
              </thead>
              <tbody>
                {model.sleep.map((s) => (
                  <tr key={s.label}>
                    <td>{s.label}</td>
                    <td>{s.wake}</td>
                    <td>{s.bed}</td>
                    <td>{s.nextWake}</td>
                    <td>{s.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Registo cronológico" footer="Linhas sombreadas: eventos durante o período de sono.">
          <div className="card table-scroll" style={{ margin: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Volume</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {model.events.map((e, i) => (
                  <tr key={`${e.timestamp}-${i}`} className={e.isNight ? 'night-row' : undefined}>
                    <td>{e.date.slice(0, 5)}</td>
                    <td>{e.time}</td>
                    <td>
                      {e.type}
                      {e.isNight && <span className="sublabel">noite</span>}
                    </td>
                    <td>{e.volumeMl === null ? '—' : `${e.volumeMl} mL`}</td>
                    <td style={{ textAlign: 'left' }}>
                      {[e.beverage, e.urgency && `urgência ${e.urgency}`, e.leak === 'Sim' && `perda ${e.leakSeverity.toLowerCase()}`, e.nightContext, e.firstMorningVoid && '1.ª da manhã', e.symptoms, e.notes]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {model.notes.length > 0 && (
          <Section title="Notas e contexto">
            <ul className="list">
              {model.notes.map((n) => (
                <li key={n.label}>
                  <div className="list-static" style={{ display: 'block' }}>
                    <strong>{n.label}</strong>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Definições e método">
          <div className="card prose small">
            <p>{model.methodNote}</p>
            <p>NPi (índice de produção urinária nocturna) = volume urinário nocturno ÷ volume urinário de 24 h × 100.</p>
            <p>{model.urgencyNote}</p>
          </div>
        </Section>
      </article>
    </>
  );
}
