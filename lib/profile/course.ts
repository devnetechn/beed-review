"use server";

import { createClient } from "@/lib/supabase/server";
import { BADGES } from "@/lib/gamification/badges";

export async function updateCourseAndMajor(
  courseSlug: string,
  majorSlug: string | null
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("course_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { error: "Couldn't verify your profile. Try again." };

  if (profile?.course_id) {
    const { count, error: badgeCountError } = await supabase
      .from("user_badges")
      .select("badge_id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (badgeCountError) return { error: "Couldn't verify your badges. Try again." };
    if ((count ?? 0) < BADGES.length) {
      return { error: `Complete all ${BADGES.length} badges to unlock changing your course.` };
    }
  }

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
