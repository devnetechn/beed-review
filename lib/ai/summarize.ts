import { getOpenAIClient } from "./client";
import { SummarySchema, type Summary } from "./types";
import { fetchContent } from "./fetchContent";
import { createServiceClient } from "@/lib/supabase/service";

const FRESHNESS_DAYS = 7;

const SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    key_concepts: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    definitions: {
      type: "array",
      items: {
        type: "object",
        properties: { term: { type: "string" }, definition: { type: "string" } },
        required: ["term", "definition"],
        additionalProperties: false,
      },
      maxItems: 8,
    },
    names_and_theories: { type: "array", items: { type: "string" }, maxItems: 8 },
    facts: { type: "array", items: { type: "string" }, maxItems: 8 },
    exam_notes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    simple_explanation: { type: "string" },
  },
  required: [
    "key_concepts",
    "definitions",
    "names_and_theories",
    "facts",
    "exam_notes",
    "simple_explanation",
  ],
  additionalProperties: false,
} as const;

function buildSummarySystemPrompt(): string {
  return `You are a study-notes assistant for a Bachelor of Elementary Education (BEEd) exam-prep app. Given information about an educational resource, produce ORIGINAL, CONCISE study notes — never long verbatim quotes from the source. If given the resource's actual text content, synthesize your own summary from it; if only given metadata (title/description), produce a lighter overview based on that alone. Focus on what a BEEd/LET exam-taker needs: key concepts, definitions, important names/theories, important facts, exam-focused notes, and a simple plain-language explanation.`;
}

function buildSummaryUserPrompt(
  resource: { title: string; description: string | null },
  content: string | null
): string {
  if (content) {
    return `Resource: "${resource.title}"\n\nContent excerpt:\n${content}\n\nProduce study notes from this content.`;
  }
  return `Resource: "${resource.title}"\nDescription: ${resource.description ?? "(none)"}\n\nOnly this metadata is available (no full text) — produce a lighter overview study note based on this alone.`;
}

function formatSummaryMarkdown(summary: Summary): string {
  const lines: string[] = ["## Key Concepts"];
  summary.key_concepts.forEach((c) => lines.push(`- ${c}`));

  if (summary.definitions.length > 0) {
    lines.push("", "## Definitions");
    summary.definitions.forEach((d) => lines.push(`- **${d.term}**: ${d.definition}`));
  }
  if (summary.names_and_theories.length > 0) {
    lines.push("", "## Names & Theories");
    summary.names_and_theories.forEach((n) => lines.push(`- ${n}`));
  }
  if (summary.facts.length > 0) {
    lines.push("", "## Facts");
    summary.facts.forEach((f) => lines.push(`- ${f}`));
  }

  lines.push("", "## Exam-Focused Notes");
  summary.exam_notes.forEach((e) => lines.push(`- ${e}`));
  lines.push("", "## Simple Explanation", summary.simple_explanation);

  return lines.join("\n");
}

export async function summarizeResource(resourceId: string, userId: string): Promise<string> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("study_notes")
    .select("content, updated_at")
    .eq("user_id", userId)
    .eq("resource_id", resourceId)
    .maybeSingle();

  if (existing) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - FRESHNESS_DAYS);
    if (new Date(existing.updated_at) > cutoff) {
      return existing.content;
    }
  }

  const { data: resource } = await supabase
    .from("resources")
    .select("title, description, resource_type, license_status, original_url, storage_path")
    .eq("id", resourceId)
    .single();

  if (!resource) throw new Error("Resource not found");

  const content = await fetchContent(resource);

  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildSummarySystemPrompt() },
      { role: "user", content: buildSummaryUserPrompt(resource, content) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "study_summary",
        schema: SUMMARY_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  const parsed = SummarySchema.parse(JSON.parse(response.output_text));
  const markdown = formatSummaryMarkdown(parsed);

  if (existing) {
    await supabase
      .from("study_notes")
      .update({ content: markdown, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("resource_id", resourceId);
  } else {
    await supabase
      .from("study_notes")
      .insert({ user_id: userId, resource_id: resourceId, content: markdown });
  }

  return markdown;
}
