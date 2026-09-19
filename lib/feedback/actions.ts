"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitFeedback(message: string): Promise<{ error: string } | { ok: true }> {
  const trimmed = message.trim();
  if (!trimmed) return { error: "Please write something first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("feedback").insert({ user_id: user.id, message: trimmed });
  if (error) return { error: "Couldn't send feedback. Try again." };

  return { ok: true };
}
