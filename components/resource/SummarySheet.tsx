"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
          {loading && <p className="text-sm text-neutral-400">Generating notes…</p>}
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
