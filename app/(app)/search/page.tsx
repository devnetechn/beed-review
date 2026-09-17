"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { ResourceCard } from "@/components/resource/ResourceCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { toggleSaveResource } from "@/lib/library/actions";
import type { ResourceHit, SubjectHit, TopicHit } from "@/lib/search/searchResources";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    subjects: SubjectHit[];
    topics: TopicHit[];
    resources: ResourceHit[];
  } | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function runSearch(q: string) {
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed. Try again.");
      const data = await res.json();
      setResults(data);
    } catch {
      setError("Something went wrong searching. Please try again.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => runSearch(query));
  }

  function handleToggleSave(id: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    startTransition(async () => {
      await toggleSaveResource(id);
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-2">
        <Input
          placeholder="What do you want to review?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="text-xs text-neutral-400">
          Try &quot;Assessment of Learning&quot; or &quot;classroom management&quot;
        </p>
      </form>

      {error && <ErrorBanner message={error} />}

      {isPending && <p className="text-sm text-neutral-400">Searching…</p>}

      {results && !isPending && (
        <div className="space-y-6">
          {results.resources.length === 0 &&
          results.subjects.length === 0 &&
          results.topics.length === 0 ? (
            <EmptyState message="No matches yet. Try a different subject or topic name." />
          ) : (
            <>
              {results.resources.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  saved={savedIds.has(resource.id)}
                  onToggleSave={handleToggleSave}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
