/**
 * V7.8 — Comparador Strava.
 * Compara a distância medida pelo Coach EDN com a do Strava (ou outro app de
 * referência) e classifica a qualidade do GPS. Meta: erro < 2%.
 */

export interface StravaComparison {
  ednKm: number;
  refKm: number;
  absErrorKm: number;
  errorPct: number;          // |edn-ref| / ref * 100
  quality: 'excelente' | 'boa' | 'aceitavel' | 'ruim';
  qualityLabel: string;
  withinTarget: boolean;     // erro < 2%
  message: string;
}

export function compareWithStrava(ednKm: number, refKm: number): StravaComparison | null {
  if (!isFinite(ednKm) || !isFinite(refKm) || refKm <= 0) return null;
  const absErrorKm = Math.abs(ednKm - refKm);
  const errorPct = (absErrorKm / refKm) * 100;

  let quality: StravaComparison['quality'];
  if (errorPct < 2) quality = 'excelente';
  else if (errorPct < 4) quality = 'boa';
  else if (errorPct < 7) quality = 'aceitavel';
  else quality = 'ruim';

  const qualityLabel = {
    excelente: 'Excelente (nível Garmin/Strava)',
    boa: 'Boa',
    aceitavel: 'Aceitável',
    ruim: 'Ruim — sinal de GPS fraco nesta sessão',
  }[quality];

  const dir = ednKm >= refKm ? 'a mais' : 'a menos';
  const message = errorPct < 2
    ? `Precisão de nível profissional: ${errorPct.toFixed(1)}% de erro (${(absErrorKm * 1000).toFixed(0)} m).`
    : `Erro de ${errorPct.toFixed(1)}% (${(absErrorKm * 1000).toFixed(0)} m ${dir}). ${quality === 'ruim' ? 'Tente em local mais aberto.' : ''}`.trim();

  return {
    ednKm: Math.round(ednKm * 1000) / 1000,
    refKm,
    absErrorKm: Math.round(absErrorKm * 1000) / 1000,
    errorPct: Math.round(errorPct * 100) / 100,
    quality,
    qualityLabel,
    withinTarget: errorPct < 2,
    message,
  };
}
