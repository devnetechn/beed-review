alter table quiz_attempts
  add column subject_id uuid references subjects(id);
