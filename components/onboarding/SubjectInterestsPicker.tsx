"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SUBJECTS } from "@/lib/sources/subjects";
import { saveSubjectInterestsAction } from "@/lib/profile/interests";

export function SubjectInterestsPicker() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    await saveSubjectInterestsAction(Array.from(selected));
    setSaving(false);
    setDismissed(true);
    router.refresh();
  }

  async function handleSkip() {
    setDismissed(true);
    await saveSubjectInterestsAction([]);
    router.refresh();
  }

  if (dismissed) return null;

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="font-medium">What do you want to focus on?</h2>
        <p className="text-sm text-neutral-500">
          Pick a few subjects — we&apos;ll use them for your recommendations.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUBJECTS.map((s) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => toggle(s.slug)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              selected.has(s.slug)
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-700"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={saving || selected.size === 0} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={handleSkip}>
          Skip
        </Button>
      </div>
    </Card>
  );
}
