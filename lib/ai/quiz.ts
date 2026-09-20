import { getOpenAIClient } from "./client";
import { QuizResponseSchema, type QuizQuestionResult } from "./types";
import { fetchContent } from "./fetchContent";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveCourseLabel } from "@/lib/sources/courses";

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

export type QuizDifficulty = "easy" | "medium" | "hard" | "extreme";

function buildQuizSystemPrompt(count: number, difficulty: QuizDifficulty, courseLabel: string): string {
  const extremeInstruction =
    difficulty === "extreme"
      ? " This is EXTREME difficulty: write questions that would challenge a top-performing reviewee — trickier distractors, less forgiving phrasing, edge-case scenarios, and details that require precise recall, not just general familiarity."
      : "";
  return `You are a quiz question generator for ${courseLabel}. Generate exactly ${count} multiple-choice practice questions at ${difficulty} difficulty, based on the given resource.${extremeInstruction} Each question needs exactly 4 choices, one correct_answer that exactly matches one of the choices verbatim, and a short explanation of why it's correct. These are AI-generated practice questions, not official exam questions — write them to be genuinely useful for review, grounded in the given content, not generic trivia.`;
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
  difficulty: QuizDifficulty
): Promise<{ attemptId: string; questions: QuizQuestionResult[] }> {
  const supabase = createServiceClient();

  const { data: resource } = await supabase
    .from("resources")
    .select("title, description, resource_type, license_status, original_url")
    .eq("id", resourceId)
    .single();

  if (!resource) throw new Error("Resource not found");

  const content = await fetchContent(resource);

  const { data: profile } = await supabase
    .from("profiles")
    .select("courses(slug)")
    .eq("id", userId)
    .maybeSingle();
  const profileCourse = Array.isArray(profile?.courses) ? profile?.courses[0] : profile?.courses;
  let courseSlug = profileCourse?.slug;

  if (!courseSlug) {
    // Fallback for the rare case a profile has no course set: use the
    // resource's own classification instead of defaulting to BEEd blind.
    // A resource shared across courses (upserted by URL) can carry links
    // to more than one course's topics, so this is a best-effort guess —
    // resolving from the requesting user's own course (above) is always
    // preferred when available.
    const { data: linkedTopicRow } = await supabase
      .from("resource_topics")
      .select("topics(subjects(courses(slug)))")
      .eq("resource_id", resourceId)
      .limit(1)
      .maybeSingle();

    const linkedTopic = Array.isArray(linkedTopicRow?.topics)
      ? linkedTopicRow?.topics[0]
      : linkedTopicRow?.topics;
    const linkedSubject = linkedTopic
      ? Array.isArray(linkedTopic.subjects)
        ? linkedTopic.subjects[0]
        : linkedTopic.subjects
      : null;
    const linkedCourse = linkedSubject
      ? Array.isArray(linkedSubject.courses)
        ? linkedSubject.courses[0]
        : linkedSubject.courses
      : null;
    courseSlug = linkedCourse?.slug;
  }
  const courseLabel = resolveCourseLabel(courseSlug);

  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildQuizSystemPrompt(count, difficulty, courseLabel) },
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

function buildTopicQuizUserPrompt(
  topicName: string,
  subjectName: string,
  contextLines: string[],
  courseLabel: string
): string {
  const context =
    contextLines.length > 0
      ? contextLines.join("\n")
      : `(no linked resources yet — generate from general knowledge of this subject's curriculum, appropriate for ${courseLabel})`;
  return `Topic: "${topicName}" (Subject: ${subjectName})\n\nRelated resources:\n${context}\n\nGenerate the questions for this topic.`;
}

export async function generateTopicQuiz(
  topicId: string,
  userId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: QuizDifficulty
): Promise<{ attemptId: string; totalQuestions: number }> {
  const supabase = createServiceClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("name, subjects(name, courses(slug))")
    .eq("id", topicId)
    .single();

  if (!topic) throw new Error("Topic not found");
  const subject = Array.isArray(topic.subjects) ? topic.subjects[0] : topic.subjects;
  const topicCourseRow = subject
    ? Array.isArray(subject.courses)
      ? subject.courses[0]
      : subject.courses
    : null;
  const courseLabel = resolveCourseLabel(topicCourseRow?.slug);

  const { data: linkedResources } = await supabase
    .from("resource_topics")
    .select("resources(title, description)")
    .eq("topic_id", topicId)
    .limit(3);

  const contextLines = (linkedResources ?? [])
    .map((r) => (Array.isArray(r.resources) ? r.resources[0] : r.resources))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => `- ${r.title}: ${r.description ?? ""}`);

  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildQuizSystemPrompt(count, difficulty, courseLabel) },
      {
        role: "user",
        content: buildTopicQuizUserPrompt(
          topic.name,
          subject?.name ?? "General",
          contextLines,
          courseLabel
        ),
      },
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
      topic_id: topicId,
      difficulty,
      total_questions: parsed.questions.length,
    })
    .select("id")
    .single();

  if (attemptError || !attempt) throw new Error("Failed to create quiz attempt");

  const { error: questionsError } = await supabase.from("quiz_questions").insert(
    parsed.questions.map((q) => ({
      quiz_attempt_id: attempt.id,
      question_text: q.question,
      choices: q.choices,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      is_ai_generated: true,
    }))
  );

  if (questionsError) throw new Error("Failed to save quiz questions");

  return { attemptId: attempt.id, totalQuestions: parsed.questions.length };
}

function buildSubjectQuizUserPrompt(
  subjectName: string,
  topicNames: string[],
  contextLines: string[],
  courseLabel: string
): string {
  const context =
    contextLines.length > 0
      ? contextLines.join("\n")
      : `(no linked resources yet — generate from general knowledge of this subject's curriculum, appropriate for ${courseLabel})`;
  return `Subject: "${subjectName}"\n\nTopics covered in this subject:\n${topicNames.map((t) => `- ${t}`).join("\n")}\n\nRelated resources:\n${context}\n\nGenerate the questions spanning a mix of the topics above, not just one of them.`;
}

export async function generateSubjectQuiz(
  subjectId: string,
  userId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: QuizDifficulty
): Promise<{ attemptId: string; totalQuestions: number }> {
  const supabase = createServiceClient();

  const { data: subject } = await supabase
    .from("subjects")
    .select("name, courses(slug)")
    .eq("id", subjectId)
    .single();

  if (!subject) throw new Error("Subject not found");
  const subjectCourseRow = Array.isArray(subject.courses) ? subject.courses[0] : subject.courses;
  const courseLabel = resolveCourseLabel(subjectCourseRow?.slug);

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name")
    .eq("subject_id", subjectId);

  if (!topics || topics.length === 0) throw new Error("No topics found for this subject");

  const topicIds = topics.map((t) => t.id);

  const { data: linkedResources } = await supabase
    .from("resource_topics")
    .select("resources(title, description)")
    .in("topic_id", topicIds)
    .limit(8);

  const contextLines = (linkedResources ?? [])
    .map((r) => (Array.isArray(r.resources) ? r.resources[0] : r.resources))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => `- ${r.title}: ${r.description ?? ""}`);

  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildQuizSystemPrompt(count, difficulty, courseLabel) },
      {
        role: "user",
        content: buildSubjectQuizUserPrompt(
          subject.name,
          topics.map((t) => t.name),
          contextLines,
          courseLabel
        ),
      },
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
      subject_id: subjectId,
      difficulty,
      total_questions: parsed.questions.length,
    })
    .select("id")
    .single();

  if (attemptError || !attempt) throw new Error("Failed to create quiz attempt");

  const { error: questionsError } = await supabase.from("quiz_questions").insert(
    parsed.questions.map((q) => ({
      quiz_attempt_id: attempt.id,
      question_text: q.question,
      choices: q.choices,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      is_ai_generated: true,
    }))
  );

  if (questionsError) throw new Error("Failed to save quiz questions");

  return { attemptId: attempt.id, totalQuestions: parsed.questions.length };
}
