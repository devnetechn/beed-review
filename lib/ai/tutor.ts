import { getOpenAIClient } from "./client";
import { createServiceClient } from "@/lib/supabase/service";
import { TutorReplySchema } from "./types";

type ChatMessage = { role: "user" | "assistant"; content: string };

const TUTOR_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    wants_extreme_quiz: { type: "boolean" },
  },
  required: ["reply", "wants_extreme_quiz"],
  additionalProperties: false,
} as const;

function buildTutorSystemPrompt(resourceContext: string | null): string {
  const base = `You are a friendly, focused AI tutor for a Bachelor of Elementary Education (BEEd) exam-prep app, helping students prepare for the Philippine LET (Licensure Examination for Teachers). Stay strictly on BEEd/LET-related educational topics — politely decline unrelated requests. You can explain topics, simplify concepts, give examples, offer memory tricks/mnemonics, and quiz the student conversationally. Be concise and exam-focused.

Respond with a JSON object containing "reply" (your conversational reply text) and "wants_extreme_quiz" (boolean). Set "wants_extreme_quiz" to true only when the student is explicitly asking to be quizzed, tested, or challenged with practice questions — in any phrasing or language — otherwise false. When true, keep "reply" natural (e.g. acknowledge the request) — a separate UI element will offer the quiz, so don't generate quiz questions yourself in "reply".`;
  if (resourceContext) {
    return `${base}\n\nThis conversation is focused on a specific resource:\n${resourceContext}\n\nGround your answers in this resource when relevant.`;
  }
  return base;
}

export async function getOrCreateConversation(
  userId: string,
  resourceId: string | null
): Promise<{ conversationId: string; messages: ChatMessage[] }> {
  const supabase = createServiceClient();

  let query = supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  query = resourceId ? query.eq("resource_id", resourceId) : query.is("resource_id", null);

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    const { data: messages } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", existing.id)
      .order("created_at", { ascending: true });

    return { conversationId: existing.id, messages: (messages ?? []) as ChatMessage[] };
  }

  let title = "BEEd Tutor Chat";
  if (resourceId) {
    const { data: resource } = await supabase
      .from("resources")
      .select("title")
      .eq("id", resourceId)
      .single();
    if (resource) title = `Chat about: ${resource.title}`;
  }

  const { data: created, error } = await supabase
    .from("ai_conversations")
    .insert({ user_id: userId, resource_id: resourceId, title })
    .select("id")
    .single();

  if (error || !created) throw new Error("Failed to create conversation");

  return { conversationId: created.id, messages: [] };
}

export async function sendTutorMessage(
  conversationId: string,
  resourceId: string | null,
  userMessage: string
): Promise<{ reply: string; wantsExtremeQuiz: boolean }> {
  const supabase = createServiceClient();

  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: userMessage,
  });

  const { data: history } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  let resourceContext: string | null = null;
  if (resourceId) {
    const { data: resource } = await supabase
      .from("resources")
      .select("title, description")
      .eq("id", resourceId)
      .single();
    if (resource) {
      resourceContext = `Title: ${resource.title}\nDescription: ${resource.description ?? "(none)"}`;
    }
  }

  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildTutorSystemPrompt(resourceContext) },
      ...((history ?? []) as ChatMessage[]).map((m) => ({ role: m.role, content: m.content })),
    ],
    text: {
      format: {
        type: "json_schema",
        name: "tutor_reply",
        schema: TUTOR_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  let parsed: { reply: string; wants_extreme_quiz: boolean };
  try {
    parsed = TutorReplySchema.parse(JSON.parse(response.output_text));
  } catch {
    parsed = { reply: response.output_text, wants_extreme_quiz: false };
  }

  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: parsed.reply,
  });

  return { reply: parsed.reply, wantsExtremeQuiz: parsed.wants_extreme_quiz };
}
