import { ChatThread } from "@/components/tutor/ChatThread";
import { ViewportHeightFrame } from "@/components/tutor/ViewportHeightFrame";
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
    <ViewportHeightFrame
      mobileOffsetRem={7}
      desktopOffsetRem={3}
      className="flex h-[calc(100dvh-7rem)] flex-col gap-4 md:h-[calc(100dvh-3rem)]"
    >
      <div>
        <h1 className="text-xl font-bold">Ask WonnaAi</h1>
        {resourceId && (
          <p className="text-sm text-neutral-500">Ask about this resource.</p>
        )}
      </div>
      <ChatThread resourceId={resourceId ?? null} resourceTitle={resourceTitle} />
    </ViewportHeightFrame>
  );
}
