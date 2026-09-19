alter table profiles
  add column is_admin boolean not null default false;

update profiles
set is_admin = true
where id = (select id from auth.users where email = 'yatamakura12@gmail.com');

drop policy "feedback_select_owner" on feedback;

create policy "feedback_select_admin" on feedback for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );
