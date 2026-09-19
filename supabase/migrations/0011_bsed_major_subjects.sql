-- BEEd's originally-seeded subjects had no course_id, so they were visible to
-- every course (BSEd, Civil Service Exam). Scope them to BEEd only.
update subjects
set course_id = (select id from courses where slug = 'beed')
where course_id is null;

-- BSEd majors never had their own subjects, so a BSEd major's content was
-- effectively identical to BEEd's. Give each major its own subjects.
insert into subjects (slug, name, sort_order, course_id, major_id)
select v.slug, v.name, v.sort_order, c.id, m.id
from courses c
join majors m on m.course_id = c.id
cross join (values
  ('english', 'structure-of-english', 'Structure of English', 200),
  ('english', 'literature-in-english', 'Literature in English', 201),
  ('english', 'language-teaching-and-assessment', 'Language Teaching and Assessment', 202),
  ('mathematics', 'algebra-and-number-theory', 'Algebra and Number Theory', 203),
  ('mathematics', 'geometry-and-trigonometry', 'Geometry and Trigonometry', 204),
  ('mathematics', 'calculus-and-statistics', 'Calculus and Statistics', 205),
  ('filipino', 'panitikang-filipino', 'Panitikang Filipino', 206),
  ('filipino', 'wikang-filipino', 'Wikang Filipino', 207),
  ('filipino', 'pagtuturo-ng-filipino', 'Pagtuturo ng Filipino', 208),
  ('biological-science', 'cell-and-molecular-biology', 'Cell and Molecular Biology', 209),
  ('biological-science', 'organismal-biology', 'Organismal Biology', 210),
  ('biological-science', 'ecology-and-environmental-science', 'Ecology and Environmental Science', 211),
  ('physical-education', 'foundations-of-physical-education', 'Foundations of Physical Education', 212),
  ('physical-education', 'sports-and-movement', 'Sports and Movement', 213),
  ('physical-education', 'pe-teaching-and-assessment', 'PE Teaching and Assessment', 214),
  ('social-studies', 'philippine-history-and-government', 'Philippine History and Government', 215),
  ('social-studies', 'world-history-and-geography', 'World History and Geography', 216),
  ('social-studies', 'social-studies-teaching', 'Social Studies Teaching', 217)
) as v(major_slug, slug, name, sort_order)
where c.slug = 'bsed' and m.slug = v.major_slug;

-- English
insert into topics (subject_id, slug, name)
select id, 'grammar-and-syntax', 'Grammar and Syntax' from subjects where slug = 'structure-of-english'
union all
select id, 'phonology-and-morphology', 'Phonology and Morphology' from subjects where slug = 'structure-of-english'
union all
select id, 'semantics-and-pragmatics', 'Semantics and Pragmatics' from subjects where slug = 'structure-of-english';

insert into topics (subject_id, slug, name)
select id, 'philippine-literature', 'Philippine Literature' from subjects where slug = 'literature-in-english'
union all
select id, 'afro-asian-literature', 'Afro-Asian Literature' from subjects where slug = 'literature-in-english'
union all
select id, 'english-and-american-literature', 'English and American Literature' from subjects where slug = 'literature-in-english';

insert into topics (subject_id, slug, name)
select id, 'teaching-approaches-and-strategies', 'Teaching Approaches and Strategies' from subjects where slug = 'language-teaching-and-assessment'
union all
select id, 'literary-criticism', 'Literary Criticism' from subjects where slug = 'language-teaching-and-assessment'
union all
select id, 'assessment-of-language-and-literature', 'Assessment of Language and Literature' from subjects where slug = 'language-teaching-and-assessment';

-- Mathematics
insert into topics (subject_id, slug, name)
select id, 'elementary-algebra', 'Elementary Algebra' from subjects where slug = 'algebra-and-number-theory'
union all
select id, 'advanced-algebra', 'Advanced Algebra' from subjects where slug = 'algebra-and-number-theory'
union all
select id, 'number-theory', 'Number Theory' from subjects where slug = 'algebra-and-number-theory';

insert into topics (subject_id, slug, name)
select id, 'plane-and-solid-geometry', 'Plane and Solid Geometry' from subjects where slug = 'geometry-and-trigonometry'
union all
select id, 'trigonometry', 'Trigonometry' from subjects where slug = 'geometry-and-trigonometry'
union all
select id, 'analytic-geometry', 'Analytic Geometry' from subjects where slug = 'geometry-and-trigonometry';

insert into topics (subject_id, slug, name)
select id, 'differential-calculus', 'Differential Calculus' from subjects where slug = 'calculus-and-statistics'
union all
select id, 'integral-calculus', 'Integral Calculus' from subjects where slug = 'calculus-and-statistics'
union all
select id, 'probability-and-statistics', 'Probability and Statistics' from subjects where slug = 'calculus-and-statistics';

-- Filipino
insert into topics (subject_id, slug, name)
select id, 'panitikang-pambata', 'Panitikang Pambata' from subjects where slug = 'panitikang-filipino'
union all
select id, 'panitikang-popular', 'Panitikang Popular' from subjects where slug = 'panitikang-filipino'
union all
select id, 'kritisismong-pampanitikan', 'Kritisismong Pampanitikan' from subjects where slug = 'panitikang-filipino';

insert into topics (subject_id, slug, name)
select id, 'balarilang-filipino', 'Balarilang Filipino' from subjects where slug = 'wikang-filipino'
union all
select id, 'sosyolingguwistika', 'Sosyolingguwistika' from subjects where slug = 'wikang-filipino'
union all
select id, 'estilistika', 'Estilistika' from subjects where slug = 'wikang-filipino';

insert into topics (subject_id, slug, name)
select id, 'pamamaraan-sa-pagtuturo', 'Pamamaraan sa Pagtuturo' from subjects where slug = 'pagtuturo-ng-filipino'
union all
select id, 'pagtataya-sa-wika-at-panitikan', 'Pagtataya sa Wika at Panitikan' from subjects where slug = 'pagtuturo-ng-filipino'
union all
select id, 'kurikulum-ng-filipino', 'Kurikulum ng Filipino' from subjects where slug = 'pagtuturo-ng-filipino';

-- Biological Science
insert into topics (subject_id, slug, name)
select id, 'cell-structure-and-function', 'Cell Structure and Function' from subjects where slug = 'cell-and-molecular-biology'
union all
select id, 'genetics', 'Genetics' from subjects where slug = 'cell-and-molecular-biology'
union all
select id, 'biochemistry', 'Biochemistry' from subjects where slug = 'cell-and-molecular-biology';

insert into topics (subject_id, slug, name)
select id, 'botany', 'Botany' from subjects where slug = 'organismal-biology'
union all
select id, 'zoology', 'Zoology' from subjects where slug = 'organismal-biology'
union all
select id, 'microbiology', 'Microbiology' from subjects where slug = 'organismal-biology';

insert into topics (subject_id, slug, name)
select id, 'ecosystems', 'Ecosystems' from subjects where slug = 'ecology-and-environmental-science'
union all
select id, 'biodiversity', 'Biodiversity' from subjects where slug = 'ecology-and-environmental-science'
union all
select id, 'conservation-biology', 'Conservation Biology' from subjects where slug = 'ecology-and-environmental-science';

-- Physical Education
insert into topics (subject_id, slug, name)
select id, 'history-and-philosophy-of-pe', 'History and Philosophy of PE' from subjects where slug = 'foundations-of-physical-education'
union all
select id, 'kinesiology', 'Kinesiology' from subjects where slug = 'foundations-of-physical-education'
union all
select id, 'exercise-physiology', 'Exercise Physiology' from subjects where slug = 'foundations-of-physical-education';

insert into topics (subject_id, slug, name)
select id, 'individual-and-dual-sports', 'Individual and Dual Sports' from subjects where slug = 'sports-and-movement'
union all
select id, 'team-sports', 'Team Sports' from subjects where slug = 'sports-and-movement'
union all
select id, 'rhythmic-activities-and-dance', 'Rhythmic Activities and Dance' from subjects where slug = 'sports-and-movement';

insert into topics (subject_id, slug, name)
select id, 'curriculum-and-program-development', 'Curriculum and Program Development' from subjects where slug = 'pe-teaching-and-assessment'
union all
select id, 'fitness-testing-and-assessment', 'Fitness Testing and Assessment' from subjects where slug = 'pe-teaching-and-assessment'
union all
select id, 'health-education', 'Health Education' from subjects where slug = 'pe-teaching-and-assessment';

-- Social Studies
insert into topics (subject_id, slug, name)
select id, 'philippine-history', 'Philippine History' from subjects where slug = 'philippine-history-and-government'
union all
select id, 'philippine-government-and-constitution', 'Philippine Government and Constitution' from subjects where slug = 'philippine-history-and-government'
union all
select id, 'local-governance', 'Local Governance' from subjects where slug = 'philippine-history-and-government';

insert into topics (subject_id, slug, name)
select id, 'world-civilizations', 'World Civilizations' from subjects where slug = 'world-history-and-geography'
union all
select id, 'geography-and-economics', 'Geography and Economics' from subjects where slug = 'world-history-and-geography'
union all
select id, 'global-issues', 'Global Issues' from subjects where slug = 'world-history-and-geography';

insert into topics (subject_id, slug, name)
select id, 'teaching-strategies-for-social-studies', 'Teaching Strategies for Social Studies' from subjects where slug = 'social-studies-teaching'
union all
select id, 'values-education', 'Values Education' from subjects where slug = 'social-studies-teaching'
union all
select id, 'assessment-in-social-studies', 'Assessment in Social Studies' from subjects where slug = 'social-studies-teaching';
