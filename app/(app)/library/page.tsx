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
