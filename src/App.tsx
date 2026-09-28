import { Component, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { StoreProvider, useStore, type StoreProviderProps } from './app/store';
import { useRoute, type Route } from './app/router';
import { pwaEvents } from './app/pwa-events';
import { ConfirmProvider } from './ui/Sheet';
import { EventSheetsProvider } from './ui/sheets/EventSheets';
import { Toast } from './ui/Toast';
import { Icon, type IconName } from './ui/icons';
import { Onboarding } from './ui/screens/Onboarding';
import { HomeScreen } from './ui/screens/HomeScreen';
import { DiariesScreen } from './ui/screens/DiariesScreen';
import { DiaryDetailScreen } from './ui/screens/DiaryDetailScreen';
import { DayDetailScreen } from './ui/screens/DayDetailScreen';
import { SummaryScreen } from './ui/screens/SummaryScreen';
import { ReportScreen } from './ui/screens/ReportScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';

export function App({ dbNames }: { dbNames?: StoreProviderProps['dbNames'] }) {
  return (
    <ErrorBoundary>
      <StoreProvider dbNames={dbNames}>
        <ConfirmProvider>
          <EventSheetsProvider>
            <Shell />
          </EventSheetsProvider>
        </ConfirmProvider>
      </StoreProvider>
    </ErrorBoundary>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'diaries':
      return <DiariesScreen />;
    case 'diary':
      return <DiaryDetailScreen id={route.id} />;
    case 'day':
      return <DayDetailScreen id={route.id} dayNumber={route.dayNumber} />;
    case 'summary':
      return <SummaryScreen periodId={route.id} />;
    case 'report':
      return <ReportScreen id={route.id} />;
    case 'settings':
      return <SettingsScreen section={route.section} />;
  }
}

const TABS: { label: string; icon: IconName; href: string; match: (r: Route) => boolean }[] = [
  { label: 'Hoje', icon: 'home', href: '#/', match: (r) => r.name === 'home' },
  { label: 'Diários', icon: 'book', href: '#/diarios', match: (r) => r.name === 'diaries' || r.name === 'diary' || r.name === 'day' },
  { label: 'Resumo', icon: 'chart', href: '#/resumo', match: (r) => r.name === 'summary' || r.name === 'report' },
  { label: 'Definições', icon: 'gear', href: '#/definicoes', match: (r) => r.name === 'settings' },
];

function TabBar({ route }: { route: Route }) {
  return (
    <nav className="tabbar" aria-label="Navegação principal">
      <div className="tabbar-inner">
        {TABS.map((t) => (
          <a key={t.href} className="tab" href={t.href} aria-current={t.match(route) ? 'page' : undefined}>
            <Icon name={t.icon} size={24} />
            {t.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function UpdatePrompt() {
  const state = useSyncExternalStore(pwaEvents.subscribe, pwaEvents.state, pwaEvents.state);
  useEffect(() => {
    if (!state.offlineReady) return;
    const t = window.setTimeout(() => pwaEvents.dismiss(), 5000);
    return () => window.clearTimeout(t);
  }, [state.offlineReady]);
  if (!state.needRefresh && !state.offlineReady) return null;
  return (
    <div className="toast" role="status" style={{ bottom: 'calc(var(--tabbar-h) + var(--safe-bottom) + 4.5rem)' }}>
      {state.needRefresh ? (
        <>
          <span>Nova versão disponível.</span>
          <button type="button" className="toast-action" onClick={() => void pwaEvents.applyUpdate()}>
            Atualizar
          </button>
          <button type="button" className="toast-action" onClick={() => pwaEvents.dismiss()} aria-label="Mais tarde">
            ✕
          </button>
        </>
      ) : (
        <span>Pronta para funcionar sem internet.</span>
      )}
    </div>
  );
}

function Shell() {
  const { state, actions } = useStore();
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // Leva o foco para o conteúdo quando muda o ecrã (leitores de ecrã).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  useEffect(() => {
    document.title = state.mode === 'demo' ? 'DEMO · Diário Miccional' : 'Diário Miccional';
  }, [state.mode]);

  if (state.status === 'loading') {
    return (
      <div className="onboarding" aria-busy="true">
        <p className="muted center" role="status">
          A carregar…
        </p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="onboarding">
        <h1>Diário Miccional</h1>
        <div className="banner danger" role="alert">
          <div className="banner-body">{state.errorMessage}</div>
        </div>
      </main>
    );
  }
  if (!state.settings.onboardingDone && state.mode === 'real') {
    return (
      <>
        <Onboarding />
        <Toast />
      </>
    );
  }

  const demo = state.mode === 'demo';
  return (
    <div className={`app${demo ? ' is-demo' : ''}`}>
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        Saltar para o conteúdo
      </button>
      {demo && (
        <div className="demo-bar" role="note">
          <span>DEMO · dados de demonstração</span>
          <button type="button" onClick={() => void actions.exitDemo().then(() => (location.hash = '#/'))}>
            Sair
          </button>
        </div>
      )}
      <main ref={mainRef} id="conteudo" className="main" tabIndex={-1} style={{ outline: 'none' }}>
        <Screen route={route} />
      </main>
      <TabBar route={route} />
      <Toast />
      <UpdatePrompt />
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="onboarding">
        <h1>Ocorreu um erro</h1>
        <p className="lead">Os teus dados continuam guardados no dispositivo.</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => location.reload()}>
          Recarregar
        </button>
      </main>
    );
  }
}
