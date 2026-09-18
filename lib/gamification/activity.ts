import { createServiceClient } from "@/lib/supabase/service";
import { getManilaDayBounds } from "@/lib/quiz/extreme";
import { BADGES, type UserStats } from "./badges";

export type ActivityKind = "search" | "resource_saved" | "tutor_message" | "quiz_completed";

export type QuizCompletedDetails = {
  difficulty: string;
  score: number;
  totalQuestions: number;
};

const ACTIVITY_POINTS: Record<ActivityKind, number> = {
  search: 1,
  resource_saved: 2,
  tutor_message: 1,
  quiz_completed: 10,
};

function pointsForActivity(kind: ActivityKind, quizDetails?: QuizCompletedDetails): number {
  if (kind !== "quiz_completed" || !quizDetails) return ACTIVITY_POINTS[kind];

  const isExtreme = quizDetails.difficulty === "extreme";
  const isPerfect =
    quizDetails.totalQuestions > 0 && quizDetails.score === quizDetails.totalQuestions;
  let points = isExtreme ? 25 : ACTIVITY_POINTS.quiz_completed;
  if (isPerfect) points += isExtreme ? 40 : 15;
  return points;
}

function toManilaDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function recordActivity(
  userId: string,
  kind: ActivityKind,
  quizDetails?: QuizCompletedDetails
): Promise<void> {
  try {
    const supabase = createServiceClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("points, current_streak, longest_streak, last_activity_date")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) return;

    const { start } = getManilaDayBounds();
    const todayStr = toManilaDateString(start);
    const yesterdayStr = toManilaDateString(new Date(start.getTime() - 24 * 60 * 60 * 1000));

    let currentStreak = profile.current_streak;
    if (profile.last_activity_date === todayStr) {
      // already active today — streak unchanged
    } else if (profile.last_activity_date === yesterdayStr) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }
    const longestStreak = Math.max(profile.longest_streak, currentStreak);
    const newPoints = profile.points + pointsForActivity(kind, quizDetails);

    await supabase
      .from("profiles")
      .update({
        points: newPoints,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_activity_date: todayStr,
      })
      .eq("id", userId);

    await checkAndAwardBadges(userId, currentStreak, supabase);
  } catch (err) {
    console.error("recordActivity failed:", err);
  }
}

async function checkAndAwardBadges(
  userId: string,
  currentStreak: number,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const [{ data: quizAttempts }, { data: savedResources }, { data: conversations }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("difficulty, score, total_questions")
      .eq("user_id", userId)
      .not("score", "is", null),
    supabase.from("saved_resources").select("id").eq("user_id", userId),
    supabase.from("ai_conversations").select("id").eq("user_id", userId),
  ]);

  const conversationIds = (conversations ?? []).map((c) => c.id);
  let tutorMessages = 0;
  if (conversationIds.length > 0) {
    const { count } = await supabase
      .from("ai_messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "user")
      .in("conversation_id", conversationIds);
    tutorMessages = count ?? 0;
  }

  const attempts = quizAttempts ?? [];
  const extremeAttempts = attempts.filter((a) => a.difficulty === "extreme");

  const stats: UserStats = {
    quizzesCompleted: attempts.length,
    hasPerfectScore: attempts.some(
      (a) => (a.total_questions ?? 0) > 0 && a.score === a.total_questions
    ),
    extremeCompleted: extremeAttempts.length,
    extremeBestRatio: extremeAttempts.reduce(
      (max, a) => ((a.total_questions ?? 0) > 0 ? Math.max(max, a.score! / a.total_questions!) : max),
      0
    ),
    resourcesSaved: (savedResources ?? []).length,
    tutorMessages,
    currentStreak,
  };

  const { data: earned } = await supabase.from("user_badges").select("badge_id").eq("user_id", userId);
  const earnedIds = new Set((earned ?? []).map((b) => b.badge_id));

  const newlyEarned = BADGES.filter((b) => !earnedIds.has(b.id) && b.check(stats));
  if (newlyEarned.length === 0) return;

  await supabase.from("user_badges").insert(newlyEarned.map((b) => ({ user_id: userId, badge_id: b.id })));
}
