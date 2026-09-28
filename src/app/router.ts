/**
 * Encaminhamento por hash (#/...). Funciona em qualquer alojamento estático
 * (GitHub Pages, Netlify, …) sem regras de reescrita. Os URLs contêm apenas
 * identificadores aleatórios — nunca dados de saúde.
 */
import { useEffect, useState } from 'react';

export type SettingsSection = 'main' | 'privacy' | 'reminders' | 'data' | 'about' | 'install' | 'calculations';

export type Route =
  | { name: 'home' }
  | { name: 'diaries' }
  | { name: 'diary'; id: string }
  | { name: 'day'; id: string; dayNumber: number }
  | { name: 'summary'; id: string | null }
  | { name: 'report'; id: string }
  | { name: 'settings'; section: SettingsSection };

const SETTINGS_SECTIONS: Record<string, SettingsSection> = {
  privacidade: 'privacy',
  lembretes: 'reminders',
  dados: 'data',
  acerca: 'about',
  instalar: 'install',
  calculos: 'calculations',
};

const safeId = (s: string | undefined) => (s && /^[\w-]{1,100}$/.test(s) ? s : null);

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [a, b, c, d] = parts;
  switch (a) {
    case undefined:
      return { name: 'home' };
    case 'diarios': {
      const id = safeId(b);
      if (!id) return { name: 'diaries' };
      if (c === 'dia' && d && /^\d{1,2}$/.test(d)) return { name: 'day', id, dayNumber: Number(d) };
      return { name: 'diary', id };
    }
    case 'resumo':
      return { name: 'summary', id: safeId(b) };
    case 'relatorio': {
      const id = safeId(b);
      return id ? { name: 'report', id } : { name: 'summary', id: null };
    }
    case 'definicoes':
      return { name: 'settings', section: (b && SETTINGS_SECTIONS[b]) || 'main' };
    default:
      return { name: 'home' };
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'diaries':
      return '#/diarios';
    case 'diary':
      return `#/diarios/${route.id}`;
    case 'day':
      return `#/diarios/${route.id}/dia/${route.dayNumber}`;
    case 'summary':
      return route.id ? `#/resumo/${route.id}` : '#/resumo';
    case 'report':
      return `#/relatorio/${route.id}`;
    case 'settings': {
      const slug = Object.entries(SETTINGS_SECTIONS).find(([, s]) => s === route.section)?.[0];
      return slug ? `#/definicoes/${slug}` : '#/definicoes';
    }
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeToHash(route);
  if (options.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash !== hash) {
    location.hash = hash;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
