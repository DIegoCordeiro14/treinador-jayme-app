# Treinador Jayme — Plataforma EDN

Plataforma de treinamento natural baseada na **Metodologia EDN (Escola dos Naturais)** do Jayme De Lamadrid.

## Stack

- **Frontend**: Next.js 14 · TypeScript · Tailwind CSS · Shadcn/UI
- **State**: Zustand · TanStack Query (React Query)
- **Backend**: Supabase (PostgreSQL + Auth + RLS + Realtime)
- **AI**: Anthropic Claude (padrão) · OpenAI · Gemini — Strategy Pattern
- **Deploy**: Vercel

## Setup Rápido

### 1. Instalar dependências
```bash
npm install
```

### 2. Variáveis de ambiente
```bash
cp .env.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e ANTHROPIC_API_KEY
```

### 3. Banco de dados
No Supabase SQL Editor, execute **todo o conteúdo** de `database/schema.sql`.

Isso cria:
- Tabelas de usuários, treinos, sessões, exercícios
- Sistema de progressão (EDN)
- Gamificação: XP, conquistas, ranking
- Equipes e desafios
- Row Level Security em todas as tabelas
- Triggers de XP automático ao completar treinos
- Função de score do ranking (40/30/20/10)

### 4. Rodar localmente
```bash
npm run dev
```

## Estrutura de Pastas

```
src/
├── app/
│   ├── (auth)/          # Login, registro
│   ├── (app)/           # Área protegida
│   │   ├── dashboard/   # Resumo do dia
│   │   ├── treinos/     # Planos + execução
│   │   ├── exercicios/  # Biblioteca de exercícios
│   │   ├── calendario/  # Calendário de treinos
│   │   ├── evolucao/    # Gráficos de progresso
│   │   ├── ia/          # Chat com Treinador Jayme IA
│   │   ├── ranking/     # Leaderboard EDN
│   │   ├── equipes/     # Times da comunidade
│   │   ├── desafios/    # Desafios com XP
│   │   ├── conquistas/  # Badges e XP
│   │   └── perfil/      # Dados pessoais
│   └── api/
│       └── ai-coach/    # SSE stream da IA
├── lib/
│   ├── edn/             # Motor de progressão EDN
│   │   └── progression.ts  # Linear, Volume, Reps, Density, Isometric
│   ├── ai-coach/        # Strategy Pattern multi-provider
│   │   ├── providers/   # Anthropic, OpenAI, Gemini
│   │   └── index.ts     # Factory + EDN System Prompt
│   └── supabase/        # Client, Server, Middleware
├── store/               # Zustand stores
│   ├── workout.ts       # Estado da sessão de treino
│   ├── gamification.ts  # XP notifications
│   └── ui.ts            # Sidebar, modals
└── types/               # TypeScript types
```

## Motor EDN

`src/lib/edn/progression.ts` implementa:

- **5 modelos de progressão**: linear, volume, dupla progressão (reps), densidade, parada isométrica
- **Detecção de estagnação**: sem progressão por 2+ microciclos → recomendação automática
- **Protocolo de deload**: 10% carga (iniciante) ou 50% volume (inter/avançado)
- **Análise de fadiga**: score 0-100 com recomendações
- **Score de ranking**: 40% consistência + 30% progressão + 20% aderência + 10% participação

## Trocando o Provider de IA

```bash
# .env.local
AI_PROVIDER=openai    # ou gemini, anthropic
OPENAI_API_KEY=sk-...
```

O padrão é **Anthropic Claude 3.5 Haiku**. Qualquer troca mantém o mesmo System Prompt com a metodologia EDN.

## Deploy na Vercel

```bash
vercel --prod
```

Variáveis obrigatórias na Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY` (ou o provider que escolher)
- `AI_PROVIDER`
