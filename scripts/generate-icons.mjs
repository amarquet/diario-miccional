/**
 * Gera os ícones da aplicação (PNG) a partir de SVG.
 * Uso: npm run icons
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => resolve(root, 'public', p);
mkdirSync(out('icons'), { recursive: true });

/**
 * Desenho: gota (líquidos/urina) com uma pequena lua (noite) e três linhas de
 * registo, sobre fundo azul calmo.
 * @param {{ rounded: boolean, scale: number }} o
 */
function iconSvg({ rounded, scale }) {
  const r = rounded ? 112 : 0;
  const c = 256;
  const s = scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a8ee6"/>
      <stop offset="1" stop-color="#1b5cb4"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#bg)"/>
  <g transform="translate(${c * (1 - s)} ${c * (1 - s)}) scale(${s})">
    <path d="M214 92 C 262 152 318 214 318 282 A 104 104 0 0 1 110 282 C 110 214 166 152 214 92 Z" fill="#ffffff"/>
    <path d="M168 280 a 48 48 0 0 0 46 58" fill="none" stroke="#bcd6f5" stroke-width="16" stroke-linecap="round"/>
    <path d="M396 96 a 56 56 0 1 0 44 88 a 44 44 0 1 1 -44 -88 Z" fill="#ffd66b"/>
    <rect x="330" y="330" width="100" height="18" rx="9" fill="#ffffff" opacity="0.92"/>
    <rect x="330" y="370" width="80" height="18" rx="9" fill="#ffffff" opacity="0.75"/>
    <rect x="330" y="410" width="60" height="18" rx="9" fill="#ffffff" opacity="0.6"/>
  </g>
</svg>`;
}

function png(svg, size, file) {
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render();
  writeFileSync(out(file), img.asPng());
  console.log(`✓ ${file} (${size}×${size})`);
}

const rounded = iconSvg({ rounded: true, scale: 1 });
const square = iconSvg({ rounded: false, scale: 1 });
const maskable = iconSvg({ rounded: false, scale: 0.78 });

png(square, 192, 'icons/icon-192.png');
png(square, 512, 'icons/icon-512.png');
png(maskable, 512, 'icons/icon-maskable-512.png');
png(square, 180, 'icons/apple-touch-icon.png');
writeFileSync(out('favicon.svg'), rounded);
console.log('✓ favicon.svg');
