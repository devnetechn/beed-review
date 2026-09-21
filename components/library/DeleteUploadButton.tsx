"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteUploadedResource } from "@/lib/library/actions";

export function DeleteUploadButton({ resourceId }: { resourceId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await deleteUploadedResource(resourceId);
            if ("error" in outcome) {
              setError(outcome.error);
              return;
            }
            router.refresh();
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
