"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleSaveResource(resourceId: string): Promise<{ saved: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("saved_resources")
    .select("id")
    .eq("user_id", user.id)
    .eq("resource_id", resourceId)
    .maybeSingle();

  if (existing) {
    await supabase.from("saved_resources").delete().eq("id", existing.id);
    revalidatePath("/library");
    revalidatePath("/");
    return { saved: false };
  }

  await supabase.from("saved_resources").insert({ user_id: user.id, resource_id: resourceId });
  revalidatePath("/library");
  revalidatePath("/");
  return { saved: true };
}
