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

  const resourceHits = (resourcesRes.data ?? []) as ResourceHit[];
  const resources = await filterResourcesByScope(supabase, resourceHits, majorId, courseId);

  return {
    subjects: ((subjectsRes.data ?? []) as (SubjectHit & { course_id: string | null })[])
      .filter((s) => !s.course_id || s.course_id === courseId)
      .map(({ slug, name }) => ({ slug, name })),
    topics,
    resources,
  };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// A resource is visible if it isn't tied to any topic (nothing to scope it by)
// or at least one of its topics' subjects is visible to the caller's course/major.
// This lets a resource linked to topics across multiple courses stay "open" to
// all of them, instead of being locked to whichever course happened to link it first.
async function filterResourcesByScope(
  supabase: SupabaseServerClient,
  resources: ResourceHit[],
  majorId: string | null,
  courseId: string | null
): Promise<ResourceHit[]> {
  if (resources.length === 0) return resources;

  const { data: links } = await supabase
    .from("resource_topics")
    .select("resource_id, topics!inner(subjects!inner(major_id, course_id))")
    .in(
      "resource_id",
      resources.map((r) => r.id)
    );

  const scopesByResource = new Map<string, { major_id: string | null; course_id: string | null }[]>();
  for (const row of links ?? []) {
    const topic = Array.isArray(row.topics) ? row.topics[0] : row.topics;
    const subject = topic ? (Array.isArray(topic.subjects) ? topic.subjects[0] : topic.subjects) : null;
    if (!subject) continue;
    const list = scopesByResource.get(row.resource_id) ?? [];
    list.push({ major_id: subject.major_id, course_id: subject.course_id });
    scopesByResource.set(row.resource_id, list);
  }

  return resources.filter((r) => {
    const scopes = scopesByResource.get(r.id);
    if (!scopes || scopes.length === 0) return true;
    return scopes.some(
      (s) => (!s.major_id || s.major_id === majorId) && (!s.course_id || s.course_id === courseId)
    );
  });
}
