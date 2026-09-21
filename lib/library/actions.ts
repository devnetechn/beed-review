"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordActivity } from "@/lib/gamification/activity";
import { UPLOADS_BUCKET } from "@/lib/library/constants";

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
  await recordActivity(user.id, "resource_saved");
  revalidatePath("/library");
  revalidatePath("/");
  return { saved: true };
}

export async function deleteUploadedResource(
  resourceId: string
): Promise<{ deleted: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const service = createServiceClient();
  const { data: resource } = await service
    .from("resources")
    .select("created_by, storage_path")
    .eq("id", resourceId)
    .maybeSingle();

  if (!resource || resource.created_by !== user.id || !resource.storage_path) {
    return { error: "Upload not found" };
  }

  await service.storage.from(UPLOADS_BUCKET).remove([resource.storage_path]);

  // quiz_attempts, ai_conversations, and study_notes all reference
  // resources.id without ON DELETE CASCADE, so a resource with any study
  // history against it (Summarize/Generate Quiz/Ask AI — all of which this
  // upload's owner is the only person who could have triggered, since the
  // upload is private) must have those rows cleared first or the delete
  // below fails its foreign-key constraint.
  await service.from("quiz_attempts").delete().eq("resource_id", resourceId);
  await service.from("ai_conversations").delete().eq("resource_id", resourceId);
  await service.from("study_notes").delete().eq("resource_id", resourceId);

  const { error: deleteError } = await service.from("resources").delete().eq("id", resourceId);
  if (deleteError) {
    return { error: "Couldn't delete the upload. Please try again." };
  }

  revalidatePath("/library");
  return { deleted: true };
}
