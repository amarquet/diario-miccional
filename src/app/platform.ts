/** Detecção de plataforma e utilitários do navegador (sem dados de saúde). */

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ apresenta-se como Mac com ecrã táctil.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Aberta a partir do ecrã principal (modo standalone). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Registo apenas em desenvolvimento; nunca regista dados em produção. */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    // eslint-disable-next-line no-console
    console.debug('[diário]', ...args);
  }
}

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Guarda um ficheiro localmente. No iPhone usa a folha de partilha
 * ("Guardar em Ficheiros", AirDrop, Mail…); nos restantes transfere o ficheiro.
 * Nada é enviado para servidores pela aplicação.
 */
export async function saveFile(blob: Blob, filename: string): Promise<SaveResult> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (isIOS() && typeof File !== 'undefined' && nav.share && nav.canShare) {
    const file = new File([blob], filename, { type: blob.type });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename });
        return 'shared';
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
        // NotAllowedError, etc.: recorre à transferência normal.
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

/** Lê um ficheiro de texto escolhido pelo utilizador. */
export function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Nome de ficheiro seguro com data: "diario-miccional-2026-09-27.json". */
export function datedFilename(prefix: string, extension: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${prefix}-${stamp}.${extension}`;
}
