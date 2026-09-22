"use server";

import { createClient } from "@/lib/supabase/server";
import { summarizeResource } from "./summarize";
import { generateQuiz, type QuizDifficulty } from "./quiz";
import { getOrCreateConversation, sendTutorMessage } from "./tutor";
import { recordActivity } from "@/lib/gamification/activity";
import type { QuizQuestionResult } from "./types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function summarizeResourceAction(
  resourceId: string
): Promise<{ content: string } | { error: string }> {
  try {
    const user = await requireUser();
    const content = await summarizeResource(resourceId, user.id);
    return { content };
  } catch {
    return { error: "Couldn't generate a summary. Please try again." };
  }
}

export async function generateQuizAction(
  resourceId: string,
  count: 50 | 150 | 200,
  difficulty: QuizDifficulty
): Promise<{ attemptId: string; questions: QuizQuestionResult[] } | { error: string }> {
  try {
    const user = await requireUser();
    return await generateQuiz(resourceId, user.id, count, difficulty);
  } catch {
    return { error: "Couldn't generate a quiz. Please try again." };
  }
}

export async function startTutorConversationAction(
  resourceId: string | null
): Promise<
  | { conversationId: string; messages: { role: "user" | "assistant"; content: string }[] }
  | { error: string }
> {
  try {
    const user = await requireUser();
    return await getOrCreateConversation(user.id, resourceId);
  } catch {
    return { error: "Couldn't start a conversation. Please try again." };
  }
}

export async function sendTutorMessageAction(
  conversationId: string,
  resourceId: string | null,
  message: string
): Promise<{ reply: string; wantsExtremeQuiz: boolean } | { error: string }> {
  try {
    const user = await requireUser();
    const result = await sendTutorMessage(conversationId, resourceId, user.id, message);
    await recordActivity(user.id, "tutor_message");
    return result;
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
