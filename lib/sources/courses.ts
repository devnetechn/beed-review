export const COURSES = [
  { slug: "beed", name: "BEEd" },
  { slug: "bsed", name: "BSEd" },
  { slug: "civil-service-exam", name: "Civil Service Exam" },
] as const;

export const BSED_MAJORS = [
  { slug: "english", name: "English" },
  { slug: "mathematics", name: "Mathematics" },
  { slug: "filipino", name: "Filipino" },
  { slug: "biological-science", name: "Biological Science" },
  { slug: "physical-education", name: "Physical Education" },
  { slug: "social-studies", name: "Social Studies" },
] as const;

export const COURSE_EXAM_CONTEXT: Record<string, string> = {
  beed: "a Bachelor of Elementary Education (BEEd) exam-prep app used by Filipino education students preparing for the LET (Licensure Examination for Teachers)",
  bsed: "a Bachelor of Secondary Education (BSEd) exam-prep app used by Filipino education students preparing for the LET (Licensure Examination for Teachers)",
  "civil-service-exam": "a Civil Service Exam (CSE) reviewer app used by Filipinos preparing for the Philippine Civil Service Exam",
};

export const DEFAULT_COURSE_EXAM_CONTEXT = COURSE_EXAM_CONTEXT.beed;

export function resolveCourseLabel(courseSlug: string | null | undefined): string {
  if (!courseSlug) return DEFAULT_COURSE_EXAM_CONTEXT;
  return COURSE_EXAM_CONTEXT[courseSlug] ?? DEFAULT_COURSE_EXAM_CONTEXT;
}

export function resolveCourseName(courseSlug: string | null | undefined): string {
  if (!courseSlug) return "course";
  return COURSES.find((c) => c.slug === courseSlug)?.name ?? "course";
}
