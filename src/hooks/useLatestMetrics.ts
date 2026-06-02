/**
 * useLatestMetrics — Body Metrics Source of Truth
 *
 * Fonte única de dados corporais consumida por:
 *   Dashboard · Nutrição · IA Treinador Jayme · Cárdio · Perfil
 *
 * A edição ocorre APENAS em Evolução → Bioimpedância.
 * Todos os demais módulos apenas leem deste hook.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { differenceInDays, parseISO } from 'date-fns';

export interface LatestMetrics {
  // Dados corporais
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_kg: number | null;
  water_pct: number | null;
  bmi: number | null;
  basal_metabolic_rate_kcal: number | null;   // TMB
  visceral_fat_level: number | null;
  protein_pct: number | null;
  bone_mass_kg: number | null;
  lean_mass_kg: number | null;
  body_score: number | null;
  body_type: string | null;

  // Metadados
  source: 'bioimpedance' | 'measurement' | null;
  measured_at: string | null;
  days_since_measurement: number | null;
  is_stale: boolean;   // true se > 60 dias sem atualização
}

const STALE_DAYS = 60;

const EMPTY: LatestMetrics = {
  weight_kg: null, body_fat_pct: null, muscle_kg: null,
  water_pct: null, bmi: null, basal_metabolic_rate_kcal: null,
  visceral_fat_level: null, protein_pct: null,
  bone_mass_kg: null, lean_mass_kg: null,
  body_score: null, body_type: null,
  source: null, measured_at: null,
  days_since_measurement: null, is_stale: false,
};

export function useLatestMetrics() {
  const supabase = createClient();
  const [metrics, setMetrics] = useState<LatestMetrics>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: bio }, { data: meas }] = await Promise.all([
      supabase
        .from('bioimpedance_data')
        .select(`weight_kg, body_fat_pct, skeletal_muscle_mass_kg,
                 water_pct, bmi, basal_metabolic_rate_kcal,
                 visceral_fat_level, protein_pct, bone_mass_kg,
                 lean_mass_kg, body_score, body_type, measured_at`)
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('body_measurements')
        .select('weight_kg, body_fat_pct, date')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const now = new Date();

    if (bio) {
      const bioDate = bio.measured_at ? parseISO(bio.measured_at) : null;
      const measDate = meas?.date ? parseISO(meas.date) : null;

      // Se body_measurements tem dado mais recente, usa o peso mais novo
      const weight =
        measDate && bioDate && measDate > bioDate && meas?.weight_kg
          ? meas.weight_kg
          : bio.weight_kg;

      const daysSince = bioDate ? differenceInDays(now, bioDate) : null;

      setMetrics({
        weight_kg: weight,
        body_fat_pct: bio.body_fat_pct,
        muscle_kg: bio.skeletal_muscle_mass_kg,
        water_pct: bio.water_pct,
        bmi: bio.bmi,
        basal_metabolic_rate_kcal: bio.basal_metabolic_rate_kcal,
        visceral_fat_level: bio.visceral_fat_level,
        protein_pct: bio.protein_pct,
        bone_mass_kg: bio.bone_mass_kg,
        lean_mass_kg: bio.lean_mass_kg,
        body_score: bio.body_score,
        body_type: bio.body_type,
        source: 'bioimpedance',
        measured_at: bio.measured_at,
        days_since_measurement: daysSince,
        is_stale: daysSince !== null && daysSince > STALE_DAYS,
      });
    } else if (meas) {
      const measDate = meas.date ? parseISO(meas.date) : null;
      const daysSince = measDate ? differenceInDays(now, measDate) : null;
      setMetrics({
        ...EMPTY,
        weight_kg: meas.weight_kg,
        body_fat_pct: meas.body_fat_pct,
        source: 'measurement',
        measured_at: meas.date,
        days_since_measurement: daysSince,
        is_stale: daysSince !== null && daysSince > STALE_DAYS,
      });
    } else {
      setMetrics(EMPTY);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  return { metrics, loading, refetch: fetch };
}

/** Formata os dados de métricas como texto para injeção no contexto da IA */
export function formatMetricsForAI(m: LatestMetrics): string {
  if (!m.weight_kg) return 'sem dados corporais registrados';
  const lines: string[] = [];
  if (m.weight_kg)                  lines.push(`Peso: ${m.weight_kg}kg`);
  if (m.body_fat_pct)               lines.push(`Gordura Corporal: ${m.body_fat_pct}%`);
  if (m.muscle_kg)                  lines.push(`Massa Muscular: ${m.muscle_kg}kg`);
  if (m.bmi)                        lines.push(`IMC: ${m.bmi}`);
  if (m.basal_metabolic_rate_kcal)  lines.push(`TMB: ${m.basal_metabolic_rate_kcal}kcal`);
  if (m.water_pct)                  lines.push(`Água Corporal: ${m.water_pct}%`);
  if (m.visceral_fat_level)         lines.push(`Gordura Visceral: Nível ${m.visceral_fat_level}`);
  if (m.measured_at)                lines.push(`Última medição: ${new Date(m.measured_at).toLocaleDateString('pt-BR')}`);
  return lines.join(' · ');
}
