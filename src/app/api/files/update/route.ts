import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    const bucket = process.env.SUPABASE_BUCKET || "XBase_bucket1";

    if (!url || !serviceKey) {
      return NextResponse.json(
        {
          error:
            "Supabase env missing: ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(url, serviceKey);

    // Basic ECMAScript runtime checks
    if (!supabase || typeof (supabase as any).storage?.from !== "function") {
      return NextResponse.json(
        { error: "Supabase storage client not initialized properly" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const userRootId = (form.get("user_root_id") as string) || "";
    const fileName = (form.get("file_name") as string) || "";

    if (!file || !userRootId || !fileName) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const filePath = `${userRootId}/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Try update first (overwrite). If it fails, fallback to upload (create/overwrite).
    let resp = await supabase.storage
      .from(bucket)
      .update(filePath, buffer, { contentType: "text/csv" });

    if (resp.error) {
      // Fallback: create or overwrite the file with upsert: true
      resp = await supabase.storage
        .from(bucket)
        .upload(filePath, buffer, { contentType: "text/csv", upsert: true });
    }

    if (resp.error) {
      return NextResponse.json({ error: resp.error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "CSV file updated successfully",
      path: filePath,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
