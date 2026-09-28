import { useEffect } from 'react';
import { useStore } from '../app/store';

/** Mensagem breve com acção opcional ("Evento eliminado · Desfazer"). */
export function Toast() {
  const { toast, actions } = useStore();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => actions.dismissToast(), toast.actionLabel ? 7000 : 3500);
    return () => window.clearTimeout(timeout);
  }, [toast, actions]);

  return (
    <div aria-live="polite" role="status" className="toast-region">
      {toast && (
        <div className={`toast${toast.tone === 'error' ? ' error' : ''}`} key={toast.id}>
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              className="toast-action"
              onClick={async () => {
                const action = toast.onAction!;
                actions.dismissToast();
                await action();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
