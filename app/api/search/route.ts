import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/search/searchResources";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/gamification/activity";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const results = await searchAll(q);

  if (q.trim()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await recordActivity(user.id, "search");
  }

  return NextResponse.json(results);
}
