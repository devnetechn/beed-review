import { createClient } from "@/lib/supabase/server";
import { getExtremeQuizStatus } from "@/lib/quiz/extreme";
import { ExtremeQuizPicker } from "@/components/quiz/ExtremeQuizPicker";
import { ExtremeLockedState } from "@/components/quiz/ExtremeLockedState";
import { EmptyState } from "@/components/common/EmptyState";

export const dynamic = "force-dynamic";

export default async function ExtremeQuizPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <EmptyState message="Please sign in to play Extreme Quiz." />;
  }

  const { usedToday, nextAvailableAt } = await getExtremeQuizStatus(user.id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Extreme Quiz</h1>
      {usedToday && nextAvailableAt ? (
        <ExtremeLockedState nextAvailableAt={nextAvailableAt} />
      ) : (
        <ExtremeQuizPicker />
      )}
    </div>
  );
}
