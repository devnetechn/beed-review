import { createClient } from "@/lib/supabase/server";
import type { LicenseStatus } from "@/types/database";

export type ResourceHit = {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  resource_type: string;
  license_status: LicenseStatus;
  original_url: string;
};

export type SubjectHit = { slug: string; name: string };
export type TopicHit = { id: string; slug: string; name: string; subject_slug: string };

export async function searchAll(query: string, userId: string | null) {
  if (!query.trim()) {
    return { subjects: [], topics: [], resources: [] };
  }

  const supabase = await createClient();

  let majorId: string | null = null;
  let courseId: string | null = null;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("major_id, course_id")
      .eq("id", userId)
      .maybeSingle();
    majorId = profile?.major_id ?? null;
    courseId = profile?.course_id ?? null;
  }

  const subjectsQuery = supabase
    .from("subjects")
    .select("slug, name, course_id")
    .ilike("name", `%${query}%`)
    .limit(5);
  const scopedSubjectsQuery = majorId
    ? subjectsQuery.or(`major_id.is.null,major_id.eq.${majorId}`)
    : subjectsQuery.is("major_id", null);

  const [subjectsRes, topicsRes, resourcesRes] = await Promise.all([
    scopedSubjectsQuery,
    supabase
      .from("topics")
      .select("id, slug, name, subjects!inner(slug, major_id, course_id)")
      .ilike("name", `%${query}%`)
      .limit(20),
    supabase.rpc("search_resources", { search_query: query }),
  ]);

  const topics: TopicHit[] = (topicsRes.data ?? [])
    .map((t) => {
      const subject = Array.isArray(t.subjects) ? t.subjects[0] : t.subjects;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        subject_slug: subject?.slug ?? "",
        subject_major_id: subject?.major_id ?? null,
        subject_course_id: subject?.course_id ?? null,
      };
    })
    .filter((t) => !t.subject_major_id || t.subject_major_id === majorId)
    .filter((t) => !t.subject_course_id || t.subject_course_id === courseId)
    .slice(0, 5)
    .map(({ id, slug, name, subject_slug }) => ({ id, slug, name, subject_slug }));

  return {
    subjects: ((subjectsRes.data ?? []) as (SubjectHit & { course_id: string | null })[])
      .filter((s) => !s.course_id || s.course_id === courseId)
      .map(({ slug, name }) => ({ slug, name })),
    topics,
    resources: (resourcesRes.data ?? []) as ResourceHit[],
  };
}
