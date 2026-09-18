import { createServiceClient } from "@/lib/supabase/service";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila is UTC+8 year-round (no DST)
const DAY_MS = 24 * 60 * 60 * 1000;

export function getManilaDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_MS);
  const manilaMidnightUtc = Date.UTC(
    manilaNow.getUTCFullYear(),
    manilaNow.getUTCMonth(),
    manilaNow.getUTCDate()
  );
  const start = new Date(manilaMidnightUtc - MANILA_OFFSET_MS);
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end };
}

export class ExtremeQuizLimitError extends Error {
  nextAvailableAt: string;
  constructor(nextAvailableAt: string) {
    super("Extreme quiz already used today");
    this.name = "ExtremeQuizLimitError";
    this.nextAvailableAt = nextAvailableAt;
  }
}

export async function getExtremeQuizStatus(
  userId: string
): Promise<{ usedToday: boolean; nextAvailableAt: string | null }> {
  const supabase = createServiceClient();
  const { start, end } = getManilaDayBounds();

  const { data } = await supabase
    .from("quiz_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("difficulty", "extreme")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .limit(1)
    .maybeSingle();

  return { usedToday: !!data, nextAvailableAt: data ? end.toISOString() : null };
}

export async function assertExtremeQuizAllowed(userId: string): Promise<void> {
  const { usedToday, nextAvailableAt } = await getExtremeQuizStatus(userId);
  if (usedToday) throw new ExtremeQuizLimitError(nextAvailableAt!);
}
