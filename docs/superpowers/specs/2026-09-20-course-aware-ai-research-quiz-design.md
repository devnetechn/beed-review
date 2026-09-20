# Course-aware AI research + quiz generation design

## Problem

The reviewer added a Civil Service Exam (CSE) course in
`0010_civil_service_exam_course.sql`, with its own subjects/topics
(Numerical Ability, Verbal Ability, Analytical/Logical Reasoning,
Clerical Ability, General Information) already properly scoped in the
data layer (`0011_bsed_major_subjects.sql` fixed the original 13
subjects to be BEEd-only, so CSE subjects don't leak into BEEd/BSEd
pickers or vice versa — the data model itself is fine).

Two AI-facing subsystems never learned about courses other than BEEd:

1. **AI research/scraping pipeline** (`lib/research/*`) — the "Research
   this topic with AI" button on the search page uses OpenAI's
   `web_search` tool to find Open Educational Resources and classify
   them into a subject. The system prompt (`lib/research/prompt.ts`)
   hardcodes "BEEd/LET" framing, and the classification enum
   (`lib/research/callOpenAI.ts`'s JSON schema, mirrored in
   `lib/research/types.ts`'s zod schema) hardcodes the 13 BEEd/LET
   subject slugs. A CSE user running this feature would have any found
   resource either misclassified against a BEEd subject or silently
   dropped — CSE never gets its own scraped, openly-licensed reviewer
   content.

2. **Quiz question generator** (`lib/ai/quiz.ts`) — the system prompt
   is hardcoded to `"You are a quiz question generator for a Bachelor
   of Elementary Education (BEEd) exam-prep app."` regardless of which
   course the topic/subject/resource actually belongs to, and the
   "no linked resources" fallback text tells the model to draw on
   "general BEEd/LET curriculum knowledge" even when generating a CSE
   quiz.

The user wants CSE to have its own real-world sourced content (via the
same AI web-search research mechanism BEEd already has) and for both
subsystems to stop assuming everything is BEEd/LET. Scope: fix this
generally for all courses (BEEd, BSEd, Civil Service Exam), not a
CSE-only patch — confirmed with the user during brainstorming.

## Decisions already made

- Centralize course framing in one small map rather than duplicating
  wording across the two subsystems.
- Reuse the existing `getVisibleSubjects(userId)` helper (built for the
  BSEd major-scoping work) as the source of "which subjects can this
  user's research results be classified into" — no new subject-listing
  mechanism.
- No UI changes. The search page's existing "Research this topic with
  AI" button and the existing quiz-start flows already run server-side
  per the authenticated user; making the server-side pipelines
  course-aware is sufficient.
- Add a nullable `research_queries.course_id` column so the 30-day
  research cache doesn't cross-contaminate between courses for
  same-text queries (e.g. "reading comprehension" exists as a
  plausible query under both BEEd/English and CSE/Verbal Ability).

## Design

### 1. Centralized course context — `lib/sources/courses.ts`

```ts
export const COURSE_EXAM_CONTEXT: Record<string, string> = {
  beed: "a Bachelor of Elementary Education (BEEd) exam-prep app used by Filipino education students preparing for the LET (Licensure Examination for Teachers)",
  bsed: "a Bachelor of Secondary Education (BSEd) exam-prep app used by Filipino education students preparing for the LET (Licensure Examination for Teachers)",
  "civil-service-exam": "a Civil Service Exam (CSE) reviewer app used by Filipinos preparing for the Philippine Civil Service Exam",
};

export const DEFAULT_COURSE_EXAM_CONTEXT = COURSE_EXAM_CONTEXT.beed;
```

`DEFAULT_COURSE_EXAM_CONTEXT` is the fallback whenever a course can't be
resolved (e.g. a resource not yet linked to any topic). Approved wording
confirmed with the user during brainstorming.

### 2. Research pipeline (`lib/research/*`)

**`index.ts` (`researchTopic(query, userId)`)**
- After the existing cache lookup returns null, resolve the caller's
  `profiles.course_id` (one query, same pattern as
  `getVisibleSubjects`/`searchResources`).
- Call `getVisibleSubjects(userId)` to get the subjects this user's
  course/major can see. If empty (shouldn't happen — every course has
  at least one subject), throw `ResearchFailedError`.
- Pass `courseId`, the resolved `COURSE_EXAM_CONTEXT` label, and the
  visible-subjects list down to `callOpenAIResearch` and to
  `findCachedResults`/`persistResults` for cache scoping.

**`cache.ts` (`findCachedResults(query, courseId)`)**
- Add `courseId: string | null` param; add `.eq("course_id", courseId)`
  (or `.is("course_id", null)` when the caller has none) to the
  `research_queries` lookup so cache hits are course-scoped.

**`persist.ts` (`persistResults(query, userId, courseId, results)`)**
- Add `course_id` to the `research_queries` insert.
- Subject lookup by slug is unchanged (slugs are globally unique, so
  looking up by slug alone still resolves the correct subject row) —
  but only proceed with the topic/resource_topics linking if the
  resolved subject's slug is actually in the caller's visible-subjects
  list (defense in depth against a model hallucinating a slug outside
  the allowed set); otherwise skip topic-linking for that resource but
  still keep the resource row itself (same as today's "no subject
  match" path).

**`prompt.ts`**
- `buildSystemPrompt(courseLabel: string, subjects: {slug: string; name: string}[])` —
  replaces the hardcoded "BEEd/LET" sentence and hardcoded `SUBJECTS`
  import with the passed-in course label and subject list.
- `buildUserPrompt(query: string, courseLabel: string)` — replaces
  "this BEEd/LET topic" with a phrase derived from `courseLabel`.

**`callOpenAI.ts` (`callOpenAIResearch(query, courseLabel, subjects)`)**
- Builds the JSON-schema `subject_slug` enum from
  `subjects.map(s => s.slug)` instead of the hardcoded
  `SUBJECT_SLUGS` constant.

**`types.ts`**
- `subject_slug` changes from `z.enum(SUBJECT_SLUGS)` to
  `z.string().min(1)` (zod enums can't be built dynamically per
  request) — the real membership check now happens in `persist.ts` as
  described above. `SUBJECT_SLUGS`/`SUBJECTS` in `lib/sources/subjects.ts`
  stay as-is (still used elsewhere as the compile-time BEEd reference
  per the 2026-09-19 major-scoping spec).

**`actions.ts`** — no signature change; `researchTopicAction` still
just takes `query`, since course resolution now happens inside
`researchTopic` via `userId`.

### 3. Migration — `supabase/migrations/0016_research_queries_course_scope.sql`

```sql
alter table research_queries
  add column course_id uuid references courses(id);
```

Nullable, no backfill needed — existing rows simply won't cache-match
against a course-scoped lookup once course_id is required in the
query, which is the correct "cache miss, re-research" behavior for
pre-existing ambiguous cache entries.

### 4. Quiz generator (`lib/ai/quiz.ts`)

- `buildQuizSystemPrompt(count, difficulty, courseLabel)` — takes the
  course label instead of hardcoding BEEd.
- `generateTopicQuiz`/`generateSubjectQuiz` — extend the existing
  topic/subject select to also join `courses(slug)` through
  `subjects.course_id`, resolve `COURSE_EXAM_CONTEXT[courseSlug] ??
  DEFAULT_COURSE_EXAM_CONTEXT`, and pass it into
  `buildQuizSystemPrompt`. The "no linked resources yet" fallback
  copy in `buildTopicQuizUserPrompt`/`buildSubjectQuizUserPrompt`
  drops the "BEEd/LET" wording in favor of "this subject's curriculum."
- `generateQuiz` (resource-based) — resolves course via the resource's
  first linked topic → subject → course (one extra query through
  `resource_topics`); falls back to `DEFAULT_COURSE_EXAM_CONTEXT`'s
  neutral framing if the resource has no linked topic yet.

## Error handling

- Every new course-resolution query degrades gracefully: no
  profile/course found → `DEFAULT_COURSE_EXAM_CONTEXT`, empty visible-
  subjects list → existing `ResearchFailedError` path (already surfaced
  to the user as "Research failed. Please try again.").
- A model response with a `subject_slug` outside the allowed set is not
  a validation error (schema now accepts any string) — it's handled at
  the persist step by skipping topic-linking, matching today's
  behavior when a subject lookup misses.

## Testing

- `npx tsc --noEmit`.
- Manual: sign in as a Civil Service Exam user (or set a test profile's
  `course_id` to the CSE course), run "Research this topic with AI" on
  a CSE-relevant phrase (e.g. "reading comprehension" or "Philippine
  constitution"), confirm results classify under a CSE subject slug
  (`verbal-ability`, `general-information`, etc.) instead of being
  dropped or misfiled.
- Manual: as the same CSE user, generate a topic quiz (e.g. Numerical
  Ability → Basic Arithmetic) and confirm the questions read as
  CSE-appropriate, not teaching-exam-flavored.
- Manual regression: as a BEEd user, repeat both flows and confirm
  behavior is unchanged (same BEEd/LET framing as before).
