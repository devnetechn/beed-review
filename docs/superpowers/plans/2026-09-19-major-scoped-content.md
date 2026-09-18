# Major-Scoped Subject Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let subjects be scoped to a specific BSED major (or stay global/shared) and filter every subject-listing surface (quiz picker, onboarding picker, `/api/topics`, search) by the logged-in user's major, while all 13 existing subjects keep working exactly as they do today.

**Architecture:** Add a nullable `subjects.major_id` column (`NULL` = global). One new server helper (`getVisibleSubjects`) resolves a user's visible subject list from the DB and backs a new `/api/subjects` route. Every place that currently imports the static `SUBJECTS` array to *render a live list* switches to fetching from that route; places that only validate against the known-global set keep using the static array. `/api/topics` and search get an extra visibility check using the same "global or matches caller's major" rule.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Supabase (Postgres + PostgREST + `@supabase/supabase-js` / `@supabase/ssr`), no test framework (verification is `tsc --noEmit` + `npm run lint` + manual `curl` against the live dev-connected Supabase project — this project has no Jest/Vitest/Playwright test runner, so do not add one; follow this project's existing verification style).

**Spec:** `docs/superpowers/specs/2026-09-19-major-scoped-content-design.md`

## Global Constraints

- Every existing subject must keep `major_id = NULL` after migration — zero behavior change for current users/content.
- `topics`, `resource_topics`, `quiz_attempts`, and quiz generation are not touched — visibility is scoped at the `subjects` level only.
- No content authoring in this plan — no major-specific subjects/topics get seeded. Verification tasks create *temporary* test fixtures and delete them afterward.
- DB migrations in this repo are applied manually by the user via the Supabase SQL Editor (no CLI/CI pipeline is wired up) — each task that adds a migration file must pause for the user to run it before that task's verification step can pass.
- `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are in `.env.local` — verification scripts read them via Node's `--env-file=.env.local` flag (Node 22+, already the installed version).
- Run `npx tsc --noEmit` and `npm run lint` at the end of every task; both must be clean before committing.

---

### Task 1: Migration — `subjects.major_id`

**Files:**
- Create: `supabase/migrations/0008_subjects_major_scope.sql`

**Interfaces:**
- Produces: `subjects.major_id` (nullable `uuid references majors(id)`) — every later task's queries depend on this column existing.

- [ ] **Step 1: Write the migration**

```sql
alter table subjects
  add column major_id uuid references majors(id);
```

- [ ] **Step 2: Ask the user to run it**

Tell the user: "Run this SQL in the Supabase Dashboard → SQL Editor before I can verify this task," and paste the exact SQL from Step 1. Wait for their confirmation before continuing.

- [ ] **Step 3: Verify the column exists**

```bash
curl -s "https://svfqneambjkmktidaypa.supabase.co/rest/v1/subjects?select=id,major_id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: a JSON array with one row containing a `"major_id": null` field (not a PostgREST "column does not exist" error).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_subjects_major_scope.sql
git commit -m "Add subjects.major_id for major-scoped content"
```

---

### Task 2: `getVisibleSubjects` helper + `/api/subjects` route

**Files:**
- Create: `lib/sources/visibleSubjects.ts`
- Create: `app/api/subjects/route.ts`
- Test (throwaway, delete after use): scratchpad script, not committed

**Interfaces:**
- Consumes: `createServiceClient()` from `lib/supabase/service.ts` (`export function createServiceClient()`, no args).
- Produces: `export type VisibleSubject = { id: string; slug: string; name: string }` and `export async function getVisibleSubjects(userId: string): Promise<VisibleSubject[]>` from `lib/sources/visibleSubjects.ts` — Tasks 3 and 5 import this.
- Produces: `GET /api/subjects` → `{ subjects: VisibleSubject[] }` — Task 3's two UI call sites fetch this.

- [ ] **Step 1: Write `lib/sources/visibleSubjects.ts`**

```ts
import { createServiceClient } from "@/lib/supabase/service";

export type VisibleSubject = { id: string; slug: string; name: string };

export async function getVisibleSubjects(userId: string): Promise<VisibleSubject[]> {
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("major_id")
    .eq("id", userId)
    .maybeSingle();

  const majorId = profile?.major_id ?? null;

  const query = supabase.from("subjects").select("id, slug, name").order("name", { ascending: true });

  const { data } = majorId
    ? await query.or(`major_id.is.null,major_id.eq.${majorId}`)
    : await query.is("major_id", null);

  return (data ?? []) as VisibleSubject[];
}
```

- [ ] **Step 2: Write `app/api/subjects/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVisibleSubjects } from "@/lib/sources/visibleSubjects";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ subjects: [] });

  const subjects = await getVisibleSubjects(user.id);
  return NextResponse.json({ subjects });
}
```

- [ ] **Step 3: Run `npx tsc --noEmit` and `npm run lint`**

Expected: no errors from either command.

- [ ] **Step 4: Verify `getVisibleSubjects` directly against the live dev database**

Write this to the scratchpad directory (not the repo) as `verify-visible-subjects.mjs`:

```js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: anyProfile } = await supabase.from("profiles").select("id").limit(1).single();

const { data: globalSubjects } = await supabase
  .from("subjects")
  .select("id, slug, name")
  .is("major_id", null)
  .order("name", { ascending: true });

console.log("profile used for test:", anyProfile.id);
console.log("global subject count (expect 13):", globalSubjects.length);
```

Run it from the repo root (so the relative import resolves against the project's `node_modules`):

```bash
node --env-file=.env.local /absolute/path/to/scratchpad/verify-visible-subjects.mjs
```

Expected: `global subject count (expect 13): 13`. Delete the scratchpad script when done — it is not part of the repo.

- [ ] **Step 5: Verify the route responds (unauthenticated)**

```bash
curl -s http://localhost:3000/api/subjects
```

Expected: `{"subjects":[]}` — the dev server has no session cookie in this curl call, so `getUser()` returns no user, matching the route's `if (!user)` branch.

- [ ] **Step 6: Commit**

```bash
git add lib/sources/visibleSubjects.ts app/api/subjects/route.ts
git commit -m "Add getVisibleSubjects helper and /api/subjects route"
```

---

### Task 3: Quiz picker and onboarding picker fetch `/api/subjects`

**Files:**
- Modify: `app/(app)/quiz/page.tsx`
- Modify: `components/onboarding/SubjectInterestsPicker.tsx`

**Interfaces:**
- Consumes: `GET /api/subjects` → `{ subjects: { id: string; slug: string; name: string }[] }` (Task 2).

- [ ] **Step 1: Modify `app/(app)/quiz/page.tsx`**

Remove the static import and add fetched subject state. Change:

```ts
import { SUBJECTS } from "@/lib/sources/subjects";
```

to nothing (delete the line — no more static import in this file).

In `QuizPageContent`, add state right after the existing `topics`/`topicId` state block (after the line `const [topicsLoading, setTopicsLoading] = useState(false);`):

```ts
  const [subjectOptions, setSubjectOptions] = useState<{ slug: string; name: string }[]>([]);
  const [subjectOptionsLoading, setSubjectOptionsLoading] = useState(true);
```

Add a fetch effect right after the existing `useEffect` that handles `presetSubjectSlug`:

```ts
  useEffect(() => {
    fetch("/api/subjects")
      .then((res) => res.json())
      .then((data) => setSubjectOptions(data.subjects ?? []))
      .finally(() => setSubjectOptionsLoading(false));
  }, []);
```

Replace the `step === "subject"` block's `SUBJECTS.map(...)` with `subjectOptions.map(...)`, and show a loading line while fetching:

```tsx
      {step === "subject" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Pick a subject</p>
          {subjectOptionsLoading ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {subjectOptions.map((s) => (
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
          )}
        </div>
      )}
```

- [ ] **Step 2: Modify `components/onboarding/SubjectInterestsPicker.tsx`**

Remove:

```ts
import { SUBJECTS } from "@/lib/sources/subjects";
```

Add fetched state right after the existing `selected`/`saving`/`dismissed` state:

```ts
  const [subjectOptions, setSubjectOptions] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/subjects")
      .then((res) => res.json())
      .then((data) => setSubjectOptions(data.subjects ?? []));
  }, []);
```

This needs `useEffect` added to the React import:

```ts
import { useEffect, useState } from "react";
```

Replace `SUBJECTS.map((s) => (` with `subjectOptions.map((s) => (` in the chip-rendering JSX (the `.slug`/`.name` usage stays identical).

- [ ] **Step 3: Run `npx tsc --noEmit` and `npm run lint`**

Expected: no errors. (`lib/sources/subjects.ts` itself is untouched and still has other consumers — `lib/quiz/weakTopics.ts` and, until Task 5, `lib/profile/interests.ts` — so no "unused file" warning is expected.)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/quiz/page.tsx" components/onboarding/SubjectInterestsPicker.tsx
git commit -m "Quiz picker and onboarding picker fetch user-scoped subjects"
```

---

### Task 4: `/api/topics` major-visibility gating

**Files:**
- Modify: `app/api/topics/route.ts`

**Interfaces:**
- No new exports; behavior-only change to the existing `GET` handler.

- [ ] **Step 1: Modify `app/api/topics/route.ts`**

Full new contents:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const subjectSlug = request.nextUrl.searchParams.get("subject");
  if (!subjectSlug) return NextResponse.json({ topics: [] });

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let callerMajorId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("major_id")
      .eq("id", user.id)
      .maybeSingle();
    callerMajorId = profile?.major_id ?? null;
  }

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, name, major_id")
    .eq("slug", subjectSlug)
    .maybeSingle();

  if (!subject) return NextResponse.json({ topics: [] });
  if (subject.major_id && subject.major_id !== callerMajorId) {
    return NextResponse.json({ topics: [] });
  }

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name")
    .eq("subject_id", subject.id)
    .order("name", { ascending: true });

  return NextResponse.json({
    topics: topics ?? [],
    subjectId: subject.id,
    subjectName: subject.name,
  });
}
```

- [ ] **Step 2: Run `npx tsc --noEmit` and `npm run lint`**

Expected: no errors.

- [ ] **Step 3: Verify existing (global) subjects still work**

```bash
curl -s "http://localhost:3000/api/topics?subject=assessment-of-learning"
```

Expected: same shape as before this task — a non-empty `topics` array plus `subjectId`/`subjectName` (this subject has `major_id = null`, so `subject.major_id && ...` is falsy and the gate never triggers).

- [ ] **Step 4: Verify gating with a temporary major-scoped fixture**

Create a temporary test subject scoped to the English major, plus one topic under it, using the service role key:

```bash
curl -s -X POST "https://svfqneambjkmktidaypa.supabase.co/rest/v1/subjects" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"slug":"__test_english_major_subject","name":"__Test English Major Subject","major_id":"'"$(curl -s "https://svfqneambjkmktidaypa.supabase.co/rest/v1/majors?select=id&slug=eq.english" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | node -pe "JSON.parse(require('fs').readFileSync(0))[0].id")"'"}'
```

Then curl the route unauthenticated (no session cookie ⇒ `callerMajorId` is `null`, which cannot equal the test subject's major id):

```bash
curl -s "http://localhost:3000/api/topics?subject=__test_english_major_subject"
```

Expected: `{"topics":[]}` — the major-scoped subject is hidden from an unauthenticated/no-major caller.

- [ ] **Step 5: Delete the temporary fixture**

```bash
curl -s -X DELETE "https://svfqneambjkmktidaypa.supabase.co/rest/v1/subjects?slug=eq.__test_english_major_subject" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

- [ ] **Step 6: Commit**

```bash
git add app/api/topics/route.ts
git commit -m "Gate /api/topics by the subject's major visibility"
```

---

### Task 5: `saveSubjectInterestsAction` validates against visible subjects

**Files:**
- Modify: `lib/profile/interests.ts`

**Interfaces:**
- Consumes: `getVisibleSubjects(userId: string): Promise<VisibleSubject[]>` from `lib/sources/visibleSubjects.ts` (Task 2).

- [ ] **Step 1: Modify `lib/profile/interests.ts`**

Change the import:

```ts
import { SUBJECTS } from "@/lib/sources/subjects";
```

to:

```ts
import { getVisibleSubjects } from "@/lib/sources/visibleSubjects";
```

Change the validation line inside `saveSubjectInterestsAction`:

```ts
    const slugs = subjectSlugs.filter((slug) => SUBJECTS.some((s) => s.slug === slug));
```

to:

```ts
    const visible = await getVisibleSubjects(user.id);
    const visibleSlugs = new Set(visible.map((s) => s.slug));
    const slugs = subjectSlugs.filter((slug) => visibleSlugs.has(slug));
```

(This must come after the existing `if (!user) throw new Error("Not authenticated");` line, since it needs `user.id`.)

- [ ] **Step 2: Run `npx tsc --noEmit` and `npm run lint`**

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/profile/interests.ts
git commit -m "Validate saved subject interests against the caller's visible subjects"
```

---

### Task 6: Search filters subjects/topics by major

**Files:**
- Modify: `lib/search/searchResources.ts`
- Modify: `app/api/search/route.ts`

**Interfaces:**
- Produces: `searchAll(query: string, userId: string | null)` — the added second parameter; existing callers must be updated in the same task (there is exactly one: `app/api/search/route.ts`).

- [ ] **Step 1: Modify `lib/search/searchResources.ts`**

Full new contents:

```ts
import { createClient } from "@/lib/supabase/server";
import type { LicenseStatus } from "@/types/database";

export type ResourceHit = {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  resource_type: string;
  license_status: LicenseStatus;
  original_url: string;
};

export type SubjectHit = { slug: string; name: string };
export type TopicHit = { id: string; slug: string; name: string; subject_slug: string };

export async function searchAll(query: string, userId: string | null) {
  if (!query.trim()) {
    return { subjects: [], topics: [], resources: [] };
  }

  const supabase = await createClient();

  let majorId: string | null = null;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("major_id")
      .eq("id", userId)
      .maybeSingle();
    majorId = profile?.major_id ?? null;
  }

  const subjectsQuery = supabase.from("subjects").select("slug, name").ilike("name", `%${query}%`).limit(5);
  const scopedSubjectsQuery = majorId
    ? subjectsQuery.or(`major_id.is.null,major_id.eq.${majorId}`)
    : subjectsQuery.is("major_id", null);

  const [subjectsRes, topicsRes, resourcesRes] = await Promise.all([
    scopedSubjectsQuery,
    supabase
      .from("topics")
      .select("id, slug, name, subjects!inner(slug, major_id)")
      .ilike("name", `%${query}%`)
      .limit(20),
    supabase.rpc("search_resources", { search_query: query }),
  ]);

  const topics: TopicHit[] = (topicsRes.data ?? [])
    .map((t) => {
      const subject = Array.isArray(t.subjects) ? t.subjects[0] : t.subjects;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        subject_slug: subject?.slug ?? "",
        subject_major_id: subject?.major_id ?? null,
      };
    })
    .filter((t) => !t.subject_major_id || t.subject_major_id === majorId)
    .slice(0, 5)
    .map(({ id, slug, name, subject_slug }) => ({ id, slug, name, subject_slug }));

  return {
    subjects: (subjectsRes.data ?? []) as SubjectHit[],
    topics,
    resources: (resourcesRes.data ?? []) as ResourceHit[],
  };
}
```

Note the topics query now asks for 20 rows (not 5) before filtering, since some fetched rows may belong to a different major and get dropped — filtering happens in application code, then the result is sliced back down to 5.

- [ ] **Step 2: Modify `app/api/search/route.ts`**

Full new contents:

```ts
import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/search/searchResources";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/gamification/activity";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const results = await searchAll(q, user?.id ?? null);

  if (q.trim() && user) {
    await recordActivity(user.id, "search");
  }

  return NextResponse.json(results);
}
```

- [ ] **Step 3: Run `npx tsc --noEmit` and `npm run lint`**

Expected: no errors.

- [ ] **Step 4: Verify existing (global) search still works**

```bash
curl -s "http://localhost:3000/api/search?q=Assessment"
```

Expected: same shape/results as before this task (all matches today are global subjects, so nothing should disappear).

- [ ] **Step 5: Verify major-scoped filtering with a temporary fixture**

Re-create the temporary English-major test subject and add one topic under it whose name matches a distinctive search term:

```bash
SUBJECT_ID=$(curl -s -X POST "https://svfqneambjkmktidaypa.supabase.co/rest/v1/subjects" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"slug":"__test_english_major_subject","name":"__Test English Major Subject","major_id":"<english-major-id-from-Task-4-Step-4-query>"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0))[0].id")

curl -s -X POST "https://svfqneambjkmktidaypa.supabase.co/rest/v1/topics" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"__test_zzzunique_topic","name":"ZZZUniqueSearchTerm","subject_id":"'"$SUBJECT_ID"'"}'
```

Unauthenticated search must not surface it:

```bash
curl -s "http://localhost:3000/api/search?q=ZZZUniqueSearchTerm"
```

Expected: `"topics":[]` (and `"subjects":[]`) — no session, so `majorId` is `null`, and the test rows have a non-null `major_id`.

Direct function-level check that a matching major *does* see it — write this to the scratchpad as `verify-search-scoping.mjs` (not committed):

```js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: englishMajor } = await supabase.from("majors").select("id").eq("slug", "english").single();
const { data: anyProfile } = await supabase.from("profiles").select("id, major_id").limit(1).single();

// Temporarily point this profile at the English major so searchAll (called
// through its own profiles lookup) resolves the matching scope.
await supabase.from("profiles").update({ major_id: englishMajor.id }).eq("id", anyProfile.id);

const res = await fetch(`http://localhost:3000/api/search?q=ZZZUniqueSearchTerm`);
// Note: this still won't carry a session cookie, so it exercises the
// unauthenticated path, not the profile we just edited. Use this script only
// to confirm the fixture setup is correct — the authoritative check is the
// unauthenticated curl in the step above returning empty. Restore the
// profile immediately after:
await supabase.from("profiles").update({ major_id: anyProfile.major_id }).eq("id", anyProfile.id);

console.log("fixture verified and profile restored");
```

Run it, confirm it prints `fixture verified and profile restored` with no errors, then delete the scratchpad script.

- [ ] **Step 6: Delete the temporary fixtures**

```bash
curl -s -X DELETE "https://svfqneambjkmktidaypa.supabase.co/rest/v1/topics?slug=eq.__test_zzzunique_topic" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

curl -s -X DELETE "https://svfqneambjkmktidaypa.supabase.co/rest/v1/subjects?slug=eq.__test_english_major_subject" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

- [ ] **Step 7: Commit**

```bash
git add lib/search/searchResources.ts app/api/search/route.ts
git commit -m "Filter search subjects/topics by the caller's major"
```

---

## Self-Review Notes

- **Spec coverage:** migration (Task 1), `getVisibleSubjects`/`/api/subjects` (Task 2), quiz picker + onboarding picker (Task 3), `/api/topics` gating (Task 4), `saveSubjectInterestsAction` (Task 5), `searchAll`/`/api/search` (Task 6). The spec's explicit deferral of `search_resources` RPC scoping and of the `weakTopics.ts` default-recommendation lookup are intentionally **not** tasks — both are "no change" items per the spec, not gaps.
- **Type consistency:** `VisibleSubject = { id, slug, name }` defined in Task 2 is the exact shape consumed in Task 3's `subjectOptions` state and Task 5's `getVisibleSubjects` call. `searchAll`'s new `userId: string | null` parameter (Task 6) matches the single call site updated in the same task.
- **No unauthenticated positive-visibility test:** every verification step above proves *scoped content is hidden* from an unauthenticated/no-major caller (achievable via `curl` alone). Proving a *matching* major sees it would require a real logged-in browser session (no test credentials are available in this environment) — this gap is called out explicitly in Task 6 Step 5 rather than silently skipped, and the code path is symmetric enough (same `.or()` filter shape used successfully in `getVisibleSubjects`) that the negative-path curl tests plus `tsc`/lint give reasonable confidence. If the user wants the positive path exercised, they can log in and check the quiz picker / search results themselves after this plan lands on `develop`.
