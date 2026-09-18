import { createServiceClient } from "@/lib/supabase/service";
import type { WeakTopic } from "./types";

const MIN_QUESTIONS_FOR_SIGNAL = 3;

type TopicRow = { id: string; name: string; subjects: { name: string } | { name: string }[] | null };

export async function getWeakTopics(userId: string, limit = 3): Promise<WeakTopic[]> {
  const supabase = createServiceClient();

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, resource_id, topic_id")
    .eq("user_id", userId)
    .not("score", "is", null)
    .neq("difficulty", "extreme");

  if (!attempts || attempts.length === 0) return [];

  const attemptIds = attempts.map((a) => a.id);
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("quiz_attempt_id, correct_answer, selected_answer")
    .in("quiz_attempt_id", attemptIds)
    .not("selected_answer", "is", null);

  const attemptStats = new Map<string, { correct: number; total: number }>();
  for (const q of questions ?? []) {
    const stat = attemptStats.get(q.quiz_attempt_id) ?? { correct: 0, total: 0 };
    stat.total += 1;
    if (q.selected_answer === q.correct_answer) stat.correct += 1;
    attemptStats.set(q.quiz_attempt_id, stat);
  }

  const topicScores = new Map<
    string,
    { name: string; subjectName: string; correct: number; total: number }
  >();

  for (const attempt of attempts) {
    const stat = attemptStats.get(attempt.id);
    if (!stat) continue;

    let topicRows: TopicRow[] = [];

    if (attempt.topic_id) {
      const { data } = await supabase
        .from("topics")
        .select("id, name, subjects(name)")
        .eq("id", attempt.topic_id);
      topicRows = (data ?? []) as TopicRow[];
    } else if (attempt.resource_id) {
      const { data } = await supabase
        .from("resource_topics")
        .select("topics(id, name, subjects(name))")
        .eq("resource_id", attempt.resource_id);
      topicRows = (data ?? [])
        .map((r) => (Array.isArray(r.topics) ? r.topics[0] : r.topics))
        .filter((t) => !!t) as TopicRow[];
    }

    for (const t of topicRows) {
      const subject = Array.isArray(t.subjects) ? t.subjects[0] : t.subjects;
      const entry = topicScores.get(t.id) ?? {
        name: t.name,
        subjectName: subject?.name ?? "",
        correct: 0,
        total: 0,
      };
      entry.correct += stat.correct;
      entry.total += stat.total;
      topicScores.set(t.id, entry);
    }
  }

  return Array.from(topicScores.entries())
    .map(([topicId, v]) => ({
      topicId,
      topicName: v.name,
      subjectName: v.subjectName,
      accuracy: v.total > 0 ? v.correct / v.total : 0,
      totalQuestions: v.total,
    }))
    .filter((t) => t.totalQuestions >= MIN_QUESTIONS_FOR_SIGNAL)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}

const DEFAULT_RECOMMENDATIONS = ["Teaching Profession", "Curriculum Development"];

export async function getRecommendedTopics(userId: string, limit = 2): Promise<string[]> {
  const weak = await getWeakTopics(userId, limit);
  if (weak.length > 0) return weak.map((w) => w.topicName);
  return DEFAULT_RECOMMENDATIONS.slice(0, limit);
}
