# BEEd Exam Prep Platform — Phase 3 Implementation Plan: AI Summarization, Tutor, Quiz Generation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 `lib/ai` stubs with real summarization, quiz generation, and AI tutor services, and wire them into the UI via `[Summarize]`, `[Generate Quiz]`, and `[Ask AI]` actions plus a real `/tutor` chat page.

**Architecture:** Three server-only services (`lib/ai/summarize.ts`, `lib/ai/quiz.ts`, `lib/ai/tutor.ts`) share a content-fetching helper (`lib/ai/fetchContent.ts`, license-gated) and a single OpenAI client (`lib/ai/client.ts`). Each persists into its existing Phase 1 table (`study_notes`, `quiz_attempts`/`quiz_questions`, `ai_conversations`/`ai_messages`) via the Phase 2 service-role client. Server actions (`lib/ai/actions.ts`) expose them to new client components.

**Tech Stack:** `cheerio` (new), reuses `openai`, `zod`, `@supabase/supabase-js` service-role client from Phases 1-2.

**Spec:** `docs/superpowers/specs/2026-09-17-beed-phase3-ai-study-tools-design.md`

## Global Constraints

- `resource_type: pdf` and `license_status: LICENSE_UNCLEAR` resources get metadata-only AI processing (no content fetch) — see `fetchContent.ts` (Task 2).
- `COPYRIGHTED`/`NOT_RECOMMENDED` resources never reach these code paths (already excluded upstream) — no special-case handling needed for them here.
- Reuses `OPENAI_MODEL` from `.env.local` — no new env vars.
- No automated test framework — verification is `npm run build` plus manual runs against the real Supabase + OpenAI projects.
- Do not run `git commit` unless the user explicitly asks.
- shadcn's `Sheet`/`Dialog` in this project are Base UI-based (not Radix) — `components/ui/sheet.tsx` and `components/ui/dialog.tsx` already exist from Phase 1; use their existing exported components (`Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`) with standard controlled `open`/`onOpenChange` props.

---

## File Structure

```
lib/ai/
  types.ts               # NEW: Zod schemas (Summary, QuizQuestion) + QuizQuestionResult type
  client.ts                # NEW: shared lazy OpenAI client singleton
  fetchContent.ts            # NEW: license-gated HTML fetch + cheerio text extraction
  summarize.ts                 # NEW: summarizeResource() — OpenAI call + study_notes persistence
  quiz.ts                        # NEW: generateQuiz() — OpenAI call + quiz_attempts/quiz_questions persistence
  tutor.ts                         # NEW: getOrCreateConversation() + sendTutorMessage()
  index.ts                           # MODIFIED: replace Phase 1 stubs with real re-exports
  actions.ts                           # NEW: 'use server' actions for all three features
components/resource/
  ResourceCard.tsx                       # MODIFIED: render <StudyActions /> in the actions row
  StudyActions.tsx                         # NEW: Summarize/Generate Quiz buttons + owns sheet/dialog state
  SummarySheet.tsx                           # NEW: shows generated study notes
  QuizDialog.tsx                               # NEW: count/difficulty picker
  QuizResultsSheet.tsx                           # NEW: shows generated questions + answers
components/tutor/
  ChatThread.tsx                                   # NEW: message list + input, general or resource-scoped
app/(app)/
  tutor/page.tsx                                     # MODIFIED: real chat UI (was a placeholder)
  library/page.tsx                                     # MODIFIED: add StudyActions + Ask AI link per card
```

---

### Task 1: Zod Schemas + Shared OpenAI Client

**Files:**
- Create: `lib/ai/types.ts`, `lib/ai/client.ts`

**Interfaces:**
- Produces: `SummarySchema`, `Summary` type, `QuizQuestionSchema`, `QuizResponseSchema`, `QuizQuestion` type, `QuizQuestionResult` type (from `types.ts`); `getOpenAIClient(): OpenAI` (from `client.ts`) — consumed by Tasks 3, 4, 5, and by UI components in Tasks 7-8.

- [ ] **Step 1: Install cheerio**

```bash
npm install cheerio
```

- [ ] **Step 2: Write the schemas**

Create `lib/ai/types.ts`:

```ts
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
```

- [ ] **Step 3: Write the shared client**

Create `lib/ai/client.ts`:

```ts
import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 2: Content Fetching

**Files:**
- Create: `lib/ai/fetchContent.ts`

**Interfaces:**
- Produces: `fetchContent(resource: { resource_type: string; license_status: string; original_url: string }): Promise<string | null>` — consumed by `summarize.ts` (Task 3) and `quiz.ts` (Task 4).

- [ ] **Step 1: Write the fetcher**

Create `lib/ai/fetchContent.ts`:

```ts
import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_CHARS = 12_000;

export type ResourceForFetch = {
  resource_type: string;
  license_status: string;
  original_url: string;
};

export async function fetchContent(resource: ResourceForFetch): Promise<string | null> {
  if (resource.resource_type === "pdf") return null;
  if (resource.license_status === "LICENSE_UNCLEAR") return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(resource.original_url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      chunks.push(value);
      if (bytes > MAX_BYTES) break;
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");

    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    return text.slice(0, MAX_CHARS) || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual smoke test**

Run a quick ad-hoc Node script (not committed) that imports `fetchContent` and calls it with one of the seeded `OPEN_LICENSE` resources' `{resource_type: 'course_material', license_status: 'OPEN_LICENSE', original_url: '<a real seeded URL>'}` — confirm it returns a non-null string of readable text (not raw HTML tags). Also test with `license_status: 'LICENSE_UNCLEAR'` and confirm it returns `null` immediately without fetching.

---

### Task 3: Summarization Service

**Files:**
- Create: `lib/ai/summarize.ts`

**Interfaces:**
- Consumes: `getOpenAIClient` (Task 1), `SummarySchema`/`Summary` (Task 1), `fetchContent` (Task 2), `createServiceClient` from `@/lib/supabase/service` (Phase 2)
- Produces: `summarizeResource(resourceId: string, userId: string): Promise<string>` (returns formatted markdown) — consumed by `actions.ts` (Task 6).

- [ ] **Step 1: Write the summarization service**

Create `lib/ai/summarize.ts`:

```ts
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
    .select("title, description, resource_type, license_status, original_url")
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 4: Quiz Generation Service

**Files:**
- Create: `lib/ai/quiz.ts`

**Interfaces:**
- Consumes: `getOpenAIClient` (Task 1), `QuizResponseSchema`/`QuizQuestion` (Task 1), `fetchContent` (Task 2), `createServiceClient`
- Produces: `generateQuiz(resourceId: string, userId: string, count: 5 | 10 | 20 | 50, difficulty: "easy" | "medium" | "hard"): Promise<{ attemptId: string; questions: QuizQuestionResult[] }>` — consumed by `actions.ts` (Task 6).

- [ ] **Step 1: Write the quiz generation service**

Create `lib/ai/quiz.ts`:

```ts
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 5: Tutor Service

**Files:**
- Create: `lib/ai/tutor.ts`

**Interfaces:**
- Consumes: `getOpenAIClient` (Task 1), `createServiceClient`
- Produces: `getOrCreateConversation(userId: string, resourceId: string | null): Promise<{ conversationId: string; messages: { role: "user" | "assistant"; content: string }[] }>`, `sendTutorMessage(conversationId: string, resourceId: string | null, userMessage: string): Promise<string>` — consumed by `actions.ts` (Task 6).

- [ ] **Step 1: Write the tutor service**

Create `lib/ai/tutor.ts`:

```ts
import { getOpenAIClient } from "./client";
import { createServiceClient } from "@/lib/supabase/service";

type ChatMessage = { role: "user" | "assistant"; content: string };

function buildTutorSystemPrompt(resourceContext: string | null): string {
  const base = `You are a friendly, focused AI tutor for a Bachelor of Elementary Education (BEEd) exam-prep app, helping students prepare for the Philippine LET (Licensure Examination for Teachers). Stay strictly on BEEd/LET-related educational topics — politely decline unrelated requests. You can explain topics, simplify concepts, give examples, offer memory tricks/mnemonics, and quiz the student conversationally. Be concise and exam-focused.`;
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
): Promise<string> {
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
  });

  const reply = response.output_text;

  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
  });

  return reply;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 6: Replace `lib/ai` Stub + Server Actions

**Files:**
- Modify: `lib/ai/index.ts` (currently the Phase 1 stub)
- Create: `lib/ai/actions.ts`

**Interfaces:**
- Consumes: `summarizeResource` (Task 3), `generateQuiz` (Task 4), `getOrCreateConversation`/`sendTutorMessage` (Task 5), `createClient` from `@/lib/supabase/server`
- Produces: `summarizeResourceAction`, `generateQuizAction`, `startTutorConversationAction`, `sendTutorMessageAction` — consumed by UI components in Tasks 8-9.

- [ ] **Step 1: Replace the stub**

Replace the full contents of `lib/ai/index.ts`:

```ts
export { summarizeResource } from "./summarize";
export { generateQuiz } from "./quiz";
export { getOrCreateConversation, sendTutorMessage } from "./tutor";
```

- [ ] **Step 2: Write the server actions**

Create `lib/ai/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { summarizeResource } from "./summarize";
import { generateQuiz } from "./quiz";
import { getOrCreateConversation, sendTutorMessage } from "./tutor";
import type { QuizQuestionResult } from "./types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function summarizeResourceAction(
  resourceId: string
): Promise<{ content: string } | { error: string }> {
  try {
    const user = await requireUser();
    const content = await summarizeResource(resourceId, user.id);
    return { content };
  } catch {
    return { error: "Couldn't generate a summary. Please try again." };
  }
}

export async function generateQuizAction(
  resourceId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: "easy" | "medium" | "hard"
): Promise<{ attemptId: string; questions: QuizQuestionResult[] } | { error: string }> {
  try {
    const user = await requireUser();
    return await generateQuiz(resourceId, user.id, count, difficulty);
  } catch {
    return { error: "Couldn't generate a quiz. Please try again." };
  }
}

export async function startTutorConversationAction(
  resourceId: string | null
): Promise<
  | { conversationId: string; messages: { role: "user" | "assistant"; content: string }[] }
  | { error: string }
> {
  try {
    const user = await requireUser();
    return await getOrCreateConversation(user.id, resourceId);
  } catch {
    return { error: "Couldn't start a conversation. Please try again." };
  }
}

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

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 7: Summary/Quiz UI Components

**Files:**
- Create: `components/resource/SummarySheet.tsx`, `components/resource/QuizDialog.tsx`, `components/resource/QuizResultsSheet.tsx`

**Interfaces:**
- Consumes: `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle` from `@/components/ui/sheet`; `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`; `ErrorBanner` from `@/components/common/ErrorBanner`; `QuizQuestionResult` from `@/lib/ai/types`
- Produces: `SummarySheet`, `QuizDialog`, `QuizResultsSheet` — consumed by `StudyActions.tsx` (Task 8).

- [ ] **Step 1: Write the summary sheet**

Create `components/resource/SummarySheet.tsx`:

```tsx
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ErrorBanner } from "@/components/common/ErrorBanner";

export function SummarySheet({
  open,
  onOpenChange,
  loading,
  content,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  content: string | null;
  error: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Study Notes</SheetTitle>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-6">
          {loading && <p className="text-sm text-neutral-400">Generating notes…</p>}
          {error && <ErrorBanner message={error} />}
          {content && (
            <div className="whitespace-pre-wrap text-sm text-neutral-700">{content}</div>
          )}
          {content && (
            <p className="pt-2 text-xs text-neutral-400">
              AI-generated — verify against the original source before relying on it for exam
              prep.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Write the quiz config dialog**

Create `components/resource/QuizDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const COUNTS = [5, 10, 20, 50] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export function QuizDialog({
  open,
  onOpenChange,
  onGenerate,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (count: 5 | 10 | 20 | 50, difficulty: "easy" | "medium" | "hard") => void;
  loading: boolean;
}) {
  const [count, setCount] = useState<5 | 10 | 20 | 50>(10);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a quiz</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
        </div>
        <DialogFooter>
          <Button disabled={loading} onClick={() => onGenerate(count, difficulty)} className="w-full">
            {loading ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write the quiz results sheet**

Create `components/resource/QuizResultsSheet.tsx`:

```tsx
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import type { QuizQuestionResult } from "@/lib/ai/types";

export function QuizResultsSheet({
  open,
  onOpenChange,
  questions,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: QuizQuestionResult[];
  error: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Practice Quiz</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <p className="text-xs font-medium text-amber-600">
            AI Generated — practice questions, not official LET items.
          </p>
          {error && <ErrorBanner message={error} />}
          {questions.map((q, i) => (
            <div key={q.id} className="space-y-1.5 border-b border-neutral-100 pb-3">
              <p className="text-sm font-medium">
                {i + 1}. {q.question}
              </p>
              <ul className="space-y-1">
                {q.choices.map((choice) => (
                  <li
                    key={choice}
                    className={`rounded-md px-2 py-1 text-sm ${
                      choice === q.correct_answer
                        ? "bg-green-50 text-green-800"
                        : "text-neutral-600"
                    }`}
                  >
                    {choice}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-neutral-500">{q.explanation}</p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 8: StudyActions Component + Wire into ResourceCard + Library

**Files:**
- Create: `components/resource/StudyActions.tsx`
- Modify: `components/resource/ResourceCard.tsx`, `app/(app)/library/page.tsx`

**Interfaces:**
- Consumes: `summarizeResourceAction`, `generateQuizAction` (Task 6); `SummarySheet`, `QuizDialog`, `QuizResultsSheet` (Task 7); `QuizQuestionResult` (Task 1)
- Produces: `StudyActions({ resourceId, showAskAI }: { resourceId: string; showAskAI?: boolean })` — consumed by `ResourceCard.tsx` and `library/page.tsx`.

- [ ] **Step 1: Write StudyActions**

Create `components/resource/StudyActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SummarySheet } from "./SummarySheet";
import { QuizDialog } from "./QuizDialog";
import { QuizResultsSheet } from "./QuizResultsSheet";
import { summarizeResourceAction, generateQuizAction } from "@/lib/ai/actions";
import type { QuizQuestionResult } from "@/lib/ai/types";

export function StudyActions({
  resourceId,
  showAskAI,
}: {
  resourceId: string;
  showAskAI?: boolean;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryContent, setSummaryContent] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [quizDialogOpen, setQuizDialogOpen] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizResultsOpen, setQuizResultsOpen] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionResult[]>([]);
  const [quizError, setQuizError] = useState<string | null>(null);

  async function handleSummarize() {
    setSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryError(null);
    const outcome = await summarizeResourceAction(resourceId);
    setSummaryLoading(false);
    if ("error" in outcome) {
      setSummaryError(outcome.error);
      return;
    }
    setSummaryContent(outcome.content);
  }

  async function handleGenerateQuiz(count: 5 | 10 | 20 | 50, difficulty: "easy" | "medium" | "hard") {
    setQuizLoading(true);
    setQuizError(null);
    const outcome = await generateQuizAction(resourceId, count, difficulty);
    setQuizLoading(false);
    if ("error" in outcome) {
      setQuizError(outcome.error);
      return;
    }
    setQuizQuestions(outcome.questions);
    setQuizDialogOpen(false);
    setQuizResultsOpen(true);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleSummarize}>
        Summarize
      </Button>
      <Button size="sm" variant="outline" onClick={() => setQuizDialogOpen(true)}>
        Generate Quiz
      </Button>
      {showAskAI && (
        <Link href={`/tutor?resourceId=${resourceId}`}>
          <Button size="sm" variant="outline">
            Ask AI
          </Button>
        </Link>
      )}

      <SummarySheet
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        loading={summaryLoading}
        content={summaryContent}
        error={summaryError}
      />
      <QuizDialog
        open={quizDialogOpen}
        onOpenChange={setQuizDialogOpen}
        onGenerate={handleGenerateQuiz}
        loading={quizLoading}
      />
      <QuizResultsSheet
        open={quizResultsOpen}
        onOpenChange={setQuizResultsOpen}
        questions={quizQuestions}
        error={quizError}
      />
    </>
  );
}
```

- [ ] **Step 2: Wire into ResourceCard**

Edit `components/resource/ResourceCard.tsx` — add the import and drop `<StudyActions>` into the existing actions row (after the Save button):

```tsx
import { StudyActions } from "./StudyActions";
```

```tsx
      <div className="flex flex-wrap gap-2 pt-1">
        <a href={resource.original_url} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline">
            Open
          </Button>
        </a>
        <Button
          size="sm"
          variant={saved ? "secondary" : "default"}
          onClick={() => onToggleSave(resource.id)}
        >
          {saved ? "Saved" : "Save"}
        </Button>
        <StudyActions resourceId={resource.id} />
      </div>
```

(Change `flex gap-2 pt-1` to `flex flex-wrap gap-2 pt-1` so the extra buttons wrap on narrow screens instead of overflowing.)

- [ ] **Step 3: Wire into Library page**

Edit `app/(app)/library/page.tsx` — add the import and drop `<StudyActions resourceId={resource!.id} showAskAI />` into the existing actions row (alongside Open/Remove):

```tsx
import { StudyActions } from "@/components/resource/StudyActions";
```

```tsx
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={resource!.original_url} target="_blank" rel="noopener noreferrer">
                <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
                  Open
                </button>
              </a>
              <UnsaveButton resourceId={resource!.id} />
              <StudyActions resourceId={resource!.id} showAskAI />
            </div>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 9: Tutor Chat UI

**Files:**
- Create: `components/tutor/ChatThread.tsx`
- Modify: `app/(app)/tutor/page.tsx`

**Interfaces:**
- Consumes: `startTutorConversationAction`, `sendTutorMessageAction` (Task 6); `createClient` from `@/lib/supabase/server` (for fetching the resource title when scoped)
- Produces: `ChatThread({ resourceId, resourceTitle }: { resourceId: string | null; resourceTitle?: string })`

- [ ] **Step 1: Write ChatThread**

Create `components/tutor/ChatThread.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { startTutorConversationAction, sendTutorMessageAction } from "@/lib/ai/actions";

type Message = { role: "user" | "assistant"; content: string };

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
    setMessages((prev) => [...prev, { role: "assistant", content: outcome.reply }]);
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
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
              }`}
            >
              {m.content}
            </div>
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
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <Button onClick={handleSend} disabled={sending || !input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the tutor page placeholder**

Replace the full contents of `app/(app)/tutor/page.tsx`:

```tsx
import { ChatThread } from "@/components/tutor/ChatThread";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ resourceId?: string }>;
}) {
  const { resourceId } = await searchParams;
  let resourceTitle: string | undefined;

  if (resourceId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("resources")
      .select("title")
      .eq("id", resourceId)
      .maybeSingle();
    resourceTitle = data?.title;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">AI Tutor</h1>
        <p className="text-sm text-neutral-500">
          {resourceId ? "Ask about this resource." : "Ask about any BEEd/LET topic."}
        </p>
      </div>
      <ChatThread resourceId={resourceId ?? null} resourceTitle={resourceTitle} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 10: Manual End-to-End Verification

**Files:** none (verification only)

- [ ] **Step 1: Summarization**

Run `npm run dev`, sign in, go to `/search`, search a topic with an `OPEN_LICENSE` or `OPEN_ACCESS` HTML result (e.g. "assessment"), tap `[Summarize]`. Expected: a sheet opens with a loading state, then real structured notes (key concepts, definitions, exam notes, simple explanation) that are clearly derived from that specific resource's content, not generic. Tap `[Summarize]` again on the same card — expected: near-instant (cache hit from `study_notes`, no new OpenAI call within the 7-day window).

- [ ] **Step 2: Metadata-only summarization**

Find or AI-research a `LICENSE_UNCLEAR` resource, tap `[Summarize]`. Expected: still produces a summary, but visibly working from limited information (won't reference specifics only present in the full page text).

- [ ] **Step 3: Quiz generation**

Tap `[Generate Quiz]` on a resource, pick 5 questions / easy, generate. Expected: a sheet with 5 questions, 4 choices each, the correct answer visually highlighted, an explanation per question, and the "AI Generated" disclaimer visible. Check `select * from quiz_attempts order by created_at desc limit 1;` and `select count(*) from quiz_questions where quiz_attempt_id = '<that id>';` directly in Postgres to confirm persistence (should be 5 rows).

- [ ] **Step 4: Tutor — general**

Go to `/tutor`, ask "What's the difference between formative and summative assessment?" Expected: an on-topic, coherent answer. Send a follow-up ("give me a memory trick for that") and confirm the reply shows awareness of the prior message (conversation history is working). Refresh the page — expected: the same conversation reloads (via `getOrCreateConversation`'s find-existing path), not a blank chat.

- [ ] **Step 5: Tutor — resource-scoped**

From `/library`, tap `[Ask AI]` on a saved resource. Expected: navigates to `/tutor?resourceId=...`, shows "Chatting about: `<title>`" in the header, and a question like "Explain this" produces an answer grounded in that resource's title/description.

- [ ] **Step 6: Clean up**

Delete any test-only data created during verification (test user, if a fresh one was created) the same way Phases 1-2 did, via the Supabase Admin API. Leave any genuinely useful AI-generated content (summaries, quiz questions) in place.

---

## Post-Plan Notes

- `study_notes` has no unique constraint on `(user_id, resource_id)` — `summarize.ts` handles this with an explicit select-then-branch instead of a DB-level upsert, avoiding a new migration. If this pattern shows race conditions under concurrent use later, that's when a unique constraint + real upsert would be worth adding.
- The tutor's "one active conversation per scope" design (general, or per-resource) means there's no conversation history list or way to start a deliberately fresh conversation in Phase 3 — noted in the spec as an intentional Phase 3 boundary.
