import { createServiceClient } from "@/lib/supabase/service";
import type { ResourceHit } from "@/lib/search/searchResources";

const CACHE_FRESHNESS_DAYS = 30;

export async function findCachedResults(
  query: string,
  courseId: string | null
): Promise<ResourceHit[] | null> {
  const supabase = createServiceClient();
  const normalized = query.trim();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_FRESHNESS_DAYS);

  const base = supabase
    .from("research_queries")
    .select("id")
    .ilike("query_text", normalized)
    .gte("created_at", cutoff.toISOString());

  const { data: matchingQuery } = courseId
    ? await base.eq("course_id", courseId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : await base.is("course_id", null).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!matchingQuery) return null;

  const { data: results } = await supabase
    .from("research_results")
    .select(
      "resources(id, title, description, source, resource_type, license_status, original_url)"
    )
    .eq("research_query_id", matchingQuery.id);

  if (!results || results.length === 0) return null;

  const hits = results
    .map((r) => (Array.isArray(r.resources) ? r.resources[0] : r.resources))
    .filter((r): r is NonNullable<typeof r> => !!r);

  return hits as unknown as ResourceHit[];
}
