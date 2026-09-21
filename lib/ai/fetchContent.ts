import * as cheerio from "cheerio";
import { fetchUploadedContent } from "./extractFile";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_CHARS = 12_000;

export type ResourceForFetch = {
  resource_type: string;
  license_status: string;
  original_url: string | null;
  storage_path: string | null;
};

export async function fetchContent(resource: ResourceForFetch): Promise<string | null> {
  if (resource.storage_path) {
    return fetchUploadedContent({
      resource_type: resource.resource_type,
      storage_path: resource.storage_path,
    });
  }
  if (resource.resource_type === "pdf") return null;
  if (resource.license_status === "LICENSE_UNCLEAR") return null;
  if (!resource.original_url) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(resource.original_url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      chunks.push(value);
      if (bytes > MAX_BYTES) break;
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");

    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    return text.slice(0, MAX_CHARS) || null;
  } catch {
    return null;
  }
}
