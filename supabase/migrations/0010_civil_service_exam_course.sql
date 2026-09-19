alter table subjects
  add column course_id uuid references courses(id);

insert into courses (slug, name) values
  ('civil-service-exam', 'Civil Service Exam');

insert into subjects (slug, name, sort_order, course_id)
select 'numerical-ability', 'Numerical Ability', 100, c.id from courses c where c.slug = 'civil-service-exam'
union all
select 'verbal-ability', 'Verbal Ability', 101, c.id from courses c where c.slug = 'civil-service-exam'
union all
select 'analytical-logical-reasoning', 'Analytical/Logical Reasoning', 102, c.id from courses c where c.slug = 'civil-service-exam'
union all
select 'clerical-ability', 'Clerical Ability', 103, c.id from courses c where c.slug = 'civil-service-exam'
union all
select 'general-information', 'General Information', 104, c.id from courses c where c.slug = 'civil-service-exam';

insert into topics (subject_id, slug, name, description)
select id, 'basic-arithmetic', 'Basic Arithmetic', 'No calculators allowed.' from subjects where slug = 'numerical-ability'
union all
select id, 'word-problems', 'Word Problems', null from subjects where slug = 'numerical-ability'
union all
select id, 'number-sequences', 'Number Sequences', null from subjects where slug = 'numerical-ability';

insert into topics (subject_id, slug, name, description)
select id, 'grammar', 'Grammar', null from subjects where slug = 'verbal-ability'
union all
select id, 'vocabulary', 'Vocabulary', null from subjects where slug = 'verbal-ability'
union all
select id, 'paragraph-organization', 'Paragraph Organization', null from subjects where slug = 'verbal-ability'
union all
select id, 'reading-comprehension-english', 'Reading Comprehension (English)', null from subjects where slug = 'verbal-ability'
union all
select id, 'reading-comprehension-filipino', 'Reading Comprehension (Filipino)', null from subjects where slug = 'verbal-ability';

insert into topics (subject_id, slug, name, description)
select id, 'word-analogies', 'Word Analogies', null from subjects where slug = 'analytical-logical-reasoning'
union all
select id, 'logical-reasoning', 'Logical Reasoning', null from subjects where slug = 'analytical-logical-reasoning'
union all
select id, 'data-interpretation', 'Data Interpretation', 'Professional level only.' from subjects where slug = 'analytical-logical-reasoning';

insert into topics (subject_id, slug, name, description)
select id, 'filing', 'Filing', 'Sub-Professional level only.' from subjects where slug = 'clerical-ability'
union all
select id, 'spelling', 'Spelling', 'Sub-Professional level only.' from subjects where slug = 'clerical-ability'
union all
select id, 'alphabetizing', 'Alphabetizing', 'Sub-Professional level only.' from subjects where slug = 'clerical-ability';

insert into topics (subject_id, slug, name, description)
select id, 'philippine-constitution', '1987 Philippine Constitution', null from subjects where slug = 'general-information'
union all
select id, 'ra-6713-code-of-conduct', 'RA 6713 (Code of Conduct)', null from subjects where slug = 'general-information'
union all
select id, 'current-events', 'Current Events', null from subjects where slug = 'general-information';
