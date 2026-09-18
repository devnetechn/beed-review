"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LicenseBadge } from "@/components/resource/LicenseBadge";
import { StudyActions } from "./StudyActions";
import type { ResourceHit } from "@/lib/search/searchResources";

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
      <div className="flex flex-wrap gap-2 pt-1">
        <a href={resource.original_url}>
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
    </Card>
  );
}
