import { createServiceClient } from "@/lib/supabase/service";
import type { QuizAttemptView } from "./types";

export async function getQuizAttempt(
  attemptId: string,
  userId: string
): Promise<QuizAttemptView | null> {
  const supabase = createServiceClient();

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select(
      "id, user_id, score, total_questions, difficulty, resource_id, topic_id, resources(title), topics(name)"
    )
    .eq("id", attemptId)
    .maybeSingle();

  if (!attempt || attempt.user_id !== userId) return null;

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, question_text, choices, correct_answer, selected_answer, explanation")
    .eq("quiz_attempt_id", attemptId)
    .order("created_at", { ascending: true });

  const resource = Array.isArray(attempt.resources) ? attempt.resources[0] : attempt.resources;
  const topic = Array.isArray(attempt.topics) ? attempt.topics[0] : attempt.topics;
  const label = resource?.title ?? topic?.name ?? "Quiz";
  const totalQuestions = attempt.total_questions ?? questions?.length ?? 0;
  const difficulty = attempt.difficulty ?? "medium";

  if (attempt.score !== null) {
    return {
      scored: true,
      attemptId: attempt.id,
      label,
      difficulty,
      score: attempt.score,
      totalQuestions,
      questions: (questions ?? []).map((q) => ({
        id: q.id,
        question: q.question_text,
        choices: q.choices as string[],
        correct_answer: q.correct_answer,
        selected_answer: q.selected_answer,
        explanation: q.explanation ?? "",
      })),
    };
  }

  return {
    scored: false,
    attemptId: attempt.id,
    label,
    difficulty,
    totalQuestions,
    questions: (questions ?? []).map((q) => ({
      id: q.id,
      question: q.question_text,
      choices: q.choices as string[],
    })),
  };
}

export async function submitQuiz(
  attemptId: string,
  userId: string,
  answers: { questionId: string; selectedAnswer: string }[]
): Promise<{ score: number; totalQuestions: number }> {
  const supabase = createServiceClient();

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("user_id, total_questions")
    .eq("id", attemptId)
    .single();

  if (!attempt || attempt.user_id !== userId) throw new Error("Quiz attempt not found");

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, correct_answer")
    .eq("quiz_attempt_id", attemptId);

  const correctMap = new Map((questions ?? []).map((q) => [q.id, q.correct_answer]));

  let score = 0;
  for (const a of answers) {
    if (correctMap.get(a.questionId) === a.selectedAnswer) score += 1;
    await supabase
      .from("quiz_questions")
      .update({ selected_answer: a.selectedAnswer })
      .eq("id", a.questionId);
  }

  await supabase.from("quiz_attempts").update({ score }).eq("id", attemptId);

  return { score, totalQuestions: attempt.total_questions ?? answers.length };
}
