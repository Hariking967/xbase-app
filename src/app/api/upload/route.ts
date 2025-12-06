import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // force server runtime

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY! // NEVER expose to frontend
);

const BUCKET = "XBase_bucket1";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file: File | null = formData.get("file") as unknown as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert File → ArrayBuffer → Uint8Array
    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);

    const filePath = `uploads/${Date.now()}_${file.name}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    return NextResponse.json({
      path: filePath,
      url: publicUrlData.publicUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Upload failed", details: err },
      { status: 500 }
    );
  }
}
