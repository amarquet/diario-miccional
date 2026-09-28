/** Textos em português europeu (pt-PT) associados ao modelo de dados. */
import type {
  Awakening,
  BeverageType,
  ContextFlag,
  LeakageSeverity,
  SymptomFlag,
  UrgencyLevel,
  UrgencyScale,
} from './types';

export const BEVERAGE_LABELS: Record<BeverageType, string> = {
  water: 'Água',
  coffee: 'Café',
  tea: 'Chá',
  milk: 'Leite',
  soft_drink: 'Refrigerante',
  alcohol: 'Bebida alcoólica',
  energy_drink: 'Bebida energética',
  juice: 'Sumo',
  other: 'Outra',
};

export const BEVERAGE_EMOJI: Record<BeverageType, string> = {
  water: '💧',
  coffee: '☕',
  tea: '🍵',
  milk: '🥛',
  soft_drink: '🥤',
  alcohol: '🍷',
  energy_drink: '⚡',
  juice: '🧃',
  other: '🥤',
};

/** Pré-definições de cafeína/álcool ao escolher o tipo de bebida. */
export const BEVERAGE_DEFAULT_FLAGS: Record<BeverageType, { caffeine: boolean; alcohol: boolean }> = {
  water: { caffeine: false, alcohol: false },
  coffee: { caffeine: true, alcohol: false },
  tea: { caffeine: false, alcohol: false },
  milk: { caffeine: false, alcohol: false },
  soft_drink: { caffeine: false, alcohol: false },
  alcohol: { caffeine: false, alcohol: true },
  energy_drink: { caffeine: true, alcohol: false },
  juice: { caffeine: false, alcohol: false },
  other: { caffeine: false, alcohol: false },
};

export function beverageLabel(type: BeverageType, custom?: string): string {
  if (type === 'other' && custom && custom.trim()) return custom.trim();
  return BEVERAGE_LABELS[type];
}

export const URGENCY_NUMERIC_LABELS: Record<UrgencyLevel, string> = {
  0: 'Sem urgência',
  1: 'Urgência ligeira',
  2: 'Urgência moderada',
  3: 'Urgência forte',
  4: 'Urgência muito forte / difícil de adiar',
};

export const URGENCY_DESCRIPTIVE_LABELS: Record<UrgencyLevel, string> = {
  0: 'Sem vontade urgente',
  1: 'Consegui adiar facilmente',
  2: 'Consegui adiar, mas com algum desconforto',
  3: 'Tive de ir rapidamente',
  4: 'Quase não consegui esperar',
};

export const URGENCY_SHORT_LABELS: Record<UrgencyLevel, string> = {
  0: 'Sem urgência',
  1: 'Ligeira',
  2: 'Moderada',
  3: 'Forte',
  4: 'Muito forte',
};

export function urgencyLabel(level: UrgencyLevel, scale: UrgencyScale): string {
  return scale === 'numeric' ? URGENCY_NUMERIC_LABELS[level] : URGENCY_DESCRIPTIVE_LABELS[level];
}

export const URGENCY_LEVELS: UrgencyLevel[] = [0, 1, 2, 3, 4];

export const LEAKAGE_LABELS: Record<LeakageSeverity, string> = {
  small: 'Pequena',
  moderate: 'Moderada',
  large: 'Grande',
};

export const AWAKENING_LABELS: Record<Awakening, string> = {
  woke_to_void: 'Acordei por causa da vontade de urinar',
  already_awake: 'Já estava acordado e aproveitei para urinar',
};

export const AWAKENING_SHORT_LABELS: Record<Awakening, string> = {
  woke_to_void: 'Acordou pela vontade de urinar',
  already_awake: 'Já estava acordado',
};

export const CONTEXT_LABELS: Record<ContextFlag, string> = {
  alcohol: 'Álcool',
  caffeine: 'Cafeína',
  exercise: 'Exercício',
  hot_day: 'Dia particularmente quente',
  medication: 'Medicação',
  poor_sleep: 'Sono perturbado',
};

export const SYMPTOM_LABELS: Record<SymptomFlag, string> = {
  blood: 'Sangue na urina',
  retention: 'Incapacidade de urinar',
  fever: 'Febre associada a sintomas urinários',
  severe_pain: 'Dor intensa',
  sudden_major_leak: 'Perda urinária súbita significativa',
};

export const NOTE_SUGGESTIONS = [
  'Último café às 15:00',
  'Bebi vinho ao jantar',
  'Treino intenso',
  'Dia particularmente quente',
  'Dormi mal',
  'Acordei espontaneamente',
  'Tomei medicação',
];

export const DISCLAIMER =
  'Esta aplicação organiza dados para discussão com um profissional de saúde. Não fornece diagnóstico médico.';

export const REPORT_DISCLAIMER =
  'Dados de diário miccional fornecidos pelo utilizador. Não constitui diagnóstico médico.';

export const RED_FLAG_MESSAGE =
  'Este sintoma pode justificar avaliação médica. Se os sintomas forem intensos ou súbitos, procure assistência médica.';

export const REMINDER_DRINK = 'Não te esqueças de registar a bebida.';
export const REMINDER_VOID = 'Regista a próxima micção.';

export const NPI_LABEL = 'Índice de produção urinária nocturna (NPi)';
