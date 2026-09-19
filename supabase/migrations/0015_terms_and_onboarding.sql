alter table profiles
  add column terms_accepted_at timestamptz;

-- Existing users never had a Terms and Conditions to agree to; grandfather
-- them in rather than gate them on the next visit.
update profiles
set terms_accepted_at = now()
where terms_accepted_at is null;

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

  insert into public.profiles (id, display_name, course_id, major_id, terms_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    v_course_id,
    v_major_id,
    case
      when new.raw_user_meta_data->>'terms_accepted' = 'true' then now()
      else null
    end
  );

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
