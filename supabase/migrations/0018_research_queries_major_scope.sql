alter table research_queries
  add column major_id uuid references majors(id);
