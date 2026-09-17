"use server";

import { createClient } from "@/lib/supabase/server";
import { researchTopic, RateLimitError, ResearchFailedError } from "./index";
import type { ResourceHit } from "@/lib/search/searchResources";

export async function researchTopicAction(
  query: string
): Promise<{ resources: ResourceHit[] } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please sign in to use AI research." };
  }

  try {
    const resources = await researchTopic(query, user.id);
    return { resources };
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof ResearchFailedError) {
      return { error: err.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
}
