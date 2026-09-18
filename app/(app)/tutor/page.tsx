import { ChatThread } from "@/components/tutor/ChatThread";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ resourceId?: string }>;
}) {
  const { resourceId } = await searchParams;
  let resourceTitle: string | undefined;

  if (resourceId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("resources")
      .select("title")
      .eq("id", resourceId)
      .maybeSingle();
    resourceTitle = data?.title;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">AI Tutor</h1>
        <p className="text-sm text-neutral-500">
          {resourceId ? "Ask about this resource." : "Ask about any BEEd/LET topic."}
        </p>
      </div>
      <ChatThread resourceId={resourceId ?? null} resourceTitle={resourceTitle} />
    </div>
  );
}
