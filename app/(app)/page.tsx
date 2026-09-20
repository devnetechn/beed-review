import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Greeting } from "@/components/common/Greeting";
import { TeacherWonna } from "@/components/character/TeacherWonna";
import { getWeakTopics, getRecommendedTopics } from "@/lib/quiz/weakTopics";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const { data: saved } = await supabase
    .from("saved_resources")
    .select("id, resources(id, title, source)")
    .eq("user_id", user?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: recentQuizzes } = await supabase
    .from("quiz_attempts")
    .select("id, score, total_questions, created_at, resources(title), topics(name)")
    .eq("user_id", user?.id ?? "")
    .not("score", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);

  const weakTopics = user ? await getWeakTopics(user.id, 3) : [];
  const recommended = user ? await getRecommendedTopics(user.id, 2) : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <TeacherWonna state="welcome" size="sm" />
        <div>
          <Greeting name={profile?.display_name?.split(" ")[0] ?? null} />
          <p className="text-neutral-500">What do you want to study?</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Link href="/search">
          <Button className="w-full justify-start" size="lg">
            Search Reviewer
          </Button>
        </Link>
        <Link href="/tutor">
          <Button variant="outline" className="w-full justify-start" size="lg">
            Ask WonnaAi
          </Button>
        </Link>
        <Link href="/quiz">
          <Button variant="outline" className="w-full justify-start" size="lg">
            Take a Quiz
          </Button>
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Recently Saved</h2>
        {saved && saved.length > 0 ? (
          <div className="space-y-2">
            {saved.map((row) => {
              const resource = Array.isArray(row.resources) ? row.resources[0] : row.resources;
              if (!resource) return null;
              return (
                <Card key={row.id} className="p-3">
                  <div className="font-medium">{resource.title}</div>
                  <div className="text-sm text-neutral-500">{resource.source}</div>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            Nothing saved yet. Search for a topic and save resources to your library.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Recent Quizzes</h2>
        {recentQuizzes && recentQuizzes.length > 0 ? (
          <div className="space-y-2">
            {recentQuizzes.map((q) => {
              const resource = Array.isArray(q.resources) ? q.resources[0] : q.resources;
              const topic = Array.isArray(q.topics) ? q.topics[0] : q.topics;
              const label = resource?.title ?? topic?.name ?? "Quiz";
              return (
                <Link key={q.id} href={`/quiz/${q.id}`}>
                  <Card className="p-3">
                    <div className="font-medium">{label}</div>
                    <div className="text-sm text-neutral-500">
                      {q.score}/{q.total_questions} · {new Date(q.created_at).toLocaleDateString()}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No quizzes taken yet.</p>
        )}
      </section>

      {weakTopics.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-500">Weak Areas</h2>
          <div className="flex flex-wrap gap-2">
            {weakTopics.map((t) => (
              <Link
                key={t.topicId}
                href={`/quiz?topicId=${t.topicId}&topicName=${encodeURIComponent(t.topicName)}`}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100"
              >
                {t.topicName} ({Math.round(t.accuracy * 100)}%)
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Recommended for You</h2>
        <div className="flex flex-wrap gap-2">
          {recommended.map((r) => (
            <Link
              key={r.label}
              href={
                r.topicId
                  ? `/quiz?topicId=${r.topicId}&topicName=${encodeURIComponent(r.label)}`
                  : r.subjectSlug
                    ? `/quiz?subjectSlug=${r.subjectSlug}`
                    : "/quiz"
              }
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              {r.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
