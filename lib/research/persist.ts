import { createServiceClient } from "@/lib/supabase/service";
import type { ResearchedResource } from "./types";
import type { ResourceHit } from "@/lib/search/searchResources";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function persistResults(
  query: string,
  userId: string,
  results: ResearchedResource[]
): Promise<ResourceHit[]> {
  const supabase = createServiceClient();
  const hits: ResourceHit[] = [];
  const resourceIds: string[] = [];

  for (const r of results) {
    const { data: resource, error } = await supabase
      .from("resources")
      .upsert(
        {
          title: r.title,
          author: r.author,
          source: r.source,
          original_url: r.original_url,
          description: r.description,
          resource_type: r.resource_type,
          license: r.license,
          license_status: r.license_status,
          license_evidence: r.license_evidence,
          content_location: r.original_url,
          last_checked: new Date().toISOString(),
        },
        { onConflict: "original_url" }
      )
      .select("id, title, description, source, resource_type, license_status, original_url")
      .single();

    if (error || !resource) continue;

    const { data: subject } = await supabase
      .from("subjects")
      .select("id")
      .eq("slug", r.subject_slug)
      .single();

    if (subject) {
      for (const topicName of r.topics) {
        const topicSlug = slugify(topicName);
        if (!topicSlug) continue;

        const { data: topic } = await supabase
          .from("topics")
          .upsert(
            { subject_id: subject.id, slug: topicSlug, name: topicName },
            { onConflict: "subject_id,slug" }
          )
          .select("id")
          .single();

        if (topic) {
          await supabase
            .from("resource_topics")
            .upsert(
              { resource_id: resource.id, topic_id: topic.id },
              { onConflict: "resource_id,topic_id" }
            );
        }
      }
    }

    hits.push(resource as ResourceHit);
    resourceIds.push(resource.id);
  }

  const { data: queryRow } = await supabase
    .from("research_queries")
    .insert({ user_id: userId, query_text: query })
    .select("id")
    .single();

  if (queryRow && resourceIds.length > 0) {
    await supabase
      .from("research_results")
      .insert(resourceIds.map((id) => ({ research_query_id: queryRow.id, resource_id: id })));
  }

  return hits;
}
