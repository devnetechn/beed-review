"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { SUBJECTS } from "@/lib/sources/subjects";

export async function saveSubjectInterestsAction(
  subjectSlugs: string[]
): Promise<{ error: string } | { ok: true }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const slugs = subjectSlugs.filter((slug) => SUBJECTS.some((s) => s.slug === slug));

    const service = createServiceClient();
    const { data: subjects } = await service.from("subjects").select("id, slug").in("slug", slugs);

    await service.from("profile_subject_interests").delete().eq("user_id", user.id);

    if (subjects && subjects.length > 0) {
      await service
        .from("profile_subject_interests")
        .insert(subjects.map((s) => ({ user_id: user.id, subject_id: s.id })));
    }

    await service
      .from("profiles")
      .update({ subject_interests_prompted: true })
      .eq("id", user.id);

    revalidatePath("/");
    return { ok: true };
  } catch {
    return { error: "Couldn't save your interests. Please try again." };
  }
}

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
