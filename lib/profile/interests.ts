"use server";

import { createServiceClient } from "@/lib/supabase/service";

export async function getSubjectInterests(
  userId: string
): Promise<{ subjectId: string; subjectName: string; subjectSlug: string }[]> {
  const service = createServiceClient();
  const { data } = await service
    .from("profile_subject_interests")
    .select("subjects(id, name, slug)")
    .eq("user_id", userId);

  return (data ?? [])
    .map((row) => (Array.isArray(row.subjects) ? row.subjects[0] : row.subjects))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({ subjectId: s.id, subjectName: s.name, subjectSlug: s.slug }));
}
