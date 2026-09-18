create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table majors (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  slug text not null,
  name text not null,
  unique (course_id, slug)
);

alter table courses enable row level security;
alter table majors enable row level security;

create policy "courses_public_read" on courses for select using (true);
create policy "majors_public_read" on majors for select using (true);

insert into courses (slug, name) values
  ('beed', 'BEEd'),
  ('bsed', 'BSEd');

insert into majors (course_id, slug, name)
select c.id, m.slug, m.name
from courses c
cross join (
  values
    ('english', 'English'),
    ('mathematics', 'Mathematics'),
    ('filipino', 'Filipino'),
    ('biological-science', 'Biological Science'),
    ('physical-education', 'Physical Education'),
    ('social-studies', 'Social Studies')
) as m(slug, name)
where c.slug = 'bsed';

alter table profiles
  add column course_id uuid references courses(id),
  add column major_id uuid references majors(id);

create or replace function handle_new_user()
returns trigger as $$
declare
  v_course_id uuid;
  v_major_id uuid;
begin
  select id into v_course_id from public.courses
    where slug = new.raw_user_meta_data->>'course_slug';

  select id into v_major_id from public.majors
    where slug = new.raw_user_meta_data->>'major_slug'
      and course_id = v_course_id;

  insert into public.profiles (id, display_name, course_id, major_id)
  values (new.id, new.raw_user_meta_data->>'full_name', v_course_id, v_major_id);
  return new;
end;
$$ language plpgsql security definer;
