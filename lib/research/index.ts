import { findCachedResults } from "./cache";
import { checkRateLimit } from "./rateLimit";
import { callOpenAIResearch } from "./callOpenAI";
import { persistResults } from "./persist";
import type { ResourceHit } from "@/lib/search/searchResources";

export class RateLimitError extends Error {}
export class ResearchFailedError extends Error {}

export async function researchTopic(query: string, userId: string): Promise<ResourceHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cached = await findCachedResults(trimmed);
  if (cached) return cached;

  const allowed = await checkRateLimit(userId);
  if (!allowed) {
    throw new RateLimitError("You've hit today's research limit — try again tomorrow.");
  }

  let results;
  try {
    results = await callOpenAIResearch(trimmed);
  } catch {
    throw new ResearchFailedError("Research failed. Please try again.");
  }

  if (results.length === 0) return [];

  return persistResults(trimmed, userId, results);
}
