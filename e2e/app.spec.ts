import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Instante em Lisboa (WEST, +01:00 em Setembro). */
const lisbon = (iso: string) => new Date(`${iso}+01:00`);

async function startDiary(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Diário Miccional', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Começar diário' }).click();
  await page.getByRole('dialog', { name: 'Novo diário' }).getByRole('button', { name: 'Começar diário' }).click();
  await expect(page.getByRole('heading', { name: /Dia 1 de 3/ })).toBeVisible();
}

async function addVoid(page: Page, ml: number) {
  await page.getByRole('button', { name: /\+ URINEI/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Registar micção' });
  await sheet.getByLabel('Volume em mililitros').fill(String(ml));
  return sheet;
}

/** Recolhe todos os pedidos de rede para verificar que nada sai do dispositivo. */
function trackHosts(page: Page) {
  const hosts = new Set<string>();
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol.startsWith('http')) hosts.add(url.host);
  });
  return hosts;
}

test('PWA: manifest, ícones e meta tags do iOS', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest).toMatchObject({ name: 'Diário Miccional', short_name: 'Diário', display: 'standalone', start_url: './' });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png']) {
    const res = await request.get(`/${icon}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
  await page.goto('/');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Diário');
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png/);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /connect-src 'self'/);
});

test('registo de micção e bebida; os dados sobrevivem a um recarregamento', async ({ page }) => {
  const hosts = trackHosts(page);
  await startDiary(page);

  const sheet = await addVoid(page, 300);
  await sheet.getByRole('radio', { name: 'Tive de ir rapidamente' }).check();
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Micção registada')).toBeVisible();

  await page.getByRole('button', { name: /\+ BEBI/ }).click();
  await page.getByRole('dialog', { name: 'Registar bebida' }).getByRole('button', { name: /Água 250/ }).click();

  const timeline = page.getByRole('list', { name: 'Registos do dia' });
  await expect(timeline.getByText('Urgência forte')).toBeVisible();
  await expect(timeline.getByText('Água')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /Dia 1 de 3/ })).toBeVisible();
  await expect(timeline.getByText(/300\s+mL/)).toBeVisible();
  await expect(timeline.getByText(/250\s+mL/)).toBeVisible();

  // Nenhum dado sai do dispositivo: só pedidos à própria origem.
  expect([...hosts]).toEqual(['localhost:4173']);
});

test('noite 23:30 → 07:00: 01:30 é nocturna, 07:30 é diurna', async ({ page }) => {
  await page.clock.install({ time: lisbon('2026-09-27T10:00:00') });
  await startDiary(page);

  // Deitar às 23:30
  await page.clock.setFixedTime(lisbon('2026-09-27T23:30:00'));
  await page.reload();
  await page.getByRole('button', { name: 'Vou deitar-me' }).click();
  await expect(page.getByText('Hora de deitar: 23:30')).toBeVisible();

  // 01:30 — nocturna, com contexto "acordei por causa da vontade de urinar"
  await page.clock.setFixedTime(lisbon('2026-09-28T01:30:00'));
  await page.reload();
  let sheet = await addVoid(page, 150);
  await expect(sheet.locator('.sheet-header .badge')).toHaveText(/Noite/);
  await sheet.getByRole('radio', { name: 'Acordei por causa da vontade de urinar' }).check();
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('list', { name: 'Registos do dia' }).getByText('Nocturna')).toBeVisible();

  // 05:30 — nocturna
  await page.clock.setFixedTime(lisbon('2026-09-28T05:30:00'));
  await page.reload();
  sheet = await addVoid(page, 120);
  await expect(sheet.locator('.sheet-header .badge')).toHaveText(/Noite/);
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Levantar às 07:00; micção às 07:30 — diurna (e primeira da manhã)
  await page.clock.setFixedTime(lisbon('2026-09-28T07:00:00'));
  await page.reload();
  await page.getByRole('button', { name: 'Levantei-me' }).click();
  await expect(page.getByText('Hora de levantar: 07:00')).toBeVisible();
  await page.clock.setFixedTime(lisbon('2026-09-28T07:30:00'));
  await page.reload();
  await expect(page.getByRole('heading', { name: /Dia 2 de 3/ })).toBeVisible();
  sheet = await addVoid(page, 350);
  await expect(sheet.locator('.sheet-header .badge')).toHaveText(/Dia/);
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('list', { name: 'Registos do dia' }).getByText('1.ª micção da manhã')).toBeVisible();

  // Noite anterior: 2 micções nocturnas, 1 por vontade de urinar, volume nocturno ICS = 150 + 120 + 350
  await expect(page.getByText(/Noite anterior: 2 micções nocturnas \(1 por vontade de urinar\) · volume nocturno 620\s+mL/)).toBeVisible();
});

test('exportar e restaurar uma cópia de segurança JSON', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    // Evita a folha de partilha do sistema no teste (força transferência).
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
  await startDiary(page);
  const sheet = await addVoid(page, 275);
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Micção registada')).toBeVisible();

  await page.goto('/#/definicoes/dados');
  const downloadPromise = page.waitForEvent('download');
  await page.getByText('Cópia de segurança (JSON)').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^diario-miccional-\d{4}-\d{2}-\d{2}\.json$/);
  const file = testInfo.outputPath('backup.json');
  await download.saveAs(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.app).toBe('diario-miccional');
  expect(json.data.urine).toHaveLength(1);

  // Apagar tudo (duas confirmações)
  await page.getByText('Apagar todos os dados').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Apagar tudo' }).click();
  await expect(page.getByText('0 diários · 0 eventos')).toBeVisible();

  // Restaurar
  await page.getByLabel('Escolher ficheiro de cópia de segurança').setInputFiles(file);
  const preview = page.getByRole('dialog', { name: 'Importar cópia de segurança' });
  await expect(preview.getByText('O ficheiro é válido e contém:')).toBeVisible();
  await preview.getByRole('button', { name: 'Juntar aos dados atuais' }).click();
  await expect(page.getByText('1 diários · 1 eventos')).toBeVisible();

  await page.goto('/#/');
  await expect(page.getByRole('list', { name: 'Registos do dia' }).getByText(/275\s+mL/)).toBeVisible();
});

test('relatório PDF para o urologista (dados DEMO)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver dados de demonstração' }).click();
  await expect(page.getByText('DEMO · dados de demonstração')).toBeVisible();
  await page.goto('/#/resumo');
  await expect(page.getByRole('heading', { name: 'Resumo do diário' })).toBeVisible();
  await page.getByRole('button', { name: /Gerar relatório para o urologista/ }).click();
  await expect(page.getByText('Dados de diário miccional fornecidos pelo utilizador. Não constitui diagnóstico médico.')).toBeVisible();
  const pdfButton = page.getByRole('button', { name: /Transferir PDF/ });
  await expect(pdfButton).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await pdfButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^DEMO-relatorio-diario-miccional-.*\.pdf$/);
  const path = await download.path();
  expect(readFileSync(path!).subarray(0, 5).toString()).toBe('%PDF-');
});

test('iOS: modo standalone (ecrã principal) é detetado', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'Específico do iPhone');
  await page.goto('/');
  await expect(page.getByText('Dica para iPhone')).toBeVisible();

  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }));
  await page.goto('/');
  await expect(page.getByText('Dica para iPhone')).toHaveCount(0);
  await page.getByRole('button', { name: 'Agora não' }).click();
  await page.goto('/#/definicoes/instalar');
  await expect(page.getByText('A aplicação já está instalada')).toBeVisible();
});

test('funciona offline depois do primeiro carregamento', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service worker offline testado em Chromium');
  await startDiary(page);
  const sheet = await addVoid(page, 180);
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Micção registada')).toBeVisible();

  // Espera que o service worker controle a página.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Dia 1 de 3/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Registos do dia' }).getByText(/180\s+mL/)).toBeVisible();

  // Registar offline também funciona.
  const offlineSheet = await addVoid(page, 220);
  await offlineSheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('list', { name: 'Registos do dia' }).getByText(/220\s+mL/)).toBeVisible();

  // O gerador de PDF (carregado sob pedido) também está em cache.
  await page.goto('/#/resumo');
  await page.getByRole('button', { name: /Gerar relatório para o urologista/ }).click();
  await expect(page.getByRole('button', { name: /Transferir PDF/ })).toBeEnabled();
  await context.setOffline(false);
});
