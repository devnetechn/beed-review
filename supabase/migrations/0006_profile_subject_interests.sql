alter table profiles
  add column subject_interests_prompted boolean not null default false;

create table profile_subject_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, subject_id)
);

alter table profile_subject_interests enable row level security;

create policy "profile_subject_interests_owner_all" on profile_subject_interests for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
