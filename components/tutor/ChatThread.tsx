"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { TypingIndicator } from "./TypingIndicator";
import { TeacherWonna } from "@/components/character/TeacherWonna";
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
      <div className="flex items-center gap-3 border-b border-neutral-200 pb-3">
        <TeacherWonna state={sending ? "thinking" : "idle"} size="sm" />
        <div>
          <p className="text-sm font-semibold">Teacher Wonna</p>
          <p className="text-xs text-neutral-500">Your AI study buddy</p>
        </div>
      </div>
      {resourceTitle && (
        <div className="border-b border-neutral-200 px-1 py-2 text-xs text-neutral-500">
          Chatting about: {resourceTitle}
        </div>
      )}
      <div className="flex-1 space-y-3 overflow-y-auto py-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Spinner /> Loading…
          </div>
        )}
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
        {sending && (
          <div className="flex justify-start">
            <TypingIndicator />
          </div>
        )}
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
