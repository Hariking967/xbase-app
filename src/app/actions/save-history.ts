"use server";

import { cookies } from "next/headers";

export async function saveHistory(history: unknown) {
  const jar = await cookies();
  jar.set("chat_history", JSON.stringify(history), {
    httpOnly: true,
    sameSite: "strict",
  });
}
