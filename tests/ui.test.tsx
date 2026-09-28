import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';

let n = 0;
/** Volume como aparece no ecrã ("250 mL", com espaço não separável). */
const ml = (v: number) => new RegExp(`^${v}\\s+mL$`);
const names = () => ({ real: `ui-real-${Date.now()}-${++n}`, demo: `ui-demo-${Date.now()}-${n}` });

async function startDiary(dbNames = names()) {
  const user = userEvent.setup();
  const view = render(<App dbNames={dbNames} />);
  expect(await screen.findByRole('heading', { name: 'Diário Miccional', level: 1 })).toBeInTheDocument();
  expect(screen.getByText('Regista durante 3 dias o que bebes e quando urinas.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Começar diário' }));
  const sheet = await screen.findByRole('dialog', { name: 'Novo diário' });
  await user.click(within(sheet).getByRole('button', { name: 'Começar diário' }));
  expect(await screen.findByRole('heading', { name: /Dia 1 de 3/ })).toBeInTheDocument();
  return { user, view, dbNames };
}

describe('interface', () => {
  it('primeira utilização: onboarding e criação do diário (Dia 1 de 3)', async () => {
    await startDiary();
    expect(screen.getByRole('button', { name: /\+ BEBI/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ URINEI/ })).toBeInTheDocument();
    expect(screen.getByText('Micções nocturnas')).toBeInTheDocument();
  });

  it('adicionar uma bebida em 2 toques (registo rápido)', async () => {
    const { user } = await startDiary();
    await user.click(screen.getByRole('button', { name: /\+ BEBI/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Registar bebida' });
    await user.click(within(sheet).getByRole('button', { name: /Água 250/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const timeline = screen.getByRole('list', { name: 'Registos do dia' });
    expect(within(timeline).getByText('Água')).toBeInTheDocument();
    expect(within(timeline).getByText(ml(250))).toBeInTheDocument();
  });

  it('adicionar, editar, eliminar e desfazer uma micção', async () => {
    const { user } = await startDiary();

    // Adicionar
    await user.click(screen.getByRole('button', { name: /\+ URINEI/ }));
    let sheet = await screen.findByRole('dialog', { name: 'Registar micção' });
    await user.click(within(sheet).getByRole('radio', { name: '300 mL' }));
    await user.click(within(sheet).getByRole('radio', { name: 'Tive de ir rapidamente' }));
    await user.click(within(sheet).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const timeline = () => screen.getByRole('list', { name: 'Registos do dia' });
    expect(within(timeline()).getByText(ml(300))).toBeInTheDocument();
    expect(within(timeline()).getByText('Urgência forte')).toBeInTheDocument();

    // Editar
    await user.click(within(timeline()).getByRole('button', { name: /Micção/ }));
    sheet = await screen.findByRole('dialog', { name: 'Editar micção' });
    const input = within(sheet).getByLabelText('Volume em mililitros');
    await user.clear(input);
    await user.type(input, '420');
    await user.click(within(sheet).getByRole('button', { name: 'Guardar alterações' }));
    await waitFor(() => expect(within(timeline()).getByText(ml(420))).toBeInTheDocument());

    // Eliminar + Desfazer
    await user.click(within(timeline()).getByRole('button', { name: /Micção/ }));
    sheet = await screen.findByRole('dialog', { name: 'Editar micção' });
    await user.click(within(sheet).getByRole('button', { name: /Eliminar/ }));
    expect(await screen.findByText('Evento eliminado')).toBeInTheDocument();
    await waitFor(() => expect(within(timeline()).queryByText(ml(420))).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(within(timeline()).getByText(ml(420))).toBeInTheDocument());
  });

  it('valida volumes: aviso acima de 2000 mL exige confirmação', async () => {
    const { user } = await startDiary();
    await user.click(screen.getByRole('button', { name: /\+ URINEI/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Registar micção' });
    await user.type(within(sheet).getByLabelText('Volume em mililitros'), '2500');
    await user.click(within(sheet).getByRole('button', { name: 'Guardar' }));
    expect(await within(sheet).findByText(/superior a 2000 mL/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Guardar mesmo assim' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(screen.getByRole('list', { name: 'Registos do dia' })).getByText(ml(2500))).toBeInTheDocument();
  });

  it('duplicar abre um novo registo pré-preenchido', async () => {
    const { user } = await startDiary();
    await user.click(screen.getByRole('button', { name: /\+ BEBI/ }));
    let sheet = await screen.findByRole('dialog', { name: 'Registar bebida' });
    await user.click(within(sheet).getByRole('radio', { name: /Café/ }));
    await user.click(within(sheet).getByRole('radio', { name: '200 mL' }));
    await user.click(within(sheet).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const timeline = () => screen.getByRole('list', { name: 'Registos do dia' });
    await user.click(within(timeline()).getByRole('button', { name: /Café/ }));
    sheet = await screen.findByRole('dialog', { name: 'Editar bebida' });
    await user.click(within(sheet).getByRole('button', { name: /Duplicar/ }));
    sheet = await screen.findByRole('dialog', { name: 'Registar bebida' });
    expect(within(sheet).getByLabelText('Volume em mililitros')).toHaveValue('200');
    await user.click(within(sheet).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(within(timeline()).getAllByText('Café')).toHaveLength(2));
  });

  it('os dados persistem depois de fechar e reabrir a aplicação', async () => {
    const { user, view, dbNames } = await startDiary();
    await user.click(screen.getByRole('button', { name: /\+ URINEI/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Registar micção' });
    await user.click(within(sheet).getByRole('radio', { name: '150 mL' }));
    await user.click(within(sheet).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    view.unmount();

    render(<App dbNames={dbNames} />);
    expect(await screen.findByRole('heading', { name: /Dia 1 de 3/ })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Registos do dia' })).getByText(ml(150))).toBeInTheDocument();
  });

  it('modo de demonstração fica isolado e marcado como DEMO', async () => {
    const { user, dbNames } = await startDiary();
    location.hash = '#/definicoes';
    await user.click(await screen.findByRole('button', { name: /Explorar dados de demonstração/ }));
    await user.click(await screen.findByRole('button', { name: 'Ver demonstração' }));
    expect(await screen.findByText('DEMO · dados de demonstração')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Diário concluído' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: /Dia 1 de 3/ })).toBeInTheDocument();
    expect(screen.queryByText(/DEMO/)).not.toBeInTheDocument();
    void dbNames;
  });

  it('resumo mostra métricas, gráficos e aviso sem diagnóstico (dados DEMO)', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('diario-miccional:modo', 'demo');
    render(<App dbNames={names()} />);
    await screen.findByText('DEMO · dados de demonstração');
    location.hash = '#/resumo';
    expect(await screen.findByRole('heading', { name: 'Resumo do diário' })).toBeInTheDocument();
    expect(screen.getByText('Média de micções nocturnas')).toBeInTheDocument();
    expect(screen.getByText('Índice de produção urinária nocturna (NPi)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /urina por hora/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /volume de cada micção/i })).toBeInTheDocument();
    expect(screen.getByText('Este padrão pode ser relevante para discutir com o urologista.')).toBeInTheDocument();
    expect(screen.getAllByText(/Não fornece diagnóstico médico/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Gerar relatório para o urologista/ }));
    expect(await screen.findByRole('heading', { name: 'Relatório para o urologista' })).toBeInTheDocument();
    expect(screen.getByText('Dados de diário miccional fornecidos pelo utilizador. Não constitui diagnóstico médico.')).toBeInTheDocument();
  });

  it('sintoma de alerta mostra aviso neutro', async () => {
    const { user } = await startDiary();
    await user.click(screen.getByRole('button', { name: /\+ URINEI/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Registar micção' });
    await user.click(within(sheet).getByText('Mais opções'));
    await user.click(within(sheet).getByRole('checkbox', { name: 'Sangue na urina' }));
    expect(within(sheet).getByText(/pode justificar avaliação médica/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(/Este sintoma pode justificar avaliação médica/)).toBeInTheDocument();
  });
});
