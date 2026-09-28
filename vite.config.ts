/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };

const unusedDependency = fileURLToPath(new URL('./src/app/report/unused-optional-dependency.ts', import.meta.url));

// Testes com fuso horário de Portugal (inclui mudanças de hora de Verão/Inverno).
process.env.TZ = 'Europe/Lisbon';

/**
 * Política de segurança de conteúdo (só na build de produção; o servidor de
 * desenvolvimento precisa de scripts inline para o HMR).
 * connect-src 'self' impede, ao nível do navegador, o envio de dados para
 * qualquer servidor externo.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'diario-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  // Caminhos relativos: funciona na raiz de um domínio ou numa subpasta
  // (p. ex. https://utilizador.github.io/diario-miccional/) sem configuração.
  base: './',
  resolve: {
    alias: { html2canvas: unusedDependency, dompurify: unusedDependency, canvg: unusedDependency },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: ['es2021', 'safari15'],
    sourcemap: false,
  },
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifestFilename: 'manifest.json',
      manifest: {
        id: './',
        name: 'Diário Miccional',
        short_name: 'Diário',
        description:
          'Diário miccional privado: regista líquidos, micções, urgência e perdas. Os dados ficam apenas no teu dispositivo.',
        lang: 'pt-PT',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        categories: ['health', 'medical', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,txt,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Sem runtimeCaching: a aplicação não faz pedidos a servidores externos.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
