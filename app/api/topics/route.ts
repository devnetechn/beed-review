import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const subjectSlug = request.nextUrl.searchParams.get("subject");
  if (!subjectSlug) return NextResponse.json({ topics: [] });

  const supabase = await createClient();
  const { data: subject } = await supabase
    .from("subjects")
    .select("id")
    .eq("slug", subjectSlug)
    .maybeSingle();

  if (!subject) return NextResponse.json({ topics: [] });

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name")
    .eq("subject_id", subject.id)
    .order("name", { ascending: true });

  return NextResponse.json({ topics: topics ?? [] });
}
