import { createServiceClient } from "@/lib/supabase/service";

const DAILY_LIMIT = 20;

export async function checkRateLimit(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const since = new Date();
  since.setHours(since.getHours() - 24);

  const { count } = await supabase
    .from("research_queries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());

  return (count ?? 0) < DAILY_LIMIT;
}
