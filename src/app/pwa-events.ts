/**
 * Ligação entre o registo do service worker (main.tsx) e a interface.
 * Sem dependências do módulo virtual, para poder ser usado nos testes.
 */
type Listener = () => void;

let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
let needRefresh = false;
let offlineReady = false;
const listeners = new Set<Listener>();
let snapshot = { needRefresh, offlineReady };

const emit = () => {
  snapshot = { needRefresh, offlineReady };
  listeners.forEach((l) => l());
};

export const pwaEvents = {
  setUpdater(fn: (reload?: boolean) => Promise<void>) {
    updateFn = fn;
  },
  markNeedRefresh() {
    needRefresh = true;
    emit();
  },
  markOfflineReady() {
    offlineReady = true;
    emit();
  },
  state() {
    return snapshot;
  },
  dismiss() {
    needRefresh = false;
    offlineReady = false;
    emit();
  },
  async applyUpdate() {
    if (updateFn) await updateFn(true);
    else location.reload();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
