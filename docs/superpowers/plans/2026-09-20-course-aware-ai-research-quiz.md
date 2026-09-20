# Course-Aware AI Research + Quiz Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI web-search research pipeline ("Research this topic with AI" on the search page) and the AI quiz-question generator stop assuming every user is a BEEd/LET reviewee, so a Civil Service Exam (or BSEd) user gets resources classified into their own course's subjects and quiz questions framed for their own exam.

**Architecture:** A new `COURSE_EXAM_CONTEXT` map centralizes per-course prompt framing. The research pipeline (`lib/research/*`) resolves the caller's course + visible subjects (reusing the existing `getVisibleSubjects` helper) and threads them through the OpenAI system prompt, the structured-output JSON schema's `subject_slug` enum, and the 30-day research cache (now scoped by a new `research_queries.course_id` column). The quiz generator (`lib/ai/quiz.ts`) resolves the relevant course via whichever topic/subject/resource it's generating from and threads the same label into its system prompt.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + PostgREST + `@supabase/supabase-js`), OpenAI `responses` API with `web_search` tool + structured JSON schema output, Zod. No test framework — verification is `npx tsc --noEmit` + `npm run lint` + manual testing through the running dev server (this project has no Jest/Vitest/Playwright; do not add one).

**Spec:** `docs/superpowers/specs/2026-09-20-course-aware-ai-research-quiz-design.md`

## Global Constraints

- Apply the fix generally across all courses (BEEd, BSEd, Civil Service Exam) — not a Civil-Service-only patch (confirmed with the user during brainstorming).
- No UI changes. Both flows (search page's research button, quiz-start actions) already run server-side per the authenticated user — making the server-side pipelines course-aware is sufficient.
- DB migrations in this repo are applied manually by the user via the Supabase SQL Editor (no CLI/CI pipeline wired up) — the task that adds a migration file must pause for the user to run it before its verification step.
- `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are in `.env.local`; scripts read them via `node --env-file=.env.local` (Node 22+).
- Run `npx tsc --noEmit` and `npm run lint` at the end of every task; both must be clean before committing.
- OpenAI calls (research + quiz generation) cost real API credits and take up to ~30s — do not script automated calls to them; verify those two flows manually through the running dev server, signed in as a real user.

---

### Task 1: `COURSE_EXAM_CONTEXT` map

**Files:**
- Modify: `lib/sources/courses.ts`

**Interfaces:**
- Produces: `export const COURSE_EXAM_CONTEXT: Record<string, string>` and `export const DEFAULT_COURSE_EXAM_CONTEXT: string` — Tasks 3 and 4 import both.

- [ ] **Step 1: Add the map to `lib/sources/courses.ts`**

Current file contents:

```ts
export const COURSES = [
  { slug: "beed", name: "BEEd" },
  { slug: "bsed", name: "BSEd" },
  { slug: "civil-service-exam", name: "Civil Service Exam" },
] as const;

export const BSED_MAJORS = [
  { slug: "english", name: "English" },
  { slug: "mathematics", name: "Mathematics" },
  { slug: "filipino", name: "Filipino" },
  { slug: "biological-science", name: "Biological Science" },
  { slug: "physical-education", name: "Physical Education" },
  { slug: "social-studies", name: "Social Studies" },
] as const;
```

Append this to the end of the file:

```ts

export const COURSE_EXAM_CONTEXT: Record<string, string> = {
  beed: "a Bachelor of Elementary Education (BEEd) exam-prep app used by Filipino education students preparing for the LET (Licensure Examination for Teachers)",
  bsed: "a Bachelor of Secondary Education (BSEd) exam-prep app used by Filipino education students preparing for the LET (Licensure Examination for Teachers)",
  "civil-service-exam": "a Civil Service Exam (CSE) reviewer app used by Filipinos preparing for the Philippine Civil Service Exam",
};

export const DEFAULT_COURSE_EXAM_CONTEXT = COURSE_EXAM_CONTEXT.beed;
```

- [ ] **Step 2: Run `npx tsc --noEmit` and `npm run lint`**

Expected: no errors from either command.

- [ ] **Step 3: Commit**

```bash
git add lib/sources/courses.ts
git commit -m "Add per-course exam context labels for AI prompts"
```

---

### Task 2: Migration — `research_queries.course_id`

**Files:**
- Create: `supabase/migrations/0016_research_queries_course_scope.sql`

**Interfaces:**
- Produces: `research_queries.course_id` (nullable `uuid references courses(id)`) — Task 3's `cache.ts`/`persist.ts`/`index.ts` changes depend on this column existing.

- [ ] **Step 1: Write the migration**

```sql
alter table research_queries
  add column course_id uuid references courses(id);
```

- [ ] **Step 2: Ask the user to run it**

Tell the user: "Run this SQL in the Supabase Dashboard → SQL Editor before I can verify this task," and paste the exact SQL from Step 1. Wait for their confirmation before continuing.

- [ ] **Step 3: Verify the column exists**

```bash
curl -s "https://svfqneambjkmktidaypa.supabase.co/rest/v1/research_queries?select=id,course_id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: a JSON array (possibly empty if no research has run yet) with no PostgREST "column does not exist" error. If the array is empty, additionally confirm the column is queryable at all by checking the response has no `"code"`/`"message"` error fields.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0016_research_queries_course_scope.sql
git commit -m "Add research_queries.course_id for course-scoped research caching"
```

---

### Task 3: Course-aware AI research pipeline

**Files:**
- Modify: `lib/research/types.ts`
- Modify: `lib/research/prompt.ts`
- Modify: `lib/research/callOpenAI.ts`
- Modify: `lib/research/cache.ts`
- Modify: `lib/research/persist.ts`
- Modify: `lib/research/index.ts`

**Interfaces:**
- Consumes: `COURSE_EXAM_CONTEXT`, `DEFAULT_COURSE_EXAM_CONTEXT` (Task 1); `getVisibleSubjects(userId: string): Promise<{id: string; slug: string; name: string}[]>` from `lib/sources/visibleSubjects.ts` (already exists); `createServiceClient()` from `lib/supabase/service.ts` (already exists); `research_queries.course_id` (Task 2, must already be applied in the DB for this task's manual verification to pass — `tsc`/lint don't depend on it since this project's Supabase client is untyped).
- Produces: no new exported functions — this task changes existing exported signatures (`buildSystemPrompt`, `buildUserPrompt`, `callOpenAIResearch`, `findCachedResults`, `persistResults`, `researchTopic`) all in one commit, since a reviewer can't sensibly approve one changed signature without its caller being updated in the same breath. `researchTopic(query: string, userId: string): Promise<ResourceHit[]>` — its external signature is unchanged, so `lib/research/actions.ts` needs no changes.

- [ ] **Step 1: Rewrite `lib/research/types.ts`**

Full new contents (removes the hardcoded `SUBJECT_SLUGS` enum — nothing outside this file used it):

```ts
import { z } from "zod";

export const LICENSE_STATUS_VALUES = [
  "OPEN_LICENSE",
  "PUBLIC_DOMAIN",
  "OPEN_ACCESS",
  "LICENSE_UNCLEAR",
  "COPYRIGHTED",
  "NOT_RECOMMENDED",
] as const;

export const RESOURCE_TYPE_VALUES = [
  "article",
  "pdf",
  "course_material",
  "study_guide",
  "practice_questions",
] as const;

export const ResearchedResourceSchema = z.object({
  title: z.string().min(1),
  author: z.string().nullable(),
  source: z.string().min(1),
  original_url: z.string().url(),
  description: z.string().min(1),
  resource_type: z.enum(RESOURCE_TYPE_VALUES),
  license: z.string().nullable(),
  license_status: z.enum(LICENSE_STATUS_VALUES),
  license_evidence: z.string().min(1),
  subject_slug: z.string().min(1),
  topics: z.array(z.string().min(1)).min(1).max(4),
});

export const ResearchResponseSchema = z.object({
  resources: z.array(ResearchedResourceSchema),
});

export type ResearchedResource = z.infer<typeof ResearchedResourceSchema>;
```

`subject_slug` moved from `z.enum(SUBJECT_SLUGS)` to `z.string().min(1)` because the allowed slugs are now per-request (per course), not a fixed compile-time list — zod enums can't be built dynamically. The real membership check moves to `persist.ts` (Step 5).

- [ ] **Step 2: Rewrite `lib/research/prompt.ts`**

Full new contents:

```ts
export function buildSystemPrompt(
  courseLabel: string,
  subjects: { slug: string; name: string }[]
): string {
  const subjectList = subjects.map((s) => `- ${s.slug}: ${s.name}`).join("\n");

  return `You are a research assistant for ${courseLabel}.

Your job is to search the web and find LEGALLY ACCESSIBLE, OPENLY REUSABLE educational resources relevant to a requested topic. You must follow these rules exactly:

WHAT TO SEARCH FOR:
- Open Educational Resources (OER)
- Open-access educational materials
- Public university learning materials and repositories
- Openly licensed reviewer materials and study guides
- Public-domain educational resources (including official government education materials)
- Course materials, lecture notes, and practice questions where legally and openly available

WHAT TO NEVER SEARCH FOR OR RETURN:
- Pirated, leaked, or scanned copies of named commercial reviewer books
- Content from file-sharing sites hosting copyrighted material without permission
- Anything where you cannot tell if the content is legitimately posted by its rights holder

SOURCE PRIORITY:
- Always prefer the original/primary source (the university, government agency, or author's own site) over aggregators, blogs, or sites republishing someone else's content.

LICENSE STATUS — be conservative, never overstate openness:
- "OPEN_LICENSE": use ONLY when the source page explicitly states a license (e.g. "CC BY 4.0", "CC BY-SA"). Quote or closely paraphrase the exact statement in license_evidence.
- "PUBLIC_DOMAIN": use ONLY when explicitly stated as public domain, OR the source is a government agency (government works are often public domain — state which agency in license_evidence).
- "OPEN_ACCESS": use when the material is freely readable without a paywall or login, but no explicit reuse license is stated. Say so in license_evidence.
- "LICENSE_UNCLEAR": use whenever you cannot confidently determine the above from what you can see on the page. When in doubt, use this status — NEVER guess "OPEN_LICENSE" to make a result look better.
- Do not return anything you would classify as "COPYRIGHTED" or "NOT_RECOMMENDED" at all — simply exclude it from your results.

SUBJECT CLASSIFICATION:
Classify each resource under exactly one of these subject slugs:
${subjectList}
If a resource does not clearly belong to one of these subjects, do NOT include it in your results.

For each resource you include, also provide 1-4 short topic phrases (e.g. "Formative Assessment", "Validity") describing what it specifically covers within that subject.

Write your own original 1-2 sentence description for each resource — do not copy sentences from the source page.`;
}

export function buildUserPrompt(query: string, courseLabel: string): string {
  return `Find legally accessible, openly reusable educational resources for this topic (relevant to ${courseLabel}): "${query}"`;
}
```

(The `SUBJECTS` import from `lib/sources/subjects.ts` is gone — the subject list now comes in as a parameter.)

- [ ] **Step 3: Rewrite `lib/research/callOpenAI.ts`**

Full new contents:

```ts
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
```

- [ ] **Step 4: Rewrite `lib/research/cache.ts`**

Full new contents:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import type { ResourceHit } from "@/lib/search/searchResources";

const CACHE_FRESHNESS_DAYS = 30;

export async function findCachedResults(
  query: string,
  courseId: string | null
): Promise<ResourceHit[] | null> {
  const supabase = createServiceClient();
  const normalized = query.trim();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_FRESHNESS_DAYS);

  const base = supabase
    .from("research_queries")
    .select("id")
    .ilike("query_text", normalized)
    .gte("created_at", cutoff.toISOString());

  const { data: matchingQuery } = courseId
    ? await base.eq("course_id", courseId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : await base.is("course_id", null).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!matchingQuery) return null;

  const { data: results } = await supabase
    .from("research_results")
    .select(
      "resources(id, title, description, source, resource_type, license_status, original_url)"
    )
    .eq("research_query_id", matchingQuery.id);

  if (!results || results.length === 0) return null;

  const hits = results
    .map((r) => (Array.isArray(r.resources) ? r.resources[0] : r.resources))
    .filter((r): r is NonNullable<typeof r> => !!r);

  return hits as unknown as ResourceHit[];
}
```

- [ ] **Step 5: Rewrite `lib/research/persist.ts`**

Full new contents:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import type { ResearchedResource } from "./types";
import type { ResourceHit } from "@/lib/search/searchResources";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function persistResults(
  query: string,
  userId: string,
  courseId: string | null,
  allowedSubjectSlugs: Set<string>,
  results: ResearchedResource[]
): Promise<ResourceHit[]> {
  const supabase = createServiceClient();
  const hits: ResourceHit[] = [];
  const resourceIds: string[] = [];

  for (const r of results) {
    const { data: resource, error } = await supabase
      .from("resources")
      .upsert(
        {
          title: r.title,
          author: r.author,
          source: r.source,
          original_url: r.original_url,
          description: r.description,
          resource_type: r.resource_type,
          license: r.license,
          license_status: r.license_status,
          license_evidence: r.license_evidence,
          content_location: r.original_url,
          last_checked: new Date().toISOString(),
        },
        { onConflict: "original_url" }
      )
      .select("id, title, description, source, resource_type, license_status, original_url")
      .single();

    if (error || !resource) continue;

    if (allowedSubjectSlugs.has(r.subject_slug)) {
      const { data: subject } = await supabase
        .from("subjects")
        .select("id")
        .eq("slug", r.subject_slug)
        .single();

      if (subject) {
        for (const topicName of r.topics) {
          const topicSlug = slugify(topicName);
          if (!topicSlug) continue;

          const { data: topic } = await supabase
            .from("topics")
            .upsert(
              { subject_id: subject.id, slug: topicSlug, name: topicName },
              { onConflict: "subject_id,slug" }
            )
            .select("id")
            .single();

          if (topic) {
            await supabase
              .from("resource_topics")
              .upsert(
                { resource_id: resource.id, topic_id: topic.id },
                { onConflict: "resource_id,topic_id" }
              );
          }
        }
      }
    }

    hits.push(resource as ResourceHit);
    resourceIds.push(resource.id);
  }

  const { data: queryRow } = await supabase
    .from("research_queries")
    .insert({ user_id: userId, query_text: query, course_id: courseId })
    .select("id")
    .single();

  if (queryRow && resourceIds.length > 0) {
    await supabase
      .from("research_results")
      .insert(resourceIds.map((id) => ({ research_query_id: queryRow.id, resource_id: id })));
  }

  return hits;
}
```

(A `subject_slug` outside `allowedSubjectSlugs` now skips topic-linking entirely — same "no subject match" behavior the code already had when the slug lookup missed, just reached a different way.)

- [ ] **Step 6: Rewrite `lib/research/index.ts`**

Full new contents:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import { getVisibleSubjects } from "@/lib/sources/visibleSubjects";
import { COURSE_EXAM_CONTEXT, DEFAULT_COURSE_EXAM_CONTEXT } from "@/lib/sources/courses";
import { findCachedResults } from "./cache";
import { checkRateLimit } from "./rateLimit";
import { callOpenAIResearch } from "./callOpenAI";
import { persistResults } from "./persist";
import type { ResourceHit } from "@/lib/search/searchResources";

export class RateLimitError extends Error {}
export class ResearchFailedError extends Error {}

async function getCourseContext(
  userId: string
): Promise<{ courseId: string | null; courseLabel: string }> {
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("course_id, courses(slug)")
    .eq("id", userId)
    .maybeSingle();

  const courseId = profile?.course_id ?? null;
  const courseRow = Array.isArray(profile?.courses) ? profile?.courses[0] : profile?.courses;
  const courseLabel = courseRow?.slug
    ? COURSE_EXAM_CONTEXT[courseRow.slug] ?? DEFAULT_COURSE_EXAM_CONTEXT
    : DEFAULT_COURSE_EXAM_CONTEXT;

  return { courseId, courseLabel };
}

export async function researchTopic(query: string, userId: string): Promise<ResourceHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { courseId, courseLabel } = await getCourseContext(userId);

  const cached = await findCachedResults(trimmed, courseId);
  if (cached) return cached;

  const allowed = await checkRateLimit(userId);
  if (!allowed) {
    throw new RateLimitError("You've hit today's research limit — try again tomorrow.");
  }

  const subjects = await getVisibleSubjects(userId);
  if (subjects.length === 0) {
    throw new ResearchFailedError("No subjects available to classify results for your course.");
  }

  let results;
  try {
    results = await callOpenAIResearch(trimmed, courseLabel, subjects);
  } catch {
    throw new ResearchFailedError("Research failed. Please try again.");
  }

  if (results.length === 0) return [];

  const allowedSlugs = new Set(subjects.map((s) => s.slug));
  return persistResults(trimmed, userId, courseId, allowedSlugs, results);
}
```

- [ ] **Step 7: Run `npx tsc --noEmit` and `npm run lint`**

Expected: no errors. This is the main correctness gate for this task — a mismatched signature anywhere in the six files above shows up here.

- [ ] **Step 8: Manual verification through the running dev server**

This step needs Task 2's migration already applied and the dev server running (`npm run dev`). Costs real OpenAI API credits — do once, not repeatedly.

1. Pick or create a test account whose `profiles.course_id` is the Civil Service Exam course. Quickest way: in the Supabase Dashboard → Table Editor → `profiles`, find your own test user's row and temporarily set `course_id` to the Civil Service Exam course's id (look it up via `select id from courses where slug = 'civil-service-exam'` in the SQL Editor).
2. Sign in as that account, go to `/search`, type a Civil-Service-relevant phrase such as "reading comprehension" or "Philippine constitution".
3. Click "Research this topic with AI" and wait (up to ~30s).
4. Expected: results appear (or a clean empty state if genuinely nothing was found — not an error), and if you check the `resources`/`resource_topics` tables afterward via the SQL Editor, any linked topic traces back to a Civil-Service-Exam subject (`numerical-ability`, `verbal-ability`, `analytical-logical-reasoning`, `clerical-ability`, or `general-information`), not a BEEd one.
5. Restore the test profile's `course_id` back to whatever it was before, if it matters for your own account.

- [ ] **Step 9: Commit**

```bash
git add lib/research/types.ts lib/research/prompt.ts lib/research/callOpenAI.ts lib/research/cache.ts lib/research/persist.ts lib/research/index.ts
git commit -m "Make the AI research pipeline course-aware"
```

---

### Task 4: Course-aware quiz generator

**Files:**
- Modify: `lib/ai/quiz.ts`

**Interfaces:**
- Consumes: `COURSE_EXAM_CONTEXT`, `DEFAULT_COURSE_EXAM_CONTEXT` (Task 1).
- Produces: no new exports; `generateQuiz`, `generateTopicQuiz`, `generateSubjectQuiz` keep their existing external signatures (all still take the same params, return the same shapes) — only their internal prompt-building changes, so `lib/quiz/actions.ts` and `lib/ai/actions.ts` need no changes.

- [ ] **Step 1: Add the import and a shared course-label resolver**

At the top of `lib/ai/quiz.ts`, add to the existing imports:

```ts
import { COURSE_EXAM_CONTEXT, DEFAULT_COURSE_EXAM_CONTEXT } from "@/lib/sources/courses";
```

Add this helper right after the `QuizDifficulty` type definition:

```ts
function resolveCourseLabel(courseSlug: string | null | undefined): string {
  if (!courseSlug) return DEFAULT_COURSE_EXAM_CONTEXT;
  return COURSE_EXAM_CONTEXT[courseSlug] ?? DEFAULT_COURSE_EXAM_CONTEXT;
}
```

- [ ] **Step 2: Update `buildQuizSystemPrompt`**

Change:

```ts
function buildQuizSystemPrompt(count: number, difficulty: QuizDifficulty): string {
  const extremeInstruction =
    difficulty === "extreme"
      ? " This is EXTREME difficulty: write questions that would challenge a top-performing reviewee — trickier distractors, less forgiving phrasing, edge-case scenarios, and details that require precise recall, not just general familiarity."
      : "";
  return `You are a quiz question generator for a Bachelor of Elementary Education (BEEd) exam-prep app. Generate exactly ${count} multiple-choice practice questions at ${difficulty} difficulty, based on the given resource.${extremeInstruction} Each question needs exactly 4 choices, one correct_answer that exactly matches one of the choices verbatim, and a short explanation of why it's correct. These are AI-generated practice questions, not official LET exam questions — write them to be genuinely useful for review, grounded in the given content, not generic trivia.`;
}
```

to:

```ts
function buildQuizSystemPrompt(count: number, difficulty: QuizDifficulty, courseLabel: string): string {
  const extremeInstruction =
    difficulty === "extreme"
      ? " This is EXTREME difficulty: write questions that would challenge a top-performing reviewee — trickier distractors, less forgiving phrasing, edge-case scenarios, and details that require precise recall, not just general familiarity."
      : "";
  return `You are a quiz question generator for ${courseLabel}. Generate exactly ${count} multiple-choice practice questions at ${difficulty} difficulty, based on the given resource.${extremeInstruction} Each question needs exactly 4 choices, one correct_answer that exactly matches one of the choices verbatim, and a short explanation of why it's correct. These are AI-generated practice questions, not official exam questions — write them to be genuinely useful for review, grounded in the given content, not generic trivia.`;
}
```

- [ ] **Step 3: Update `generateQuiz` to resolve course via the resource's linked topic**

Change the line `const content = await fetchContent(resource);` block in `generateQuiz` to also resolve a course label right after it:

```ts
  const content = await fetchContent(resource);

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
  const courseLabel = resolveCourseLabel(linkedCourse?.slug);
```

Then change the call further down:

```ts
  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildQuizSystemPrompt(count, difficulty) },
      { role: "user", content: buildQuizUserPrompt(resource, content) },
    ],
```

to:

```ts
  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildQuizSystemPrompt(count, difficulty, courseLabel) },
      { role: "user", content: buildQuizUserPrompt(resource, content) },
    ],
```

- [ ] **Step 4: Update `buildTopicQuizUserPrompt` and `generateTopicQuiz`**

Change:

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
```

to:

```ts
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
```

In `generateTopicQuiz`, change:

```ts
  const { data: topic } = await supabase
    .from("topics")
    .select("name, subjects(name)")
    .eq("id", topicId)
    .single();

  if (!topic) throw new Error("Topic not found");
  const subject = Array.isArray(topic.subjects) ? topic.subjects[0] : topic.subjects;
```

to:

```ts
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
```

Then change the two call sites further down in the same function:

```ts
  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildQuizSystemPrompt(count, difficulty) },
      {
        role: "user",
        content: buildTopicQuizUserPrompt(topic.name, subject?.name ?? "General", contextLines),
      },
    ],
```

to:

```ts
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
```

- [ ] **Step 5: Update `buildSubjectQuizUserPrompt` and `generateSubjectQuiz`**

Change:

```ts
function buildSubjectQuizUserPrompt(
  subjectName: string,
  topicNames: string[],
  contextLines: string[]
): string {
  const context =
    contextLines.length > 0
      ? contextLines.join("\n")
      : "(no linked resources yet — generate from general BEEd/LET curriculum knowledge of this subject)";
  return `Subject: "${subjectName}"\n\nTopics covered in this subject:\n${topicNames.map((t) => `- ${t}`).join("\n")}\n\nRelated resources:\n${context}\n\nGenerate the questions spanning a mix of the topics above, not just one of them.`;
}
```

to:

```ts
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
```

In `generateSubjectQuiz`, change:

```ts
  const { data: subject } = await supabase
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .single();

  if (!subject) throw new Error("Subject not found");
```

to:

```ts
  const { data: subject } = await supabase
    .from("subjects")
    .select("name, courses(slug)")
    .eq("id", subjectId)
    .single();

  if (!subject) throw new Error("Subject not found");
  const subjectCourseRow = Array.isArray(subject.courses) ? subject.courses[0] : subject.courses;
  const courseLabel = resolveCourseLabel(subjectCourseRow?.slug);
```

Then change the two call sites further down in the same function:

```ts
  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    input: [
      { role: "system", content: buildQuizSystemPrompt(count, difficulty) },
      {
        role: "user",
        content: buildSubjectQuizUserPrompt(
          subject.name,
          topics.map((t) => t.name),
          contextLines
        ),
      },
    ],
```

to:

```ts
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
```

- [ ] **Step 6: Run `npx tsc --noEmit` and `npm run lint`**

Expected: no errors.

- [ ] **Step 7: Manual verification through the running dev server**

Costs real OpenAI API credits — do once.

1. Using the same Civil-Service-Exam test account from Task 3 Step 8 (or set one up the same way), go to `/quiz`.
2. Pick the "Numerical Ability" subject → "Basic Arithmetic" topic (seeded in `0010_civil_service_exam_course.sql`), any difficulty, 5 questions.
3. Expected: the quiz generates successfully and the questions read as Civil-Service/numerical-reasoning-appropriate (arithmetic word problems, sequences, etc.) — not teaching/pedagogy-flavored.
4. Regression check: as a BEEd user, generate a quiz for an existing BEEd topic (e.g. "Assessment of Learning" → any topic) and confirm it still works and reads the same as before this change.

- [ ] **Step 8: Commit**

```bash
git add lib/ai/quiz.ts
git commit -m "Make the AI quiz generator course-aware"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (`COURSE_EXAM_CONTEXT`) → Task 1. Section 2 (research pipeline: `index.ts`, `cache.ts`, `persist.ts`, `prompt.ts`, `callOpenAI.ts`, `types.ts`) → Task 3. Section 3 (migration) → Task 2. Section 4 (quiz generator: `generateQuiz`, `generateTopicQuiz`, `generateSubjectQuiz`) → Task 4. No spec section is without a task.
- **Placeholder scan:** no TBD/TODO; every step shows exact before/after code, not a description of intent.
- **Type consistency:** `COURSE_EXAM_CONTEXT`/`DEFAULT_COURSE_EXAM_CONTEXT` (Task 1) are consumed with the same names in both Task 3 (`index.ts`) and Task 4 (`quiz.ts`). `getVisibleSubjects`'s return shape (`{id, slug, name}[]`) is structurally compatible with the `{slug, name}[]` parameter type used in `prompt.ts`/`callOpenAI.ts` — passing the wider type where the narrower one is expected is valid TS. `persistResults`'s new `courseId`/`allowedSubjectSlugs` parameters (Task 3, Step 5) match exactly how `index.ts` (Step 6) calls it. `researchTopic`'s external signature is unchanged, so `lib/research/actions.ts` (not touched by this plan) keeps compiling.
- **Why Task 3 is one big task, not six small ones:** `prompt.ts`, `callOpenAI.ts`, `cache.ts`, `persist.ts`, and `index.ts` all change signatures in the same breath — committing any subset alone would leave `tsc --noEmit` failing on the others (e.g. shipping the new `callOpenAIResearch(query, courseLabel, subjects)` signature without updating `index.ts`'s call site breaks the build). A reviewer cannot meaningfully approve one of these six files' changes while rejecting another, so per the task-right-sizing rule they belong in one task with one clean compile at the end.
- **No automated test for the two AI flows:** this project has no test runner, and scripting real calls to the OpenAI `responses` API in a plan-verification step would spend real API credits on every plan re-run. `tsc`/lint catch every wiring mistake in the refactor (the actual risk here, since the prompt-building/schema functions are pure and this task is fundamentally "thread a new parameter through six files correctly"); the manual browser steps in Task 3 Step 8 and Task 4 Step 7 are the acceptance test for prompt *quality*, which no automated check can judge anyway.
