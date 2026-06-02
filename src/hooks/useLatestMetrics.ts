/**
 * useLatestMetrics — Source of truth único para dados físicos do usuário.
 * Consultado por Dashboard, Evolução, Nutrição e Cárdio.
 * Prioriza bioimpedance_data (mais completo) e complementa com body_measurements.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface LatestMetrics {
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_kg: number | null;
  water_pct: number | null;
  bmi: number | null;
  basal_metabolic_rate_kcal: number | null;
  visceral_fat_level: number | null;
  protein_pct: number | null;
  source: 'bioimpedance' | 'measurement' | null;
  measured_at: string | null;
}

const EMPTY: LatestMetrics = {
  weight_kg: null, body_fat_pct: null, muscle_kg: null,
  water_pct: null, bmi: null, basal_metabolic_rate_kcal: null,
  visceral_fat_level: null, protein_pct: null,
  source: null, measured_at: null,
};

export function useLatestMetrics(): { metrics: LatestMetrics; loading: boolean; refetch: () => void } {
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
        .select('weight_kg, body_fat_pct, skeletal_muscle_mass_kg, water_pct, bmi, basal_metabolic_rate_kcal, visceral_fat_level, protein_pct, measured_at')
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

    if (bio) {
      // Prioriza bioimpedance_data por ser mais completo
      const bioDate = bio.measured_at ? new Date(bio.measured_at) : null;
      const measDate = meas?.date ? new Date(meas.date) : null;
      // Se measurement é mais recente, usa seu peso
      const weight = (measDate && bioDate && measDate > bioDate)
        ? (meas?.weight_kg ?? bio.weight_kg)
        : bio.weight_kg;

      setMetrics({
        weight_kg: weight,
        body_fat_pct: bio.body_fat_pct,
        muscle_kg: bio.skeletal_muscle_mass_kg,
        water_pct: bio.water_pct,
        bmi: bio.bmi,
        basal_metabolic_rate_kcal: bio.basal_metabolic_rate_kcal,
        visceral_fat_level: bio.visceral_fat_level,
        protein_pct: bio.protein_pct,
        source: 'bioimpedance',
        measured_at: bio.measured_at,
      });
    } else if (meas) {
      setMetrics({
        ...EMPTY,
        weight_kg: meas.weight_kg,
        body_fat_pct: meas.body_fat_pct,
        source: 'measurement',
        measured_at: meas.date,
      });
    } else {
      setMetrics(EMPTY);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  return { metrics, loading, refetch: fetch };
}
