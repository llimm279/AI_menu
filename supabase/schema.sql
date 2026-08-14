-- Supabase SQL Editor에서 한 번 실행하세요.
-- 공개 클라이언트에는 INSERT만 허용하고 조회/수정/삭제 권한은 주지 않습니다.

create table if not exists public.recommendation_sessions (
  session_id uuid primary key,
  created_at timestamptz not null default now(),
  started_at timestamptz not null,
  recommendation_version text not null,
  meal_period text not null check (meal_period in ('breakfast', 'lunch', 'dinner', 'late_night')),
  answers jsonb not null,
  recommendation_history jsonb not null,
  first_recommended_menu text not null,
  selected_menu text not null,
  accepted_first_recommendation boolean not null,
  re_recommend_count integer not null check (re_recommend_count >= 0 and re_recommend_count <= 100),
  feedback text not null check (feedback in ('like', 'dislike')),
  feedback_reason text check (
    feedback_reason is null or feedback_reason in (
      'not_craving',
      'budget_mismatch',
      'portion_mismatch',
      'recently_ate',
      'dietary_restriction',
      'other'
    )
  ),
  completed boolean not null default true
);

create table if not exists public.recommendation_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.recommendation_sessions(session_id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null check (
    event_type in (
      'location_confirmed',
      'restaurant_search_started',
      'restaurant_results_viewed',
      'restaurant_clicked'
    )
  ),
  event_data jsonb not null default '{}'::jsonb
);

alter table public.recommendation_sessions enable row level security;
alter table public.recommendation_events enable row level security;

revoke all on public.recommendation_sessions from anon, authenticated;
revoke all on public.recommendation_events from anon, authenticated;
grant insert on public.recommendation_sessions to anon, authenticated;
grant insert on public.recommendation_events to anon, authenticated;
grant usage on sequence public.recommendation_events_id_seq to anon, authenticated;

drop policy if exists "Allow validated session inserts" on public.recommendation_sessions;
create policy "Allow validated session inserts"
on public.recommendation_sessions
for insert
to anon, authenticated
with check (
  jsonb_typeof(answers) = 'object'
  and jsonb_typeof(recommendation_history) = 'array'
  and length(first_recommended_menu) between 1 and 50
  and length(selected_menu) between 1 and 50
  and recommendation_version = 'v1'
  and completed = true
);

drop policy if exists "Allow session event inserts" on public.recommendation_events;
create policy "Allow session event inserts"
on public.recommendation_events
for insert
to anon, authenticated
with check (
  jsonb_typeof(event_data) = 'object'
);
