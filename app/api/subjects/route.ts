import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVisibleSubjects } from "@/lib/sources/visibleSubjects";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ subjects: [] });

  const subjects = await getVisibleSubjects(user.id);
  return NextResponse.json({ subjects });
}
