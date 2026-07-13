/**
 * Especialização Inteligente — AOS Bloco 9
 * Registro de modalidades. Cada especialização ajusta automaticamente treino,
 * volume, frequência, nutrição, cardio, métricas e o foco do Coach.
 */

export type SpecCategory = 'strength' | 'bodybuilding' | 'endurance' | 'team_sport' | 'combat' | 'crossfit' | 'general';

export interface Specialization {
  key: string;
  label: string;
  category: SpecCategory;
  trainingFocus: string;
  volumeBias: 'baixo' | 'moderado' | 'alto';
  frequencyBias: string;
  cardioFocus: string;
  nutritionFocus: string;
  keyMetrics: string[];
}

const S = (s: Specialization) => s;
export const SPECIALIZATIONS: Record<string, Specialization> = {
  powerlifting: S({ key: 'powerlifting', label: 'Powerlifting', category: 'strength', trainingFocus: 'Força máxima nos 3 grandes (agacho/supino/terra)', volumeBias: 'moderado', frequencyBias: 'agacho/supino/terra 2-3x/sem', cardioFocus: 'Cardio leve p/ recuperação (Z2)', nutritionFocus: 'Manutenção/superávit leve, proteína alta', keyMetrics: ['1RM', 'total', 'RPE'] }),
  bodybuilding: S({ key: 'bodybuilding', label: 'Bodybuilding', category: 'bodybuilding', trainingFocus: 'Hipertrofia com volume efetivo e conexão', volumeBias: 'alto', frequencyBias: '2x/sem por grupo', cardioFocus: 'Z2 p/ gasto sem prejudicar recuperação', nutritionFocus: 'Fases (bulk/cut) com proteína alta', keyMetrics: ['volume/músculo', 'BF%', 'medidas'] }),
  powerbuilding: S({ key: 'powerbuilding', label: 'Powerbuilding', category: 'strength', trainingFocus: 'Força + hipertrofia combinadas', volumeBias: 'alto', frequencyBias: 'compostos pesados + acessórios', cardioFocus: 'Z2 moderado', nutritionFocus: 'Superávit leve, proteína alta', keyMetrics: ['1RM', 'volume', 'BF%'] }),
  emagrecimento: S({ key: 'emagrecimento', label: 'Emagrecimento', category: 'general', trainingFocus: 'Preservar músculo em déficit, alto gasto', volumeBias: 'moderado', frequencyBias: '4-5x/sem full/upper-lower', cardioFocus: 'Z2 consistente + 1-2 HIIT', nutritionFocus: 'Déficit controlado, proteína 2-2.4g/kg', keyMetrics: ['peso', 'BF%', 'aderência'] }),
  hipertrofia: S({ key: 'hipertrofia', label: 'Hipertrofia', category: 'bodybuilding', trainingFocus: 'Volume efetivo e progressão', volumeBias: 'alto', frequencyBias: '2x/sem por grupo', cardioFocus: 'Cardio mínimo efetivo', nutritionFocus: 'Superávit controlado', keyMetrics: ['volume', 'PRs', 'peso'] }),
  definicao: S({ key: 'definicao', label: 'Definição', category: 'bodybuilding', trainingFocus: 'Preservar massa, densidade alta', volumeBias: 'moderado', frequencyBias: '4-5x/sem', cardioFocus: 'Z2 + HIIT', nutritionFocus: 'Déficit + proteína muito alta', keyMetrics: ['BF%', 'medidas', 'força'] }),
  recomposicao: S({ key: 'recomposicao', label: 'Recomposição', category: 'general', trainingFocus: 'Progressão de força na manutenção', volumeBias: 'moderado', frequencyBias: '4x/sem', cardioFocus: 'Z2 moderado', nutritionFocus: 'Manutenção, proteína alta', keyMetrics: ['peso', 'BF%', 'massa magra'] }),
  performance: S({ key: 'performance', label: 'Performance', category: 'general', trainingFocus: 'Potência e capacidade de trabalho', volumeBias: 'moderado', frequencyBias: 'periodizado', cardioFocus: 'Zonas específicas', nutritionFocus: 'Disponibilidade energética alta', keyMetrics: ['potência', 'VO2', 'recuperação'] }),
  corrida_5k: S({ key: 'corrida_5k', label: 'Corrida 5km', category: 'endurance', trainingFocus: 'Base + intervalados curtos', volumeBias: 'baixo', frequencyBias: '3-4x/sem corrida', cardioFocus: 'Z2 + intervalados (Z4)', nutritionFocus: 'Carbo estratégico', keyMetrics: ['pace 5k', 'FC', 'ACWR'] }),
  corrida_10k: S({ key: 'corrida_10k', label: 'Corrida 10km', category: 'endurance', trainingFocus: 'Base + limiar', volumeBias: 'moderado', frequencyBias: '4x/sem', cardioFocus: 'Z2 + limiar (Z4)', nutritionFocus: 'Carbo estratégico', keyMetrics: ['pace 10k', 'FC', 'volume'] }),
  meia_maratona: S({ key: 'meia_maratona', label: 'Meia Maratona', category: 'endurance', trainingFocus: 'Volume + longões', volumeBias: 'alto', frequencyBias: '4-5x/sem + longão', cardioFocus: 'Z2 predominante, 1 qualidade', nutritionFocus: 'Carbo alto nos dias longos', keyMetrics: ['volume km', 'longão', 'pace'] }),
  maratona: S({ key: 'maratona', label: 'Maratona', category: 'endurance', trainingFocus: 'Volume alto + longões progressivos', volumeBias: 'alto', frequencyBias: '5-6x/sem + longão', cardioFocus: 'Z2 + longões, taper', nutritionFocus: 'Carbo alto, treino de fueling', keyMetrics: ['volume km', 'longão', 'recuperação'] }),
  trail_running: S({ key: 'trail_running', label: 'Trail Running', category: 'endurance', trainingFocus: 'Resistência + força específica (subidas)', volumeBias: 'alto', frequencyBias: '4-5x/sem + subidas', cardioFocus: 'Z2 + elevação', nutritionFocus: 'Carbo + eletrólitos', keyMetrics: ['elevação', 'tempo', 'FC'] }),
  ciclismo: S({ key: 'ciclismo', label: 'Ciclismo', category: 'endurance', trainingFocus: 'Base aeróbica + potência (FTP)', volumeBias: 'alto', frequencyBias: '4-6x/sem', cardioFocus: 'Zonas de potência', nutritionFocus: 'Carbo alto', keyMetrics: ['FTP', 'watts', 'volume'] }),
  mountain_bike: S({ key: 'mountain_bike', label: 'Mountain Bike', category: 'endurance', trainingFocus: 'Potência + resistência técnica', volumeBias: 'alto', frequencyBias: '4x/sem', cardioFocus: 'Intervalados + base', nutritionFocus: 'Carbo + eletrólitos', keyMetrics: ['potência', 'técnica', 'FC'] }),
  triathlon: S({ key: 'triathlon', label: 'Triathlon', category: 'endurance', trainingFocus: 'Natação+bike+corrida periodizados', volumeBias: 'alto', frequencyBias: '6-9 sessões/sem', cardioFocus: 'Zonas nas 3 modalidades', nutritionFocus: 'Carbo alto + fueling', keyMetrics: ['volume', 'transições', 'recuperação'] }),
  natacao: S({ key: 'natacao', label: 'Natação', category: 'endurance', trainingFocus: 'Técnica + volume + intervalados', volumeBias: 'alto', frequencyBias: '4-6x/sem', cardioFocus: 'Séries por zona', nutritionFocus: 'Carbo estratégico', keyMetrics: ['pace/100m', 'volume', 'técnica'] }),
  cross_training: S({ key: 'cross_training', label: 'Cross Training', category: 'crossfit', trainingFocus: 'Condicionamento geral + força', volumeBias: 'moderado', frequencyBias: '4-5x/sem', cardioFocus: 'Metcon + Z2', nutritionFocus: 'Performance + recuperação', keyMetrics: ['benchmarks', 'força', 'condicionamento'] }),
  crossfit: S({ key: 'crossfit', label: 'CrossFit', category: 'crossfit', trainingFocus: 'Força + ginástica + metcon', volumeBias: 'alto', frequencyBias: '5x/sem', cardioFocus: 'Metcon variado', nutritionFocus: 'Carbo + proteína altos', keyMetrics: ['benchmarks (Fran/…)', 'PRs', 'recuperação'] }),
  futebol: S({ key: 'futebol', label: 'Futebol', category: 'team_sport', trainingFocus: 'Velocidade, resistência, força', volumeBias: 'moderado', frequencyBias: 'complementar aos treinos/jogos', cardioFocus: 'Intervalados/sprints', nutritionFocus: 'Carbo p/ jogos, recuperação', keyMetrics: ['sprint', 'resistência', 'lesão'] }),
  futsal: S({ key: 'futsal', label: 'Futsal', category: 'team_sport', trainingFocus: 'Explosão + agilidade', volumeBias: 'moderado', frequencyBias: 'complementar', cardioFocus: 'Intervalados curtos', nutritionFocus: 'Carbo p/ jogos', keyMetrics: ['explosão', 'agilidade'] }),
  basquete: S({ key: 'basquete', label: 'Basquete', category: 'team_sport', trainingFocus: 'Salto, potência, resistência', volumeBias: 'moderado', frequencyBias: 'complementar', cardioFocus: 'Intervalados', nutritionFocus: 'Recuperação + energia', keyMetrics: ['salto', 'potência'] }),
  volei: S({ key: 'volei', label: 'Vôlei', category: 'team_sport', trainingFocus: 'Potência de salto e ombro', volumeBias: 'moderado', frequencyBias: 'complementar', cardioFocus: 'Intervalados', nutritionFocus: 'Recuperação', keyMetrics: ['salto', 'ombro saudável'] }),
  tenis: S({ key: 'tenis', label: 'Tênis', category: 'team_sport', trainingFocus: 'Agilidade, potência rotacional', volumeBias: 'moderado', frequencyBias: 'complementar', cardioFocus: 'Intervalados', nutritionFocus: 'Hidratação + energia', keyMetrics: ['agilidade', 'potência'] }),
  beach_tennis: S({ key: 'beach_tennis', label: 'Beach Tennis', category: 'team_sport', trainingFocus: 'Agilidade na areia, ombro', volumeBias: 'baixo', frequencyBias: 'complementar', cardioFocus: 'Intervalados', nutritionFocus: 'Hidratação', keyMetrics: ['agilidade', 'ombro'] }),
  artes_marciais: S({ key: 'artes_marciais', label: 'Artes Marciais', category: 'combat', trainingFocus: 'Condicionamento + potência + mobilidade', volumeBias: 'moderado', frequencyBias: 'complementar aos treinos', cardioFocus: 'Intervalados específicos', nutritionFocus: 'Peso de categoria + performance', keyMetrics: ['condicionamento', 'potência', 'peso'] }),
  jiu_jitsu: S({ key: 'jiu_jitsu', label: 'Jiu-Jitsu', category: 'combat', trainingFocus: 'Força de pegada, core, resistência', volumeBias: 'moderado', frequencyBias: 'complementar', cardioFocus: 'Resistência anaeróbica', nutritionFocus: 'Peso de categoria', keyMetrics: ['pegada', 'resistência', 'peso'] }),
  judo: S({ key: 'judo', label: 'Judô', category: 'combat', trainingFocus: 'Potência + pegada + explosão', volumeBias: 'moderado', frequencyBias: 'complementar', cardioFocus: 'Intervalados', nutritionFocus: 'Peso de categoria', keyMetrics: ['explosão', 'pegada', 'peso'] }),
  muay_thai: S({ key: 'muay_thai', label: 'Muay Thai', category: 'combat', trainingFocus: 'Condicionamento + potência', volumeBias: 'moderado', frequencyBias: 'complementar', cardioFocus: 'Intervalados intensos', nutritionFocus: 'Performance + peso', keyMetrics: ['condicionamento', 'potência'] }),
  boxe: S({ key: 'boxe', label: 'Boxe', category: 'combat', trainingFocus: 'Potência de soco, resistência', volumeBias: 'moderado', frequencyBias: 'complementar', cardioFocus: 'Intervalados', nutritionFocus: 'Peso de categoria', keyMetrics: ['potência', 'resistência', 'peso'] }),
  mma: S({ key: 'mma', label: 'MMA', category: 'combat', trainingFocus: 'Força, potência, condicionamento completo', volumeBias: 'alto', frequencyBias: 'complementar periodizado', cardioFocus: 'Intervalados + base', nutritionFocus: 'Peso de categoria + performance', keyMetrics: ['condicionamento', 'potência', 'peso'] }),
};

export function getSpecialization(key: string | null | undefined): Specialization {
  const k = (key ?? 'hipertrofia').toLowerCase().replace(/\s+/g, '_');
  return SPECIALIZATIONS[k] ?? SPECIALIZATIONS['hipertrofia'];
}
export function listSpecializations(): Specialization[] { return Object.values(SPECIALIZATIONS); }
