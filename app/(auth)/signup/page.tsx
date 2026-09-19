"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { COURSES, BSED_MAJORS } from "@/lib/sources/courses";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [courseSlug, setCourseSlug] = useState<string | null>(null);
  const [majorSlug, setMajorSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
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
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          course_slug: courseSlug,
          major_slug: courseSlug === "bsed" ? majorSlug : null,
        },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSubmitted(true);
  }

  async function handleGoogleSignup() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <Image
          src="/logo-mark.png"
          alt="WonnaLearn"
          width={64}
          height={64}
          className="mx-auto rounded-full"
        />
        <h1 className="text-xl font-bold">Check your email</h1>
        <p className="text-sm text-neutral-500">
          We sent a confirmation link to {email}. Confirm it, then sign in.
        </p>
        <Link href="/login" className="text-sm underline">
          Back to sign in
        </Link>
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
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="text-sm text-neutral-500">Start building your study library</p>
      </div>

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Course</Label>
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
            <Label>Major</Label>
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

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : "Sign up"}
        </Button>
      </form>

      <Button variant="outline" className="w-full" onClick={handleGoogleSignup}>
        Continue with Google
      </Button>

      <p className="text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
