"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ErrorBanner } from "@/components/common/ErrorBanner";

export function SummarySheet({
  open,
  onOpenChange,
  loading,
  content,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  content: string | null;
  error: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Study Notes</SheetTitle>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-6">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Spinner /> Generating notes…
            </div>
          )}
          {error && <ErrorBanner message={error} />}
          {content && (
            <div className="whitespace-pre-wrap text-sm text-neutral-700">{content}</div>
          )}
          {content && (
            <p className="pt-2 text-xs text-neutral-400">
              AI-generated — verify against the original source before relying on it for exam
              prep.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
