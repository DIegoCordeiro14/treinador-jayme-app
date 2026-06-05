# Coach EDN — Contexto da Sessão
**Último commit:** `acfe917` | **Repo:** `DIegoCordeiro14/treinador-jayme-app` | **Deploy:** Vercel Production

---

## Stack
- Next.js 15 (App Router) + TypeScript | Supabase (PostgreSQL) | Anthropic Haiku | Tailwind + Radix + lucide-react@0.378 | Vercel

## Git (token via variável de ambiente — não commitar)
```bash
git clone https://[TOKEN]@github.com/DIegoCordeiro14/treinador-jayme-app.git /tmp/app
cd /tmp/app && git config user.email "diegocordeiro14@hotmail.com" && git config user.name "Diego Cordeiro"
```


## Design System (sessão jun/2026 — paridade com mockups Coach EDN)
Referência: `mockup-web-final.html` e `mockup-mobile-final.html` (uploads do Diego).

**Tokens** (todas as 22 paletas Tailwind remapeadas em `tailwind.config.ts`):
- Fundo `#07090B` · nav `#0D1117` · card `#111820`/`#141C24` · borda `rgba(255,255,255,.07)`
- Accent âmbar `#D4853A` (orange/amber remapeados) · pos `#5A8A6A` (green/emerald/lime) · warn `#A67C3A` (yellow) · neg `#8B5A5A` (red) · texto `#F0F4F6`/`#8FA3AD`/`#607D8B` (zinc/slate/gray/blue/cyan/teal) · mauve muted (purple/violet/indigo/fuchsia) · rosa muted (pink/rose)
- Tipografia: Inter; h1/h2 = italic 900, h3 = italic 800 (global em globals.css)
- Botões/badges/tabs = pill (rounded-full); chips ativos = bg âmbar 12% + borda âmbar
- Logo: caixa "E" itálica âmbar + sub "ESCOLA DOS NATURAIS" (sidebar/header/drawer/landing)
- Stat cards: borda esquerda âmbar 3px, label CAPS, número branco itálico black

**Mobile**: bottom nav com 6 abas (Início/Treinos/Cardio/Nutrição/Coach/Perfil) usando SVGs exatos do mockup (inline em bottom-nav.tsx); SEM botão "Mais". Drawer com grupos Treino/Progresso/Comunidade/Conta. `overflow-x: clip` em html/body (NUNCA combinar com overflow-y:auto — a spec converte clip→hidden e trava o touch scroll). `* { min-width: 0 }` global — usar `shrink-0` em chips/abas para não cortar texto.

## Decisões de produto (sessão jun/2026)
- **Dashboard**: card "Treino de Hoje" sincronizado com `workout_plans.schedule_config` (pattern 1=Seg..7=Dom + day_assignments rótulo ex. "legs/abs"); matching por nome → por grupo muscular dos exercícios → por posição no padrão. Informativo "Próximo treino: X · dia (label)" no mesmo card. Card "Composição Corporal" (peso/gordura/músculo + IMC) ao lado do briefing.
- **"Briefing Diário · Coach EDN"** = card único que fundiu DailyBriefingPanel + ProactiveBriefing (antigo "Análise do dia"); AthleteIntelligencePanel agora só renderiza EdnScore360.
- **ThreeLayerPanel** (`three-layer-panel.tsx`): Camadas 1-2-3 (Dados=state.raw / Interpretação=alerts+recovery_state.factors / Prescrição=recommendations), colapsável, no dashboard.
- **Nutrição**: card único "Plano Nutricional EDN" (fundiu Nutrição Autônoma EDN + Macros do Plano + Meta Diária); anéis em ordem de importância Calorias>Proteína>Carbo>Gordura>Água; % real = g×kcal/meta; dados do `/api/autopilot` buscados na própria page (AutopilotCard tem prop `embedded` mas não é mais usado na nutrição).
- **Cárdio/Nutrição heroes**: escuros com borda âmbar (nunca gradientes laranja saturados).
- **Evolução**: bioimpedância em grade de caixas centradas com deltas vs avaliação anterior.
- **Biblioteca**: grade 2 colunas também no mobile; 80/80 exercícios com youtube_url (validados via oEmbed).
- **Coach EDN chat**: X de apagar conversa sempre visível no touch (lg:opacity-0 no desktop).

## Infra/operacional (li­ções desta sessão)
- **Service worker** (`public/sw.js`): CACHE_NAME versionado (v2); network-first para tudo exceto `/_next/static` (cache-first). O v1 cache-first congelava o app antigo para sempre — se "deploy não aparece", suspeitar do SW e bump da versão.
- **Vercel Hobby**: 1 build por vez; deploy travado em "Initializing" segura a fila — cancelar pelo painel destrava (os queued mais novos suplantam os antigos).
- Build local: Google Fonts bloqueado no sandbox → usar `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/tmp/font-mock.js`; erros de prerender login/register são por falta de env Supabase local (ok na Vercel).
- TS baseline: ~13 erros pré-existentes (progression.test, projections.ts, DeloadBanner no dashboard, equipes) — build ignora (`ignoreBuildErrors: true`).
- Dados: só 1 workout_plan com `is_active=true` (saneado em jun/2026); fetch do plano ativo usa `.order(created_at desc).limit(1).maybeSingle()`.
- Calendário: `cfg.pattern`/`day_assignments` podem ser null — sempre usar guards (`?? []`).

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
- Conferir visual após dados reais (refeições, ranking, histórico preenchem estados vazios)
- Adicionar colunas `weak_point` e `target_protein_g` ao schema SQL (profiles)
- Feed Social: likes reais no banco (tabela feed_likes)
- Password reset — fluxo de auth ausente
- Superset support na execução
- GPS visualization no cárdio
- Export CSV/PDF do histórico
