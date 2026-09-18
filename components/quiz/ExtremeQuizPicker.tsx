"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { SUBJECTS } from "@/lib/sources/subjects";
import { startExtremeQuizAction } from "@/lib/quiz/actions";

type Topic = { id: string; name: string };

export function ExtremeQuizPicker() {
  const router = useRouter();
  const [step, setStep] = useState<"subject" | "topic">("subject");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [startingTopicId, setStartingTopicId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);

  async function handlePickSubject(slug: string) {
    setTopicsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics?subject=${encodeURIComponent(slug)}`);
      const data = await res.json();
      setTopics(data.topics ?? []);
      setStep("topic");
    } catch {
      setError("Couldn't load topics. Please try again.");
    } finally {
      setTopicsLoading(false);
    }
  }

  async function handlePickTopic(topicId: string) {
    setStartingTopicId(topicId);
    setError(null);
    const outcome = await startExtremeQuizAction(topicId);
    setStartingTopicId(null);
    if ("error" in outcome) {
      if (outcome.error === "already_used_today") {
        setLockedMessage("You've already used today's Extreme Quiz.");
        return;
      }
      setError(outcome.error);
      return;
    }
    router.push(`/quiz/extreme/${outcome.attemptId}`);
  }

  if (lockedMessage) {
    return <ErrorBanner message={lockedMessage} />;
  }

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
        <Flame className="size-5 text-orange-600" />
        <p className="text-sm text-orange-900">
          10 questions, 20 seconds each, one attempt a day. Good luck.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      {step === "subject" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Pick a subject</p>
          <div className="grid grid-cols-1 gap-2">
            {SUBJECTS.map((s) => (
              <Button
                key={s.slug}
                variant="outline"
                className="justify-start"
                disabled={topicsLoading}
                onClick={() => handlePickSubject(s.slug)}
              >
                {s.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {step === "topic" && (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setStep("subject")}>
            ← Back to subjects
          </Button>
          <p className="text-sm font-medium">Pick a topic to start</p>
          {topics.length === 0 ? (
            <p className="text-sm text-neutral-400">No topics found for this subject yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {topics.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="justify-start"
                  disabled={startingTopicId !== null}
                  onClick={() => handlePickTopic(t.id)}
                >
                  {startingTopicId === t.id ? (
                    <span className="flex items-center gap-2">
                      <Spinner /> Generating your Extreme Quiz…
                    </span>
                  ) : (
                    t.name
                  )}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
