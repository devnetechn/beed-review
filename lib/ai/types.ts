import { z } from "zod";

export const SummarySchema = z.object({
  key_concepts: z.array(z.string().min(1)).min(1).max(8),
  definitions: z
    .array(z.object({ term: z.string().min(1), definition: z.string().min(1) }))
    .max(8),
  names_and_theories: z.array(z.string().min(1)).max(8),
  facts: z.array(z.string().min(1)).max(8),
  exam_notes: z.array(z.string().min(1)).min(1).max(8),
  simple_explanation: z.string().min(1),
});
export type Summary = z.infer<typeof SummarySchema>;

export const QuizQuestionSchema = z.object({
  question: z.string().min(1),
  choices: z.array(z.string().min(1)).length(4),
  correct_answer: z.string().min(1),
  explanation: z.string().min(1),
});
export const QuizResponseSchema = z.object({
  questions: z.array(QuizQuestionSchema),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export type QuizQuestionResult = QuizQuestion & { id: string };

export const TUTOR_CATEGORY_VALUES = [
  "COURSE_RELATED",
  "RANDOM_TRIVIA",
  "OUT_OF_COURSE",
  "UNSAFE_OR_RESTRICTED",
  "SYSTEM_OR_PROMPT_INJECTION",
] as const;
export type TutorCategory = (typeof TUTOR_CATEGORY_VALUES)[number];

export const TutorReplySchema = z.object({
  category: z.enum(TUTOR_CATEGORY_VALUES),
  // Empty for every category except COURSE_RELATED — the application
  // substitutes its own fixed message for the rest, so the model isn't
  // required to fill this in for them.
  reply: z.string(),
  wants_extreme_quiz: z.boolean(),
});
export type TutorReply = z.infer<typeof TutorReplySchema>;
