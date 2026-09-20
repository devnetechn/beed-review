import { createServiceClient } from "@/lib/supabase/service";
import { getVisibleSubjects } from "@/lib/sources/visibleSubjects";
import { COURSE_EXAM_CONTEXT, DEFAULT_COURSE_EXAM_CONTEXT } from "@/lib/sources/courses";
import { findCachedResults } from "./cache";
import { checkRateLimit } from "./rateLimit";
import { callOpenAIResearch } from "./callOpenAI";
import { persistResults } from "./persist";
import type { ResourceHit } from "@/lib/search/searchResources";

export class RateLimitError extends Error {}
export class ResearchFailedError extends Error {}

async function getCourseContext(
  userId: string
): Promise<{ courseId: string | null; majorId: string | null; courseLabel: string }> {
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("course_id, major_id, courses(slug)")
    .eq("id", userId)
    .maybeSingle();

  const courseId = profile?.course_id ?? null;
  const majorId = profile?.major_id ?? null;
  const courseRow = Array.isArray(profile?.courses) ? profile?.courses[0] : profile?.courses;
  const courseLabel = courseRow?.slug
    ? COURSE_EXAM_CONTEXT[courseRow.slug] ?? DEFAULT_COURSE_EXAM_CONTEXT
    : DEFAULT_COURSE_EXAM_CONTEXT;

  return { courseId, majorId, courseLabel };
}

export async function researchTopic(query: string, userId: string): Promise<ResourceHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { courseId, majorId, courseLabel } = await getCourseContext(userId);

  const cached = await findCachedResults(trimmed, courseId, majorId);
  if (cached) return cached;

  const allowed = await checkRateLimit(userId);
  if (!allowed) {
    throw new RateLimitError("You've hit today's research limit — try again tomorrow.");
  }

  const subjects = await getVisibleSubjects(userId);
  if (subjects.length === 0) {
    throw new ResearchFailedError("No subjects available to classify results for your course.");
  }

  let results;
  try {
    results = await callOpenAIResearch(trimmed, courseLabel, subjects);
  } catch {
    throw new ResearchFailedError("Research failed. Please try again.");
  }

  if (results.length === 0) return [];

  const allowedSlugs = new Set(subjects.map((s) => s.slug));
  return persistResults(trimmed, userId, courseId, majorId, allowedSlugs, results);
}
