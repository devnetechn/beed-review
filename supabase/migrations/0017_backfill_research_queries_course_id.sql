update research_queries
set course_id = (select id from courses where slug = 'beed')
where course_id is null;
