import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { pwaEvents } from './app/pwa-events';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: funciona offline depois do primeiro carregamento.
// As actualizações só são aplicadas quando o utilizador aceita.
if ('serviceWorker' in navigator) {
  const update = registerSW({
    immediate: true,
    onNeedRefresh: () => pwaEvents.markNeedRefresh(),
    onOfflineReady: () => pwaEvents.markOfflineReady(),
  });
  pwaEvents.setUpdater(update);
}
