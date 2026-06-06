/**
 * V7.7 — Classificador automático de tipo de corrida.
 * Recebe a série de velocidades (km/h) por amostra e classifica cada trecho,
 * gerando distribuição de tempo por faixa + análise textual (ex: nº de tiros).
 */

export type RunZone = 'walk' | 'easy' | 'moderate' | 'hard' | 'sprint';

export const ZONE_LABELS: Record<RunZone, string> = {
  walk: 'Caminhada',
  easy: 'Corrida leve',
  moderate: 'Corrida moderada',
  hard: 'Corrida forte',
  sprint: 'Tiro',
};

export const ZONE_COLORS: Record<RunZone, string> = {
  walk: '#6b7280', easy: '#5A8A6A', moderate: '#D4853A', hard: '#E0773A', sprint: '#C0453A',
};

export function classifySpeed(kmh: number): RunZone {
  if (kmh < 7) return 'walk';
  if (kmh < 10) return 'easy';
  if (kmh < 13) return 'moderate';
  if (kmh < 16) return 'hard';
  return 'sprint';
}

export interface SpeedSample { speedKmh: number; dtSec: number }

export interface RunAnalysis {
  zoneSeconds: Record<RunZone, number>;
  dominant: RunZone;
  sprintCount: number;     // nº de "tiros" (trechos > 16 km/h com duração mínima)
  maxSpeedKmh: number;
  insights: string[];
}

const SPRINT_MIN_SEC = 5; // um tiro precisa durar ao menos 5s contínuos

export function analyzeRun(samples: SpeedSample[]): RunAnalysis {
  const zoneSeconds: Record<RunZone, number> = { walk: 0, easy: 0, moderate: 0, hard: 0, sprint: 0 };
  let maxSpeed = 0;
  let sprintCount = 0;
  let inSprint = false;
  let sprintDur = 0;

  for (const s of samples) {
    const z = classifySpeed(s.speedKmh);
    zoneSeconds[z] += s.dtSec;
    if (s.speedKmh > maxSpeed) maxSpeed = s.speedKmh;

    if (z === 'sprint') {
      sprintDur += s.dtSec;
      if (!inSprint && sprintDur >= SPRINT_MIN_SEC) { inSprint = true; sprintCount++; }
    } else {
      inSprint = false; sprintDur = 0;
    }
  }

  const dominant = (Object.keys(zoneSeconds) as RunZone[])
    .reduce((a, b) => (zoneSeconds[b] > zoneSeconds[a] ? b : a), 'easy');

  const insights: string[] = [];
  if (sprintCount > 0) insights.push(`Você executou ${sprintCount} tiro${sprintCount > 1 ? 's' : ''} acima de 16 km/h.`);
  insights.push(`Predominância: ${ZONE_LABELS[dominant].toLowerCase()}.`);
  if (zoneSeconds.walk > 0.4 * total(zoneSeconds)) insights.push('Boa parte foi em caminhada — considere reduzir as pausas para ganhar volume aeróbico.');
  if (maxSpeed >= 16) insights.push(`Velocidade máxima: ${maxSpeed.toFixed(1)} km/h.`);

  return { zoneSeconds, dominant, sprintCount, maxSpeedKmh: maxSpeed, insights };
}

function total(z: Record<RunZone, number>): number {
  return Object.values(z).reduce((a, b) => a + b, 0) || 1;
}
