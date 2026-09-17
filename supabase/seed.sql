insert into subjects (slug, name, sort_order) values
  ('assessment-of-learning', 'Assessment of Learning', 1),
  ('child-and-adolescent-development', 'Child and Adolescent Development', 2),
  ('principles-of-teaching', 'Principles of Teaching', 3),
  ('curriculum-development', 'Curriculum Development', 4),
  ('educational-technology', 'Educational Technology', 5),
  ('teaching-profession', 'Teaching Profession', 6),
  ('facilitating-learning', 'Facilitating Learning', 7),
  ('general-education', 'General Education', 8),
  ('english', 'English', 9),
  ('mathematics', 'Mathematics', 10),
  ('science', 'Science', 11),
  ('filipino', 'Filipino', 12),
  ('social-studies', 'Social Studies', 13);

-- Topics

insert into topics (subject_id, slug, name)
select id, 'formative-assessment', 'Formative Assessment' from subjects where slug = 'assessment-of-learning'
union all
select id, 'summative-assessment', 'Summative Assessment' from subjects where slug = 'assessment-of-learning'
union all
select id, 'validity', 'Validity' from subjects where slug = 'assessment-of-learning'
union all
select id, 'reliability', 'Reliability' from subjects where slug = 'assessment-of-learning';

insert into topics (subject_id, slug, name)
select id, 'cognitive-development', 'Cognitive Development' from subjects where slug = 'child-and-adolescent-development'
union all
select id, 'psychosocial-development', 'Psychosocial Development' from subjects where slug = 'child-and-adolescent-development'
union all
select id, 'moral-development', 'Moral Development' from subjects where slug = 'child-and-adolescent-development'
union all
select id, 'adolescent-motivation', 'Adolescent Motivation' from subjects where slug = 'child-and-adolescent-development';

insert into topics (subject_id, slug, name)
select id, 'classroom-management', 'Classroom Management' from subjects where slug = 'principles-of-teaching'
union all
select id, 'lesson-planning', 'Lesson Planning' from subjects where slug = 'principles-of-teaching'
union all
select id, 'differentiated-instruction', 'Differentiated Instruction' from subjects where slug = 'principles-of-teaching'
union all
select id, 'instructional-strategies', 'Instructional Strategies' from subjects where slug = 'principles-of-teaching';

insert into topics (subject_id, slug, name)
select id, 'curriculum-planning', 'Curriculum Planning' from subjects where slug = 'curriculum-development'
union all
select id, 'play-based-learning', 'Play-Based Learning' from subjects where slug = 'curriculum-development'
union all
select id, 'learning-environments', 'Learning Environments' from subjects where slug = 'curriculum-development'
union all
select id, 'subject-integration', 'Subject Integration' from subjects where slug = 'curriculum-development';

insert into topics (subject_id, slug, name)
select id, 'instructional-design', 'Instructional Design' from subjects where slug = 'educational-technology'
union all
select id, 'technology-integration', 'Technology Integration' from subjects where slug = 'educational-technology'
union all
select id, 'learning-theories-in-edtech', 'Learning Theories in EdTech' from subjects where slug = 'educational-technology'
union all
select id, 'motivation-and-engagement', 'Motivation and Engagement' from subjects where slug = 'educational-technology';

insert into topics (subject_id, slug, name)
select id, 'code-of-ethics', 'Code of Ethics' from subjects where slug = 'teaching-profession'
union all
select id, 'teacher-responsibilities', 'Teacher Responsibilities' from subjects where slug = 'teaching-profession'
union all
select id, 'professional-conduct', 'Professional Conduct' from subjects where slug = 'teaching-profession'
union all
select id, 'licensure', 'Licensure' from subjects where slug = 'teaching-profession';

insert into topics (subject_id, slug, name)
select id, 'learning-theories', 'Learning Theories' from subjects where slug = 'facilitating-learning'
union all
select id, 'instructional-design-process', 'Instructional Design Process' from subjects where slug = 'facilitating-learning'
union all
select id, 'design-thinking', 'Design Thinking' from subjects where slug = 'facilitating-learning'
union all
select id, 'learner-needs-analysis', 'Learner Needs Analysis' from subjects where slug = 'facilitating-learning';

insert into topics (subject_id, slug, name)
select id, 'educational-philosophy', 'Educational Philosophy' from subjects where slug = 'general-education'
union all
select id, 'classroom-community', 'Classroom Community' from subjects where slug = 'general-education'
union all
select id, 'curriculum-standards', 'Curriculum Standards' from subjects where slug = 'general-education'
union all
select id, 'professional-responsibilities', 'Professional Responsibilities' from subjects where slug = 'general-education';

insert into topics (subject_id, slug, name)
select id, 'writing-process', 'Writing Process' from subjects where slug = 'english'
union all
select id, 'rhetoric', 'Rhetoric' from subjects where slug = 'english'
union all
select id, 'genre-writing', 'Genre Writing' from subjects where slug = 'english'
union all
select id, 'grammar-and-mechanics', 'Grammar and Mechanics' from subjects where slug = 'english';

insert into topics (subject_id, slug, name)
select id, 'place-value', 'Place Value' from subjects where slug = 'mathematics'
union all
select id, 'operations', 'Operations' from subjects where slug = 'mathematics'
union all
select id, 'fractions', 'Fractions' from subjects where slug = 'mathematics'
union all
select id, 'geometry', 'Geometry' from subjects where slug = 'mathematics';

insert into topics (subject_id, slug, name)
select id, 'earth-science', 'Earth Science' from subjects where slug = 'science'
union all
select id, 'space-science', 'Space Science' from subjects where slug = 'science'
union all
select id, 'physical-science', 'Physical Science' from subjects where slug = 'science'
union all
select id, 'climate-science', 'Climate Science' from subjects where slug = 'science';

insert into topics (subject_id, slug, name)
select id, 'ortograpiyang-filipino', 'Ortograpiyang Filipino' from subjects where slug = 'filipino'
union all
select id, 'gramatika', 'Gramatika' from subjects where slug = 'filipino'
union all
select id, 'patakarang-pangwika', 'Patakarang Pangwika' from subjects where slug = 'filipino';

insert into topics (subject_id, slug, name)
select id, 'government-foundations', 'Government Foundations' from subjects where slug = 'social-studies'
union all
select id, 'civic-institutions', 'Civic Institutions' from subjects where slug = 'social-studies'
union all
select id, 'citizens-rights', 'Citizens Rights' from subjects where slug = 'social-studies'
union all
select id, 'media-literacy', 'Media Literacy' from subjects where slug = 'social-studies';

-- Resources

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'The Alchemy of Assessment and Evaluation',
  'Jessica Kahlow',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/the-alchemy-of-assessment-and-evaluation',
  'An open textbook walking through formative and summative assessment design, from writing rubrics to aligning assessments with learning objectives.',
  'course_material',
  'CC BY-NC-SA',
  'OPEN_LICENSE',
  'Open Textbook Library page for this title states the license as Attribution-NonCommercial-ShareAlike (CC BY-NC-SA).',
  'https://open.umn.edu/opentextbooks/textbooks/the-alchemy-of-assessment-and-evaluation'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Educational Psychology - Second Edition',
  'Kelvin Seifert and Rosemary Sutton',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/153',
  'A full educational psychology textbook covering Piaget, Erikson, and Kohlberg''s developmental stages alongside motivation and diversity in the classroom.',
  'course_material',
  'CC BY',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution (CC BY 4.0).',
  'https://open.umn.edu/opentextbooks/textbooks/153'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Teaching Methods & Practices',
  'Jason Proctor',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/teaching-methods-practices',
  'A practical guide for new teachers covering classroom management, lesson planning, and assessment design in the K-12 classroom.',
  'course_material',
  'CC BY',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution (CC BY 4.0).',
  'https://open.umn.edu/opentextbooks/textbooks/teaching-methods-practices'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Introduction to Curriculum for Early Childhood Education',
  'Jennifer Paris, Kristin Beeve, and Clint Springer',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/introduction-to-curriculum-for-early-childhood-education',
  'Covers how to plan curriculum for young learners across literacy, math, science, and social studies, with an emphasis on play-based teaching.',
  'course_material',
  'CC BY',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution (CC BY 4.0).',
  'https://open.umn.edu/opentextbooks/textbooks/introduction-to-curriculum-for-early-childhood-education'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Foundations of Educational Technology',
  'Penny Thompson',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/foundations-of-educational-technology',
  'Traces the history and theory behind educational technology, from early learning theory through modern classroom technology integration.',
  'course_material',
  'CC BY-NC',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution-NonCommercial (CC BY-NC).',
  'https://open.umn.edu/opentextbooks/textbooks/foundations-of-educational-technology'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Code of Ethics for Professional Teachers',
  'Board for Professional Teachers',
  'Professional Regulation Commission (PRC), Philippines',
  'https://prc.gov.ph/Pages/PRBv4/ProfessionalTeachersv9.htm',
  'The official code of ethics Filipino teachers are licensed under, adopted via Board Resolution No. 435, s. 1997, under RA 7836.',
  'pdf',
  null,
  'PUBLIC_DOMAIN',
  'Issued by the PRC, a Philippine government regulatory body, as an official Board Resolution; under RA 8293 Sec. 176, works of the Philippine Government generally carry no copyright.',
  'https://prc.gov.ph/Pages/PRBv4/ProfessionalTeachersv9.htm'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Design for Learning: Principles, Processes, and Praxis',
  'Jason K. McDonald and Richard E. West',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/design-for-learning-principles-processes-and-praxis',
  'An instructional design textbook grounded in learning theory, useful for understanding how to structure activities that actually help students learn.',
  'course_material',
  'CC BY-NC',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution-NonCommercial (CC BY-NC).',
  'https://open.umn.edu/opentextbooks/textbooks/design-for-learning-principles-processes-and-praxis'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Foundations of Education: Cultivating Diverse Perspectives',
  'Ceci De Valdenebro, Tanya Mead, and Jennifer Margolis',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/foundations-of-education',
  'A broad introduction to the teaching profession covering educational history, classroom community-building, and the legal/ethical duties of educators.',
  'course_material',
  'CC BY-NC-SA',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution-NonCommercial-ShareAlike (CC BY-NC-SA).',
  'https://open.umn.edu/opentextbooks/textbooks/foundations-of-education'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Writing Guide with Handbook',
  'Michelle Bachelor Robinson, Maria Jerskey, and Toby Fulwiler',
  'Open Textbook Library (University of Minnesota) / OpenStax',
  'https://open.umn.edu/opentextbooks/textbooks/writing-guide-with-handbook',
  'A first-year writing textbook covering the writing process, common genres, and a grammar/citation handbook for MLA and APA style.',
  'course_material',
  'CC BY',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution (CC BY).',
  'https://open.umn.edu/opentextbooks/textbooks/writing-guide-with-handbook'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Mathematics for Elementary Teachers',
  'Michelle Manes',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/mathematics-for-elementary-teachers',
  'Builds deep number sense for future elementary teachers through place value, operations, fractions, and geometry activities.',
  'course_material',
  'CC BY-SA',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution-ShareAlike (CC BY-SA).',
  'https://open.umn.edu/opentextbooks/textbooks/mathematics-for-elementary-teachers'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Elementary Earth and Space Science Methods',
  'Ted Neal',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/946',
  'A methods textbook for future elementary teachers covering earth, space, physical, and climate science topics aligned to K-8 standards.',
  'course_material',
  'CC BY-NC-SA',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution-NonCommercial-ShareAlike (CC BY-NC-SA).',
  'https://open.umn.edu/opentextbooks/textbooks/946'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Ortograpiyang Pambansa',
  'Komisyon sa Wikang Filipino',
  'Komisyon sa Wikang Filipino (KWF)',
  'https://kwf.gov.ph/wp-content/uploads/Ortograpiyang_Pambansa_1.pdf',
  'The official national orthography guide for the Filipino language, covering spelling rules, letters, and symbols used in standard Filipino.',
  'pdf',
  null,
  'PUBLIC_DOMAIN',
  'Hosted on kwf.gov.ph, the official domain of the Komisyon sa Wikang Filipino, a Philippine government agency; under RA 8293 Sec. 176, works of the Philippine Government generally carry no copyright.',
  'https://kwf.gov.ph/wp-content/uploads/Ortograpiyang_Pambansa_1.pdf'
);

insert into resources (title, author, source, original_url, description, resource_type, license, license_status, license_evidence, content_location)
values (
  'Building Democracy for All: Interactive Explorations of Government and Civic Life',
  'Robert W. Maloy and Torrey Trust',
  'Open Textbook Library (University of Minnesota)',
  'https://open.umn.edu/opentextbooks/textbooks/building-democracy-for-all-interactive-explorations-of-government-and-civic-life',
  'A civics and government textbook covering institutions, citizens'' rights, and media literacy; U.S.-focused but useful for general social studies pedagogy.',
  'course_material',
  'CC BY-NC-SA',
  'OPEN_LICENSE',
  'Open Textbook Library page states the license as Attribution-NonCommercial-ShareAlike (CC BY-NC-SA).',
  'https://open.umn.edu/opentextbooks/textbooks/building-democracy-for-all-interactive-explorations-of-government-and-civic-life'
);

-- Resource-Topic links

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/the-alchemy-of-assessment-and-evaluation'
  and t.subject_id = s.id and s.slug = 'assessment-of-learning' and t.slug in ('formative-assessment', 'summative-assessment', 'validity', 'reliability');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/153'
  and t.subject_id = s.id and s.slug = 'child-and-adolescent-development'
  and t.slug in ('cognitive-development', 'psychosocial-development', 'moral-development', 'adolescent-motivation');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/teaching-methods-practices'
  and t.subject_id = s.id and s.slug = 'principles-of-teaching'
  and t.slug in ('classroom-management', 'lesson-planning', 'differentiated-instruction', 'instructional-strategies');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/introduction-to-curriculum-for-early-childhood-education'
  and t.subject_id = s.id and s.slug = 'curriculum-development'
  and t.slug in ('curriculum-planning', 'play-based-learning', 'learning-environments', 'subject-integration');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/foundations-of-educational-technology'
  and t.subject_id = s.id and s.slug = 'educational-technology'
  and t.slug in ('instructional-design', 'technology-integration', 'learning-theories-in-edtech', 'motivation-and-engagement');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://prc.gov.ph/Pages/PRBv4/ProfessionalTeachersv9.htm'
  and t.subject_id = s.id and s.slug = 'teaching-profession'
  and t.slug in ('code-of-ethics', 'teacher-responsibilities', 'professional-conduct', 'licensure');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/design-for-learning-principles-processes-and-praxis'
  and t.subject_id = s.id and s.slug = 'facilitating-learning'
  and t.slug in ('learning-theories', 'instructional-design-process', 'design-thinking', 'learner-needs-analysis');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/foundations-of-education'
  and t.subject_id = s.id and s.slug = 'general-education'
  and t.slug in ('educational-philosophy', 'classroom-community', 'curriculum-standards', 'professional-responsibilities');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/writing-guide-with-handbook'
  and t.subject_id = s.id and s.slug = 'english'
  and t.slug in ('writing-process', 'rhetoric', 'genre-writing', 'grammar-and-mechanics');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/mathematics-for-elementary-teachers'
  and t.subject_id = s.id and s.slug = 'mathematics'
  and t.slug in ('place-value', 'operations', 'fractions', 'geometry');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/946'
  and t.subject_id = s.id and s.slug = 'science'
  and t.slug in ('earth-science', 'space-science', 'physical-science', 'climate-science');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://kwf.gov.ph/wp-content/uploads/Ortograpiyang_Pambansa_1.pdf'
  and t.subject_id = s.id and s.slug = 'filipino'
  and t.slug in ('ortograpiyang-filipino', 'gramatika', 'patakarang-pangwika');

insert into resource_topics (resource_id, topic_id)
select r.id, t.id from resources r, topics t, subjects s
where r.original_url = 'https://open.umn.edu/opentextbooks/textbooks/building-democracy-for-all-interactive-explorations-of-government-and-civic-life'
  and t.subject_id = s.id and s.slug = 'social-studies'
  and t.slug in ('government-foundations', 'civic-institutions', 'citizens-rights', 'media-literacy');
