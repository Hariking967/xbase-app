import { NextRequest, NextResponse } from "next/server";
import { saveHistory } from "@/app/actions/save-history";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const history = body?.history ?? [];
    await saveHistory(history);
    return NextResponse.json({ status: "ok" });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to save history" },
      { status: 500 }
    );
  }
}
