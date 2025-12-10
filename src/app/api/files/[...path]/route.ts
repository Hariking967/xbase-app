import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = process.env.SUPABASE_BUCKET || "XBase_bucket1";

export async function GET(req: Request, context: any) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    );

    const urlParam = new URL(req.url).searchParams.get("url");
    let filePath = "";

    if (urlParam) {
      try {
        const u = new URL(urlParam);
        const parts = u.pathname.split("/");
        const publicIdx = parts.findIndex((p) => p === "public");
        const bucketName = parts[publicIdx + 1];
        const rel = parts.slice(publicIdx + 2).join("/");
        if (!bucketName || !rel) {
          console.error("API/files: Invalid public URL structure", {
            urlParam,
            pathname: u.pathname,
          });
          return new Response("Invalid public URL structure", { status: 400 });
        }
        if (bucketName !== BUCKET) {
          console.warn("API/files: Bucket mismatch", {
            expected: BUCKET,
            got: bucketName,
          });
        }
        filePath = rel;
      } catch (err) {
        console.error("API/files: Invalid URL parameter", { urlParam, err });
        return new Response("Invalid URL parameter", { status: 400 });
      }
    } else {
      const params = (context && context.params) || {};
      const segments: string[] = Array.isArray(params.path) ? params.path : [];
      filePath = segments.join("/");
    }

    if (!filePath) {
      console.error("API/files: Missing file path", {
        params: context?.params,
      });
      return new Response("Missing file path", { status: 400 });
    }

    console.debug("API/files: Downloading from Supabase", {
      bucket: BUCKET,
      filePath,
    });

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(filePath);
    if (error || !data) {
      const msg = error?.message || "Download failed";
      console.error("API/files: Supabase download failed", {
        bucket: BUCKET,
        filePath,
        errorMessage: msg,
      });
      return new Response(msg, { status: 500 });
    }

    const text = await data.text();
    const isCsv = filePath.toLowerCase().endsWith(".csv");
    return new Response(text, {
      headers: { "Content-Type": isCsv ? "text/csv" : "text/plain" },
    });
  } catch (e: any) {
    console.error("API/files: Unhandled server error", {
      message: e?.message,
      stack: e?.stack,
    });
    return new Response(e?.message || "Server error", { status: 500 });
  }
}
