import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const subjectSlug = request.nextUrl.searchParams.get("subject");
  if (!subjectSlug) return NextResponse.json({ topics: [] });

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let callerMajorId: string | null = null;
  let callerCourseId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("major_id, course_id")
      .eq("id", user.id)
      .maybeSingle();
    callerMajorId = profile?.major_id ?? null;
    callerCourseId = profile?.course_id ?? null;
  }

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, name, major_id, course_id")
    .eq("slug", subjectSlug)
    .maybeSingle();

  if (!subject) return NextResponse.json({ topics: [] });
  if (subject.major_id && subject.major_id !== callerMajorId) {
    return NextResponse.json({ topics: [] });
  }
  if (subject.course_id && subject.course_id !== callerCourseId) {
    return NextResponse.json({ topics: [] });
  }

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name")
    .eq("subject_id", subject.id)
    .order("name", { ascending: true });

  return NextResponse.json({
    topics: topics ?? [],
    subjectId: subject.id,
    subjectName: subject.name,
  });
}
