import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { LicenseBadge } from "@/components/resource/LicenseBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { StudyActions } from "@/components/resource/StudyActions";
import { UnsaveButton } from "./UnsaveButton";

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Library</h1>
      {rows.length === 0 ? (
        <EmptyState message="Nothing saved yet. Save resources from Search to build your library." />
      ) : (
        rows.map(({ resource }) => (
          <Card key={resource!.id} className="space-y-2 p-4">
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
              <a href={resource!.original_url} target="_blank" rel="noopener noreferrer">
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
  );
}
