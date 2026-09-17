# BEEd Exam Prep Platform — Phase 2 Implementation Plan: AI Research Service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 `lib/research` stub with a real AI research service that uses OpenAI's Responses API (with its hosted `web_search` tool) to discover legally-open BEEd resources, persists them into the existing schema, caches by query to avoid repeat work, and wires a "Research this topic with AI" action into the Search page.

**Architecture:** A server-only pipeline (`lib/research/`) that checks a 30-day query cache, enforces a per-user daily rate limit, calls OpenAI with a strict JSON schema and a legal/ethical system prompt, validates the response with Zod, then persists results via a service-role Supabase client (writes to `resources`/`topics`/`resource_topics` are RLS-locked to service role by design — see Phase 1 spec). A server action exposes this to the Search page UI.

**Tech Stack:** `openai` npm SDK, `zod` for runtime validation, existing `@supabase/supabase-js` (already installed) for the service-role client.

**Spec:** `docs/superpowers/specs/2026-09-17-beed-phase2-ai-research-design.md`

## Prerequisites (human, outside this plan)

- An OpenAI API key with access to the Responses API and the hosted `web_search` tool. Add it to `.env.local` as `OPENAI_API_KEY` when prompted during Task 2 (I'll ask for it at that point, not before).
- The local Postgres password and hosted Supabase DB password used in Phase 1 (needed again for Task 1's migration).

## Global Constraints

- `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are read only in server-only files (`lib/research/*`, `lib/supabase/service.ts`) — never imported by any file under `app/**/page.tsx` marked `"use client"`, never sent to the browser.
- No second search vendor — OpenAI's hosted `web_search` tool is the only search mechanism, per explicit user direction.
- `license_status` values are exactly the same 6 from Phase 1: `OPEN_LICENSE`, `PUBLIC_DOMAIN`, `OPEN_ACCESS`, `LICENSE_UNCLEAR`, `COPYRIGHTED`, `NOT_RECOMMENDED`.
- `resource_type` values are exactly: `article`, `pdf`, `course_material`, `study_guide`, `practice_questions`.
- Subject classification must be one of the 13 existing subject slugs from `lib/sources/subjects.ts` — a resource that doesn't clearly fit one of them must be excluded, not force-fit.
- No automated test framework — verification is `npm run build` plus manual runs against the real Supabase + OpenAI projects (same approach as Phase 1).
- Do not run `git commit` unless the user explicitly asks, per established project convention.

---

## File Structure

```
lib/
  supabase/
    service.ts           # NEW: service-role client (bypasses RLS) for privileged writes
  research/
    types.ts              # NEW: Zod schemas + TS types for AI research results
    prompt.ts              # NEW: system/user prompt builders
    callOpenAI.ts           # NEW: OpenAI Responses API call + JSON schema + validation
    cache.ts                 # NEW: 30-day query cache lookup
    rateLimit.ts              # NEW: per-user daily cap check
    persist.ts                 # NEW: upsert resources/topics/resource_topics, insert research_queries/research_results
    index.ts                    # MODIFIED: real researchTopic() orchestration (replaces Phase 1 stub)
    actions.ts                   # NEW: 'use server' researchTopicAction (auth check + error mapping)
components/
  resource/
    ResourceCard.tsx              # MODIFIED: add optional `aiFound` badge
app/(app)/search/
  page.tsx                         # MODIFIED: add "Research this topic with AI" button + AI results section
supabase/
  migrations/
    0002_resources_url_unique.sql   # NEW: unique constraint on resources.original_url
.env.local.example                   # MODIFIED: add OPENAI_API_KEY, OPENAI_MODEL
```

---

### Task 1: Migration — Unique Constraint on `resources.original_url`

**Files:**
- Create: `supabase/migrations/0002_resources_url_unique.sql`

**Interfaces:**
- Produces: a unique constraint that `persist.ts` (Task 7) relies on for `upsert(..., { onConflict: "original_url" })`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_resources_url_unique.sql`:

```sql
alter table resources add constraint resources_original_url_key unique (original_url);
```

- [ ] **Step 2: Apply to local Postgres**

Using the same local Postgres connection details from Phase 1 (host `localhost`, port `8000`, db `beed_review`, user `postgres`), apply this file with `psql -f`.

Expected: `ALTER TABLE` with no errors. If it fails because two existing seeded rows already share a URL, that would indicate a Phase 1 seed data bug — investigate before proceeding (there should be no duplicates; each of the 13 seeded resources has a distinct URL).

- [ ] **Step 3: Apply to the hosted Supabase project**

Using the hosted project's connection details from Phase 1 (`db.svfqneambjkmktidaypa.supabase.co:5432`, user `postgres`), apply the same file.

Expected: `ALTER TABLE` with no errors.

---

### Task 2: Service-Role Supabase Client + Package Installs + Env Vars

**Files:**
- Create: `lib/supabase/service.ts`
- Modify: `.env.local.example`, `.env.local` (ask user for `OPENAI_API_KEY` here)
- Modify: `package.json` (via npm install)

**Interfaces:**
- Produces: `createServiceClient(): SupabaseClient` from `lib/supabase/service.ts` — a server-only client using `SUPABASE_SERVICE_ROLE_KEY`, consumed by `cache.ts`, `rateLimit.ts`, and `persist.ts` (Tasks 5, 6, 7).

- [ ] **Step 1: Install packages**

```bash
npm install openai zod
```

- [ ] **Step 2: Create the service-role client**

Create `lib/supabase/service.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 3: Add env var placeholders**

Add to `.env.local.example`:

```
OPENAI_API_KEY=
OPENAI_MODEL=
```

- [ ] **Step 4: Get the real API key and update `.env.local`**

Ask the user for their OpenAI API key at this point (do not proceed to Task 3 without it, since later tasks' manual verification needs it). Add both `OPENAI_API_KEY` (their real key) and `OPENAI_MODEL` (a current OpenAI model that supports the Responses API and hosted `web_search` tool — confirm the exact current model name; do not guess blindly) to `.env.local`.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds (no code references the new env vars yet, this just confirms the package installs didn't break anything).

---

### Task 3: Research Types + Zod Schema

**Files:**
- Create: `lib/research/types.ts`

**Interfaces:**
- Produces: `LICENSE_STATUS_VALUES`, `RESOURCE_TYPE_VALUES`, `SUBJECT_SLUGS` (const arrays), `ResearchedResourceSchema` (Zod), `ResearchResponseSchema` (Zod), `ResearchedResource` (TS type) — consumed by `callOpenAI.ts` (Task 5), `persist.ts` (Task 7).

- [ ] **Step 1: Write the schema file**

Create `lib/research/types.ts`:

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

export const SUBJECT_SLUGS = [
  "assessment-of-learning",
  "child-and-adolescent-development",
  "principles-of-teaching",
  "curriculum-development",
  "educational-technology",
  "teaching-profession",
  "facilitating-learning",
  "general-education",
  "english",
  "mathematics",
  "science",
  "filipino",
  "social-studies",
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
  subject_slug: z.enum(SUBJECT_SLUGS),
  topics: z.array(z.string().min(1)).min(1).max(4),
});

export const ResearchResponseSchema = z.object({
  resources: z.array(ResearchedResourceSchema),
});

export type ResearchedResource = z.infer<typeof ResearchedResourceSchema>;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 4: Prompt Builders

**Files:**
- Create: `lib/research/prompt.ts`

**Interfaces:**
- Consumes: `SUBJECTS` from `@/lib/sources/subjects`
- Produces: `buildSystemPrompt(): string`, `buildUserPrompt(query: string): string` — consumed by `callOpenAI.ts` (Task 5).

- [ ] **Step 1: Write the prompt builders**

Create `lib/research/prompt.ts`:

```ts
import { SUBJECTS } from "@/lib/sources/subjects";

export function buildSystemPrompt(): string {
  const subjectList = SUBJECTS.map((s) => `- ${s.slug}: ${s.name}`).join("\n");

  return `You are a research assistant for a Bachelor of Elementary Education (BEEd) exam-prep app used by Filipino education students preparing for the LET (Licensure Examination for Teachers).

Your job is to search the web and find LEGALLY ACCESSIBLE, OPENLY REUSABLE educational resources relevant to a requested BEEd/LET topic. You must follow these rules exactly:

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
Classify each resource under exactly one of these BEEd/LET subject slugs:
${subjectList}
If a resource does not clearly belong to one of these subjects, do NOT include it in your results.

For each resource you include, also provide 1-4 short topic phrases (e.g. "Formative Assessment", "Validity") describing what it specifically covers within that subject.

Write your own original 1-2 sentence description for each resource — do not copy sentences from the source page.`;
}

export function buildUserPrompt(query: string): string {
  return `Find legally accessible, openly reusable educational resources for this BEEd/LET topic: "${query}"`;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 5: OpenAI Call Wrapper

**Files:**
- Create: `lib/research/callOpenAI.ts`

**Interfaces:**
- Consumes: `buildSystemPrompt`, `buildUserPrompt` from `./prompt`; `ResearchResponseSchema`, `ResearchedResource` from `./types`
- Produces: `callOpenAIResearch(query: string): Promise<ResearchedResource[]>` — consumed by `index.ts` (Task 8).

- [ ] **Step 1: Write the OpenAI call wrapper**

Create `lib/research/callOpenAI.ts`:

```ts
import OpenAI from "openai";
import { ResearchResponseSchema, type ResearchedResource } from "./types";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";

const RESEARCH_JSON_SCHEMA = {
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
          subject_slug: {
            type: "string",
            enum: [
              "assessment-of-learning",
              "child-and-adolescent-development",
              "principles-of-teaching",
              "curriculum-development",
              "educational-technology",
              "teaching-profession",
              "facilitating-learning",
              "general-education",
              "english",
              "mathematics",
              "science",
              "filipino",
              "social-studies",
            ],
          },
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

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function callOpenAIResearch(query: string): Promise<ResearchedResource[]> {
  const response = await getClient().responses.create({
    model: process.env.OPENAI_MODEL!,
    tools: [{ type: "web_search" }],
    input: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(query) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "research_results",
        schema: RESEARCH_JSON_SCHEMA,
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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. If the `openai` package's TypeScript types don't match this exact call shape (the Responses API surface can differ slightly by SDK version), fix the call to match the installed version's types — check `node_modules/openai/resources/responses.ts` (or the package's own docs) for the exact current shape of `tools`, `text.format`, and the response's text-extraction property (may be `output_text` or may require walking `response.output`) before changing anything else.

---

### Task 6: Query Cache Lookup

**Files:**
- Create: `lib/research/cache.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/service`; `ResourceHit` type from `@/lib/search/searchResources`
- Produces: `findCachedResults(query: string): Promise<ResourceHit[] | null>` — consumed by `index.ts` (Task 8).

- [ ] **Step 1: Write the cache lookup**

Create `lib/research/cache.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import type { ResourceHit } from "@/lib/search/searchResources";

const CACHE_FRESHNESS_DAYS = 30;

export async function findCachedResults(query: string): Promise<ResourceHit[] | null> {
  const supabase = createServiceClient();
  const normalized = query.trim();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_FRESHNESS_DAYS);

  const { data: matchingQuery } = await supabase
    .from("research_queries")
    .select("id")
    .ilike("query_text", normalized)
    .gte("created_at", cutoff.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 7: Rate Limiting

**Files:**
- Create: `lib/research/rateLimit.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/service`
- Produces: `checkRateLimit(userId: string): Promise<boolean>` (true = under the limit, allowed) — consumed by `index.ts` (Task 8).

- [ ] **Step 1: Write the rate limiter**

Create `lib/research/rateLimit.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";

const DAILY_LIMIT = 20;

export async function checkRateLimit(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const since = new Date();
  since.setHours(since.getHours() - 24);

  const { count } = await supabase
    .from("research_queries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());

  return (count ?? 0) < DAILY_LIMIT;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 8: Persistence

**Files:**
- Create: `lib/research/persist.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/service`; `ResearchedResource` from `./types`; `ResourceHit` from `@/lib/search/searchResources`
- Produces: `persistResults(query: string, userId: string, results: ResearchedResource[]): Promise<ResourceHit[]>` — consumed by `index.ts` (Task 9).
- Relies on: `resources.original_url` unique constraint (Task 1), `topics(subject_id, slug)` unique constraint (already exists from Phase 1), `resource_topics(resource_id, topic_id)` unique constraint (already exists from Phase 1).

- [ ] **Step 1: Write the persistence logic**

Create `lib/research/persist.ts`:

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

    hits.push(resource as ResourceHit);
    resourceIds.push(resource.id);
  }

  const { data: queryRow } = await supabase
    .from("research_queries")
    .insert({ user_id: userId, query_text: query })
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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 9: Orchestration — Replace the `lib/research` Stub

**Files:**
- Modify: `lib/research/index.ts` (currently the Phase 1 stub throwing "Not implemented")

**Interfaces:**
- Consumes: `findCachedResults` (Task 6), `checkRateLimit` (Task 7), `callOpenAIResearch` (Task 5), `persistResults` (Task 8)
- Produces: `researchTopic(query: string, userId: string): Promise<ResourceHit[]>`, `RateLimitError`, `ResearchFailedError` — consumed by `actions.ts` (Task 10).

- [ ] **Step 1: Replace the stub**

Replace the full contents of `lib/research/index.ts`:

```ts
import { findCachedResults } from "./cache";
import { checkRateLimit } from "./rateLimit";
import { callOpenAIResearch } from "./callOpenAI";
import { persistResults } from "./persist";
import type { ResourceHit } from "@/lib/search/searchResources";

export class RateLimitError extends Error {}
export class ResearchFailedError extends Error {}

export async function researchTopic(query: string, userId: string): Promise<ResourceHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cached = await findCachedResults(trimmed);
  if (cached) return cached;

  const allowed = await checkRateLimit(userId);
  if (!allowed) {
    throw new RateLimitError("You've hit today's research limit — try again tomorrow.");
  }

  let results;
  try {
    results = await callOpenAIResearch(trimmed);
  } catch {
    throw new ResearchFailedError("Research failed. Please try again.");
  }

  if (results.length === 0) return [];

  return persistResults(trimmed, userId, results);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 10: Server Action

**Files:**
- Create: `lib/research/actions.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `researchTopic`, `RateLimitError`, `ResearchFailedError` from `./index`
- Produces: `researchTopicAction(query: string): Promise<{ resources: ResourceHit[] } | { error: string }>` — consumed by the Search page (Task 11).

- [ ] **Step 1: Write the server action**

Create `lib/research/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { researchTopic, RateLimitError, ResearchFailedError } from "./index";
import type { ResourceHit } from "@/lib/search/searchResources";

export async function researchTopicAction(
  query: string
): Promise<{ resources: ResourceHit[] } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please sign in to use AI research." };
  }

  try {
    const resources = await researchTopic(query, user.id);
    return { resources };
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof ResearchFailedError) {
      return { error: err.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 11: UI — ResourceCard Badge + Search Page Integration

**Files:**
- Modify: `components/resource/ResourceCard.tsx` (add optional `aiFound` prop)
- Modify: `app/(app)/search/page.tsx` (add "Research this topic with AI" button + AI results section)

**Interfaces:**
- Consumes: `researchTopicAction` from `@/lib/research/actions`
- Produces: `ResourceCard`'s new `aiFound?: boolean` prop — no other files depend on this beyond the search page.

- [ ] **Step 1: Add the AI-found badge to ResourceCard**

Edit `components/resource/ResourceCard.tsx` — change the props type and the badge row:

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
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug">{resource.title}</h3>
        <div className="flex flex-col items-end gap-1">
          <LicenseBadge status={resource.license_status} />
          {aiFound && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
              AI-found
            </span>
          )}
        </div>
      </div>
      {resource.description && <p className="text-sm text-neutral-600">{resource.description}</p>}
      <div className="text-xs text-neutral-400">
        {resource.source ?? "Unknown source"} · {resource.resource_type}
      </div>
      <div className="flex gap-2 pt-1">
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
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Add AI research to the Search page**

Replace the full contents of `app/(app)/search/page.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResourceCard } from "@/components/resource/ResourceCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { toggleSaveResource } from "@/lib/library/actions";
import { researchTopicAction } from "@/lib/research/actions";
import type { ResourceHit, SubjectHit, TopicHit } from "@/lib/search/searchResources";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    subjects: SubjectHit[];
    topics: TopicHit[];
    resources: ResourceHit[];
  } | null>(null);
  const [aiResults, setAiResults] = useState<ResourceHit[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function runSearch(q: string) {
    setError(null);
    setAiResults(null);
    setAiError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed. Try again.");
      const data = await res.json();
      setResults(data);
    } catch {
      setError("Something went wrong searching. Please try again.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => runSearch(query));
  }

  function handleToggleSave(id: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    startTransition(() => {
      void toggleSaveResource(id);
    });
  }

  async function handleResearch() {
    if (!query.trim()) return;
    setIsResearching(true);
    setAiError(null);
    const outcome = await researchTopicAction(query);
    setIsResearching(false);
    if ("error" in outcome) {
      setAiError(outcome.error);
      return;
    }
    setAiResults(outcome.resources);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-2">
        <Input
          placeholder="What do you want to review?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="text-xs text-neutral-400">
          Try &quot;Assessment of Learning&quot; or &quot;classroom management&quot;
        </p>
      </form>

      {error && <ErrorBanner message={error} />}

      {isPending && <p className="text-sm text-neutral-400">Searching…</p>}

      {results && !isPending && (
        <div className="space-y-6">
          {results.resources.length === 0 &&
          results.subjects.length === 0 &&
          results.topics.length === 0 ? (
            <EmptyState message="No matches yet. Try a different subject or topic name." />
          ) : (
            results.resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                saved={savedIds.has(resource.id)}
                onToggleSave={handleToggleSave}
              />
            ))
          )}

          <div className="space-y-3 border-t border-neutral-200 pt-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResearch}
              disabled={isResearching || !query.trim()}
            >
              {isResearching ? "Researching… this can take up to 30 seconds" : "Research this topic with AI"}
            </Button>

            {aiError && <ErrorBanner message={aiError} />}

            {aiResults && aiResults.length === 0 && !aiError && (
              <EmptyState message="No open resources found for this topic. Try a different phrasing." />
            )}

            {aiResults && aiResults.length > 0 && (
              <div className="space-y-4">
                {aiResults.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    saved={savedIds.has(resource.id)}
                    onToggleSave={handleToggleSave}
                    aiFound
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual end-to-end verification**

Run `npm run dev`, sign in, go to `/search`, search a BEEd topic that has thin/no seed coverage (e.g. "classroom management" or "Piaget"). Tap "Research this topic with AI." Expected: a loading state, then either real AI-found resource cards (each with a correct license badge and the small "AI-found" tag) or a clear empty/error state — never a blank screen or unhandled crash. Check the underlying data directly in Postgres (`select * from research_queries order by created_at desc limit 5;`, `select * from resources order by created_at desc limit 5;`) to confirm rows were actually persisted. Run the exact same query again and confirm the response comes back fast (cache hit — verify no new `research_queries` row was inserted the second time). Save one of the AI-found resources and confirm it appears in `/library`.

---

## Post-Plan Notes

- The 20/day rate limit and 30-day cache window are reasonable Phase 2 defaults, not values from the original spec — revisit if real usage patterns suggest otherwise.
- If the installed `openai` package's Responses API types differ from what Task 5 assumes (the SDK surface can shift between versions), fix the call site to match — the intent (web_search tool + strict JSON schema output) is what must be preserved, not the exact property names guessed here.
