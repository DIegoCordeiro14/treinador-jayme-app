'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  exerciseId: string;
  exerciseName: string;
  initialPreference?: 'liked' | 'neutral' | 'disliked' | null;
}

export function ExercisePreferenceToggle({ exerciseId, exerciseName, initialPreference }: Props) {
  const supabase = createClient();
  const [pref, setPref] = useState<'liked' | 'neutral' | 'disliked' | null>(initialPreference ?? null);
  const [saving, setSaving] = useState(false);

  async function setPreference(value: 'liked' | 'disliked') {
    // Toggle off if same value
    const newVal = pref === value ? 'neutral' : value;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase.from('exercise_preferences').upsert({
      user_id: user.id, exercise_id: exerciseId, preference: newVal, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,exercise_id' });

    setSaving(false);
    if (error) { toast.error('Erro ao salvar preferência'); return; }

    setPref(newVal === 'neutral' ? null : newVal);
    const label = newVal === 'liked' ? 'adicionado às preferidas' : newVal === 'disliked' ? 'marcado como baixa prioridade' : 'preferência removida';
    toast.success(`${exerciseName} — ${label}`);
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <button
        type="button" disabled={saving}
        onClick={() => setPreference('liked')}
        title="Gostei — priorizar este exercício"
        className={cn('flex h-6 w-6 items-center justify-center rounded-md transition-colors',
          pref === 'liked' ? 'bg-green-500/20 text-green-400' : 'text-zinc-600 hover:text-green-400 hover:bg-green-500/10'
        )}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button" disabled={saving}
        onClick={() => setPreference('disliked')}
        title="Não gostei — baixa prioridade"
        className={cn('flex h-6 w-6 items-center justify-center rounded-md transition-colors',
          pref === 'disliked' ? 'bg-red-500/20 text-red-400' : 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10'
        )}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
