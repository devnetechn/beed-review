-- Google sign-in never sends course_slug/major_slug (it skips the
-- course-picker form entirely), and any pre-existing profile predates the
-- course capture feature. Both ended up with course_id = null, which used
-- to mean "no restriction" but now matches none of the course-scoped
-- subjects, leaving those users with an empty subject/quiz list.
update profiles
set course_id = (select id from courses where slug = 'beed')
where course_id is null;

-- Default new signups that don't provide a course_slug (Google OAuth) to
-- BEEd too, so this doesn't recur.
create or replace function handle_new_user()
returns trigger as $$
declare
  v_course_id uuid;
  v_major_id uuid;
begin
  select id into v_course_id from public.courses
    where slug = coalesce(new.raw_user_meta_data->>'course_slug', 'beed');

  select id into v_major_id from public.majors
    where slug = new.raw_user_meta_data->>'major_slug'
      and course_id = v_course_id;

  insert into public.profiles (id, display_name, course_id, major_id)
  values (new.id, new.raw_user_meta_data->>'full_name', v_course_id, v_major_id);

  insert into public.profile_subject_interests (user_id, subject_id)
  select new.id, s.id
  from public.subjects s
  where s.slug in (
    select jsonb_array_elements_text(
      coalesce(new.raw_user_meta_data->'subject_interest_slugs', '[]'::jsonb)
    )
  );

  return new;
end;
$$ language plpgsql security definer;
