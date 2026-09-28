import { useState } from 'react';
import { useStore } from '../../app/store';
import { isIOS, isStandalone } from '../../app/platform';
import { DISCLAIMER } from '../../domain/labels';
import { NewDiarySheet } from '../sheets/NewDiarySheet';

const TIPS: [string, string][] = [
  ['🥤', 'Regista todas as bebidas — água, café, sopa, tudo o que for líquido.'],
  ['🚽', 'Regista todas as micções, de dia e de noite.'],
  ['📏', 'Mede o volume de urina sempre que possível, com um copo medidor.'],
  ['🌙', 'À noite, indica se acordaste por causa da vontade de urinar.'],
  ['🔄', 'Tenta manter os teus hábitos normais durante os dias do diário.'],
  ['🩺', 'O diário serve para ajudar um profissional de saúde a compreender os teus sintomas.'],
];

export function Onboarding() {
  const { actions } = useStore();
  const [open, setOpen] = useState(false);
  const finish = () => actions.updateSettings({ onboardingDone: true });

  return (
    <main className="onboarding" id="conteudo">
      <img className="logo" src="./icons/icon-192.png" alt="" width={72} height={72} />
      <h1>Diário Miccional</h1>
      <p className="lead">Regista durante 3 dias o que bebes e quando urinas.</p>

      <ul className="tips">
        {TIPS.map(([icon, text]) => (
          <li key={text}>
            <span className="tip-icon" aria-hidden="true">
              {icon}
            </span>
            <span>{text}</span>
          </li>
        ))}
        <li>
          <span className="tip-icon" aria-hidden="true">
            🔒
          </span>
          <span>
            <strong>Os dados ficam só neste dispositivo.</strong> Não precisas de conta nem de internet.
          </span>
        </li>
      </ul>

      {isIOS() && !isStandalone() && (
        <div className="banner" role="note">
          <span aria-hidden="true">📲</span>
          <div className="banner-body">
            <strong>Dica para iPhone</strong>
            Antes de começar, adiciona a aplicação ao ecrã principal (Partilhar → Adicionar ao ecrã principal). A versão instalada
            guarda os dados separadamente do Safari.
          </div>
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setOpen(true)}>
          Começar diário
        </button>
        <button type="button" className="btn btn-block" onClick={() => void actions.enterDemo()}>
          Ver dados de demonstração
        </button>
        <button type="button" className="btn btn-plain btn-block" onClick={() => void finish()}>
          Agora não
        </button>
        <p className="section-footer center">{DISCLAIMER}</p>
      </div>
      {open && <NewDiarySheet onClose={() => setOpen(false)} onCreated={finish} />}
    </main>
  );
}
