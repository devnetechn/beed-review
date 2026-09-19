"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { submitFeedback } from "@/lib/feedback/actions";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setMessage("");
      setError(null);
      setSent(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const outcome = await submitFeedback(message);
    setLoading(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setSent(true);
    setMessage("");
  }

  return (
    <>
      <Button variant="outline" className="w-full gap-2" onClick={() => setOpen(true)}>
        <MessageSquare className="size-4" />
        Send Feedback
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Feedback</DialogTitle>
          </DialogHeader>
          {sent ? (
            <p className="text-sm text-neutral-500">Thanks — your feedback was sent.</p>
          ) : (
            <div className="space-y-3">
              <textarea
                autoFocus
                placeholder="What's on your mind? Bugs, ideas, anything."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              {error && <ErrorBanner message={error} />}
            </div>
          )}
          {!sent && (
            <DialogFooter>
              <Button disabled={loading || !message.trim()} onClick={handleSubmit} className="w-full">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Spinner /> Sending…
                  </span>
                ) : (
                  "Send"
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
