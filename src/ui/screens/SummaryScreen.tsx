import { useMemo } from 'react';
import { hourlyDistribution } from '../../domain/clinical';
import { DISCLAIMER, NPI_LABEL, RED_FLAG_MESSAGE } from '../../domain/labels';
import { formatAverage, formatMl, formatNumber, formatPercent } from '../../domain/format';
import { buildObservations, hasRedFlag } from '../../domain/observations';
import { formatDate, formatDayMonth, toHHMM } from '../../domain/time';
import { latestPeriod, useNow, usePeriodView, useStore, type PeriodView } from '../../app/store';
import { navigate } from '../../app/router';
import { Banner, EmptyState, Section, Stat, TopBar } from '../components';
import { ChartCard, ColumnChart, Legend, StackedDayChart, type Column } from '../charts';
import { Icon } from '../icons';

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function hourlyColumns(values: number[], startHour: number, tone: 'day' | 'fluid', noun: string): Column[] {
  return Array.from({ length: 24 }, (_, i) => {
    const hour = (startHour + i) % 24;
    const hh = String(hour).padStart(2, '0');
    return {
      key: hh,
      axisLabel: `${hh}h`,
      value: values[hour],
      tone,
      tooltipTitle: `${hh}:00–${hh}:59 · ${noun}`,
      tooltipValue: `${formatNumber(values[hour])} mL/dia`,
    };
  });
}

function useSummaryCharts(view: PeriodView) {
  return useMemo(() => {
    const s = view.summary;
    const included = new Set(s.includedDays.map((d) => d.index));
    const buckets = s.buckets.filter((b) => included.has(b.window.index));
    const voids = buckets.flatMap((b) => b.voids);
    const last = buckets[buckets.length - 1];
    if (last?.closingFirstVoid?.placement === 'after') voids.push(last.closingFirstVoid);
    const fluids = buckets.flatMap((b) => b.fluids);
    const nDays = Math.max(1, buckets.length);

    const wakeHour = median(buckets.map((b) => new Date(b.window.wakeAt).getHours()));
    const bedHour = median(buckets.map((b) => new Date(b.window.bedAt).getHours()));
    const bedIndex = (bedHour - wakeHour + 24) % 24;

    const urineHourly = hourlyDistribution(voids.map((v) => v.event), nDays);
    const fluidHourly = hourlyDistribution(fluids, nDays);

    const voidColumns: Column[] = voids.map((v, i) => {
      const di = v.dayIndex ?? s.windows.length;
      const prev = voids[i - 1];
      const firstOfDay = !prev || (prev.dayIndex ?? s.windows.length) !== di;
      const night = v.period === 'night' && v.placement === 'in';
      return {
        key: v.event.id,
        axisLabel: firstOfDay ? (v.dayIndex === null ? 'M' : `D${di + 1}`) : '',
        value: v.event.volumeMl ?? 0,
        tone: night ? 'night' : 'day',
        tooltipTitle: `${formatDayMonth(v.event.timestamp)} ${toHHMM(v.event.timestamp)} · ${night ? 'nocturna' : 'diurna'}${v.isFirstMorningVoid ? ' · 1.ª da manhã' : ''}`,
        tooltipValue: v.event.volumeMl === null ? 'Sem volume medido' : `${formatNumber(v.event.volumeMl)} mL`,
      };
    });

    const stacked = s.includedDays.map((d) => ({
      key: String(d.index),
      label: `Dia ${d.index + 1}`,
      night: d.nocturnal.volumeMl,
      day: Math.max(0, d.total24h.volumeMl - d.nocturnal.volumeMl),
    }));

    return { wakeHour, bedIndex, urineHourly, fluidHourly, voidColumns, voids, stacked, nDays };
  }, [view]);
}

export function SummaryScreen({ periodId }: { periodId: string | null }) {
  const { state } = useStore();
  const now = useNow();
  const id = periodId ?? latestPeriod(state.data.periods)?.id ?? null;
  const view = usePeriodView(id, now);

  if (!view) {
    return (
      <>
        <h1 className="page-title">Resumo</h1>
        <div className="card">
          <EmptyState icon="📊" title="Sem dados para resumir">
            <p className="muted">Começa um diário no separador Hoje.</p>
          </EmptyState>
        </div>
      </>
    );
  }
  return <SummaryContent view={view} showSelector={periodId === null} />;
}

function SummaryContent({ view, showSelector }: { view: PeriodView; showSelector: boolean }) {
  const { state } = useStore();
  const { settings } = state;
  const s = view.summary;
  const charts = useSummaryCharts(view);
  const observations = buildObservations(s, settings.urgencyThreshold);
  const first = view.days[0]?.date;
  const last = view.days[view.days.length - 1]?.date;
  const complete = s.days.filter((d) => d.status === 'complete').length;
  const periods = [...state.data.periods].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      {!showSelector && <TopBar back={{ name: 'diary', id: view.period.id }} backLabel="Diário" />}
      <h1 className="page-title">Resumo do diário</h1>
      <p className="page-subtitle">
        {view.period.title} {state.mode === 'demo' && <span className="badge demo">DEMO</span>}
        <br />
        Período: {first && last ? `${formatDate(first)} – ${formatDate(last)}` : '—'}
      </p>

      {showSelector && periods.length > 1 && (
        <div className="field" style={{ marginBottom: '1rem' }}>
          <label className="field-label" htmlFor="summary-period">
            Diário
          </label>
          <select
            id="summary-period"
            className="select"
            value={view.period.id}
            onChange={(e) => navigate({ name: 'summary', id: e.target.value })}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({formatDate(p.startDate)})
              </option>
            ))}
          </select>
        </div>
      )}

      {s.isPartial && (
        <Banner title={`${complete} de ${s.days.length} dias completos`}>
          {complete > 0
            ? 'O diário ainda está em curso. As médias usam apenas os dias já completos.'
            : 'Ainda não há dias completos. Os valores abaixo são provisórios.'}
        </Banner>
      )}
      {hasRedFlag(s.symptoms) && (
        <Banner tone="warn" icon="alert" role="note">
          {RED_FLAG_MESSAGE}
        </Banner>
      )}

      <Section title="Métricas">
        <div className="stats">
          <Stat
            label="Média de micções nocturnas"
            value={formatAverage(s.averages.nocturnalVoids)}
            night
            sub={`${formatAverage(s.averages.nocturnalAwakenings)} por vontade de urinar`}
          />
          <Stat label="Média de volume urinário nocturno" value={formatMl(s.averages.nocturnalUrineVolumeMl)} night />
          <Stat label="Média de volume urinário em 24 h" value={formatMl(s.averages.total24hVolumeMl)} />
          <Stat label="Média de volume por micção" value={formatMl(s.averageVoidedVolumeMl)} />
          <Stat label="Maior volume urinário" value={formatMl(s.maxVoidedVolumeMl)} />
          <Stat label="Média de líquidos ingeridos" value={formatMl(s.averages.fluidIntakeMl)} sub="por dia" />
          <Stat label="Média de urgência" value={s.meanUrgency === null ? '—' : formatNumber(s.meanUrgency, 1)} sub={`escala 0–4 · ${s.urgencyEpisodes} episódios (nível ${settings.urgencyThreshold}+)`} />
          <Stat label="Episódios de perda" value={s.leakageEpisodes} sub="no período" />
        </div>
        <div className="stat" style={{ marginTop: '0.6rem' }}>
          <div className="stat-label">{NPI_LABEL}</div>
          <div className="stat-value">{formatPercent(s.npi, 1)}</div>
          <div className="stat-sub">Volume nocturno ÷ volume de 24 h × 100. Valor descritivo, a interpretar pelo médico.</div>
        </div>
      </Section>

      <Section title="Observações">
        <div className="card">
          {observations.length ? (
            <ul className="observations">
              {observations.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Ainda não há dados suficientes.
            </p>
          )}
          <p className="muted small" style={{ marginBottom: 0 }}>
            {DISCLAIMER}
          </p>
        </div>
      </Section>

      <Section title="Gráficos">
        <ChartCard
          title="Urina por hora"
          subtitle={`Média por dia (${charts.nDays} ${charts.nDays === 1 ? 'dia' : 'dias'}), a começar à hora habitual de levantar.`}
          table={<HourlyTable values={charts.urineHourly} />}
        >
          <ColumnChart
            ariaLabel="Gráfico de urina por hora do dia"
            columns={hourlyColumns(charts.urineHourly, charts.wakeHour, 'day', 'urina')}
            bands={[{ from: charts.bedIndex, to: 24 }]}
            labelEvery={3}
          />
          <Legend items={[{ tone: 'day', label: 'Urina (mL/dia)' }, { tone: 'band', label: 'Período de sono habitual' }]} />
        </ChartCard>

        <ChartCard
          title="Líquidos ingeridos por hora"
          subtitle="Média por dia, a começar à hora habitual de levantar."
          table={<HourlyTable values={charts.fluidHourly} />}
        >
          <ColumnChart
            ariaLabel="Gráfico de líquidos ingeridos por hora do dia"
            columns={hourlyColumns(charts.fluidHourly, charts.wakeHour, 'fluid', 'líquidos')}
            bands={[{ from: charts.bedIndex, to: 24 }]}
            labelEvery={3}
          />
          <Legend items={[{ tone: 'fluid', label: 'Líquidos (mL/dia)' }, { tone: 'band', label: 'Período de sono habitual' }]} />
        </ChartCard>

        <ChartCard
          title="Volume das micções"
          subtitle="Cada barra é uma micção, por ordem cronológica. D1, D2… marcam o início de cada dia."
          table={
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Período</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {charts.voids.map((v) => {
                  const night = v.period === 'night' && v.placement === 'in';
                  return (
                    <tr key={v.event.id} className={night ? 'night-row' : undefined}>
                      <td>
                        {formatDayMonth(v.event.timestamp)} {toHHMM(v.event.timestamp)}
                      </td>
                      <td>{night ? 'Noite' : 'Dia'}</td>
                      <td>{formatMl(v.event.volumeMl)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          }
        >
          <ColumnChart ariaLabel="Gráfico do volume de cada micção" columns={charts.voidColumns} />
          <Legend items={[{ tone: 'day', label: 'Diurna' }, { tone: 'night', label: 'Nocturna' }]} />
        </ChartCard>

        <ChartCard
          title="Volume urinário nocturno vs diurno"
          subtitle={
            settings.nocturnalVolumeMethod === 'ics'
              ? 'Por dia completo. O nocturno inclui a primeira micção da manhã seguinte (ICS).'
              : 'Por dia completo. O nocturno inclui só as micções durante o sono.'
          }
          table={
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Nocturno</th>
                  <th>Diurno</th>
                  <th>24 h</th>
                </tr>
              </thead>
              <tbody>
                {charts.stacked.map((d) => (
                  <tr key={d.key}>
                    <td>{d.label}</td>
                    <td>{formatMl(d.night)}</td>
                    <td>{formatMl(d.day)}</td>
                    <td>{formatMl(d.night + d.day)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <StackedDayChart ariaLabel="Gráfico de volume urinário nocturno e diurno por dia" days={charts.stacked} />
          <Legend items={[{ tone: 'night', label: 'Nocturno' }, { tone: 'day', label: 'Diurno' }]} />
        </ChartCard>
      </Section>

      <Section title="Por dia">
        <div className="card table-scroll" style={{ margin: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Líquidos</th>
                <th>Urina 24 h</th>
                <th>Diurnas</th>
                <th>Nocturnas</th>
                <th>Vol. nocturno</th>
                <th>NPi</th>
              </tr>
            </thead>
            <tbody>
              {s.days.map((d) => (
                <tr key={d.index}>
                  <td>
                    <a href={`#/diarios/${view.period.id}/dia/${d.index + 1}`}>Dia {d.index + 1}</a>
                    <span className="sublabel">{d.status === 'complete' ? formatDayMonth(d.date) : 'em curso'}</span>
                  </td>
                  <td>{formatMl(d.fluidIntakeMl)}</td>
                  <td>{formatMl(d.total24h.volumeMl)}</td>
                  <td>{d.daytimeVoids}</td>
                  <td>
                    {d.nocturnalVoids}
                    <span className="sublabel">{d.nocturnalAwakenings} acordou</span>
                  </td>
                  <td>{formatMl(d.nocturnal.volumeMl)}</td>
                  <td>{formatPercent(d.npi, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="stack no-print">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => navigate({ name: 'report', id: view.period.id })}>
          <Icon name="doc" /> Gerar relatório para o urologista
        </button>
        <a className="btn btn-plain btn-block" href="#/definicoes/calculos">
          Como são calculados estes valores?
        </a>
      </div>
    </>
  );
}

function HourlyTable({ values }: { values: number[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Hora</th>
          <th>Média por dia</th>
        </tr>
      </thead>
      <tbody>
        {values.map((v, h) => (
          <tr key={h}>
            <td>
              {String(h).padStart(2, '0')}:00–{String(h).padStart(2, '0')}:59
            </td>
            <td>{formatMl(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
