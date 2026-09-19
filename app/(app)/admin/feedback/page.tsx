import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isOwnerEmail } from "@/lib/admin";
import { EmptyState } from "@/components/common/EmptyState";

export const dynamic = "force-dynamic";

export default async function FeedbackInboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isOwnerEmail(user?.email)) {
    return <EmptyState message="Not authorized." />;
  }

  const service = createServiceClient();
  const { data: feedback } = await service
    .from("feedback")
    .select("id, message, created_at, profiles(display_name)")
    .order("created_at", { ascending: false });

  const rows = (feedback ?? []) as {
    id: string;
    message: string;
    created_at: string;
    profiles: { display_name: string | null } | { display_name: string | null }[] | null;
  }[];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Feedback Inbox</h1>

      {rows.length === 0 ? (
        <EmptyState message="No feedback yet." />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
            return (
              <div key={row.id} className="space-y-1 rounded-xl border border-neutral-200 p-4">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>{profile?.display_name ?? "Unknown user"}</span>
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{row.message}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
