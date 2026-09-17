"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LicenseBadge } from "@/components/resource/LicenseBadge";
import type { ResourceHit } from "@/lib/search/searchResources";

export function ResourceCard({
  resource,
  saved,
  onToggleSave,
}: {
  resource: ResourceHit;
  saved: boolean;
  onToggleSave: (id: string) => void;
}) {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug">{resource.title}</h3>
        <LicenseBadge status={resource.license_status} />
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
