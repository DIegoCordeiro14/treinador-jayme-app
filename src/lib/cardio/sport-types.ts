/**
 * Normalização de tipos de atividade esportiva (import multiesporte).
 * Mapeia os rótulos crus dos providers (Health Connect/HealthKit/etc.) para
 * categorias internas, com a informação se a atividade usa rota (GPS).
 */
export type SportActivityType =
  | 'corrida' | 'caminhada' | 'trilha' | 'ciclismo' | 'mtb' | 'natacao' | 'remo' | 'eliptico' | 'esteira'
  | 'hiit' | 'musculacao' | 'crosstraining' | 'funcional' | 'yoga' | 'mobilidade'
  | 'futebol' | 'futsal' | 'basquete' | 'volei' | 'tenis'
  | 'luta' | 'boxe' | 'muaythai' | 'jiujitsu' | 'mma'
  | 'outro';

const MAP: [RegExp, SportActivityType][] = [
  [/trail|trilha/i, 'trilha'], [/run|corr/i, 'corrida'], [/walk|hik|caminh/i, 'caminhada'],
  [/mountain|mtb/i, 'mtb'], [/bik|cycl|ciclis|bicicl/i, 'ciclismo'],
  [/swim|nata/i, 'natacao'], [/row|remo/i, 'remo'], [/ellip|elipt/i, 'eliptico'], [/treadmill|esteira/i, 'esteira'],
  [/hiit|interval/i, 'hiit'], [/strength|weight|muscul|forc|resist/i, 'musculacao'],
  [/crossfit|cross.?train/i, 'crosstraining'], [/functional|funcion/i, 'funcional'],
  [/yoga/i, 'yoga'], [/mobil|stretch|along/i, 'mobilidade'],
  [/futsal/i, 'futsal'], [/soccer|foot.?ball|futeb/i, 'futebol'], [/basket|basqu/i, 'basquete'],
  [/volley|volei|voleib/i, 'volei'], [/tennis|tenis/i, 'tenis'],
  [/box|boxe/i, 'boxe'], [/muay/i, 'muaythai'], [/jiu|bjj|jiu.?jitsu/i, 'jiujitsu'],
  [/mma|mixed martial/i, 'mma'], [/fight|luta|martial|marcia/i, 'luta'],
];

const GPS_TYPES = new Set<SportActivityType>(['corrida', 'caminhada', 'trilha', 'ciclismo', 'mtb']);

export function normalizeSportType(raw: string | null | undefined): SportActivityType {
  const r = (raw ?? '').trim();
  if (!r) return 'outro';
  for (const [re, t] of MAP) if (re.test(r)) return t;
  return 'outro';
}
export function sportUsesGps(t: SportActivityType): boolean { return GPS_TYPES.has(t); }

export const SPORT_LABEL: Record<SportActivityType, string> = {
  corrida: 'Corrida', caminhada: 'Caminhada', trilha: 'Trilha', ciclismo: 'Ciclismo', mtb: 'Mountain Bike',
  natacao: 'Natação', remo: 'Remo', eliptico: 'Elíptico', esteira: 'Esteira', hiit: 'HIIT',
  musculacao: 'Musculação', crosstraining: 'Cross Training', funcional: 'Funcional', yoga: 'Yoga', mobilidade: 'Mobilidade',
  futebol: 'Futebol', futsal: 'Futsal', basquete: 'Basquete', volei: 'Vôlei', tenis: 'Tênis',
  luta: 'Luta', boxe: 'Boxe', muaythai: 'Muay Thai', jiujitsu: 'Jiu-Jitsu', mma: 'MMA', outro: 'Outro',
};
