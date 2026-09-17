create extension if not exists "pgcrypto";

create type license_status as enum (
  'OPEN_LICENSE',
  'PUBLIC_DOMAIN',
  'OPEN_ACCESS',
  'LICENSE_UNCLEAR',
  'COPYRIGHTED',
  'NOT_RECOMMENDED'
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create table subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (subject_id, slug)
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  source text,
  original_url text not null,
  description text,
  resource_type text not null,
  license text,
  license_status license_status not null,
  license_evidence text,
  content_location text,
  date_found timestamptz not null default now(),
  last_checked timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored
);

create index resources_search_vector_idx on resources using gin (search_vector);

create trigger resources_set_updated_at
  before update on resources
  for each row execute procedure set_updated_at();

create table resource_topics (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (resource_id, topic_id)
);

create table saved_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, resource_id)
);

create table research_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query_text text not null,
  topic_id uuid references topics(id),
  created_at timestamptz not null default now()
);

create table research_results (
  id uuid primary key default gen_random_uuid(),
  research_query_id uuid not null references research_queries(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid references resources(id),
  topic_id uuid references topics(id),
  score int,
  total_questions int,
  difficulty text,
  created_at timestamptz not null default now()
);

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_attempt_id uuid not null references quiz_attempts(id) on delete cascade,
  question_text text not null,
  choices jsonb not null,
  correct_answer text not null,
  explanation text,
  is_ai_generated boolean not null default true,
  created_at timestamptz not null default now()
);

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid references resources(id),
  title text,
  created_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table study_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid references resources(id),
  topic_id uuid references topics(id),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger study_notes_set_updated_at
  before update on study_notes
  for each row execute procedure set_updated_at();

alter table profiles enable row level security;
alter table subjects enable row level security;
alter table topics enable row level security;
alter table resources enable row level security;
alter table resource_topics enable row level security;
alter table saved_resources enable row level security;
alter table research_queries enable row level security;
alter table research_results enable row level security;
alter table quiz_attempts enable row level security;
alter table quiz_questions enable row level security;
alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;
alter table study_notes enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

create policy "subjects_public_read" on subjects for select using (true);
create policy "topics_public_read" on topics for select using (true);
create policy "resources_public_read" on resources for select using (true);
create policy "resource_topics_public_read" on resource_topics for select using (true);

create policy "saved_resources_owner_all" on saved_resources for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "research_queries_owner_all" on research_queries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "research_results_owner_all" on research_results for all
  using (
    exists (
      select 1 from research_queries rq
      where rq.id = research_results.research_query_id
      and rq.user_id = auth.uid()
    )
  );

create policy "quiz_attempts_owner_all" on quiz_attempts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "quiz_questions_owner_all" on quiz_questions for all
  using (
    exists (
      select 1 from quiz_attempts qa
      where qa.id = quiz_questions.quiz_attempt_id
      and qa.user_id = auth.uid()
    )
  );

create policy "ai_conversations_owner_all" on ai_conversations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "ai_messages_owner_all" on ai_messages for all
  using (
    exists (
      select 1 from ai_conversations c
      where c.id = ai_messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

create policy "study_notes_owner_all" on study_notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function search_resources(search_query text)
returns table (
  id uuid,
  title text,
  description text,
  source text,
  resource_type text,
  license_status license_status,
  original_url text,
  rank real
) as $$
  select
    r.id, r.title, r.description, r.source, r.resource_type,
    r.license_status, r.original_url,
    ts_rank(r.search_vector, websearch_to_tsquery('english', search_query)) as rank
  from resources r
  where r.search_vector @@ websearch_to_tsquery('english', search_query)
  and r.license_status not in ('COPYRIGHTED', 'NOT_RECOMMENDED')
  order by rank desc
  limit 25;
$$ language sql stable;
