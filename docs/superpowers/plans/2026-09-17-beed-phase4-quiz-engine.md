# BEEd Exam Prep Platform — Phase 4 Implementation Plan: Quiz Engine, Progress Tracking, Weak-Topic Detection, Recommendations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Phase 3's quiz *generation* into a real scored quiz-taking engine, track quiz history, detect weak topics from actual performance, and replace the Dashboard's static recommendations with data-driven ones.

**Architecture:** A new `lib/quiz/` module (attempt loading/scoring, weak-topic aggregation) sits alongside Phase 3's `lib/ai/quiz.ts` (extended with topic-level generation). A new dynamic route `/quiz/[attemptId]` dispatches between a client-side question-taking UI and a server-rendered scored review based on whether `quiz_attempts.score` is set.

**Tech Stack:** No new packages — reuses everything from Phases 1-3.

**Spec:** `docs/superpowers/specs/2026-09-17-beed-phase4-quiz-engine-design.md`

## Prerequisites

The local Postgres password and hosted Supabase DB password used in prior phases (needed again for Task 1's migration).

## Global Constraints

- `quiz_attempts.score` being `null` vs. set is the sole signal for "in progress" vs. "scored" — no separate status column.
- The client taking a quiz never receives `correct_answer` before submission — `getQuizAttempt` strips it when `scored: false`.
- Weak-topic detection only counts topics with ≥ 3 answered questions (enough signal) — fewer than that is excluded, not shown with a misleadingly small sample.
- No automated test framework — verification is `npm run build` plus manual runs against the real Supabase + OpenAI projects.
- Do not run `git commit` unless the user explicitly asks.

---

## File Structure

```
supabase/migrations/
  0003_quiz_questions_selected_answer.sql   # NEW

lib/ai/
  quiz.ts                                     # MODIFIED: adds generateTopicQuiz()

lib/quiz/
  types.ts                                      # NEW: QuizQuestionForTaking, QuizQuestionReview, QuizAttemptView, WeakTopic
  attempt.ts                                      # NEW: getQuizAttempt(), submitQuiz()
  weakTopics.ts                                     # NEW: getWeakTopics(), getRecommendedTopics()
  actions.ts                                          # NEW: startTopicQuizAction, submitQuizAction

app/api/topics/route.ts                                 # NEW: GET topics for a subject slug

components/quiz/
  QuizTaker.tsx                                          # NEW: one-question-at-a-time client UI
  QuizReview.tsx                                           # NEW: scored review display

app/(app)/quiz/
  page.tsx                                                   # MODIFIED: subject/topic/count/difficulty wizard
  [attemptId]/page.tsx                                         # NEW: taking/review dispatcher

app/(app)/page.tsx                                              # MODIFIED: Recent Quizzes, Weak Areas, real Recommended
```

---

### Task 1: Migration — `selected_answer` Column

**Files:**
- Create: `supabase/migrations/0003_quiz_questions_selected_answer.sql`

**Interfaces:**
- Produces: `quiz_questions.selected_answer` (nullable text) — consumed by `attempt.ts` (Task 4) and `weakTopics.ts` (Task 5).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_quiz_questions_selected_answer.sql`:

```sql
alter table quiz_questions add column selected_answer text;
```

- [ ] **Step 2: Apply to local Postgres**

Apply via `psql -f` against the same local Postgres connection used in prior phases (`localhost:8000`, db `beed_review`).

Expected: `ALTER TABLE` with no errors.

- [ ] **Step 3: Apply to the hosted Supabase project**

Apply the same file against `db.svfqneambjkmktidaypa.supabase.co:5432`.

Expected: `ALTER TABLE` with no errors.

---

### Task 2: Topic-Level Quiz Generation

**Files:**
- Modify: `lib/ai/quiz.ts` (append a new function; do not change the existing `generateQuiz`)

**Interfaces:**
- Consumes: `getOpenAIClient`, `QUIZ_JSON_SCHEMA`, `buildQuizSystemPrompt`, `QuizResponseSchema`, `createServiceClient` — all already present in this file from Phase 3.
- Produces: `generateTopicQuiz(topicId: string, userId: string, count: 5 | 10 | 20 | 50, difficulty: "easy" | "medium" | "hard"): Promise<{ attemptId: string; totalQuestions: number }>` — consumed by `actions.ts` (Task 6).

- [ ] **Step 1: Append the topic-quiz prompt builder and generator**

Find the end of `lib/ai/quiz.ts` (the closing of `generateQuiz`'s return statement and its function body):

```ts
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
```

Append immediately after it (same file):

```ts

function buildTopicQuizUserPrompt(
  topicName: string,
  subjectName: string,
  contextLines: string[]
): string {
  const context =
    contextLines.length > 0
      ? contextLines.join("\n")
      : "(no linked resources yet — generate from general BEEd/LET curriculum knowledge of this topic)";
  return `Topic: "${topicName}" (Subject: ${subjectName})\n\nRelated resources:\n${context}\n\nGenerate the questions for this topic.`;
}

export async function generateTopicQuiz(
  topicId: string,
  userId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: "easy" | "medium" | "hard"
): Promise<{ attemptId: string; totalQuestions: number }> {
  const supabase = createServiceClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("name, subjects(name)")
    .eq("id", topicId)
    .single();

  if (!topic) throw new Error("Topic not found");
  const subject = Array.isArray(topic.subjects) ? topic.subjects[0] : topic.subjects;

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
      { role: "system", content: buildQuizSystemPrompt(count, difficulty) },
      {
        role: "user",
        content: buildTopicQuizUserPrompt(topic.name, subject?.name ?? "General", contextLines),
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 3: Quiz Engine Types

**Files:**
- Create: `lib/quiz/types.ts`

**Interfaces:**
- Produces: `QuizQuestionForTaking`, `QuizQuestionReview`, `QuizAttemptView`, `WeakTopic` — consumed by Tasks 4, 5, 8, 9.

- [ ] **Step 1: Write the types**

Create `lib/quiz/types.ts`:

```ts
export type QuizQuestionForTaking = {
  id: string;
  question: string;
  choices: string[];
};

export type QuizQuestionReview = QuizQuestionForTaking & {
  correct_answer: string;
  selected_answer: string | null;
  explanation: string;
};

export type QuizAttemptView =
  | {
      scored: false;
      attemptId: string;
      label: string;
      totalQuestions: number;
      questions: QuizQuestionForTaking[];
    }
  | {
      scored: true;
      attemptId: string;
      label: string;
      score: number;
      totalQuestions: number;
      questions: QuizQuestionReview[];
    };

export type WeakTopic = {
  topicId: string;
  topicName: string;
  subjectName: string;
  accuracy: number;
  totalQuestions: number;
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 4: Attempt Loading + Scoring

**Files:**
- Create: `lib/quiz/attempt.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/service`, `QuizAttemptView` from `./types`
- Produces: `getQuizAttempt(attemptId: string, userId: string): Promise<QuizAttemptView | null>`, `submitQuiz(attemptId: string, userId: string, answers: { questionId: string; selectedAnswer: string }[]): Promise<{ score: number; totalQuestions: number }>` — consumed by `actions.ts` (Task 6) and `/quiz/[attemptId]/page.tsx` (Task 9).

- [ ] **Step 1: Write attempt.ts**

Create `lib/quiz/attempt.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import type { QuizAttemptView } from "./types";

export async function getQuizAttempt(
  attemptId: string,
  userId: string
): Promise<QuizAttemptView | null> {
  const supabase = createServiceClient();

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, user_id, score, total_questions, resource_id, topic_id, resources(title), topics(name)")
    .eq("id", attemptId)
    .maybeSingle();

  if (!attempt || attempt.user_id !== userId) return null;

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, question_text, choices, correct_answer, selected_answer, explanation")
    .eq("quiz_attempt_id", attemptId)
    .order("created_at", { ascending: true });

  const resource = Array.isArray(attempt.resources) ? attempt.resources[0] : attempt.resources;
  const topic = Array.isArray(attempt.topics) ? attempt.topics[0] : attempt.topics;
  const label = resource?.title ?? topic?.name ?? "Quiz";
  const totalQuestions = attempt.total_questions ?? questions?.length ?? 0;

  if (attempt.score !== null) {
    return {
      scored: true,
      attemptId: attempt.id,
      label,
      score: attempt.score,
      totalQuestions,
      questions: (questions ?? []).map((q) => ({
        id: q.id,
        question: q.question_text,
        choices: q.choices as string[],
        correct_answer: q.correct_answer,
        selected_answer: q.selected_answer,
        explanation: q.explanation ?? "",
      })),
    };
  }

  return {
    scored: false,
    attemptId: attempt.id,
    label,
    totalQuestions,
    questions: (questions ?? []).map((q) => ({
      id: q.id,
      question: q.question_text,
      choices: q.choices as string[],
    })),
  };
}

export async function submitQuiz(
  attemptId: string,
  userId: string,
  answers: { questionId: string; selectedAnswer: string }[]
): Promise<{ score: number; totalQuestions: number }> {
  const supabase = createServiceClient();

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("user_id, total_questions")
    .eq("id", attemptId)
    .single();

  if (!attempt || attempt.user_id !== userId) throw new Error("Quiz attempt not found");

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, correct_answer")
    .eq("quiz_attempt_id", attemptId);

  const correctMap = new Map((questions ?? []).map((q) => [q.id, q.correct_answer]));

  let score = 0;
  for (const a of answers) {
    if (correctMap.get(a.questionId) === a.selectedAnswer) score += 1;
    await supabase
      .from("quiz_questions")
      .update({ selected_answer: a.selectedAnswer })
      .eq("id", a.questionId);
  }

  await supabase.from("quiz_attempts").update({ score }).eq("id", attemptId);

  return { score, totalQuestions: attempt.total_questions ?? answers.length };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 5: Weak-Topic Detection + Recommendations

**Files:**
- Create: `lib/quiz/weakTopics.ts`

**Interfaces:**
- Consumes: `createServiceClient`, `WeakTopic` from `./types`
- Produces: `getWeakTopics(userId: string, limit?: number): Promise<WeakTopic[]>`, `getRecommendedTopics(userId: string, limit?: number): Promise<string[]>` — consumed by `app/(app)/page.tsx` (Task 10).

- [ ] **Step 1: Write weakTopics.ts**

Create `lib/quiz/weakTopics.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import type { WeakTopic } from "./types";

const MIN_QUESTIONS_FOR_SIGNAL = 3;

type TopicRow = { id: string; name: string; subjects: { name: string } | { name: string }[] | null };

export async function getWeakTopics(userId: string, limit = 3): Promise<WeakTopic[]> {
  const supabase = createServiceClient();

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, resource_id, topic_id")
    .eq("user_id", userId)
    .not("score", "is", null);

  if (!attempts || attempts.length === 0) return [];

  const attemptIds = attempts.map((a) => a.id);
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("quiz_attempt_id, correct_answer, selected_answer")
    .in("quiz_attempt_id", attemptIds)
    .not("selected_answer", "is", null);

  const attemptStats = new Map<string, { correct: number; total: number }>();
  for (const q of questions ?? []) {
    const stat = attemptStats.get(q.quiz_attempt_id) ?? { correct: 0, total: 0 };
    stat.total += 1;
    if (q.selected_answer === q.correct_answer) stat.correct += 1;
    attemptStats.set(q.quiz_attempt_id, stat);
  }

  const topicScores = new Map<
    string,
    { name: string; subjectName: string; correct: number; total: number }
  >();

  for (const attempt of attempts) {
    const stat = attemptStats.get(attempt.id);
    if (!stat) continue;

    let topicRows: TopicRow[] = [];

    if (attempt.topic_id) {
      const { data } = await supabase
        .from("topics")
        .select("id, name, subjects(name)")
        .eq("id", attempt.topic_id);
      topicRows = (data ?? []) as TopicRow[];
    } else if (attempt.resource_id) {
      const { data } = await supabase
        .from("resource_topics")
        .select("topics(id, name, subjects(name))")
        .eq("resource_id", attempt.resource_id);
      topicRows = (data ?? [])
        .map((r) => (Array.isArray(r.topics) ? r.topics[0] : r.topics))
        .filter((t): t is TopicRow => !!t);
    }

    for (const t of topicRows) {
      const subject = Array.isArray(t.subjects) ? t.subjects[0] : t.subjects;
      const entry = topicScores.get(t.id) ?? {
        name: t.name,
        subjectName: subject?.name ?? "",
        correct: 0,
        total: 0,
      };
      entry.correct += stat.correct;
      entry.total += stat.total;
      topicScores.set(t.id, entry);
    }
  }

  return Array.from(topicScores.entries())
    .map(([topicId, v]) => ({
      topicId,
      topicName: v.name,
      subjectName: v.subjectName,
      accuracy: v.total > 0 ? v.correct / v.total : 0,
      totalQuestions: v.total,
    }))
    .filter((t) => t.totalQuestions >= MIN_QUESTIONS_FOR_SIGNAL)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}

const DEFAULT_RECOMMENDATIONS = ["Teaching Profession", "Curriculum Development"];

export async function getRecommendedTopics(userId: string, limit = 2): Promise<string[]> {
  const weak = await getWeakTopics(userId, limit);
  if (weak.length > 0) return weak.map((w) => w.topicName);
  return DEFAULT_RECOMMENDATIONS.slice(0, limit);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 6: Quiz Server Actions

**Files:**
- Create: `lib/quiz/actions.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `generateTopicQuiz` from `@/lib/ai/quiz`, `submitQuiz` from `./attempt`
- Produces: `startTopicQuizAction(topicId: string, count: 5|10|20|50, difficulty: "easy"|"medium"|"hard"): Promise<{ attemptId: string } | { error: string }>`, `submitQuizAction(attemptId: string, answers: { questionId: string; selectedAnswer: string }[]): Promise<{ score: number; totalQuestions: number } | { error: string }>` — consumed by `app/(app)/quiz/page.tsx` (Task 9) and `QuizTaker.tsx` (Task 8).

- [ ] **Step 1: Write actions.ts**

Create `lib/quiz/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { generateTopicQuiz } from "@/lib/ai/quiz";
import { submitQuiz } from "./attempt";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function startTopicQuizAction(
  topicId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: "easy" | "medium" | "hard"
): Promise<{ attemptId: string } | { error: string }> {
  try {
    const user = await requireUser();
    const { attemptId } = await generateTopicQuiz(topicId, user.id, count, difficulty);
    return { attemptId };
  } catch {
    return { error: "Couldn't generate a quiz. Please try again." };
  }
}

export async function submitQuizAction(
  attemptId: string,
  answers: { questionId: string; selectedAnswer: string }[]
): Promise<{ score: number; totalQuestions: number } | { error: string }> {
  try {
    const user = await requireUser();
    return await submitQuiz(attemptId, user.id, answers);
  } catch {
    return { error: "Couldn't submit the quiz. Please try again." };
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 7: Topics-by-Subject API Route

**Files:**
- Create: `app/api/topics/route.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`
- Produces: `GET /api/topics?subject=<slug>` → `{ topics: { id: string; name: string }[] }` — consumed by the quiz wizard (Task 9).

- [ ] **Step 1: Write the route**

Create `app/api/topics/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const subjectSlug = request.nextUrl.searchParams.get("subject");
  if (!subjectSlug) return NextResponse.json({ topics: [] });

  const supabase = await createClient();
  const { data: subject } = await supabase
    .from("subjects")
    .select("id")
    .eq("slug", subjectSlug)
    .maybeSingle();

  if (!subject) return NextResponse.json({ topics: [] });

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name")
    .eq("subject_id", subject.id)
    .order("name", { ascending: true });

  return NextResponse.json({ topics: topics ?? [] });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 8: Quiz Taking + Review Components

**Files:**
- Create: `components/quiz/QuizTaker.tsx`, `components/quiz/QuizReview.tsx`

**Interfaces:**
- Consumes: `submitQuizAction` (Task 6), `QuizQuestionForTaking`/`QuizQuestionReview` (Task 3), `Button` from `@/components/ui/button`, `ErrorBanner`
- Produces: `QuizTaker({ attemptId, questions }: { attemptId: string; questions: QuizQuestionForTaking[] })`, `QuizReview({ score, totalQuestions, questions }: { score: number; totalQuestions: number; questions: QuizQuestionReview[] })` — consumed by `/quiz/[attemptId]/page.tsx` (Task 9).

- [ ] **Step 1: Write QuizTaker**

Create `components/quiz/QuizTaker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { submitQuizAction } from "@/lib/quiz/actions";
import type { QuizQuestionForTaking } from "@/lib/quiz/types";

export function QuizTaker({
  attemptId,
  questions,
}: {
  attemptId: string;
  questions: QuizQuestionForTaking[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = questions[index];
  const isLast = index === questions.length - 1;
  const allAnswered = questions.every((q) => answers[q.id]);

  function selectAnswer(choice: string) {
    setAnswers((prev) => ({ ...prev, [current.id]: choice }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const payload = questions.map((q) => ({ questionId: q.id, selectedAnswer: answers[q.id] }));
    const outcome = await submitQuizAction(attemptId, payload);
    setSubmitting(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Question {index + 1} of {questions.length}
      </p>
      <p className="text-base font-medium">{current.question}</p>
      <div className="space-y-2">
        {current.choices.map((choice) => (
          <button
            key={choice}
            onClick={() => selectAnswer(choice)}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
              answers[current.id] === choice
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-700"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          Previous
        </Button>
        {isLast ? (
          <Button className="flex-1" disabled={!allAnswered || submitting} onClick={handleSubmit}>
            {submitting ? "Submitting…" : "Submit Quiz"}
          </Button>
        ) : (
          <Button
            className="flex-1"
            disabled={!answers[current.id]}
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write QuizReview**

Create `components/quiz/QuizReview.tsx`:

```tsx
import type { QuizQuestionReview } from "@/lib/quiz/types";

export function QuizReview({
  score,
  totalQuestions,
  questions,
}: {
  score: number;
  totalQuestions: number;
  questions: QuizQuestionReview[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 p-4 text-center">
        <p className="text-2xl font-semibold">
          {score} / {totalQuestions}
        </p>
        <p className="text-sm text-neutral-500">
          {totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0}% correct
        </p>
      </div>
      <p className="text-xs font-medium text-amber-600">
        AI Generated — practice questions, not official LET items.
      </p>
      {questions.map((q, i) => {
        const isCorrect = q.selected_answer === q.correct_answer;
        return (
          <div key={q.id} className="space-y-1.5 border-b border-neutral-100 pb-3">
            <p className="text-sm font-medium">
              {i + 1}. {q.question}
            </p>
            <ul className="space-y-1">
              {q.choices.map((choice) => {
                const isSelected = choice === q.selected_answer;
                const isAnswer = choice === q.correct_answer;
                return (
                  <li
                    key={choice}
                    className={`rounded-md px-2 py-1 text-sm ${
                      isAnswer
                        ? "bg-green-50 text-green-800"
                        : isSelected
                          ? "bg-red-50 text-red-800"
                          : "text-neutral-600"
                    }`}
                  >
                    {choice}
                    {isSelected && !isAnswer ? " (your answer)" : ""}
                  </li>
                );
              })}
            </ul>
            {!isCorrect && <p className="text-xs text-neutral-500">{q.explanation}</p>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 9: Quiz Pages — Wizard + Attempt Dispatcher

**Files:**
- Modify: `app/(app)/quiz/page.tsx` (currently the Phase 1 placeholder)
- Create: `app/(app)/quiz/[attemptId]/page.tsx`

**Interfaces:**
- Consumes: `SUBJECTS` from `@/lib/sources/subjects`, `startTopicQuizAction` (Task 6), `getQuizAttempt` (Task 4), `QuizTaker`/`QuizReview` (Task 8)

- [ ] **Step 1: Replace the quiz wizard page**

Replace the full contents of `app/(app)/quiz/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { SUBJECTS } from "@/lib/sources/subjects";
import { startTopicQuizAction } from "@/lib/quiz/actions";

type Topic = { id: string; name: string };
const COUNTS = [5, 10, 20, 50] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export default function QuizPage() {
  const router = useRouter();
  const [step, setStep] = useState<"subject" | "topic" | "config">("subject");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [count, setCount] = useState<5 | 10 | 20 | 50>(10);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickSubject(slug: string) {
    setTopicsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics?subject=${encodeURIComponent(slug)}`);
      const data = await res.json();
      setTopics(data.topics ?? []);
      setStep("topic");
    } catch {
      setError("Couldn't load topics. Please try again.");
    } finally {
      setTopicsLoading(false);
    }
  }

  function handlePickTopic(id: string) {
    setTopicId(id);
    setStep("config");
  }

  async function handleStart() {
    if (!topicId) return;
    setStarting(true);
    setError(null);
    const outcome = await startTopicQuizAction(topicId, count, difficulty);
    setStarting(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    router.push(`/quiz/${outcome.attemptId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Take a Quiz</h1>
        <p className="text-sm text-neutral-500">Test yourself on a BEEd/LET topic.</p>
      </div>

      {error && <ErrorBanner message={error} />}

      {step === "subject" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Pick a subject</p>
          <div className="grid grid-cols-1 gap-2">
            {SUBJECTS.map((s) => (
              <Button
                key={s.slug}
                variant="outline"
                className="justify-start"
                disabled={topicsLoading}
                onClick={() => handlePickSubject(s.slug)}
              >
                {s.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {step === "topic" && (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setStep("subject")}>
            ← Back to subjects
          </Button>
          <p className="text-sm font-medium">Pick a topic</p>
          {topics.length === 0 ? (
            <p className="text-sm text-neutral-400">No topics found for this subject yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {topics.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="justify-start"
                  onClick={() => handlePickTopic(t.id)}
                >
                  {t.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === "config" && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setStep("topic")}>
            ← Back to topics
          </Button>
          <div>
            <p className="mb-2 text-sm font-medium">Number of questions</p>
            <div className="flex gap-2">
              {COUNTS.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={count === c ? "default" : "outline"}
                  onClick={() => setCount(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Difficulty</p>
            <div className="flex gap-2">
              {DIFFICULTIES.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={difficulty === d ? "default" : "outline"}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>
          <Button className="w-full" disabled={starting} onClick={handleStart}>
            {starting ? "Generating quiz…" : "Start Quiz"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the attempt dispatcher page**

Create `app/(app)/quiz/[attemptId]/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getQuizAttempt } from "@/lib/quiz/attempt";
import { QuizTaker } from "@/components/quiz/QuizTaker";
import { QuizReview } from "@/components/quiz/QuizReview";
import { EmptyState } from "@/components/common/EmptyState";

export const dynamic = "force-dynamic";

export default async function QuizAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <EmptyState message="Please sign in to view this quiz." />;
  }

  const attempt = await getQuizAttempt(attemptId, user.id);

  if (!attempt) {
    return <EmptyState message="Quiz not found." />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{attempt.label}</h1>
      {attempt.scored ? (
        <QuizReview
          score={attempt.score}
          totalQuestions={attempt.totalQuestions}
          questions={attempt.questions}
        />
      ) : (
        <QuizTaker attemptId={attempt.attemptId} questions={attempt.questions} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 10: Dashboard Integration

**Files:**
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `getWeakTopics`, `getRecommendedTopics` (Task 5)

- [ ] **Step 1: Replace the dashboard page**

Replace the full contents of `app/(app)/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getWeakTopics, getRecommendedTopics } from "@/lib/quiz/weakTopics";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: saved } = await supabase
    .from("saved_resources")
    .select("id, resources(id, title, source)")
    .eq("user_id", user?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: recentQuizzes } = await supabase
    .from("quiz_attempts")
    .select("id, score, total_questions, created_at, resources(title), topics(name)")
    .eq("user_id", user?.id ?? "")
    .not("score", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);

  const weakTopics = user ? await getWeakTopics(user.id, 3) : [];
  const recommended = user ? await getRecommendedTopics(user.id, 2) : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{greeting()}</h1>
        <p className="text-neutral-500">What do you want to study?</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Link href="/search">
          <Button className="w-full justify-start" size="lg">
            Search Reviewer
          </Button>
        </Link>
        <Link href="/tutor">
          <Button variant="outline" className="w-full justify-start" size="lg">
            Ask AI Tutor
          </Button>
        </Link>
        <Link href="/quiz">
          <Button variant="outline" className="w-full justify-start" size="lg">
            Take a Quiz
          </Button>
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Recently Saved</h2>
        {saved && saved.length > 0 ? (
          <div className="space-y-2">
            {saved.map((row) => {
              const resource = Array.isArray(row.resources) ? row.resources[0] : row.resources;
              if (!resource) return null;
              return (
                <Card key={row.id} className="p-3">
                  <div className="font-medium">{resource.title}</div>
                  <div className="text-sm text-neutral-500">{resource.source}</div>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            Nothing saved yet. Search for a topic and save resources to your library.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Recent Quizzes</h2>
        {recentQuizzes && recentQuizzes.length > 0 ? (
          <div className="space-y-2">
            {recentQuizzes.map((q) => {
              const resource = Array.isArray(q.resources) ? q.resources[0] : q.resources;
              const topic = Array.isArray(q.topics) ? q.topics[0] : q.topics;
              const label = resource?.title ?? topic?.name ?? "Quiz";
              return (
                <Link key={q.id} href={`/quiz/${q.id}`}>
                  <Card className="p-3">
                    <div className="font-medium">{label}</div>
                    <div className="text-sm text-neutral-500">
                      {q.score}/{q.total_questions} · {new Date(q.created_at).toLocaleDateString()}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No quizzes taken yet.</p>
        )}
      </section>

      {weakTopics.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-500">Weak Areas</h2>
          <div className="flex flex-wrap gap-2">
            {weakTopics.map((t) => (
              <span
                key={t.topicId}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800"
              >
                {t.topicName} ({Math.round(t.accuracy * 100)}%)
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Recommended for You</h2>
        <div className="flex flex-wrap gap-2">
          {recommended.map((name) => (
            <span key={name} className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm">
              {name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 11: Manual End-to-End Verification

**Files:** none (verification only)

- [ ] **Step 1: Take a full quiz**

Run `npm run dev`, sign in, go to `/quiz`. Pick a subject with seeded/AI-found resources (e.g. Child and Adolescent Development), pick a topic, pick 5 questions / easy, start. Expected: redirected to `/quiz/[attemptId]`, one question at a time, choices selectable, Next disabled until an answer is picked, Previous works, Submit Quiz appears only on the last question and stays disabled until all 5 are answered.

- [ ] **Step 2: Submit and review**

Submit. Expected: the page re-renders (via `router.refresh()`) into review mode — score prominently shown, each question showing the correct answer in green and, if wrong, the user's pick in red plus an explanation. Cross-check the score against `select id, correct_answer, selected_answer from quiz_questions where quiz_attempt_id = '<id>';` directly in Postgres — the displayed score must match a manual count of matching rows.

- [ ] **Step 3: Weak topics + recommendations**

Take 2-3 more quizzes on the same topic, deliberately answering most questions wrong on at least one. Go to `/`. Expected: "Weak Areas" appears showing that topic with a low percentage (only once ≥ 3 answered questions exist for it), and "Recommended for You" now shows that topic name instead of the static defaults.

- [ ] **Step 4: Recent Quizzes**

Confirm the Dashboard's "Recent Quizzes" section lists the attempts just taken, most recent first, each showing `score/total` and a date, and that tapping one navigates to its `/quiz/[attemptId]` review.

- [ ] **Step 5: Topic with no linked resources**

Pick a subject/topic that has no AI-found or seeded resources yet, start a quiz. Expected: still generates real questions (from the AI's general knowledge of the topic, per the fallback in `generateTopicQuiz`), not an error.

- [ ] **Step 6: Clean up**

Delete any test-only user created for this verification via the Supabase Admin API, same as prior phases. Leave genuinely generated quiz data in place unless it's clearly just test noise.

---

## Post-Plan Notes

- `getWeakTopics` does one extra query per scored attempt to resolve its topic(s) (N+1) — fine at this app's expected scale; revisit with a SQL aggregate function if a user's attempt history grows large enough for it to matter.
- Recommendations only have two tiers (weak topics, then static defaults) — the spec explicitly deferred a saved-resources-derived middle tier as not worth the added complexity yet.
