# BEEd Exam Prep Platform — Library File Uploads Design

Status: Approved
Date: 2026-09-22

## Context

The Library page (`app/(app)/library/page.tsx`) currently only shows
resources the user saved from Search — external links backed by
`resources.original_url`. Each saved resource already gets
Summarize/Generate Quiz/Ask AI actions (`StudyActions.tsx` →
`lib/ai/summarize.ts` / `lib/ai/quiz.ts`), which pull page content via
`lib/ai/fetchContent.ts` (HTML scrape of `original_url`, capped at
12,000 characters; PDFs and license-unclear resources are explicitly
skipped).

This feature lets a user upload their own file (PDF, DOCX, PPTX, or
TXT — e.g. a personal reviewer or e-book) and get the same
Summarize/Generate Quiz/Ask AI treatment on it, without needing it to
exist anywhere on the public web. Uploads are private to the uploader.

## Goals

- A user can upload a PDF, DOCX, PPTX, or TXT file (max 25 MB) from
  the Library page.
- The upload appears in a new "My Uploads" section on the Library
  page, visible only to the user who uploaded it.
- Summarize, Generate Quiz, and Ask AI work on an uploaded file exactly
  as they do on a saved search resource today, by extracting its text
  and reusing the existing AI pipeline unchanged.
- A user can delete their own upload (removes the stored file and its
  row).

## Non-Goals

- No sharing/publishing an upload to other users or into public
  Search results.
- No OCR for scanned/image-only PDFs — text extraction only.
- No chunking, embeddings, or RAG over large documents — content is
  truncated the same simple way the existing web-scrape path already
  is (first ~12,000 characters). A long e-book's summary/quiz will
  only reflect its beginning; this matches the current codebase's
  existing behavior for long web pages, not a regression.
- No editing/replacing an uploaded file after the fact — delete and
  re-upload instead.
- No virus/malware scanning beyond type and size validation.

## Architecture

### 1. Data model & migration

New migration `0003_library_uploads.sql`:

- `alter table resources alter column original_url drop not null;`
  (uploads have no external URL).
- `alter table resources add column storage_path text;` — set only for
  uploads; its presence is the signal that a resource is an upload
  rather than a web resource.
- `alter type license_status add value 'PERSONAL_UPLOAD';` — new
  status for uploads, keeps them out of the public search RPC's
  `license_status not in ('COPYRIGHTED', 'NOT_RECOMMENDED')` filter
  concern and out of `LicenseBadge` (badge simply isn't rendered for
  this status in the uploads section).
- Replace the `resources_public_read` policy:
  ```sql
  drop policy "resources_public_read" on resources;
  create policy "resources_public_read" on resources
    for select using (storage_path is null);
  create policy "resources_own_uploads_read" on resources
    for select using (auth.uid() = created_by and storage_path is not null);
  ```
  Inserts/deletes for uploads go through the service-role client
  (server-side only, same pattern already used for quiz/summary
  writes), so no new insert/delete RLS policy is needed.

### 2. Storage bucket & upload route

- New private Supabase Storage bucket `library-uploads` (not public).
  Object key: `${userId}/${resourceId}/${filename}`.
- New Route Handler `app/api/library/upload/route.ts` (a Route
  Handler, not a server action, to avoid the default Next.js
  server-action request-body size cap):
  1. `createClient()` (cookie session) → require authenticated user.
  2. Parse `multipart/form-data`; reject if extension isn't one of
     `.pdf`/`.docx`/`.pptx`/`.txt` or size exceeds 25 MB.
  3. `createServiceClient()` → insert a `resources` row (`title`:
     filename minus extension, `resource_type`: the extension,
     `license_status: 'PERSONAL_UPLOAD'`, `created_by: user.id`,
     `original_url: null`) to get the new `resourceId`, then upload
     the file bytes to `library-uploads/${userId}/${resourceId}/${filename}`
     and set `storage_path` on that row.
  4. `recordActivity(user.id, "resource_saved")` (reuses the existing
     activity kind — an upload is "added something to your library",
     same as saving a search result; no new gamification kind needed).
  5. Return the new resource's `id`; client redirects/revalidates the
     Library page.

### 3. Text extraction

- New `lib/ai/extractFile.ts`:
  - `.pdf` / `.docx` / `.pptx` → `officeparser` (new dependency; single
    library covers all three via one text-extraction call).
  - `.txt` → read the buffer as UTF-8 directly.
  - Result truncated to the same `MAX_CHARS` (12,000) constant
    `fetchContent.ts` already uses (import/share it rather than
    duplicating the number).
- `fetchUploadedContent(resource)`: downloads the object from
  `library-uploads` via the service client, dispatches to
  `extractFile.ts` by extension, returns `string | null` (null on any
  extraction failure — same soft-fail contract `fetchContent` already
  has).

### 4. `fetchContent` integration

`lib/ai/fetchContent.ts` gains a branch at the very top, before the
existing `resource_type === "pdf"` / `license_status ===
"LICENSE_UNCLEAR"` early-outs (those only make sense for the
URL-scrape path — an upload must not be skipped by them):

```ts
export async function fetchContent(resource: ResourceForFetch): Promise<string | null> {
  if (resource.storage_path) return fetchUploadedContent(resource);
  if (resource.resource_type === "pdf") return null;
  ...
}
```

`ResourceForFetch` gains `storage_path: string | null`. Because
`summarizeResource` and `generateQuiz` already select `resource_type,
license_status, original_url` and pass the row straight into
`fetchContent`, they only need `storage_path` added to their `select`
list — no other change. This is the reuse payoff from putting uploads
in the `resources` table: the AI pipeline itself doesn't need to know
uploads exist.

### 5. UI — "My Uploads" section

- `app/(app)/library/page.tsx` gets a second query: `resources` where
  `created_by = user.id and storage_path is not null`, rendered as its
  own "My Uploads" section above or below the existing saved-resources
  list (existing section keeps its current query/behavior untouched).
- Each row: title, file type, an `UploadedResourceActions` wrapper
  reusing `StudyActions` (`showAskAI`) plus a `Delete` button — no
  `LicenseBadge` (uploads don't have a public license status worth
  displaying).
- New `components/library/UploadDropzone.tsx` (Client Component): file
  picker/drop target, client-side extension + size pre-check (fast
  feedback before hitting the server), posts to
  `/api/library/upload`, then `router.refresh()` on success. Shows a
  loading state during upload and a plain error message on failure
  (invalid type, too large, server error).

### 6. Delete flow

- New `deleteUploadedResource(resourceId)` server action in
  `lib/library/actions.ts`:
  1. `createServiceClient()`; fetch the resource, verify
     `created_by === user.id` and `storage_path` is set (never allow
     deleting a non-upload or someone else's upload through this
     path).
  2. Remove the storage object, then delete the `resources` row.
  3. `revalidatePath("/library")`.
- New `DeleteUploadButton.tsx` Client Component, same
  `useTransition`-based pattern as the existing `UnsaveButton.tsx`.

## Error Handling

- Upload route: typed JSON error responses for invalid extension,
  oversized file, and unauthenticated — `UploadDropzone` renders each
  as a plain inline message, no new error-banner system.
- `fetchUploadedContent` never throws — extraction failure (corrupt
  file, password-protected PDF, etc.) returns `null`, which
  `summarizeResource`/`generateQuiz` already handle today by falling
  back to a metadata-only prompt (title/description) instead of
  failing the whole action.
- Delete action rejects (no-op + surfaced error) if the resource isn't
  an upload owned by the caller, mirroring the ownership check
  pattern.

## Testing

Manual verification via `npm run build && npm run start` (no
automated test framework in this repo, consistent with every prior
phase):

- Upload each of the four file types, confirm each appears under "My
  Uploads" and not in the shared saved-resources list.
- Reject paths: wrong extension, file over 25 MB, unauthenticated
  request directly to the route.
- Summarize and Generate Quiz on an uploaded PDF/DOCX/PPTX/TXT, confirm
  the output reflects the file's actual content (not a generic
  metadata-only fallback).
- Confirm a second user account cannot see or query another user's
  upload (RLS check — query `resources` as a different signed-in user
  and confirm the row is absent).
- Delete an upload, confirm the storage object and row are both gone
  and it disappears from "My Uploads".
- Confirm existing saved-search-resource flows (Library list, Summarize,
  Generate Quiz, Ask AI, Unsave) are unaffected.

## Explicitly Deferred

- OCR for image-only PDFs.
- Chunking/embeddings for long documents.
- Sharing an upload with other users or promoting it into public
  Search.
- Editing/replacing an uploaded file in place.
