import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordActivity } from "@/lib/gamification/activity";
import { UPLOADS_BUCKET, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXTENSIONS } from "@/lib/library/constants";

function extensionOf(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const extension = extensionOf(file.name);
  if (!extension || !(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
    return NextResponse.json(
      { error: "Only PDF, DOCX, PPTX, and TXT files are supported" },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is larger than 25 MB" }, { status: 400 });
  }

  const service = createServiceClient();
  const title = file.name.replace(/\.[^.]+$/, "") || file.name;

  const { data: resource, error: insertError } = await service
    .from("resources")
    .insert({
      title,
      resource_type: extension,
      license_status: "PERSONAL_UPLOAD",
      created_by: user.id,
      original_url: null,
    })
    .select("id")
    .single();

  if (insertError || !resource) {
    return NextResponse.json({ error: "Couldn't save the upload" }, { status: 500 });
  }

  const storagePath = `${user.id}/${resource.id}/${file.name}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await service.storage
    .from(UPLOADS_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    await service.from("resources").delete().eq("id", resource.id);
    return NextResponse.json({ error: "Couldn't upload the file" }, { status: 500 });
  }

  await service.from("resources").update({ storage_path: storagePath }).eq("id", resource.id);
  await recordActivity(user.id, "resource_saved");

  return NextResponse.json({ id: resource.id });
}
