# Library File Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload their own PDF/DOCX/PPTX/TXT file (max 25 MB) to a new private "My Uploads" section on the Library page, and get the same Summarize/Generate Quiz/Ask AI actions on it that saved search resources already have.

**Architecture:** An upload becomes a row in the existing `resources` table (a new nullable `storage_path` column marks it as private, in a new private Supabase Storage bucket `library-uploads`), so the existing `quiz_attempts`/`study_notes`/`StudyActions` machinery works on it unchanged. `lib/ai/fetchContent.ts` gains one branch at the top: if `storage_path` is set, download the file and extract its text (via `officeparser` for pdf/docx/pptx, a raw read for txt) instead of scraping a URL. Everything else in the AI pipeline (`summarizeResource`, `generateQuiz`) needs zero changes.

**Tech Stack:** New dependency `officeparser` (text extraction for pdf/docx/pptx; requires Node >=22.13, already satisfied locally — verify the deploy target's Node version too, see Global Constraints). Supabase Storage (already-used `@supabase/supabase-js`, no new client library). Upload transport is a Next.js Route Handler (`app/api/library/upload/route.ts`), not a Server Action, using the Fetch API's built-in `request.formData()` — no multipart-parsing library needed.

**Spec:** `docs/superpowers/specs/2026-09-22-library-uploads-design.md`

## Global Constraints

- No automated test framework exists in this repo — every task's "test" step is `npm run build` (type-checks) plus a manual click-through, not a unit test file. Do not invent a test framework or test files.
- Uploads are private: visible only to the user who uploaded them, never in public Search or the shared saved-resources list.
- Max upload size is 25 MB; allowed types are exactly `.pdf`, `.docx`, `.pptx`, `.txt` — reject everything else client- and server-side.
- `officeparser` requires Node.js >=22.13.0. If the deploy target's Node version is older, upload text extraction will fail at install/runtime — flag this to the user before shipping if their hosting Node version is unknown or older (check `node --version` on the deploy target, or the platform's Node version setting).
- The migration file is numbered `0019_library_uploads.sql` — the repo's migrations run through `0018` already (courses/majors/subject-scoping work), not `0002` as an earlier draft of this plan assumed. Verified via `grep` across `0003`–`0018` that none of them touch the `resources` table or `license_status`, so Task 1's SQL is still valid against the current schema.
- Do not run `git commit` unless the user explicitly asks.

---

## File Structure

```
supabase/migrations/0019_library_uploads.sql   # NEW: nullable original_url, storage_path column, PERSONAL_UPLOAD enum value, RLS policy split, private storage bucket
lib/library/constants.ts                       # NEW: UPLOADS_BUCKET, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXTENSIONS
package.json                                   # MODIFIED: + officeparser dependency
lib/ai/extractFile.ts                          # NEW: fetchUploadedContent() — download from the storage bucket + text extraction
lib/ai/fetchContent.ts                         # MODIFIED: storage_path branch, ResourceForFetch widened
lib/ai/summarize.ts                            # MODIFIED: select storage_path
lib/ai/quiz.ts                                 # MODIFIED: select storage_path
app/api/library/upload/route.ts                # NEW: upload endpoint (validate, insert resources row, upload to storage)
components/library/UploadDropzone.tsx          # NEW: click/drag file picker, posts to the upload route
components/library/DeleteUploadButton.tsx      # NEW: delete an uploaded resource
lib/library/actions.ts                         # MODIFIED: + deleteUploadedResource server action
app/(app)/library/page.tsx                     # MODIFIED: + "My Uploads" section
```

---

### Task 1: Database migration, storage bucket, shared constants

**Files:**
- Create: `supabase/migrations/0019_library_uploads.sql`
- Create: `lib/library/constants.ts`

**Interfaces:**
- Produces: `UPLOADS_BUCKET: string`, `MAX_UPLOAD_BYTES: number`, `ALLOWED_UPLOAD_EXTENSIONS: readonly ["pdf", "docx", "pptx", "txt"]` — consumed by Task 2 (`lib/ai/extractFile.ts`), Task 4 (`app/api/library/upload/route.ts`), Task 6 (`lib/library/actions.ts`).
- Produces (DB): `resources.storage_path text` (nullable, non-null only for uploads), `resources.original_url` now nullable, `license_status` enum gains `'PERSONAL_UPLOAD'`, a private `library-uploads` storage bucket.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0019_library_uploads.sql`:

```sql
alter table resources alter column original_url drop not null;
alter table resources add column storage_path text;

alter type license_status add value 'PERSONAL_UPLOAD';

drop policy "resources_public_read" on resources;

create policy "resources_public_read" on resources
  for select using (storage_path is null);

create policy "resources_own_uploads_read" on resources
  for select using (auth.uid() = created_by and storage_path is not null);

insert into storage.buckets (id, name, public)
values ('library-uploads', 'library-uploads', false);
```

Notes for the person applying this: `storage_path is null` is true for every existing row (the column is brand new), so this is a pure addition — no existing public resource loses visibility. Inserts/deletes on `resources` for uploads happen through the service-role client (Task 4/6), which bypasses RLS entirely, so no insert/delete policy is added here.

- [ ] **Step 2: Apply the migration**

If the Supabase CLI is installed and linked to the project (`supabase link`): `supabase db push`.

Otherwise: open the Supabase Dashboard → SQL Editor for your project, paste the full contents of `0019_library_uploads.sql`, and run it.

- [ ] **Step 3: Verify the migration applied**

In the Supabase Dashboard: Table Editor → `resources` → confirm `storage_path` column exists and `original_url` is nullable. Storage → confirm a `library-uploads` bucket exists and is marked private (not public).

- [ ] **Step 4: Write the shared constants module**

Create `lib/library/constants.ts`:

```ts
export const UPLOADS_BUCKET = "library-uploads";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = ["pdf", "docx", "pptx", "txt"] as const;
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds (this file isn't imported anywhere yet, so it just needs to type-check on its own).

---

### Task 2: Text extraction (`officeparser` + `fetchUploadedContent`)

**Files:**
- Modify: `package.json` (add dependency)
- Create: `lib/ai/extractFile.ts`

**Interfaces:**
- Consumes: `UPLOADS_BUCKET` from `@/lib/library/constants` (Task 1), `createServiceClient` from `@/lib/supabase/service`
- Produces: `fetchUploadedContent(resource: { resource_type: string; storage_path: string }): Promise<string | null>` — consumed by Task 3 (`lib/ai/fetchContent.ts`)

- [ ] **Step 1: Install the dependency**

Run: `npm install officeparser@^8.0.0`
Expected: `package.json`'s `dependencies` gains `"officeparser": "^8.0.0"` and `package-lock.json` updates.

- [ ] **Step 2: Write the extraction module**

Create `lib/ai/extractFile.ts`:

```ts
import { OfficeParser } from "officeparser";
import { createServiceClient } from "@/lib/supabase/service";
import { UPLOADS_BUCKET } from "@/lib/library/constants";

// Matches lib/ai/fetchContent.ts's MAX_CHARS — the AI pipeline only ever
// reads this many characters of a resource's content regardless of source,
// so an uploaded file is capped the same way a scraped web page already is.
const MAX_CHARS = 12_000;

const OFFICE_PARSER_TYPES = new Set(["pdf", "docx", "pptx"]);

type UploadedResource = {
  resource_type: string;
  storage_path: string;
};

async function extractText(buffer: Buffer, resourceType: string): Promise<string | null> {
  if (resourceType === "txt") {
    const text = buffer.toString("utf-8").trim();
    return text || null;
  }

  if (!OFFICE_PARSER_TYPES.has(resourceType)) return null;

  const ast = await OfficeParser.parseOffice(buffer, {
    fileType: resourceType as "pdf" | "docx" | "pptx",
  });
  const { value } = await ast.to("text");
  const text = value.trim();
  return text || null;
}

export async function fetchUploadedContent(resource: UploadedResource): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(UPLOADS_BUCKET)
      .download(resource.storage_path);

    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());
    const text = await extractText(buffer, resource.resource_type);
    return text ? text.slice(0, MAX_CHARS) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds. (Nothing calls `fetchUploadedContent` yet — Task 3 wires it in. This step only confirms the module and the new dependency's types compile.)

---

### Task 3: Wire uploads into the existing AI content pipeline

**Files:**
- Modify: `lib/ai/fetchContent.ts:1-57`
- Modify: `lib/ai/summarize.ts:94-98`
- Modify: `lib/ai/quiz.ts:57-61`

**Interfaces:**
- Consumes: `fetchUploadedContent` from `@/lib/ai/extractFile` (Task 2)
- Produces: `ResourceForFetch` gains `storage_path: string | null` and `original_url` becomes `string | null` — `fetchContent`'s exported signature is otherwise unchanged, so `summarizeResource`/`generateQuiz` need no logic changes beyond widening their `select()` calls.

- [ ] **Step 1: Add the storage branch to `fetchContent`**

In `lib/ai/fetchContent.ts`, replace the full file with:

```ts
import * as cheerio from "cheerio";
import { fetchUploadedContent } from "./extractFile";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_CHARS = 12_000;

export type ResourceForFetch = {
  resource_type: string;
  license_status: string;
  original_url: string | null;
  storage_path: string | null;
};

export async function fetchContent(resource: ResourceForFetch): Promise<string | null> {
  if (resource.storage_path) {
    return fetchUploadedContent({
      resource_type: resource.resource_type,
      storage_path: resource.storage_path,
    });
  }
  if (resource.resource_type === "pdf") return null;
  if (resource.license_status === "LICENSE_UNCLEAR") return null;
  if (!resource.original_url) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(resource.original_url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
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

(Only three things changed from the original: the `fetchUploadedContent` import, `ResourceForFetch`'s `original_url`/`storage_path` types, and the two new guard blocks — the `storage_path` branch at the top and `if (!resource.original_url) return null;` before the URL fetch. The URL-scrape logic itself is untouched. The `storage_path` branch rebuilds a small object from `resource.storage_path` rather than passing `resource` straight through, because TypeScript's narrowing of `resource.storage_path` to `string` inside the `if` doesn't carry over to the whole `resource` object being passed to a function that expects a non-nullable `storage_path`.)

- [ ] **Step 2: Select `storage_path` in `summarizeResource`**

In `lib/ai/summarize.ts`, change:

```ts
  const { data: resource } = await supabase
    .from("resources")
    .select("title, description, resource_type, license_status, original_url")
    .eq("id", resourceId)
    .single();
```

to:

```ts
  const { data: resource } = await supabase
    .from("resources")
    .select("title, description, resource_type, license_status, original_url, storage_path")
    .eq("id", resourceId)
    .single();
```

- [ ] **Step 3: Select `storage_path` in `generateQuiz`**

In `lib/ai/quiz.ts`, change:

```ts
  const { data: resource } = await supabase
    .from("resources")
    .select("title, description, resource_type, license_status, original_url")
    .eq("id", resourceId)
    .single();
```

to:

```ts
  const { data: resource } = await supabase
    .from("resources")
    .select("title, description, resource_type, license_status, original_url, storage_path")
    .eq("id", resourceId)
    .single();
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds. Supabase's untyped client returns loosely-typed rows here (no generated `Database` types in this repo), so the wider `select()` string doesn't need a matching TypeScript type change to compile — `resource` already satisfies `ResourceForFetch` structurally once the extra column is present at runtime.

---

### Task 4: Upload API route

**Files:**
- Create: `app/api/library/upload/route.ts`

**Interfaces:**
- Consumes: `UPLOADS_BUCKET`, `MAX_UPLOAD_BYTES`, `ALLOWED_UPLOAD_EXTENSIONS` from `@/lib/library/constants` (Task 1), `createClient` from `@/lib/supabase/server`, `createServiceClient` from `@/lib/supabase/service`, `recordActivity` from `@/lib/gamification/activity`
- Produces: `POST /api/library/upload` — accepts `multipart/form-data` with a `file` field, returns `{ id: string }` on success or `{ error: string }` with a 4xx/5xx status — consumed by Task 5 (`UploadDropzone.tsx`)

- [ ] **Step 1: Write the route**

Create `app/api/library/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordActivity } from "@/lib/gamification/activity";
import { UPLOADS_BUCKET, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXTENSIONS } from "@/lib/library/constants";

function extensionOf(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const extension = extensionOf(file.name);
  if (!extension || !(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
    return NextResponse.json(
      { error: "Only PDF, DOCX, PPTX, and TXT files are supported" },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is larger than 25 MB" }, { status: 400 });
  }

  const service = createServiceClient();
  const title = file.name.replace(/\.[^.]+$/, "") || file.name;

  const { data: resource, error: insertError } = await service
    .from("resources")
    .insert({
      title,
      resource_type: extension,
      license_status: "PERSONAL_UPLOAD",
      created_by: user.id,
      original_url: null,
    })
    .select("id")
    .single();

  if (insertError || !resource) {
    return NextResponse.json({ error: "Couldn't save the upload" }, { status: 500 });
  }

  const storagePath = `${user.id}/${resource.id}/${file.name}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await service.storage
    .from(UPLOADS_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    await service.from("resources").delete().eq("id", resource.id);
    return NextResponse.json({ error: "Couldn't upload the file" }, { status: 500 });
  }

  await service.from("resources").update({ storage_path: storagePath }).eq("id", resource.id);
  await recordActivity(user.id, "resource_saved");

  return NextResponse.json({ id: resource.id });
}
```

(The `resources` row is inserted first without `storage_path` to get its generated `id`, which becomes part of the storage object's path — then `storage_path` is set once the upload succeeds. If the storage upload fails, the just-inserted row is deleted so no orphaned "upload" ever appears without a backing file.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. (This route has no UI to click through yet — Task 5 builds `UploadDropzone`, whose manual check in that task's Step 5 is what actually exercises this endpoint end-to-end against a real session.)

---

### Task 5: Upload UI — dropzone + "My Uploads" section

**Files:**
- Create: `components/library/UploadDropzone.tsx`
- Modify: `app/(app)/library/page.tsx:1-67`

**Interfaces:**
- Consumes: `POST /api/library/upload` (Task 4), `StudyActions` (existing, unchanged), `DeleteUploadButton` (Task 6 — imported here but not yet created; see note in Step 2)

- [ ] **Step 1: Write the dropzone component**

Create `components/library/UploadDropzone.tsx`:

```tsx
"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { ErrorBanner } from "@/components/common/ErrorBanner";

const ACCEPT = ".pdf,.docx,.pptx,.txt";

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/library/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragActive ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"
        }`}
      >
        <Upload className="size-5 text-neutral-400" />
        <p className="text-sm text-neutral-600">
          {uploading ? "Uploading…" : "Click or drop a PDF, DOCX, PPTX, or TXT file (max 25 MB)"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && <ErrorBanner message={error} />}
    </div>
  );
}
```

- [ ] **Step 2: Add a placeholder `DeleteUploadButton` so the Library page compiles**

Create `components/library/DeleteUploadButton.tsx` with a minimal working version now — Task 6 replaces its body with the real server-action call, but the Library page (Step 3 below) needs a real component to import so the build stays green between tasks:

```tsx
export function DeleteUploadButton({ resourceId }: { resourceId: string }) {
  return (
    <button
      disabled
      title={resourceId}
      className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400"
    >
      Delete
    </button>
  );
}
```

- [ ] **Step 3: Add the "My Uploads" section to the Library page**

Replace the full contents of `app/(app)/library/page.tsx` with:

```tsx
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { LicenseBadge } from "@/components/resource/LicenseBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { StudyActions } from "@/components/resource/StudyActions";
import { UnsaveButton } from "./UnsaveButton";
import { UploadDropzone } from "@/components/library/UploadDropzone";
import { DeleteUploadButton } from "@/components/library/DeleteUploadButton";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: saved } = await supabase
    .from("saved_resources")
    .select(
      "id, resources(id, title, description, source, resource_type, license_status, original_url)"
    )
    .eq("user_id", user?.id ?? "")
    .order("created_at", { ascending: false });

  const rows = (saved ?? [])
    .map((row) => ({
      savedId: row.id,
      resource: Array.isArray(row.resources) ? row.resources[0] : row.resources,
    }))
    .filter((r) => r.resource);

  const { data: uploads } = await supabase
    .from("resources")
    .select("id, title, resource_type, created_at")
    .eq("created_by", user?.id ?? "")
    .not("storage_path", "is", null)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-xl font-bold">My Uploads</h1>
        <UploadDropzone />
        {(uploads ?? []).length === 0 ? (
          <EmptyState message="No uploads yet. Upload a PDF, DOCX, PPTX, or TXT file to summarize or quiz yourself on it." />
        ) : (
          (uploads ?? []).map((upload, i) => (
            <Card
              key={upload.id}
              className="animate-in fade-in slide-in-from-bottom-1 space-y-2 p-4 duration-300"
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium leading-snug">{upload.title}</h3>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium uppercase text-neutral-600">
                  {upload.resource_type}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-2">
                  <StudyActions resourceId={upload.id} showAskAI />
                </div>
                <DeleteUploadButton resourceId={upload.id} />
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-4">
        <h1 className="text-xl font-bold">Library</h1>
        {rows.length === 0 ? (
          <EmptyState message="Nothing saved yet. Save resources from Search to build your library." />
        ) : (
          rows.map(({ resource }, i) => (
            <Card
              key={resource!.id}
              className="animate-in fade-in slide-in-from-bottom-1 space-y-2 p-4 duration-300"
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium leading-snug">{resource!.title}</h3>
                <LicenseBadge status={resource!.license_status} />
              </div>
              {resource!.description && (
                <p className="text-sm text-neutral-600">{resource!.description}</p>
              )}
              <div className="text-xs text-neutral-400">
                {resource!.source ?? "Unknown source"} · {resource!.resource_type}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <a href={resource!.original_url}>
                  <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
                    Open
                  </button>
                </a>
                <UnsaveButton resourceId={resource!.id} />
                <StudyActions resourceId={resource!.id} showAskAI />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
```

(Only additions: the `uploads` query, the new "My Uploads" section above the existing "Library" section, and the two new imports. The existing saved-resources section's JSX is untouched.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual check**

Run `npm run dev`, sign in, visit `/library`. Expected: a "My Uploads" section with the dropzone renders above the existing "Library" section. Click the dropzone, pick a small PDF — expected: "Uploading…" shows briefly, then the page refreshes and the file appears as a card with its extension badge, a (disabled, for now) "Delete" button, and working Summarize/Generate Quiz/Ask AI buttons. Try a `.jpg` — expected: an inline error ("Only PDF, DOCX, PPTX, and TXT files are supported"), no card added.

---

### Task 6: Delete flow

**Files:**
- Modify: `lib/library/actions.ts:1-28`
- Modify: `components/library/DeleteUploadButton.tsx` (replace Task 5's placeholder body)

**Interfaces:**
- Produces: `deleteUploadedResource(resourceId: string): Promise<{ deleted: true } | { error: string }>`

- [ ] **Step 1: Add the server action**

In `lib/library/actions.ts`, change the imports:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/gamification/activity";
```

to:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordActivity } from "@/lib/gamification/activity";
import { UPLOADS_BUCKET } from "@/lib/library/constants";
```

Then add this function at the end of the file (after `toggleSaveResource`):

```ts
export async function deleteUploadedResource(
  resourceId: string
): Promise<{ deleted: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const service = createServiceClient();
  const { data: resource } = await service
    .from("resources")
    .select("created_by, storage_path")
    .eq("id", resourceId)
    .maybeSingle();

  if (!resource || resource.created_by !== user.id || !resource.storage_path) {
    return { error: "Upload not found" };
  }

  await service.storage.from(UPLOADS_BUCKET).remove([resource.storage_path]);
  await service.from("resources").delete().eq("id", resourceId);

  revalidatePath("/library");
  return { deleted: true };
}
```

- [ ] **Step 2: Wire the button up to the real action**

Replace the full contents of `components/library/DeleteUploadButton.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { deleteUploadedResource } from "@/lib/library/actions";

export function DeleteUploadButton({ resourceId }: { resourceId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await deleteUploadedResource(resourceId);
            if ("error" in outcome) setError(outcome.error);
          })
        }
        className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
      >
        Delete
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual check**

Run `npm run dev`, sign in, visit `/library`. Click "Delete" on an uploaded file. Expected: the card disappears from "My Uploads" (page refreshes via `revalidatePath`). Confirm in the Supabase Dashboard → Storage → `library-uploads` that the object is gone too, not just the DB row.

---

### Task 7: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full build and lint**

```bash
npm run build
npm run lint
```

Expected: both succeed with no errors.

- [ ] **Step 2: End-to-end upload + AI tools, all four file types**

Run `npm run dev`, sign in as a test user. For each of a `.pdf`, `.docx`, `.pptx`, and `.txt` file with real, distinguishable text content:
1. Upload it from `/library`'s "My Uploads" section.
2. Click "Summarize" — expected: the summary sheet reflects the file's actual content (specific terms/facts from it), not a generic placeholder.
3. Click "Generate Quiz" (5 questions, easy) — expected: questions are grounded in the file's actual content.
4. Click "Ask AI" — expected: lands on `/tutor?resourceId=<id>`, and a question about the file's content gets an answer grounded in it.

- [ ] **Step 3: Reject paths**

From the UI: try uploading a `.jpg` (wrong type) and a file over 25 MB (if you have one handy — otherwise skip this half and trust Task 4/5's size-check code path). Expected: inline errors, no resource row created for either (check the Supabase Dashboard → Table Editor → `resources` to confirm no orphaned rows).

Directly `curl -X POST http://localhost:3000/api/library/upload` with no auth cookie and no file: expected `401` with `{"error":"Not authenticated"}` (or, if a cookie is attached but no `file` field, `400` with `{"error":"No file provided"}`).

- [ ] **Step 4: RLS isolation between users**

Sign in as a second test user (Supabase Admin API, same approach as prior phases). Confirm: `/library`'s "My Uploads" section is empty for this second user (the first user's uploads don't appear), and querying `resources` directly as this user (e.g. via the Supabase client in a scratch script, or by temporarily logging the uploads query's result) never returns the first user's upload rows.

- [ ] **Step 5: Existing flows unaffected**

Confirm the existing "Library" section (saved search resources) still works exactly as before: saved resources list correctly, "Remove" (`UnsaveButton`) still works, Summarize/Generate Quiz/Ask AI still work on a saved (non-uploaded) resource. Run a Search and confirm results and saving still work — this exercises `search_resources`, which is unaffected by the RLS policy split (all pre-existing rows have `storage_path is null`).

- [ ] **Step 6: Clean up**

Delete the test user(s) and any test uploads (both the `resources` rows and their `library-uploads` storage objects, if any survived the delete-flow checks) via the Supabase Admin API / Dashboard.
