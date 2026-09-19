import { createServiceClient } from "@/lib/supabase/service";

export type VisibleSubject = { id: string; slug: string; name: string };

export async function getVisibleSubjects(userId: string): Promise<VisibleSubject[]> {
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("major_id, course_id")
    .eq("id", userId)
    .maybeSingle();

  const majorId = profile?.major_id ?? null;
  const courseId = profile?.course_id ?? null;

  const query = supabase
    .from("subjects")
    .select("id, slug, name, course_id")
    .order("name", { ascending: true });

  const { data } = majorId
    ? await query.or(`major_id.is.null,major_id.eq.${majorId}`)
    : await query.is("major_id", null);

  return ((data ?? []) as (VisibleSubject & { course_id: string | null })[])
    .filter((s) => !s.course_id || s.course_id === courseId)
    .map(({ id, slug, name }) => ({ id, slug, name }));
}
