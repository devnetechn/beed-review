alter table research_queries
  add column course_id uuid references courses(id);
