alter table subjects
  add column major_id uuid references majors(id);
