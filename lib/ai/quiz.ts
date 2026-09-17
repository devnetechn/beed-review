import { getOpenAIClient } from "./client";
import { QuizResponseSchema, type QuizQuestionResult } from "./types";
import { fetchContent } from "./fetchContent";
import { createServiceClient } from "@/lib/supabase/service";

const QUIZ_JSON_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          choices: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          correct_answer: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["question", "choices", "correct_answer", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

function buildQuizSystemPrompt(count: number, difficulty: string): string {
  return `You are a quiz question generator for a Bachelor of Elementary Education (BEEd) exam-prep app. Generate exactly ${count} multiple-choice practice questions at ${difficulty} difficulty, based on the given resource. Each question needs exactly 4 choices, one correct_answer that exactly matches one of the choices verbatim, and a short explanation of why it's correct. These are AI-generated practice questions, not official LET exam questions — write them to be genuinely useful for review, grounded in the given content, not generic trivia.`;
}

function buildQuizUserPrompt(
  resource: { title: string; description: string | null },
  content: string | null
): string {
  if (content) {
    return `Resource: "${resource.title}"\n\nContent excerpt:\n${content}\n\nGenerate the questions from this content.`;
  }
  return `Resource: "${resource.title}"\nDescription: ${resource.description ?? "(none)"}\n\nOnly this metadata is available (no full text) — generate general review questions on this topic area.`;
}

export async function generateQuiz(
  resourceId: string,
  userId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: "easy" | "medium" | "hard"
): Promise<{ attemptId: string; questions: QuizQuestionResult[] }> {
  const supabase = createServiceClient();

  const { data: resource } = await supabase
    .from("resources")
    .select("title, description, resource_type, license_status, original_url")
    .eq("id", resourceId)
    .single();

  if (!resource) throw new Error("Resource not found");

  const content = await fetchContent(resource);

  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildQuizSystemPrompt(count, difficulty) },
      { role: "user", content: buildQuizUserPrompt(resource, content) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "quiz_questions",
        schema: QUIZ_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  const parsed = QuizResponseSchema.parse(JSON.parse(response.output_text));

  const { data: attempt, error: attemptError } = await supabase
    .from("quiz_attempts")
    .insert({
      user_id: userId,
      resource_id: resourceId,
      difficulty,
      total_questions: parsed.questions.length,
    })
    .select("id")
    .single();

  if (attemptError || !attempt) throw new Error("Failed to create quiz attempt");

  const { data: insertedQuestions, error: questionsError } = await supabase
    .from("quiz_questions")
    .insert(
      parsed.questions.map((q) => ({
        quiz_attempt_id: attempt.id,
        question_text: q.question,
        choices: q.choices,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        is_ai_generated: true,
      }))
    )
    .select("id, question_text, choices, correct_answer, explanation");

  if (questionsError || !insertedQuestions) throw new Error("Failed to save quiz questions");

  return {
    attemptId: attempt.id,
    questions: insertedQuestions.map((q) => ({
      id: q.id,
      question: q.question_text,
      choices: q.choices as string[],
      correct_answer: q.correct_answer,
      explanation: q.explanation ?? "",
    })),
  };
}
