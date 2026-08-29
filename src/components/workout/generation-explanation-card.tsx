'use client';

// Card estruturado "Por que este treino?" — consome generationExplanation da rota
// /api/generate-workout (v3). Determinístico: só formata o objeto.

interface Explanation {
  goalStrategy: string;
  selectedSplit: string | null;
  splitReason: string | null;
  musclePriorities: string[];
  weakPoints: string[];
  volumeStrategy: string;
  balanceStrategy: string;
  exerciseRetention: string[];
  exerciseChanges: string[];
  recoveryConstraints: string;
  cardioConstraints: string;
  physicalSafety: string;
  expectedFocus: string;
  equilibriumScore: number | null;
}

const MG_PT: Record<string, string> = { chest: 'Peito', back: 'Costas', shoulders: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', legs: 'Pernas', glutes: 'Glúteos', abs: 'Abdômen', calves: 'Panturrilha', forearms: 'Antebraço' };
const pt = (s: string) => s.replace(/\b(chest|back|shoulders|biceps|triceps|legs|glutes|abs|calves|forearms)\b/g, (m) => MG_PT[m] ?? m);

function Row({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold text-emerald-300">{icon} {title}</p>
      <div className="text-[11px] text-zinc-300 leading-relaxed">{children}</div>
    </div>
  );
}

export function GenerationExplanationCard({ exp }: { exp: Explanation }) {
  return (
    <div className="space-y-2.5">
      <Row icon="🎯" title="Objetivo">
        {exp.goalStrategy}
        {exp.selectedSplit ? <> Split: <strong className="text-zinc-100">{exp.selectedSplit}</strong>{exp.splitReason ? ` — ${exp.splitReason}` : ''}.</> : null}
      </Row>

      {exp.musclePriorities.length > 0 && (
        <Row icon="⭐" title="Prioridades">{pt(exp.musclePriorities.join('; '))}.</Row>
      )}

      {exp.weakPoints.length > 0 && (
        <Row icon="🔎" title="Ponto fraco">{exp.expectedFocus ? pt(exp.expectedFocus) : pt(exp.weakPoints.join(', '))}</Row>
      )}

      <Row icon="📊" title="Volume">{exp.volumeStrategy}</Row>
      <Row icon="⚖️" title="Equilíbrio">{pt(exp.balanceStrategy)}</Row>

      {exp.exerciseRetention.length > 0 && (
        <Row icon="📈" title="Mantidos">
          <ul className="space-y-0.5">{exp.exerciseRetention.map((r, i) => <li key={i}>• {r}</li>)}</ul>
        </Row>
      )}
      {exp.exerciseChanges.length > 0 && (
        <Row icon="🔄" title="Alterados">
          <ul className="space-y-0.5">{exp.exerciseChanges.map((c, i) => <li key={i}>• {c}</li>)}</ul>
        </Row>
      )}

      <Row icon="🔋" title="Recuperação">{exp.recoveryConstraints} {exp.cardioConstraints}</Row>
      <Row icon="🛡️" title="Segurança">{exp.physicalSafety}</Row>

      {exp.equilibriumScore != null && (
        <div className="flex items-center gap-2 pt-1 border-t border-emerald-500/15">
          <span className="text-[11px] text-zinc-400">Equilíbrio do plano</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${exp.equilibriumScore}%` }} />
          </div>
          <span className="text-[11px] font-bold text-emerald-300">{exp.equilibriumScore}/100</span>
        </div>
      )}
    </div>
  );
}
