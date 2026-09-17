"use server";

import { createClient } from "@/lib/supabase/server";
import { generateTopicQuiz } from "@/lib/ai/quiz";
import { submitQuiz } from "./attempt";

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
  count: 5 | 10 | 20 | 50,
  difficulty: "easy" | "medium" | "hard"
): Promise<{ attemptId: string } | { error: string }> {
  try {
    const user = await requireUser();
    const { attemptId } = await generateTopicQuiz(topicId, user.id, count, difficulty);
    return { attemptId };
  } catch {
    return { error: "Couldn't generate a quiz. Please try again." };
  }
}

export async function submitQuizAction(
  attemptId: string,
  answers: { questionId: string; selectedAnswer: string }[]
): Promise<{ score: number; totalQuestions: number } | { error: string }> {
  try {
    const user = await requireUser();
    return await submitQuiz(attemptId, user.id, answers);
  } catch {
    return { error: "Couldn't submit the quiz. Please try again." };
  }
}
