"use client";

import React from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function HomeView() {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  return (
    <div className="min-h-screen bg-neutral-900">
      {/* Header */}
      <header className="w-full bg-neutral-900 text-white border-b border-neutral-800">
        <div className="w-full px-4 py-3 flex items-center justify-between">
          {/* Left: Logo + Brand */}
          <div className="flex items-center gap-3">
            <img
              src="/logo-bg.png"
              alt="XBase"
              className="h-8 w-8 rounded-md"
            />
            <span className="font-semibold text-2xl">XBase</span>
          </div>
          {/* Right: Username + Logout */}
          <div className="flex items-center gap-4">
            <span className="text-xl">{data?.user?.name ?? "User"}</span>
            <Button
              variant="outline"
              className="h-8"
              onClick={() => {
                authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => router.push("/auth/sign-in"),
                  },
                });
              }}
            >
              Logout
            </Button>
          </div>
        </div>
      </header>
    </div>
  );
}
