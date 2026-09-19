"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { TeacherWonna } from "@/components/character/TeacherWonna";
import { COURSES, BSED_MAJORS } from "@/lib/sources/courses";
import { completeOnboarding } from "@/lib/onboarding/actions";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "welcome">("form");
  const [courseSlug, setCourseSlug] = useState<string | null>(null);
  const [majorSlug, setMajorSlug] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handlePickCourse(slug: string) {
    setCourseSlug(slug);
    if (slug !== "bsed") setMajorSlug(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseSlug) {
      setError("Please select your course.");
      return;
    }
    if (courseSlug === "bsed" && !majorSlug) {
      setError("Please select your major.");
      return;
    }
    if (!agreed) {
      setError("Please accept the Terms and Conditions.");
      return;
    }
    setLoading(true);
    setError(null);
    const outcome = await completeOnboarding(courseSlug, courseSlug === "bsed" ? majorSlug : null, agreed);
    setLoading(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setStep("welcome");
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function handleContinue() {
    router.push("/");
    router.refresh();
  }

  if (step === "welcome") {
    return (
      <div className="flex flex-col items-center space-y-5 text-center">
        <TeacherWonna state="welcome" size="lg" />
        <div className="space-y-2">
          <h1 className="text-xl font-bold">Kumusta! Ako si Teacher Wonna 👋</h1>
          <p className="text-sm text-neutral-500">
            Ako ang iyong AI study buddy dito sa WonnaLearn. Tutulungan kita mag-review gamit ang
            AI Tutor chat, mga quiz, at mga resources — anytime, anywhere.
          </p>
          <p className="text-sm text-neutral-500">Ready ka na ba? Simulan na natin!</p>
        </div>
        <Button className="w-full" onClick={handleContinue}>
          Let&apos;s get started
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <Image
          src="/logo-mark.png"
          alt="WonnaLearn"
          width={64}
          height={64}
          className="mx-auto mb-2 rounded-full"
        />
        <h1 className="text-xl font-bold">One more step</h1>
        <p className="text-sm text-neutral-500">Tell us what you&apos;re studying for</p>
      </div>

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4">
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

        <label className="flex items-start gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="underline">
              Terms and Conditions
            </Link>
            .
          </span>
        </label>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Saving…" : "Continue"}
        </Button>
      </form>

      <button
        type="button"
        onClick={handleSignOut}
        className="w-full text-center text-sm text-neutral-400 underline"
      >
        Not you? Sign out
      </button>
    </div>
  );
}
