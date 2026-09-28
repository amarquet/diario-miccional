import { useEffect, useRef, useState } from 'react';
import type { SettingsSection } from '../../app/router';
import { navigate } from '../../app/router';
import { latestPeriod, useStore } from '../../app/store';
import { DISCLAIMER, REMINDER_DRINK, REMINDER_VOID } from '../../domain/labels';
import { LIMITS } from '../../domain/validation';
import { formatDateTime, isValidHHMM } from '../../domain/time';
import { createBackup, parseBackup, serializeBackup, type BackupSummary, type BackupFile } from '../../data/backup';
import { buildAllDataCsv } from '../../app/csv';
import { buildReminderCalendar, notificationsSupported, planCalendarReminders, requestNotificationPermission } from '../../app/reminders';
import { datedFilename, isIOS, isStandalone, readTextFile, saveFile } from '../../app/platform';
import { buildPeriodView } from '../../app/store';
import { Banner, Field, ListRow, Section, Segmented, Switch, TopBar } from '../components';
import { Sheet, useConfirm } from '../Sheet';

export function SettingsScreen({ section }: { section: SettingsSection }) {
  switch (section) {
    case 'privacy':
      return <PrivacySettings />;
    case 'reminders':
      return <ReminderSettingsScreen />;
    case 'data':
      return <DataSettings />;
    case 'about':
      return <AboutScreen />;
    case 'install':
      return <InstallScreen />;
    case 'calculations':
      return <CalculationsScreen />;
    default:
      return <MainSettings />;
  }
}

const back = { name: 'settings', section: 'main' } as const;

function MainSettings() {
  const { state, actions } = useStore();
  const confirm = useConfirm();
  const s = state.settings;
  const [bed, setBed] = useState(s.usualBedtime);
  const [wake, setWake] = useState(s.usualWakeTime);

  const enterDemo = async () => {
    const ok = await confirm({
      title: 'Explorar dados de demonstração?',
      message: (
        <p>
          Os dados de demonstração ficam guardados à parte e estão sempre marcados como <strong>DEMO</strong>. Os teus registos reais
          não são alterados nem misturados.
        </p>
      ),
      confirmLabel: 'Ver demonstração',
    });
    if (ok) {
      await actions.enterDemo();
      navigate({ name: 'home' });
    }
  };

  return (
    <>
      <h1 className="page-title">Definições</h1>

      <Section title="Registo">
        <div className="card stack">
          <div className="field">
            <span className="field-label">Escala de urgência</span>
            <Segmented
              label="Escala de urgência"
              value={s.urgencyScale}
              onChange={(urgencyScale) => void actions.updateSettings({ urgencyScale })}
              options={[
                { value: 'descriptive', label: 'Descritiva' },
                { value: 'numeric', label: 'Numérica 0–4' },
              ]}
            />
            <span className="field-hint">
              {s.urgencyScale === 'descriptive'
                ? 'Ex.: «Consegui adiar facilmente», «Tive de ir rapidamente».'
                : '0 = sem urgência … 4 = muito forte / difícil de adiar.'}{' '}
              Ambas guardam o mesmo nível 0–4.
            </span>
          </div>
          <div className="field">
            <span className="field-label">Contar como episódio de urgência</span>
            <Segmented
              label="Limiar de urgência"
              value={String(s.urgencyThreshold) as '2' | '3'}
              onChange={(v) => void actions.updateSettings({ urgencyThreshold: v === '2' ? 2 : 3 })}
              options={[
                { value: '3', label: 'Nível 3 ou mais' },
                { value: '2', label: 'Nível 2 ou mais' },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Horário habitual" footer="Usado quando não registas a hora de deitar ou de levantar. Nesses casos a hora aparece como «habitual».">
        <div className="card stack">
          <Field label="Hora habitual de dormir" htmlFor="usual-bed">
            <input
              id="usual-bed"
              className="input num"
              type="time"
              value={bed}
              onChange={(e) => setBed(e.target.value)}
              onBlur={() => isValidHHMM(bed) && void actions.updateSettings({ usualBedtime: bed })}
            />
          </Field>
          <Field label="Hora habitual de acordar" htmlFor="usual-wake">
            <input
              id="usual-wake"
              className="input num"
              type="time"
              value={wake}
              onChange={(e) => setWake(e.target.value)}
              onBlur={() => isValidHHMM(wake) && void actions.updateSettings({ usualWakeTime: wake })}
            />
          </Field>
        </div>
      </Section>

      <Section title="Diário">
        <div className="card stack">
          <div className="field">
            <span className="field-label" id="default-days">
              Duração predefinida
            </span>
            <div className="row-flex" role="group" aria-labelledby="default-days">
              <button type="button" className="btn" aria-label="Menos um dia" onClick={() => void actions.updateSettings({ defaultDiaryDays: Math.max(1, s.defaultDiaryDays - 1) })}>
                −
              </button>
              <output className="num" aria-live="polite" style={{ minWidth: '5rem', textAlign: 'center', fontWeight: 700 }}>
                {s.defaultDiaryDays} {s.defaultDiaryDays === 1 ? 'dia' : 'dias'}
              </output>
              <button
                type="button"
                className="btn"
                aria-label="Mais um dia"
                onClick={() => void actions.updateSettings({ defaultDiaryDays: Math.min(LIMITS.maxDiaryDays, s.defaultDiaryDays + 1) })}
              >
                +
              </button>
            </div>
          </div>
          <div className="field">
            <span className="field-label">Primeiro dia da semana</span>
            <Segmented
              label="Primeiro dia da semana"
              value={String(s.firstDayOfWeek) as '0' | '1'}
              onChange={(v) => void actions.updateSettings({ firstDayOfWeek: v === '0' ? 0 : 1 })}
              options={[
                { value: '1', label: 'Segunda-feira' },
                { value: '0', label: 'Domingo' },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Cálculos">
        <div className="card stack">
          <div className="field">
            <span className="field-label">Volume urinário nocturno</span>
            <Segmented
              label="Método do volume nocturno"
              value={s.nocturnalVolumeMethod}
              onChange={(nocturnalVolumeMethod) => void actions.updateSettings({ nocturnalVolumeMethod })}
              options={[
                { value: 'ics', label: 'ICS (recomendado)' },
                { value: 'sleep_only', label: 'Só durante o sono' },
              ]}
            />
            <span className="field-hint">
              ICS: inclui a primeira micção depois de te levantares, como definido pela International Continence Society.
            </span>
          </div>
          <a className="btn btn-plain" href="#/definicoes/calculos" style={{ justifySelf: 'start' }}>
            Como são calculados os valores?
          </a>
        </div>
      </Section>

      <Section title="Geral">
        <ul className="list">
          <li>
            <ListRow label="Idioma" detail="Português (Portugal)" />
          </li>
          <li>
            <ListRow label="Unidade de volume" detail="mL" />
          </li>
          <li>
            <ListRow icon="bell" label="Lembretes" detail={s.reminders.enabled ? 'Ativos' : 'Desligados'} href="#/definicoes/lembretes" />
          </li>
          <li>
            <ListRow icon="lock" label="Privacidade" href="#/definicoes/privacidade" />
          </li>
          <li>
            <ListRow icon="download" label="Os meus dados" sublabel="Exportar, importar, apagar" href="#/definicoes/dados" />
          </li>
          <li>
            <ListRow icon="share" label="Instalar no iPhone" href="#/definicoes/instalar" />
          </li>
          <li>
            <ListRow icon="info" label="Acerca" href="#/definicoes/acerca" />
          </li>
        </ul>
      </Section>

      <Section title="Dados de demonstração" footer="Os dados de demonstração nunca se misturam com os teus dados reais.">
        <ul className="list">
          {state.mode === 'real' ? (
            <li>
              <ListRow label="Explorar dados de demonstração" onClick={() => void enterDemo()} />
            </li>
          ) : (
            <>
              <li>
                <ListRow label="Sair do modo de demonstração" onClick={() => void actions.exitDemo().then(() => navigate({ name: 'home' }))} />
              </li>
              <li>
                <ListRow label="Repor dados de demonstração" onClick={() => void actions.resetDemo()} />
              </li>
            </>
          )}
        </ul>
      </Section>
      <p className="section-footer center">{DISCLAIMER}</p>
    </>
  );
}

function PrivacySettings() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);
  return (
    <>
      <TopBar back={back} backLabel="Definições" />
      <h1 className="page-title">Privacidade</h1>
      <div className="card prose">
        <p>
          <strong>Os teus dados de saúde ficam apenas neste dispositivo.</strong>
        </p>
        <ul>
          <li>Todos os registos são guardados localmente, no armazenamento do navegador (IndexedDB).</li>
          <li>Nenhum dado médico é enviado para servidores. A aplicação funciona sem internet depois de aberta pela primeira vez.</li>
          <li>Não há contas, nem início de sessão, nem dados pessoais obrigatórios.</li>
          <li>Não há estatísticas de utilização, publicidade, pixels de rastreio nem serviços de terceiros.</li>
          <li>Não são usados cookies para dados de saúde. Os endereços da aplicação nunca contêm dados de saúde.</li>
          <li>As exportações (JSON, CSV, PDF) são criadas no dispositivo. Só são partilhadas se tu o decidires.</li>
          <li>Os lembretes são locais; não usamos servidores de notificações.</li>
        </ul>
        <p>
          <strong>Atenção:</strong> se apagares os dados do navegador ou desinstalares a aplicação, os registos perdem-se. Faz cópias
          de segurança regularmente em «Os meus dados».
        </p>
        {isIOS() && (
          <p>
            No iPhone, a aplicação instalada no ecrã principal tem um armazenamento separado do Safari. Usa sempre a mesma (de
            preferência a instalada).
          </p>
        )}
        <p className="muted small">
          Armazenamento persistente:{' '}
          {persisted === null ? 'informação indisponível neste navegador' : persisted ? 'ativo' : 'não garantido pelo navegador'}.
        </p>
      </div>
      <div className="stack" style={{ marginTop: '1rem' }}>
        <a className="btn btn-block" href="#/definicoes/dados">
          Exportar ou apagar os meus dados
        </a>
      </div>
    </>
  );
}

function ReminderSettingsScreen() {
  const { state, actions } = useStore();
  const r = state.settings.reminders;
  const [permission, setPermission] = useState<string>(notificationsSupported() ? Notification.permission : 'unsupported');
  const period = latestPeriod(state.data.periods);
  const update = (patch: Partial<typeof r>) => void actions.updateSettings({ reminders: { ...r, ...patch } });

  const exportCalendar = async () => {
    if (!period) return;
    const view = buildPeriodView(state.data, state.settings, period.id, Date.now());
    if (!view) return;
    const ics = buildReminderCalendar(period, planCalendarReminders(view.summary.windows, r.drinkIntervalHours));
    await saveFile(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), datedFilename('lembretes-diario-miccional', 'ics'));
  };

  return (
    <>
      <TopBar back={back} backLabel="Definições" />
      <h1 className="page-title">Lembretes</h1>
      <p className="page-subtitle">Opcionais. Nunca são obrigatórios.</p>

      <Section title="Na aplicação">
        <div className="card">
          <Switch
            label="Mostrar lembretes"
            hint={`«${REMINDER_DRINK}» e «${REMINDER_VOID}» quando passa muito tempo sem registos durante o dia.`}
            checked={r.enabled}
            onChange={(enabled) => update({ enabled })}
          />
          {r.enabled && (
            <div className="stack" style={{ marginTop: '0.75rem' }}>
              <IntervalField label="Bebidas: lembrar após" value={r.drinkIntervalHours} onChange={(v) => update({ drinkIntervalHours: v })} />
              <IntervalField label="Micções: lembrar após" value={r.voidIntervalHours} onChange={(v) => update({ voidIntervalHours: v })} />
            </div>
          )}
        </div>
      </Section>

      {r.enabled && (
        <Section
          title="Notificações do sistema"
          footer={
            isIOS()
              ? 'No iPhone, as notificações só funcionam com a aplicação instalada no ecrã principal e aberta recentemente. O iOS não permite agendar notificações locais sem um servidor — por privacidade, não usamos nenhum. Para alertas fiáveis, usa o calendário (abaixo).'
              : 'As notificações só aparecem enquanto a aplicação estiver aberta (mesmo noutro separador).'
          }
        >
          <div className="card">
            {permission === 'unsupported' ? (
              <p className="muted" style={{ margin: 0 }}>
                Este navegador não suporta notificações{isIOS() && !isStandalone() ? ' fora da aplicação instalada' : ''}.
              </p>
            ) : (
              <Switch
                label="Usar notificações"
                hint={permission === 'denied' ? 'Bloqueadas nas definições do navegador.' : undefined}
                checked={r.systemNotifications && permission === 'granted'}
                onChange={async (on) => {
                  if (on) {
                    const result = await requestNotificationPermission();
                    setPermission(result);
                    update({ systemNotifications: result === 'granted' });
                  } else {
                    update({ systemNotifications: false });
                  }
                }}
              />
            )}
          </div>
        </Section>
      )}

      <Section
        title="Calendário (recomendado no iPhone)"
        footer="Cria alertas no calendário do dispositivo para os dias do diário atual. O ficheiro só contém texto genérico — nenhum dado de saúde."
      >
        <button type="button" className="btn btn-block" disabled={!period} onClick={() => void exportCalendar()}>
          Adicionar lembretes ao calendário (.ics)
        </button>
      </Section>
    </>
  );
}

function IntervalField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <Segmented
        label={label}
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
        options={['2', '3', '4', '6'].map((h) => ({ value: h, label: `${h} h` }))}
      />
    </div>
  );
}

function DataSettings() {
  const { state, actions } = useStore();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const demo = state.mode === 'demo';
  const prefix = demo ? 'DEMO-diario-miccional' : 'diario-miccional';
  const counts = `${state.data.periods.length} diários · ${state.data.fluids.length + state.data.urine.length} eventos`;

  const exportJson = async () => {
    const backup = createBackup(state.data, { settings: state.settings, demo, appVersion: __APP_VERSION__ });
    await saveFile(new Blob([serializeBackup(backup)], { type: 'application/json' }), datedFilename(prefix, 'json'));
  };
  const exportCsv = async () => {
    await saveFile(new Blob([buildAllDataCsv(state.data, state.settings)], { type: 'text/csv;charset=utf-8' }), datedFilename(prefix, 'csv'));
  };

  const onFile = async (file: File | undefined) => {
    setErrors([]);
    if (!file) return;
    const text = await readTextFile(file);
    const result = parseBackup(text);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setPending({ backup: result.backup, summary: result.summary });
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    if (pending.summary.demo && !demo) {
      const ok = await confirm({
        title: 'Importar dados DEMO?',
        message: <p>Este ficheiro contém dados de demonstração. Queres mesmo juntá-los aos teus dados reais?</p>,
        confirmLabel: 'Importar mesmo assim',
      });
      if (!ok) return;
    }
    if (mode === 'replace') {
      const ok = await confirm({
        title: 'Substituir todos os dados?',
        message: (
          <p>
            Os teus dados atuais ({counts}) serão substituídos pelo conteúdo do ficheiro. Recomendamos exportar primeiro uma cópia de
            segurança.
          </p>
        ),
        confirmLabel: 'Substituir',
        destructive: true,
      });
      if (!ok) return;
    }
    const report = await actions.importData(pending.backup.data, mode);
    setPending(null);
    actions.showToast(
      `Importados: ${report.periodsAdded} diários, ${report.fluidsAdded + report.urineAdded} eventos${report.skippedExisting ? ` (${report.skippedExisting} já existiam)` : ''}`,
    );
  };

  const deleteAll = async () => {
    const first = await confirm({
      title: 'Apagar todos os dados?',
      message: <p>Serão apagados permanentemente todos os diários e registos ({counts}) deste dispositivo.</p>,
      confirmLabel: 'Continuar',
      destructive: true,
    });
    if (!first) return;
    const second = await confirm({
      title: 'Tens a certeza?',
      message: <p>Esta ação não pode ser desfeita. Se não tiveres uma cópia de segurança, os dados perdem-se.</p>,
      confirmLabel: 'Apagar tudo',
      destructive: true,
    });
    if (!second) return;
    await actions.clearAllData();
    actions.showToast('Todos os dados foram apagados');
  };

  return (
    <>
      <TopBar back={back} backLabel="Definições" />
      <h1 className="page-title">Os meus dados</h1>
      <p className="page-subtitle">
        {counts} {demo && <span className="badge demo">DEMO</span>}
      </p>

      <Section title="Exportar dados" footer="O JSON contém tudo o que é necessário para restaurar. O CSV abre no Excel ou no Google Sheets.">
        <ul className="list">
          <li>
            <ListRow icon="download" label="Cópia de segurança (JSON)" onClick={() => void exportJson()} />
          </li>
          <li>
            <ListRow icon="download" label="Todos os registos (CSV)" onClick={() => void exportCsv()} />
          </li>
        </ul>
      </Section>

      <Section title="Importar dados" footer="O ficheiro é validado antes de qualquer alteração. Nada é apagado sem confirmação.">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          aria-label="Escolher ficheiro de cópia de segurança"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn btn-block" onClick={() => fileInput.current?.click()}>
          Escolher ficheiro JSON…
        </button>
        {errors.length > 0 && (
          <Banner tone="danger" icon="alert" title="Não foi possível importar" role="alert">
            <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
              {errors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Banner>
        )}
      </Section>

      <Section title="Apagar" footer="Para apagar um só diário, abre-o em «Diários».">
        <ul className="list">
          <li>
            <ListRow icon="trash" label="Apagar todos os dados" danger onClick={() => void deleteAll()} />
          </li>
        </ul>
      </Section>

      {pending && (
        <Sheet
          open
          onClose={() => setPending(null)}
          title="Importar cópia de segurança"
          footer={
            <>
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void doImport('merge')}>
                Juntar aos dados atuais
              </button>
              <button type="button" className="btn btn-danger btn-lg btn-block" onClick={() => void doImport('replace')}>
                Substituir todos os dados
              </button>
            </>
          }
        >
          <div className="prose">
            <p>O ficheiro é válido e contém:</p>
            <dl className="kv">
              <dt>Diários</dt>
              <dd>{pending.summary.periods}</dd>
              <dt>Dias</dt>
              <dd>{pending.summary.days}</dd>
              <dt>Bebidas</dt>
              <dd>{pending.summary.fluids}</dd>
              <dt>Micções e perdas</dt>
              <dd>{pending.summary.urine}</dd>
              {pending.summary.exportedAt && (
                <>
                  <dt>Exportado em</dt>
                  <dd>{formatDateTime(Date.parse(pending.summary.exportedAt))}</dd>
                </>
              )}
            </dl>
            {pending.summary.demo && (
              <Banner tone="warn" icon="alert">
                Este ficheiro contém <strong>dados de demonstração (DEMO)</strong>.
              </Banner>
            )}
            <p className="small muted">
              «Juntar» acrescenta os diários e registos novos e mantém os que já existem. «Substituir» apaga os dados atuais (pede
              confirmação).
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}

function InstallScreen() {
  const standalone = isStandalone();
  return (
    <>
      <TopBar back={back} backLabel="Definições" />
      <h1 className="page-title">Instalar no iPhone</h1>
      {standalone ? (
        <Banner icon="check" title="A aplicação já está instalada">
          Estás a usar a versão do ecrã principal. Funciona sem internet.
        </Banner>
      ) : (
        <div className="card prose">
          <ol>
            <li>
              Abre esta página no <strong>Safari</strong>.
            </li>
            <li>
              Toca em <strong>Partilhar</strong> (quadrado com seta para cima).
            </li>
            <li>
              Escolhe <strong>Adicionar ao ecrã principal</strong> e confirma com <strong>Adicionar</strong>.
            </li>
            <li>Abre o «Diário» a partir do ecrã principal.</li>
          </ol>
          <p>
            <strong>Importante:</strong> no iPhone, a aplicação instalada guarda os dados separadamente do Safari. Instala-a
            <em> antes</em> de começares a registar, ou exporta os dados no Safari e importa-os na aplicação instalada.
          </p>
          <p className="muted small">Em computadores com Chrome ou Edge, usa o ícone de instalação na barra de endereço.</p>
        </div>
      )}
    </>
  );
}

function CalculationsScreen() {
  return (
    <>
      <TopBar back={back} backLabel="Definições" />
      <h1 className="page-title">Como são calculados os valores</h1>
      <div className="card prose">
        <p>
          <strong>Período de 24 horas.</strong> Começa quando te levantas e termina quando te levantas no dia seguinte — não à
          meia-noite.
        </p>
        <p>
          <strong>Período nocturno.</strong> Da hora a que te deitas até à hora a que te levantas, com as horas que registaste. Uma
          micção às 01:20 ou às 06:00 com sono das 23:30 às 07:00 é nocturna; às 07:30 é diurna.
        </p>
        <p>
          <strong>Micções nocturnas.</strong> Micções durante o período nocturno. Distingue-se «acordei por causa da vontade de
          urinar» de «já estava acordado». O número de micções nocturnas não é, por si só, o mesmo que noctúria clinicamente
          relevante.
        </p>
        <p>
          <strong>Primeira micção da manhã.</strong> A primeira micção depois de te levantares. Conta como micção diurna, mas o seu
          volume foi produzido durante a noite.
        </p>
        <p>
          <strong>Volume urinário nocturno</strong> (método ICS, predefinido): soma das micções nocturnas + primeira micção da manhã
          seguinte. No método «só durante o sono», apenas as micções nocturnas.
        </p>
        <p>
          <strong>Produção urinária nocturna</strong> (mL/h): volume urinário nocturno ÷ horas entre deitar e levantar.
        </p>
        <p>
          <strong>Volume de 24 h</strong> (ICS): todas as micções do dia exceto a primeira da manhã (que pertence à noite anterior),
          mais a primeira micção da manhã seguinte.
        </p>
        <p>
          <strong>Índice de produção urinária nocturna (NPi)</strong> = volume nocturno ÷ volume de 24 h × 100. É um valor
          descritivo; a sua interpretação cabe ao médico.
        </p>
        <p>
          <strong>Médias.</strong> Usam apenas dias completos. Micções sem volume medido contam para a frequência, mas não para os
          volumes (que podem ficar subestimados).
        </p>
        <p>
          <strong>Mudança da hora.</strong> Os cálculos usam instantes reais: uma noite com mudança de hora dura 6,5 h ou 8,5 h, e
          não 7,5 h.
        </p>
        <p className="muted">{DISCLAIMER}</p>
      </div>
    </>
  );
}

function AboutScreen() {
  return (
    <>
      <TopBar back={back} backLabel="Definições" />
      <h1 className="page-title">Acerca</h1>
      <div className="card prose">
        <p>
          <strong>Diário Miccional</strong> · versão {__APP_VERSION__}
        </p>
        <p>Aplicação para registar a ingestão de líquidos, micções, urgência, perdas e despertares nocturnos, e preparar um relatório para o urologista.</p>
        <p>
          <strong>{DISCLAIMER}</strong> Não é um dispositivo médico.
        </p>
        <p className="muted small">
          Terminologia baseada nas definições da International Continence Society (ICS) para diários miccionais. Construída com React,
          Vite, idb e jsPDF (licenças MIT). Sem estatísticas, sem publicidade, sem rastreio.
        </p>
      </div>
      <p className="section-footer center">Em caso de sintomas intensos ou súbitos, procura assistência médica (SNS 24: 808 24 24 24; emergência: 112).</p>
    </>
  );
}
