import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

const RECOMMENDED_TOPIC_NAMES = ["Teaching Profession", "Curriculum Development"];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: saved } = await supabase
    .from("saved_resources")
    .select("id, resources(id, title, source)")
    .eq("user_id", user?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{greeting()}</h1>
        <p className="text-neutral-500">What do you want to study?</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Link href="/search">
          <Button className="w-full justify-start" size="lg">
            Search Reviewer
          </Button>
        </Link>
        <Link href="/tutor">
          <Button variant="outline" className="w-full justify-start" size="lg">
            Ask AI Tutor
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
        <h2 className="text-sm font-medium text-neutral-500">Recommended for You</h2>
        <div className="flex flex-wrap gap-2">
          {RECOMMENDED_TOPIC_NAMES.map((name) => (
            <span key={name} className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm">
              {name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
