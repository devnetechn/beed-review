import { createServiceClient } from "@/lib/supabase/service";
import { UPLOADS_BUCKET } from "@/lib/library/constants";

// Matches lib/ai/fetchContent.ts's MAX_CHARS — the AI pipeline only ever
// reads this many characters of a resource's content regardless of source,
// so an uploaded file is capped the same way a scraped web page already is.
const MAX_CHARS = 12_000;

const OFFICE_PARSER_TYPES = new Set(["pdf", "docx", "pptx"]);

type UploadedResource = {
  resource_type: string;
  storage_path: string;
};

async function extractText(buffer: Buffer, resourceType: string): Promise<string | null> {
  if (resourceType === "txt") {
    const text = buffer.toString("utf-8").trim();
    return text || null;
  }

  if (!OFFICE_PARSER_TYPES.has(resourceType)) return null;

  // Dynamic import, with a fallback to the default export: under Next.js's
  // bundled runtime (both webpack and Turbopack), officeparser's named
  // `OfficeParser` export resolves to `undefined` even though it's an
  // enumerable key on the module namespace object — a bundler CJS-interop
  // quirk with this package's export shape. `mod.default` is the same
  // `OfficeParser` class and resolves correctly, so it's used as the
  // fallback rather than the primary path, in case a future version fixes
  // the named export and this can be simplified back to `mod.OfficeParser`.
  const mod = await import("officeparser");
  const OfficeParser = mod.OfficeParser ?? (mod as unknown as { default: typeof mod.OfficeParser }).default;
  const ast = await OfficeParser.parseOffice(buffer, {
    fileType: resourceType as "pdf" | "docx" | "pptx",
  });
  const { value } = await ast.to("text");
  const text = value.trim();
  return text || null;
}

export async function fetchUploadedContent(resource: UploadedResource): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(UPLOADS_BUCKET)
      .download(resource.storage_path);

    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());
    const text = await extractText(buffer, resource.resource_type);
    return text ? text.slice(0, MAX_CHARS) : null;
  } catch {
    return null;
  }
}
