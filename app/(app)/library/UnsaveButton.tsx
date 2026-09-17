"use client";

import { useTransition } from "react";
import { toggleSaveResource } from "@/lib/library/actions";

export function UnsaveButton({ resourceId }: { resourceId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(() => {
          void toggleSaveResource(resourceId);
        })
      }
      className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
    >
      Remove
    </button>
  );
}
