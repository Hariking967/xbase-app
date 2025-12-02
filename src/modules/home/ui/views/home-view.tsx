"use client";

import React, { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function HomeView() {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  const [current_folder_id, setCurrentFolderId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<string>("My Database");

  useEffect(() => {
    const fetchRoot = async () => {
      try {
        const userId = data?.user?.id;
        if (!userId) return;
        const res = await fetch(`${process.env.BACKEND_URL}/root/${userId}`);
        if (!res.ok) return;
        const id = await res.json();
        setCurrentFolderId(id);
      } catch {
        // silently ignore for now
      }
    };
    fetchRoot();
  }, [data?.user?.id]);

  const toSlug = (label: string) =>
    `/${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
      {!!data?.user && (
        <header className="w-full bg-neutral-900 text-white border-b border-neutral-800">
          <div className="w-full px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/logo-bg.png"
                alt="XBase"
                className="h-8 w-8 rounded-md"
              />
              <span className="font-semibold text-2xl">XBase</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl">{data?.user?.name ?? "User"}</span>
              <Button
                className="h-8 bg-red-600 text-white hover:bg-red-700 border-transparent"
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
      )}

      {/* Sidebar + Content */}
      <div className="flex flex-1">
        <aside className="w-64 border-r border-neutral-800 p-4 h-full overflow-y-auto">
          <nav className="space-y-6">
            {/* Primary */}
            <div>
              <div className="px-3 mb-2 text-xs uppercase tracking-wider text-neutral-400">
                Primary
              </div>
              <div className="space-y-1">
                <button
                  className={`w-full text-left px-3 py-2 rounded-md hover:bg-neutral-800 ${
                    activeItem === "My Database"
                      ? "bg-neutral-800 font-medium"
                      : "text-neutral-300"
                  }`}
                  onClick={() => setActiveItem("My Database")}
                >
                  My Database
                </button>
                <button
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-neutral-800 text-neutral-300"
                  onClick={() => router.push(toSlug("Ask AI"))}
                >
                  Ask AI
                </button>
              </div>
            </div>

            {/* Data Processing */}
            <div>
              <div className="px-3 mb-2 text-xs uppercase tracking-wider text-neutral-400">
                Data Processing
              </div>
              <div className="space-y-1">
                <button
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-neutral-800 text-neutral-300"
                  onClick={() => router.push(toSlug("Data Cleaning"))}
                >
                  Data Cleaning
                </button>
                <button
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-neutral-800 text-neutral-300"
                  onClick={() => router.push(toSlug("Impute Data"))}
                >
                  Impute Data
                </button>
              </div>
            </div>

            {/* Analytics */}
            <div>
              <div className="px-3 mb-2 text-xs uppercase tracking-wider text-neutral-400">
                Analytics
              </div>
              <div className="space-y-1">
                <button
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-neutral-800 text-neutral-300"
                  onClick={() => router.push(toSlug("Visualisation"))}
                >
                  Visualisation
                </button>
                <button
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-neutral-800 text-neutral-300"
                  onClick={() => router.push(toSlug("Classification"))}
                >
                  Classification
                </button>
                <button
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-neutral-800 text-neutral-300"
                  onClick={() => router.push(toSlug("Association Rules"))}
                >
                  Association Rules
                </button>
              </div>
            </div>

            {/* History */}
            <div>
              <div className="px-3 mb-2 text-xs uppercase tracking-wider text-neutral-400">
                History
              </div>
              <div className="space-y-1">
                <button
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-neutral-800 text-neutral-300"
                  onClick={() => router.push(toSlug("Snapshot History"))}
                >
                  Snapshot History
                </button>
              </div>
            </div>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          {activeItem === "My Database" && (
            <div className="mb-4 flex items-center gap-3">
              <Button
                type="button"
                className="bg-neutral-800 hover:bg-neutral-700 text-white"
              >
                Create Folder
              </Button>
              <Button
                type="button"
                className="bg-neutral-800 hover:bg-neutral-700 text-white"
              >
                Create File
              </Button>
              <Button
                type="button"
                className="bg-neutral-800 hover:bg-neutral-700 text-white"
              >
                Upload File
              </Button>
            </div>
          )}
          {/* ...existing or future content... */}
        </main>
      </div>
    </div>
  );
}
