# Diário Miccional

PWA privada e offline para registar, durante 3 dias (ou 1–14), a ingestão de líquidos, as micções, a urgência, as perdas urinárias e os despertares nocturnos — e gerar um relatório para o urologista.

> **Esta aplicação organiza dados para discussão com um profissional de saúde. Não fornece diagnóstico médico.** Não é um dispositivo médico.

- Interface em português europeu, 24 h, mL, datas DD/MM/AAAA.
- **Privacidade:** todos os dados ficam no dispositivo (IndexedDB). Sem servidor, sem conta, sem estatísticas, sem rastreio. Uma Content-Security-Policy com `connect-src 'self'` impede pedidos a terceiros.
- Funciona offline depois do primeiro carregamento (service worker Workbox).
- Instalável no iPhone ("Adicionar ao ecrã principal") e em computadores.

---

## Instalação (desenvolvimento)

Requisitos: Node.js 20+ (testado com Node 22 e 26).

```bash
npm install
```

```bash
npm run dev
```

Abre `http://localhost:5173`. Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run build` | Verificação de tipos + build de produção em `dist/` (inclui `sw.js` e `manifest.json`) |
| `npm run preview` | Serve `dist/` em `http://localhost:4173` (service worker ativo) |
| `npm test` | Testes unitários e de interface (Vitest + Testing Library + IndexedDB simulado) |
| `npm run test:e2e` | Testes ponta-a-ponta na build de produção (Playwright: iPhone/WebKit e Chromium) |
| `npm run icons` | Regenera os ícones PNG a partir do SVG (`scripts/generate-icons.mjs`) |

Para os testes ponta-a-ponta é preciso instalar os browsers do Playwright uma vez:

```bash
npx playwright install chromium webkit
```

> Nota: com Node 26 o instalador do Playwright 1.63 pode falhar ("timed out"). Nesse caso usa Node 22, ou transfere os ficheiros indicados por `npx playwright install --dry-run` e extrai-os para `~/Library/Caches/ms-playwright/<pasta>/`, criando um ficheiro vazio `INSTALLATION_COMPLETE` em cada pasta.

---

## Publicar no GitHub Pages

A aplicação usa **caminhos relativos** (`base: './'`) e **encaminhamento por hash** (`#/resumo`), por isso funciona em `https://utilizador.github.io/qualquer-nome/` sem configuração nem `404.html`.

1. Cria um repositório no GitHub e envia o código:
   ```bash
   git init && git add . && git commit -m "Diário Miccional"
   ```
   ```bash
   git branch -M main && git remote add origin https://github.com/UTILIZADOR/diario-miccional.git && git push -u origin main
   ```
2. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` corre em cada push para `main`: verificação de tipos, testes, build e publicação.
4. Abre `https://UTILIZADOR.github.io/diario-miccional/`. O GitHub Pages serve sempre por HTTPS (obrigatório para service workers).

### Outros alojamentos estáticos

A pasta `dist/` funciona tal como está:

- **Cloudflare Pages / Netlify:** comando de build `npm run build`, pasta de saída `dist`. O ficheiro `public/_headers` acrescenta cabeçalhos de segurança e evita a cache do `sw.js`.
- **Vercel:** framework "Vite", saída `dist`.

---

## Instalar no iPhone

1. Abre o endereço publicado no **Safari**.
2. **Partilhar → Adicionar ao ecrã principal → Adicionar**.
3. Abre o «Diário» a partir do ecrã principal.

Importante: no iOS, a aplicação instalada tem **armazenamento separado do Safari**. Instala-a antes de começar a registar (ou exporta no Safari e importa na aplicação instalada). O iOS não apaga automaticamente os dados de aplicações instaladas no ecrã principal, mas faz cópias de segurança (Definições → Os meus dados → JSON).

---

## Funcionalidades

- **Registo rápido:** `+ BEBI` e `+ URINEI` no ecrã principal; hora actual por omissão, botões −5/−15 min, volumes rápidos, «registo rápido» de bebidas recentes num toque. `Vou deitar-me` / `Levantei-me` registam a hora com um toque.
- **Micção:** volume (ou «não medido»), urgência 0–4 (escala numérica ou descritiva, configurável), perda (pequena/moderada/grande), contexto nocturno («acordei por causa da vontade de urinar» / «já estava acordado»), primeira micção da manhã, classificação manual dia/noite, sintomas, notas. Também «só perda» (perda sem micção).
- **Diários:** vários períodos, 1–14 dias (3 por omissão), renomear, notas, alterar duração, eliminar, exportar.
- **Dia:** horas de levantar/deitar/levantar no dia seguinte, contexto (álcool, cafeína, exercício, calor, medicação, sono perturbado), sintomas, notas com sugestões.
- **Edição:** editar, duplicar, eliminar com «Desfazer».
- **Resumo:** métricas médias, NPi, observações descritivas neutras e 4 gráficos (urina por hora, líquidos por hora, volume de cada micção, nocturno vs diurno), cada um com tabela equivalente.
- **Relatório para o urologista:** PDF (A4, gerado no dispositivo), CSV e impressão.
- **Cópias de segurança:** JSON completo (restauro validado, «juntar» ou «substituir» com confirmação) e CSV (Excel/Google Sheets: `;`, vírgula decimal, UTF-8 com BOM, proteção contra injeção de fórmulas).
- **Sintomas de alerta:** aviso neutro («Este sintoma pode justificar avaliação médica…»).
- **Lembretes opcionais:** no ecrã, notificações do sistema (quando suportadas) e **lembretes no calendário (.ics)** — a única forma fiável e offline de ter alertas agendados no iPhone sem servidor de notificações.
- **Dados de demonstração:** base de dados separada, sempre marcada **DEMO**; nunca se misturam com os dados reais.
- **Acessibilidade:** alvos ≥ 44 px, controlos nativos com rótulos, foco visível, navegação por teclado, gráficos navegáveis com as setas, informação nunca só por cor, Dynamic Type do iOS, modo escuro, `prefers-reduced-motion`.

---

## Definições clínicas (ICS)

Implementadas em `src/domain/clinical.ts` como funções puras, com testes.

- **Período de 24 h:** de levantar a levantar (não à meia-noite).
- **Período nocturno:** da hora de deitar registada à hora de levantar seguinte. 23:30 → 07:00: 01:30 e 05:30 são nocturnas; 07:30 é diurna.
- **Primeira micção da manhã (PMM):** conta como micção **diurna**; na definição ICS, o seu volume pertence ao **volume urinário nocturno** da noite anterior. Detetada automaticamente (primeira micção até 4 h depois de levantar) ou marcada manualmente. Se for marcada antes da hora de levantar registada, a noite termina nessa micção.
- **Volume nocturno (ICS, por omissão):** micções nocturnas + PMM seguinte. Alternativa configurável: só micções durante o sono.
- **Volume de 24 h (ICS):** micções do dia excepto a PMM que o abre, mais a PMM seguinte.
- **NPi** = volume nocturno ÷ volume de 24 h × 100 — apresentado sem limiares nem interpretação.
- **Micções nocturnas** distinguem «acordou pela vontade de urinar» de «já estava acordado» (número de micções nocturnas ≠ noctúria clinicamente relevante).
- **Produção urinária nocturna** (mL/h) = volume nocturno ÷ horas entre deitar e levantar.
- **Médias:** apenas dias completos. Micções sem volume contam para a frequência, não para os volumes (é mostrado aviso).
- **Mudança da hora:** tudo é calculado com instantes absolutos (uma noite com mudança de hora dura 6,5 h ou 8,5 h).

---

## Arquitetura

```
UI (React)                  src/ui/…          ecrãs, folhas de registo, gráficos SVG
   ↓
Aplicação                   src/app/…         estado, ações, desfazer, exportações, PDF, lembretes, rotas
   ↓
Motor clínico (puro)        src/domain/…      janelas dia/noite, classificação, métricas, validação, observações
   ↓
Persistência                src/data/…        IndexedDB versionada (idb), repositório, cópias de segurança, demo
```

- **IndexedDB versionada** (`src/data/db.ts`): cada nova versão acrescenta uma entrada em `MIGRATIONS`; as cópias JSON têm `schemaVersion` e `migrateBackup()`.
- Os eventos guardam `diaryPeriodId` + `timestamp`; o dia é **derivado** das horas de sono, para que corrigir a hora de deitar reclassifique automaticamente os eventos.
- O gerador de PDF (jsPDF) é carregado sob pedido e fica na cache offline.
- Dependências de execução: `react`, `react-dom`, `idb`, `jspdf`, `jspdf-autotable`.

---

## Testes

- `tests/clinical.test.ts` — janelas, classificação nocturna, PMM, 24 h, volume nocturno, NPi, médias de 3 dias, mudanças de hora (Europe/Lisbon, 29/03 e 25/10/2026), meia-noite e passagem de ano.
- `tests/repository.test.ts` — adicionar/editar/eliminar/desfazer, sincronização das horas de sono, persistência ao reabrir, esquema, importação.
- `tests/backup-csv.test.ts` — JSON ida e volta, validação de ficheiros inválidos, CSV, PDF.
- `tests/misc.test.ts` — datas, formatação pt-PT, validação, observações sem diagnóstico, lembretes/.ics, rotas.
- `tests/ui.test.tsx` — fluxos da interface (onboarding, registo em 2 toques, editar, eliminar + desfazer, duplicar, avisos, persistência, DEMO, resumo, sintomas).
- `e2e/app.spec.ts` — na build de produção: manifest e meta tags iOS, persistência após recarregar, cenário 23:30 → 01:30/05:30/07:30 com relógio controlado, exportar/restaurar JSON, PDF, modo standalone do iPhone, **funcionamento offline** e verificação de que só há pedidos à própria origem.

Os testes correm sempre no fuso `Europe/Lisbon`, independentemente do computador.

---

## Limitações conhecidas

- O iOS não permite agendar notificações locais a partir de uma PWA sem servidor de push; por privacidade não usamos nenhum. Solução: lembretes no calendário (.ics).
- Se o utilizador apagar os dados do navegador, os registos perdem-se — daí as cópias de segurança JSON.
- O idioma disponível é apenas português (Portugal).
