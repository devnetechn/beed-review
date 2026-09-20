import OpenAI from "openai";
import { ResearchResponseSchema, type ResearchedResource } from "./types";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";

function buildResearchJsonSchema(subjectSlugs: string[]) {
  return {
    type: "object",
    properties: {
      resources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            author: { type: ["string", "null"] },
            source: { type: "string" },
            original_url: { type: "string" },
            description: { type: "string" },
            resource_type: {
              type: "string",
              enum: ["article", "pdf", "course_material", "study_guide", "practice_questions"],
            },
            license: { type: ["string", "null"] },
            license_status: {
              type: "string",
              enum: [
                "OPEN_LICENSE",
                "PUBLIC_DOMAIN",
                "OPEN_ACCESS",
                "LICENSE_UNCLEAR",
                "COPYRIGHTED",
                "NOT_RECOMMENDED",
              ],
            },
            license_evidence: { type: "string" },
            subject_slug: { type: "string", enum: subjectSlugs },
            topics: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
          },
          required: [
            "title",
            "author",
            "source",
            "original_url",
            "description",
            "resource_type",
            "license",
            "license_status",
            "license_evidence",
            "subject_slug",
            "topics",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["resources"],
    additionalProperties: false,
  } as const;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function callOpenAIResearch(
  query: string,
  courseLabel: string,
  subjects: { slug: string; name: string }[]
): Promise<ResearchedResource[]> {
  const response = await getClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    tools: [{ type: "web_search" }],
    input: [
      { role: "system", content: buildSystemPrompt(courseLabel, subjects) },
      { role: "user", content: buildUserPrompt(query, courseLabel) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "research_results",
        schema: buildResearchJsonSchema(subjects.map((s) => s.slug)),
        strict: true,
      },
    },
  });

  const raw = response.output_text;
  const parsed = JSON.parse(raw);
  const validated = ResearchResponseSchema.parse(parsed);
  return validated.resources;
}
