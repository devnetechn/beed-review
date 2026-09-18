# Extreme Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI Tutor offer a timed, game-styled "Extreme Quiz" (harder difficulty, 10 questions, 20s/question, no going back) capped at one attempt per user per Asia/Manila day, plus a small global animation system and `lucide-react` icons replacing emoji.

**Architecture:** Reuse the existing quiz engine (`quiz_attempts`/`quiz_questions`, `generateTopicQuiz`) with a new `"extreme"` difficulty value and a dedicated route tree (`/quiz/extreme`, `/quiz/extreme/[attemptId]`) styled distinctly from the normal quiz flow. A new `lib/quiz/extreme.ts` module enforces the daily limit server-side before any OpenAI call. The Tutor's chat model call gains structured JSON output (`reply` + `wants_extreme_quiz`) to decide when to show a CTA into the new flow. Global motion is a handful of shared Tailwind utilities (duration/easing CSS vars, `tw-animate-css`'s already-installed `animate-in` utilities) applied to `Button`, `Card`, and list renders app-wide.

**Tech Stack:** No new dependencies — `lucide-react` and `tw-animate-css` are already installed (`package.json`). No DB migration — `quiz_attempts.difficulty` is already a plain `text` column.

**Spec:** `docs/superpowers/specs/2026-09-18-extreme-quiz-design.md`

## Global Constraints

- No automated test framework exists in this repo (confirmed across Phases 1-5) — every task's "test" step is `npm run build` (type-checks) plus a manual click-through/curl check, not a unit test file. Do not invent a test framework or test files.
- Daily reset boundary is hardcoded to Asia/Manila (UTC+8, no DST) — no per-user timezone preference.
- Extreme Quiz is always exactly 10 questions at `"extreme"` difficulty — no count/difficulty picker on that page.
- The rate limit MUST be enforced server-side in the action that calls `generateTopicQuiz` (not only in the page's render check) — this is the choke point that protects OpenAI spend.
- No emoji anywhere in new UI — use `lucide-react` icons.
- Do not run `git commit` unless the user explicitly asks.

---

## File Structure

```
lib/ai/quiz.ts                                   # MODIFIED: QuizDifficulty type widened to include "extreme"; extreme prompt phrasing
lib/ai/actions.ts                                # MODIFIED: generateQuizAction difficulty type; sendTutorMessageAction return shape
lib/ai/types.ts                                  # MODIFIED: + TutorReplySchema/TutorReply
lib/ai/tutor.ts                                  # MODIFIED: structured JSON output for sendTutorMessage
lib/quiz/extreme.ts                              # NEW: Asia/Manila day bounds, rate-limit check/assert
lib/quiz/weakTopics.ts                           # MODIFIED: exclude difficulty="extreme" from aggregation
lib/quiz/types.ts                                # MODIFIED: + difficulty field on QuizAttemptView
lib/quiz/attempt.ts                              # MODIFIED: select/return difficulty
lib/quiz/actions.ts                              # MODIFIED: startTopicQuizAction difficulty type; + startExtremeQuizAction
components/quiz/ExtremeLockedState.tsx           # NEW: locked/countdown state
components/quiz/ExtremeQuizPicker.tsx            # NEW: subject/topic picker, auto-starts on topic pick
components/quiz/ExtremeQuizTaker.tsx             # NEW: timed taking flow
components/quiz/ExtremeQuizResult.tsx            # NEW: score reveal + expandable review
app/(app)/quiz/extreme/page.tsx                  # NEW: landing page (locked vs picker)
app/(app)/quiz/extreme/[attemptId]/page.tsx      # NEW: taking/result page
components/tutor/ChatThread.tsx                  # MODIFIED: render Extreme Quiz CTA
app/globals.css                                  # MODIFIED: + motion duration/easing tokens
components/ui/card.tsx                           # MODIFIED: hover/press transition
components/ui/button.tsx                         # MODIFIED: shared duration token, subtle hover scale
components/resource/ResourceCard.tsx             # MODIFIED: staggered fade-in
app/(app)/search/page.tsx                        # MODIFIED: pass index to ResourceCard
app/(app)/library/page.tsx                       # MODIFIED: staggered fade-in
components/quiz/QuizTaker.tsx                    # MODIFIED: staggered fade-in on choices
```

---

### Task 1: Widen quiz difficulty type + extreme prompt phrasing

**Files:**
- Modify: `lib/ai/quiz.ts:28-46`

**Interfaces:**
- Produces: `export type QuizDifficulty = "easy" | "medium" | "hard" | "extreme"` — consumed by Task 4 (`lib/quiz/actions.ts`) and any other file passing a difficulty into `generateQuiz`/`generateTopicQuiz`.

- [ ] **Step 1: Add the shared type and update the system-prompt builder**

In `lib/ai/quiz.ts`, replace lines 28-30:

```ts
function buildQuizSystemPrompt(count: number, difficulty: string): string {
  return `You are a quiz question generator for a Bachelor of Elementary Education (BEEd) exam-prep app. Generate exactly ${count} multiple-choice practice questions at ${difficulty} difficulty, based on the given resource. Each question needs exactly 4 choices, one correct_answer that exactly matches one of the choices verbatim, and a short explanation of why it's correct. These are AI-generated practice questions, not official LET exam questions — write them to be genuinely useful for review, grounded in the given content, not generic trivia.`;
}
```

with:

```ts
export type QuizDifficulty = "easy" | "medium" | "hard" | "extreme";

function buildQuizSystemPrompt(count: number, difficulty: QuizDifficulty): string {
  const extremeInstruction =
    difficulty === "extreme"
      ? " This is EXTREME difficulty: write questions that would challenge a top-performing reviewee — trickier distractors, less forgiving phrasing, edge-case scenarios, and details that require precise recall, not just general familiarity."
      : "";
  return `You are a quiz question generator for a Bachelor of Elementary Education (BEEd) exam-prep app. Generate exactly ${count} multiple-choice practice questions at ${difficulty} difficulty, based on the given resource.${extremeInstruction} Each question needs exactly 4 choices, one correct_answer that exactly matches one of the choices verbatim, and a short explanation of why it's correct. These are AI-generated practice questions, not official LET exam questions — write them to be genuinely useful for review, grounded in the given content, not generic trivia.`;
}
```

- [ ] **Step 2: Update `generateQuiz`'s signature**

Change (around line 42-46):

```ts
export async function generateQuiz(
  resourceId: string,
  userId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: "easy" | "medium" | "hard"
): Promise<{ attemptId: string; questions: QuizQuestionResult[] }> {
```

to:

```ts
export async function generateQuiz(
  resourceId: string,
  userId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: QuizDifficulty
): Promise<{ attemptId: string; questions: QuizQuestionResult[] }> {
```

- [ ] **Step 3: Update `generateTopicQuiz`'s signature**

Change (around line 131-136):

```ts
export async function generateTopicQuiz(
  topicId: string,
  userId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: "easy" | "medium" | "hard"
): Promise<{ attemptId: string; totalQuestions: number }> {
```

to:

```ts
export async function generateTopicQuiz(
  topicId: string,
  userId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: QuizDifficulty
): Promise<{ attemptId: string; totalQuestions: number }> {
```

- [ ] **Step 4: Update callers' inline union types**

In `lib/ai/actions.ts`, change `generateQuizAction`'s `difficulty` parameter type from `"easy" | "medium" | "hard"` to `QuizDifficulty`, importing it: add `type QuizDifficulty` to the existing `import { generateQuiz } from "./quiz";` line, i.e.:

```ts
import { generateQuiz, type QuizDifficulty } from "./quiz";
```

and change:

```ts
export async function generateQuizAction(
  resourceId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: "easy" | "medium" | "hard"
): Promise<{ attemptId: string; questions: QuizQuestionResult[] } | { error: string }> {
```

to:

```ts
export async function generateQuizAction(
  resourceId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: QuizDifficulty
): Promise<{ attemptId: string; questions: QuizQuestionResult[] } | { error: string }> {
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds (this only widens a union type — no existing caller passes `"extreme"` yet, so nothing else should need changes at this point).

---

### Task 2: Exclude extreme attempts from weak-topic aggregation

**Files:**
- Modify: `lib/quiz/weakTopics.ts:11-15`

**Interfaces:** none (internal query change only; `getWeakTopics`'s exported signature is unchanged)

- [ ] **Step 1: Add the difficulty exclusion**

In `lib/quiz/weakTopics.ts`, change:

```ts
  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, resource_id, topic_id")
    .eq("user_id", userId)
    .not("score", "is", null);
```

to:

```ts
  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, resource_id, topic_id")
    .eq("user_id", userId)
    .not("score", "is", null)
    .neq("difficulty", "extreme");
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. (No manual data check possible yet — there are no `"extreme"` attempts in the database until Task 4+ ships. This will be exercised end-to-end in Task 12.)

---

### Task 3: Rate-limit module (Asia/Manila daily boundary)

**Files:**
- Create: `lib/quiz/extreme.ts`

**Interfaces:**
- Produces:
  - `getManilaDayBounds(now?: Date): { start: Date; end: Date }`
  - `getExtremeQuizStatus(userId: string): Promise<{ usedToday: boolean; nextAvailableAt: string | null }>` — consumed by Task 5 (`app/(app)/quiz/extreme/page.tsx`)
  - `class ExtremeQuizLimitError extends Error { nextAvailableAt: string }`
  - `assertExtremeQuizAllowed(userId: string): Promise<void>` — throws `ExtremeQuizLimitError` — consumed by Task 4 (`lib/quiz/actions.ts`'s `startExtremeQuizAction`)
- Consumes: `createServiceClient` from `@/lib/supabase/service`

- [ ] **Step 1: Write the module**

Create `lib/quiz/extreme.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila is UTC+8 year-round (no DST)
const DAY_MS = 24 * 60 * 60 * 1000;

export function getManilaDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_MS);
  const manilaMidnightUtc = Date.UTC(
    manilaNow.getUTCFullYear(),
    manilaNow.getUTCMonth(),
    manilaNow.getUTCDate()
  );
  const start = new Date(manilaMidnightUtc - MANILA_OFFSET_MS);
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end };
}

export class ExtremeQuizLimitError extends Error {
  nextAvailableAt: string;
  constructor(nextAvailableAt: string) {
    super("Extreme quiz already used today");
    this.name = "ExtremeQuizLimitError";
    this.nextAvailableAt = nextAvailableAt;
  }
}

export async function getExtremeQuizStatus(
  userId: string
): Promise<{ usedToday: boolean; nextAvailableAt: string | null }> {
  const supabase = createServiceClient();
  const { start, end } = getManilaDayBounds();

  const { data } = await supabase
    .from("quiz_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("difficulty", "extreme")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .limit(1)
    .maybeSingle();

  return { usedToday: !!data, nextAvailableAt: data ? end.toISOString() : null };
}

export async function assertExtremeQuizAllowed(userId: string): Promise<void> {
  const { usedToday, nextAvailableAt } = await getExtremeQuizStatus(userId);
  if (usedToday) throw new ExtremeQuizLimitError(nextAvailableAt!);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. `getManilaDayBounds` is pure and small enough to reason about directly: for any `now`, `start <= now < end` and `end - start === 24h`. This gets exercised behaviorally once Task 5 and Task 12 wire it into a real page.

---

### Task 4: Extreme quiz types, attempt difficulty field, and server action

**Files:**
- Modify: `lib/quiz/types.ts`
- Modify: `lib/quiz/attempt.ts`
- Modify: `lib/quiz/actions.ts`

**Interfaces:**
- Consumes: `QuizDifficulty` from `@/lib/ai/quiz` (Task 1), `assertExtremeQuizAllowed`/`ExtremeQuizLimitError` from `@/lib/quiz/extreme` (Task 3)
- Produces:
  - `QuizAttemptView` variants now include `difficulty: string` — consumed by Task 6/7 (`app/(app)/quiz/extreme/[attemptId]/page.tsx`'s guard)
  - `startExtremeQuizAction(topicId: string): Promise<{ attemptId: string } | { error: "already_used_today"; nextAvailableAt: string } | { error: string }>` — consumed by Task 5 (`ExtremeQuizPicker`)

- [ ] **Step 1: Add `difficulty` to `QuizAttemptView`**

In `lib/quiz/types.ts`, replace the `QuizAttemptView` union:

```ts
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
```

with:

```ts
export type QuizAttemptView =
  | {
      scored: false;
      attemptId: string;
      label: string;
      difficulty: string;
      totalQuestions: number;
      questions: QuizQuestionForTaking[];
    }
  | {
      scored: true;
      attemptId: string;
      label: string;
      difficulty: string;
      score: number;
      totalQuestions: number;
      questions: QuizQuestionReview[];
    };
```

- [ ] **Step 2: Select and return `difficulty` in `getQuizAttempt`**

In `lib/quiz/attempt.ts`, change the select call:

```ts
  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, user_id, score, total_questions, resource_id, topic_id, resources(title), topics(name)")
    .eq("id", attemptId)
    .maybeSingle();
```

to:

```ts
  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select(
      "id, user_id, score, total_questions, difficulty, resource_id, topic_id, resources(title), topics(name)"
    )
    .eq("id", attemptId)
    .maybeSingle();
```

Then change:

```ts
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
```

to:

```ts
  const resource = Array.isArray(attempt.resources) ? attempt.resources[0] : attempt.resources;
  const topic = Array.isArray(attempt.topics) ? attempt.topics[0] : attempt.topics;
  const label = resource?.title ?? topic?.name ?? "Quiz";
  const totalQuestions = attempt.total_questions ?? questions?.length ?? 0;
  const difficulty = attempt.difficulty ?? "medium";

  if (attempt.score !== null) {
    return {
      scored: true,
      attemptId: attempt.id,
      label,
      difficulty,
      score: attempt.score,
      totalQuestions,
```

And change the final `scored: false` return:

```ts
  return {
    scored: false,
    attemptId: attempt.id,
    label,
    totalQuestions,
```

to:

```ts
  return {
    scored: false,
    attemptId: attempt.id,
    label,
    difficulty,
    totalQuestions,
```

- [ ] **Step 3: Add `startExtremeQuizAction`**

In `lib/quiz/actions.ts`, change the imports:

```ts
import { createClient } from "@/lib/supabase/server";
import { generateTopicQuiz } from "@/lib/ai/quiz";
import { submitQuiz } from "./attempt";
```

to:

```ts
import { createClient } from "@/lib/supabase/server";
import { generateTopicQuiz, type QuizDifficulty } from "@/lib/ai/quiz";
import { submitQuiz } from "./attempt";
import { assertExtremeQuizAllowed, ExtremeQuizLimitError } from "./extreme";
```

Change `startTopicQuizAction`'s `difficulty` parameter type from `"easy" | "medium" | "hard"` to `QuizDifficulty`:

```ts
export async function startTopicQuizAction(
  topicId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: QuizDifficulty
): Promise<{ attemptId: string } | { error: string }> {
```

Then add this new function (after `startTopicQuizAction`, before `submitQuizAction`):

```ts
export async function startExtremeQuizAction(
  topicId: string
): Promise<
  | { attemptId: string }
  | { error: "already_used_today"; nextAvailableAt: string }
  | { error: string }
> {
  try {
    const user = await requireUser();
    await assertExtremeQuizAllowed(user.id);
    const { attemptId } = await generateTopicQuiz(topicId, user.id, 10, "extreme");
    return { attemptId };
  } catch (err) {
    if (err instanceof ExtremeQuizLimitError) {
      return { error: "already_used_today", nextAvailableAt: err.nextAvailableAt };
    }
    return { error: "Couldn't generate a quiz. Please try again." };
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 5: Extreme Quiz landing page (locked state + picker)

**Files:**
- Create: `components/quiz/ExtremeLockedState.tsx`
- Create: `components/quiz/ExtremeQuizPicker.tsx`
- Create: `app/(app)/quiz/extreme/page.tsx`

**Interfaces:**
- Consumes: `getExtremeQuizStatus` (Task 3), `startExtremeQuizAction` (Task 4), `SUBJECTS` from `@/lib/sources/subjects`, `/api/topics` route (existing)
- Produces: route `/quiz/extreme` — consumed by Task 9 (Tutor CTA link) and Task 12 (smoke test)

- [ ] **Step 1: Write the locked/countdown state**

Create `components/quiz/ExtremeLockedState.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

export function ExtremeLockedState({ nextAvailableAt }: { nextAvailableAt: string }) {
  const target = new Date(nextAvailableAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const interval = setInterval(() => setRemaining(target - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [target]);

  return (
    <div className="animate-in fade-in flex flex-col items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-6 py-10 text-center duration-300">
      <Lock className="size-8 text-orange-600" />
      <p className="text-base font-semibold text-orange-900">
        You&apos;ve used today&apos;s Extreme Quiz
      </p>
      <p className="text-sm text-orange-700">Come back tomorrow for another shot.</p>
      <p className="font-mono text-2xl font-semibold text-orange-900">
        {remaining > 0 ? formatCountdown(remaining) : "00:00:00"}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Write the picker**

Create `components/quiz/ExtremeQuizPicker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { SUBJECTS } from "@/lib/sources/subjects";
import { startExtremeQuizAction } from "@/lib/quiz/actions";

type Topic = { id: string; name: string };

export function ExtremeQuizPicker() {
  const router = useRouter();
  const [step, setStep] = useState<"subject" | "topic">("subject");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [startingTopicId, setStartingTopicId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);

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

  async function handlePickTopic(topicId: string) {
    setStartingTopicId(topicId);
    setError(null);
    const outcome = await startExtremeQuizAction(topicId);
    setStartingTopicId(null);
    if ("error" in outcome) {
      if (outcome.error === "already_used_today") {
        setLockedMessage("You've already used today's Extreme Quiz.");
        return;
      }
      setError(outcome.error);
      return;
    }
    router.push(`/quiz/extreme/${outcome.attemptId}`);
  }

  if (lockedMessage) {
    return <ErrorBanner message={lockedMessage} />;
  }

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
        <Flame className="size-5 text-orange-600" />
        <p className="text-sm text-orange-900">
          10 questions, 20 seconds each, one attempt a day. Good luck.
        </p>
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
          <p className="text-sm font-medium">Pick a topic to start</p>
          {topics.length === 0 ? (
            <p className="text-sm text-neutral-400">No topics found for this subject yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {topics.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="justify-start"
                  disabled={startingTopicId !== null}
                  onClick={() => handlePickTopic(t.id)}
                >
                  {startingTopicId === t.id ? "Generating your Extreme Quiz…" : t.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the landing page**

Create `app/(app)/quiz/extreme/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getExtremeQuizStatus } from "@/lib/quiz/extreme";
import { ExtremeQuizPicker } from "@/components/quiz/ExtremeQuizPicker";
import { ExtremeLockedState } from "@/components/quiz/ExtremeLockedState";
import { EmptyState } from "@/components/common/EmptyState";

export const dynamic = "force-dynamic";

export default async function ExtremeQuizPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <EmptyState message="Please sign in to play Extreme Quiz." />;
  }

  const { usedToday, nextAvailableAt } = await getExtremeQuizStatus(user.id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Extreme Quiz</h1>
      {usedToday && nextAvailableAt ? (
        <ExtremeLockedState nextAvailableAt={nextAvailableAt} />
      ) : (
        <ExtremeQuizPicker />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual check**

Run: `npm run dev`, sign in, visit `/quiz/extreme`. Expected: subject picker renders (not locked, since no extreme attempt exists yet for this user). Pick a subject, pick a topic — expect a brief "Generating your Extreme Quiz…" state then a redirect to `/quiz/extreme/<some-uuid>` (this page doesn't exist until Task 6 — a 404/blank page there is expected for now; the redirect itself succeeding is what this step verifies).

---

### Task 6: Extreme Quiz taking flow (timer, no going back)

**Files:**
- Create: `components/quiz/ExtremeQuizTaker.tsx`
- Create: `app/(app)/quiz/extreme/[attemptId]/page.tsx`

**Interfaces:**
- Consumes: `getQuizAttempt` (existing, now returns `difficulty` per Task 4), `submitQuizAction` (existing, unchanged), `QuizQuestionForTaking` from `@/lib/quiz/types`
- Produces: route `/quiz/extreme/[attemptId]` (taking half — result half comes in Task 7)

- [ ] **Step 1: Write the timed taking component**

Create `components/quiz/ExtremeQuizTaker.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { submitQuizAction } from "@/lib/quiz/actions";
import type { QuizQuestionForTaking } from "@/lib/quiz/types";

const SECONDS_PER_QUESTION = 20;
const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ringColor(secondsLeft: number): string {
  if (secondsLeft > 10) return "stroke-green-500";
  if (secondsLeft > 5) return "stroke-yellow-500";
  return "stroke-red-500";
}

export function ExtremeQuizTaker({
  attemptId,
  questions,
}: {
  attemptId: string;
  questions: QuizQuestionForTaking[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = questions[index];
  const isLast = index === questions.length - 1;

  useEffect(() => {
    setSecondsLeft(SECONDS_PER_QUESTION);
  }, [index]);

  useEffect(() => {
    if (submitting) return;
    if (secondsLeft <= 0) {
      advance();
      return;
    }
    const timeout = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, submitting]);

  function selectAnswer(choice: string) {
    setAnswers((prev) => ({ ...prev, [current.id]: choice }));
  }

  function advance() {
    if (isLast) {
      void handleSubmit();
      return;
    }
    setIndex((i) => i + 1);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const payload = questions.map((q) => ({
      questionId: q.id,
      selectedAnswer: answers[q.id] ?? "",
    }));
    const outcome = await submitQuizAction(attemptId, payload);
    setSubmitting(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="animate-in fade-in space-y-4 duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-orange-700">
          <Zap className="size-4" />
          Question {index + 1} of {questions.length}
        </div>
        <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
          <circle
            cx="22"
            cy="22"
            r={RING_RADIUS}
            className="fill-none stroke-neutral-200"
            strokeWidth="4"
          />
          <circle
            cx="22"
            cy="22"
            r={RING_RADIUS}
            className={`fill-none transition-all duration-1000 ease-linear ${ringColor(secondsLeft)}`}
            strokeWidth="4"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - secondsLeft / SECONDS_PER_QUESTION)}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <p className="text-base font-medium">{current.question}</p>
      <div className="space-y-2">
        {current.choices.map((choice, i) => (
          <button
            key={choice}
            onClick={() => selectAnswer(choice)}
            disabled={submitting}
            style={{ animationDelay: `${i * 50}ms` }}
            className={`animate-in fade-in slide-in-from-bottom-1 w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-300 ${
              answers[current.id] === choice
                ? "border-orange-600 bg-orange-600 text-white"
                : "border-neutral-200 text-neutral-700 hover:border-orange-300"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      <Button className="w-full" disabled={!answers[current.id] || submitting} onClick={advance}>
        {submitting ? "Submitting…" : isLast ? "Submit" : "Next"}
      </Button>
    </div>
  );
}
```

Note on the timer effect: when `secondsLeft` hits 0, `advance()` runs and (for a non-last question) calls `setIndex`, which triggers the `[index]` effect to reset `secondsLeft` back to `SECONDS_PER_QUESTION` — restarting the countdown for the next question. For the last question, `advance()` calls `handleSubmit()`, which sets `submitting = true`; the timer effect's top guard (`if (submitting) return;`) then stops the countdown instead of continuing to fire.

- [ ] **Step 2: Write the attempt page (taking half only — result branch added in Task 7)**

Create `app/(app)/quiz/extreme/[attemptId]/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getQuizAttempt } from "@/lib/quiz/attempt";
import { ExtremeQuizTaker } from "@/components/quiz/ExtremeQuizTaker";
import { EmptyState } from "@/components/common/EmptyState";

export const dynamic = "force-dynamic";

export default async function ExtremeQuizAttemptPage({
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

  if (!attempt || attempt.difficulty !== "extreme") {
    return <EmptyState message="Extreme quiz not found." />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-orange-700">{attempt.label}</h1>
      {attempt.scored ? (
        <p className="text-sm text-neutral-500">Scoring…</p>
      ) : (
        <ExtremeQuizTaker attemptId={attempt.attemptId} questions={attempt.questions} />
      )}
    </div>
  );
}
```

(The `attempt.scored` branch is a placeholder here — Task 7 replaces it with `ExtremeQuizResult`.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Repeat Task 5 Step 5's flow (subject → topic) through to landing on `/quiz/extreme/<attemptId>`. Expected: a question renders with a countdown ring that visibly drains over 20 seconds and shifts green → yellow → red; selecting an answer highlights it; clicking "Next" advances without a way to go back; letting the timer hit 0 on an unanswered question auto-advances.

---

### Task 7: Extreme Quiz result screen

**Files:**
- Create: `components/quiz/ExtremeQuizResult.tsx`
- Modify: `app/(app)/quiz/extreme/[attemptId]/page.tsx`

**Interfaces:**
- Consumes: `QuizQuestionReview` from `@/lib/quiz/types`

- [ ] **Step 1: Write the result component**

Create `components/quiz/ExtremeQuizResult.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import type { QuizQuestionReview } from "@/lib/quiz/types";

const PASS_RATIO = 0.6;
const COUNT_UP_MS = 800;

function useCountUp(target: number, durationMs: number): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const start = performance.now();
    let frame: number;
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(progress * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

export function ExtremeQuizResult({
  score,
  totalQuestions,
  questions,
}: {
  score: number;
  totalQuestions: number;
  questions: QuizQuestionReview[];
}) {
  const displayedScore = useCountUp(score, COUNT_UP_MS);
  const [showReview, setShowReview] = useState(false);
  const passed = totalQuestions > 0 && score / totalQuestions >= PASS_RATIO;

  return (
    <div className="animate-in fade-in zoom-in-95 space-y-4 duration-300">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 py-8 text-center">
        {passed && <Trophy className="size-10 text-orange-600" />}
        <p className="text-4xl font-bold text-orange-900">
          {displayedScore} / {totalQuestions}
        </p>
        <p className="text-sm text-orange-700">
          {passed ? "Extreme Quiz cleared." : "Tough round — try again tomorrow."}
        </p>
      </div>

      <p className="text-xs font-medium text-amber-600">
        AI Generated — practice questions, not official LET items.
      </p>

      <button
        onClick={() => setShowReview((v) => !v)}
        className="text-sm font-medium text-orange-700 underline underline-offset-2"
      >
        {showReview ? "Hide review" : "Show full review"}
      </button>

      {showReview && (
        <div className="animate-in fade-in space-y-4 duration-300">
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
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the attempt page**

In `app/(app)/quiz/extreme/[attemptId]/page.tsx`, add the import:

```tsx
import { ExtremeQuizResult } from "@/components/quiz/ExtremeQuizResult";
```

and replace:

```tsx
      {attempt.scored ? (
        <p className="text-sm text-neutral-500">Scoring…</p>
      ) : (
        <ExtremeQuizTaker attemptId={attempt.attemptId} questions={attempt.questions} />
      )}
```

with:

```tsx
      {attempt.scored ? (
        <ExtremeQuizResult
          score={attempt.score}
          totalQuestions={attempt.totalQuestions}
          questions={attempt.questions}
        />
      ) : (
        <ExtremeQuizTaker attemptId={attempt.attemptId} questions={attempt.questions} />
      )}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Complete a full Extreme Quiz (from Task 5/6's flow) through all 10 questions. Expected: lands on the result screen, score counts up from 0, "Show full review" expands/collapses the per-question breakdown. Revisit `/quiz/extreme` afterward — expected: locked state now shows (this exercises Task 3's rate limit end-to-end for the first time).

---

### Task 8: Tutor structured output (reply + wants_extreme_quiz)

**Files:**
- Modify: `lib/ai/types.ts`
- Modify: `lib/ai/tutor.ts`
- Modify: `lib/ai/actions.ts`

**Interfaces:**
- Produces: `sendTutorMessage(...): Promise<{ reply: string; wantsExtremeQuiz: boolean }>` (changed from `Promise<string>`) — consumed by Task 9 (`ChatThread.tsx`)
- Produces: `sendTutorMessageAction(...): Promise<{ reply: string; wantsExtremeQuiz: boolean } | { error: string }>` (changed return shape) — consumed by Task 9

- [ ] **Step 1: Add the schema**

In `lib/ai/types.ts`, add at the end of the file:

```ts
export const TutorReplySchema = z.object({
  reply: z.string().min(1),
  wants_extreme_quiz: z.boolean(),
});
export type TutorReply = z.infer<typeof TutorReplySchema>;
```

- [ ] **Step 2: Switch `sendTutorMessage` to structured JSON output**

Replace the full contents of `lib/ai/tutor.ts` with:

```ts
import { getOpenAIClient } from "./client";
import { createServiceClient } from "@/lib/supabase/service";
import { TutorReplySchema } from "./types";

type ChatMessage = { role: "user" | "assistant"; content: string };

const TUTOR_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    wants_extreme_quiz: { type: "boolean" },
  },
  required: ["reply", "wants_extreme_quiz"],
  additionalProperties: false,
} as const;

function buildTutorSystemPrompt(resourceContext: string | null): string {
  const base = `You are a friendly, focused AI tutor for a Bachelor of Elementary Education (BEEd) exam-prep app, helping students prepare for the Philippine LET (Licensure Examination for Teachers). Stay strictly on BEEd/LET-related educational topics — politely decline unrelated requests. You can explain topics, simplify concepts, give examples, offer memory tricks/mnemonics, and quiz the student conversationally. Be concise and exam-focused.

Respond with a JSON object containing "reply" (your conversational reply text) and "wants_extreme_quiz" (boolean). Set "wants_extreme_quiz" to true only when the student is explicitly asking to be quizzed, tested, or challenged with practice questions — in any phrasing or language — otherwise false. When true, keep "reply" natural (e.g. acknowledge the request) — a separate UI element will offer the quiz, so don't generate quiz questions yourself in "reply".`;
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
): Promise<{ reply: string; wantsExtremeQuiz: boolean }> {
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
    text: {
      format: {
        type: "json_schema",
        name: "tutor_reply",
        schema: TUTOR_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  let parsed: { reply: string; wants_extreme_quiz: boolean };
  try {
    parsed = TutorReplySchema.parse(JSON.parse(response.output_text));
  } catch {
    parsed = { reply: response.output_text, wants_extreme_quiz: false };
  }

  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: parsed.reply,
  });

  return { reply: parsed.reply, wantsExtremeQuiz: parsed.wants_extreme_quiz };
}
```

- [ ] **Step 3: Update the server action's return type**

In `lib/ai/actions.ts`, replace:

```ts
export async function sendTutorMessageAction(
  conversationId: string,
  resourceId: string | null,
  message: string
): Promise<{ reply: string } | { error: string }> {
  try {
    await requireUser();
    const reply = await sendTutorMessage(conversationId, resourceId, message);
    return { reply };
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
```

with:

```ts
export async function sendTutorMessageAction(
  conversationId: string,
  resourceId: string | null,
  message: string
): Promise<{ reply: string; wantsExtremeQuiz: boolean } | { error: string }> {
  try {
    await requireUser();
    return await sendTutorMessage(conversationId, resourceId, message);
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds. (`ChatThread.tsx` still calls this action and destructures only `outcome.reply` today, so the extra `wantsExtremeQuiz` field is simply unused until Task 9 — no compile error.)

---

### Task 9: Tutor CTA button

**Files:**
- Modify: `components/tutor/ChatThread.tsx`

**Interfaces:**
- Consumes: `sendTutorMessageAction`'s new return shape (Task 8), route `/quiz/extreme` (Task 5)

- [ ] **Step 1: Replace the file**

Replace the full contents of `components/tutor/ChatThread.tsx` with:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { startTutorConversationAction, sendTutorMessageAction } from "@/lib/ai/actions";

type Message = { role: "user" | "assistant"; content: string; wantsExtremeQuiz?: boolean };

export function ChatThread({
  resourceId,
  resourceTitle,
}: {
  resourceId: string | null;
  resourceTitle?: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const outcome = await startTutorConversationAction(resourceId);
      if (cancelled) return;
      setLoading(false);
      if ("error" in outcome) {
        setError(outcome.error);
        return;
      }
      setConversationId(outcome.conversationId);
      setMessages(outcome.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || !conversationId) return;
    const text = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    setError(null);
    const outcome = await sendTutorMessageAction(conversationId, resourceId, text);
    setSending(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: outcome.reply, wantsExtremeQuiz: outcome.wantsExtremeQuiz },
    ]);
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
      {resourceTitle && (
        <div className="border-b border-neutral-200 px-1 pb-2 text-xs text-neutral-500">
          Chatting about: {resourceTitle}
        </div>
      )}
      <div className="flex-1 space-y-3 overflow-y-auto py-3">
        {loading && <p className="text-sm text-neutral-400">Loading…</p>}
        {messages.map((m, i) => (
          <div key={i} className="space-y-1.5">
            <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
                }`}
              >
                {m.content}
              </div>
            </div>
            {m.role === "assistant" && m.wantsExtremeQuiz && (
              <div className="flex justify-start">
                <Link href="/quiz/extreme">
                  <Button
                    size="sm"
                    className="animate-in fade-in gap-1.5 bg-orange-600 text-white duration-300 hover:bg-orange-700"
                  >
                    <Zap className="size-3.5" />
                    Start Extreme Quiz
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ))}
        {sending && <p className="text-sm text-neutral-400">Thinking…</p>}
        <div ref={bottomRef} />
      </div>
      {error && <ErrorBanner message={error} />}
      <div className="flex gap-2 border-t border-neutral-200 pt-2">
        <Input
          placeholder="Ask about BEEd/LET topics…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
          disabled={loading}
        />
        <Button onClick={handleSend} disabled={loading || sending || !input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, sign in, open `/tutor`, type a message like "quiz me on classroom management" (or any phrasing that clearly asks to be tested). Expected: the assistant's reply appears, and a "Start Extreme Quiz" button (with the Zap icon, orange background) renders beneath it; clicking it navigates to `/quiz/extreme`. Then ask an unrelated question (e.g. "what is constructivism?") — expected: no CTA button appears under that reply.

---

### Task 10: Global motion tokens on Button and Card

**Files:**
- Modify: `app/globals.css`
- Modify: `components/ui/card.tsx`
- Modify: `components/ui/button.tsx`

**Interfaces:**
- Produces: CSS custom properties `--motion-fast`, `--motion-base`, `--motion-ease` — consumed by Task 10's own Button/Card edits and available for any future component.

- [ ] **Step 1: Add motion tokens**

In `app/globals.css`, inside the `:root { ... }` block, add these three lines (anywhere among the other custom properties, e.g. right after `--radius: 0.625rem;`):

```css
  --motion-fast: 150ms;
  --motion-base: 250ms;
  --motion-ease: cubic-bezier(0.4, 0, 0.2, 1);
```

- [ ] **Step 2: Add hover/press transition to Card**

In `components/ui/card.tsx`, change the `Card` function's `className` string from:

```
"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl"
```

to:

```
"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 transition-[transform,box-shadow] duration-(--motion-fast) ease-(--motion-ease) hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl"
```

(only the `transition-[transform,box-shadow] duration-(--motion-fast) ease-(--motion-ease) hover:-translate-y-0.5 hover:shadow-md active:translate-y-0` segment is new, inserted after `ring-1 ring-foreground/10`)

- [ ] **Step 3: Standardize Button's transition duration and add a subtle hover scale**

In `components/ui/button.tsx`, in the `buttonVariants` base class string, change:

```
"group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
```

to:

```
"group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-(--motion-fast) ease-(--motion-ease) outline-none select-none hover:scale-[1.02] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
```

(only `duration-(--motion-fast) ease-(--motion-ease)` after `transition-all`, and `hover:scale-[1.02]` after `select-none`, are new)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual check**

Run: `npm run dev`. Hover over any button or card anywhere in the app (e.g. `/search`, `/library`). Expected: a subtle, smooth lift/scale on hover, and a slight press-down on click — consistent timing across different pages.

---

### Task 11: Staggered fade-in on list renders

**Files:**
- Modify: `components/resource/ResourceCard.tsx`
- Modify: `app/(app)/search/page.tsx`
- Modify: `app/(app)/library/page.tsx`
- Modify: `components/quiz/QuizTaker.tsx`

**Interfaces:**
- `ResourceCard` gains an optional `index?: number` prop (default `0`) — callers may omit it, in which case no stagger delay is applied.

- [ ] **Step 1: Add stagger to `ResourceCard`**

In `components/resource/ResourceCard.tsx`, change the function signature:

```tsx
export function ResourceCard({
  resource,
  saved,
  onToggleSave,
  aiFound,
}: {
  resource: ResourceHit;
  saved: boolean;
  onToggleSave: (id: string) => void;
  aiFound?: boolean;
}) {
  return (
    <Card className="space-y-2 p-4">
```

to:

```tsx
export function ResourceCard({
  resource,
  saved,
  onToggleSave,
  aiFound,
  index = 0,
}: {
  resource: ResourceHit;
  saved: boolean;
  onToggleSave: (id: string) => void;
  aiFound?: boolean;
  index?: number;
}) {
  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-1 space-y-2 p-4 duration-300"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
```

- [ ] **Step 2: Pass `index` from the search page**

In `app/(app)/search/page.tsx`, change:

```tsx
            results.resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                saved={savedIds.has(resource.id)}
                onToggleSave={handleToggleSave}
              />
            ))
```

to:

```tsx
            results.resources.map((resource, i) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                saved={savedIds.has(resource.id)}
                onToggleSave={handleToggleSave}
                index={i}
              />
            ))
```

and change:

```tsx
                {aiResults.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    saved={savedIds.has(resource.id)}
                    onToggleSave={handleToggleSave}
                    aiFound
                  />
                ))}
```

to:

```tsx
                {aiResults.map((resource, i) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    saved={savedIds.has(resource.id)}
                    onToggleSave={handleToggleSave}
                    aiFound
                    index={i}
                  />
                ))}
```

- [ ] **Step 3: Add stagger to the library page's inline cards**

In `app/(app)/library/page.tsx`, change:

```tsx
        rows.map(({ resource }) => (
          <Card key={resource!.id} className="space-y-2 p-4">
```

to:

```tsx
        rows.map(({ resource }, i) => (
          <Card
            key={resource!.id}
            className="animate-in fade-in slide-in-from-bottom-1 space-y-2 p-4 duration-300"
            style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
          >
```

- [ ] **Step 4: Add stagger to quiz answer choices**

In `components/quiz/QuizTaker.tsx`, change:

```tsx
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
```

to:

```tsx
        {current.choices.map((choice, i) => (
          <button
            key={choice}
            onClick={() => selectAnswer(choice)}
            style={{ animationDelay: `${i * 50}ms` }}
            className={`animate-in fade-in slide-in-from-bottom-1 w-full rounded-lg border px-3 py-2 text-left text-sm duration-300 ${
              answers[current.id] === choice
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-700"
            }`}
          >
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual check**

Run: `npm run dev`. Visit `/search` and run a query with multiple results — expected: cards fade/slide in with a slight stagger rather than popping in all at once. Visit `/library` with multiple saved resources — same effect. Start a normal `/quiz` — expected: answer choices stagger in on each question.

---

### Task 12: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full build and lint**

```bash
npm run build
npm run lint
```

Expected: both succeed with no errors.

- [ ] **Step 2: End-to-end Extreme Quiz + rate limit**

Run: `npm run dev`, sign in as a test user (Supabase Admin API, same approach as prior phases).

1. In `/tutor`, ask to be quizzed — confirm the "Start Extreme Quiz" CTA appears; click it.
2. Complete the picker (subject → topic) and the full 10-question timed round, letting at least one question time out unanswered.
3. Confirm the result screen shows the correct score with the count-up animation and that "Show full review" works.
4. Navigate to `/quiz/extreme` again the same day — confirm the locked/countdown state renders.
5. Directly call `startExtremeQuizAction` a second time for the same day (e.g. temporarily trigger it again from the picker by navigating back — the picker itself won't be reachable once locked, so instead re-visit `/quiz/extreme/<the-first-attemptId>` to confirm it still renders the result correctly, and confirm no way in the UI reaches the picker while locked).

- [ ] **Step 3: Weak-topics unaffected**

Before the Extreme Quiz run in Step 2, note the dashboard's weak-topics/recommendations. After completing the Extreme Quiz (which will very likely score lower, being deliberately harder), reload the dashboard — expected: the weak-topics list is unchanged by the extreme attempt's score.

- [ ] **Step 4: Global motion spot-check**

Visit `/search`, `/library`, `/quiz`, `/tutor`, and the dashboard (`/`). Expected: consistent subtle hover/press feedback on buttons and cards, and fade-in on list content, across all of them — not just the Extreme Quiz page.

- [ ] **Step 5: Clean up**

Delete the test user via the Supabase Admin API (same approach as prior phases' verification).
