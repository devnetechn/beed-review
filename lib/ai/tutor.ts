import { getOpenAIClient } from "./client";
import { createServiceClient } from "@/lib/supabase/service";

type ChatMessage = { role: "user" | "assistant"; content: string };

function buildTutorSystemPrompt(resourceContext: string | null): string {
  const base = `You are a friendly, focused AI tutor for a Bachelor of Elementary Education (BEEd) exam-prep app, helping students prepare for the Philippine LET (Licensure Examination for Teachers). Stay strictly on BEEd/LET-related educational topics — politely decline unrelated requests. You can explain topics, simplify concepts, give examples, offer memory tricks/mnemonics, and quiz the student conversationally. Be concise and exam-focused.`;
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
): Promise<string> {
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
  });

  const reply = response.output_text;

  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
  });

  return reply;
}
