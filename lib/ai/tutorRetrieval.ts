import { createServiceClient } from "@/lib/supabase/service";
import { getVisibleSubjects } from "@/lib/sources/visibleSubjects";

const MAX_RESULTS = 5;

type SearchResourceRow = {
  id: string;
  title: string;
  description: string | null;
};

// Filters search_resources hits down to ones linked to a subject visible
// under the caller's own course/major, so another course's material never
// counts as "authorized context".
export async function retrieveCourseContext(
  userId: string,
  query: string
): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const supabase = createServiceClient();

  const [searchResult, visibleSubjects] = await Promise.all([
    supabase.rpc("search_resources", { search_query: trimmed }),
    getVisibleSubjects(userId),
  ]);
  const candidates = searchResult.data as SearchResourceRow[] | null;

  if (!candidates || candidates.length === 0 || visibleSubjects.length === 0) return null;

  const visibleSubjectIds = new Set(visibleSubjects.map((s) => s.id));
  const candidateIds = candidates.map((c) => c.id);

  const { data: links } = await supabase
    .from("resource_topics")
    .select("resource_id, topics(subject_id)")
    .in("resource_id", candidateIds);

  const authorizedResourceIds = new Set(
    (links ?? [])
      .filter((link) => {
        const topic = Array.isArray(link.topics) ? link.topics[0] : link.topics;
        return topic?.subject_id && visibleSubjectIds.has(topic.subject_id);
      })
      .map((link) => link.resource_id)
  );

  const authorized = candidates
    .filter((c) => authorizedResourceIds.has(c.id))
    .slice(0, MAX_RESULTS);

  if (authorized.length === 0) return null;

  return authorized
    .map((r) => `- ${r.title}: ${r.description ?? "(no description)"}`)
    .join("\n");
}
