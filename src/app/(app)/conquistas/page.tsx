'use client';

import { useEffect, useState } from 'react';
import { Trophy, Star, Zap, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { xpProgress } from '@/lib/edn/progression';
import { cn } from '@/lib/utils';

interface UserXP {
  xp_total: number;
  level: number;
}

interface Achievement {
  id: string;
  type: string;
  title: string;
  description: string;
  icon: string;
  earned_at: string;
}

const ALL_ACHIEVEMENTS = [
  { id: 'first_workout', title: 'Primeiro Treino', description: 'Complete o primeiro treino', icon: '💪', xp: 50 },
  { id: 'streak_7', title: 'Semana Perfeita', description: '7 dias consecutivos', icon: '🔥', xp: 100 },
  { id: 'streak_30', title: 'Mês de Ferro', description: '30 dias consecutivos', icon: '🏆', xp: 500 },
  { id: 'first_mesocycle', title: 'Mesociclo Completo', description: 'Complete 8 semanas de treino', icon: '📅', xp: 200 },
  { id: 'sessions_10', title: '10 Treinos', description: 'Acumule 10 sessões', icon: '🎯', xp: 100 },
  { id: 'sessions_50', title: '50 Treinos', description: 'Acumule 50 sessões', icon: '⚡', xp: 300 },
  { id: 'sessions_100', title: 'Centurião', description: '100 sessões completadas', icon: '💯', xp: 1000 },
  { id: 'progression_4weeks', title: '4 Semanas de Progressão', description: 'Progrida por 4 semanas seguidas', icon: '📈', xp: 150 },
  { id: 'top_set_pr', title: 'Novo PR', description: 'Bata seu recorde pessoal', icon: '🥇', xp: 75 },
  { id: 'deload_done', title: 'Deload Estratégico', description: 'Complete um deload recomendado', icon: '🔄', xp: 50 },
  { id: 'volume_100k', title: 'Volume 100k', description: 'Acumule 100.000 kg de volume', icon: '🏋️', xp: 200 },
  { id: 'first_challenge', title: 'Primeiro Desafio', description: 'Participe de um desafio', icon: '🎮', xp: 50 },
  { id: 'team_join', title: 'Em Equipe', description: 'Entrou em uma equipe', icon: '🤝', xp: 30 },
  { id: 'challenge_win', title: 'Campeão', description: 'Venceu um desafio', icon: '🏆', xp: 500 },
  { id: 'ai_conversation_10', title: 'Consultor Regular', description: '10 consultas com o Treinador IA', icon: '🤖', xp: 75 },
];

export default function ConquistasPage() {
  const supabase = createClient();
  const [userXP, setUserXP] = useState<UserXP | null>(null);
  const [earned, setEarned] = useState<Achievement[]>([]);
  const [xpLogs, setXpLogs] = useState<{ xp_earned: number; reason: string; earned_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: xp }, { data: achievements }, { data: logs }] = await Promise.all([
        supabase.from('user_xp').select('*').eq('user_id', user.id).single(),
        supabase.from('achievements').select('*').eq('user_id', user.id),
        supabase.from('xp_logs').select('*').eq('user_id', user.id).order('earned_at', { ascending: false }).limit(20),
      ]);

      setUserXP(xp);
      setEarned(achievements ?? []);
      setXpLogs(logs ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const earnedIds = new Set(earned.map((a) => a.type));
  const progress = userXP ? xpProgress(userXP.xp_total) : { level: 1, current: 0, needed: 100, pct: 0 };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Conquistas</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Progresso, XP e recompensas da sua jornada</p>
      </div>

      {/* XP Card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/15 border border-blue-600/30">
            <span className="text-2xl font-bold text-blue-400">{progress.level}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-bold text-zinc-100">Nível {progress.level}</p>
                <p className="text-xs text-zinc-500">{userXP?.xp_total ?? 0} XP total</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-zinc-300">{progress.current} / {progress.needed} XP</p>
                <p className="text-xs text-zinc-500">para nível {progress.level + 1}</p>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Achievements grid */}
      <div>
        <h2 className="font-semibold text-zinc-100 mb-3">
          Conquistas ({earnedIds.size}/{ALL_ACHIEVEMENTS.length})
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {ALL_ACHIEVEMENTS.map((def) => {
            const isEarned = earnedIds.has(def.id);
            const earnedRecord = earned.find((a) => a.type === def.id);
            return (
              <div
                key={def.id}
                className={cn(
                  'rounded-xl border p-4 transition-all',
                  isEarned
                    ? 'border-blue-600/30 bg-blue-600/5 shadow-sm'
                    : 'border-zinc-800 bg-zinc-900 opacity-50'
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className={cn('text-2xl', !isEarned && 'grayscale')}>{def.icon}</span>
                  {isEarned ? (
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-600/10 px-1.5 py-0.5 rounded">
                      +{def.xp} XP
                    </span>
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-zinc-600" />
                  )}
                </div>
                <p className="text-sm font-semibold text-zinc-200 leading-tight">{def.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-tight">{def.description}</p>
                {isEarned && earnedRecord && (
                  <p className="text-[10px] text-zinc-600 mt-2">
                    {new Date(earnedRecord.earned_at).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* XP log */}
      {xpLogs.length > 0 && (
        <div>
          <h2 className="font-semibold text-zinc-100 mb-3">Histórico de XP</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800 overflow-hidden">
            {xpLogs.map((log, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800">
                    <Zap className="h-3.5 w-3.5 text-yellow-400" />
                  </div>
                  <span className="text-sm text-zinc-300">{log.reason}</span>
                </div>
                <span className="text-sm font-semibold text-blue-400">+{log.xp_earned} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
