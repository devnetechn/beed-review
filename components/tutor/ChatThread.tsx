"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { startTutorConversationAction, sendTutorMessageAction } from "@/lib/ai/actions";

type Message = { role: "user" | "assistant"; content: string; wantsExtremeQuiz?: boolean };

export function ChatThread({
  resourceId,
  resourceTitle,
}: {
  resourceId: string | null;
  resourceTitle?: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const outcome = await startTutorConversationAction(resourceId);
      if (cancelled) return;
      setLoading(false);
      if ("error" in outcome) {
        setError(outcome.error);
        return;
      }
      setConversationId(outcome.conversationId);
      setMessages(outcome.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || !conversationId) return;
    const text = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    setError(null);
    const outcome = await sendTutorMessageAction(conversationId, resourceId, text);
    setSending(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: outcome.reply, wantsExtremeQuiz: outcome.wantsExtremeQuiz },
    ]);
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
      {resourceTitle && (
        <div className="border-b border-neutral-200 px-1 pb-2 text-xs text-neutral-500">
          Chatting about: {resourceTitle}
        </div>
      )}
      <div className="flex-1 space-y-3 overflow-y-auto py-3">
        {loading && <p className="text-sm text-neutral-400">Loading…</p>}
        {messages.map((m, i) => (
          <div key={i} className="space-y-1.5">
            <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
                }`}
              >
                {m.content}
              </div>
            </div>
            {m.role === "assistant" && m.wantsExtremeQuiz && (
              <div className="flex justify-start">
                <Link href="/quiz/extreme">
                  <Button
                    size="sm"
                    className="animate-in fade-in gap-1.5 bg-orange-600 text-white duration-300 hover:bg-orange-700"
                  >
                    <Zap className="size-3.5" />
                    Start Extreme Quiz
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ))}
        {sending && <p className="text-sm text-neutral-400">Thinking…</p>}
        <div ref={bottomRef} />
      </div>
      {error && <ErrorBanner message={error} />}
      <div className="flex gap-2 border-t border-neutral-200 pt-2">
        <Input
          placeholder="Ask about BEEd/LET topics…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
          disabled={loading}
        />
        <Button onClick={handleSend} disabled={loading || sending || !input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
