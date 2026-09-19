create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

create policy "feedback_insert_own" on feedback for insert
  with check (auth.uid() = user_id);

create policy "feedback_select_owner" on feedback for select
  using (auth.email() = 'yatamakura12@gmail.com');
