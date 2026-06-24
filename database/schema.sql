-- ================================================
-- Treinador Jayme — Complete Database Schema
-- Run this in Supabase SQL Editor
-- ================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ================================================
-- ENUMS
-- ================================================

create type goal_type as enum ('hypertrophy', 'weight_loss', 'definition', 'strength');
create type experience_level as enum ('beginner', 'intermediate', 'advanced');
create type muscle_group as enum (
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'legs', 'glutes', 'abs', 'calves', 'forearms', 'full_body'
);
create type equipment_type as enum (
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'smith_machine', 'kettlebell', 'bands'
);
create type difficulty_level as enum ('beginner', 'intermediate', 'advanced');

-- ================================================
-- PROFILES
-- ================================================

create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null default '',
  avatar_url text,
  age int,
  weight_kg numeric(5,2),
  height_cm numeric(5,1),
  goal goal_type default 'hypertrophy',
  experience_level experience_level default 'beginner',
  weekly_frequency int default 3,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger to create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure update_updated_at();

-- ================================================
-- EXERCISES
-- ================================================

create table exercises (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  muscle_group muscle_group not null,
  equipment equipment_type not null default 'barbell',
  difficulty difficulty_level not null default 'intermediate',
  description text default '',
  tips text[] default '{}',
  common_errors text[] default '{}',
  muscles_worked text[] default '{}',
  youtube_url text,
  gif_url text,
  created_by uuid references profiles(id) on delete set null,
  is_public boolean default true,
  is_isometric boolean default false,
  created_at timestamptz default now()
);

-- ================================================
-- WORKOUT PLANS
-- ================================================

create table workout_plans (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  description text default '',
  days_per_week int not null default 3,
  goal text default 'hypertrophy',
  is_active boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger workout_plans_updated_at
  before update on workout_plans
  for each row execute procedure update_updated_at();

-- ================================================
-- WORKOUT DAYS
-- ================================================

create table workout_days (
  id uuid default uuid_generate_v4() primary key,
  plan_id uuid references workout_plans(id) on delete cascade not null,
  name text not null,
  day_of_week int, -- 0=Sunday, 1=Monday, ..., 6=Saturday, null=flexible
  order_index int not null default 0
);

-- ================================================
-- WORKOUT EXERCISES
-- ================================================

create table workout_exercises (
  id uuid default uuid_generate_v4() primary key,
  workout_day_id uuid references workout_days(id) on delete cascade not null,
  exercise_id uuid references exercises(id) on delete cascade not null,
  sets int not null default 3,
  reps_min int not null default 8,
  reps_max int not null default 12,
  rest_seconds int not null default 90,
  notes text default '',
  order_index int not null default 0
);

-- ================================================
-- WORKOUT SESSIONS
-- ================================================

create table workout_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  workout_day_id uuid references workout_days(id) on delete set null,
  plan_id uuid references workout_plans(id) on delete set null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  duration_seconds int,
  notes text default '',
  total_volume_kg numeric(10,2) default 0
  coach_feedback jsonb default '{}'::jsonb,
);

-- ================================================
-- SESSION SETS
-- ================================================

create table session_sets (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references workout_sessions(id) on delete cascade not null,
  workout_exercise_id uuid references workout_exercises(id) on delete set null,
  exercise_id uuid references exercises(id) on delete cascade not null,
  set_number int not null,
  reps_done int not null default 0,
  weight_kg numeric(6,2) not null default 0,
  completed boolean default false,
  notes text default ''
);

-- ================================================
-- BODY MEASUREMENTS
-- ================================================

create table body_measurements (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  date date not null default current_date,
  weight_kg numeric(5,2),
  body_fat_pct numeric(4,1),
  arm_cm numeric(4,1),
  chest_cm numeric(4,1),
  waist_cm numeric(4,1),
  thigh_cm numeric(4,1),
  calf_cm numeric(4,1),
  created_at timestamptz default now()
);

-- ================================================
-- ACHIEVEMENTS
-- ================================================

create table achievements (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  title text not null,
  description text not null,
  earned_at timestamptz default now(),
  icon text default 'trophy'
);

-- ================================================
-- AI CONVERSATIONS
-- ================================================

create table ai_conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  messages jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger ai_conversations_updated_at
  before update on ai_conversations
  for each row execute procedure update_updated_at();

-- ================================================
-- ROW LEVEL SECURITY
-- ================================================

alter table profiles enable row level security;
alter table exercises enable row level security;
alter table workout_plans enable row level security;
alter table workout_days enable row level security;
alter table workout_exercises enable row level security;
alter table workout_sessions enable row level security;
alter table session_sets enable row level security;
alter table body_measurements enable row level security;
alter table achievements enable row level security;
alter table ai_conversations enable row level security;

-- Profiles
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
-- Recursos sociais (Ranking, Feed, Equipes) precisam de nome/foto de outros usuários.
-- Dados sensíveis ficam em tabelas separadas (bioimpedance_data, body_weight_logs) com RLS própria.
create policy "Authenticated can view profiles" on profiles
  for select to authenticated using (true);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- Exercises: public exercises readable by all, users can create their own
create policy "Anyone can read public exercises" on exercises
  for select using (is_public = true or auth.uid() = created_by);
create policy "Authenticated users can insert exercises" on exercises
  for insert with check (auth.uid() = created_by or created_by is null);
create policy "Users can update own exercises" on exercises
  for update using (auth.uid() = created_by);
create policy "Users can delete own exercises" on exercises
  for delete using (auth.uid() = created_by);

-- Workout plans
create policy "Users can manage own workout plans" on workout_plans
  for all using (auth.uid() = user_id);

-- Workout days (owned via plan)
create policy "Users can manage own workout days" on workout_days
  for all using (
    exists (
      select 1 from workout_plans
      where workout_plans.id = workout_days.plan_id
      and workout_plans.user_id = auth.uid()
    )
  );

-- Workout exercises (owned via day -> plan)
create policy "Users can manage own workout exercises" on workout_exercises
  for all using (
    exists (
      select 1 from workout_days
      join workout_plans on workout_plans.id = workout_days.plan_id
      where workout_days.id = workout_exercises.workout_day_id
      and workout_plans.user_id = auth.uid()
    )
  );

-- Workout sessions
create policy "Users can manage own sessions" on workout_sessions
  for all using (auth.uid() = user_id);

-- Session sets
create policy "Users can manage own session sets" on session_sets
  for all using (
    exists (
      select 1 from workout_sessions
      where workout_sessions.id = session_sets.session_id
      and workout_sessions.user_id = auth.uid()
    )
  );

-- Body measurements
create policy "Users can manage own measurements" on body_measurements
  for all using (auth.uid() = user_id);

-- Achievements
create policy "Users can view own achievements" on achievements
  for select using (auth.uid() = user_id);
create policy "System can insert achievements" on achievements
  for insert with check (auth.uid() = user_id);

-- AI conversations
create policy "Users can manage own conversations" on ai_conversations
  for all using (auth.uid() = user_id);

-- ================================================
-- INDEXES
-- ================================================

create index idx_workout_plans_user_id on workout_plans(user_id);
create index idx_workout_days_plan_id on workout_days(plan_id);
create index idx_workout_exercises_day_id on workout_exercises(workout_day_id);
create index idx_workout_sessions_user_id on workout_sessions(user_id);
create index idx_workout_sessions_started_at on workout_sessions(started_at desc);
create index idx_session_sets_session_id on session_sets(session_id);
create index idx_body_measurements_user_date on body_measurements(user_id, date desc);
create index idx_achievements_user_id on achievements(user_id);
create index idx_exercises_muscle_group on exercises(muscle_group);

-- ================================================
-- PROGRESSIONS (EDN — histórico de progressão por exercício)
-- ================================================

create table progressions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  exercise_id uuid references exercises(id) on delete cascade not null,
  session_id uuid references workout_sessions(id) on delete set null,
  weight_kg numeric(6,2) not null,
  reps int not null,
  rir int not null default 2, -- Repetições em Recâmara
  set_type text not null default 'working', -- 'warmup' | 'feeder' | 'topset' | 'backoff'
  total_reps int generated always as (reps) stored,
  recorded_at timestamptz default now()
);

create index idx_progressions_user_exercise on progressions(user_id, exercise_id);
create index idx_progressions_recorded_at on progressions(recorded_at desc);

alter table progressions enable row level security;
create policy "Users can manage own progressions" on progressions
  for all using (auth.uid() = user_id);

-- ================================================
-- SESSION SETS — extend with set_type and RIR
-- ================================================

alter table session_sets add column if not exists set_type text default 'working';
alter table session_sets add column if not exists rir int default 2;

-- ================================================
-- DELOADS (EDN — histórico de deloads)
-- ================================================

create table deloads (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  start_date date not null default current_date,
  end_date date,
  reason text default 'stagnation', -- 'stagnation' | 'fatigue' | 'manual' | 'injury'
  load_reduction_pct int default 10, -- % de redução de carga para iniciantes
  volume_reduction_pct int default 50, -- % de redução de volume para intermediários/avançados
  notes text default '',
  is_active boolean default true,
  created_at timestamptz default now()
);

create index idx_deloads_user_id on deloads(user_id);

alter table deloads enable row level security;
create policy "Users can manage own deloads" on deloads
  for all using (auth.uid() = user_id);

-- ================================================
-- GAMIFICATION — XP & LEVELS
-- ================================================

create table user_xp (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null unique,
  xp_total int not null default 0,
  level int not null default 1,
  -- XP breakdown
  xp_from_workouts int default 0,
  xp_from_progression int default 0,
  xp_from_consistency int default 0,
  xp_from_challenges int default 0,
  updated_at timestamptz default now()
);

alter table user_xp enable row level security;
create policy "Users can view own xp" on user_xp
  for select using (auth.uid() = user_id);
create policy "Users can update own xp" on user_xp
  for update using (auth.uid() = user_id);
create policy "Users can insert own xp" on user_xp
  for insert with check (auth.uid() = user_id);

-- XP log
create table xp_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  xp_earned int not null,
  reason text not null,
  earned_at timestamptz default now()
);

create index idx_xp_logs_user_id on xp_logs(user_id);
alter table xp_logs enable row level security;
create policy "Users can view own xp logs" on xp_logs
  for select using (auth.uid() = user_id);
create policy "System can insert xp logs" on xp_logs
  for insert with check (auth.uid() = user_id);

-- ================================================
-- GAMIFICATION — ACHIEVEMENTS (global definitions)
-- ================================================

create table achievement_definitions (
  id text primary key, -- e.g. 'first_workout', 'mesocycle_complete'
  title text not null,
  description text not null,
  icon text not null default 'trophy',
  xp_reward int not null default 0,
  category text default 'general' -- 'consistency' | 'progression' | 'strength' | 'community'
);

-- Extend existing achievements table
alter table achievements add column if not exists achievement_def_id text references achievement_definitions(id) on delete set null;
alter table achievements add column if not exists xp_earned int default 0;

-- Insert achievement definitions
insert into achievement_definitions (id, title, description, icon, xp_reward, category) values
  ('first_workout',        'Primeiro Treino',           'Completou o primeiro treino da jornada',              '💪', 50,  'consistency'),
  ('streak_7',             'Semana Perfeita',            '7 dias consecutivos treinando',                      '🔥', 100, 'consistency'),
  ('streak_30',            'Mês de Ferro',               '30 dias consecutivos de treino',                     '🏆', 500, 'consistency'),
  ('first_mesocycle',      'Mesociclo Completo',         'Completou o primeiro mesociclo (8 semanas)',          '📅', 200, 'consistency'),
  ('sessions_10',          '10 Treinos',                 'Acumulou 10 sessões de treino',                      '🎯', 100, 'consistency'),
  ('sessions_50',          '50 Treinos',                 'Acumulou 50 sessões de treino',                      '⚡', 300, 'consistency'),
  ('sessions_100',         'Centurião',                  '100 sessões de treino completadas',                  '💯', 1000,'consistency'),
  ('progression_4weeks',   '4 Semanas de Progressão',   'Progrediu carga ou reps por 4 semanas consecutivas', '📈', 150, 'progression'),
  ('top_set_pr',           'Novo Personal Record',       'Atingiu um novo recorde pessoal no Top Set',         '🥇', 75,  'progression'),
  ('deload_done',          'Deload Estratégico',         'Completou um deload conforme recomendado',           '🔄', 50,  'progression'),
  ('volume_100k',          'Volume 100k',                'Acumulou 100.000 kg de volume total treinado',       '🏋️', 200,'progression'),
  ('first_challenge',      'Primeiro Desafio',           'Participou do primeiro desafio da comunidade',       '🎮', 50,  'community'),
  ('team_join',            'Em Equipe',                  'Entrou em uma equipe da comunidade EDN',             '🤝', 30,  'community'),
  ('challenge_win',        'Campeão',                    'Venceu um desafio de ranking',                       '🏆', 500, 'community'),
  ('ai_conversation_10',   'Consultor Regular',          'Teve 10 consultas com o Treinador Jayme IA',         '🤖', 75,  'general');

-- ================================================
-- LEADERBOARD
-- ================================================

create table leaderboard (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  -- Score breakdown (weights: 40% consistency, 30% progression, 20% adherence, 10% participation)
  score_total numeric(10,2) not null default 0,
  score_consistency numeric(10,2) default 0,
  score_progression numeric(10,2) default 0,
  score_adherence numeric(10,2) default 0,
  score_participation numeric(10,2) default 0,
  -- Period
  period_type text not null default 'weekly', -- 'weekly' | 'monthly' | 'all_time'
  period_start date not null,
  period_end date not null,
  rank_position int,
  workouts_count int default 0,
  total_volume_kg numeric(12,2) default 0,
  calculated_at timestamptz default now(),
  unique(user_id, period_type, period_start)
);

create index idx_leaderboard_period on leaderboard(period_type, period_start, score_total desc);
create index idx_leaderboard_user on leaderboard(user_id);

alter table leaderboard enable row level security;
create policy "Anyone can view leaderboard" on leaderboard
  for select using (true);
create policy "System can manage leaderboard" on leaderboard
  for all using (auth.uid() = user_id);

-- ================================================
-- TEAMS
-- ================================================

create table teams (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text default '',
  avatar_url text,
  created_by uuid references profiles(id) on delete set null,
  max_members int default 20,
  is_public boolean default true,
  invite_code text unique default substr(md5(random()::text), 1, 8),
  total_xp int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger teams_updated_at
  before update on teams
  for each row execute procedure update_updated_at();

alter table teams enable row level security;
create policy "Anyone can view public teams" on teams
  for select using (is_public = true or created_by = auth.uid() or
    exists(select 1 from team_members where team_members.team_id = id and team_members.user_id = auth.uid())
  );
create policy "Authenticated users can create teams" on teams
  for insert with check (auth.uid() = created_by);
create policy "Team creator can update" on teams
  for update using (auth.uid() = created_by);
create policy "Team creator can delete" on teams
  for delete using (auth.uid() = created_by);

-- ================================================
-- TEAM MEMBERS
-- ================================================

create table team_members (
  team_id uuid references teams(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text default 'member', -- 'owner' | 'admin' | 'member'
  joined_at timestamptz default now(),
  primary key (team_id, user_id)
);

create index idx_team_members_user on team_members(user_id);

alter table team_members enable row level security;
create policy "Team members can view membership" on team_members
  for select using (
    auth.uid() = user_id or
    exists(select 1 from team_members tm where tm.team_id = team_id and tm.user_id = auth.uid())
  );
create policy "Users can join teams" on team_members
  for insert with check (auth.uid() = user_id);
create policy "Users can leave teams" on team_members
  for delete using (auth.uid() = user_id);

-- ================================================
-- CHALLENGES
-- ================================================

create table challenges (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text not null,
  type text not null default 'consistency', -- 'consistency' | 'progression' | 'volume' | 'frequency'
  target_value numeric(10,2), -- e.g. 10 workouts, 1000kg volume
  target_unit text default 'workouts', -- 'workouts' | 'kg' | 'days'
  xp_reward int not null default 100,
  start_date date not null,
  end_date date not null,
  is_active boolean default true,
  team_id uuid references teams(id) on delete cascade, -- null = global challenge
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create index idx_challenges_active on challenges(is_active, end_date);

alter table challenges enable row level security;
create policy "Anyone can view challenges" on challenges
  for select using (true);
create policy "Authenticated can create challenges" on challenges
  for insert with check (auth.uid() = created_by);

-- ================================================
-- CHALLENGE PARTICIPANTS
-- ================================================

create table challenge_participants (
  challenge_id uuid references challenges(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  current_value numeric(10,2) default 0,
  completed boolean default false,
  completed_at timestamptz,
  joined_at timestamptz default now(),
  primary key (challenge_id, user_id)
);

alter table challenge_participants enable row level security;
create policy "Users can manage own challenge participation" on challenge_participants
  for all using (auth.uid() = user_id);
create policy "Anyone can view challenge leaderboard" on challenge_participants
  for select using (true);

-- ================================================
-- FUNCTION: Calculate Leaderboard Score (EDN Algorithm)
-- ================================================
-- Score = 40% consistency + 30% progression + 20% adherence + 10% participation

create or replace function calculate_leaderboard_score(
  p_user_id uuid,
  p_period_start date,
  p_period_end date
) returns numeric as $$
declare
  v_target_days int;
  v_actual_workouts int;
  v_consistency_score numeric;
  v_progression_score numeric;
  v_adherence_score numeric;
  v_participation_score numeric;
  v_weekly_freq int;
  v_total_score numeric;
  v_period_weeks numeric;
begin
  -- Get user's target weekly frequency
  select coalesce(weekly_frequency, 3) into v_weekly_freq
  from profiles where id = p_user_id;

  v_period_weeks := (p_period_end - p_period_start)::numeric / 7.0;
  v_target_days := round(v_weekly_freq * v_period_weeks);

  -- Count actual workouts in period
  select count(*) into v_actual_workouts
  from workout_sessions
  where user_id = p_user_id
    and started_at::date between p_period_start and p_period_end
    and finished_at is not null;

  -- CONSISTENCY (40%): actual vs target workouts, capped at 100
  v_consistency_score := least(100.0, (v_actual_workouts::numeric / greatest(v_target_days, 1)) * 100.0);

  -- PROGRESSION (30%): did load or reps increase in period?
  select count(*) into v_progression_score
  from (
    select exercise_id, max(weight_kg) - min(weight_kg) as load_gain
    from progressions
    where user_id = p_user_id
      and recorded_at::date between p_period_start and p_period_end
      and set_type = 'topset'
    group by exercise_id
    having max(weight_kg) > min(weight_kg)
  ) prog;
  v_progression_score := least(100.0, v_progression_score * 20.0); -- 5 exercises progressing = 100

  -- ADHERENCE (20%): completed sessions / started sessions
  declare
    v_started int;
    v_completed int;
  begin
    select count(*) into v_started from workout_sessions
    where user_id = p_user_id and started_at::date between p_period_start and p_period_end;
    select count(*) into v_completed from workout_sessions
    where user_id = p_user_id and started_at::date between p_period_start and p_period_end
      and finished_at is not null;
    v_adherence_score := case when v_started > 0 then (v_completed::numeric / v_started) * 100.0 else 0 end;
  end;

  -- PARTICIPATION (10%): challenge + team activity
  declare
    v_challenge_count int;
  begin
    select count(*) into v_challenge_count from challenge_participants
    where user_id = p_user_id
      and joined_at::date between p_period_start and p_period_end;
    v_participation_score := least(100.0, v_challenge_count * 25.0);
  end;

  v_total_score :=
    (v_consistency_score  * 0.40) +
    (v_progression_score  * 0.30) +
    (v_adherence_score    * 0.20) +
    (v_participation_score * 0.10);

  return round(v_total_score, 2);
end;
$$ language plpgsql security definer;

-- ================================================
-- FUNCTION: Award XP
-- ================================================

create or replace function award_xp(
  p_user_id uuid,
  p_xp int,
  p_reason text
) returns void as $$
begin
  -- Upsert user_xp
  insert into user_xp (user_id, xp_total)
  values (p_user_id, p_xp)
  on conflict (user_id) do update
    set xp_total = user_xp.xp_total + p_xp,
        level = greatest(1, floor(sqrt((user_xp.xp_total + p_xp) / 100.0))::int),
        updated_at = now();

  -- Log it
  insert into xp_logs (user_id, xp_earned, reason)
  values (p_user_id, p_xp, p_reason);
end;
$$ language plpgsql security definer;

-- ================================================
-- TRIGGER: Auto-award XP on workout completion
-- ================================================

create or replace function handle_session_complete()
returns trigger as $$
declare
  v_xp int;
  v_session_count int;
begin
  if new.finished_at is not null and old.finished_at is null then
    -- Base XP for completing a workout
    v_xp := 30;

    -- Bonus for duration
    if new.duration_seconds > 3600 then v_xp := v_xp + 10; end if;

    -- Count total sessions for milestones
    select count(*) into v_session_count
    from workout_sessions
    where user_id = new.user_id and finished_at is not null;

    perform award_xp(new.user_id, v_xp, 'Treino concluído');

    -- Milestone achievements
    if v_session_count = 1 then
      insert into achievements (user_id, type, title, description, icon, achievement_def_id, xp_earned)
      values (new.user_id, 'first_workout', 'Primeiro Treino', 'Completou o primeiro treino!', '💪', 'first_workout', 50)
      on conflict do nothing;
      perform award_xp(new.user_id, 50, 'Conquista: Primeiro Treino');
    end if;

    if v_session_count = 10 then
      insert into achievements (user_id, type, title, description, icon, achievement_def_id, xp_earned)
      values (new.user_id, 'sessions_10', '10 Treinos', 'Acumulou 10 sessões!', '🎯', 'sessions_10', 100)
      on conflict do nothing;
      perform award_xp(new.user_id, 100, 'Conquista: 10 Treinos');
    end if;

    if v_session_count = 50 then
      insert into achievements (user_id, type, title, description, icon, achievement_def_id, xp_earned)
      values (new.user_id, 'sessions_50', '50 Treinos', 'Acumulou 50 sessões!', '⚡', 'sessions_50', 300)
      on conflict do nothing;
      perform award_xp(new.user_id, 300, 'Conquista: 50 Treinos');
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_session_complete
  after update on workout_sessions
  for each row execute procedure handle_session_complete();

-- ================================================
-- ADDITIONAL INDEXES (Gamification)
-- ================================================

create index idx_team_members_team on team_members(team_id);
create index idx_challenge_participants_challenge on challenge_participants(challenge_id);
create index idx_achievements_user_type on achievements(user_id, type);

-- ================================================
-- SEED DATA — 20 Classic Exercises
-- ================================================

insert into exercises (name, muscle_group, equipment, difficulty, description, tips, common_errors, muscles_worked, youtube_url) values

('Supino Reto',
 'chest', 'barbell', 'intermediate',
 'Exercício multiarticular fundamental para desenvolvimento do peitoral. Realizado em banco plano com barra.',
 ARRAY['Mantenha os pés firmes no chão', 'Arquear levemente a lombar é normal', 'Escápulas retraídas e deprimidas durante todo o movimento', 'Desça até a barra tocar levemente no peitoral'],
 ARRAY['Levantamento dos glúteos do banco', 'Cotovelos muito abertos (90°)', 'Descida muito rápida sem controle', 'Não completar a amplitude completa'],
 ARRAY['Peitoral maior', 'Deltoide anterior', 'Tríceps'],
 'https://www.youtube.com/watch?v=rT7DgCr-3pg'),

('Supino Inclinado',
 'chest', 'barbell', 'intermediate',
 'Variação do supino com banco inclinado entre 30-45°, focando na porção clavicular do peitoral.',
 ARRAY['Inclinação ideal entre 30° e 45°', 'Barra desce em direção à parte superior do peitoral', 'Mantenha o controle na descida', 'Grip um pouco mais fechado que no supino reto'],
 ARRAY['Inclinação excessiva vira exercício de ombro', 'Deixar os ombros protruir na subida', 'Velocidade excessiva na fase excêntrica'],
 ARRAY['Peitoral clavicular', 'Deltoide anterior', 'Tríceps'],
 'https://www.youtube.com/watch?v=DbFgADa2PL8'),

('Desenvolvimento com Barra',
 'shoulders', 'barbell', 'intermediate',
 'Exercício multiarticular para desenvolvimento dos ombros. Pode ser realizado em pé ou sentado.',
 ARRAY['Glúteos contraídos para proteger a lombar', 'Barra sobe em linha reta ou levemente atrás da cabeça', 'Não hiperestenda o pescoço', 'Core ativado durante o movimento'],
 ARRAY['Hiperestensão lombar excessiva', 'Usar impulso das pernas', 'Amplitude incompleta na parte superior', 'Cotovelos muito à frente na posição inicial'],
 ARRAY['Deltoide anterior e médio', 'Trapézio superior', 'Tríceps', 'Serrátil'],
 'https://www.youtube.com/watch?v=2yjwXTZQDDI'),

('Agachamento',
 'legs', 'barbell', 'intermediate',
 'Rei dos exercícios compostos. Recruta quadríceps, glúteos e toda a cadeia posterior.',
 ARRAY['Pés na largura dos ombros ou levemente mais abertos', 'Joelhos seguem a direção dos pés', 'Desça até a paralela ou abaixo', 'Mantenha o tronco mais ereto possível'],
 ARRAY['Joelhos colapsando para dentro (valgo)', 'Calcanhar levantando do chão', 'Descida muito rápida', 'Não atingir a paralela'],
 ARRAY['Quadríceps', 'Glúteo máximo', 'Isquiotibiais', 'Eretores da espinha', 'Core'],
 'https://www.youtube.com/watch?v=ultWZbUMPL8'),

('Leg Press 45°',
 'legs', 'machine', 'beginner',
 'Exercício de push para membros inferiores realizado na máquina de leg press com angulação de 45°.',
 ARRAY['Posicionamento dos pés determina o músculo-alvo', 'Não trave os joelhos no topo do movimento', 'Desça até 90° ou um pouco além', 'Mantenha a lombar colada ao encosto'],
 ARRAY['Travar os joelhos na extensão', 'Amplitude muito curta', 'Levantar os glúteos do banco', 'Pés muito baixos sobrecarregam os joelhos'],
 ARRAY['Quadríceps', 'Glúteos', 'Isquiotibiais'],
 'https://www.youtube.com/watch?v=IZxyjW7MPJQ'),

('Cadeira Extensora',
 'legs', 'machine', 'beginner',
 'Exercício isolado para o quadríceps na máquina de extensão.',
 ARRAY['Extensão completa no topo', 'Controle absoluto na fase excêntrica (descida)', 'Não use impulso para subir', 'Ajuste o eixo da máquina com o eixo do joelho'],
 ARRAY['Usar impulso e balanço do corpo', 'Não completar a extensão', 'Descer muito rápido sem controle', 'Eixo desalinhado com o joelho'],
 ARRAY['Quadríceps (todos os 4 feixes)'],
 'https://www.youtube.com/watch?v=YyvSfVjQeL0'),

('Cadeira Flexora',
 'legs', 'machine', 'beginner',
 'Exercício isolado para os isquiotibiais na máquina de flexão de joelhos.',
 ARRAY['Quadril levemente em flexão para maior recrutamento', 'Controle na fase excêntrica', 'Amplitude completa', 'Evite levantar os quadris do banco'],
 ARRAY['Quadris saindo do banco', 'Velocidade excessiva na descida', 'Amplitude incompleta', 'Tensão no pescoço'],
 ARRAY['Isquiotibiais', 'Gastrocnêmio (assistência)'],
 'https://www.youtube.com/watch?v=1Tq3QdYUuHs'),

('Stiff (Levantamento Terra Romeno)',
 'legs', 'barbell', 'intermediate',
 'Exercício de hip hinge focado nos isquiotibiais e glúteos. Difere do terra convencional por manter os joelhos semi-estendidos.',
 ARRAY['Hip hinge: empurre o quadril para trás', 'Costas retas durante todo o movimento', 'Barra próxima ao corpo (quase raspando as pernas)', 'Sinta o alongamento dos isquiotibiais'],
 ARRAY['Curvar as costas', 'Joelhos completamente estendidos (tensão excessiva)', 'Barra afastada do corpo', 'Não sentir o alongamento dos isquiotibiais'],
 ARRAY['Isquiotibiais', 'Glúteo máximo', 'Eretores da espinha'],
 'https://www.youtube.com/watch?v=1uDiW5--rAE'),

('Levantamento Terra',
 'back', 'barbell', 'advanced',
 'Um dos exercícios mais completos da musculação. Recruta praticamente todos os músculos do corpo com foco em costas e pernas.',
 ARRAY['Posição inicial: barra sobre o mediopé', 'Escápulas sobre a barra antes de puxar', 'Empurre o chão, não puxe a barra', 'Mantenha o core fortemente contraído'],
 ARRAY['Curvar as costas (especialmente lombar)', 'Barra afastada do corpo', 'Joelhos colapsando', 'Não travar o quadril no topo'],
 ARRAY['Eretores da espinha', 'Glúteos', 'Isquiotibiais', 'Quadríceps', 'Trapézio', 'Latíssimo'],
 'https://www.youtube.com/watch?v=op9kVnSso6Q'),

('Puxada Frontal',
 'back', 'cable', 'beginner',
 'Exercício para latíssimo do dorso na polia alta. Ótima alternativa ou complemento à barra fixa.',
 ARRAY['Incline levemente o tronco para trás', 'Inicie o movimento deprimindo as escápulas', 'Puxe em direção à clavícula', 'Controle total na fase excêntrica'],
 ARRAY['Usar impulso do corpo', 'Puxar muito para baixo (além da clavícula)', 'Não deprimir as escápulas no início', 'Deixar as escápulas subirem na excêntrica'],
 ARRAY['Latíssimo do dorso', 'Romboides', 'Bíceps', 'Redondo maior'],
 'https://www.youtube.com/watch?v=CAwf7n6Luuc'),

('Remada Curvada',
 'back', 'barbell', 'intermediate',
 'Exercício fundamental para espessura das costas. Realizado com o tronco inclinado a ~45°.',
 ARRAY['Tronco inclinado entre 45° e paralelo ao chão', 'Puxe em direção ao umbigo (feixe inferior) ou ao esterno (feixe superior)', 'Escápulas retraem no topo', 'Controle na descida'],
 ARRAY['Ficar muito ereto (vira desenvolvimento de trapézio)', 'Usar impulso do corpo para subir o peso', 'Não retrair as escápulas', 'Curvar a lombar'],
 ARRAY['Latíssimo do dorso', 'Romboides', 'Trapézio', 'Bíceps', 'Eretores'],
 'https://www.youtube.com/watch?v=FWJR5Ve8bnQ'),

('Rosca Direta',
 'biceps', 'barbell', 'beginner',
 'Exercício clássico de isolamento para os bíceps com barra.',
 ARRAY['Cotovelos fixos ao lado do corpo', 'Supinação completa no topo', 'Controle absoluto na excêntrica', 'Não balance o corpo para ajudar'],
 ARRAY['Jogar o corpo para trás (kipping)', 'Cotovelos saindo para frente na subida', 'Descer muito rápido', 'Pulso em extensão forçada'],
 ARRAY['Bíceps braquial', 'Braquial', 'Braquiorradial'],
 'https://www.youtube.com/watch?v=kwG2ipFRgfo'),

('Rosca Scott',
 'biceps', 'machine', 'beginner',
 'Exercício de isolamento para bíceps com suporte no banco Scott. Elimina o uso de impulso.',
 ARRAY['Axila apoiada no topo do banco', 'Amplitude completa — estenda totalmente no fundo', 'Supine o punho no topo', 'Mantenha o controle em toda a amplitude'],
 ARRAY['Amplitude incompleta no fundo', 'Levantar os ombros do banco', 'Velocidade excessiva', 'Pulso dobrado'],
 ARRAY['Bíceps braquial (cabeça longa)', 'Braquial'],
 'https://www.youtube.com/watch?v=fIWP-FRFNU0'),

('Tríceps Testa',
 'triceps', 'barbell', 'intermediate',
 'Exercício de isolamento para os tríceps realizado em banco com barra. Foco na cabeça longa do tríceps.',
 ARRAY['Cotovelos apontados para cima e fixos', 'Desça até a barra tocar levemente a testa ou logo atrás', 'Extensão completa no topo', 'Controle absoluto na fase excêntrica'],
 ARRAY['Cotovelos abrindo para os lados', 'Usar os ombros para ajudar', 'Velocidade excessiva', 'Amplitude incompleta'],
 ARRAY['Tríceps (cabeça longa e medial)'],
 'https://www.youtube.com/watch?v=d_KZxkY_0cM'),

('Tríceps Corda',
 'triceps', 'cable', 'beginner',
 'Exercício de isolamento para tríceps na polia alta com corda. Permite extensão completa.',
 ARRAY['Cotovelos fixos ao lado do corpo', 'Abra as pontas da corda no final da extensão', 'Controle na subida', 'Tronco levemente inclinado para frente'],
 ARRAY['Cotovelos saindo para frente ou para os lados', 'Usar o corpo para puxar', 'Não abrir a corda na extensão', 'Amplitude incompleta'],
 ARRAY['Tríceps (cabeça lateral e medial)'],
 'https://www.youtube.com/watch?v=vB5OHsJ3EME'),

('Desenvolvimento Arnold',
 'shoulders', 'dumbbell', 'intermediate',
 'Variação do desenvolvimento com halteres que inclui rotação, recrutando mais feixes do deltoide.',
 ARRAY['Inicie com as palmas voltadas para você', 'Gire os punhos durante a subida', 'Extensão completa mas não trave os cotovelos', 'Mantenha o core estável'],
 ARRAY['Usar impulso das pernas', 'Não completar a rotação', 'Amplitude incompleta', 'Jogar a cabeça para trás'],
 ARRAY['Deltoide anterior, médio e posterior', 'Trapézio', 'Tríceps'],
 'https://www.youtube.com/watch?v=6Z15_WdXmVw'),

('Elevação Lateral',
 'shoulders', 'dumbbell', 'beginner',
 'Exercício de isolamento para o deltoide médio. Fundamental para criar largura nos ombros.',
 ARRAY['Cotovelos levemente flexionados durante todo o movimento', 'Eleve até a altura dos ombros', 'Leve o polegar levemente para baixo (pronação parcial)', 'Controle absoluto na descida'],
 ARRAY['Usar impulso e balanço do corpo', 'Subir acima dos ombros', 'Cotovelos completamente estendidos', 'Velocidade excessiva na descida'],
 ARRAY['Deltoide médio', 'Supra-espinhal', 'Trapézio (assistência)'],
 'https://www.youtube.com/watch?v=3VcKaXpzqRo'),

('Crucifixo',
 'chest', 'dumbbell', 'intermediate',
 'Exercício de isolamento para o peitoral com halteres. Permite maior amplitude que o supino.',
 ARRAY['Cotovelos levemente flexionados durante todo o movimento', 'Amplitude controlada — não desça além do que o ombro permite', 'Contração no topo do movimento', 'Movimento em arco como abraçar uma árvore'],
 ARRAY['Cotovelos completamente estendidos (tensão no bíceps)', 'Amplitude excessiva que causa impingimento', 'Transformar em supino (dobrar os cotovelos demais)', 'Velocidade excessiva'],
 ARRAY['Peitoral maior', 'Deltoide anterior (assistência)'],
 'https://www.youtube.com/watch?v=eozdVDA78K0'),

('Abdominal Crunch',
 'abs', 'bodyweight', 'beginner',
 'Exercício de isolamento para os abdominais. Foco na flexão da coluna vertebral.',
 ARRAY['Foque na flexão da coluna, não em levantar o tronco inteiro', 'Expire na contração', 'Controle na descida (não bata no chão)', 'Queixo neutro — não force o pescoço'],
 ARRAY['Puxar o pescoço com as mãos', 'Amplitude excessiva transformando em sit-up', 'Não contrair o abdome', 'Ir muito rápido sem sentir o músculo'],
 ARRAY['Reto abdominal', 'Oblíquos (assistência)'],
 'https://www.youtube.com/watch?v=Xyd_fa5zoEU'),

('Panturrilha em Pé',
 'calves', 'machine', 'beginner',
 'Exercício de isolamento para as panturrilhas na máquina específica ou no Smith.',
 ARRAY['Amplitude completa — calcanhar desce bem abaixo da plataforma', 'Contração de 1-2 segundos no topo', 'Controle total na fase excêntrica', 'Dedos apontados para frente'],
 ARRAY['Amplitude muito curta (movimento de "borboleta")', 'Não fazer a contração no topo', 'Velocidade excessiva', 'Joelhos dobrados (muda o músculo recrutado)'],
 ARRAY['Gastrocnêmio', 'Sóleo (assistência)'],
 'https://www.youtube.com/watch?v=-M4-G8p1fCI');

-- ================================================
-- LEADERBOARD POPULATION (V6.6)
-- Popula a tabela leaderboard a partir dos treinos reais.
-- Antes desta versão nada escrevia em `leaderboard`, então a aba Ranking
-- ficava sempre vazia. refresh_user_leaderboard calcula o breakdown
-- (consistência/progressão/aderência/participação) e faz upsert; o trigger
-- de conclusão de treino e a página de Ranking (RPC) mantêm os dados frescos.
-- ================================================
create or replace function refresh_user_leaderboard(
  p_user_id uuid, p_period_type text, p_period_start date, p_period_end date
) returns void as $$
declare
  v_weekly_freq int;
  v_period_weeks numeric;
  v_target_days int;
  v_actual int;
  v_started int;
  v_consistency numeric;
  v_progression numeric;
  v_adherence numeric;
  v_participation numeric;
  v_total numeric;
  v_volume numeric;
  v_challenge int;
begin
  select coalesce(weekly_frequency, 3) into v_weekly_freq from profiles where id = p_user_id;
  v_period_weeks := greatest((p_period_end - p_period_start)::numeric / 7.0, 1.0 / 7.0);
  v_target_days  := greatest(round(v_weekly_freq * v_period_weeks), 1);

  select count(*) into v_actual from workout_sessions
   where user_id = p_user_id and started_at::date between p_period_start and p_period_end and finished_at is not null;
  select count(*) into v_started from workout_sessions
   where user_id = p_user_id and started_at::date between p_period_start and p_period_end;

  if v_started = 0 and v_actual = 0 then
    delete from leaderboard where user_id = p_user_id and period_type = p_period_type and period_start = p_period_start;
    return;
  end if;

  v_consistency := least(100.0, (v_actual::numeric / v_target_days) * 100.0);

  select count(*) into v_progression from (
    select exercise_id from progressions
     where user_id = p_user_id and recorded_at::date between p_period_start and p_period_end and set_type = 'topset'
     group by exercise_id having max(weight_kg) > min(weight_kg)
  ) prog;
  v_progression := least(100.0, v_progression * 20.0);

  v_adherence := case when v_started > 0 then (v_actual::numeric / v_started) * 100.0 else 0 end;

  select count(*) into v_challenge from challenge_participants
   where user_id = p_user_id and joined_at::date between p_period_start and p_period_end;
  v_participation := least(100.0, v_challenge * 25.0);

  v_total := round(v_consistency * 0.40 + v_progression * 0.30 + v_adherence * 0.20 + v_participation * 0.10, 2);

  select coalesce(sum(total_volume_kg), 0) into v_volume from workout_sessions
   where user_id = p_user_id and started_at::date between p_period_start and p_period_end and finished_at is not null;

  insert into leaderboard (
    user_id, score_total, score_consistency, score_progression, score_adherence, score_participation,
    period_type, period_start, period_end, rank_position, workouts_count, total_volume_kg, calculated_at
  ) values (
    p_user_id, v_total, round(v_consistency,2), round(v_progression,2), round(v_adherence,2), round(v_participation,2),
    p_period_type, p_period_start, p_period_end, null, v_actual, v_volume, now()
  )
  on conflict (user_id, period_type, period_start) do update set
    score_total=excluded.score_total, score_consistency=excluded.score_consistency,
    score_progression=excluded.score_progression, score_adherence=excluded.score_adherence,
    score_participation=excluded.score_participation, period_end=excluded.period_end,
    workouts_count=excluded.workouts_count, total_volume_kg=excluded.total_volume_kg, calculated_at=now();
end;
$$ language plpgsql security definer;

create or replace function refresh_leaderboards_now() returns void as $$
declare
  w_start date := date_trunc('week',  current_date)::date;
  w_end   date := date_trunc('week',  current_date)::date + 6;
  m_start date := date_trunc('month', current_date)::date;
  m_end   date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  r record;
begin
  for r in select id from profiles loop
    perform refresh_user_leaderboard(r.id, 'weekly',  w_start, w_end);
    perform refresh_user_leaderboard(r.id, 'monthly', m_start, m_end);
  end loop;
end;
$$ language plpgsql security definer;

grant execute on function refresh_leaderboards_now() to anon, authenticated;
grant execute on function refresh_user_leaderboard(uuid, text, date, date) to anon, authenticated;

-- ── V7.2: Histórico de decisões nutricionais da IA ──────────────────────────
create table if not exists public.nutrition_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decided_at timestamptz not null default now(),
  source text not null default 'coach_ia',
  reason text,
  change_applied text not null,
  from_goal text,
  to_goal text,
  result text,
  created_at timestamptz not null default now()
);
alter table public.nutrition_decisions enable row level security;
drop policy if exists "Users manage own nutrition decisions" on public.nutrition_decisions;
create policy "Users manage own nutrition decisions" on public.nutrition_decisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_nutrition_decisions_user on public.nutrition_decisions(user_id, decided_at desc);

-- ── V7.2: Prova futura (ativa o modo endurance da nutrição) ─────────────────
alter table public.profiles add column if not exists target_race_date date;
alter table public.profiles add column if not exists target_race_name text;

-- ── V8.0: Modalidade esportiva (ativa o especialista nutricional) ───────────
alter table public.profiles add column if not exists athlete_sport text;
