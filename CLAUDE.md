# Coach EDN — Contexto da Sessão
**Último commit:** `e4f4e9d` | **Repo:** `DIegoCordeiro14/treinador-jayme-app` | **Deploy:** Vercel Production

---

## Stack
- Next.js 15 (App Router) + TypeScript | Supabase (PostgreSQL) | Anthropic Haiku | Tailwind + Radix + lucide-react@0.378 | Vercel

## Git (token via variável de ambiente — não commitar)
```bash
git clone https://[TOKEN]@github.com/DIegoCordeiro14/treinador-jayme-app.git /tmp/app
cd /tmp/app && git config user.email "diegocordeiro14@hotmail.com" && git config user.name "Diego Cordeiro"
```

## Regra crítica: dois trees
`app/(app)/` e `app/app/` são IDÊNTICOS. Mobile usa `/app/*` (tree app/app/). **Sempre sincronizar os dois** após editar qualquer page.tsx.

## Arquitetura V5.0 — arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/edn/athlete-context.ts` | P1: fonte única — `buildAthleteContext()`, `serializeAthleteContext()`, cache 20min |
| `src/lib/edn/specialization.ts` | P5+6: `prescribeWorkoutBlueprint()` por sexo+objetivo+BF+ponto_fraco |
| `src/lib/edn/projections.ts` | P7: regressão linear 30/60/90/180d |
| `src/lib/edn/performance-engine.ts` | Motor V3 AthleteState básico (scores) |
| `src/lib/ai-coach/agents.ts` | P2: 4 agentes + `detectAgent()` |
| `src/app/api/ai-coach/route.ts` | Chat — usa AthleteContext, zero queries diretas |
| `src/app/api/apply-action/route.ts` | P4: executa ações no banco (calorias, deload, weak_point) |
| `src/app/api/daily-briefing/route.ts` | P3: briefing IA, cache por userId×data |
| `src/app/api/generate-workout/route.ts` | Geração treino + BlueprintV5 injetado |
| `src/components/dashboard/daily-briefing-panel.tsx` | P3: painel briefing |
| `src/components/dashboard/athlete-intelligence-panel.tsx` | P2: Score 360° |
| `src/components/ui/action-card.tsx` | P4: ActionCard + Deload/Calorias/HIIT presets |
| `src/components/evolucao/projection-compare.tsx` | P7: comparação cenários |
| `src/app/(app)/feed/page.tsx` | P8: Feed Social EDN |

## 4 Agentes (agents.ts)
- `treinador` 💪 — musculação, progressão, deload
- `nutricionista` 🥗 — calorias, macros, déficit
- `analista` 📊 — bioimpedância, platôs, projeções
- `performance` 🏃 — cardio, VO2, zonas
- `geral` 🧠 — fallback

## Tabelas Supabase
```
profiles          — name, gender, goal, main_goal, aesthetic_goal, weak_point,
                    experience_level, weekly_frequency, calorie_target, target_weight_kg
bioimpedance_data — weight_kg, body_fat_pct, skeletal_muscle_mass_kg, visceral_fat_level,
                    water_pct, basal_metabolic_rate_kcal, bmi, protein_pct, measured_at
body_weight_logs  — weight_kg, log_date
food_logs         — calories_kcal, protein_g, carbs_g, fat_g, logged_at
cardio_sessions   — distance_km, duration_min, intensity, performed_at
workout_sessions  — started_at, finished_at, total_volume_kg, plan_id
session_sets      — weight_kg, reps_done, rir, set_type, exercise_id
progressions      — weight_kg, reps, rir, set_type, exercise_id, recorded_at
deloads           — start_date, reason, volume_reduction_pct, is_active
activity_feed     — user_id, type, data (jsonb), created_at
ai_conversations  — user_id, messages (jsonb), updated_at
```

## Bugs conhecidos / armadilhas
- **Nunca importar ícones de next/navigation** — causou crash total (Radio bug, e4f4e9d)
- **Imports duplicados de lucide-react** causam build error (TrendingUp bug, 45f5373)
- **Sempre verificar ícone existe em @0.378** antes de usar
- `apply-action` deve chamar `invalidateAthleteContext(userId)` após mutação
- `feed/page.tsx` usa localStorage para curtidas (sem tabela feed_likes no banco ainda)
- **Nunca commitar tokens** no CLAUDE.md — GitHub secret scanning bloqueia o push

## Pendências (próxima sessão)
- Adicionar colunas `weak_point` e `target_protein_g` ao schema SQL (profiles)
- Feed Social: likes reais no banco (tabela feed_likes)
- Password reset — fluxo de auth ausente
- Superset support na execução
- GPS visualization no cárdio
- Export CSV/PDF do histórico
