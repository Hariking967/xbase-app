"use client";

import React, { useEffect, useState, useCallback } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Types for API responses
interface Folder {
  id: string;
  name: string;
  created_at: string; // ISO datetime
  parent_id: string;
}
interface DbFile {
  id: string;
  name: string;
  created_at: string; // ISO datetime
  parent_id: string;
  bucket_url: string;
}
interface RootResponse {
  user_id: string;
  root_id: string;
}
// Added response wrappers per API docs
interface FoldersResponse {
  folders: Folder[];
}
interface FilesResponse {
  files: DbFile[];
}

export default function HomeView() {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  const [current_folder_id, setCurrentFolderId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<string>("My Database");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<DbFile[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  // Create Folder dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // trigger list reloads after mutations
  const [reloadTick, setReloadTick] = useState(0);

  // NEW: unified backend base URL (database url as requested)
  const NEXT_PUBLIC_DATABASE_URL = (() => {
    let u =
      process.env.NEXT_PUBLIC_DATABASE_URL ||
      "https://pythonbackend-xbase.onrender.com";
    u = u.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u.replace(/\/+$/, "");
  })();

  const safeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
    retries = 2,
    delayMs = 1500
  ): Promise<Response | null> => {
    try {
      return await fetch(input, {
        // mode & credentials left default; CORS negotiated automatically
        ...init,
        headers: {
          // keep only needed header to reduce preflight complexity
          "Content-Type":
            (init?.headers as any)?.["Content-Type"] || "application/json",
        },
      });
    } catch (e) {
      console.error("Network error raw:", e);
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
        return safeFetch(input, init, retries - 1, delayMs * 2);
      }
      setApiError(
        `Network error contacting backend: ${NEXT_PUBLIC_DATABASE_URL}`
      );
      return null;
    }
  };

  // Always ensure we have a root_id for this user
  const ensureRoot = useCallback(async () => {
    setApiError(null);
    const userId = data?.user?.id;
    if (!userId) return;
    if (!NEXT_PUBLIC_DATABASE_URL) {
      setApiError("Backend URL not configured.");
      return;
    }
    const res = await safeFetch(`${NEXT_PUBLIC_DATABASE_URL}/root`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res) return;
    if (!res.ok) {
      setApiError(`Root fetch failed (${res.status})`);
      return;
    }
    let payload: RootResponse | any;
    try {
      payload = await res.json();
    } catch {
      setApiError("Failed to parse root response JSON.");
      return;
    }
    console.log("Root response payload:", payload);
    if (payload?.root_id) setCurrentFolderId(payload.root_id);
    else setApiError("root_id missing in response.");
  }, [data?.user?.id, NEXT_PUBLIC_DATABASE_URL]);

  // When user id becomes available, ensure we have a root
  useEffect(() => {
    if (data?.user?.id) {
      ensureRoot();
    }
  }, [data?.user?.id, ensureRoot]);

  // If current_folder_id is ever null (e.g., first load), try again
  useEffect(() => {
    if (!current_folder_id && data?.user?.id) {
      ensureRoot();
    }
  }, [current_folder_id, data?.user?.id, ensureRoot]);

  // Fetch folders/files for the current folder (ensure root first if missing)
  useEffect(() => {
    const fetchLists = async () => {
      if (!data?.user?.id) return;
      if (!current_folder_id) {
        await ensureRoot();
        return;
      }
      if (!NEXT_PUBLIC_DATABASE_URL) return;

      setApiError(null);
      const [foldersRes, filesRes] = await Promise.all([
        safeFetch(`${NEXT_PUBLIC_DATABASE_URL}/folders`, {
          method: "POST",
          body: JSON.stringify({ current_folder_id }),
        }),
        safeFetch(`${NEXT_PUBLIC_DATABASE_URL}/files`, {
          method: "POST",
          body: JSON.stringify({ current_folder_id }),
        }),
      ]);
      if (!foldersRes || !filesRes) return;
      if (!foldersRes.ok)
        setApiError(`Folders fetch failed (${foldersRes.status})`);
      if (!filesRes.ok)
        setApiError(
          (prev) => prev || `Files fetch failed (${filesRes.status})`
        );

      // Parse according to documented shapes, with fallback to raw arrays
      const foldersJson = foldersRes.ok ? await foldersRes.json() : null;
      const filesJson = filesRes.ok ? await filesRes.json() : null;

      const foldersData: Folder[] = foldersJson
        ? "folders" in (foldersJson as any)
          ? (foldersJson as FoldersResponse).folders
          : Array.isArray(foldersJson)
          ? (foldersJson as Folder[])
          : []
        : [];

      const filesData: DbFile[] = filesJson
        ? "files" in (filesJson as any)
          ? (filesJson as FilesResponse).files
          : Array.isArray(filesJson)
          ? (filesJson as DbFile[])
          : []
        : [];

      console.log("Fetched current_folder_id:", current_folder_id);
      console.log("Fetched folders:", foldersData);
      console.log("Fetched files:", filesData);

      setFolders(foldersData);
      setFiles(filesData);
    };
    fetchLists();
  }, [
    current_folder_id,
    data?.user?.id,
    NEXT_PUBLIC_DATABASE_URL,
    ensureRoot,
    reloadTick,
  ]);

  // Log whenever these change (extra visibility)
  useEffect(() => {
    console.log("State change -> current_folder_id:", current_folder_id);
    console.log("State change -> folders:", folders);
    console.log("State change -> files:", files);
  }, [current_folder_id, folders, files]);

  const toSlug = (label: string) =>
    `/${label.toLowerCase().replace(/\s+/g, "-")}`;

  // Create Folder handler
  const handleCreateFolder = async () => {
    setCreateError(null);
    if (!folderName.trim()) {
      setCreateError("Folder name is required.");
      return;
    }
    if (!current_folder_id) {
      setCreateError("Invalid parent folder.");
      return;
    }
    setCreating(true);
    const res = await safeFetch(`${NEXT_PUBLIC_DATABASE_URL}/folder/create`, {
      method: "POST",
      body: JSON.stringify({
        folder_name: folderName.trim(),
        parent_id: current_folder_id,
      }),
    });
    setCreating(false);
    if (!res) {
      setCreateError("Network error. Please try again.");
      return;
    }
    if (!res.ok) {
      setCreateError(`Create folder failed (${res.status})`);
      return;
    }
    // Success: close dialog, clear, and refresh lists
    setIsCreateOpen(false);
    setFolderName("");
    setReloadTick((t) => t + 1);
  };

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
          <nav className="h-full flex flex-col">
            {/* Top: Primary */}
            <div className="mb-6">
              <div className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                Primary
              </div>
              <div className="space-y-1">
                <button
                  className={`w-full text-left px-4 py-3 text-lg rounded-md hover:bg-neutral-800 ${
                    activeItem === "My Database"
                      ? "bg-neutral-800 font-semibold"
                      : "text-neutral-300"
                  }`}
                  onClick={() => setActiveItem("My Database")}
                >
                  My Database
                </button>
                <button
                  className="w-full text-left px-4 py-3 text-lg rounded-md hover:bg-neutral-800 text-neutral-300"
                  onClick={() => router.push(toSlug("Ask AI"))}
                >
                  Ask AI
                </button>
              </div>
            </div>

            {/* Middle: centered (Data Processing + Analytics) */}
            <div className="flex-1 flex flex-col justify-center gap-8">
              <div>
                <div className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                  Data Processing
                </div>
                <div className="space-y-1">
                  <button
                    className="w-full text-left px-4 py-3 text-lg rounded-md hover:bg-neutral-800 text-neutral-300"
                    onClick={() => router.push(toSlug("Data Cleaning"))}
                  >
                    Data Cleaning
                  </button>
                  <button
                    className="w-full text-left px-4 py-3 text-lg rounded-md hover:bg-neutral-800 text-neutral-300"
                    onClick={() => router.push(toSlug("Impute Data"))}
                  >
                    Impute Data
                  </button>
                </div>
              </div>

              <div>
                <div className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                  Analytics
                </div>
                <div className="space-y-1">
                  <button
                    className="w-full text-left px-4 py-3 text-lg rounded-md hover:bg-neutral-800 text-neutral-300"
                    onClick={() => router.push(toSlug("Visualisation"))}
                  >
                    Visualisation
                  </button>
                  <button
                    className="w-full text-left px-4 py-3 text-lg rounded-md hover:bg-neutral-800 text-neutral-300"
                    onClick={() => router.push(toSlug("Classification"))}
                  >
                    Classification
                  </button>
                  <button
                    className="w-full text-left px-4 py-3 text-lg rounded-md hover:bg-neutral-800 text-neutral-300"
                    onClick={() => router.push(toSlug("Association Rules"))}
                  >
                    Association Rules
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom: History */}
            <div className="mt-6">
              <div className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                History
              </div>
              <div className="space-y-1">
                <button
                  className="w-full text-left px-4 py-3 text-lg rounded-md hover:bg-neutral-800 text-neutral-300"
                  onClick={() => router.push(toSlug("Snapshot History"))}
                >
                  Snapshot History
                </button>
              </div>
            </div>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          {apiError && (
            <div className="mb-4 rounded-md border border-red-700 bg-red-900/40 px-4 py-2 text-sm text-red-300">
              {apiError}
            </div>
          )}
          {activeItem === "My Database" && (
            <>
              <div className="mb-4 flex items-center gap-3">
                <Button
                  type="button"
                  className="bg-neutral-800 hover:bg-neutral-700 text-white"
                  onClick={() => {
                    setCreateError(null);
                    setIsCreateOpen(true);
                  }}
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

              {/* Create Folder Dialog */}
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="bg-neutral-900 text-white border border-neutral-800">
                  <DialogHeader>
                    <DialogTitle>Create new folder</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Input
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      placeholder="Enter folder name"
                      className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-400"
                      disabled={creating}
                    />
                    {createError && (
                      <p className="text-sm text-red-400">{createError}</p>
                    )}
                  </div>
                  <DialogFooter className="gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-neutral-700 text-black"
                      onClick={() => setIsCreateOpen(false)}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="bg-[#39FF14] text-black hover:bg-[#2fd310]"
                      onClick={handleCreateFolder}
                      disabled={creating}
                    >
                      {creating ? "Creating..." : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Folders */}
              {folders.length > 0 && (
                <section className="mb-8">
                  {/* <h2 className="mb-3 text-sm uppercase tracking-wide text-neutral-400">
                    Folders
                  </h2> */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setCurrentFolderId(f.id)}
                        className="flex flex-col items-center gap-2 p-3 rounded-md hover:bg-neutral-800/60 transition-colors"
                        title={f.name}
                      >
                        <img
                          src="/folder-icon.png"
                          alt="Folder"
                          className="h-16 w-16 object-contain"
                        />
                        <span className="text-sm text-neutral-200 truncate w-full text-center">
                          {f.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Files */}
              {files.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm uppercase tracking-wide text-neutral-400">
                    Files
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex flex-col items-center gap-2 p-3 rounded-md hover:bg-neutral-800/40 transition-colors"
                        title={file.name}
                      >
                        <img
                          src="/file-icon.png"
                          alt="File"
                          className="h-16 w-16 object-contain"
                        />
                        <span className="text-sm text-neutral-200 truncate w-full text-center">
                          {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {/* ...existing or future content... */}
        </main>
      </div>
    </div>
  );
}
