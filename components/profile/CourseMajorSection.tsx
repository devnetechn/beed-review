"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { COURSES, BSED_MAJORS } from "@/lib/sources/courses";
import { updateCourseAndMajor } from "@/lib/profile/course";

export function CourseMajorSection({
  currentCourseSlug,
  currentCourseName,
  currentMajorName,
}: {
  currentCourseSlug: string | null;
  currentCourseName: string | null;
  currentMajorName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseSlug, setCourseSlug] = useState<string | null>(currentCourseSlug);
  const [majorSlug, setMajorSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCourseSlug(currentCourseSlug);
      setMajorSlug(null);
      setError(null);
    }
  }

  function handlePickCourse(slug: string) {
    setCourseSlug(slug);
    if (slug !== "bsed") setMajorSlug(null);
  }

  async function handleSave() {
    if (!courseSlug) {
      setError("Please select your course.");
      return;
    }
    if (courseSlug === "bsed" && !majorSlug) {
      setError("Please select your major.");
      return;
    }
    setLoading(true);
    setError(null);
    const outcome = await updateCourseAndMajor(courseSlug, courseSlug === "bsed" ? majorSlug : null);
    setLoading(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const changingCourse =
    currentCourseSlug !== null && courseSlug !== null && courseSlug !== currentCourseSlug;

  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-4">
      <div>
        <p className="text-sm font-medium">Course</p>
        <p className="text-sm text-neutral-500">
          {currentCourseName ?? "Not set"}
          {currentMajorName && ` — ${currentMajorName}`}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        Change
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Course</p>
              <div className="flex flex-wrap gap-2">
                {COURSES.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => handlePickCourse(c.slug)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      courseSlug === c.slug
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 text-neutral-700"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {courseSlug === "bsed" && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Major</p>
                <div className="flex flex-wrap gap-2">
                  {BSED_MAJORS.map((m) => (
                    <button
                      key={m.slug}
                      type="button"
                      onClick={() => setMajorSlug(m.slug)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        majorSlug === m.slug
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 text-neutral-700"
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {changingCourse && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Changing your course may change which subjects and quizzes you see.
              </p>
            )}

            {error && <ErrorBanner message={error} />}
          </div>
          <DialogFooter>
            <Button disabled={loading} onClick={handleSave} className="w-full">
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Saving…
                </span>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
