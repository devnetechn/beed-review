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
export type TopicHit = { slug: string; name: string; subject_slug: string };

export async function searchAll(query: string) {
  if (!query.trim()) {
    return { subjects: [], topics: [], resources: [] };
  }

  const supabase = await createClient();

  const [subjectsRes, topicsRes, resourcesRes] = await Promise.all([
    supabase.from("subjects").select("slug, name").ilike("name", `%${query}%`).limit(5),
    supabase
      .from("topics")
      .select("slug, name, subjects(slug)")
      .ilike("name", `%${query}%`)
      .limit(5),
    supabase.rpc("search_resources", { search_query: query }),
  ]);

  const topics: TopicHit[] = (topicsRes.data ?? []).map((t) => {
    const subject = Array.isArray(t.subjects) ? t.subjects[0] : t.subjects;
    return { slug: t.slug, name: t.name, subject_slug: subject?.slug ?? "" };
  });

  return {
    subjects: (subjectsRes.data ?? []) as SubjectHit[],
    topics,
    resources: (resourcesRes.data ?? []) as ResourceHit[],
  };
}
