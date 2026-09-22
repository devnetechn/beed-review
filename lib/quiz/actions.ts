"use server";

import { createClient } from "@/lib/supabase/server";
import { generateTopicQuiz, generateSubjectQuiz, type QuizDifficulty } from "@/lib/ai/quiz";
import { submitQuiz } from "./attempt";
import { assertExtremeQuizAllowed, ExtremeQuizLimitError } from "./extreme";
import { recordActivity } from "@/lib/gamification/activity";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function startTopicQuizAction(
  topicId: string,
  count: 50 | 150 | 200,
  difficulty: QuizDifficulty
): Promise<{ attemptId: string } | { error: string }> {
  try {
    const user = await requireUser();
    const { attemptId } = await generateTopicQuiz(topicId, user.id, count, difficulty);
    return { attemptId };
  } catch {
    return { error: "Couldn't generate a quiz. Please try again." };
  }
}

export async function startSubjectQuizAction(
  subjectId: string,
  count: 50 | 150 | 200,
  difficulty: QuizDifficulty
): Promise<{ attemptId: string } | { error: string }> {
  try {
    const user = await requireUser();
    const { attemptId } = await generateSubjectQuiz(subjectId, user.id, count, difficulty);
    return { attemptId };
  } catch {
    return { error: "Couldn't generate a quiz. Please try again." };
  }
}

export async function startExtremeQuizAction(
  topicId: string
): Promise<
  | { attemptId: string }
  | { error: "already_used_today"; nextAvailableAt: string }
  | { error: string }
> {
  try {
    const user = await requireUser();
    await assertExtremeQuizAllowed(user.id);
    const { attemptId } = await generateTopicQuiz(topicId, user.id, 10, "extreme");
    return { attemptId };
  } catch (err) {
    if (err instanceof ExtremeQuizLimitError) {
      return { error: "already_used_today", nextAvailableAt: err.nextAvailableAt };
    }
    return { error: "Couldn't generate a quiz. Please try again." };
  }
}

export async function submitQuizAction(
  attemptId: string,
  answers: { questionId: string; selectedAnswer: string }[]
): Promise<{ score: number; totalQuestions: number } | { error: string }> {
  try {
    const user = await requireUser();
    const result = await submitQuiz(attemptId, user.id, answers);
    await recordActivity(user.id, "quiz_completed", {
      difficulty: result.difficulty,
      score: result.score,
      totalQuestions: result.totalQuestions,
    });
    return { score: result.score, totalQuestions: result.totalQuestions };
  } catch {
    return { error: "Couldn't submit the quiz. Please try again." };
  }
}
