alter table profiles
  add column points int not null default 0,
  add column current_streak int not null default 0,
  add column longest_streak int not null default 0,
  add column last_activity_date date;

create table user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

alter table user_badges enable row level security;

create policy "user_badges_owner_all" on user_badges for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
