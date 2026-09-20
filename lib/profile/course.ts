"use server";

import { createClient } from "@/lib/supabase/server";

export async function updateCourseAndMajor(
  courseSlug: string,
  majorSlug: string | null
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", courseSlug)
    .maybeSingle();
  if (!course) return { error: "Please select your course." };

  let majorId: string | null = null;
  if (courseSlug === "bsed") {
    if (!majorSlug) return { error: "Please select your major." };
    const { data: major } = await supabase
      .from("majors")
      .select("id")
      .eq("slug", majorSlug)
      .eq("course_id", course.id)
      .maybeSingle();
    if (!major) return { error: "Please select your major." };
    majorId = major.id;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ course_id: course.id, major_id: majorId })
    .eq("id", user.id);
  if (error) return { error: "Couldn't save. Try again." };

  return { ok: true };
}
